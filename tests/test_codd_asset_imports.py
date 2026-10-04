import shutil
import tempfile
import unittest
import warnings
from pathlib import Path

from codd.dag.builder import build_dag
from codd.dag.checks.unresolved_import_residue import UnresolvedImportResidueCheck

ROOT = Path(__file__).resolve().parents[1]


class AssetImportTests(unittest.TestCase):
    def test_assets_resolve_and_missing_asset_is_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("codd/codd.yaml", "src/App.tsx", "src/features/settings/profile.ts",
                         "THIRD-PARTY-NOTICES.md", "package.json"):
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, target)
            # Keep just the two real asset imports; unrelated modules are absent in this fixture.
            app = root / "src/App.tsx"
            app.write_text('import notices from "third-party-notices?raw";\n', encoding="utf-8")
            profile = root / "src/features/settings/profile.ts"
            profile.write_text('import metadata from "../../../package.json";\n', encoding="utf-8")
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                result = UnresolvedImportResidueCheck(dag=build_dag(root)).run()
                self.assertEqual([], result.findings)
                self.assertEqual(2, result.checked_count)
                (root / "THIRD-PARTY-NOTICES.md").unlink()
                missing = UnresolvedImportResidueCheck(dag=build_dag(root)).run()
            self.assertEqual(["src/App.tsx: third-party-notices?raw"], missing.findings)
