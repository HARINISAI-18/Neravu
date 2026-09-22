import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_KEY = '@pmjay/baseUrl';
const TIMEOUT_KEY = '@pmjay/timeoutMs';

// Web browser → localhost works (CORS is open on the backend).
// Android emulator → 10.0.2.2 is the host machine.
export const DEFAULT_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';

export const TIMEOUT_OPTIONS = [
  { label: '2 min', ms: 120000 },
  { label: '5 min', ms: 300000 },
  { label: '10 min', ms: 600000 },
  { label: '15 min', ms: 900000 },
];

let _baseUrl = DEFAULT_BASE_URL;
let _timeoutMs = 600000;

export const getBaseUrl = () => _baseUrl;
export const getTimeoutMs = () => _timeoutMs;

export async function loadConfig() {
  try {
    const [u, t] = await Promise.all([
      AsyncStorage.getItem(BASE_KEY),
      AsyncStorage.getItem(TIMEOUT_KEY),
    ]);
    if (u) _baseUrl = u;
    if (t) _timeoutMs = Number(t) || _timeoutMs;
  } catch { }
}

export async function saveConfig(baseUrl, timeoutMs) {
  _baseUrl = baseUrl.trim().replace(/\/+$/, '');
  _timeoutMs = timeoutMs;
  try {
    await AsyncStorage.setItem(BASE_KEY, _baseUrl);
    await AsyncStorage.setItem(TIMEOUT_KEY, String(timeoutMs));
  } catch { }
}

async function parse(res) {
  let data = null;
  try { data = await res.json(); } catch { }
  if (!res.ok) {
    const err = new Error(data?.detail || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Health answers instantly even while models load — short timeout.
export async function fetchHealth() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    return await parse(await fetch(`${_baseUrl}/api/health`, { signal: ctrl.signal }));
  } finally {
    clearTimeout(t);
  }
}

export async function fetchSuggestions() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    return await parse(await fetch(`${_baseUrl}/api/suggestions`, { signal: ctrl.signal }));
  } finally {
    clearTimeout(t);
  }
}

// NEW: intake questionnaire (22 questions, 6 steps — served by backend)
export async function getIntakeQuestions() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    return await parse(await fetch(`${_baseUrl}/api/intake/questions`, { signal: ctrl.signal }));
  } finally {
    clearTimeout(t);
  }
}

// NEW: submit intake answers → rule-based scheme matching (no LLM, fast)
export async function matchIntake(answers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${_baseUrl}/api/intake/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
      signal: ctrl.signal,
    });
    return await parse(res); // { answer, schemes, profile }
  } finally {
    clearTimeout(t);
  }
}

export async function resetConversation() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${_baseUrl}/api/reset`, { method: 'POST', signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false; // older backend without /api/reset — chat still clears locally
  }
}

/** POST /api/ask (now carries the patient profile from intake) → { promise, cancel } */
export function ask(question, profile = '') {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), _timeoutMs);

  const promise = (async () => {
    try {
      const res = await fetch(`${_baseUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, final_k: 5, profile }),
        signal: ctrl.signal,
      });
      return await parse(res); // { question, answer, intents, sources }
    } catch (e) {
      if (e?.name === 'AbortError' || /abort/i.test(String(e?.message))) {
        const err = new Error('Request timed out or was cancelled');
        err.timeout = true;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  })();

  return { promise, cancel: () => ctrl.abort() };
}