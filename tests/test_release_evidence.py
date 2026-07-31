from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "generate-sbom.py"
SPEC = importlib.util.spec_from_file_location("generate_sbom", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load {SCRIPT}")
generate_sbom = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generate_sbom)


class ReleaseEvidenceTests(unittest.TestCase):
    def test_product_quality_generates_sbom_before_cargo_check(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "product-quality.yml").read_text(
            encoding="utf-8"
        )
        metadata = workflow.index("cargo metadata --manifest-path")
        sbom = workflow.index("python scripts/generate-sbom.py")
        cargo_check = workflow.index("cargo check --locked")

        self.assertLess(metadata, sbom)
        self.assertLess(sbom, cargo_check)

    def test_license_audit_accepts_allowlisted_spdx_expressions(self) -> None:
        self.assertEqual(
            generate_sbom.validate_license(
                "(MIT OR Apache-2.0) AND Unicode-3.0", "fixture"
            ),
            "(MIT OR Apache-2.0) AND Unicode-3.0",
        )
        self.assertEqual(
            generate_sbom.validate_license("MIT/Apache-2.0", "fixture"),
            "MIT OR Apache-2.0",
        )

    def test_license_audit_rejects_unknown_or_missing_licenses(self) -> None:
        with self.assertRaises(ValueError):
            generate_sbom.validate_license("LicenseRef-Proprietary", "fixture")
        with self.assertRaises(ValueError):
            generate_sbom.validate_license("", "fixture")

    def test_npm_lock_inventory_has_no_unknown_or_prohibited_license(self) -> None:
        components = generate_sbom.npm_components(ROOT / "package-lock.json")
        self.assertGreater(len(components), 200)
        self.assertTrue(all(component.get("licenses") for component in components))


if __name__ == "__main__":
    unittest.main()
