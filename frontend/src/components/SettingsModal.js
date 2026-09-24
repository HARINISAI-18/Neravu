import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, Platform } from 'react-native';
import { C } from '../theme';
import { getBaseUrl, getTimeoutMs, saveConfig, TIMEOUT_OPTIONS } from '../api';

export default function SettingsModal({ visible, onClose, onSaved }) {
  const [url, setUrl] = useState('');
  const [ms, setMs] = useState(600000);

  useEffect(() => {
    if (visible) { setUrl(getBaseUrl()); setMs(getTimeoutMs()); }
  }, [visible]);

  const save = async () => {
    await saveConfig(url, ms);
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet}>
          <Text style={st.title}>Backend settings</Text>

          <Text style={st.label}>Server URL</Text>
          <TextInput
            style={st.input} value={url} onChangeText={setUrl}
            autoCapitalize="none" autoCorrect={false} keyboardType="url"
            placeholder="http://192.168.1.20:8000" placeholderTextColor={C.muted}
          />
          <Text style={st.hint}>
            Web browser &amp; iOS simulator: http://localhost:8000 · Android emulator:
            http://10.0.2.2:8000 · Physical phone: your PC's LAN IP (same Wi-Fi)
          </Text>

          <Text style={st.label}>Answer timeout</Text>
          <View style={st.row}>
            {TIMEOUT_OPTIONS.map(o => (
              <Pressable key={o.ms} onPress={() => setMs(o.ms)}
                style={[st.chip, ms === o.ms && st.chipOn]}>
                <Text style={[st.chipText, ms === o.ms && st.chipTextOn]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={st.row}>
            <Pressable style={[st.btn, st.btnGhost]} onPress={onClose}>
              <Text style={st.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={st.btn} onPress={save}>
              <Text style={st.btnText}>Save &amp; reconnect</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, gap: 6
  },
  title: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 8 },
  label: {
    fontSize: 12, fontWeight: '600', color: C.muted, textTransform: 'uppercase',
    letterSpacing: 0.6
  },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 15, color: C.text,
    ...Platform.select({ web: { outlineStyle: 'none' } })
  },
  hint: { fontSize: 11, color: C.muted, lineHeight: 16 },
  row: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
    borderColor: C.border, backgroundColor: '#f8fafc'
  },
  chipOn: { backgroundColor: C.badge, borderColor: C.primary },
  chipText: { fontSize: 13, color: C.muted },
  chipTextOn: { color: C.badgeText, fontWeight: '600' },
  btn: {
    flex: 1, backgroundColor: C.primary, borderRadius: 10, paddingVertical: 12,
    alignItems: 'center'
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnGhost: { backgroundColor: '#f1f5f9' },
  btnGhostText: { color: C.muted, fontWeight: '600', fontSize: 14 },
});