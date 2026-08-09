from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tests" / "fixtures" / "generate_fixtures.py"
SPEC = importlib.util.spec_from_file_location("generate_fixtures", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load {SCRIPT}")
generate_fixtures = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generate_fixtures)


class FixtureGeneratorPlatformTests(unittest.TestCase):
    def test_native_platform_path_does_not_require_path_translation(self) -> None:
        source = ROOT / "fixture.png"
        result = generate_fixtures.windows_path(source)
        self.assertEqual(result, str(source.resolve()))


if __name__ == "__main__":
    unittest.main()
