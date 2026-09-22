import React, { useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { C, S } from '../theme';
import { parse } from '../richText';

/* ---------- inline segment renderer ---------- */
const Segments = memo(function Segments({ segs, onCite, baseStyle }) {
    return (
        <Text style={baseStyle}>
            {segs.map((sg, i) => {
                if (sg.t === 'bold') return <Text key={i} style={st.bold}>{sg.s}</Text>;
                if (sg.t === 'cite')
                    return (
                        <Text key={i} style={st.cite} onPress={() => onCite?.(sg.n)}>
                            {' '}[S{sg.n + 1}]{' '}
                        </Text>
                    );
                return <React.Fragment key={i}>{sg.s}</React.Fragment>;
            })}
        </Text>
    );
});

/* ---------- evidence source row (inside modal / expanded list) ---------- */
const SourceDetail = memo(function SourceDetail({ s }) {
    return (
        <View style={st.srcCard}>
            <Text style={st.srcTitle}>{s.citation} {s.source} — page {s.page}</Text>
            <Text style={st.srcMeta}>
                rerank {Number(s.rerank_score).toFixed(3)} · hybrid {Number(s.hybrid_score).toFixed(3)} · chunk {s.chunk}
            </Text>
            <Text style={st.srcBody} selectable>{s.text}</Text>
        </View>
    );
});

/* ---------- main message bubble ---------- */
const MessageItem = memo(function MessageItem({ item, isLatest, suggestions, onSend }) {
    const [citeIdx, setCiteIdx] = useState(-1);   // citation → modal
    const [copied, setCopied] = useState(false);
    const onCite = useCallback(i => setCiteIdx(i), []);
    const close = useCallback(() => setCiteIdx(-1), []);

    if (item.role === 'user') {
        return (
            <View style={st.userRow}>
                <View style={st.userBubble}>
                    <Text style={st.userText} selectable>{item.text}</Text>
                </View>
            </View>
        );
    }

    if (item.role === 'error') {
        return (
            <View style={st.botRow}>
                <View style={st.errorBubble}>
                    <Text style={st.errorText} selectable>{item.text}</Text>
                </View>
            </View>
        );
    }

    const blocks = parse(item.text);
    const hasSources = item.sources?.length > 0;
    // If backend returns item.intents, we could show them. Or use global suggestions if latest.
    const chipsToShow = (isLatest && suggestions?.length > 0) ? suggestions : [];

    const copy = () => {
        try {
            const ExpoClipboard = require('expo-clipboard');
            ExpoClipboard.setStringAsync(item.text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            });
        } catch { setCopied(false); }
    };

    return (
        <View style={st.botRow}>
            <View style={st.botBubble}>
                {/* parsed answer: paragraphs, lists, bold, clickable [S#] */}
                {blocks.map((b, bi) => {
                    if (b.type === 'p')
                        return <Segments key={bi} segs={b.segs} onCite={onCite} baseStyle={st.botText} />;
                    return (
                        <View key={bi} style={st.listBlock}>
                            {b.items.map((segs, li) => (
                                <View key={li} style={st.listRow}>
                                    <Text style={st.listMarker}>{b.type === 'ul' ? '•' : `${li + 1}.`}</Text>
                                    <Segments segs={segs} onCite={onCite} baseStyle={st.botText} />
                                </View>
                            ))}
                        </View>
                    );
                })}

                {item.intents?.length > 0 && item.intents[0] !== 'general' && (
                    <View style={st.intents}>
                        {item.intents.map(i => (
                            <Pressable key={i} style={st.badge} onPress={() => onSend?.(i)}>
                                <Text style={st.badgeText}>{i}</Text>
                            </Pressable>
                        ))}
                    </View>
                )}

                {hasSources && (
                    <>
                        <Text style={st.sourcesTitle}>EVIDENCE ({item.sources.length}) — tap a source to read</Text>
                        {item.sources.map((s, i) => (
                            <Pressable key={`${i}-${s.citation}`} style={st.srcRow}
                                onPress={() => setCiteIdx(i)}>
                                <Text style={st.srcSum} numberOfLines={1}>
                                    {s.citation} {s.source} — page {s.page}
                                </Text>
                            </Pressable>
                        ))}
                    </>
                )}

                <Pressable onPress={copy} hitSlop={6}>
                    <Text style={st.copyBtn}>{copied ? 'Copied ✓' : 'Copy answer'}</Text>
                </Pressable>
            </View>

            {/* Citation modal — full source text */}
            <Modal visible={citeIdx >= 0 && hasSources} transparent
                animationType="slide" onRequestClose={close}>
                <View style={st.mBackdrop}>
                    <View style={st.mSheet}>
                        <View style={st.mHandleRow}>
                            <Text style={st.mTitle} numberOfLines={1}>
                                {hasSources && item.sources[citeIdx]
                                    ? `${item.sources[citeIdx].citation} · ${item.sources[citeIdx].source}`
                                    : ''}
                            </Text>
                            <Pressable onPress={close} hitSlop={10}>
                                <Text style={st.mClose}>✕</Text>
                            </Pressable>
                        </View>
                        {hasSources && item.sources[citeIdx] && (
                            <ScrollView showsVerticalScrollIndicator>
                                <SourceDetail s={item.sources[citeIdx]} />
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
});

export default MessageItem;

const st = StyleSheet.create({
    userRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: S.pad, marginBottom: 10 },
    userBubble: {
        maxWidth: '85%', backgroundColor: C.userBubble, borderRadius: S.radius,
        borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10
    },
    userText: { color: C.userText, fontSize: 15, lineHeight: 22 },

    botRow: { paddingHorizontal: S.pad, marginBottom: 10 },
    botBubble: {
        maxWidth: '94%', backgroundColor: C.botBubble, borderRadius: S.radius,
        borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.border,
        paddingHorizontal: 14, paddingVertical: 10
    },
    botText: { color: C.text, fontSize: 15, lineHeight: 23, flex: 1 },
    bold: { fontWeight: '700', color: C.text },

    cite: {
        color: C.citeText, backgroundColor: C.citeBg, fontWeight: '700',
        overflow: 'hidden', borderRadius: 4, fontSize: 12
    },

    listBlock: { marginTop: 2, marginBottom: 6 },
    listRow: { flexDirection: 'row', paddingRight: 6, marginBottom: 3 },
    listMarker: { color: C.text, fontSize: 15, lineHeight: 23, width: 20 },

    intents: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    badge: {
        backgroundColor: C.badge, borderRadius: 999, paddingHorizontal: 9,
        paddingVertical: 3, borderWidth: 1, borderColor: '#bae6fd'
    },
    badgeText: { color: C.badgeText, fontSize: 11 },

    sourcesTitle: {
        fontSize: 10, fontWeight: '700', color: C.muted,
        letterSpacing: 0.8, marginTop: 10, marginBottom: 6
    },
    srcRow: {
        backgroundColor: '#f8fafc', borderWidth: 1, borderColor: C.border,
        borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 6
    },
    srcSum: { fontSize: 12.5, fontWeight: '600', color: '#0c4a6e' },

    copyBtn: { fontSize: 12, color: C.muted, marginTop: 8, fontWeight: '600' },

    errorBubble: {
        backgroundColor: C.errorBg, borderWidth: 1, borderColor: '#fecaca',
        borderRadius: S.radius, paddingHorizontal: 14, paddingVertical: 10
    },
    errorText: { color: C.error, fontSize: 14, lineHeight: 21 },

    /* modal */
    mBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,.5)', justifyContent: 'flex-end' },
    mSheet: {
        backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        maxHeight: '80%', padding: 16
    },
    mHandleRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10
    },
    mTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: C.text, marginRight: 8 },
    mClose: { fontSize: 18, color: C.muted, padding: 4 },
    srcCard: {
        backgroundColor: '#f8fafc', borderWidth: 1, borderColor: C.border,
        borderRadius: 10, padding: 12, marginBottom: 12
    },
    srcTitle: { fontSize: 13, fontWeight: '700', color: '#0c4a6e' },
    srcMeta: { fontSize: 11, color: C.muted, marginTop: 4 },
    srcBody: { fontSize: 13, color: '#334155', lineHeight: 20, marginTop: 8 },

    chips: {
        flexDirection: 'row', paddingTop: 8, gap: 8,
        alignItems: 'flex-start',
    },
    chip: {
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.4)', // similar to the previous one
        backgroundColor: '#f0f9ff',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        maxWidth: 320,
    },
    chipText: { fontSize: 12, color: '#0369a1' },
});