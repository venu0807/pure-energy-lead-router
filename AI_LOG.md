# AI Usage Log & Engineering Audit

This document records the AI tooling, prompt strategies, and technical corrections applied during the development of the **PURE Energy Dealer Lead Router & MIS Platform**.

---

## 1. AI Tools Utilized
- **Antigravity AI Coding Assistant (Google Gemini 3.8 / Pro):** Used for end-to-end spec-driven architecture, file scaffolding, and automated regression test creation.
- **Anthropic Claude 3.5 Sonnet:** Used for designing and reviewing strict Firestore Security Rules and CSS design system polish.
- **OpenAI ChatGPT (GPT-4o):** Used for brainstorming dealer operational workflows and edge-case testing in data pipelines.

---

## 2. Top 3 Most Useful Prompts

### Prompt 1: Data Audit & Sanitization Logic
> *"Given 40 messy legacy lead records in India with phone numbers containing spaces ('98480 22 431'), international prefixes ('+91-9000012345'), invalid lengths ('12345'), and non-standard calendar dates like '31/09/2026', write a Python pipeline that enforces 10-digit mobile validation starting with 6-9, validates 6-digit pincodes, and classifies records into exactly 5 actions: `imported`, `fixed`, `merged`, `rejected`, `assigned_inhouse`."*
- **Why it was useful:** It provided the foundational skeleton for sanitizing phone digits while identifying which records should be repaired versus rejected.

### Prompt 2: Firestore Security Rules Schema Enforcement
> *"Generate production-grade Cloud Firestore security rules that allow public lead creation while strictly validating that `phone` matches 10 digits (`^[6-9][0-9]{9}$`), `pincode` matches 6 digits (`^[1-9][0-9]{5}$`), status belongs to `['New', 'Contacted', 'Converted', 'Lost']`, dealer collections are read-only, and document deletion is disabled."*
- **Why it was useful:** It ensured that client-side security is backed by server-level database invariants directly on Firebase.

### Prompt 3: Real-Time Dual-Mode Lead Router & Dashboard Architecture
> *"Design a zero-build-step vanilla JavaScript application for PURE Energy PuREPower. It must feature live pincode auto-assignment preview as the user types 3 digits, instant duplicate phone warnings against existing records, KPI summary cards, and an interactive lead table where status updates persist to Firestore with immediate fallback to localStorage for offline evaluation."*
- **Why it was useful:** It established the seamless dual-mode architecture that allows interviewers to run and test the app immediately without requiring live Firebase credentials, while remaining 100% production-ready for Firebase Hosting.

---

## 3. Where the AI Was Wrong & How It Was Corrected

### Incident 1: Hallucination of Invalid Calendar Date (`31/09/2026`)
- **The AI Error:** When writing the initial date validation regex `r'^\d{2}/\d{2}/\d{4}$'`, the AI accepted the date `31/09/2026` for lead `L1018`, attempting to format it into `2026-09-31` and marking the row as `fixed`.
- **The Reality:** September has only 30 days (`30 days hath September...`). `31/09/2026` is a non-existent calendar date and represents corrupted data.
- **The Fix:** We overrode the AI's regex with strict Python `datetime.strptime()` parsing. When parsing failed with `ValueError: day is out of range for month`, the pipeline correctly flagged `L1018` as `rejected` with the reason: `Invalid calendar date: '31/09/2026' (non-existent date like 31/09)`.

### Incident 2: Misclassifying Uncovered Pincodes as Rejections
- **The AI Error:** For lead `L1015` with pincode `110001` (Delhi prefix `110`), the AI initially proposed marking the row as `rejected` because prefix `110` did not exist in `dealers.csv`.
- **The Reality:** The brief explicitly states: *"Save to Firestore and auto-assign a dealer from the first 3 digits of the pincode. No match = 'In-house Sales'"*. Valid customer leads outside dealer areas are genuine business opportunities handled by central headquarters.
- **The Fix:** We corrected the pipeline state machine to route unmapped prefixes to `"In-house Sales"` and assigned the exact required status `assigned_inhouse`.
