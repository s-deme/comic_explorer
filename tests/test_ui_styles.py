import re
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STYLES = (PROJECT_ROOT / "src" / "styles.css").read_text(encoding="utf-8")


class UiStyleContractTests(unittest.TestCase):
    def assert_rule_contains(self, selector: str, declaration: str) -> None:
        rule = re.search(
            rf"{re.escape(selector)}\s*\{{(?P<body>[^}}]*)\}}",
            STYLES,
            re.DOTALL,
        )
        self.assertIsNotNone(rule, f"missing CSS rule for {selector}")
        self.assertIn(declaration, rule.group("body"))

    def test_menu_and_address_controls_are_compact(self) -> None:
        self.assert_rule_contains(":root", "font-size: 14px")
        self.assert_rule_contains(".menu-bar", "font-size: .78rem")
        self.assert_rule_contains(
            ".menu-bar .menu-trigger", "min-height: 22px"
        )
        self.assert_rule_contains(".address-bar", "font-size: .78rem")
        self.assert_rule_contains(
            ".address-bar button,\n.address-bar input", "min-height: 24px"
        )

    def test_tree_labels_have_an_explicit_dark_foreground(self) -> None:
        self.assert_rule_contains(".folder-tree", "color: #1f2328")
        self.assert_rule_contains(".tree-node", "color: #1f2328")

    def test_icon_toolbar_buttons_have_visible_spacing(self) -> None:
        self.assert_rule_contains(".icon-command-toolbar", "gap: 6px")
        self.assert_rule_contains(".viewer-toolbar", "gap: 6px")
        self.assert_rule_contains(".viewer-icon-button", "min-width: 30px")

    def test_catalog_cards_reserve_a_separate_action_region(self) -> None:
        self.assert_rule_contains(".catalog-actions", "display: flex")
        self.assert_rule_contains(
            ".catalog-cell--detail_list",
            "grid-template-columns: minmax(0, 1fr) auto",
        )

    def test_catalog_layout_shrinks_without_a_fixed_page_width(self) -> None:
        self.assertNotIn("min-width: 1024px", STYLES)
        self.assert_rule_contains(".virtual-canvas", "min-width: 0")
        self.assert_rule_contains(
            ".catalog-row--cover_list",
            "repeat(var(--catalog-column-count), minmax(0, 1fr))",
        )
        self.assertIn("@container (max-width: 720px)", STYLES)

    def test_search_options_group_conditions_without_overflow(self) -> None:
        self.assert_rule_contains(".search-options", "display: grid")
        self.assert_rule_contains(".search-options-group", "min-width: 0")
        self.assert_rule_contains(".search-options-radios", "flex-wrap: wrap")

    def test_dialogs_share_a_readable_visual_system(self) -> None:
        self.assert_rule_contains(
            '.dialog-backdrop > [role="dialog"]', "border-radius: 12px"
        )
        self.assert_rule_contains(
            '.dialog-backdrop > [role="dialog"]', "max-height: calc(100vh - 32px)"
        )
        self.assert_rule_contains(".settings-section", "border: 1px solid #dce3ec")
        self.assert_rule_contains(".settings-actions", "position: sticky")
        self.assert_rule_contains(".settings-grid", "grid-template-columns: repeat(2, minmax(0, 1fr))")


if __name__ == "__main__":
    unittest.main()
