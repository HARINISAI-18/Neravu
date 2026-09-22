import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { C, S } from '../theme';

export default function IntakeQuiz({ questions, onDone, onSkip, disabled }) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [sel, setSel] = useState([]);          // multi-select buffer
  const [text, setText] = useState('');        // free-text buffer (state question)
  const [busy, setBusy] = useState(false);

  const q = questions[idx];

  useEffect(() => { setSel([]); setText(''); }, [idx]);

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
      record([opt]);
    }
  };

  const back = () => { if (idx > 0) setIdx(idx - 1); };
  const skipQ = () => record(null);

  if (!q) return null;

  return (
    <View style={st.wrap}>
      <View style={st.headRow}>
        <Text style={st.headTitle}>Patient intake — find matching schemes</Text>
        <Pressable onPress={onSkip} hitSlop={8}><Text style={st.skip}>Skip</Text></Pressable>
      </View>

      <View style={st.progressBg}>
        <View style={[st.progressFill,
                      { width: `${Math.round((idx / questions.length) * 100)}%` }]} />
      </View>
      <Text style={st.meta}>
        Step {q.step} · {q.stepName} · Question {idx + 1} of {questions.length}
      </Text>

      <Text style={st.q}>
        {q.q}{q.multi ? '  (select all that apply)' : ''}
      </Text>

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
        <TextInput
          style={st.input}
          value={text}
          onChangeText={setText}
          placeholder="…or type your state/city"
          placeholderTextColor={C.muted}
          editable={!disabled && !busy}
          onSubmitEditing={() => text.trim() && record([text.trim()])}
        />
      )}

      <View style={st.btnRow}>
        {idx > 0 && (
          <Pressable style={st.backBtn} onPress={back} disabled={busy}>
            <Text style={st.backText}>← Back</Text>
          </Pressable>
        )}
        {q.optional && (
          <Pressable style={st.backBtn} onPress={skipQ} disabled={busy}>
            <Text style={st.backText}>Skip question</Text>
          </Pressable>
        )}
        {(q.multi || q.freeText) && (
          <Pressable
            style={[st.nextBtn, busy && st.optDisabled]}
            onPress={() => (q.multi
              ? sel.length && record(sel)
              : text.trim() && record([text.trim()]))}
            disabled={busy || (q.multi ? !sel.length : !text.trim())}>
            <Text style={st.nextText}>
              {idx + 1 >= questions.length ? 'Find my schemes' : 'Next →'}
            </Text>
          </Pressable>
        )}
      </View>
      <Text style={st.hint}>
        Your answers are used only to match suitable schemes — you can chat right after.
      </Text>
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
  q: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: 12, lineHeight: 22 },
  optionsScroll: { maxHeight: 220, marginTop: 12 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  opt: { borderWidth: 1, borderColor: '#bae6fd', backgroundColor: '#f8fafc',
         borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  optOn: { backgroundColor: C.badge, borderColor: C.primary },
  optDisabled: { opacity: 0.5 },
  optText: { fontSize: 13, color: C.text },
  optTextOn: { color: C.badgeText, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12,
           paddingVertical: 10, fontSize: 14, color: C.text, marginTop: 12 },
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