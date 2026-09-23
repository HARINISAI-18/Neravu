import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  SafeAreaView, KeyboardAvoidingView, FlatList, View, Text, TextInput,
  Pressable, ScrollView, StyleSheet, Platform, AppState, Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { C, S } from './src/theme';
import {
  loadConfig, fetchHealth, fetchSuggestions, ask, resetConversation,
  getIntakeQuestions, matchIntake, saveLangPref,
} from './src/api';
import MessageItem from './src/components/MessageItem';
import TypingBubble from './src/components/TypingBubble';
import SettingsModal from './src/components/SettingsModal';
import IntakeQuiz from './src/components/IntakeQuiz';
import MicButton from './src/components/MicButton';

let nextId = 1;

const INTAKE_DONE_KEY = '@pmjay/intakeDone';
const PROFILE_KEY = '@pmjay/profileSummary';
const LANG_KEY = '@pmjay/lang';

// must match backend SUPPORTED_LANGS
const LANGS = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिन्दी', short: 'हि' },
  { code: 'mr', label: 'मराठी', short: 'म' },
];

function friendlyError(e) {
  if (e?.timeout)
    return 'The request timed out or was cancelled. Answers can take 1–4 minutes on CPU — increase the timeout in settings (⚙) and try again.';
  if (e?.status === 503)
    return `Backend is still loading — ${e.message}. Try again in a minute.`;
  if (/network|fetch/i.test(String(e?.message)) || e?.status === undefined)
    return 'Cannot reach the backend. Check the server URL (⚙), that uvicorn runs with --host 0.0.0.0, and that the phone/PC are on the same Wi-Fi.';
  return `Error: ${e?.message || 'unknown'}`;
}

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [health, setHealth] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [intakeQ, setIntakeQ] = useState(null);
  const [profileSummary, setProfileSummary] = useState('');
  const [matchData, setMatchData] = useState(null);

  const [lang, setLang] = useState('en');

  const askRef = useRef(null);

  const addMessage = useCallback(m => setMsgs(prev => [m, ...prev]), []);

  /* ---------- load config + saved lang/profile on mount ---------- */
  useEffect(() => {
    (async () => {
      await loadConfig();
      try {
        const [l, done, prof] = await Promise.all([
          AsyncStorage.getItem(LANG_KEY),
          AsyncStorage.getItem(INTAKE_DONE_KEY),
          AsyncStorage.getItem(PROFILE_KEY),
        ]);
        if (l) setLang(l);
        if (prof) setProfileSummary(prof);
        if (done !== '1') setScreen('lang');   // first run → language gate
      } catch { }
    })();
  }, []);

  /* ---------- health polling (lang-aware) ---------- */
  useEffect(() => {
    let alive = true, timer, stopped = false;

    const loadExtras = async () => {
      try {
        const d = await fetchSuggestions(lang);
        if (alive) setSuggestions(d.questions || []);
      } catch { }
      try {
        const iq = await getIntakeQuestions(lang);
        if (alive && iq.questions?.length) {
          setIntakeQ(iq.questions);
          // ★ FIX 2: await the storage read BEFORE calling setScreen —
          // state updaters must be synchronous, never return a Promise
          try {
            const done = await AsyncStorage.getItem(INTAKE_DONE_KEY);
            setScreen(prev => (prev === 'loading' ? (done === '1' ? 'chat' : 'quiz') : prev));
          } catch {
            setScreen(prev => (prev === 'loading' ? 'quiz' : prev));
          }
        }
      } catch { }
    };

    const check = async () => {
      try {
        const h = await fetchHealth();
        if (!alive) return true;
        setHealth(h);
        if (h.ready) { loadExtras(); return true; }
      } catch {
        if (!alive) return true;
        setHealth(null);
      }
      return false;
    };

    const loop = async () => {
      if (stopped) return;
      const done = await check();
      if (stopped || !alive) return;
      if (!done) timer = setTimeout(loop, 4000);
    };
    loop();

    const onFocus = () => { if (!stopped) { clearTimeout(timer); loop(); } };
    let appSub;
    if (Platform.OS === 'web') window.addEventListener('focus', onFocus);
    else appSub = AppState.addEventListener('change', s => { if (s === 'active') onFocus(); });

    return () => {
      stopped = true; alive = false; clearTimeout(timer);
      appSub?.remove?.();
      if (Platform.OS === 'web') window.removeEventListener('focus', onFocus);
    };
  }, [reloadKey, lang]);

  /* ---------- send (carries lang + profile, stores speech/suggestions) ---------- */
  const send = useCallback((text) => {
    const q = (text ?? input).trim();
    if (!q || sending || !health?.ready) return;

    Keyboard.dismiss();
    setInput('');
    addMessage({ id: ++nextId, role: 'user', text: q });
    setSending(true);

    const { promise, cancel } = ask(q, lang, profileSummary);
    askRef.current = { cancel };

    promise
      .then(d => {
        addMessage({
          id: ++nextId, role: 'assistant',
          text: d.answer, intents: d.intents, sources: d.sources,
          speech: d.speech, mlang: d.lang || lang,
        });
        if (d.suggestions?.length) setSuggestions(d.suggestions);
      })
      .catch(e => addMessage({ id: ++nextId, role: 'error', text: friendlyError(e) }))
      .finally(() => { setSending(false); askRef.current = null; });
  }, [input, sending, health, lang, profileSummary, addMessage]);

  const cancel = useCallback(() => askRef.current?.cancel(), []);

  const onKeyDown = useCallback((e) => {
    if (Platform.OS === 'web' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }, [send]);

  /* ---------- intake done → RESULTS screen ---------- */
  const handleIntakeDone = useCallback(async (answers) => {
    try {
      const r = await matchIntake(answers, lang);
      setMatchData(r);
      setProfileSummary(r.profile || '');
      AsyncStorage.setItem(INTAKE_DONE_KEY, '1').catch(() => { });
      AsyncStorage.setItem(PROFILE_KEY, r.profile || '').catch(() => { });
      addMessage({
        id: ++nextId, role: 'assistant',
        text: r.answer, intents: ['scheme-match'], sources: [],
        speech: r.speech, mlang: lang,
      });
      setScreen('results');
    } catch (e) {
      addMessage({
        id: ++nextId, role: 'error',
        text: 'Could not match schemes: ' + (e?.message || 'unknown'),
      });
      setScreen('chat');
    }
  }, [lang, addMessage]);

  const skipIntake = useCallback(() => {
    AsyncStorage.setItem(INTAKE_DONE_KEY, '1').catch(() => { });
    setScreen('chat');
  }, []);

  const reopenIntake = useCallback(() => {
    if (intakeQ?.length) setScreen('quiz');
  }, [intakeQ]);

  const newChat = useCallback(async () => {
    askRef.current?.cancel();
    setMsgs([]);
    setInput('');
    setProfileSummary('');
    setMatchData(null);
    AsyncStorage.removeItem(INTAKE_DONE_KEY).catch(() => { });
    AsyncStorage.removeItem(PROFILE_KEY).catch(() => { });
    await resetConversation();
    if (intakeQ?.length) setScreen('quiz');
  }, [intakeQ]);

  /* ---------- language switching ---------- */
  const chooseLang = useCallback((code) => {
    setLang(code);
    saveLangPref(code);
    setScreen('loading');          // health loop routes to quiz/chat when ready
  }, []);

  const cycleLang = useCallback(() => {
    const i = LANGS.findIndex(l => l.code === lang);
    const next = LANGS[(i + 1) % LANGS.length].code;
    setLang(next);
    saveLangPref(next);
  }, [lang]);

  const renderItem = useCallback(({ item }) => <MessageItem item={item} />, []);
  const keyExtractor = useCallback(item => String(item.id), []);

  const status = useMemo(() => {
    if (!health) return { text: 'Offline — tap ⚙ to set server URL', cls: st.stOff };
    if (health.error) return { text: `Failed: ${health.error}`, cls: st.stOff };
    if (health.ready)
      return {
        text: `Ready · ${health.documents} docs · ${health.chunks} chunks · `
          + `${health.schemes ?? '?'} schemes · ${health.cuda ? 'GPU' : 'CPU'}`,
        cls: st.stOk,
      };
    return { text: `Loading: ${health.stage}`, cls: st.stLoad };
  }, [health]);

  const canSend = input.trim().length > 0 && !sending && health?.ready;

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={st.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={st.header}>
          <View style={st.flex1}>
            <Text style={st.title}>PM-JAY Assistant</Text>
            <Text style={[st.statusText, status.cls]} numberOfLines={1}>{status.text}</Text>
          </View>

          {screen === 'chat' && (
            <>
              <Pressable onPress={reopenIntake} hitSlop={8} style={st.newBtn}>
                <Text style={st.newBtnText}>🧾 Schemes</Text>
              </Pressable>
              <Pressable onPress={newChat} hitSlop={8} style={st.newBtn}>
                <Text style={st.newBtnText}>＋ New</Text>
              </Pressable>
            </>
          )}

          {/* language cycle button, always visible */}
          <Pressable onPress={cycleLang} hitSlop={8} style={st.newBtn}>
            <Text style={st.newBtnText}>
              {LANGS.find(l => l.code === lang)?.short}
            </Text>
          </Pressable>

          <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10}>
            <Text style={st.gear}>⚙️</Text>
          </Pressable>
        </View>

        {/* ============ SCREEN: LANGUAGE GATE ============ */}
        {screen === 'lang' && (
          <View style={st.center}>
            <Text style={st.langTitle}>Choose your language</Text>
            <Text style={st.langSub}>भाषा चुनें · भाषा निवडा</Text>
            <View style={st.langRow}>
              {LANGS.map(l => (
                <Pressable key={l.code} style={st.langBtn2} onPress={() => chooseLang(l.code)}>
                  <Text style={st.langBtn2Text}>{l.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ============ SCREEN: QUIZ ============ */}
        {screen === 'quiz' && intakeQ && (
          <ScrollView style={st.flex} contentContainerStyle={st.quizWrap}
            keyboardShouldPersistTaps="handled">
            <View style={st.quizCard}>
              <Text style={st.quizHello}>Welcome 👋</Text>
              <Text style={st.quizLead}>
                Answer a few short questions about the patient's situation, and we'll
                generate a personalised list of cancer support schemes
                (PM-JAY, Rashtriya Arogya Nidhi, Delhi Arogya Kosh, CanKids, Tata Trusts
                and more) — then you can ask anything in the chat.
              </Text>
              <IntakeQuiz
                key={lang}
                questions={intakeQ}
                onDone={handleIntakeDone}
                onSkip={skipIntake}
                disabled={sending}
                lang={lang}
              />
            </View>
          </ScrollView>
        )}

        {/* ============ SCREEN: RESULTS ============ */}
        {screen === 'results' && matchData && (
          <ResultsScreen
            data={matchData}
            lang={lang}
            onRetake={reopenIntake}
            onChat={() => setScreen('chat')}
          />
        )}

        {/* ============ SCREEN: LOADING ============ */}
        {screen === 'loading' && (
          <View style={st.center}>
            <Text style={st.loadingTxt}>
              {health?.stage ? `Preparing: ${health.stage}` : 'Connecting to backend…'}
            </Text>
          </View>
        )}

        {/* ============ SCREEN: CHAT ============ */}
        {screen === 'chat' && (
          <>
            {msgs.length === 0 && (
              <View style={st.introWrapper}>
                <View style={st.empty}>
                  <Text style={st.emptyTitle}>💬 Ask anything</Text>
                  <Text style={st.emptyBody}>
                    Your scheme list is based on the intake answers. Ask follow-up
                    questions about PM-JAY processes — every answer is grounded in the
                    uploaded PM-JAY PDFs with [S1]/[S2] evidence.
                  </Text>
                </View>
              </View>
            )}

            <FlatList
              style={st.flex}
              inverted
              data={msgs}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              initialNumToRender={10}
              maxToRenderPerBatch={6}
              windowSize={7}
              updateCellsBatchingPeriod={50}
              removeClippedSubviews
              contentContainerStyle={st.listContent}
              ListFooterComponent={<View style={st.listTopPad} />}
            />

            {sending && <TypingBubble onCancel={cancel} />}

            {suggestions.length > 0 && !sending && (
              <View style={st.chipsWrapper}>
                {suggestions.map(q => (
                  <Pressable key={q} style={st.chip} onPress={() => send(q)}>
                    <Text style={st.chipText} numberOfLines={2}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={st.composer}>
              <TextInput
                style={st.input}
                value={input}
                onChangeText={setInput}
                onKeyPress={Platform.OS === 'web' ? onKeyDown : undefined}
                multiline={false}
                returnKeyType="send"
                blurOnSubmit={Platform.OS !== 'web'}
                onSubmitEditing={Platform.OS !== 'web' ? () => send() : undefined}
                placeholder={health?.ready
                  ? 'Ask a question… (Enter to send)'
                  : 'Waiting for backend…'}
                placeholderTextColor={C.muted}
                editable={!sending}
              />
              <MicButton onText={txt => setInput(txt)} />
              <Pressable style={[st.send, !canSend && st.sendOff]}
                onPress={() => send()} disabled={!canSend}>
                <Text style={st.sendText}>Send</Text>
              </Pressable>
            </View>
          </>
        )}

        <SettingsModal
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => { setHealth(null); setSuggestions([]); setReloadKey(k => k + 1); }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.primaryDark },
  flex: { flex: 1 },
  flex1: { flex: 1 },

  // ★ FIX 1: header restored — the btnCol/chatBtn/chatBtnText entries were
  // nested inside it by mistake. They belong in ResultsScreen.js (see below).
  header: {
    backgroundColor: C.primaryDark, paddingHorizontal: 14,
    paddingTop: Platform.OS === 'android' ? 38 : 8, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  title: { color: '#e0f2fe', fontSize: 17, fontWeight: '700' },
  statusText: { fontSize: 11, marginTop: 2 },
  stOk: { color: '#86efac' },
  stLoad: { color: '#fcd34d' },
  stOff: { color: '#fca5a5' },
  gear: { fontSize: 22 },
  newBtn: {
    borderWidth: 1, borderColor: 'rgba(224,242,254,.4)', borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 5
  },
  newBtnText: { color: '#e0f2fe', fontSize: 12, fontWeight: '700' },

  langTitle: { color: '#e0f2fe', fontSize: 20, fontWeight: '800' },
  langSub: { color: '#bae6fd', fontSize: 14, marginTop: 4 },
  langRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  langBtn2: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 26,
              paddingVertical: 16 },
  langBtn2Text: { fontSize: 17, fontWeight: '700', color: C.primaryDark },

  quizWrap: {
    flexGrow: 1, justifyContent: 'center', padding: S.pad,
    maxWidth: 720, width: '100%', alignSelf: 'center'
  },
  quizCard: { backgroundColor: 'transparent' },
  quizHello: { fontSize: 20, fontWeight: '800', color: '#e0f2fe', marginBottom: 6 },
  quizLead: { fontSize: 13, color: '#bae6fd', lineHeight: 20, marginBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { color: '#bae6fd', fontSize: 14 },

  listContent: { paddingTop: 12, flexGrow: 1 },
  listTopPad: { height: 10 },
  introWrapper: { marginTop: 16, flexShrink: 0 },
  empty: {
    margin: S.pad, padding: 16, backgroundColor: '#fefce8', borderRadius: S.radius,
    borderWidth: 1, borderColor: '#fde68a'
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  emptyBody: { fontSize: 13, color: '#713f12', lineHeight: 19, marginTop: 6 },

  chipsWrapper: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8, gap: 6,
  },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(125,211,252,.3)',
    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center',
    maxWidth: '48%',
  },
  chipText: { fontSize: 11, color: '#e0f2fe', textAlign: 'center', lineHeight: 14 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, paddingBottom: 14,
    backgroundColor: C.surface, borderTopWidth: 1, borderColor: C.border,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: C.text,
    minHeight: 44, maxHeight: 120,
  },
  send: {
    backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 20,
    minHeight: 44, justifyContent: 'center'
  },
  sendOff: { backgroundColor: '#94a3b8' },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});