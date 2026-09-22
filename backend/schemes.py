# -*- coding: utf-8 -*-
"""
Cancer-support scheme database + rule-based intake matching.

PRIMARY SOURCE: backend/schemes.xlsx with columns:
  "Name of the insurance" | "Eligibility" | "Cancer types covered" |
  "Benefit cover" | "Location/State covered" | "Link (to document/information)" |
  "Exceptions" | "Type (Central/State/NGO)"
If the file is missing/unreadable, SCHEMES_FALLBACK below is used (edit it
to match your sheet).
"""

import logging
import os
import re
from pathlib import Path
from typing import List, Optional

log = logging.getLogger("pmjay-schemes")

SCHEMES_FILE = Path(os.getenv("SCHEMES_FILE",
                              Path(__file__).parent / "schemes.xlsx"))

# ---------------------------------------------------------------- questions
STATES = ["Delhi", "Punjab", "Maharashtra", "West Bengal", "Uttar Pradesh",
          "Bihar", "Tamil Nadu", "Karnataka", "Telangana", "Andhra Pradesh",
          "Gujarat", "Rajasthan", "Madhya Pradesh", "Kerala", "Odisha",
          "Assam", "Jharkhand", "Chhattisgarh", "Haryana", "Other"]

INTAKE_QUESTIONS = [
    {"id": "q_relation", "step": 1, "stepName": "Patient profile",
     "q": "Is the patient you, your child, your parent, spouse, or someone else?",
     "options": ["Me", "Child", "Parent", "Spouse", "Other"]},
    {"id": "q_age", "step": 1, "stepName": "Patient profile",
     "q": "What is the patient's age?",
     "options": ["Under 18", "18–69", "70+"]},
    {"id": "q_gender", "step": 1, "stepName": "Patient profile", "optional": True,
     "q": "What is the patient's gender?",
     "options": ["Male", "Female", "Other / Prefer not to say"]},
    {"id": "q_citizen", "step": 1, "stepName": "Patient profile",
     "q": "Is the patient an Indian citizen?",
     "options": ["Yes", "No"]},

    {"id": "q_diagnosed", "step": 2, "stepName": "Cancer / treatment situation",
     "q": "Has the patient already been diagnosed with cancer?",
     "options": ["Yes, diagnosed", "Suspected / diagnosis pending",
                 "No, looking for screening"]},
    {"id": "q_cancer_type", "step": 2, "stepName": "Cancer / treatment situation",
     "q": "What type of cancer has been diagnosed?",
     "options": ["Blood cancer", "Breast cancer", "Cervical cancer",
                 "Oral cancer", "Brain/spinal", "Bone/soft tissue",
                 "Pediatric cancer", "Other", "Don't know"]},
    {"id": "q_stage", "step": 2, "stepName": "Cancer / treatment situation",
     "optional": True,
     "q": "What stage is the cancer?",
     "options": ["Early/localized", "Advanced/metastatic", "Don't know"]},
    {"id": "q_treatment", "step": 2, "stepName": "Cancer / treatment situation",
     "multi": True,
     "q": "What treatment is needed or currently being received?",
     "options": ["Surgery", "Chemotherapy", "Radiation",
                 "Bone marrow transplant", "Diagnostic tests/scans",
                 "Palliative/supportive care", "Multiple treatments",
                 "Don't know"]},
    {"id": "q_treatment_status", "step": 2, "stepName": "Cancer / treatment situation",
     "q": "Has treatment already started?",
     "options": ["Not started", "Started", "Completed",
                 "Emergency treatment needed"]},

    {"id": "q_income", "step": 3, "stepName": "Financial eligibility",
     "q": "What is the approximate annual family income?",
     "options": ["Below ₹1.25 lakh", "₹1.25–2 lakh", "₹2–3 lakh",
                 "₹3–4 lakh", "Above ₹4 lakh", "Prefer not to say"]},
    {"id": "q_afford", "step": 3, "stepName": "Financial eligibility",
     "q": "Can your family afford the current treatment costs?",
     "options": ["Yes", "Partially",
                 "No, we need financial assistance urgently"]},
    {"id": "q_insurance", "step": 3, "stepName": "Financial eligibility",
     "multi": True,
     "q": "Do you currently have health insurance or another government health scheme?",
     "options": ["PM-JAY/Ayushman Bharat", "Private health insurance",
                 "CGHS/DGEHS/other government coverage", "No insurance",
                 "Don't know"]},

    {"id": "q_hospital_type", "step": 4, "stepName": "Hospital information",
     "q": "Where is the patient currently receiving treatment?",
     "options": ["Government hospital", "Private hospital",
                 "Charitable/NGO hospital", "Not yet decided"]},
    {"id": "q_empanelled", "step": 4, "stepName": "Hospital information",
     "optional": True,
     "q": "Is the hospital empanelled under any government/NGO scheme?",
     "options": ["Yes", "No", "Don't know"]},
    {"id": "q_ward", "step": 4, "stepName": "Hospital information",
     "q": "Is the patient admitted in a general ward or private/special ward?",
     "options": ["General ward", "Private/special ward",
                 "Not applicable", "Don't know"]},

    {"id": "q_home_state", "step": 5, "stepName": "Location", "freeText": True,
     "q": "Which state/UT does the patient currently live in?", "options": STATES},
    {"id": "q_treatment_state", "step": 5, "stepName": "Location", "freeText": True,
     "q": "Which state/city is the treatment being taken in?", "options": STATES},

    {"id": "q_child", "step": 6, "stepName": "Special circumstances",
     "q": "Is the patient a child or adolescent under 20?",
     "options": ["Yes", "No"]},
    {"id": "q_support", "step": 6, "stepName": "Special circumstances",
     "multi": True,
     "q": "Does the family need support beyond treatment costs?",
     "options": ["Treatment funding", "Accommodation near hospital",
                 "Food/nutrition", "Transportation",
                 "Psychological/caregiver support", "Rehabilitation",
                 "Second medical opinion", "Multiple types of support"]},
    {"id": "q_screening", "step": 6, "stepName": "Special circumstances",
     "q": "Are you looking for help with diagnosis/screening rather than treatment funding?",
     "options": ["Yes", "No"]},
    {"id": "q_paid_self", "step": 6, "stepName": "Special circumstances",
     "optional": True,
     "q": "Have you already paid any treatment expenses yourself?",
     "options": ["Yes", "No"]},
    {"id": "q_urgent", "step": 6, "stepName": "Special circumstances",
     "q": "Do you need assistance immediately for ongoing/emergency treatment?",
     "options": ["Yes", "No"]},
]

# ---------------------------------------------------------------- parsing
_INCOME_RE = re.compile(r"(?:₹|rs\.?\s*)?\s*(\d+(?:\.\d+)?)\s*lakh", re.I)
_INCOME_CTX = re.compile(r"income|annum|earning", re.I)
_STATE_ALIAS = {
    "delhi": "Delhi", "new delhi": "Delhi", "ncr": "Delhi",
    "punjab": "Punjab",
    "maharashtra": "Maharashtra", "mumbai": "Maharashtra", "pune": "Maharashtra",
    "west bengal": "West Bengal", "kolkata": "West Bengal",
}
_PAN_INDIA = re.compile(r"pan[- ]india|all states|nationwide|across india|"
                        r"all over india|all india", re.I)
_CANCER_KEY = {
    "blood": re.compile(r"leukemia|leukaemia|lymphoma|blood cancer|bone marrow", re.I),
    "breast": re.compile(r"breast", re.I),
    "cervical": re.compile(r"cervical", re.I),
    "oral": re.compile(r"oral", re.I),
    "brain": re.compile(r"brain|spinal", re.I),
    "bone": re.compile(r"bone|soft tissue|sarcoma", re.I),
    "pediatric": re.compile(r"pediatric|paediatric|childhood|children", re.I),
}
_USER_CANCER = {"Blood cancer": "blood", "Breast cancer": "breast",
                "Cervical cancer": "cervical", "Oral cancer": "oral",
                "Brain/spinal": "brain", "Bone/soft tissue": "bone",
                "Pediatric cancer": "pediatric"}
_SUPPORT_KEY = {
    "funding": re.compile(r"treatment (fund|cost|expense)|financial|reimbursement|defray|funding", re.I),
    "accommodation": re.compile(r"accommodation|lodging|place to stay", re.I),
    "food": re.compile(r"food|nutrition", re.I),
    "transport": re.compile(r"transport|travel", re.I),
    "psychological": re.compile(r"psycholog|counsell?ing|caregiver", re.I),
    "rehabilitation": re.compile(r"rehabilitation", re.I),
    "second_opinion": re.compile(r"second opinion", re.I),
}

def _income_cap(text: str) -> Optional[float]:
    """Largest ₹-lakh figure mentioned in an income/annum context."""
    if not text:
        return None
    caps = []
    for sent in re.split(r"[.;\n]", text):
        if _INCOME_CTX.search(sent) and "lakh" in sent.lower():
            for m in _INCOME_RE.finditer(sent):
                caps.append(float(m.group(1)))
    return max(caps) if caps else None

def _states(text: str):
    if not text:
        return None
    if _PAN_INDIA.search(text):
        return "ALL"
    found = set()
    low = text.lower()
    for alias, st in _STATE_ALIAS.items():
        if alias in low:
            found.add(st)
    return sorted(found) if found else None

def _age_cap(text: str) -> Optional[int]:
    if not text:
        return None
    if re.search(r"pediatric|paediatric|childhood|children", text, re.I):
        return 20
    m = re.search(r"under\s*(\d{1,2})|below\s*(\d{1,2})\s*years", text, re.I)
    if m:
        return int(m.group(1) or m.group(2))
    return None

def _cancer_keys(text: str):
    if not text:
        return "ALL"
    if re.search(r"all major|all types|life-threatening|all cancer", text, re.I):
        return "ALL"
    keys = [k for k, rx in _CANCER_KEY.items() if rx.search(text)]
    return keys or "ALL"

def _support_keys(text: str):
    return [k for k, rx in _SUPPORT_KEY.items() if rx.search(text or "")]

def _parse_scheme(row: dict) -> dict:
    elig = row.get("eligibility") or ""
    exc = row.get("exceptions") or ""
    combined = f"{elig} {exc}"
    return {
        "name": row.get("name") or "Unnamed scheme",
        "type": row.get("type") or "",
        "eligibility": elig, "exceptions": exc,
        "cancer_text": row.get("cancer") or "",
        "benefit": row.get("benefit") or "",
        "location_text": row.get("location") or "",
        "link": row.get("link") or "",
        "income_max": _income_cap(combined),
        "states": _states(f"{row.get('location') or ''} {elig}"),
        "age_max": _age_cap(f"{row.get('cancer') or ''} {elig}"),
        "ward_general": bool(re.search(r"general ward", combined, re.I)
                             and re.search(r"private|ineligib|not eligible", combined, re.I)),
        "gov_hospital": bool(re.search(r"government hospital|regional cancer centre|rcc|"
                                       r"state cancer institute|tertiary care cancer", combined, re.I)),
        "excl_pmjay": bool(re.search(r"covered under pm[- ]?jay|pm[- ]?jay.{0,40}ineligib|"
                                     r"ineligib.{0,60}pm[- ]?jay", combined, re.I)),
        "cancer": _cancer_keys(f"{row.get('cancer') or ''} {elig}"),
        "support": _support_keys(f"{row.get('benefit') or ''} {elig}"),
        "screening_ok": bool(re.search(r"screening|early detection", combined, re.I)),
    }

# ---------------------------------------------------------------- loader
_COL_ALIASES = {
    "name": ["nameoftheinsurance", "name", "scheme", "schemename"],
    "eligibility": ["eligibility"],
    "cancer": ["cancertypescovered", "cancertype", "cancertypes", "cancer"],
    "benefit": ["benefitcover", "benefit", "benefits"],
    "location": ["locationstatecovered", "location", "state", "states"],
    "link": ["link", "linktodocumentinformation", "url", "website"],
    "exceptions": ["exceptions", "exception"],
    "type": ["typecentralstatengo", "type", "schemetype"],
}

def _norm(s):
    return re.sub(r"[^a-z]", "", str(s or "").lower())

def _map_columns(df):
    out = {}
    for col in df.columns:
        n = _norm(col)
        for key, aliases in _COL_ALIASES.items():
            if key not in out and any(n == a or a in n for a in aliases):
                out[key] = col
                break
    return out

def load_schemes() -> List[dict]:
    if SCHEMES_FILE.exists():
        try:
            import pandas as pd
            df = pd.read_excel(SCHEMES_FILE).fillna("")
            cols = _map_columns(df)
            log.info("schemes.xlsx columns mapped: %s", cols)
            schemes = []
            for _, row in df.iterrows():
                r = {k: str(row[c]).strip() for k, c in cols.items() if c in df.columns}
                if not r.get("name"):
                    continue
                schemes.append(_parse_scheme(r))
            if schemes:
                log.info("Loaded %d schemes from %s", len(schemes), SCHEMES_FILE.name)
                return schemes
            log.warning("schemes.xlsx had no usable rows — using fallback data.")
        except Exception as e:
            log.error("Failed to read schemes.xlsx (%s) — using fallback data.", e)
    else:
        log.warning("schemes.xlsx not found at %s — using fallback data.", SCHEMES_FILE)
    return [_parse_scheme(r) for r in SCHEMES_FALLBACK]

# Fallback (best-effort from your sheet — replace by placing schemes.xlsx
# next to app.py; verify parsing via GET /api/schemes)
SCHEMES_FALLBACK = [
    {"name": "Jan Arogya Yojana (PMJAY)", "type": "Central scheme",
     "eligibility": "Low-income/deprivation-based families (SECC criteria); no income certificate needed.",
     "cancer": "Covers all major life-threatening cancers — medical, surgical, radiation oncology packages.",
     "benefit": "Cover up to ₹5 lakh per family per year for secondary and tertiary inpatient hospitalisation.",
     "location": "Pan-India, empanelled hospitals nationwide.",
     "link": "https://pmjay.gov.in",
     "exceptions": "Government employees and dependents with government employment coverage are ineligible."},
    {"name": "Fund (HMDG)", "type": "Central scheme",
     "eligibility": "Patients who cannot afford medical care and lack adequate support from insurance; treatment conducted at a government hospital.",
     "cancer": "All major life-threatening diseases including cancer.",
     "benefit": "One-time grant towards treatment costs (partial, not complete coverage).",
     "location": "Government hospitals across India.", "link": "",
     "exceptions": "Reimbursable government employees are not eligible."},
    {"name": "Fund (HMCPF) of Rashtriya Arogya Nidhi", "type": "Central scheme — Ministry of Health & Family Welfare",
     "eligibility": "BPL cancer patients treated at a Regional Cancer Centre (RCC), State Cancer Institute, or government hospital; income below the notified per-annum ceiling, verified via income certificate.",
     "cancer": "All cancer types requiring oncology intervention.",
     "benefit": "Financial assistance up to a maximum ceiling of ₹15 lakh for severe cases; funds disbursed directly to the hospital.",
     "location": "RCCs / SCIs / Tertiary Care Cancer Centres across India.", "link": "",
     "exceptions": ""},
    {"name": "Delhi Arogya Kosh", "type": "State scheme (Government of NCT of Delhi)",
     "eligibility": "Delhi residents with annual family income not exceeding ₹3 lakh per annum; income verified via an SDM-issued Income Certificate; treatment at a government hospital (RCC/State Cancer Institute).",
     "cancer": "All major cancers.",
     "benefit": "Financial assistance for treatment at government institutions.",
     "location": "Delhi (NCT).",
     "link": "https://m4wi.squarespace.com/blogs/dak",
     "exceptions": "Patients are ineligible if covered under PM-JAY (in Delhi); families earning over ₹3 lakh/year are ineligible."},
    {"name": "Indian Cancer Society (ICS) — Treatment Fund", "type": "NGO",
     "eligibility": "Patients who cannot afford treatment; treatment received at designated ICS-empanelled hospitals; general ward required (private/special wards ineligible).",
     "cancer": "Screening and early detection for oral, breast, and cervical cancers; treatment support for major cancers.",
     "benefit": "Helps defray hospitalization and treatment costs at empanelled hospitals.",
     "location": "Operational branches in Mumbai, New Delhi, and Pune.", "link": "",
     "exceptions": "Private/special ward patients are ineligible (must be general ward)."},
    {"name": "CanKids", "type": "NGO",
     "eligibility": "Children and adolescents with cancer (pediatric oncology; typically under 20 years).",
     "cancer": "Pediatric cancers including leukemia, Hodgkin's and Non-Hodgkin's lymphomas, and solid tumors.",
     "benefit": "Holistic care framework: treatment funding, pediatric palliative care centers, accommodation, nutrition, psychological support.",
     "location": "Delhi NCR and Kolkata operational branches; 60 cities across 22 states in India.", "link": "",
     "exceptions": ""},
    {"name": "Tata Trusts", "type": "NGO (philanthropic institution)",
     "eligibility": "Patients seeking cancer care support, medical report reviews, or second opinions; apply by submitting an official application form directly or through linked hospitals.",
     "cancer": "All major cancer types.",
     "benefit": "Treatment financial support, medical guidance, AI-enabled second opinions through the Navya portal, post-treatment support.",
     "location": "Pan-India through its network and grant programs.", "link": "",
     "exceptions": "Not a government scheme."},
    {"name": "Cancer Patients Aid Association (CPAA)", "type": "NGO",
     "eligibility": "Patients who cannot afford treatment; income not exceeding ₹4 lakh per annum.",
     "cancer": "All cancer types.",
     "benefit": "Treatment funding and patient aid.",
     "location": "Mumbai, New Delhi, and Pune.", "link": "",
     "exceptions": ""},
    {"name": "YouWeCan Foundation (Cure Fund)", "type": "NGO",
     "eligibility": "Patients who cannot afford cancer treatment; apply via official application form.",
     "cancer": "All major cancer types.",
     "benefit": "Support for surgery, chemotherapy, radiation therapy, and supportive care; up to ₹8 lakh for bone marrow transplant.",
     "location": "Across India.", "link": "",
     "exceptions": "Private insurance policies frequently exclude pre-existing conditions."},
]

# ---------------------------------------------------------------- matching
def _income_max_from_option(opt: str) -> Optional[float]:
    if "Prefer" in opt:
        return None
    if opt.startswith("Below"):
        return 1.25
    if "Above" in opt:
        return 99.0
    nums = re.findall(r"(\d+(?:\.\d+)?)", opt)
    return float(nums[-1]) if nums else None

def _norm_state(s: str) -> str:
    low = (s or "").lower()
    for alias, st in _STATE_ALIAS.items():
        if alias in low:
            return st
    for st in STATES:
        if st.lower() in low:
            return st
    return (s or "").strip().title() or "Unknown"

def _opt1(answers, qid):
    v = answers.get(qid)
    return v[0] if isinstance(v, list) and v else v

def _optlist(answers, qid):
    v = answers.get(qid) or []
    return v if isinstance(v, list) else [v] if v else []

def build_profile(answers: dict) -> dict:
    income_opt = _opt1(answers, "q_income") or ""
    insurance = _optlist(answers, "q_insurance")
    cancer = _opt1(answers, "q_cancer_type") or ""
    support = _optlist(answers, "q_support")
    return {
        "relation": _opt1(answers, "q_relation"),
        "age": _opt1(answers, "q_age"),
        "citizen": _opt1(answers, "q_citizen") != "No",
        "diagnosed": _opt1(answers, "q_diagnosed"),
        "cancer": cancer,
        "cancer_key": _USER_CANCER.get(cancer),
        "stage": _opt1(answers, "q_stage"),
        "treatment": _optlist(answers, "q_treatment"),
        "treatment_status": _opt1(answers, "q_treatment_status"),
        "income_opt": income_opt,
        "income_max": _income_max_from_option(income_opt),
        "afford": _opt1(answers, "q_afford"),
        "insurance": insurance,
        "has_pmjay": any("PM-JAY" in i or "Ayushman" in i for i in insurance),
        "no_insurance": "No insurance" in insurance,
        "hospital": _opt1(answers, "q_hospital_type"),
        "empanelled": _opt1(answers, "q_empanelled"),
        "ward": _opt1(answers, "q_ward"),
        "home_state": _norm_state(_opt1(answers, "q_home_state") or ""),
        "treat_state": _norm_state(_opt1(answers, "q_treatment_state") or ""),
        "is_child": (_opt1(answers, "q_age") == "Under 18"
                     or _opt1(answers, "q_child") == "Yes"
                     or cancer == "Pediatric cancer"),
        "support": support,
        "screening": _opt1(answers, "q_screening") == "Yes",
        "urgent": (_opt1(answers, "q_urgent") == "Yes"
                   or _opt1(answers, "q_treatment_status") == "Emergency treatment needed"),
    }

def _match_one(s: dict, p: dict):
    reasons, soft, blockers = [], [], []

    if not p["citizen"]:
        blockers.append("Requires Indian citizenship")

    if s["income_max"] is not None and p["income_max"] is not None:
        if p["income_max"] <= s["income_max"]:
            reasons.append(f"Family income within the ₹{s['income_max']:g} lakh limit")
        else:
            blockers.append(f"Family income above the ₹{s['income_max']:g} lakh cap for this scheme")

    if s["states"] and p["treat_state"] and p["treat_state"] != "Unknown":
        if s["states"] == "ALL":
            soft.append("Available pan-India")
        elif p["treat_state"] in s["states"] or p["home_state"] in s["states"]:
            reasons.append(f"Available in your location ({', '.join(s['states'])})")
        else:
            blockers.append(f"Covered locations: {', '.join(s['states'])} — you selected {p['treat_state']}")

    if s["age_max"] is not None and not p["is_child"]:
        blockers.append(f"Only for children/pediatric patients (under {s['age_max']})")

    if p["cancer_key"] and s["cancer"] != "ALL":
        if p["cancer_key"] in s["cancer"]:
            reasons.append(f"Covers {p['cancer']} cancer")
        else:
            blockers.append(f"Does not specifically cover {p['cancer']} cancer (covers: {', '.join(s['cancer'])})")

    if s["ward_general"] and p["ward"] == "Private/special ward":
        blockers.append("Requires treatment in a general ward (private/special ward patients excluded)")

    if s["gov_hospital"] and p["hospital"] == "Private hospital":
        blockers.append("Treatment must be at a government hospital / RCC / State Cancer Institute")

    if s["excl_pmjay"] and p["has_pmjay"]:
        blockers.append("Not available if the patient is already covered under PM-JAY")

    matched_support = [x for x in p["support"] if x != "Multiple types of support"
                       and any(k in x.lower() or
                               (x.startswith("Treatment") and k == "funding") or
                               (x.startswith("Accommodation") and k == "accommodation") or
                               (x.startswith("Food") and k == "food") or
                               (x.startswith("Transport") and k == "transport") or
                               (x.startswith("Psychological") and k == "psychological") or
                               (x.startswith("Second") and k == "second_opinion")
                               for k in s["support"])]
    if matched_support:
        reasons.append(f"Supports your needs: {', '.join(matched_support)}")

    if p["screening"] and s["screening_ok"]:
        reasons.append("Provides screening / early-detection support")

    if p["urgent"] and "funding" in s["support"]:
        soft.append("Provides treatment funding — contact them urgently about timelines")

    if p["no_insurance"] and "funding" in s["support"]:
        soft.append("Relevant since you currently have no insurance coverage")

    if not blockers and p["income_max"] is not None and s["income_max"] is None:
        soft.append("No fixed income cap found in the scheme text — verify their current criteria")

    return reasons, soft, blockers

def match_schemes(answers: dict, schemes: List[dict]):
    p = build_profile(answers)
    rows = []
    for s in schemes:
        reasons, soft, blockers = _match_one(s, p)
        if blockers:
            status, rank = "⛔ Not eligible", 2
        elif len(reasons) >= 2:
            status, rank = "✅ Likely eligible", 0
        else:
            status, rank = "❓ Possibly eligible — check criteria", 1
        rows.append({"name": s["name"], "type": s["type"], "status": status,
                     "rank": rank, "reasons": reasons, "soft": soft,
                     "blockers": blockers, "benefit": s["benefit"], "link": s["link"]})

    rows.sort(key=lambda r: (r["rank"], -len(r["reasons"])))

    lines = ["Based on your answers, here is the indicative list of cancer support schemes:",
             ""]
    for i, r in enumerate(rows, 1):
        lines.append(f"**{i}. {r['name']}** {r['status']}")
        if r["type"]:
            lines.append(f"- Type: {r['type']}")
        if r["reasons"]:
            lines.append(f"- Why it matches: {'; '.join(r['reasons'])}")
        if r["soft"]:
            lines.append(f"- Also note: {'; '.join(r['soft'])}")
        if r["blockers"]:
            lines.append(f"- Not eligible because: {'; '.join(r['blockers'])}")
        if r["benefit"]:
            snippet = re.sub(r"\s+", " ", r["benefit"])[:220]
            lines.append(f"- Benefits: {snippet}{'…' if len(r['benefit']) > 220 else ''}")
        if r["link"]:
            lines.append(f"- Info/Apply: {r['link']}")
        lines.append("")

    n_ok = sum(1 for r in rows if r["rank"] == 0)
    lines.append(f"**Summary:** {n_ok} likely eligible, "
                 f"{sum(1 for r in rows if r['rank'] == 1)} to verify, "
                 f"{sum(1 for r in rows if r['rank'] == 2)} not eligible based on your answers.")
    lines.append("")
    lines.append("⚠️ This list is indicative, generated by matching your answers against the "
                 "scheme database. Eligibility rules change — always verify with the official "
                 "scheme link or the hospital's social welfare office before applying.")

    profile_summary = (
        f"Patient profile from intake: relation={p['relation']}; age={p['age']}; "
        f"cancer={p['cancer'] or 'unspecified'}; treatment={', '.join(p['treatment']) or 'unspecified'} "
        f"({p['treatment_status']}); income={p['income_opt']}; insurance={', '.join(p['insurance']) or 'none'}; "
        f"hospital={p['hospital']} ({p['ward']}); home state={p['home_state']}; "
        f"treatment state={p['treat_state']}; child={p['is_child']}; "
        f"needs={', '.join(p['support']) or 'unspecified'}; screening={p['screening']}; urgent={p['urgent']}.")

    return "\n".join(lines), rows, profile_summary, p