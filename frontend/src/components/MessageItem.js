import React, { useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, Platform } from 'react-native';
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
                <View style={[st.msgWrapper, { alignItems: 'flex-end' }]}>
                    <View style={st.userBubble}>
                        <Text style={st.userText} selectable>{item.text}</Text>
                    </View>
                    <View style={st.footerEnd}>
                        <Text style={st.footerText}>Sent</Text>
                    </View>
                </View>
            </View>
        );
    }

    if (item.role === 'error') {
        return (
            <View style={st.botRow}>
                <View style={[st.msgWrapper, { alignItems: 'flex-start' }]}>
                    <View style={st.headerStart}>
                        <Text style={st.headerName}>System</Text>
                        <View style={st.dot} />
                        <Text style={st.headerTime}>Error</Text>
                    </View>
                    <View style={st.errorBubble}>
                        <Text style={st.errorText} selectable>{item.text}</Text>
                    </View>
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
            <View style={[st.msgWrapper, { alignItems: 'flex-start' }]}>

                <View style={st.headerStart}>
                    <Text style={st.headerName}>PM-JAY Assistant</Text>
                </View>

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
                        <View style={{ marginTop: 12 }}>
                            <Text style={st.sourcesTitle}>EVIDENCE ({item.sources.length}) — tap a source to read</Text>
                            {item.sources.map((s, i) => (
                                <Pressable key={`${i}-${s.citation}`} style={st.srcRow}
                                    onPress={() => setCiteIdx(i)}>
                                    <Text style={st.srcSum} numberOfLines={1}>
                                        {s.citation} {s.source} — page {s.page}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    )}
                </View>

                <View style={st.footerStart}>
                    <Pressable onPress={copy} hitSlop={6} style={st.footerAction}>
                        <Text style={st.copyBtn}>{copied ? 'Copied ✓' : 'Copy'}</Text>
                    </Pressable>
                </View>
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
    userRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, marginBottom: 20 },
    msgWrapper: { maxWidth: Platform.OS === 'web' ? '70%' : '90%', alignItems: 'flex-start' },

    userBubble: {
        backgroundColor: '#1e293b', // related to background dark (slate-800)
        borderWidth: 1, borderColor: '#334155', // slate-700 border for separation
        borderRadius: 20, borderBottomRightRadius: 6,
        paddingHorizontal: 18, paddingVertical: 12,
        alignSelf: 'flex-end', // wraps content width
    },
    userText: { color: '#f8fafc', fontSize: 16, lineHeight: 24, fontWeight: '400' },

    botRow: { paddingHorizontal: 16, marginBottom: 24, alignItems: 'flex-start' },

    headerStart: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, paddingHorizontal: 4 },
    headerName: { fontSize: 13, fontWeight: '600', color: '#e2e8f0' },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1' },
    headerTime: { fontSize: 12, color: '#94a3b8' },

    footerStart: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingHorizontal: 4 },
    footerEnd: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingHorizontal: 4, alignSelf: 'flex-end' },
    footerText: { fontSize: 12, color: '#94a3b8' },
    footerAction: { flexDirection: 'row', alignItems: 'center' },

    botBubble: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 20, borderTopLeftRadius: 6,
        paddingHorizontal: 18, paddingVertical: 14,
        alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4,
        ...Platform.select({ web: { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } })
    },
    botText: { color: '#f8fafc', fontSize: 16, lineHeight: 26 },
    bold: { fontWeight: '700', color: '#ffffff' },

    cite: {
        color: '#38bdf8', backgroundColor: 'rgba(14, 165, 233, 0.2)', fontWeight: '700',
        overflow: 'hidden', borderRadius: 6, fontSize: 13, paddingHorizontal: 4, borderWidth: 1, borderColor: 'rgba(56, 189, 248, 0.3)'
    },

    listBlock: { marginTop: 4, marginBottom: 4 },
    listRow: { flexDirection: 'row', paddingRight: 8, marginBottom: 6 },
    listMarker: { color: '#f8fafc', fontSize: 16, lineHeight: 26, width: 22 },

    intents: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    badge: {
        backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 999, paddingHorizontal: 12,
        paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.25)',
        ...Platform.select({ web: { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } })
    },
    badgeText: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },

    sourcesTitle: {
        fontSize: 11, fontWeight: '800', color: '#94a3b8',
        letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase'
    },
    srcRow: {
        backgroundColor: 'rgba(0, 0, 0, 0.2)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 6
    },
    srcSum: { fontSize: 13, fontWeight: '600', color: '#cbd5e1' },

    copyBtn: { fontSize: 12, color: '#e2e8f0', fontWeight: '600' },

    errorBubble: {
        backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
        borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, borderTopLeftRadius: 6, alignSelf: 'flex-start'
    },
    errorText: { color: '#dc2626', fontSize: 15, lineHeight: 22 },

    /* modal */
    mBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,.6)', justifyContent: 'flex-end' },
    mSheet: {
        backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
        maxHeight: '85%', padding: 24
    },
    mHandleRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16
    },
    mTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#0f172a', marginRight: 12 },
    mClose: { fontSize: 20, color: '#64748b', padding: 4, fontWeight: '800' },
    srcCard: {
        backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
        borderRadius: 14, padding: 16, marginBottom: 16
    },
    srcTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
    srcMeta: { fontSize: 12, color: '#64748b', marginTop: 6 },
    srcBody: { fontSize: 15, color: '#334155', lineHeight: 24, marginTop: 12 },
});