import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  Linking, Share
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import SpeakerButton from "./SpeakerButton";

// ================= localized chrome (scheme names/URLs/amounts stay English) =================
const UI = {
  en: {
    eligible: "✓ Likely eligible",
    possibly: "? Possibly eligible — check criteria",
    notEligible: "✗ Not eligible",
    amount: (inr) => `Up to ${inr} coverage`,
    more: (n) => `+ ${n} more`,
    details: "Details & documents",
    hide: "Hide",
    docs: "Documents required",
    docsProgress: (a, b) => `${a} of ${b} collected`,
    infoApply: "Info / Apply →",
    share: "Share",
  },
  hi: {
    eligible: "✓ आप संभवतः पात्र हैं",
    possibly: "? संभावित पात्रता — शर्तें जाँचें",
    notEligible: "✗ पात्र नहीं",
    amount: (inr) => `${inr} तक कवरेज`,
    more: (n) => `+ ${n} और`,
    details: "विवरण और दस्तावेज़",
    hide: "छिपाएँ",
    docs: "आवश्यक दस्तावेज़",
    docsProgress: (a, b) => `${b} में से ${a} इकट्ठा`,
    infoApply: "जानकारी / आवेदन →",
    share: "शेयर करें",
  },
  mr: {
    eligible: "✓ तुम्हीं पात्र असाल",
    possibly: "? संभाव्य पात्रता — अटी तपासा",
    notEligible: "✗ पात्र नाही",
    amount: (inr) => `${inr} पर्यंत कव्हरेज`,
    more: (n) => `+ ${n} अधिक`,
    details: "तपशील आणि कागदपत्रे",
    hide: "लपवा",
    docs: "आवश्यक कागदपत्रे",
    docsProgress: (a, b) => `${b}पैकी ${a} जमा`,
    infoApply: "माहिती / अर्ज →",
    share: "शेअर करा",
  },
};

const STYLE_MAP = {
  eligible: { bg: "#DCFCE7", fg: "#166534", ring: "#22C55E" },
  possibly_eligible: { bg: "#FEF3C7", fg: "#92400E", ring: "#F59E0B" },
  not_eligible: { bg: "#FEE2E2", fg: "#991B1B", ring: "#EF4444" },
};

// Backend rows may carry enum status OR free text ("Possibly eligible — check criteria")
export function normalizeStatus(s) {
  if (!s) return "possibly_eligible";
  const v = String(s).toLowerCase();
  if (v.includes("possibly")) return "possibly_eligible";
  if (v.includes("not") || v.includes("ineligib")) return "not_eligible";
  if (v.includes("eligib")) return "eligible";
  return "possibly_eligible";
}

// Handles numbers, "500000", "₹5,00,000", crore/lakh boundaries
export function formatINR(v) {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v;
  if (!n || Number.isNaN(n)) return "";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2).replace(/\.?0+$/, "")} crore`;
  if (n >= 100000) {
    const l = n / 100000;
    return `₹${Number.isInteger(l) ? l : l.toFixed(2).replace(/\.?0+$/, "")} lakh`;
  }
  return `₹${n.toLocaleString("en-IN")}`;
}

function Ring({ pct, color, size = 46 }) {
  if (!pct || pct <= 0) return null;
  const r = size / 2 - 6, c = 2 * Math.PI * r, mid = size / 2;
  return (
    <Svg width={size} height={size}>
      <Circle cx={mid} cy={mid} r={r} stroke="#E5E7EB" strokeWidth={5} fill="none" />
      <Circle cx={mid} cy={mid} r={r} stroke={color} strokeWidth={5} fill="none"
        strokeDasharray={`${(c * Math.min(pct, 100)) / 100} ${c}`}
        strokeLinecap="round" transform={`rotate(-90 ${mid} ${mid})`} />
      <SvgText x={mid} y={mid + 4} textAnchor="middle" fontSize={size * 0.24}
        fontWeight="bold" fill={color}>{Math.round(pct)}%</SvgText>
    </Svg>
  );
}

const docKey = (name) => `@pmjay/docs/${String(name).slice(0, 80)}`;

const CRIT_ICON = { pass: "✓", verify: "?", fail: "✗" };
const CRIT_FG = { pass: "#166534", verify: "#92400E", fail: "#991B1B" };

export default function SchemeCard({ scheme, lang = "en" }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState({});

  const t = (k) => (UI[lang] && UI[lang][k]) || UI.en[k];
  const key = normalizeStatus(scheme.status);
  const st = STYLE_MAP[key];
  const stLabel = t(key === "eligible" ? "eligible"
    : key === "not_eligible" ? "notEligible" : "possibly");

  const score = scheme.match_score ?? scheme.score ?? null;
  const amtText = formatINR(scheme.benefit_amount ?? scheme.amount);
  const benefits = scheme.benefits || [];
  const docs = scheme.documents || [];
  const criteria = Array.isArray(scheme.criteria) ? scheme.criteria : [];

  const docsReady = docs.filter((d) => checked[d]).length;

  // Restore / persist checklist per scheme — survives app restarts
  useEffect(() => {
    AsyncStorage.getItem(docKey(scheme.name))
      .then((v) => v && setChecked(JSON.parse(v)))
      .catch(() => { });
  }, [scheme.name]);

  const toggleDoc = (doc) => {
    setChecked((prev) => {
      const next = { ...prev, [doc]: !prev[doc] };
      AsyncStorage.setItem(docKey(scheme.name), JSON.stringify(next)).catch(() => { });
      return next;
    });
  };

  // Spoken summary for the 🔊 button (backend cleans ₹ → "rupees" etc.)
  const spoken = useMemo(() => {
    const bits = [scheme.name, stLabel.replace(/[✓?✗]/g, "").trim()];
    if (amtText) bits.push(t("amount")(amtText));
    const b = benefits.slice(0, 2).join(". ");
    if (b) bits.push(b);
    if (scheme.note) bits.push(String(scheme.note));
    return bits.join(". ");
  }, [scheme, lang]);

  const onShare = () => {
    const lines = [`${scheme.name}${scheme.type ? ` (${scheme.type})` : ""}`, stLabel];
    if (amtText) lines.push(t("amount")(amtText));
    if (scheme.url) lines.push(scheme.url);
    Share.share({ message: lines.join("\n") }).catch(() => { });
  };

  const visibleBenefits = open ? benefits : benefits.slice(0, 2);

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Ring pct={score} color={st.ring} />
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{scheme.name}</Text>
          {!!scheme.type && <Text style={s.type}>{scheme.type}</Text>}
        </View>
        <SpeakerButton text={spoken} lang={lang} size={22} />
      </View>

      <View style={[s.pill, { backgroundColor: st.bg }]}>
        <Text style={{ color: st.fg, fontWeight: "700", fontSize: 13 }}>{stLabel}</Text>
      </View>

      {!!amtText && <Text style={s.amount}>💰 {t("amount")(amtText)}</Text>}

      {visibleBenefits.map((b, i) => (
        <Text key={i} style={s.bullet}>• {b}</Text>
      ))}
      {!open && benefits.length > 2 && (
        <Pressable onPress={() => setOpen(true)} hitSlop={6}>
          <Text style={[s.bullet, { color: "#0E7490", fontWeight: "600" }]}>
            {t("more")(benefits.length - 2)}
          </Text>
        </Pressable>
      )}

      {/* ---------- expandable: note, criteria, document checklist ---------- */}
      {open && (
        <View style={s.details}>
          {!!scheme.note && <Text style={s.note}>ℹ️ {scheme.note}</Text>}

          {criteria.length > 0 && criteria.map((c, i) => {
            const cst = c.state || "verify";
            const text = typeof c === "string" ? c : (c.c || c.text || "");
            return (
              <View key={i} style={s.critRow}>
                <Text style={{ color: CRIT_FG[cst] || CRIT_FG.verify, fontWeight: "800" }}>
                  {CRIT_ICON[cst] || "?"}
                </Text>
                <Text style={s.critText}>{text}</Text>
              </View>
            );
          })}

          {docs.length > 0 && (
            <View style={s.docsWrap}>
              <View style={s.docsHead}>
                <Ring pct={docs.length ? (docsReady / docs.length) * 100 : 0}
                  color="#0E7490" size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={s.docsTitle}>{t("docs")}</Text>
                  <Text style={s.docsMeta}>{t("docsProgress")(docsReady, docs.length)}</Text>
                </View>
              </View>
              {docs.map((doc, i) => (
                <Pressable key={i} onPress={() => toggleDoc(doc)} style={s.docRow}
                  disabled={key === "not_eligible"}>
                  <View style={[s.box, checked[doc] && s.boxOn]}>
                    {!!checked[doc] && <Text style={s.boxTick}>✓</Text>}
                  </View>
                  <Text style={[s.docText, checked[doc] && s.docDone]}>{doc}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ---------- actions ---------- */}
      <View style={s.btnRow}>
        {(benefits.length > 2 || docs.length > 0 || criteria.length > 0 || scheme.note) && (
          <TouchableOpacity style={s.ghostBtn} onPress={() => setOpen(!open)}>
            <Text style={s.ghostText}>
              {open ? t("hide") : `${t("details")}${docs.length ? ` (${docsReady}/${docs.length})` : ""} ${open ? "▴" : "▾"}`}
            </Text>
          </TouchableOpacity>
        )}
        {!!scheme.url && (
          <TouchableOpacity style={s.btn}
            onPress={() => Linking.openURL(scheme.url)}>
            <Text style={s.btnText}>{t("infoApply")}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.ghostBtn} onPress={onShare}>
          <Text style={s.ghostText}>➦ {t("share")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#fff", borderRadius: 24, padding: 24, marginBottom: 16,
    elevation: 3, shadowColor: "#000", shadowOpacity: 0.05, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, borderWidth: 1, borderColor: '#e5e7eb'
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  name: { fontSize: 18, fontWeight: "800", color: "#111827", letterSpacing: -0.5 },
  type: { fontSize: 14, color: "#6B7280", marginTop: 4, fontWeight: '500' },
  pill: {
    alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, marginTop: 12
  },
  amount: { fontSize: 17, fontWeight: "800", color: "#0ea5e9", marginTop: 12 },
  bullet: { fontSize: 14, color: "#374151", marginTop: 6, lineHeight: 22 },
  details: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#F1F5F9", paddingTop: 14 },
  note: { fontSize: 13, color: "#92400E", marginTop: 4, fontStyle: "italic", lineHeight: 20 },
  critRow: { flexDirection: "row", gap: 10, marginTop: 8, alignItems: "flex-start" },
  critText: { flex: 1, fontSize: 14, color: "#374151", lineHeight: 20 },
  docsWrap: { marginTop: 16, backgroundColor: "#f8fafc", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  docsHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  docsTitle: { fontSize: 15, fontWeight: "800", color: "#111827" },
  docsMeta: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  box: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: "#94A3B8",
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center"
  },
  boxOn: { backgroundColor: "#0ea5e9", borderColor: "#0ea5e9" },
  boxTick: { color: "#fff", fontSize: 14, fontWeight: "800", marginTop: -1 },
  docText: { flex: 1, fontSize: 14, color: "#111827", lineHeight: 20 },
  docDone: { color: "#94A3B8", textDecorationLine: "line-through" },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 16, flexWrap: "wrap" },
  btn: { backgroundColor: "#0ea5e9", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, shadowColor: "#0ea5e9", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  ghostBtn: { backgroundColor: "#f3f4f6", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  ghostText: { color: "#374151", fontWeight: "700", fontSize: 14 },
});