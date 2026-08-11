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

    def test_fullscreen_viewer_hides_toolbar_without_reserving_space(self) -> None:
        self.assert_rule_contains(
            '.viewer[data-fullscreen="true"][data-toolbar-visible="false"]',
            "grid-template-rows: 0 minmax(0, 1fr)",
        )
        self.assert_rule_contains(
            '.viewer[data-fullscreen="true"][data-toolbar-visible="false"] .viewer-toolbar',
            "pointer-events: none",
        )

    def test_viewer_stage_uses_a_dark_checkerboard_background(self) -> None:
        self.assert_rule_contains(".viewer-stage", "background-size: 8px 8px")
        self.assert_rule_contains(".viewer-stage", "background-color: #20211f")
        self.assertIn(
            "linear-gradient(45deg, #252625 25%, transparent 25%)",
            STYLES,
        )

    def test_viewer_end_of_volume_control_keeps_its_label_and_select_together(self) -> None:
        self.assert_rule_contains(
            ".viewer-end-of-volume-control", "display: inline-flex"
        )
        self.assert_rule_contains(
            ".viewer-end-of-volume-control", "white-space: nowrap"
        )

    def test_catalog_cards_reserve_a_separate_action_region(self) -> None:
        self.assert_rule_contains(".catalog-actions", "display: flex")
        self.assert_rule_contains(
            ".catalog-cell--detail_list",
            "grid-template-columns: minmax(0, 1fr) auto",
        )

    def test_thumbnail_cards_reserve_the_filename_below_a_bounded_image(self) -> None:
        self.assertIn(
            ".catalog-cell--cover_list,\n.catalog-cell--small_thumbnail,\n.catalog-cell--reference_tile {\n  min-height: 0;",
            STYLES,
        )
        self.assert_rule_contains(".catalog-row--small_thumbnail", "height: 176px")
        self.assert_rule_contains(
            ".catalog-item--small_thumbnail",
            "grid-template-columns: minmax(0, 1fr)",
        )
        self.assert_rule_contains(
            ".catalog-item--small_thumbnail",
            "grid-template-rows: minmax(0, 1fr) auto",
        )
        self.assert_rule_contains(".catalog-item--cover_list", "min-height: 0")
        self.assert_rule_contains(
            ".catalog-item--cover_list", "grid-template-rows: minmax(0, 1fr) auto"
        )
        self.assert_rule_contains(
            ".catalog-item--cover_list .thumbnail",
            "overflow: hidden",
        )
        self.assert_rule_contains(".catalog-item--reference_tile", "min-height: 0")
        self.assert_rule_contains(
            ".catalog-item--reference_tile", "grid-template-rows: minmax(0, 1fr) auto"
        )
        self.assert_rule_contains(
            ".catalog-item--reference_tile .thumbnail",
            "overflow: hidden",
        )
        self.assertIn(".thumbnail {\n  display: grid;\n  min-height: 0;", STYLES)

    def test_catalog_names_and_favorites_use_compact_controls(self) -> None:
        self.assertIn(
            ".item-name {\n  display: -webkit-box;\n  overflow: hidden;\n  margin-top: 7px;\n  font-size: .82rem;",
            STYLES,
        )
        self.assert_rule_contains(".favorite-toggle", "width: 24px")
        self.assert_rule_contains(".favorite-toggle", "min-height: 24px")

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

    def test_diagnostics_explain_the_scan_and_show_an_activity_indicator(self) -> None:
        self.assert_rule_contains(".diagnostic-explanation", "border: 1px solid #d9e3ef")
        self.assert_rule_contains(".diagnostic-progress", "display: flex")
        self.assert_rule_contains(
            ".diagnostic-activity-indicator",
            "animation: diagnostic-activity-spin .8s linear infinite",
        )

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
