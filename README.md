Kandi

# PuREPower Dealer Lead Router & MIS Platform

Production-ready Dealer Lead Router, Data Reconciliation Engine, and MIS Dashboard built for **PURE Energy** (PuREPower Energy Storage Division).

---

## 1. Quick Start & Execution Guide

### Running the Web Application (Part A)

#### Option 1: Instant Local Run (Zero Configuration Required)
The web application is built with vanilla HTML5, CSS3, and modern JavaScript, featuring a built-in pre-loaded data store containing all 31 verified clean legacy leads.

To run locally on Windows:
```powershell
# Navigate to the project root
cd C:\Proposals\pure-energy-lead-router

# Start a lightweight HTTP server
python -m http.server 8080 --directory public
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

#### Option 2: Deploy to Firebase Hosting & Firestore
1. Install Firebase CLI (if not already installed):
   ```powershell
   npm install -g firebase-tools
   firebase login
   ```
2. Initialize and deploy to your Firebase project:
   ```powershell
   # Deploy Firestore rules and static hosting
   firebase deploy
   ```
3. In the live web app, click **⚙️ Settings** in the top right header to paste your Firebase web config JSON, or configure `public/app.js` with your Firebase project credentials.

---

### Running the Data Cleaning & Reconciliation Pipeline (Part B)

The Python pipeline processes `data/legacy_leads.csv` against `data/dealers.csv`, normalizes all valid records, and generates `reports/reconciliation.csv` with exactly 40 rows.

```powershell
# Run the pipeline
python scripts/clean_and_import.py

# Run the automated unit & regression test suite
python scripts/test_reconciliation.py
```

To automatically push cleaned records directly to Firestore, place your Firebase service account key in the project root as `serviceAccountKey.json`:
```powershell
pip install firebase-admin
python scripts/clean_and_import.py
```

---

## 2. Key Architecture & Business Assumptions

1. **Lead Routing Invariant:**
   - Every lead's 6-digit pincode is inspected for its first 3 digits (`pincode_prefix`).
   - If the prefix matches any authorized dealer in `dealers.csv`, the lead is assigned to that dealer.
   - If the prefix does not match any dealer (e.g. `110` for Delhi), it is assigned to **In-house Sales** (`assigned_inhouse`), ensuring zero customer leads are discarded.

2. **Mobile Number Deduplication:**
   - Mobile numbers are the canonical unique customer identifier in Indian retail telecom.
   - Cleaned to 10 digits (`^[6-9]\d{9}$`). All leading `+91`, `91`, `0`, dashes, and whitespaces are stripped.
   - Duplicate mobiles within legacy data are categorized as `merged` (the first occurrence is retained as primary). In the web app, duplicate entries are blocked with real-time feedback.

3. **Strict Calendar Validation:**
   - Date formats are converted to ISO 8601 (`YYYY-MM-DD`).
   - Non-existent dates (such as `31/09/2026`) are rejected as unrecoverable corrupted data.

4. **Product & Source Normalization:**
   - Product variants like `"Pure power 5 kwh"` are canonically normalized to `"PuREPower Home 5kWh"`.
   - Source channels like `"website"` are standardized to `"Website"`.

---

## 3. Data Problems Discovered in `legacy_leads.csv`

Our automated audit identified data defects across **15 out of the 40 rows** (37.5% defect rate):

| Category | Affected Leads | Issue Description | Pipeline Remediation / Action |
| :--- | :--- | :--- | :--- |
| **Phone Formatting** | `L1004`, `L1006` | Spaces (`98480 22 431`) and country code prefix (`+91-9000012345`) | **fixed**: Stripped non-digits and standardized to clean 10-digit format. |
| **Invalid Phone Length** | `L1009` | Short 5-digit number (`12345`) | **rejected**: Fails Indian telecom 10-digit mobile requirement. |
| **Invalid Pincode** | `L1012` | 4-digit code (`5000`) | **rejected**: Incomplete postal code; impossible to resolve 3-digit prefix. |
| **Unserviced Region** | `L1015` | Delhi pincode (`110001`, prefix `110`) | **assigned_inhouse**: Valid customer lead outside dealer network routed to central HQ. |
| **Corrupted Date** | `L1018` | `31/09/2026` | **rejected**: September has only 30 days; represents corrupted system timestamp. |
| **Whitespace in Status** | `L1020` | Trailing space (`'converted '`) | **fixed**: Trimmed whitespace and capitalized to `'Converted'`. |
| **Product Casing** | `L1023` | `"Pure power 5 kwh"` | **fixed**: Canonicalized to official brand name `"PuREPower Home 5kWh"`. |
| **Missing Customer Name** | `L1026` | Empty name field (`''`) | **rejected**: Mandatory KYC/customer entity missing. |
| **Source Casing** | `L1028` | Lowercase source (`"website"`) | **fixed**: Standardized to `"Website"`. |
| **Duplicate Mobile** | `L1036`, `L1037`, `L1038`, `L1039` | Same customer mobile numbers repeated | **merged**: Merged into original leads `L1003`, `L1010`, `L1031`, and `L1007`. |
| **Duplicate ID & Phone** | Row 40 (`L1033`) | Lead ID collision on `L1033` + mobile `9663925448` | **merged**: Duplicate mobile merged into primary lead `L1013`. |

### Final Reconciliation Summary:
- **`imported`**: 25 records (Clean valid records routed to regional dealers)
- **`fixed`**: 5 records (Sanitized phone numbers, casing, and whitespace)
- **`merged`**: 5 records (Duplicate customer mobile numbers deduplicated)
- **`rejected`**: 4 records (Unrecoverable phone, pincode, date, or missing name)
- **`assigned_inhouse`**: 1 record (Delhi territory routed to In-house Sales)
- **Total Rows Reconciled**: **40 records (100%)**
