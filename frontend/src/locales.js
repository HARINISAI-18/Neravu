import { getBaseUrl } from './api';

export const T = {
    en: {
        "copy": "Copy",
        "copied": "Copied!",
        "sources": "Sources Used",
        "cancel": "Cancel",
        "retrieving": "Retrieving evidence & generating...",
        "settings": "Settings",
        "hostIp": "Backend Host IP",
        "saveReload": "Save & connect",
        "timeout": "Answer timeout (seconds)",
        "quizHello": "Welcome to PM-JAY Helper",
        "quizLead": "Let's find the best healthcare schemes (PM-JAY, Rashtriya Arogya Nidhi, etc.) for you. Answer a few short questions to get started.",
        "readyPrefix": "Ready",
        "conn": "Connecting to backend...",
        "wait": "Waiting for backend...",
        "ask": "Ask anything...",
        "title": "PM-JAY Assistant",
        "desc": "All answers come only from the uploaded PM-JAY documents, with evidence.",
        "schemesBtn": "Schemes",
        "newBtn": "＋ New",
        "suggs": ["What is the pre-authorisation process for PM-JAY cancer?", "What documents are required?", "What is the claim settlement process?", "How do I file a grievance?"],
        "sent": "Sent",
        "skip": "Skip",
        "step": "Step",
        "question": "Question",
        "multiHint": "(select all that apply)",
        "optionsLabel": "Options:",
        "back": "Back",
        "next": "Next",
        "finish": "Find my schemes",
        "placeholder": "...or type your state/city",
        "hint": "Your answers are used only to match suitable schemes.",
        "headline": "Your scheme matches",
        "retake": "Edit answers",
        "chart": "Max coverage comparison",
        "chat": "Ask about these",
        "none": "No matching schemes found.",
        "eligible": "Likely eligible",
        "possibly": "Possibly eligible",
        "notEligible": "Not eligible",
        "amount": "Coverage limit",
        "more": "more",
        "details": "Details & documents",
        "hide": "Hide",
        "docs": "Documents required",
        "infoApply": "Info / Apply",
        "share": "Share",
        "skipQ": "Skip question"
    }
};

export const fetchLocale = async (lang) => {
    if (lang === 'en' || T[lang]) return;
    try {
        const res = await fetch(getBaseUrl() + `/api/locales?lang=${lang}`);
        const data = await res.json();
        T[lang] = data;
    } catch (e) {
        console.warn("fetchLocale failed for", lang, e);
    }
};
