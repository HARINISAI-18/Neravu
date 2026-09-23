import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { C, S } from '../theme';
import IntakeQuiz from '../components/IntakeQuiz';      // adjust path to your structure
import ResultsScreen from './ResultsScreen';
import { getIntakeQuestions, matchIntake } from '../api';

const UI = {
  en: { loading: 'Loading questions…', matching: 'Finding your schemes…',
        error: 'Could not reach the server.', retry: '↺ Try again' },
  hi: { loading: 'प्रश्न लोड हो रहे हैं…', matching: 'आपकी योजनाएँ खोजी जा रही हैं…',
        error: 'सर्वर से संपर्क नहीं हो सका।', retry: '↺ फिर कोशिश करें' },
  mr: { loading: 'प्रश्न लोड होत आहेत…', matching: 'तुमच्या योजना शोधत आहोत…',
        error: 'सर्व्हरशी संपर्क होऊ शकला नाही.', retry: '↺ पुन्हा प्रयत्न करा' },
};

export default function IntakeFlow({ lang = 'en', onSkip, disabled }) {
  const [questions, setQuestions] = useState(null);   // null = not fetched yet
  const [qError, setQError] = useState(false);
  const [matchData, setMatchData] = useState(null);   // null = show quiz
  const [matching, setMatching] = useState(false);

  const t = useCallback((k) => (UI[lang] && UI[lang][k]) || UI.en[k], [lang]);

  // Fetch localized questions when the language changes
  useEffect(() => {
    let alive = true;
    setQuestions(null);
    setQError(false);
    setMatchData(null);                                 // language switch restarts flow
    getIntakeQuestions(lang)
      .then((d) => { if (alive) setQuestions(d.questions); })
      .catch(() => { if (alive) setQError(true); });
    return () => { alive = false; };
  }, [lang]);

  // IntakeQuiz.onDone lands here
  const submitIntake = useCallback(async (answers) => {
    setMatching(true);
    try {
      const data = await matchIntake(answers, lang);    // { answer, speech, schemes, profile }
      setMatchData(data);
    } catch (e) {
      Alert.alert(t('error'), String(e?.message || e));
    } finally {
      setMatching(false);
    }
  }, [lang, t]);

  // ---- render states ----
  if (qError) {
    return (
      <View style={st.center}>
        <Text style={st.errText}>{t('error')}</Text>
        <Pressable style={st.retry} onPress={() => {
          setQError(false);
          getIntakeQuestions(lang)
            .then((d) => setQuestions(d.questions))
            .catch(() => setQError(true));
        }}>
          <Text style={st.retryText}>{t('retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (!questions) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={st.loadText}>{t('loading')}</Text>
      </View>
    );
  }

  if (matching) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={st.loadText}>{t('matching')}</Text>
      </View>
    );
  }

  if (matchData) {
    return (
      <ResultsScreen
        data={matchData}
        lang={lang}
        onRetake={() => setMatchData(null)}   // back to quiz, answers cleared
      />
    );
  }

  return (
    <IntakeQuiz
      key={lang}            // restart quiz if language switches mid-flow
      lang={lang}
      questions={questions}
      onDone={submitIntake}
      onSkip={onSkip}
      disabled={disabled}
    />
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center',
            padding: S.pad, backgroundColor: '#F8FAFC' },
  loadText: { marginTop: 12, fontSize: 14, color: C.muted },
  errText: { fontSize: 14, color: '#991B1B', textAlign: 'center', marginBottom: 12 },
  retry: { backgroundColor: '#F1F5F9', paddingVertical: 10, paddingHorizontal: 18,
           borderRadius: 10 },
  retryText: { color: '#334155', fontWeight: '600', fontSize: 13 },
});