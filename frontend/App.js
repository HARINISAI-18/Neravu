import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  SafeAreaView, KeyboardAvoidingView, FlatList, View, Text, TextInput,
  Pressable, ScrollView, StyleSheet, Platform, AppState, Keyboard,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { C, S } from './src/theme';
import {
  loadConfig, fetchHealth, fetchSuggestions, ask, resetConversation,
  getIntakeQuestions, matchIntake, saveLangPref,
} from './src/api';
import { LinearGradient } from 'expo-linear-gradient';
import MessageItem from './src/components/MessageItem';
import TypingBubble from './src/components/TypingBubble';
import SettingsModal from './src/components/SettingsModal';
import IntakeQuiz from './src/components/IntakeQuiz';
import MicButton from './src/components/MicButton';
import ResultsScreen from './src/Screens/ResultsScreen';

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
    <LinearGradient colors={['#475569', '#0f172a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.safe}>
      <SafeAreaView style={st.flex1}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={st.flex1}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={st.headerWrapper}>
            <View style={st.header}>
              <View style={st.flex1}>
                <View style={st.titleLogoRow}>
                  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </Svg>
                  <Text style={st.title}>PM-JAY Assistant</Text>
                </View>
                <Text style={[st.statusText, status.cls]} numberOfLines={1}>{status.text}</Text>
              </View>

              {screen === 'chat' && (
                <>
                  <Pressable onPress={reopenIntake} hitSlop={8} style={st.outlineBtn}>
                    <Text style={st.outlineBtnText}>Schemes</Text>
                  </Pressable>
                  <Pressable onPress={newChat} hitSlop={8} style={st.solidBtn}>
                    <Text style={st.solidBtnText}>＋ New</Text>
                  </Pressable>
                </>
              )}

              {/* language cycle button, always visible */}
              <Pressable onPress={cycleLang} hitSlop={8} style={st.linkBtn}>
                <Text style={st.linkBtnText}>
                  {LANGS.find(l => l.code === lang)?.short}
                </Text>
              </Pressable>

              <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10} style={st.linkBtn}>
                <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><Circle cx="12" cy="12" r="3" />
                </Svg>
              </Pressable>
            </View>
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
                <View style={st.quizHeader}>
                  <View style={st.quizIconContainer}>
                    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </Svg>
                  </View>
                  <Text style={st.quizHello}>Welcome to PM-JAY Helper</Text>
                </View>
                <Text style={st.quizLead}>
                  Let's find the best healthcare schemes (PM-JAY, Rashtriya Arogya Nidhi, etc.) for you. Answer a few short questions to get started.
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
                    <View style={st.iconCircle}>
                      <Svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f8fafc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                      </Svg>
                    </View>
                    <Text style={st.emptyTitle}>How can we help today?</Text>
                    <Text style={st.emptyBody}>
                      Your recommended schemes are ready. You can now ask me directly about PM-JAY coverage, eligibility, hospitals, or the claim process. All answers are grounded in official guidelines.
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

              {suggestions.length > 0 && !sending && msgs.length === 0 && (
                <View style={st.chipsWrapper}>
                  {suggestions.map(q => (
                    <Pressable key={q} style={st.chip} onPress={() => send(q)}>
                      <Text style={st.chipText} numberOfLines={2}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={st.composerContainer}>
                <View style={st.composerBox}>
                  <TextInput
                    style={st.input}
                    value={input}
                    onChangeText={setInput}
                    onKeyPress={Platform.OS === 'web' ? onKeyDown : undefined}
                    multiline={true}
                    blurOnSubmit={false}
                    placeholder={health?.ready
                      ? 'Ask anything…'
                      : 'Waiting for backend…'}
                    placeholderTextColor="#cbd5e1"
                    editable={!sending}
                  />

                  <View style={st.composerActions}>
                    <View style={st.leftActions}>
                      <MicButton onText={txt => setInput(txt)} isMinimal={true} />
                    </View>

                    <View style={st.rightActions}>
                      <Text style={st.charCount}>
                        {input.length}/2000
                      </Text>
                      <Pressable style={[st.send, !canSend && !sending && st.sendOff]}
                        onPress={sending ? cancel : () => send()} disabled={!canSend && !sending}>
                        {sending ? (
                          <View style={st.stopSquare} />
                        ) : (
                          <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M12 19V5M5 12l7-7 7 7" />
                          </Svg>
                        )}
                      </Pressable>
                    </View>
                  </View>
                </View>
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
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  flex1: { flex: 1 },

  headerWrapper: {
    paddingHorizontal: Platform.OS === 'web' ? 24 : 12,
    paddingTop: Platform.OS === 'web' ? 24 : 44,
    paddingBottom: 0,
    backgroundColor: 'transparent',
  },
  header: {
    backgroundColor: '#09090b',
    borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  titleLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#ffffff', fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  statusText: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  stOk: { color: '#4ade80' },
  stLoad: { color: '#fbbf24' },
  stOff: { color: '#f87171' },

  outlineBtn: {
    borderWidth: 1, borderColor: '#3f3f46', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'transparent',
  },
  outlineBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },

  solidBtn: {
    borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#ffffff',
  },
  solidBtnText: { color: '#09090b', fontSize: 13, fontWeight: '700' },

  linkBtn: {
    paddingHorizontal: 10, paddingVertical: 8,
  },
  linkBtnText: { color: '#e4e4e7', fontSize: 14, fontWeight: '600' },

  langTitle: { color: C.text, fontSize: 24, fontWeight: '800' },
  langSub: { color: '#6b7280', fontSize: 16, marginTop: 6 },
  langRow: { flexDirection: 'row', gap: 14, marginTop: 28 },
  langBtn2: {
    backgroundColor: C.primary, borderRadius: 24, paddingHorizontal: 32,
    paddingVertical: 14, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4
  },
  langBtn2Text: { fontSize: 17, fontWeight: '700', color: '#fff' },

  quizWrap: {
    flexGrow: 1, justifyContent: 'center', padding: S.pad,
    maxWidth: 720, width: '100%', alignSelf: 'center'
  },
  quizCard: { backgroundColor: C.surface, borderRadius: 24, padding: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4, borderWidth: 1, borderColor: C.border },
  quizHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  quizIconContainer: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f0f9ff', alignItems: 'center', justifyContent: 'center' },
  quizHello: { fontSize: 24, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  quizLead: { fontSize: 15, color: C.muted, lineHeight: 24, marginBottom: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { color: C.muted, fontSize: 15, fontWeight: '500' },

  listContent: { paddingTop: 20, paddingBottom: 20, flexGrow: 1, paddingHorizontal: Platform.OS === 'web' ? 40 : 12 },
  listTopPad: { height: 16 },
  introWrapper: { marginTop: 24, flexShrink: 0, paddingHorizontal: 16, width: '100%', maxWidth: 850, alignSelf: 'center' },
  empty: {
    padding: 32, backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 24,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.25)', shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 4,
    alignItems: 'center',
    ...Platform.select({ web: { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } })
  },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255, 255, 255, 0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)' },
  emptyTitle: { fontSize: 24, fontWeight: '800', color: '#f8fafc', textAlign: 'center', letterSpacing: -0.5 },
  emptyBody: { fontSize: 15, color: '#cbd5e1', lineHeight: 24, marginTop: 12, textAlign: 'center' },

  chipsWrapper: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 10,
    width: '100%', maxWidth: 1000, alignSelf: 'center'
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2,
    ...Platform.select({ web: { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } })
  },
  chipText: { fontSize: 13, color: '#cbd5e1', textAlign: 'center', fontWeight: '500' },

  composerContainer: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  composerBox: {
    width: '100%',
    maxWidth: 900,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4,
    paddingTop: 8,
    ...Platform.select({ web: { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } })
  },
  input: {
    minHeight: 44, maxHeight: 120,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 16, color: '#f8fafc',
    borderWidth: 0,
    lineHeight: 24,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  composerActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4,
  },
  leftActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rightActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  charCount: {
    fontSize: 12, color: '#ced4da', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  send: {
    backgroundColor: '#0ea5e9',
    borderRadius: 999, width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  sendOff: {
    opacity: 0.3,
  },
  stopSquare: {
    width: 12, height: 12, backgroundColor: '#fff', borderRadius: 2,
  },
});