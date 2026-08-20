import csv
from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TRACKER = PROJECT_ROOT / "docs" / "current" / "leeyes-feature-tracker.csv"
MANIFEST = PROJECT_ROOT / "docs" / "current" / "leeyes-implementation-manifest.csv"

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
PREVIOUSLY_PUBLISHED_IDS = {
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
    "priority_tier",
    "priority_rank",
    "priority_reason",
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


def load_manifest() -> list[dict[str, str]]:
    with MANIFEST.open(encoding="utf-8", newline="") as source:
        return list(csv.DictReader(source))


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

    def test_manifest_selects_the_exact_approved_candidate_set(self) -> None:
        _, rows = load_tracker()
        manifest = load_manifest()
        manifest_ids = [row["leeyes_id"] for row in manifest]
        selected = {
            row["leeyes_id"]
            for row in rows
            if row["decision_status"] == "Selected"
        }

        self.assertEqual(len(manifest_ids), 103)
        self.assertEqual(len(set(manifest_ids)), 103)
        self.assertEqual(
            {row["leeyes_id"] for row in rows if row["baseline_status"] in {"Missing", "Partial"}},
            set(manifest_ids) | PREVIOUSLY_PUBLISHED_IDS,
        )
        self.assertEqual(selected, set(manifest_ids) | PREVIOUSLY_PUBLISHED_IDS)
        selected_rows = {row["leeyes_id"]: row for row in rows}
        self.assertEqual(
            sum(selected_rows[feature_id]["baseline_status"] == "Missing" for feature_id in manifest_ids),
            67,
        )
        self.assertEqual(
            sum(selected_rows[feature_id]["baseline_status"] == "Partial" for feature_id in manifest_ids),
            36,
        )
        for row in rows:
            if row["leeyes_id"] in PREVIOUSLY_PUBLISHED_IDS:
                self.assertIn(
                    row["delivery_status"],
                    {"Planned", "InProgress", "Implemented", "Verified", "Published"},
                )
                self.assertTrue(row["requirement_ids"])
                self.assertTrue(row["acceptance_ref"])

    def test_manifest_priorities_are_contiguous_and_match_tracker(self) -> None:
        _, rows = load_tracker()
        manifest = load_manifest()
        tracker_by_id = {row["leeyes_id"]: row for row in rows}
        expected_counts = {"P1": 21, "P2": 16, "P3": 31, "P4": 12, "P5": 23}

        for tier, expected_count in expected_counts.items():
            tier_rows = [row for row in manifest if row["priority_tier"] == tier]
            self.assertEqual(len(tier_rows), expected_count, tier)
            self.assertEqual(
                sorted(int(row["priority_rank"]) for row in tier_rows),
                list(range(1, expected_count + 1)),
                tier,
            )
        self.assertEqual({row["priority_tier"] for row in manifest}, set(expected_counts))
        for manifest_row in manifest:
            tracker_row = tracker_by_id[manifest_row["leeyes_id"]]
            self.assertEqual(tracker_row["decision_status"], "Selected")
            for column in ("priority_tier", "priority_rank", "priority_reason"):
                self.assertEqual(tracker_row[column], manifest_row[column], manifest_row["leeyes_id"])
        for row in rows:
            if row["leeyes_id"] not in {item["leeyes_id"] for item in manifest}:
                self.assertFalse(row["priority_tier"], row["leeyes_id"])
                self.assertFalse(row["priority_rank"], row["leeyes_id"])
                self.assertFalse(row["priority_reason"], row["leeyes_id"])

    def test_manifest_dependencies_never_point_to_a_later_priority(self) -> None:
        _, rows = load_tracker()
        manifest = load_manifest()
        order = {
            row["leeyes_id"]: (int(row["priority_tier"][1:]), int(row["priority_rank"]))
            for row in manifest
        }
        tracker_by_id = {row["leeyes_id"]: row for row in rows}
        for feature_id, feature_order in order.items():
            dependencies = re.findall(r"LEY-[A-Z]+-\d{3}", tracker_by_id[feature_id]["dependencies"])
            for dependency in dependencies:
                if dependency in order:
                    self.assertLess(order[dependency], feature_order, f"{feature_id} -> {dependency}")

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
