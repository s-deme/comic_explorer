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
        self.assert_rule_contains(".folder-tree", "grid-template-rows: auto minmax(0, 1fr)")
        self.assert_rule_contains(".folder-tree-header", "grid-template-columns: minmax(0, 1fr) 30px")
        self.assert_rule_contains(".tree-scroll", "overflow: auto")
        self.assert_rule_contains(".tree-node", "color: #1f2328")

    def test_icon_toolbar_buttons_have_visible_spacing(self) -> None:
        self.assert_rule_contains(".icon-command-toolbar", "gap: 6px")
        self.assert_rule_contains(".viewer-toolbar", "gap: 6px")
        self.assert_rule_contains(".viewer-icon-button", "min-width: 30px")

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

    def test_page_navigator_stretches_a_slider_across_the_viewer_bottom(self) -> None:
        self.assert_rule_contains(".viewer-page-navigator", "display: flex")
        self.assert_rule_contains(
            '.viewer-page-navigator input[type="range"]', "flex: 1"
        )

    def test_viewer_stage_uses_a_dark_checkerboard_background(self) -> None:
        self.assert_rule_contains(".viewer-stage", "background-size: 24px 24px")
        self.assert_rule_contains(
            ".viewer-stage",
            "background-position: 0 0, 0 12px, 12px -12px, -12px 0",
        )
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

    def test_viewer_loupe_uses_a_square_frame(self) -> None:
        self.assert_rule_contains(".viewer-loupe", "width: 180px")
        self.assert_rule_contains(".viewer-loupe", "height: 180px")
        self.assert_rule_contains(".viewer-loupe", "border-radius: 0")

    def test_catalog_favorite_controls_use_mode_specific_placement(self) -> None:
        self.assert_rule_contains(".catalog-actions", "position: absolute")
        self.assert_rule_contains(
            ".catalog-cell--detail_list",
            "grid-template-columns: 32px minmax(0, 1fr)",
        )
        self.assert_rule_contains(
            ".catalog-cell--detail_list > .catalog-item",
            "grid-column: 2",
        )
        self.assert_rule_contains(
            ".catalog-cell--detail_list .catalog-actions",
            "position: static",
        )
        self.assert_rule_contains(
            ".catalog-cell--detail_list .catalog-actions",
            "grid-column: 1",
        )
        self.assert_rule_contains(
            ".catalog-cell--cover_list .catalog-actions", "top: 8px"
        )
        self.assert_rule_contains(
            ".catalog-cell--small_thumbnail .catalog-actions", "left: 5px"
        )
        self.assert_rule_contains(
            ".catalog-cell--card_grid .catalog-actions", "left: 8px"
        )
        self.assert_rule_contains(
            ".catalog-cell--reference_tile .catalog-actions", "right: 10px"
        )
        self.assert_rule_contains(
            ".catalog-cell--reference_tile .catalog-actions", "left: auto"
        )

    def test_thumbnail_cards_reserve_the_filename_below_a_bounded_image(self) -> None:
        self.assertIn(
            ".catalog-cell--cover_list,\n.catalog-cell--small_thumbnail {\n  min-height: 0;",
            STYLES,
        )
        self.assert_rule_contains(".catalog-row", "column-gap: 10px")
        self.assert_rule_contains(
            ".catalog-item--small_thumbnail",
            "grid-template-columns: minmax(0, 1fr)",
        )
        self.assert_rule_contains(
            ".catalog-item--small_thumbnail",
            "grid-template-rows: var(--catalog-thumbnail-height) minmax(0, 1fr)",
        )
        self.assert_rule_contains(
            ".catalog-item--small_thumbnail",
            "align-content: start",
        )
        self.assert_rule_contains(
            ".catalog-item--small_thumbnail .thumbnail",
            "width: var(--catalog-thumbnail-width)",
        )
        self.assert_rule_contains(
            ".catalog-item--small_thumbnail .thumbnail",
            "height: var(--catalog-thumbnail-height)",
        )
        self.assert_rule_contains(
            ".catalog-item--small_thumbnail .thumbnail",
            "overflow: hidden",
        )
        self.assert_rule_contains(".catalog-item--cover_list", "min-height: 0")
        self.assert_rule_contains(
            ".catalog-item--cover_list",
            "grid-template-rows: var(--catalog-thumbnail-height) minmax(0, 1fr)",
        )
        self.assert_rule_contains(
            ".catalog-item--cover_list .thumbnail",
            "overflow: hidden",
        )
        self.assert_rule_contains(
            ".catalog-item--card_grid",
            "grid-template-rows: var(--catalog-thumbnail-height)",
        )
        self.assert_rule_contains(
            ".catalog-item--card_grid .thumbnail",
            "height: var(--catalog-thumbnail-height)",
        )
        self.assert_rule_contains(".catalog-item--reference_tile", "min-height: 0")
        self.assert_rule_contains(
            ".catalog-item--reference_tile",
            "grid-template-columns: var(--catalog-thumbnail-width) minmax(0, 1fr)",
        )
        self.assert_rule_contains(
            ".catalog-item--reference_tile .thumbnail",
            "overflow: hidden",
        )
        self.assert_rule_contains(".reference-tile-info", "flex-direction: column")
        self.assert_rule_contains(".reference-tile-info", "overflow: hidden")
        self.assert_rule_contains(".reference-tile-metadata", "margin-top: auto")
        self.assert_rule_contains(
            ".catalog-item--reference_tile .item-name", "text-align: left"
        )
        self.assertIn(".thumbnail {\n  display: grid;\n  min-height: 0;", STYLES)

    def test_catalog_names_and_favorites_use_compact_controls(self) -> None:
        self.assertIn(
            ".item-name {\n  display: flex;\n  min-width: 0;\n  overflow: hidden;",
            STYLES,
        )
        self.assertIn(
            ".item-name {\n  display: flex;\n  min-width: 0;\n  overflow: hidden;"
            "\n  align-items: flex-start;\n  justify-content: center;\n  gap: 4px;",
            STYLES,
        )
        self.assertIn(
            ".item-name__text {\n  display: -webkit-box;\n  min-width: 0;"
            "\n  overflow: hidden;\n  -webkit-box-orient: vertical;"
            "\n  -webkit-line-clamp: 2;",
            STYLES,
        )
        self.assertIn(
            ".item-kind-icon {\n  width: 14px;\n  height: 14px;"
            "\n  flex: 0 0 14px;",
            STYLES,
        )
        self.assert_rule_contains(".favorite-toggle", "width: 24px")
        self.assert_rule_contains(".favorite-toggle", "min-height: 24px")

    def test_catalog_placeholder_icons_distinguish_folders_and_archives(self) -> None:
        self.assert_rule_contains(".thumbnail-icon", "width: min(72%, 76px)")
        self.assert_rule_contains(
            ".thumbnail-icon--folder .thumbnail-icon__folder-front",
            "fill: #f2c75b",
        )
        self.assert_rule_contains(
            ".thumbnail-icon--archive .thumbnail-icon__archive-page",
            "fill: #dce6f1",
        )

    def test_catalog_layout_shrinks_without_a_fixed_page_width(self) -> None:
        self.assertNotIn("min-width: 1024px", STYLES)
        self.assert_rule_contains(".virtual-canvas", "min-width: 0")
        self.assert_rule_contains(
            ".catalog-row--cover_list",
            "repeat(var(--catalog-column-count), var(--catalog-card-width))",
        )
        self.assertNotIn("@container (max-width: 420px)", STYLES)
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
        self.assert_rule_contains(
            ".dialog-backdrop > .settings-dialog", "grid-template-rows: auto minmax(0, 1fr) auto"
        )
        self.assert_rule_contains(
            ".settings-dialog-body", "grid-template-columns: 242px minmax(0, 1fr)"
        )
        self.assert_rule_contains(".settings-navigation", "background: #202a38")
        self.assert_rule_contains(
            ".settings-row", "grid-template-columns: minmax(260px, 1fr) minmax(180px, 310px)"
        )
        self.assert_rule_contains(
            ".settings-command-row", "grid-template-columns: minmax(72px, .42fr)"
        )
        self.assert_rule_contains(
            ".settings-command-description small", "display: block"
        )
        self.assert_rule_contains(".settings-actions", "background: #fff")


if __name__ == "__main__":
    unittest.main()
