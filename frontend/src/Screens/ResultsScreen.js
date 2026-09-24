import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { C, S } from "../theme";
import SchemeCard, { normalizeStatus, formatINR } from "../components/SchemeCard";
import SpeakerButton from "../components/SpeakerButton";

const UI = {
  en: {
    headline: "Your scheme matches", retake: "↺ Edit answers",
    chart: "Max coverage comparison", chat: "💬 Ask about these",
    none: "No matching schemes found — try editing your answers or ask in chat."
  },
  hi: {
    headline: "आपकी योजनाओं के मिलान", retake: "↺ उत्तर बदलें",
    chart: "अधिकतम कवरेज तुलना", chat: "💬 इनके बारे में पूछें",
    none: "कोई मिलान योजना नहीं मिली — अपने उत्तर बदलें या चैट में पूछें।"
  },
  mr: {
    headline: "तुमच्या योजनांचे जुळण्या", retake: "↺ उत्तरे बदला",
    chart: "कमाल कव्हरेज तुलना", chat: "💬 यांबाबत विचारा",
    none: "जुळण्या योजना आढळल्या नाहीत — उत्तरे बदला किंवा चॅटमध्ये विचारा."
  },
};

// Dependency-free horizontal bar list (replaces gifted-charts)
function BarList({ items }) {
  const max = Math.max(...items.map((i) => i.value));
  return (
    <View style={{ marginTop: 12 }}>
      {items.map((it, i) => (
        <View key={i} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
            <Text style={st.barLabel}>{it.label}</Text>
            <Text style={st.barValue}>{formatINR(it.value)}</Text>
          </View>
          <View style={st.barTrack}>
            <View style={[st.barFill, { width: `${Math.max(4, (it.value / max) * 100)}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function ResultsScreen({ data, lang = "en", onRetake, onChat }) {
  const t = (k) => (UI[lang] && UI[lang][k]) || UI.en[k];
  const speech = data.speech || data.answer || "";

  const order = { eligible: 0, possibly_eligible: 1, not_eligible: 2 };
  const sorted = useMemo(() =>
    [...(data.schemes || [])].sort((a, b) =>
      (order[normalizeStatus(a.status)] - order[normalizeStatus(b.status)]) ||
      ((b.match_score ?? b.score ?? 0) - (a.match_score ?? a.score ?? 0))
    ), [data]);

  const counts = useMemo(() => {
    const c = { eligible: 0, possibly_eligible: 0, not_eligible: 0 };
    sorted.forEach((s) => { c[normalizeStatus(s.status)]++; });
    return c;
  }, [sorted]);

  const chartData = useMemo(() =>
    sorted
      .filter((s) => (s.benefit_amount ?? s.amount ?? 0) > 0)
      .map((s) => ({ value: s.benefit_amount ?? s.amount, label: String(s.name) })),
    [sorted]);

  return (
    <ScrollView style={st.wrap} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* headline: summary + speaker */}
      <View style={st.headCard}>
        <View style={st.headRow}>
          <Text style={st.headline}>{t("headline")}</Text>
          {!!speech && <SpeakerButton text={speech} lang={lang} size={24} />}
        </View>
        {!!counts.eligible && (
          <Text style={st.subline}>
            🟢 {counts.eligible} · 🟡 {counts.possibly_eligible} · 🔴 {counts.not_eligible}
          </Text>
        )}
      </View>

      {sorted.length === 0 ? (
        <View style={st.empty}>
          <Text style={st.emptyText}>{t("none")}</Text>
        </View>
      ) : (
        sorted.map((s, i) => (
          <SchemeCard key={`${s.name}-${i}`} scheme={s} lang={lang} />
        ))
      )}

      {sorted.length > 0 && chartData.length >= 2 && (
        <View style={st.chartCard}>
          <Text style={st.chartTitle}>{t("chart")}</Text>
          <BarList items={chartData} />
        </View>
      )}

      {/* actions: chat + retake */}
      <View style={st.btnCol}>
        <Pressable style={[st.retake, st.chatBtn]} onPress={onChat}>
          <Text style={[st.retakeText, st.chatBtnText]}>{t("chat")}</Text>
        </Pressable>
        <Pressable style={st.retake} onPress={onRetake}>
          <Text style={st.retakeText}>{t("retake")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  headCard: {
    margin: S.pad, marginBottom: 12, padding: 24, backgroundColor: C.surface,
    borderRadius: S.radius, borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3
  },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headline: { fontSize: 22, fontWeight: "800", color: C.text, flex: 1, paddingRight: 8, letterSpacing: -0.5 },
  subline: { fontSize: 14, color: C.muted, marginTop: 8, fontWeight: '500' },
  empty: {
    margin: S.pad, padding: 32, backgroundColor: C.surface, borderRadius: S.radius,
    alignItems: "center", borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3
  },
  emptyText: { color: C.muted, fontSize: 16, textAlign: "center", lineHeight: 24 },
  chartCard: {
    marginHorizontal: S.pad, marginBottom: 16, padding: 24,
    backgroundColor: C.surface, borderRadius: S.radius, borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3
  },
  chartTitle: { fontWeight: "800", fontSize: 18, color: C.text, letterSpacing: -0.5, marginBottom: 8 },
  barLabel: { fontSize: 14, color: C.text, flex: 1, paddingRight: 8, fontWeight: '500' },
  barValue: { fontSize: 14, fontWeight: "800", color: C.primary },
  barTrack: { height: 10, backgroundColor: C.bg, borderRadius: 5, overflow: "hidden" },
  barFill: { height: 10, backgroundColor: C.primary, borderRadius: 5 },
  btnCol: { alignItems: "center", marginTop: 12, gap: 12 },
  chatBtn: { backgroundColor: C.primary, borderRadius: 24, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  chatBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  retake: {
    alignSelf: "center", paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 24, backgroundColor: "#f3f4f6"
  },
  retakeText: { color: "#374151", fontWeight: "600", fontSize: 15 },
});