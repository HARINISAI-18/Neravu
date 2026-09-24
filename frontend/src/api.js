import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_KEY = "@pmjay/baseUrl";
const TIMEOUT_KEY = "@pmjay/timeoutMs";
const LANG_KEY = "@pmjay/lang";

// ============================================================
// BASE URL
// ============================================================

// Web browser → localhost
// Android emulator → host machine
export const DEFAULT_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android"
    ? "http://10.0.2.2:8000"
    : "http://localhost:8000");

export const TIMEOUT_OPTIONS = [
  { label: "2 min", ms: 120000 },
  { label: "5 min", ms: 300000 },
  { label: "10 min", ms: 600000 },
  { label: "15 min", ms: 900000 },
];

let _baseUrl = DEFAULT_BASE_URL;
let _timeoutMs = 600000;
let _lang = "en";

// NOTE:
// API is a snapshot for legacy imports.
// Prefer getBaseUrl() for live calls.
export const getBaseUrl = () => _baseUrl;
export const getTimeoutMs = () => _timeoutMs;
export const getLang = () => _lang;

// ============================================================
// CONFIG
// ============================================================

export async function loadConfig() {
  try {
    const [u, t, l] = await Promise.all([
      AsyncStorage.getItem(BASE_KEY),
      AsyncStorage.getItem(TIMEOUT_KEY),
      AsyncStorage.getItem(LANG_KEY),
    ]);

    if (u) {
      _baseUrl = u;
    }

    if (t) {
      _timeoutMs = Number(t) || _timeoutMs;
    }

    if (l) {
      _lang = l;
    }
  } catch (error) {
    console.warn("Could not load config:", error);
  }
}

export async function saveConfig(baseUrl, timeoutMs) {
  _baseUrl = baseUrl.trim().replace(/\/+$/, "");
  _timeoutMs = timeoutMs;

  try {
    await AsyncStorage.setItem(BASE_KEY, _baseUrl);
    await AsyncStorage.setItem(
      TIMEOUT_KEY,
      String(timeoutMs)
    );
  } catch (error) {
    console.warn("Could not save config:", error);
  }
}

// ============================================================
// LANGUAGE
// ============================================================

export async function saveLangPref(lang) {
  _lang = lang;

  try {
    await AsyncStorage.setItem(LANG_KEY, lang);
  } catch (error) {
    console.warn("Could not save language:", error);
  }
}

// ============================================================
// RESPONSE PARSER
// ============================================================

async function parse(res) {
  let data = null;

  try {
    data = await res.json();
  } catch {
    // Response may not contain JSON.
  }

  if (!res.ok) {
    const err = new Error(
      data?.detail || `HTTP ${res.status}`
    );

    err.status = res.status;

    throw err;
  }

  return data;
}

// ============================================================
// FETCH WITH TIMEOUT
// ============================================================

function fetchWithTimeout(
  url,
  options = {},
  ms = 10000
) {
  const ctrl = new AbortController();

  const timer = setTimeout(() => {
    ctrl.abort();
  }, ms);

  return fetch(url, {
    ...options,
    signal: ctrl.signal,
  }).finally(() => {
    clearTimeout(timer);
  });
}

// ============================================================
// HEALTH
// ============================================================

export async function fetchHealth() {
  return parse(
    await fetchWithTimeout(
      `${_baseUrl}/api/health`,
      {},
      6000
    )
  );
}

// ============================================================
// LANGUAGES
// ============================================================

export async function fetchLanguages() {
  return parse(
    await fetchWithTimeout(
      `${_baseUrl}/api/languages`
    )
  );
}

// ============================================================
// SUGGESTIONS
// ============================================================

export async function fetchSuggestions(lang) {
  const q = lang
    ? `?lang=${encodeURIComponent(lang)}`
    : "";

  return parse(
    await fetchWithTimeout(
      `${_baseUrl}/api/suggestions${q}`
    )
  );
}

// ============================================================
// INTAKE QUESTIONS
// ============================================================

export async function getIntakeQuestions(lang) {
  const q = lang
    ? `?lang=${encodeURIComponent(lang)}`
    : "";

  return parse(
    await fetchWithTimeout(
      `${_baseUrl}/api/intake/questions${q}`
    )
  );
}

// ============================================================
// INTAKE MATCHING
// ============================================================

export async function matchIntake(
  answers,
  lang
) {
  const res = await fetchWithTimeout(
    `${_baseUrl}/api/intake/match`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        answers,
        lang: lang || "en",
      }),
    },
    30000
  );

  return parse(res);
}

// ============================================================
// RESET CONVERSATION
// ============================================================

export async function resetConversation() {
  try {
    const res = await fetchWithTimeout(
      `${_baseUrl}/api/reset`,
      {
        method: "POST",
      },
      5000
    );

    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================
// ASK
// ============================================================

/**
 * POST /api/ask
 *
 * Returns:
 * {
 *   question,
 *   answer,
 *   speech,
 *   suggestions,
 *   intents,
 *   sources,
 *   lang
 * }
 */
export function ask(
  question,
  lang = "en",
  profile = "",
  final_k = 5
) {
  const ctrl = new AbortController();

  const timer = setTimeout(() => {
    ctrl.abort();
  }, _timeoutMs);

  const promise = (async () => {
    try {
      const res = await fetch(
        `${_baseUrl}/api/ask`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            question,
            lang,
            final_k,
            profile,
          }),

          signal: ctrl.signal,
        }
      );

      return await parse(res);
    } catch (e) {
      if (
        e?.name === "AbortError" ||
        /abort/i.test(String(e?.message))
      ) {
        const err = new Error(
          "Request timed out or was cancelled"
        );

        err.timeout = true;

        throw err;
      }

      throw e;
    } finally {
      clearTimeout(timer);
    }
  })();

  return {
    promise,
    cancel: () => ctrl.abort(),
  };
}

// ============================================================
// VOICE — TEXT TO SPEECH
// ============================================================

/**
 * POST /api/tts
 *
 * Returns a playable absolute URL.
 */
export async function getTtsUrl(
  text,
  lang = "en",
  slow = false
) {
  const res = await fetchWithTimeout(
    `${_baseUrl}/api/tts`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        text,
        lang,
        slow,
      }),
    },
    30000
  );

  const { url } = await parse(res);

  // Backend returns something like:
  // /api/tts/file/xxxxx.mp3

  return `${_baseUrl}${url}`;
}

// ============================================================
// VOICE — SPEECH TO TEXT
// ============================================================

/**
 * POST /api/stt
 *
 * Native:
 *   audioSource = local file URI
 *
 * Web:
 *   audioSource = Blob, File, or blob/http URI
 *
 * Backend response:
 * {
 *   text,
 *   detected_lang
 * }
 */
export async function speechToText(
  audioSource
) {
  const form = new FormData();

  // ==========================================================
  // WEB
  // ==========================================================

  if (Platform.OS === "web") {
    let audioBlob;

    // Case 1:
    // MicButton already gives us a Blob/File.
    if (
      audioSource instanceof Blob
    ) {
      audioBlob = audioSource;
    }

    // Case 2:
    // expo-audio gives us a URI.
    else if (
      typeof audioSource === "string"
    ) {
      console.log(
        "🎧 Fetching recorded web audio:",
        audioSource
      );

      const audioResponse =
        await fetch(audioSource);

      if (!audioResponse.ok) {
        throw new Error(
          "Could not read recorded audio."
        );
      }

      audioBlob =
        await audioResponse.blob();
    }

    // Invalid source
    else {
      throw new Error(
        "Invalid web audio source."
      );
    }

    if (!audioBlob || audioBlob.size === 0) {
      throw new Error(
        "Recorded audio is empty."
      );
    }

    console.log(
      "🎧 Web audio size:",
      audioBlob.size,
      "bytes"
    );

    console.log(
      "🎧 Web audio type:",
      audioBlob.type
    );

    /*
     * expo-audio uses WebM through MediaRecorder
     * on web.
     */
    form.append(
      "audio",
      audioBlob,
      "clip.webm"
    );
  }

  // ==========================================================
  // ANDROID / IOS
  // ==========================================================

  else {
    if (
      typeof audioSource !== "string"
    ) {
      throw new Error(
        "Invalid native audio URI."
      );
    }

    const ext =
      (
        audioSource
          .split(".")
          .pop() || "m4a"
      ).toLowerCase();

    const mime = {
      m4a: "audio/mp4",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      webm: "audio/webm",
      caf: "audio/x-caf",
    }[ext] || "audio/mp4";

    /*
     * IMPORTANT:
     * Keep the extension because the backend
     * uses it to determine the decoder.
     */
    form.append(
      "audio",
      {
        uri: audioSource,
        name: `clip.${ext}`,
        type: mime,
      }
    );
  }

  // ==========================================================
  // SEND TO FASTAPI
  // ==========================================================

  console.log(
    "📤 Sending audio to:",
    `${_baseUrl}/api/stt`
  );

  const res =
    await fetchWithTimeout(
      `${_baseUrl}/api/stt`,
      {
        method: "POST",

        /*
         * DO NOT manually set Content-Type here.
         *
         * Browser automatically adds:
         * multipart/form-data;
         * boundary=...
         */
        body: form,
      },

      // Whisper can take time on CPU.
      120000
    );

  const result = await parse(res);

  console.log(
    "📝 STT response:",
    result
  );

  return result;
}

// ============================================================
// OPTIONAL: CURRENT CONFIG SNAPSHOT
// ============================================================

export const API = {
  getBaseUrl,
  getTimeoutMs,
  getLang,
};