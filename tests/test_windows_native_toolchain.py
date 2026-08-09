from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class WindowsNativeToolchainTests(unittest.TestCase):
    def test_power_shell_runners_default_to_the_windows_venv(self) -> None:
        runner_paths = (
            ROOT / "scripts/run-codd-windows.ps1",
            ROOT / "scripts/run-codd-consistency-windows.ps1",
            ROOT / "scripts/run-tests-windows.ps1",
        )

        for runner in runner_paths:
            with self.subTest(runner=runner.name):
                source = runner.read_text(encoding="utf-8")
                self.assertIn('$VenvPath = ".venv-windows"', source)
                self.assertNotIn('$VenvPath = ".venv",', source)


if __name__ == "__main__":
    unittest.main()
