from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WRAPPER = ROOT / "scripts" / "run-codd-consistency.sh"
OUTPUT = ROOT / ".codd" / "propagation_results.json"


def consistency_command() -> list[str]:
    if os.name == "nt":
        return [
            sys.executable,
            "-X",
            "utf8",
            str(ROOT / "scripts/run-codd-consistency.py"),
            "--project-root",
            str(ROOT),
        ]
    return ["bash", str(ROOT / "scripts/run-codd-consistency.sh")]


class CoddConsistencyWiringTests(unittest.TestCase):
    def test_canonical_wrapper_runs_real_nonvacuous_chain(self) -> None:
        completed = subprocess.run(
            consistency_command(),
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)
        self.assertIn(
            "depends_on_consistency status=pass skipped=false violations=0 "
            "records_compared=5 checked_count=5",
            completed.stdout,
        )

        payload = json.loads(OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(len(payload["records"]), 5)
        self.assertEqual(payload["records"], payload["comparisons"])
        self.assertTrue(all(record["from_value"] for record in payload["records"]))
        self.assertTrue(all(record["to_value"] for record in payload["records"]))

    def test_wrapper_is_fail_fast_and_keeps_required_order(self) -> None:
        source = WRAPPER.read_text(encoding="utf-8")
        self.assertIn("set -euo pipefail", source)
        generate_at = source.index('"${producer}"')
        validate_at = source.index('"${producer}"', generate_at + 1)
        validate_flag_at = source.index("--validate", validate_at)
        codd_at = source.index('bash "${dag_verify}"', validate_flag_at)
        dag_verify_source = (ROOT / "scripts/run-codd-dag-verify.sh").read_text(
            encoding="utf-8"
        )
        check_at = dag_verify_source.index("--check depends_on_consistency")
        format_at = dag_verify_source.index("--format json", check_at)
        self.assertLess(generate_at, validate_at)
        self.assertLess(validate_flag_at, codd_at)
        self.assertLess(check_at, format_at)

        for required_guard in (
            'result.get("status") != "pass"',
            'result.get("skipped") is not False',
            'result.get("violations") != []',
            'result[field] != 5',
        ):
            self.assertIn(required_guard, source)

    def test_canonical_run_tests_entrypoint_calls_wrapper_first(self) -> None:
        source = (ROOT / "scripts/run-tests.sh").read_text(encoding="utf-8")
        wrapper_at = source.index("bash scripts/run-codd-consistency.sh")
        unittest_at = source.index("python3 -B -m unittest", wrapper_at)
        self.assertLess(wrapper_at, unittest_at)


if __name__ == "__main__":
    unittest.main()
