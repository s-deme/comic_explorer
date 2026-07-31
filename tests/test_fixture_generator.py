from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tests" / "fixtures" / "generate_fixtures.py"
SPEC = importlib.util.spec_from_file_location("generate_fixtures", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load {SCRIPT}")
generate_fixtures = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generate_fixtures)


class FixtureGeneratorPlatformTests(unittest.TestCase):
    def test_native_platform_path_does_not_require_proc_or_wslpath(self) -> None:
        source = ROOT / "fixture.png"

        with patch.object(generate_fixtures, "is_wsl", return_value=False), patch.object(
            generate_fixtures.subprocess, "check_output"
        ) as check_output:
            result = generate_fixtures.windows_path(source)

        self.assertEqual(result, str(source.resolve()))
        check_output.assert_not_called()

    def test_wsl_path_uses_wslpath_for_windows_processes(self) -> None:
        source = ROOT / "fixture.png"

        with patch.object(generate_fixtures, "is_wsl", return_value=True), patch.object(
            generate_fixtures.subprocess,
            "check_output",
            return_value="E:\\script\\comic_explorer\\fixture.png\n",
        ) as check_output:
            result = generate_fixtures.windows_path(source)

        self.assertEqual(result, "E:\\script\\comic_explorer\\fixture.png")
        check_output.assert_called_once_with(
            ["wslpath", "-w", str(source.resolve())], text=True
        )


if __name__ == "__main__":
    unittest.main()
