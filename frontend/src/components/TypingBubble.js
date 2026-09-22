import React, { useState, useEffect, memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { C, S } from '../theme';

export default memo(function TypingBubble({ onCancel }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, '0');

  return (
    <View style={st.box}>
      <View style={st.dots}>
        <View style={[st.dot, { opacity: 0.25 + 0.25 * (sec % 3) }]} />
        <View style={[st.dot, { opacity: 0.25 + 0.25 * ((sec + 1) % 3) }]} />
        <View style={[st.dot, { opacity: 0.25 + 0.25 * ((sec + 2) % 3) }]} />
      </View>
      <Text style={st.text}>
        Retrieving evidence &amp; generating… {mm > 0 ? `${mm}:` : ''}{ss}
      </Text>
      <Pressable onPress={onCancel} hitSlop={8}>
        <Text style={st.cancel}>Cancel</Text>
      </Pressable>
    </View>
  );
});

const st = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: S.pad,
         marginBottom: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
         borderRadius: S.radius, paddingHorizontal: 12, paddingVertical: 10 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
  text: { flex: 1, fontSize: 12, color: C.muted },
  cancel: { fontSize: 13, fontWeight: '700', color: C.error },
});