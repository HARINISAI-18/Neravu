# Neravu

Neravu is an optimized retrieval-augmented chatbot for answering questions from
PM-JAY documents. It has:

- A **FastAPI backend** that extracts PDF content, builds BM25/FAISS indexes,
  matches intake answers to schemes, and generates grounded answers.
- An **Expo/React Native frontend** that runs on Android, iOS, the web, and
  physical devices.

## Requirements

Install the following before starting:

- Python 3.10 or newer
- Node.js 18 or newer and npm
- Git (optional, for cloning the repository)
- At least 8 GB of RAM for a CPU-only setup; more may be needed while the
  language model is loading

The backend can use a CUDA-capable NVIDIA GPU, but a GPU is not required.

## Project layout

```text
PMJAY-RAG/
|-- backend/
|   |-- app.py
|   |-- schemes.py
|   |-- schemes.xlsx  
|   |-- requirements.txt
|   `-- data/pmjay/       # Put source PDFs here
`-- frontend/
    |-- App.js
    `-- package.json
```

## 1. Add the source documents

Place the PM-JAY PDF documents in:

```text
backend/data/pmjay/
```

The backend reads only `.pdf` files from this directory. The included
`backend/schemes.xlsx` file is used for scheme matching. If no Excel file is
available, the backend uses its built-in fallback scheme data.

To use a different PDF directory, set `PMJAY_DATA_DIR` before starting the
backend. The path is resolved from the backend process's working directory.

## 2. Set up and run the backend

Open a terminal in the repository root and create a virtual environment:

### Windows PowerShell

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### macOS/Linux

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

Install PyTorch first. Choose one option:

```bash
# CPU-only
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu

# NVIDIA GPU with CUDA 12.1
python -m pip install torch --index-url https://download.pytorch.org/whl/cu121
```

Then install the remaining backend dependencies:

```bash
python -m pip install -r requirements.txt
```

Start the API:

```bash
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

The first startup downloads the embedding, reranker, and generation models
from Hugging Face and builds the PDF index. This can take several minutes,
especially on CPU. The API starts responding immediately, but the frontend
must wait until the health endpoint reports `"ready": true`.

Verify the backend in another terminal:

```bash
curl http://localhost:8000/api/health
```

On Windows PowerShell, the equivalent command is:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
```

Useful backend endpoints include:

- `GET /api/health` - loading status and index statistics
- `GET /api/documents` - PDF extraction audit
- `GET /api/suggestions` - example questions
- `GET /api/intake/questions` - intake questionnaire
- `POST /api/ask` - ask a question
- `POST /api/reindex` - rebuild the index after changing PDFs
- `POST /api/reset` - clear conversation memory and the answer cache

## 3. Set up and run the frontend

Keep the backend terminal running. Open a second terminal at the repository
root:

```bash
cd frontend
npm install
npm start
```

Expo will display a QR code and interactive commands. You can also start a
specific target:

```bash
npm run web       # Web browser
npm run android   # Android emulator/device
npm run ios       # iOS simulator/device (macOS required)
```

The frontend defaults to these backend URLs:

| Target | Default URL |
| --- | --- |
| Web browser | `http://localhost:8000` |
| iOS simulator | `http://localhost:8000` |
| Android emulator | `http://10.0.2.2:8000` |
| Physical phone | Your computer's LAN IP, for example `http://192.168.1.20:8000` |

For a physical phone:

1. Start the backend with `--host 0.0.0.0`.
2. Connect the phone and computer to the same Wi-Fi network.
3. Open the settings icon in the app.
4. Set **Server URL** to the computer's LAN IP and port, such as
   `http://192.168.1.20:8000`.
5. Allow Python through the operating system firewall if the phone cannot
   connect.

The answer timeout can also be changed in the frontend settings. CPU
generation may take one to four minutes, so the default ten-minute timeout is
intentional.

## Configuration

The backend supports these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PMJAY_DATA_DIR` | `./data/pmjay` | Directory containing source PDFs |
| `EMBED_MODEL` | `intfloat/multilingual-e5-small` | Sentence embedding model |
| `RERANK_MODEL` | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Reranking model |
| `GEN_MODEL` | `Qwen/Qwen2.5-1.5B-Instruct` | Answer generation model |
| `MAX_NEW_TOKENS` | `250` | Maximum generated answer length |
| `GEN_BACKEND` | `local` | Set to `gemini` to use Google Gemini (much faster CPU response times) |
| `GOOGLE_API_KEY` | | Set this if `GEN_BACKEND` is `gemini` |
| `RETRIEVAL_ONLY` | `0` | Set to `1` to skip LLM generation |
| `TORCH_THREADS` | CPU count | CPU thread count when CUDA is unavailable |
| `PORT` | `8000` | Backend listening port when running `app.py` |

For example, from `backend`:

```bash
# Use a custom PDF folder and a different port
PMJAY_DATA_DIR=/path/to/pdfs PORT=8001 python -m uvicorn app:app --host 0.0.0.0 --port 8001
```

On Windows PowerShell:

```powershell
$env:PMJAY_DATA_DIR = "C:\path\to\pdfs"
$env:PORT = "8001"
python -m uvicorn app:app --host 0.0.0.0 --port 8001
```

If the backend port changes, update the frontend Server URL accordingly.

## Updating documents

Copy or replace PDFs in `backend/data/pmjay`, then rebuild the index without
restarting the process:

```bash
curl -X POST http://localhost:8000/api/reindex
```

The frontend will show the backend's loading state while the index is rebuilt.

## Troubleshooting

### Backend reports that it cannot find documents

Check that the files are directly inside `backend/data/pmjay` and have a
`.pdf` extension. If using a custom directory, check `PMJAY_DATA_DIR` and
start the backend from `backend`.

### Frontend says it cannot reach the backend

Check that:

- The backend is still running and `GET /api/health` works.
- The frontend Server URL uses the correct host and port.
- A physical phone and the computer are on the same Wi-Fi network.
- The backend was started with `--host 0.0.0.0`.
- The firewall allows incoming connections to the backend port.

### Backend takes a long time to become ready

Model downloads and index creation happen during startup. Wait for
`"ready": true` from `/api/health`. CPU-only systems will take longer than
CUDA-enabled systems.

### PowerShell does not allow virtual-environment activation

Run PowerShell as the current user and enable local scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Then activate the environment again:

```powershell
.\.venv\Scripts\Activate.ps1
```

## Development checks

From `frontend`, run the Expo diagnostics:

```bash
npx expo-doctor
npx expo lint
```

The backend does not currently define a test command. Its health endpoint is
the quickest smoke test after startup.

## Future Improvements

The Neravu project is designed to evolve into a comprehensive operations suite. Planned milestones include:

- **Fully Vectorized Data Hub:** Migrating to a massive-scale unified vector database where all dynamic PM-JAY and healthcare schema data is persistently stored and served from central RAG storage.
- **Live Transcription & Translation:** Building real-time dynamic transcription and multi-lingual translation for speech-to-speech cross-language interactions.
- **Insurance Flow Management:** A fully integrated end-to-end operational pipeline to track real-time authorization requests and claim settlements automatically.
- **Streamlined Insurance Drafting:** AI-powered assistance for quickly auto-drafting necessary pre-authorization request forms and procedural justifications.
- **Insurance Summaries:** Generating automatic, easy-to-understand AI breakdowns of complex case files and coverage documents for rapid intake.
- **Docket Creation:** Programmatic generation of ready-to-file legal or administrative case dockets, drastically cutting down manual documentation workload.
- **Citizen Feedback & Policy-Making:** An analytics dashboard that aggregates user interactions, concerns, and denials to actively inform government policy adjustments and localized administrative decisions.
