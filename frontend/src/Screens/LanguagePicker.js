import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LANGS, useLang } from "../context/LanguageContext";

export default function LanguagePicker({ onDone }) {
  const { setLang } = useLang();
  return (
    <View style={s.wrap}>
      <Text style={s.title}>Choose your language / भाषा चुनें / भाषा निवडा</Text>
      <View style={s.grid}>
        {LANGS.map(l => (
          <TouchableOpacity key={l.code} style={s.btn}
            onPress={() => { setLang(l.code); onDone?.(); }}>
            <Text style={s.btnText}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#0E7490" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 24, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  btn: { backgroundColor: "#fff", paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14, margin: 6 },
  btnText: { fontSize: 18, fontWeight: "600", color: "#0E7490" },
});