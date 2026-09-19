import re
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STYLES = (PROJECT_ROOT / "src" / "styles.css").read_text(encoding="utf-8")
THEME_TOKENS = {
    "canvas",
    "surface",
    "surface-muted",
    "surface-raised",
    "text",
    "text-muted",
    "border",
    "accent",
    "on-accent",
    "selection",
    "on-selection",
    "focus",
    "danger",
    "on-danger",
    "warning",
    "success",
}


class UiStyleContractTests(unittest.TestCase):
    def rule_body(self, selector: str) -> str:
        rule = re.search(
            rf"(?m)^{re.escape(selector)}\s*\{{(?P<body>[^}}]*)\}}",
            STYLES,
            re.DOTALL,
        )
        self.assertIsNotNone(rule, f"missing CSS rule for {selector}")
        return rule.group("body")

    def assert_rule_contains(self, selector: str, declaration: str) -> None:
        self.assertIn(declaration, self.rule_body(selector))

    def test_root_exposes_only_the_complete_semantic_theme_contract(self) -> None:
        root = self.rule_body(":root")
        declared = set(re.findall(r"--theme-([a-z-]+)\s*:", root))
        self.assertEqual(declared, THEME_TOKENS)
        self.assertIn("color: var(--theme-text)", root)
        self.assertIn("background: var(--theme-canvas)", root)
        self.assertIn("color-scheme: light dark", root)
        self.assertIn('data-theme-scheme="dark"', STYLES)

    def test_forced_colors_rebinds_every_theme_token_to_os_colors(self) -> None:
        forced_colors = STYLES[STYLES.index("@media (forced-colors: active)") :]
        rebound = set(re.findall(r"--theme-([a-z-]+)\s*:", forced_colors))
        self.assertEqual(rebound, THEME_TOKENS)
        self.assertIn("--theme-canvas: Canvas", forced_colors)
        self.assertIn("--theme-text: CanvasText", forced_colors)
        self.assertIn("--theme-selection: Highlight", forced_colors)
        self.assertIn("--theme-on-selection: HighlightText", forced_colors)
        self.assertIn("color-scheme: light dark !important", forced_colors)
        declarations = re.findall(r"--theme-[a-z-]+\s*:\s*[^;]+", forced_colors)
        self.assertEqual(len(declarations), len(THEME_TOKENS))
        self.assertTrue(all("!important" in declaration for declaration in declarations))
        for token in (
            "canvas",
            "surface",
            "text",
            "muted",
            "border",
            "focus",
            "accent",
            "danger",
            "hover",
            "error-surface",
            "selected",
            "on-selected",
        ):
            self.assertRegex(
                forced_colors,
                rf"--catalog-{token}:\s*[^;]+!important",
            )

    def test_fullscreen_viewer_overlays_hidden_controls_without_reserving_space(self) -> None:
        self.assert_rule_contains(
            '.viewer[data-fullscreen="true"]',
            "grid-template-rows: minmax(0, 1fr)",
        )
        self.assert_rule_contains(
            '.viewer[data-fullscreen="true"][data-toolbar-visible="false"] .viewer-toolbar',
            "pointer-events: none",
        )
        self.assert_rule_contains(
            '.viewer[data-fullscreen="true"][data-page-navigator-visible="false"] .viewer-page-navigator',
            "pointer-events: none",
        )
        self.assertIn("background: rgb(38 43 49 / 94%)", STYLES)
        self.assertIn("color-scheme: dark", STYLES)

    def test_paged_width_fit_uses_full_stage_and_safe_vertical_margins(self) -> None:
        self.assert_rule_contains(".page-spread", "overscroll-behavior: none")
        self.assert_rule_contains(
            '.page-spread[data-layout-mode="paged"][data-scale-mode="width"] > img',
            "position: sticky",
        )
        self.assert_rule_contains(
            '.page-spread[data-layout-mode="paged"][data-scale-mode="width"]',
            "width: 100%",
        )
        self.assert_rule_contains(
            '.page-spread[data-layout-mode="paged"][data-scale-mode="width"]',
            "height: 100%",
        )
        self.assert_rule_contains(
            '.page-spread[data-layout-mode="paged"][data-scale-mode="width"] > img',
            "margin-block: auto",
        )
        self.assert_rule_contains(
            ".page-spread", "padding: var(--viewer-page-margin, 0)"
        )
        self.assert_rule_contains(
            ".page-spread", "gap: var(--viewer-spread-gap, 8px)"
        )
        self.assert_rule_contains(
            '.page-spread[data-scale-mode="width"] img',
            "width: calc(50% - var(--viewer-spread-half-gap, 4px))",
        )


if __name__ == "__main__":
    unittest.main()
