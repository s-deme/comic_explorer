from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WRAPPER = ROOT / "scripts" / "run-codd-consistency.sh"


class CoddConsistencyWiringTests(unittest.TestCase):
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

    def test_portable_test_entrypoints_call_consistency_once_before_units(self) -> None:
        shell_source = (ROOT / "scripts/run-tests.sh").read_text(encoding="utf-8")
        self.assertEqual(shell_source.count("bash scripts/run-codd-consistency.sh"), 1)
        self.assertLess(
            shell_source.index("bash scripts/run-codd-consistency.sh"),
            shell_source.index("python3 -B -m unittest"),
        )

        python_source = (ROOT / "scripts/run-tests.py").read_text(encoding="utf-8")
        self.assertEqual(python_source.count('"run-codd-consistency.sh"'), 1)
        self.assertLess(
            python_source.index('"run-codd-consistency.sh"'),
            python_source.index('"unittest"'),
        )

    def test_dag_verify_wrapper_uses_the_project_path_directly(self) -> None:
        source = (ROOT / "scripts/run-codd-dag-verify.sh").read_text(encoding="utf-8")
        for obsolete_marker in ("stat", "mktemp", "mirror_root", "runtime_root", "PYTHONPATH"):
            self.assertNotIn(obsolete_marker, source)
        self.assertIn('--path "${project_root}"', source)


if __name__ == "__main__":
    unittest.main()
