from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "generate_codd_consistency.py"
SPEC = importlib.util.spec_from_file_location("generate_codd_consistency", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load {SCRIPT}")
producer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(producer)


FEATURE_TEXT = """# Feature status fixture

## Phase 6の歴史スナップショット

`source: docs/product/feature-status.md`、`scope: Phase 6`、`PASS: 3`、`FAIL: 1`、`BLOCKED: 2`、`NOT RUN: 4`、`total: 10`
"""

SUMMARY_TABLE = """| 結果 | 件数 |
| --- | ---: |
| PASS | 3 |
| FAIL | 1 |
| BLOCKED | 2 |
| NOT RUN | 4 |
| **合計** | **10** |
"""

PHASE6_TEXT = f"""# Phase 6 result fixture

## 集計

{SUMMARY_TABLE}

The rest of the document is outside the table scope.
"""

EXPECTED = {
    "PASS": "3",
    "FAIL": "1",
    "BLOCKED": "2",
    "NOT_RUN": "4",
    "total": "10",
}


def write_fixture(root: Path, feature: str = FEATURE_TEXT, phase6: str = PHASE6_TEXT) -> None:
    (root / "docs/product").mkdir(parents=True)
    (root / "docs/testing").mkdir(parents=True)
    (root / ".codd").mkdir()
    (root / "docs/product/feature-status.md").write_text(feature, encoding="utf-8")
    (root / "docs/testing/phase6-case-results.md").write_text(phase6, encoding="utf-8")
    dag = {
        "nodes": [],
        "edges": [
            {
                "from_id": "docs/product/feature-status.md",
                "to_id": "docs/testing/phase6-case-results.md",
                "kind": "depends_on",
            }
        ],
    }
    (root / ".codd/dag.json").write_text(
        json.dumps(dag), encoding="utf-8"
    )


class CoddConsistencyProducerTests(unittest.TestCase):
    def test_extracts_only_scoped_snapshot_and_summary_table(self) -> None:
        self.assertEqual(producer.extract_feature_status_counts(FEATURE_TEXT), {
            "PASS": "3",
            "FAIL": "1",
            "BLOCKED": "2",
            "NOT RUN": "4",
            "total": "10",
        })
        self.assertEqual(producer.extract_phase6_counts(PHASE6_TEXT), {
            "PASS": "3",
            "FAIL": "1",
            "BLOCKED": "2",
            "NOT RUN": "4",
            "total": "10",
        })

    def test_generates_five_nonempty_records(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_fixture(root)
            payload = producer.build_payload(root)
            self.assertEqual(len(payload["records"]), 5)
            self.assertEqual(payload["records"], payload["comparisons"])
            self.assertEqual(
                [record["name"] for record in payload["records"]],
                ["PASS", "FAIL", "BLOCKED", "NOT_RUN", "total"],
            )
            self.assertEqual(
                [record["from_value"] for record in payload["records"]],
                list(EXPECTED.values()),
            )
            for record in payload["records"]:
                self.assertTrue(all(record.values()))

    def test_generation_is_atomic_deterministic_and_validatable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_fixture(root)
            output = root / ".codd/propagation_results.json"
            producer.generate(root, output)
            first = output.read_bytes()
            producer.generate(root, output)
            second = output.read_bytes()
            self.assertEqual(first, second)
            self.assertEqual(hashlib.sha256(first).hexdigest(), hashlib.sha256(second).hexdigest())
            self.assertTrue(first.endswith(b"\n"))
            producer.validate_output(root, output)
            self.assertEqual(list((root / ".codd").glob("*.tmp")), [])

    def test_rejects_missing_duplicate_and_unscoped_sections(self) -> None:
        cases = [
            FEATURE_TEXT.replace("## Phase 6の歴史スナップショット", "## Other"),
            FEATURE_TEXT + "\n## Phase 6の歴史スナップショット\n`PASS: 3`\n",
        ]
        for feature in cases:
            with self.subTest(feature=feature), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                write_fixture(root, feature=feature)
                with self.assertRaises(producer.ProducerError):
                    producer.build_payload(root)

        cases = [
            PHASE6_TEXT.replace("## 集計", "## Other"),
            PHASE6_TEXT.replace(
                "The rest of the document is outside the table scope.",
                f"{SUMMARY_TABLE}\nThe rest of the document is outside the table scope.",
            ),
        ]
        for phase6 in cases:
            with self.subTest(phase6=phase6), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                write_fixture(root, phase6=phase6)
                with self.assertRaises(producer.ProducerError):
                    producer.build_payload(root)

    def test_rejects_missing_duplicate_and_malformed_labels(self) -> None:
        feature_cases = [
            FEATURE_TEXT.replace("`FAIL: 1`、", ""),
            FEATURE_TEXT.replace("`PASS: 3`", "`PASS: nope`"),
            FEATURE_TEXT.replace("`PASS: 3`", "`PASS: -1`"),
            FEATURE_TEXT.replace("`total: 10`", "`total: 9`"),
            FEATURE_TEXT.replace("`PASS: 3`", "`PASS: 3`、`PASS: 3`"),
        ]
        phase_cases = [
            PHASE6_TEXT.replace("| FAIL | 1 |\n", ""),
            PHASE6_TEXT.replace("| PASS | 3 |", "| PASS | nope |"),
            PHASE6_TEXT.replace("| PASS | 3 |", "| PASS | -1 |"),
            PHASE6_TEXT.replace("| **合計** | **10** |", "| **合計** | **9** |"),
            PHASE6_TEXT.replace("| PASS | 3 |", "| PASS | 3 |\n| PASS | 3 |"),
        ]
        for feature in feature_cases:
            with self.subTest(feature=feature), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                write_fixture(root, feature=feature)
                with self.assertRaises(producer.ProducerError):
                    producer.build_payload(root)
        for phase6 in phase_cases:
            with self.subTest(phase6=phase6), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                write_fixture(root, phase6=phase6)
                with self.assertRaises(producer.ProducerError):
                    producer.build_payload(root)

    def test_rejects_root_escape_and_missing_edge(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_fixture(root)
            with self.assertRaises(producer.ProducerError):
                producer.generate(root, root.parent / "escaped.json")

            dag = json.loads((root / ".codd/dag.json").read_text(encoding="utf-8"))
            dag["edges"] = []
            (root / ".codd/dag.json").write_text(json.dumps(dag), encoding="utf-8")
            with self.assertRaises(producer.ProducerError):
                producer.build_payload(root)

    def test_stale_output_fails_closed_after_one_source_byte_changes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_fixture(root)
            output = producer.generate(root)
            before = output.read_bytes()
            source = root / "docs/product/feature-status.md"
            source.write_bytes(source.read_bytes() + b" ")
            with self.assertRaises(producer.ProducerError):
                producer.validate_output(root, output)
            self.assertEqual(output.read_bytes(), before)

    def test_real_codd_raw_json_is_nonvacuous_pass(self) -> None:
        output = producer.generate(ROOT)
        payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(len(payload["records"]), 5)
        self.assertEqual(
            [record["from_value"] for record in payload["records"]],
            ["60", "0", "12", "0", "72"],
        )
        self.assertEqual(
            [record["to_value"] for record in payload["records"]],
            ["60", "0", "12", "0", "72"],
        )
        for record in payload["records"]:
            self.assertTrue(all(record.values()))
        completed = subprocess.run(
            [
                str(ROOT / ".venv/bin/codd"),
                "dag",
                "verify",
                "--path",
                str(ROOT),
                "--check",
                "depends_on_consistency",
                "--format",
                "json",
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)
        results = json.loads(completed.stdout)
        result = next(item for item in results if item.get("check_name") == "depends_on_consistency")
        self.assertEqual(result["status"], "pass")
        self.assertFalse(result["skipped"])
        self.assertEqual(result["violations"], [])
        self.assertEqual(result["records_compared"], 5)
        self.assertEqual(result["checked_count"], 5)
        self.assertTrue(output.exists())


if __name__ == "__main__":
    unittest.main()
