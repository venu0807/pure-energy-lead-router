"""
Unit and Regression Tests for Reconciliation Pipeline
PURE Energy MIS Assignment
"""

import os
import csv
import unittest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECONCILIATION_FILE = os.path.join(BASE_DIR, "reports", "reconciliation.csv")
LEGACY_LEADS_FILE = os.path.join(BASE_DIR, "data", "legacy_leads.csv")

VALID_ACTIONS = {"imported", "fixed", "merged", "rejected", "assigned_inhouse"}


class TestReconciliation(unittest.TestCase):
    def setUp(self):
        self.assertTrue(os.path.exists(RECONCILIATION_FILE), "reconciliation.csv must exist")
        with open(RECONCILIATION_FILE, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            self.fieldnames = reader.fieldnames
            self.rows = list(reader)

        with open(LEGACY_LEADS_FILE, "r", encoding="utf-8") as f:
            raw_reader = csv.DictReader(f)
            self.raw_rows = list(raw_reader)

    def test_reconciliation_exact_columns(self):
        expected_columns = ["lead_id", "action", "reason"]
        self.assertEqual(self.fieldnames, expected_columns, f"Columns must be strictly {expected_columns}")

    def test_reconciliation_row_count(self):
        self.assertEqual(len(self.rows), len(self.raw_rows), "Reconciliation must have exactly 1 row per legacy row")
        self.assertEqual(len(self.rows), 40, "Legacy leads must contain exactly 40 records")

    def test_action_domain_values(self):
        for idx, row in enumerate(self.rows):
            action = row.get("action")
            self.assertIn(action, VALID_ACTIONS, f"Row {idx+1} has invalid action '{action}'")

    def test_specific_edge_cases(self):
        by_id = {}
        for r in self.rows:
            by_id.setdefault(r["lead_id"], []).append(r)

        # L1009 had invalid phone '12345'
        self.assertEqual(by_id["L1009"][0]["action"], "rejected")
        
        # L1012 had invalid pincode '5000'
        self.assertEqual(by_id["L1012"][0]["action"], "rejected")
        
        # L1015 had Delhi pincode '110001'
        self.assertEqual(by_id["L1015"][0]["action"], "assigned_inhouse")
        
        # L1018 had invalid calendar date '31/09/2026'
        self.assertEqual(by_id["L1018"][0]["action"], "rejected")
        
        # L1026 had empty name
        self.assertEqual(by_id["L1026"][0]["action"], "rejected")
        
        # L1036 was duplicate phone of L1003
        self.assertEqual(by_id["L1036"][0]["action"], "merged")


if __name__ == "__main__":
    unittest.main()
