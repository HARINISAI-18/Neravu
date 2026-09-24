import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';

import {
  SafeAreaView,
  KeyboardAvoidingView,
  FlatList,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  AppState,
  Keyboard,
  Image,
} from 'react-native';

import Svg, { Path, Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';

import { C, S } from './src/theme';

import {
  loadConfig,
  fetchHealth,
  fetchSuggestions,
  ask,
  resetConversation,
  getIntakeQuestions,
  matchIntake,
  saveLangPref,
} from './src/api';

import MessageItem from './src/components/MessageItem';
import TypingBubble from './src/components/TypingBubble';
import SettingsModal from './src/components/SettingsModal';
import IntakeQuiz from './src/components/IntakeQuiz';
import MicButton from './src/components/MicButton';
import ResultsScreen from './src/Screens/ResultsScreen';

let nextId = 1;

/* ============================================================
   STORAGE
============================================================ */

const INTAKE_DONE_KEY = '@pmjay/intakeDone';
const PROFILE_KEY = '@pmjay/profileSummary';
const LANG_KEY = '@pmjay/lang';

/* ============================================================
   LANGUAGES
============================================================ */

const LANGS = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिन्दी', short: 'हि' },
  { code: 'mr', label: 'मराठी', short: 'म' },
  { code: 'bn', label: 'বাংলা', short: 'বা' },
  { code: 'ta', label: 'தமிழ்', short: 'த' },
  { code: 'gu', label: 'ગુજરાતી', short: 'ગુ' },
];

/* ============================================================
   NERAVU CONTENT
============================================================ */

const L = {
  en: {
    appTitle: 'Neravu',
    schemesBtn: 'Explore Schemes',
    newBtn: '＋ New',

    title: 'How can Neravu help today?',

    desc:
      'Your healthcare support, simplified. Discover schemes, check eligibility, prepare documents, apply for assistance, and understand your next steps.',

    ask: 'Ask Neravu anything…',
    wait: 'Connecting to Neravu…',

    prep: (s) => `Preparing: ${s}`,
    conn: 'Connecting to Neravu…',
    readyPrefix: 'Ready',

    suggs: [
      'Which healthcare schemes may I be eligible for?',
      'What documents do I need to apply?',
      'How do I apply for financial assistance?',
      'How can I track my application?',
    ],
  },

  hi: {
    appTitle: 'Neravu सहायक',
    schemesBtn: 'योजनाएं देखें',
    newBtn: '＋ नया',

    title: 'आज Neravu आपकी कैसे मदद कर सकता है?',

    desc:
      'स्वास्थ्य योजनाओं, आर्थिक सहायता, पात्रता, दस्तावेज़ और आवेदन प्रक्रिया को सरल तरीके से समझें।',

    ask: 'Neravu से कुछ भी पूछें…',
    wait: 'Neravu से जुड़ रहा है…',

    prep: (s) => `तैयार कर रहा है: ${s}`,
    conn: 'Neravu से जुड़ रहा है…',
    readyPrefix: 'तैयार',

    suggs: [
      'मैं किन स्वास्थ्य योजनाओं के लिए पात्र हो सकता हूं?',
      'आवेदन के लिए कौन से दस्तावेज़ चाहिए?',
      'आर्थिक सहायता के लिए आवेदन कैसे करें?',
      'मैं अपने आवेदन की स्थिति कैसे देखूं?',
    ],
  },

  mr: {
    appTitle: 'Neravu सहाय्यक',
    schemesBtn: 'योजना पहा',
    newBtn: '＋ नवीन',

    title: 'Neravu आज कशी मदत करू शकतो?',

    desc:
      'आरोग्य योजना, आर्थिक सहाय्य, पात्रता, कागदपत्रे आणि अर्ज प्रक्रिया एका सोप्या मार्गदर्शनातून समजून घ्या.',

    ask: 'Neravu ला काहीही विचारा…',
    wait: 'Neravu शी कनेक्ट करत आहे…',

    prep: (s) => `तयार करत आहे: ${s}`,
    conn: 'Neravu शी कनेक्ट करत आहे…',
    readyPrefix: 'तयार',

    suggs: [
      'माझ्यासाठी कोणत्या आरोग्य योजना उपलब्ध आहेत?',
      'अर्जासाठी कोणती कागदपत्रे लागतात?',
      'आर्थिक सहाय्यासाठी अर्ज कसा करायचा?',
      'माझ्या अर्जाची स्थिती कशी तपासायची?',
    ],
  },

  bn: {
    appTitle: 'Neravu সহকারী',
    schemesBtn: 'প্রকল্প দেখুন',
    newBtn: '＋ নতুন',

    title: 'আজ Neravu কীভাবে সাহায্য করতে পারে?',

    desc:
      'স্বাস্থ্য প্রকল্প, আর্থিক সহায়তা, যোগ্যতা, নথি এবং আবেদন প্রক্রিয়া সহজভাবে বুঝুন।',

    ask: 'Neravu-কে কিছু জিজ্ঞাসা করুন…',
    wait: 'Neravu-তে সংযোগ হচ্ছে…',

    prep: (s) => `প্রস্তুত হচ্ছে: ${s}`,
    conn: 'Neravu-তে সংযোগ হচ্ছে…',
    readyPrefix: 'প্রস্তুত',

    suggs: [
      'আমি কোন স্বাস্থ্য প্রকল্পের জন্য যোগ্য হতে পারি?',
      'আবেদনের জন্য কী কী নথি লাগবে?',
      'আর্থিক সহায়তার জন্য কীভাবে আবেদন করব?',
      'আমার আবেদনের অবস্থা কীভাবে দেখব?',
    ],
  },

  ta: {
    appTitle: 'Neravu உதவியாளர்',
    schemesBtn: 'திட்டங்களைப் பார்க்க',
    newBtn: '＋ புதிய',

    title: 'இன்று Neravu எப்படி உதவ முடியும்?',

    desc:
      'சுகாதாரத் திட்டங்கள், நிதியுதவி, தகுதி, ஆவணங்கள் மற்றும் விண்ணப்ப செயல்முறையை எளிதாகப் புரிந்துகொள்ளுங்கள்.',

    ask: 'Neravu-விடம் ஏதேனும் கேளுங்கள்…',
    wait: 'Neravu-க்கு இணைக்கிறது…',

    prep: (s) => `தயாராகிறது: ${s}`,
    conn: 'Neravu-க்கு இணைக்கிறது…',
    readyPrefix: 'தயார்',

    suggs: [
      'நான் எந்த சுகாதாரத் திட்டங்களுக்கு தகுதியுடையவன்?',
      'விண்ணப்பிக்க என்ன ஆவணங்கள் தேவை?',
      'நிதியுதவிக்கு எப்படி விண்ணப்பிப்பது?',
      'என் விண்ணப்ப நிலையை எப்படி பார்க்கலாம்?',
    ],
  },

  gu: {
    appTitle: 'Neravu સહાયક',
    schemesBtn: 'યોજનાઓ જુઓ',
    newBtn: '＋ નવી',

    title: 'આજે Neravu તમને કેવી રીતે મદદ કરી શકે?',

    desc:
      'આરોગ્ય યોજનાઓ, નાણાકીય સહાય, પાત્રતા, દસ્તાવેજો અને અરજી પ્રક્રિયા સરળતાથી સમજો.',

    ask: 'Neravu ને કંઈ પણ પૂછો…',
    wait: 'Neravu સાથે જોડાઈ રહ્યું છે…',

    prep: (s) => `તૈયાર છે: ${s}`,
    conn: 'Neravu સાથે જોડાઈ રહ્યું છે…',
    readyPrefix: 'તૈયાર',

    suggs: [
      'હું કઈ આરોગ્ય યોજનાઓ માટે પાત્ર હોઈ શકું?',
      'અરજી કરવા માટે કયા દસ્તાવેજો જોઈએ?',
      'નાણાકીય સહાય માટે કેવી રીતે અરજી કરવી?',
      'મારી અરજીની સ્થિતિ કેવી રીતે તપાસું?',
    ],
  },
};

/* ============================================================
   ERROR HANDLING
============================================================ */

function friendlyError(e) {
  if (e?.timeout) {
    return (
      'The request timed out or was cancelled. ' +
      'Answers can take 1–4 minutes on CPU — increase the timeout in settings (⚙) and try again.'
    );
  }

  if (e?.status === 503) {
    return `Backend is still loading — ${e.message}. Try again in a minute.`;
  }

  if (
    /network|fetch/i.test(String(e?.message)) ||
    e?.status === undefined
  ) {
    return (
      'Cannot reach the backend. Check the server URL (⚙), ' +
      'that uvicorn runs with --host 0.0.0.0, and that the phone/PC are on the same Wi-Fi.'
    );
  }

  return `Error: ${e?.message || 'unknown'}`;
}

/* ============================================================
   APP
============================================================ */

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [health, setHealth] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [intakeQ, setIntakeQ] = useState(null);
  const [profileSummary, setProfileSummary] = useState('');
  const [matchData, setMatchData] = useState(null);

  const [lang, setLang] = useState('en');

  const askRef = useRef(null);

  /* ==========================================================
     MESSAGE
  ========================================================== */

  const addMessage = useCallback(
    (m) => setMsgs((prev) => [m, ...prev]),
    []
  );

  /* ==========================================================
     INITIAL LOAD
  ========================================================== */

  useEffect(() => {
    (async () => {
      await loadConfig();

      try {
        const [savedLang, done, profile] = await Promise.all([
          AsyncStorage.getItem(LANG_KEY),
          AsyncStorage.getItem(INTAKE_DONE_KEY),
          AsyncStorage.getItem(PROFILE_KEY),
        ]);

        if (savedLang) {
          setLang(savedLang);
        }

        if (profile) {
          setProfileSummary(profile);
        }

        if (done !== '1') {
          setScreen('lang');
        }
      } catch {
        // Keep defaults.
      }
    })();
  }, []);

  /* ==========================================================
     HEALTH + EXTRA DATA
  ========================================================== */

  useEffect(() => {
    let alive = true;
    let timer;
    let stopped = false;

    const loadExtras = async () => {
      try {
        const d = await fetchSuggestions(lang);

        if (alive) {
          setSuggestions(
            d.questions ||
              L[lang]?.suggs ||
              L.en.suggs
          );
        }
      } catch {
        if (alive) {
          setSuggestions(
            L[lang]?.suggs ||
              L.en.suggs
          );
        }
      }

      try {
        const iq = await getIntakeQuestions(lang);

        if (alive) {
          if (iq.questions?.length) {
            setIntakeQ(iq.questions);
          }

          try {
            const done = await AsyncStorage.getItem(
              INTAKE_DONE_KEY
            );

            setScreen((prev) => {
              if (prev !== 'loading') return prev;

              if (done === '1') {
                return 'chat';
              }

              return iq.questions?.length
                ? 'quiz'
                : 'chat';
            });
          } catch {
            setScreen((prev) => {
              if (prev !== 'loading') return prev;

              return iq.questions?.length
                ? 'quiz'
                : 'chat';
            });
          }
        }
      } catch {
        if (alive) {
          setScreen((prev) =>
            prev === 'loading'
              ? 'chat'
              : prev
          );
        }
      }
    };

    const check = async () => {
      try {
        const h = await fetchHealth();

        if (!alive) {
          return true;
        }

        setHealth(h);

        if (h.ready) {
          loadExtras();
          return true;
        }
      } catch {
        if (!alive) {
          return true;
        }

        setHealth(null);
      }

      return false;
    };

    const loop = async () => {
      if (stopped) return;

      const done = await check();

      if (stopped || !alive) return;

      if (!done) {
        timer = setTimeout(loop, 4000);
      }
    };

    loop();

    const onFocus = () => {
      if (!stopped) {
        clearTimeout(timer);
        loop();
      }
    };

    let appSub;

    if (Platform.OS === 'web') {
      window.addEventListener('focus', onFocus);
    } else {
      appSub = AppState.addEventListener(
        'change',
        (state) => {
          if (state === 'active') {
            onFocus();
          }
        }
      );
    }

    return () => {
      stopped = true;
      alive = false;

      clearTimeout(timer);

      appSub?.remove?.();

      if (Platform.OS === 'web') {
        window.removeEventListener(
          'focus',
          onFocus
        );
      }
    };
  }, [reloadKey, lang]);

  /* ==========================================================
     SEND MESSAGE
  ========================================================== */

  const send = useCallback(
    (text) => {
      const q = (text ?? input).trim();

      if (!q || sending || !health?.ready) {
        return;
      }

      Keyboard.dismiss();

      setInput('');

      addMessage({
        id: ++nextId,
        role: 'user',
        text: q,
      });

      setSending(true);

      const { promise, cancel } = ask(
        q,
        lang,
        profileSummary
      );

      askRef.current = { cancel };

      promise
        .then((d) => {
          addMessage({
            id: ++nextId,
            role: 'assistant',
            text: d.answer,
            intents: d.intents,
            sources: d.sources,
            speech: d.speech,
            mlang: d.lang || lang,
          });

          if (d.suggestions?.length) {
            setSuggestions(d.suggestions);
          }
        })
        .catch((e) => {
          addMessage({
            id: ++nextId,
            role: 'error',
            text: friendlyError(e),
          });
        })
        .finally(() => {
          setSending(false);
          askRef.current = null;
        });
    },
    [
      input,
      sending,
      health,
      lang,
      profileSummary,
      addMessage,
    ]
  );

  /* ==========================================================
     CANCEL
  ========================================================== */

  const cancel = useCallback(() => {
    askRef.current?.cancel();
  }, []);

  /* ==========================================================
     WEB ENTER KEY
  ========================================================== */

  const onKeyDown = useCallback(
    (e) => {
      if (
        Platform.OS === 'web' &&
        e.key === 'Enter' &&
        !e.shiftKey
      ) {
        e.preventDefault();
        send();
      }
    },
    [send]
  );

  /* ==========================================================
     INTAKE
  ========================================================== */

  const handleIntakeDone = useCallback(
    async (answers) => {
      try {
        const r = await matchIntake(
          answers,
          lang
        );

        setMatchData(r);
        setProfileSummary(r.profile || '');

        AsyncStorage.setItem(
          INTAKE_DONE_KEY,
          '1'
        ).catch(() => {});

        AsyncStorage.setItem(
          PROFILE_KEY,
          r.profile || ''
        ).catch(() => {});

        addMessage({
          id: ++nextId,
          role: 'assistant',
          text: r.answer,
          intents: ['scheme-match'],
          sources: [],
          speech: r.speech,
          mlang: lang,
        });

        setScreen('results');
      } catch (e) {
        addMessage({
          id: ++nextId,
          role: 'error',
          text:
            'Could not match schemes: ' +
            (e?.message || 'unknown'),
        });

        setScreen('chat');
      }
    },
    [lang, addMessage]
  );

  const skipIntake = useCallback(() => {
    AsyncStorage.setItem(
      INTAKE_DONE_KEY,
      '1'
    ).catch(() => {});

    setScreen('chat');
  }, []);

  const reopenIntake = useCallback(() => {
    if (intakeQ?.length) {
      setScreen('quiz');
    }
  }, [intakeQ]);

  /* ==========================================================
     NEW CHAT
  ========================================================== */

  const newChat = useCallback(async () => {
    askRef.current?.cancel();

    setMsgs([]);
    setInput('');
    setProfileSummary('');
    setMatchData(null);

    AsyncStorage.removeItem(
      INTAKE_DONE_KEY
    ).catch(() => {});

    AsyncStorage.removeItem(
      PROFILE_KEY
    ).catch(() => {});

    await resetConversation();

    if (intakeQ?.length) {
      setScreen('quiz');
    } else {
      setScreen('chat');
    }
  }, [intakeQ]);

  /* ==========================================================
     LANGUAGE
  ========================================================== */

  const chooseLang = useCallback((code) => {
    setLang(code);
    saveLangPref(code);
    setLangMenuOpen(false);
    setScreen('loading');
  }, []);

  /* ==========================================================
     LIST
  ========================================================== */

  const renderItem = useCallback(
    ({ item }) => (
      <MessageItem item={item} />
    ),
    []
  );

  const keyExtractor = useCallback(
    (item) => String(item.id),
    []
  );

  /* ==========================================================
     STATUS
  ========================================================== */

  const status = useMemo(() => {
    if (!health) {
      return {
        text:
          'Offline — tap ⚙ to set server URL',
        cls: st.stOff,
      };
    }

    if (health.error) {
      return {
        text: `Failed: ${health.error}`,
        cls: st.stOff,
      };
    }

    if (health.ready) {
      return {
        text:
          `${L[lang].readyPrefix} · ` +
          `${health.documents} docs · ` +
          `${health.chunks} chunks · ` +
          `${health.schemes ?? '?'} schemes · ` +
          `${health.cuda ? 'GPU' : 'CPU'}`,
        cls: st.stOk,
      };
    }

    return {
      text: `Loading: ${health.stage}`,
      cls: st.stLoad,
    };
  }, [health, lang]);

  const canSend =
    input.trim().length > 0 &&
    !sending &&
    health?.ready;

  /* ==========================================================
     UI
  ========================================================== */

  return (
    <LinearGradient
      colors={[
        '#12382E',
        '#0A241D',
        '#061613',
      ]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={st.safe}
    >
      <SafeAreaView style={st.flex1}>

        <StatusBar style="light" />

        <KeyboardAvoidingView
          style={st.flex1}
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : undefined
          }
        >

          {/* ==================================================
              HEADER
          ================================================== */}

          <View style={st.headerWrapper}>
            <View style={st.header}>

              {/* BRAND */}
              <View style={st.brandArea}>
                <View style={st.titleLogoRow}>

                  <View style={st.logoHolder}>
                    <Image
                      source={require(
                        './assets/neravu-logo.png'
                      )}
                      style={st.headerLogo}
                      resizeMode="contain"
                    />
                  </View>

                  <View>
                    <Text style={st.title}>
                      {L[lang].appTitle}
                    </Text>

                    <View
                      style={st.brandTagRow}
                    >
                      <View
                        style={st.brandDot}
                      />

                      <Text
                        style={st.brandTag}
                      >
                        HEALTHCARE • FINANCIAL • ADMIN
                      </Text>
                    </View>
                  </View>

                </View>

                <Text
                  style={[
                    st.statusText,
                    status.cls,
                  ]}
                  numberOfLines={1}
                >
                  {status.text}
                </Text>
              </View>

              {/* ACTIONS */}

              {screen === 'chat' && (
                <>
                  <Pressable
                    onPress={reopenIntake}
                    hitSlop={8}
                    style={st.outlineBtn}
                  >
                    <Text
                      style={
                        st.outlineBtnText
                      }
                    >
                      {L[lang].schemesBtn}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={newChat}
                    hitSlop={8}
                    style={st.solidBtn}
                  >
                    <Text
                      style={st.solidBtnText}
                    >
                      {L[lang].newBtn}
                    </Text>
                  </Pressable>
                </>
              )}

              {/* LANGUAGE */}

              <View style={st.languageContainer}>
                <Pressable
                  onPress={() =>
                    setLangMenuOpen(
                      !langMenuOpen
                    )
                  }
                  hitSlop={8}
                  style={st.langPill}
                >
                  <Text
                    style={st.langPillText}
                  >
                    {
                      LANGS.find(
                        (l) =>
                          l.code === lang
                      )?.label
                    }{' '}
                    ▾
                  </Text>
                </Pressable>

                {langMenuOpen && (
                  <View
                    style={st.langDropdown}
                  >
                    {LANGS.map((l) => (
                      <Pressable
                        key={l.code}
                        style={
                          st.langDropItem
                        }
                        onPress={() =>
                          chooseLang(
                            l.code
                          )
                        }
                      >
                        <Text
                          style={[
                            st.langDropText,
                            lang ===
                              l.code &&
                              st.langDropTextActive,
                          ]}
                        >
                          {l.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {/* SETTINGS */}

              <Pressable
                onPress={() =>
                  setSettingsOpen(true)
                }
                hitSlop={10}
                style={st.settingsBtn}
              >
                <Svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#D8E8E2"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path
                    d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
                  />
                  <Circle
                    cx="12"
                    cy="12"
                    r="3"
                  />
                </Svg>
              </Pressable>

            </View>
          </View>

          {/* ==================================================
              LANGUAGE
          ================================================== */}

          {screen === 'lang' && (
            <View style={st.center}>

              <View style={st.languageHero}>
                <Text style={st.languageEyebrow}>
                  WELCOME TO NERAVU
                </Text>

                <Text
                  style={st.langTitle}
                >
                  Choose your language
                </Text>

                <Text
                  style={st.langSub}
                >
                  भाषा चुनें · भाषा निवडा
                </Text>

                <View style={st.langRow}>
                  {LANGS.map((l) => (
                    <Pressable
                      key={l.code}
                      style={st.langBtn2}
                      onPress={() =>
                        chooseLang(
                          l.code
                        )
                      }
                    >
                      <Text
                        style={
                          st.langBtn2Text
                        }
                      >
                        {l.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

            </View>
          )}

          {/* ==================================================
              QUIZ
          ================================================== */}

          {screen === 'quiz' && intakeQ && (
            <ScrollView
              style={st.flex}
              contentContainerStyle={
                st.quizWrap
              }
              keyboardShouldPersistTaps="handled"
            >
              <View style={st.quizCard}>

                <View style={st.quizHeader}>

                  <View
                    style={
                      st.quizIconContainer
                    }
                  >
                    <Image
                      source={require(
                        './assets/neravu-logo.png'
                      )}
                      style={
                        st.quizLogo
                      }
                      resizeMode="contain"
                    />
                  </View>

                  <View style={st.quizTitleArea}>
                    <Text
                      style={st.quizEyebrow}
                    >
                      NERAVU
                    </Text>

                    <Text
                      style={st.quizHello}
                    >
                      Let's understand your needs
                    </Text>
                  </View>

                </View>

                <Text
                  style={st.quizLead}
                >
                  Answer a few short questions
                  so Neravu can help identify
                  relevant healthcare schemes,
                  financial assistance and
                  administrative support.
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

          {/* ==================================================
              RESULTS
          ================================================== */}

          {screen === 'results' &&
            matchData && (
              <ResultsScreen
                data={matchData}
                lang={lang}
                onRetake={reopenIntake}
                onChat={() =>
                  setScreen('chat')
                }
              />
            )}

          {/* ==================================================
              LOADING
          ================================================== */}

          {screen === 'loading' && (
            <View style={st.center}>

              <View
                style={
                  st.loadingCard
                }
              >
                <View
                  style={
                    st.loadingLogo
                  }
                >
                  <Image
                    source={require(
                      './assets/neravu-logo.png'
                    )}
                    style={
                      st.loadingLogoImage
                    }
                    resizeMode="contain"
                  />
                </View>

                <Text
                  style={
                    st.loadingBrand
                  }
                >
                  Neravu
                </Text>

                <Text
                  style={
                    st.loadingTxt
                  }
                >
                  {health?.stage
                    ? L[lang].prep(
                        health.stage
                      )
                    : L[lang].conn}
                </Text>
              </View>

            </View>
          )}

          {/* ==================================================
              CHAT
          ================================================== */}

          {screen === 'chat' && (
            <>
              {msgs.length === 0 && (
                <View
                  style={
                    st.introWrapper
                  }
                >
                  <View
                    style={st.empty}
                  >

                    <View
                      style={
                        st.heroTopRow
                      }
                    >
                      <View
                        style={
                          st.heroIcon
                        }
                      >
                        <Image
                          source={require(
                            './assets/neravu-logo.png'
                          )}
                          style={
                            st.heroLogo
                          }
                          resizeMode="contain"
                        />
                      </View>

                      <View
                        style={
                          st.trustBadge
                        }
                      >
                        <View
                          style={
                            st.trustDot
                          }
                        />

                        <Text
                          style={
                            st.trustText
                          }
                        >
                          PATIENT SUPPORT
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={st.eyebrow}
                    >
                      FINANCIAL & ADMINISTRATIVE SUPPORT
                    </Text>

                    <Text
                      style={
                        st.emptyTitle
                      }
                    >
                      {L[lang].title}
                    </Text>

                    <Text
                      style={
                        st.emptyBody
                      }
                    >
                      {L[lang].desc}
                    </Text>

                    <View
                      style={
                        st.featureRow
                      }
                    >
                      <View
                        style={
                          st.featureItem
                        }
                      >
                        <Text
                          style={
                            st.featureIcon
                          }
                        >
                          ✓
                        </Text>

                        <Text
                          style={
                            st.featureText
                          }
                        >
                          Eligibility
                        </Text>
                      </View>

                      <View
                        style={
                          st.featureItem
                        }
                      >
                        <Text
                          style={
                            st.featureIcon
                          }
                        >
                          ✓
                        </Text>

                        <Text
                          style={
                            st.featureText
                          }
                        >
                          Documents
                        </Text>
                      </View>

                      <View
                        style={
                          st.featureItem
                        }
                      >
                        <Text
                          style={
                            st.featureIcon
                          }
                        >
                          ✓
                        </Text>

                        <Text
                          style={
                            st.featureText
                          }
                        >
                          Applications
                        </Text>
                      </View>

                      <View
                        style={
                          st.featureItem
                        }
                      >
                        <Text
                          style={
                            st.featureIcon
                          }
                        >
                          ✓
                        </Text>

                        <Text
                          style={
                            st.featureText
                          }
                        >
                          Tracking
                        </Text>
                      </View>
                    </View>

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
                contentContainerStyle={
                  st.listContent
                }
                ListFooterComponent={
                  <View
                    style={
                      st.listTopPad
                    }
                  />
                }
              />

              {sending && (
  <View style={st.processingPill}>
    <View style={st.processingDots}>
      <View style={st.processingDot} />
      <View style={st.processingDot} />
      <View style={st.processingDot} />
    </View>

    <Text style={st.processingText}>
      Retrieving evidence & generating…
    </Text>

    <Pressable onPress={cancel} style={st.processingCancel}>
      <Text style={st.processingCancelText}>Cancel</Text>
    </Pressable>
  </View>
)}

              {suggestions.length > 0 &&
                !sending &&
                msgs.length === 0 && (
                  <View
                    style={
                      st.chipsWrapper
                    }
                  >
                    {suggestions.map(
                      (q) => (
                        <Pressable
                          key={q}
                          style={st.chip}
                          onPress={() =>
                            send(q)
                          }
                        >
                          <Text
                            style={
                              st.chipText
                            }
                            numberOfLines={2}
                          >
                            {q}
                          </Text>
                        </Pressable>
                      )
                    )}
                  </View>
                )}

              {/* ==================================================
                  COMPOSER
              ================================================== */}

              <View
                style={
                  st.composerContainer
                }
              >
                <View
                  style={st.composerBox}
                >

                  <TextInput
                    style={st.input}
                    value={input}
                    onChangeText={setInput}
                    onKeyPress={
                      Platform.OS === 'web'
                        ? onKeyDown
                        : undefined
                    }
                    multiline
                    blurOnSubmit={false}
                    placeholder={
                      health?.ready
                        ? L[lang].ask
                        : L[lang].wait
                    }
                    placeholderTextColor="#78968B"
                    editable={!sending}
                    maxLength={2000}
                  />

                  <View
                    style={
                      st.composerActions
                    }
                  >

                    <View
                      style={
                        st.leftActions
                      }
                    >
                      <MicButton
                        onText={(txt) =>
                          setInput(txt)
                        }
                        isMinimal
                      />
                    </View>

                    <View
                      style={
                        st.rightActions
                      }
                    >
                      <Text
                        style={
                          st.charCount
                        }
                      >
                        {input.length}/2000
                      </Text>

                      <Pressable
                        style={[
                          st.send,
                          !canSend &&
                            !sending &&
                            st.sendOff,
                        ]}
                        onPress={
                          sending
                            ? cancel
                            : () => send()
                        }
                        disabled={
                          !canSend &&
                          !sending
                        }
                      >
                        {sending ? (
                          <View
                            style={
                              st.stopSquare
                            }
                          />
                        ) : (
                          <Svg
                            width="17"
                            height="17"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#261600"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
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

          {/* ==================================================
              SETTINGS
          ================================================== */}

          <SettingsModal
            visible={settingsOpen}
            onClose={() =>
              setSettingsOpen(false)
            }
            onSaved={() => {
              setHealth(null);
              setSuggestions([]);
              setReloadKey(
                (k) => k + 1
              );
            }}
          />

        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

/* ==============================================================
   STYLES
============================================================== */

const st = StyleSheet.create({

  safe: {
    flex: 1,
  },

  flex: {
    flex: 1,
  },

  flex1: {
    flex: 1,
  },
  processingPill: {
  position: Platform.OS === 'web' ? 'absolute' : 'relative',

  left: Platform.OS === 'web' ? 24 : undefined,
  bottom: Platform.OS === 'web' ? 104 : undefined,

  width: Platform.OS === 'web'
    ? 'calc(100% - 48px)'
    : '92%',

  maxWidth: 1100,
  alignSelf: 'center',

  minHeight: 42,

  flexDirection: 'row',
  alignItems: 'center',

  paddingHorizontal: 16,

  backgroundColor: 'rgba(7, 31, 27, 0.96)',

  borderWidth: 1,
  borderColor: 'rgba(134,239,172,0.18)',

  borderRadius: 16,

  zIndex: 900,
  elevation: 10,

  ...Platform.select({
    web: {
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
    },
  }),
},

processingDots: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  marginRight: 10,
},

processingDot: {
  width: 5,
  height: 5,
  borderRadius: 999,
  backgroundColor: '#86efac',
},

processingText: {
  flex: 1,
  color: '#b8ccc5',
  fontSize: 12,
  fontWeight: '600',
},

processingCancel: {
  paddingHorizontal: 10,
  paddingVertical: 6,
},

processingCancelText: {
  color: '#fb7185',
  fontSize: 12,
  fontWeight: '800',
},

  /* ----------------------------------------------------------
     HEADER
  ---------------------------------------------------------- */

  headerWrapper: {
    paddingHorizontal:
      Platform.OS === 'web'
        ? 24
        : 12,

    paddingTop:
      Platform.OS === 'web'
        ? 18
        : 42,

    paddingBottom: 8,

    zIndex: 9999,
    elevation: 9999,
  },

  header: {
    minHeight: 72,

    backgroundColor:
      'rgba(5, 25, 20, 0.96)',

    borderRadius: 22,

    flexDirection: 'row',
    alignItems: 'center',

    paddingHorizontal:
      Platform.OS === 'web'
        ? 20
        : 13,

    paddingVertical: 12,

    gap: 9,

    borderWidth: 1,

    borderColor:
      'rgba(167, 243, 208, 0.13)',

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 9,
  },

  brandArea: {
    flex: 1,
    minWidth: 0,
  },

  titleLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  logoHolder: {
    width: 42,
    height: 42,

    borderRadius: 14,

    backgroundColor: '#F59E0B',

    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#F59E0B',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },

  headerLogo: {
    width: 34,
    height: 34,
  },

  title: {
    color: '#F8FAFC',
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.6,
  },

  brandTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },

  brandDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
  },

  brandTag: {
    color: '#7EA396',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  statusText: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: '600',
  },

  stOk: {
    color: '#86EFAC',
  },

  stLoad: {
    color: '#FBBF24',
  },

  stOff: {
    color: '#FB7185',
  },

  outlineBtn: {
    borderWidth: 1,
    borderColor:
      'rgba(134, 239, 172, 0.3)',

    borderRadius: 12,

    paddingHorizontal: 13,
    paddingVertical: 9,

    backgroundColor:
      'rgba(22, 101, 52, 0.14)',
  },

  outlineBtnText: {
    color: '#DCFCE7',
    fontSize: 11,
    fontWeight: '800',
  },

  solidBtn: {
    borderRadius: 12,

    paddingHorizontal: 14,
    paddingVertical: 9,

    backgroundColor: '#F59E0B',

    shadowColor: '#F59E0B',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.23,
    shadowRadius: 9,
    elevation: 4,
  },

  solidBtnText: {
    color: '#281500',
    fontSize: 11,
    fontWeight: '900',
  },

  languageContainer: {
    position: 'relative',
    zIndex: 100,
  },

  langPill: {
    paddingHorizontal: 12,
    paddingVertical: 9,

    borderRadius: 13,

    borderWidth: 1,

    borderColor:
      'rgba(255, 255, 255, 0.11)',

    backgroundColor:
      'rgba(255, 255, 255, 0.055)',
  },

  langPillText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
  },

  langDropdown: {
    position: 'absolute',

    top: 44,
    right: 0,

    zIndex: 9999,

    backgroundColor: '#09251E',

    borderRadius: 14,

    borderWidth: 1,

    borderColor:
      'rgba(134, 239, 172, 0.18)',

    padding: 6,
    minWidth: 155,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 8,
  },

  langDropItem: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 10,
  },

  langDropText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },

  langDropTextActive: {
    color: '#F59E0B',
    fontWeight: '900',
  },

  settingsBtn: {
    width: 38,
    height: 38,

    borderRadius: 12,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      'rgba(255,255,255,0.055)',

    borderWidth: 1,

    borderColor:
      'rgba(255,255,255,0.10)',
  },

  /* ----------------------------------------------------------
     CENTER / LANGUAGE
  ---------------------------------------------------------- */

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',

    paddingHorizontal: 20,
  },

  languageHero: {
    width: '100%',
    maxWidth: 650,

    alignItems: 'center',

    padding: 32,

    backgroundColor:
      'rgba(10, 40, 32, 0.72)',

    borderRadius: 28,

    borderWidth: 1,

    borderColor:
      'rgba(167,243,208,0.13)',
  },

  languageEyebrow: {
    color: '#F59E0B',

    fontSize: 10,
    fontWeight: '900',

    letterSpacing: 2,

    marginBottom: 9,
  },

  langTitle: {
    color: '#F8FAFC',

    fontSize: 29,

    fontWeight: '900',

    letterSpacing: -0.8,

    textAlign: 'center',
  },

  langSub: {
    color: '#9BB5AA',
    fontSize: 16,
    marginTop: 8,
  },

  langRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',

    justifyContent: 'center',

    gap: 10,

    marginTop: 28,
  },

  langBtn2: {
    backgroundColor: '#166534',

    borderRadius: 24,

    paddingHorizontal: 24,
    paddingVertical: 13,

    borderWidth: 1,

    borderColor:
      'rgba(134,239,172,0.22)',
  },

  langBtn2Text: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* ----------------------------------------------------------
     QUIZ
  ---------------------------------------------------------- */

  quizWrap: {
    flexGrow: 1,

    justifyContent: 'center',

    padding: S.pad,

    maxWidth: 780,

    width: '100%',

    alignSelf: 'center',
  },

  quizCard: {
    backgroundColor:
      'rgba(8, 38, 30, 0.9)',

    borderRadius: 28,

    padding: 28,

    borderWidth: 1,

    borderColor:
      'rgba(134,239,172,0.15)',

    shadowColor: '#000',

    shadowOffset: {
      width: 0,
      height: 14,
    },

    shadowOpacity: 0.24,

    shadowRadius: 25,

    elevation: 6,
  },

  quizHeader: {
    flexDirection: 'row',
    alignItems: 'center',

    marginBottom: 16,

    gap: 12,
  },

  quizIconContainer: {
    width: 50,
    height: 50,

    borderRadius: 16,

    backgroundColor:
      'rgba(245,158,11,0.12)',

    alignItems: 'center',
    justifyContent: 'center',

    borderWidth: 1,

    borderColor:
      'rgba(245,158,11,0.23)',
  },

  quizLogo: {
    width: 40,
    height: 40,
  },

  quizTitleArea: {
    flex: 1,
  },

  quizEyebrow: {
    color: '#F59E0B',

    fontSize: 9,

    fontWeight: '900',

    letterSpacing: 1.5,

    marginBottom: 3,
  },

  quizHello: {
    fontSize: 22,

    fontWeight: '900',

    color: '#F8FAFC',

    letterSpacing: -0.5,
  },

  quizLead: {
    fontSize: 15,

    color: '#B9C9C4',

    lineHeight: 24,

    marginBottom: 20,
  },

  /* ----------------------------------------------------------
     LOADING
  ---------------------------------------------------------- */

  loadingCard: {
    alignItems: 'center',

    padding: 32,

    borderRadius: 26,

    backgroundColor:
      'rgba(8, 38, 30, 0.75)',

    borderWidth: 1,

    borderColor:
      'rgba(167,243,208,0.13)',
  },

  loadingLogo: {
    width: 70,
    height: 70,

    borderRadius: 22,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: '#F59E0B',
  },

  loadingLogoImage: {
    width: 56,
    height: 56,
  },

  loadingBrand: {
    marginTop: 15,

    color: '#F8FAFC',

    fontSize: 23,

    fontWeight: '900',
  },

  loadingTxt: {
    marginTop: 6,

    color: '#9FB6AD',

    fontSize: 14,

    fontWeight: '600',

    textAlign: 'center',
  },

  /* ----------------------------------------------------------
     CHAT HERO
  ---------------------------------------------------------- */

  listContent: {
    paddingTop: 20,
    paddingBottom: 20,

    flexGrow: 1,

    paddingHorizontal:
      Platform.OS === 'web'
        ? 40
        : 12,
  },

  listTopPad: {
    height: 16,
  },

  introWrapper: {
    marginTop:
      Platform.OS === 'web'
        ? 24
        : 12,

    paddingHorizontal:
      Platform.OS === 'web'
        ? 20
        : 12,

    width: '100%',

    maxWidth: 950,

    alignSelf: 'center',
  },

  empty: {
    paddingVertical:
      Platform.OS === 'web'
        ? 34
        : 25,

    paddingHorizontal:
      Platform.OS === 'web'
        ? 42
        : 20,

    backgroundColor:
      'rgba(13, 52, 42, 0.64)',

    borderRadius: 30,

    borderWidth: 1,

    borderColor:
      'rgba(167,243,208,0.15)',

    alignItems: 'center',

    shadowColor: '#000',

    shadowOffset: {
      width: 0,
      height: 16,
    },

    shadowOpacity: 0.22,

    shadowRadius: 30,

    elevation: 6,

    ...Platform.select({
      web: {
        backdropFilter: 'blur(22px)',
        WebkitBackdropFilter:
          'blur(22px)',
      },
    }),
  },

  heroTopRow: {
    width: '100%',

    flexDirection: 'row',

    justifyContent:
      'space-between',

    alignItems: 'center',

    marginBottom: 16,
  },

  heroIcon: {
    width: 66,
    height: 66,

    borderRadius: 20,

    backgroundColor: '#F59E0B',

    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#F59E0B',

    shadowOffset: {
      width: 0,
      height: 5,
    },

    shadowOpacity: 0.20,

    shadowRadius: 14,

    elevation: 5,
  },

  heroLogo: {
    width: 54,
    height: 54,
  },

  trustBadge: {
    flexDirection: 'row',

    alignItems: 'center',

    gap: 6,

    paddingHorizontal: 11,
    paddingVertical: 7,

    borderRadius: 20,

    backgroundColor:
      'rgba(134,239,172,0.07)',

    borderWidth: 1,

    borderColor:
      'rgba(134,239,172,0.14)',
  },

  trustDot: {
    width: 6,
    height: 6,

    borderRadius: 6,

    backgroundColor: '#4ADE80',
  },

  trustText: {
    color: '#A7F3D0',

    fontSize: 9,

    fontWeight: '900',

    letterSpacing: 1,
  },

  eyebrow: {
    color: '#FBBF24',

    fontSize: 10,

    fontWeight: '900',

    letterSpacing: 1.8,

    textAlign: 'center',

    marginBottom: 9,
  },

  emptyTitle: {
    fontSize:
      Platform.OS === 'web'
        ? 30
        : 24,

    fontWeight: '900',

    color: '#F8FAFC',

    textAlign: 'center',

    letterSpacing: -0.8,
  },

  emptyBody: {
    fontSize: 15,

    color: '#C4D2CE',

    lineHeight: 24,

    marginTop: 12,

    textAlign: 'center',

    maxWidth: 760,
  },

  featureRow: {
    flexDirection: 'row',

    flexWrap: 'wrap',

    justifyContent: 'center',

    gap: 9,

    marginTop: 22,
  },

  featureItem: {
    flexDirection: 'row',

    alignItems: 'center',

    paddingHorizontal: 12,
    paddingVertical: 8,

    borderRadius: 18,

    backgroundColor:
      'rgba(255,255,255,0.055)',

    borderWidth: 1,

    borderColor:
      'rgba(255,255,255,0.08)',
  },

  featureIcon: {
    color: '#86EFAC',

    fontWeight: '900',

    marginRight: 6,
  },

  featureText: {
    color: '#D5E4DF',

    fontSize: 11,

    fontWeight: '700',
  },

  /* ----------------------------------------------------------
     SUGGESTIONS
  ---------------------------------------------------------- */

  chipsWrapper: {
    flexDirection: 'row',

    flexWrap: 'wrap',

    justifyContent: 'center',

    paddingHorizontal: 16,

    paddingTop: 13,

    paddingBottom: 18,

    gap: 10,

    width: '100%',

    maxWidth: 1050,

    alignSelf: 'center',
  },

  chip: {
    paddingHorizontal: 15,

    paddingVertical: 10,

    borderRadius: 18,

    borderWidth: 1,

    borderColor:
      'rgba(167,243,208,0.18)',

    backgroundColor:
      'rgba(255,255,255,0.06)',

    shadowColor: '#000',

    shadowOffset: {
      width: 0,
      height: 3,
    },

    shadowOpacity: 0.13,

    shadowRadius: 8,

    elevation: 2,

    ...Platform.select({
      web: {
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter:
          'blur(12px)',
      },
    }),
  },

  chipText: {
    fontSize: 13,

    color: '#D6E4DF',

    textAlign: 'center',

    fontWeight: '600',
  },

  /* ----------------------------------------------------------
     COMPOSER
  ---------------------------------------------------------- */

  composerContainer: {
  position: Platform.OS === 'web' ? 'absolute' : 'relative',

  left: Platform.OS === 'web' ? 0 : undefined,
  right: Platform.OS === 'web' ? 0 : undefined,
  bottom: Platform.OS === 'web' ? 8 : undefined,

  paddingHorizontal: Platform.OS === 'web' ? 20 : 12,
  paddingTop: 8,
  paddingBottom: Platform.OS === 'ios' ? 24 : 16,

  backgroundColor: 'transparent',
  alignItems: 'center',

  zIndex: 1000,
  elevation: 20,
},

  composerBox: {
  width: '100%',
  maxWidth: 920,
  minHeight: 108,

  backgroundColor: 'rgba(9, 32, 27, 0.96)',
  borderRadius: 24,

  borderWidth: 1,
  borderColor: 'rgba(167,243,208,0.18)',

  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.30,
  shadowRadius: 18,
  elevation: 8,

  paddingTop: 7,

  ...Platform.select({
    web: {
      backdropFilter: 'blur(22px)',
      WebkitBackdropFilter: 'blur(22px)',
    },
  }),
},

  input: {
    minHeight: 48,

    maxHeight: 120,

    paddingHorizontal: 17,

    paddingVertical: 11,

    fontSize: 16,

    color: '#F8FAFC',

    lineHeight: 24,

    ...Platform.select({
      web: {
        outlineStyle: 'none',
      },
    }),
  },

  composerActions: {
    flexDirection: 'row',

    justifyContent:
      'space-between',

    alignItems: 'center',

    paddingHorizontal: 12,

    paddingBottom: 11,

    paddingTop: 4,
  },

  leftActions: {
    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,
  },

  rightActions: {
    flexDirection: 'row',

    alignItems: 'center',

    gap: 11,
  },

  charCount: {
    fontSize: 11,

    color: '#8FA8A0',

    fontFamily:
      Platform.OS === 'ios'
        ? 'Courier'
        : 'monospace',
  },

  send: {
    backgroundColor: '#F59E0B',

    borderRadius: 999,

    width: 40,
    height: 40,

    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#F59E0B',

    shadowOffset: {
      width: 0,
      height: 4,
    },

    shadowOpacity: 0.28,

    shadowRadius: 11,

    elevation: 5,
  },

  sendOff: {
    opacity: 0.28,
  },

  stopSquare: {
    width: 12,
    height: 12,

    backgroundColor: '#281500',

    borderRadius: 3,
  },
});