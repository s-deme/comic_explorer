import csv
from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TRACKER = PROJECT_ROOT / "docs" / "current" / "leeyes-feature-tracker.csv"

BASELINE_STATUSES = {
    "Equivalent",
    "Partial",
    "Missing",
    "Alternative",
    "Rejected",
    "Unknown",
}
DECISION_STATUSES = {
    "Undecided",
    "Selected",
    "Deferred",
    "Declined",
    "NoAction",
    "ReviewAlternative",
    "DeclinedSafety",
}
DELIVERY_STATUSES = {
    "Existing",
    "PartialExisting",
    "AlternativeExisting",
    "Rejected",
    "Unknown",
    "NotStarted",
    "Planned",
    "InProgress",
    "Implemented",
    "Verified",
    "Published",
    "Blocked",
}
SELECTED_IDS = {
    "LEY-VIEWER-004",
    "LEY-VIEWER-025",
    "LEY-VIEWER-028",
}
EXPECTED_COLUMNS = [
    "leeyes_id",
    "category",
    "feature_name",
    "baseline_status",
    "decision_status",
    "delivery_status",
    "size",
    "requirement_ids",
    "acceptance_ref",
    "implementation_refs",
    "test_refs",
    "verification_refs",
    "dependencies",
    "risk_notes",
    "updated_at",
    "delivery_ref",
]
PREFIX_CATEGORIES = {
    "CATALOG": "一覧",
    "FILE": "ファイル操作",
    "FILER": "ファイラ",
    "FILTER": "フィルター",
    "HELP": "ヘルプ",
    "INPUT": "入力",
    "IO": "入出力",
    "MEDIA": "メディア",
    "PLUGIN": "プラグイン",
    "SEARCH": "検索",
    "SETTING": "設定",
    "SHELF": "本棚",
    "SHELL": "シェル",
    "VIEWER": "Viewer",
}
INITIAL_DELIVERY_BY_BASELINE = {
    "Equivalent": "Existing",
    "Partial": "PartialExisting",
    "Missing": "NotStarted",
    "Alternative": "AlternativeExisting",
    "Rejected": "Rejected",
    "Unknown": "Unknown",
}


def load_tracker() -> tuple[list[str], list[dict[str, str]]]:
    with TRACKER.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        return list(reader.fieldnames or []), list(reader)


class LeeyesFeatureTrackerTests(unittest.TestCase):
    def test_tracker_has_all_unique_leeyes_features_and_known_states(self) -> None:
        columns, rows = load_tracker()

        self.assertEqual(columns, EXPECTED_COLUMNS)
        self.assertEqual(len(rows), 192)
        self.assertEqual(len({row["leeyes_id"] for row in rows}), 192)
        self.assertTrue(all(row["baseline_status"] in BASELINE_STATUSES for row in rows))
        self.assertTrue(all(row["decision_status"] in DECISION_STATUSES for row in rows))
        self.assertTrue(all(row["delivery_status"] in DELIVERY_STATUSES for row in rows))
        for row in rows:
            match = re.fullmatch(r"LEY-([A-Z]+)-(\d{3})", row["leeyes_id"])
            self.assertIsNotNone(match, row["leeyes_id"])
            self.assertEqual(row["category"], PREFIX_CATEGORIES[match.group(1)])

    def test_tracker_records_only_the_explicitly_selected_features(self) -> None:
        _, rows = load_tracker()
        selected = {
            row["leeyes_id"]
            for row in rows
            if row["decision_status"] == "Selected"
        }

        self.assertEqual(selected, SELECTED_IDS)
        for row in rows:
            if row["leeyes_id"] in SELECTED_IDS:
                self.assertIn(
                    row["delivery_status"],
                    {"Planned", "InProgress", "Implemented", "Verified", "Published"},
                )
                self.assertTrue(row["requirement_ids"])
                self.assertTrue(row["acceptance_ref"])

    def test_tracker_requires_evidence_as_delivery_advances(self) -> None:
        _, rows = load_tracker()
        for row in rows:
            delivery = row["delivery_status"]
            if delivery in {"Planned", "InProgress", "Implemented", "Verified", "Published"}:
                self.assertTrue(row["requirement_ids"], row["leeyes_id"])
                self.assertTrue(row["acceptance_ref"], row["leeyes_id"])
            if delivery in {"Implemented", "Verified", "Published"}:
                self.assertTrue(row["implementation_refs"], row["leeyes_id"])
                self.assertTrue(row["test_refs"], row["leeyes_id"])
            if delivery in {"Verified", "Published"}:
                self.assertTrue(row["verification_refs"], row["leeyes_id"])
            if delivery == "Published":
                self.assertTrue(row["delivery_ref"], row["leeyes_id"])
            if row["decision_status"] == "DeclinedSafety":
                self.assertTrue(row["risk_notes"], row["leeyes_id"])
            if row["decision_status"] != "Selected":
                self.assertEqual(
                    delivery,
                    INITIAL_DELIVERY_BY_BASELINE[row["baseline_status"]],
                    row["leeyes_id"],
                )


if __name__ == "__main__":
    unittest.main()
