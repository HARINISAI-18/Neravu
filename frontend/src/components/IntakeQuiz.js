import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { C, S } from '../theme';
import SpeakerButton from './SpeakerButton';
import MicButton from './MicButton';

// ---- UI chrome strings (questions/options come localized from the backend) ----
// Languages without an entry here gracefully fall back to English chrome.


const UI = {
  en: {
    title: 'Patient intake — find matching schemes',
    skip: 'Skip',
    step: 'Step', question: 'Question',
    multiHint: '(select all that apply)',
    optionsLabel: 'Options:',
    back: '← Back', skipQ: 'Skip question',
    next: 'Next →', finish: 'Find my schemes',
    placeholder: '…or type your state/city',
    hint: 'Your answers are used only to match suitable schemes — you can chat right after.',
  },
  hi: {
    title: 'रोगी जानकारी — मिलान योजनाएँ खोजें',
    skip: 'छोड़ें',
    step: 'चरण', question: 'प्रश्न',
    multiHint: '(लागू होने वाले सभी विकल्प चुनें)',
    optionsLabel: 'विकल्प:',
    back: '← वापस', skipQ: 'यह प्रश्न छोड़ें',
    next: 'आगे →', finish: 'मेरी योजनाएँ खोजें',
    placeholder: '…या अपना राज्य/शहर लिखें',
    hint: 'आपके उत्तर सिर्फ़ उपयुक्त योजनाएँ सुझाने के लिए उपयोग होते हैं — इसके बाद आप सीधे चैट कर सकते हैं।',
  },
  mr: {
    title: 'रुग्ण माहिती — जुळण्या योजना शोधा',
    skip: 'वगळा',
    step: 'टप्पा', question: 'प्रश्न',
    multiHint: '(लागू होणारे सर्व पर्याय निवडा)',
    optionsLabel: 'पर्याय:',
    back: '← मागे', skipQ: 'हा प्रश्न वगळा',
    next: 'पुढे →', finish: 'माझ्या योजना शोधा',
    placeholder: '…किंवा तुमचे राज्य/शहर लिहा',
    hint: 'तुमची उत्तरे फक्त योग्य योजना सुचवण्यासाठी वापरली जातात — नंतर तुम्ही लगेच चॅट करू शकता.',
  },
};

export default function IntakeQuiz({ questions, onDone, onSkip, disabled, lang = 'en' }) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [sel, setSel] = useState([]);          // multi-select buffer (display strings)
  const [text, setText] = useState('');        // free-text buffer (state question)
  const [busy, setBusy] = useState(false);

  const q = questions[idx];
  const t = useCallback((key) => (UI[lang] && UI[lang][key]) || UI.en[key], [lang]);

  // Display option -> English option value (matcher expects English strings).
  // Falls back to the display string if backend didn't send options_en.
  const toValue = useCallback((displayOpt) => {
    if (!q?.options_en?.length) return displayOpt;
    const i = q.options.indexOf(displayOpt);
    return i >= 0 ? q.options_en[i] : displayOpt;
  }, [q]);

  // (Re)build the buffers when the question changes.
  // Going Back now RESTORES your previous answer instead of wiping it.
  useEffect(() => {
    const qn = questions[idx];
    if (!qn) return;
    const prev = answers[qn.id];
    if (prev == null) { setSel([]); setText(''); return; }
    if (qn.freeText) {
      setSel([]); setText(prev[0] || '');
    } else {
      setSel(prev.map(v => {
        const i = qn.options_en?.indexOf(v);
        return (i >= 0 && i < qn.options.length) ? qn.options[i] : v;
      }));
      setText('');
    }
  }, [idx]);

  // Spoken version of the question (question + options) for the 🔊 button
  const speakText = useMemo(() => {
    if (!q) return '';
    const opts = q.options?.length ? ` ${t('optionsLabel')} ${q.options.join(', ')}.` : '';
    return `${q.q}. ${q.multi ? `${t('multiHint')} ` : ''}${opts}`;
  }, [q, lang, t]);

  const finish = useCallback(async (all) => {
    setBusy(true);
    try { await onDone(all); } finally { setBusy(false); }
  }, [onDone]);

  const record = useCallback((value) => {
    const all = { ...answers, [q.id]: value };
    setAnswers(all);
    if (idx + 1 >= questions.length) finish(all);
    else setIdx(idx + 1);
  }, [answers, idx, q, questions.length, finish]);

  const choose = (opt) => {
    if (disabled || busy) return;
    if (q.multi) {
      setSel(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt]);
    } else {
      record([toValue(opt)]);          // ← English value stored
    }
  };

  const back = () => { if (idx > 0) setIdx(idx - 1); };
  const skipQ = () => record(null);

  if (!q) return null;

  return (
    <View style={st.wrap}>
      <View style={st.headRow}>
        <Text style={st.headTitle}>{t('title')}</Text>
        <Pressable onPress={onSkip} hitSlop={8}><Text style={st.skip}>{t('skip')}</Text></Pressable>
      </View>

      <View style={st.progressBg}>
        <View style={[st.progressFill,
                      { width: `${Math.round((idx / questions.length) * 100)}%` }]} />
      </View>
      <Text style={st.meta}>
        {t('step')} {q.step} · {q.stepName} · {t('question')} {idx + 1}/{questions.length}
      </Text>

      <View style={st.qRow}>
        <Text style={st.q}>
          {q.q}{q.multi ? `  ${t('multiHint')}` : ''}
        </Text>
        <SpeakerButton text={speakText} lang={lang} size={22} />
      </View>

      <ScrollView style={st.optionsScroll} nestedScrollEnabled>
        <View style={st.options}>
          {q.options.map(opt => {
            const on = sel.includes(opt);
            return (
              <Pressable key={opt} onPress={() => choose(opt)}
                         style={[st.opt, on && st.optOn, disabled && st.optDisabled]}>
                <Text style={[st.optText, on && st.optTextOn]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {q.freeText && (
        <View style={st.inputRow}>
          <TextInput
            style={st.input}
            value={text}
            onChangeText={setText}
            placeholder={t('placeholder')}
            placeholderTextColor={C.muted}
            editable={!disabled && !busy}
            onSubmitEditing={() => text.trim() && record([text.trim()])}
          />
          {/* hold-to-talk → transcribed text lands in the input */}
          <MicButton onText={(t2) => setText(t2)} />
        </View>
      )}

      <View style={st.btnRow}>
        {idx > 0 && (
          <Pressable style={st.backBtn} onPress={back} disabled={busy}>
            <Text style={st.backText}>{t('back')}</Text>
          </Pressable>
        )}
        {q.optional && (
          <Pressable style={st.backBtn} onPress={skipQ} disabled={busy}>
            <Text style={st.backText}>{t('skipQ')}</Text>
          </Pressable>
        )}
        {(q.multi || q.freeText) && (
          <Pressable
            style={[st.nextBtn, busy && st.optDisabled]}
            onPress={() => (q.multi
              ? sel.length && record(sel.map(toValue))     // ← English values stored
              : text.trim() && record([text.trim()]))}
            disabled={busy || (q.multi ? !sel.length : !text.trim())}>
            <Text style={st.nextText}>
              {idx + 1 >= questions.length ? t('finish') : t('next')}
            </Text>
          </Pressable>
        )}
      </View>
      <Text style={st.hint}>{t('hint')}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { margin: S.pad, padding: 16, backgroundColor: C.surface, borderRadius: S.radius,
          borderWidth: 1, borderColor: C.border },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headTitle: { fontSize: 14, fontWeight: '700', color: C.text, flex: 1, paddingRight: 8 },
  skip: { fontSize: 12, color: C.muted, fontWeight: '600' },
  progressBg: { height: 5, backgroundColor: '#e2e8f0', borderRadius: 3, marginTop: 12 },
  progressFill: { height: 5, backgroundColor: C.primary, borderRadius: 3 },
  meta: { fontSize: 11, color: C.muted, marginTop: 6 },
  qRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 },
  q: { fontSize: 16, fontWeight: '700', color: C.text, lineHeight: 22, flex: 1, paddingRight: 8 },
  optionsScroll: { maxHeight: 220, marginTop: 12 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  opt: { borderWidth: 1, borderColor: '#bae6fd', backgroundColor: '#f8fafc',
         borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  optOn: { backgroundColor: C.badge, borderColor: C.primary },
  optDisabled: { opacity: 0.5 },
  optText: { fontSize: 13, color: C.text },
  optTextOn: { color: C.badgeText, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10,
           paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.text },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center',
            flexWrap: 'wrap' },
  backBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
             backgroundColor: '#f1f5f9' },
  backText: { fontSize: 13, color: C.muted, fontWeight: '600' },
  nextBtn: { backgroundColor: C.primary, paddingVertical: 10, paddingHorizontal: 18,
             borderRadius: 10 },
  nextText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  hint: { fontSize: 11, color: C.muted, marginTop: 10 },
});