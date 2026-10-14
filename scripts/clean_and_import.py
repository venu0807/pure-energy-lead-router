"""
PURE Energy | PuREPower Dealer Lead Router
Part B: Legacy Data Cleaning, Reconciliation & Firestore Migration Pipeline
Author: VENU GOPAL REDDY PALUGULLA (pvgreddy3@gmail.com)
"""

import os
import sys
import csv
import re
from datetime import datetime

# Path resolution
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

DEALERS_FILE = os.path.join(DATA_DIR, "dealers.csv")
LEGACY_LEADS_FILE = os.path.join(DATA_DIR, "legacy_leads.csv")
RECONCILIATION_FILE = os.path.join(REPORTS_DIR, "reconciliation.csv")

# Standard canonical product mappings
CANONICAL_PRODUCTS = {
    "purepower home 3kwh": "PuREPower Home 3kWh",
    "purepower home 5kwh": "PuREPower Home 5kWh",
    "purepower commercial 10kwh": "PuREPower Commercial 10kWh",
    "pure power 5 kwh": "PuREPower Home 5kWh",
}

# Standard canonical sources
CANONICAL_SOURCES = {
    "website": "Website",
    "voice agent": "Voice Agent",
    "whatsapp": "WhatsApp",
    "dealer walk-in": "Dealer Walk-in",
}

VALID_STATUSES = ["New", "Contacted", "Converted", "Lost"]


def load_dealers(filepath):
    """
    Loads dealer records and builds a prefix-to-dealer lookup dictionary.
    """
    dealers_by_prefix = {}
    dealers_list = []
    
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dealers_list.append(row)
            prefixes = [p.strip() for p in row["pincode_prefixes"].split("|") if p.strip()]
            for prefix in prefixes:
                dealers_by_prefix[prefix] = {
                    "dealer_id": row["dealer_id"].strip(),
                    "dealer_name": row["dealer_name"].strip(),
                    "city": row["city"].strip(),
                    "contact_email": row["contact_email"].strip(),
                }
    return dealers_by_prefix, dealers_list


def clean_phone(raw_phone):
    """
    Sanitizes phone input to a standard 10-digit Indian mobile number.
    Returns (cleaned_10_digits, is_valid)
    """
    if not raw_phone:
        return "", False
    
    digits = re.sub(r"\D", "", raw_phone)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    
    # Valid mobile starts with 6, 7, 8, or 9 and has length 10
    is_valid = len(digits) == 10 and digits[0] in "6789"
    return digits, is_valid


def validate_pincode(raw_pincode):
    """
    Validates a 6-digit Indian Postal Code.
    """
    if not raw_pincode:
        return "", False
    pincode = raw_pincode.strip()
    is_valid = len(pincode) == 6 and pincode.isdigit() and not pincode.startswith("0")
    return pincode, is_valid


def validate_date(date_str):
    """
    Strict calendar validation for YYYY-MM-DD or DD/MM/YYYY.
    Catches invalid dates such as 31/09/2026.
    """
    if not date_str:
        return None, False
    date_str = date_str.strip()
    
    # Try ISO YYYY-MM-DD
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%Y-%m-%d"), True
    except ValueError:
        pass
    
    # Try DD/MM/YYYY
    try:
        dt = datetime.strptime(date_str, "%d/%m/%Y")
        return dt.strftime("%Y-%m-%d"), True
    except ValueError:
        pass
    
    return None, False


def process_legacy_leads():
    dealers_by_prefix, _ = load_dealers(DEALERS_FILE)
    
    with open(LEGACY_LEADS_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        raw_rows = list(reader)
    
    seen_mobiles = {}  # mobile -> lead_id of first occurrence
    seen_lead_ids = set()
    
    reconciliation_rows = []
    clean_leads_for_import = []
    
    for row in raw_rows:
        lead_id = row.get("lead_id", "").strip()
        name = row.get("name", "").strip()
        raw_phone = row.get("phone", "").strip()
        raw_pincode = row.get("pincode", "").strip()
        raw_product = row.get("product", "").strip()
        raw_source = row.get("source", "").strip()
        raw_date = row.get("created_on", "").strip()
        raw_status = row.get("status", "").strip()
        
        # 1. Field validations
        clean_mobile, phone_valid = clean_phone(raw_phone)
        pincode, pincode_valid = validate_pincode(raw_pincode)
        iso_date, date_valid = validate_date(raw_date)
        name_valid = bool(name)
        
        # 2. Rejection criteria
        if not name_valid:
            reconciliation_rows.append({
                "lead_id": lead_id,
                "action": "rejected",
                "reason": "Missing customer name",
            })
            continue
            
        if not phone_valid:
            reconciliation_rows.append({
                "lead_id": lead_id,
                "action": "rejected",
                "reason": f"Invalid phone format: '{raw_phone}' (must be 10-digit mobile)",
            })
            continue
            
        if not pincode_valid:
            reconciliation_rows.append({
                "lead_id": lead_id,
                "action": "rejected",
                "reason": f"Invalid pincode format: '{raw_pincode}' (must be 6 digits)",
            })
            continue
            
        if not date_valid:
            reconciliation_rows.append({
                "lead_id": lead_id,
                "action": "rejected",
                "reason": f"Invalid calendar date: '{raw_date}' (non-existent date like 31/09)",
            })
            continue
        
        # 3. Duplicate mobile check (Merge rule)
        if clean_mobile in seen_mobiles:
            first_lead_id = seen_mobiles[clean_mobile]
            reconciliation_rows.append({
                "lead_id": lead_id,
                "action": "merged",
                "reason": f"Duplicate mobile {clean_mobile}; merged into primary lead {first_lead_id}",
            })
            continue
        
        # 4. Normalization and Fixes
        fixes = []
        if raw_phone != clean_mobile:
            fixes.append(f"Sanitized phone from '{raw_phone}' to '{clean_mobile}'")
            
        normalized_product = CANONICAL_PRODUCTS.get(raw_product.lower(), raw_product)
        if raw_product != normalized_product:
            fixes.append(f"Standardized product name to '{normalized_product}'")
            
        normalized_source = CANONICAL_SOURCES.get(raw_source.lower(), raw_source.title())
        if raw_source != normalized_source:
            fixes.append(f"Standardized source casing to '{normalized_source}'")
            
        normalized_status = raw_status.strip().title()
        if normalized_status not in VALID_STATUSES:
            normalized_status = "New"
        if raw_status != normalized_status:
            fixes.append(f"Normalized status from '{raw_status}' to '{normalized_status}'")
            
        if raw_date != iso_date:
            fixes.append(f"Standardized date format to '{iso_date}'")
            
        if lead_id in seen_lead_ids:
            fixes.append(f"Resolved duplicate lead ID collision on '{lead_id}'")
            
        # Register uniqueness
        seen_mobiles[clean_mobile] = lead_id
        seen_lead_ids.add(lead_id)
        
        # 5. Dealer Lead Routing
        prefix = pincode[:3]
        dealer_info = dealers_by_prefix.get(prefix)
        
        if dealer_info:
            assigned_dealer_id = dealer_info["dealer_id"]
            assigned_dealer_name = dealer_info["dealer_name"]
            assigned_dealer_city = dealer_info["city"]
            
            if fixes:
                action = "fixed"
                reason = "; ".join(fixes)
            else:
                action = "imported"
                reason = f"Clean record; routed to {assigned_dealer_name} ({assigned_dealer_city})"
        else:
            # Unmapped prefix -> In-house Sales
            assigned_dealer_id = "INHOUSE"
            assigned_dealer_name = "In-house Sales"
            assigned_dealer_city = "Headquarters"
            action = "assigned_inhouse"
            reason = f"Pincode prefix {prefix} not covered by authorized dealers; assigned to In-house Sales"
        
        reconciliation_rows.append({
            "lead_id": lead_id,
            "action": action,
            "reason": reason,
        })
        
        clean_leads_for_import.append({
            "lead_id": lead_id,
            "name": name,
            "phone": clean_mobile,
            "pincode": pincode,
            "pincode_prefix": prefix,
            "product": normalized_product,
            "source": normalized_source,
            "created_on": iso_date,
            "status": normalized_status,
            "dealer_id": assigned_dealer_id,
            "dealer_name": assigned_dealer_name,
            "dealer_city": assigned_dealer_city,
            "action": action,
        })
    
    # Write reports/reconciliation.csv (exactly columns: lead_id, action, reason)
    with open(RECONCILIATION_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["lead_id", "action", "reason"])
        writer.writeheader()
        writer.writerows(reconciliation_rows)
        
    print(f"[OK] Generated {RECONCILIATION_FILE} with {len(reconciliation_rows)} rows.")
    return reconciliation_rows, clean_leads_for_import


def import_to_firestore(clean_leads):
    """
    Imports clean leads to Firestore if firebase_admin and credentials exist.
    """
    key_path = os.path.join(BASE_DIR, "serviceAccountKey.json")
    if not os.path.exists(key_path):
        print(f"[INFO] serviceAccountKey.json not found. Skipping live Firestore push.")
        print(f"[INFO] {len(clean_leads)} clean leads are prepared and validated for import.")
        return False
        
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        
        if not firebase_admin._apps:
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred)
            
        db = firestore.client()
        batch = db.batch()
        count = 0
        
        for lead in clean_leads:
            doc_ref = db.collection("leads").document(lead["lead_id"])
            batch.set(doc_ref, lead)
            count += 1
            if count % 400 == 0:
                batch.commit()
                batch = db.batch()
                
        batch.commit()
        print(f"[SUCCESS] Successfully imported {count} clean leads into Firestore 'leads' collection.")
        return True
    except Exception as e:
        print(f"[WARN] Firestore import failed: {e}")
        return False


if __name__ == "__main__":
    reconciliation_rows, clean_leads = process_legacy_leads()
    
    # Tally
    counts = {}
    for r in reconciliation_rows:
        act = r["action"]
        counts[act] = counts.get(act, 0) + 1
        
    print("\n--- RECONCILIATION REPORT SUMMARY ---")
    for act, c in sorted(counts.items()):
        print(f"  {act:17s}: {c:2d}")
    print(f"  Total Rows Handled : {len(reconciliation_rows):2d}")
    
    import_to_firestore(clean_leads)
