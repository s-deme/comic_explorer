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

    def test_theme_state_surfaces_only_use_validated_semantic_surfaces(self) -> None:
        root = self.rule_body(":root")
        for token in (
            "--ui-hover-surface",
            "--ui-hover-muted",
            "--ui-soft-accent",
            "--ui-soft-danger",
            "--ui-soft-warning",
            "--ui-soft-success",
        ):
            declaration = re.search(rf"{re.escape(token)}\s*:\s*([^;]+)", root)
            self.assertIsNotNone(declaration)
            self.assertNotIn("color-mix", declaration.group(1))
            self.assertRegex(declaration.group(1), r"var\(--theme-surface(?:-muted)?\)")
        self.assert_rule_contains(
            '.dialog-backdrop .danger-button:hover:not(:disabled)',
            "background: var(--theme-danger)",
        )
        self.assert_rule_contains(
            '.settings-actions [data-product-id="shortcut-apply"]:hover:not(:disabled)',
            "background: var(--theme-accent)",
        )

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

    def test_theme_manager_uses_semantic_surfaces_and_state_tokens(self) -> None:
        for selector in (
            ".theme-manager",
            ".theme-choice-grid",
            ".theme-choice",
            ".theme-swatch",
            ".theme-choice--invalid",
            ".theme-invalid-badge",
            ".theme-editor",
            ".theme-editor-grid",
            ".theme-name-field",
            ".theme-name-error",
            ".theme-color-row",
            ".theme-preview",
            ".theme-preview-toolbar",
            ".theme-preview-accent-control",
            ".theme-preview-body",
            ".theme-preview-raised",
            ".theme-preview-muted",
            ".theme-preview-selection",
            ".theme-preview-states",
            ".theme-preview-focus-control",
            ".theme-preview-danger",
            ".theme-preview-warning",
            ".theme-preview-success",
            ".theme-validation",
            ".theme-import-preview",
        ):
            self.assertIn(selector, STYLES)
        self.assert_rule_contains(".theme-editor", "background: var(--theme-surface)")
        preview_rules = "\n".join(
            match.group(0)
            for match in re.finditer(r"(?ms)^\.theme-preview[^\{]*\{[^}]*\}", STYLES)
        )
        preview_tokens = set(re.findall(r"var\(--preview-([a-z-]+)\)", preview_rules))
        self.assertEqual(preview_tokens, THEME_TOKENS)
        self.assertNotIn("--theme-", preview_rules)
        self.assert_rule_contains(
            '.settings-row[data-setting-id="app-theme"]',
            "grid-template-columns: minmax(0, 1fr)",
        )
        self.assert_rule_contains(".theme-manager", "width: 100%")

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

    def test_tree_labels_inherit_the_semantic_foreground(self) -> None:
        self.assert_rule_contains(".folder-tree", "color: var(--theme-text)")
        self.assert_rule_contains(".folder-tree", "grid-template-rows: auto minmax(0, 1fr)")
        self.assert_rule_contains(".folder-tree-header", "grid-template-columns: minmax(0, 1fr) auto")
        self.assert_rule_contains(".folder-tree-header-actions", "display: flex")
        self.assert_rule_contains(".tree-scroll", "overflow: auto")
        self.assert_rule_contains(".tree-node", "color: var(--theme-text)")
        self.assert_rule_contains(".tree-row", "height: 24px")
        self.assert_rule_contains(".tree-expander", "width: 16px")
        self.assert_rule_contains(".tree-expander", "flex: 0 0 16px")
        self.assert_rule_contains(".tree-node", "min-height: 22px")
        self.assert_rule_contains(".tree-node", "padding: 2px 4px 2px 0")
        self.assert_rule_contains(".tree-node", "font-size: .78rem")
        self.assert_rule_contains(".tree-icon", "width: 14px")
        self.assert_rule_contains(".tree-icon", "margin-right: 2px")

    def test_icon_toolbar_buttons_have_visible_spacing(self) -> None:
        self.assert_rule_contains(".icon-command-toolbar", "gap: 6px")
        self.assert_rule_contains(".viewer-toolbar", "gap: 6px")
        self.assert_rule_contains(".viewer-icon-button", "min-width: 30px")

    def test_viewer_toolbar_keeps_primary_controls_and_opens_a_labeled_action_panel(self) -> None:
        self.assert_rule_contains(".viewer-toolbar", "overflow: hidden")
        self.assert_rule_contains(".viewer-toolbar-close", "order: 1")
        self.assert_rule_contains(".viewer-more-panel", "position: absolute")
        self.assert_rule_contains(".viewer-more-panel", "max-height: calc(100vh - 104px)")
        self.assert_rule_contains('.viewer-more-panel[data-open="false"]', "display: none")
        self.assert_rule_contains(".viewer-more-groups", "grid-template-columns: repeat(2, minmax(0, 1fr))")
        self.assert_rule_contains(".viewer-more-action", "display: inline-flex")

    def test_filter_dialog_uses_content_sized_responsive_editor_panels(self) -> None:
        self.assert_rule_contains(".filter-dialog", "max-height: calc(100vh - 24px)")
        self.assert_rule_contains(
            ".filter-layout", "grid-template-columns: minmax(184px, 230px) minmax(0, 1fr)"
        )
        self.assert_rule_contains(".filter-chain", "max-height: min(520px, calc(100vh - 210px))")
        self.assertIn("@container (max-width: 700px)", STYLES)

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

    def test_page_navigator_stretches_a_slider_across_the_viewer_bottom(self) -> None:
        self.assert_rule_contains(".viewer-page-navigator", "display: flex")
        self.assert_rule_contains(
            '.viewer-page-navigator input[type="range"]', "flex: 1"
        )

    def test_viewer_stage_uses_a_dark_checkerboard_background(self) -> None:
        self.assert_rule_contains(
            '.viewer-stage[data-background="checker"]',
            "background-size: 24px 24px",
        )
        self.assert_rule_contains(
            '.viewer-stage[data-background="checker"]',
            "background-position: 0 0, 0 12px, 12px -12px, -12px 0",
        )
        self.assert_rule_contains(".viewer-stage", "background-color: #20211f")
        self.assert_rule_contains(
            '.viewer-stage[data-background="black"]', "background-color: #000"
        )
        self.assert_rule_contains(
            '.viewer-stage[data-background="light"]',
            "background-color: #e6e8eb",
        )
        self.assertIn(
            "linear-gradient(45deg, #252625 25%, transparent 25%)",
            STYLES,
        )
        self.assertNotIn("--theme-", self.rule_body(".viewer-stage"))
        self.assertNotIn(
            "--theme-", self.rule_body('.viewer-stage[data-background="checker"]')
        )

    def test_normal_viewer_chrome_uses_the_selected_app_theme(self) -> None:
        self.assert_rule_contains(".viewer", "color: var(--theme-text)")
        self.assert_rule_contains(
            ".viewer-toolbar", "background: var(--theme-surface-muted)"
        )
        self.assert_rule_contains(
            ".viewer-page-navigator", "background: var(--theme-surface-muted)"
        )

    def test_paged_width_fit_uses_full_stage_and_safe_vertical_margins(self) -> None:
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

    def test_viewer_cursor_hides_only_for_an_idle_non_panning_stage(self) -> None:
        self.assert_rule_contains(
            '.viewer-stage[data-cursor-hidden="true"][data-panning="false"]',
            "cursor: none",
        )

    def test_viewer_more_panel_keeps_labeled_controls_together(self) -> None:
        self.assert_rule_contains(
            ".viewer-more-field", "display: grid"
        )
        self.assert_rule_contains(
            ".viewer-more-field input,\n.viewer-more-field select", "width: 100%"
        )

    def test_viewer_loupe_uses_a_square_frame(self) -> None:
        self.assert_rule_contains(
            ".viewer-loupe", "width: var(--viewer-loupe-size, 180px)"
        )
        self.assert_rule_contains(
            ".viewer-loupe", "height: var(--viewer-loupe-size, 180px)"
        )
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
            ".catalog-cell--card_grid .catalog-actions", "left: 0"
        )
        self.assert_rule_contains(
            ".catalog-cell--reference_tile .catalog-actions", "right: 10px"
        )

    def test_catalog_uses_the_global_theme_without_local_palette_overrides(self) -> None:
        catalog = self.rule_body(".catalog-scroll")
        self.assertIn("--catalog-canvas: var(--theme-canvas)", catalog)
        self.assertIn("--catalog-text: var(--theme-text)", catalog)
        self.assertIn("--catalog-focus: var(--theme-focus)", catalog)
        self.assertNotIn("data-catalog-palette", STYLES)
        for selector in (
            ".favorite-toggle",
            '.favorite-toggle[data-favorite="true"]',
            ".loading-state",
            ".catalog-pane .error-panel",
        ):
            body = self.rule_body(selector)
            self.assertNotIn("--theme-", body)
            self.assertNotIn("--ui-", body)
        self.assert_rule_contains(".loading-state", "color: var(--catalog-accent)")
        self.assert_rule_contains(".loading-state", "background: var(--catalog-hover)")
        self.assert_rule_contains(".reference-tile-kind", "background: var(--catalog-surface)")
        self.assert_rule_contains(".drive-empty-state", "color: var(--catalog-muted)")
        self.assert_rule_contains(".archive-explorer-pane", "color: var(--catalog-text)")
        self.assert_rule_contains(".archive-explorer-pane", "background: var(--catalog-canvas)")
        self.assert_rule_contains(".archive-pane-header", "border-bottom: 1px solid var(--catalog-border)")
        self.assert_rule_contains(".archive-pane-notice", "color: var(--catalog-accent)")
        self.assert_rule_contains(
            ".search-results button span:nth-child(n + 3)",
            "color: var(--catalog-muted)",
        )

    def test_selected_and_drop_target_children_use_the_validated_pair_foreground(self) -> None:
        self.assertIn(
            '.tree-node[aria-selected="true"] .tree-icon',
            STYLES,
        )
        self.assert_rule_contains(
            '.tree-node[data-file-drop-active="true"]',
            "color: var(--theme-on-selection)",
        )
        self.assert_rule_contains(
            '.catalog-item[data-file-drop-active="true"]',
            "color: var(--catalog-on-selected)",
        )
        self.assertIn(
            '.catalog-item[data-selected="true"] .item-metadata',
            STYLES,
        )
        self.assertIn("color: var(--catalog-on-selected)", STYLES)
        self.assert_rule_contains(
            '.catalog-item[data-selected="true"]',
            "border-color: var(--catalog-on-selected)",
        )
        self.assert_rule_contains(
            '.settings-navigation button[aria-current="page"]',
            "box-shadow: inset 3px 0 var(--theme-on-selection)",
        )
        self.assert_rule_contains(
            '.help-navigation button[aria-current="page"]',
            "box-shadow: inset 3px 0 var(--theme-on-selection)",
        )
        self.assertIn(
            '.media-catalog-layout li[aria-current="true"] small',
            STYLES,
        )
        self.assert_rule_contains(
            '.filter-set-panel li[aria-current="true"] button small',
            "color: var(--theme-on-selection)",
        )

    def test_dialog_form_controls_do_not_force_a_light_color_scheme(self) -> None:
        controls = self.rule_body(
            '.dialog-backdrop input:not([type="checkbox"]):not([type="file"]),\n.dialog-backdrop select'
        )
        self.assertNotIn("color-scheme: light", controls)
        self.assertIn("background: var(--theme-surface-raised)", controls)

    def test_detail_list_formatting_uses_shared_columns_and_responsive_priority(self) -> None:
        self.assert_rule_contains(
            ".catalog-list-header", "var(--detail-header-columns"
        )
        self.assert_rule_contains(
            ".catalog-item--detail_list", "var(--detail-columns"
        )
        self.assertIn('data-detail-grid-lines="horizontal"', STYLES)
        self.assertIn('data-detail-grid-lines="both"', STYLES)
        self.assertIn(".detail-column-modified", STYLES)
        self.assertIn(".detail-column-kind", STYLES)
        self.assertIn(".detail-column-size", STYLES)
        self.assert_rule_contains(
            ".catalog-cell--reference_tile .catalog-actions", "left: auto"
        )

    def test_thumbnail_cards_reserve_the_filename_below_a_bounded_image(self) -> None:
        self.assertIn(
            ".catalog-cell--cover_list,\n.catalog-cell--small_thumbnail {\n  min-height: 0;",
            STYLES,
        )
        self.assert_rule_contains(
            ".catalog-row", "column-gap: var(--catalog-column-gap)"
        )
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
        self.assert_rule_contains(".catalog-item--card_grid", "padding: 0")
        self.assert_rule_contains(".catalog-item--card_grid", "border: 0")
        self.assert_rule_contains(
            ".catalog-item--card_grid .thumbnail",
            "height: var(--catalog-thumbnail-height)",
        )
        self.assert_rule_contains(
            '.catalog-item--card_grid[data-selected="true"]::after',
            "background: color-mix(in srgb, var(--catalog-accent) 16%, transparent)",
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
        self.assert_rule_contains(".diagnostic-explanation", "border: 1px solid var(--theme-border)")
        self.assert_rule_contains(".diagnostic-progress", "display: flex")
        self.assert_rule_contains(
            ".diagnostic-activity-indicator",
            "animation: diagnostic-activity-spin .8s linear infinite",
        )

    def test_recursive_thumbnail_progress_is_bounded_to_the_manager_dialog(self) -> None:
        self.assert_rule_contains(".recursive-thumbnail-panel", "display: grid")
        self.assert_rule_contains(
            ".recursive-thumbnail-panel", "border-top: 1px solid var(--theme-border)"
        )
        self.assert_rule_contains(".recursive-thumbnail-progress", "display: grid")
        self.assert_rule_contains(
            ".recursive-thumbnail-progress progress", "width: 100%"
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
        self.assert_rule_contains(".settings-navigation", "background: var(--theme-surface-muted)")
        self.assert_rule_contains(
            ".settings-navigation", "border-right: 1px solid var(--theme-border)"
        )
        self.assert_rule_contains(
            '.settings-navigation button[aria-current="page"]',
            "background: var(--theme-selection)",
        )
        self.assert_rule_contains(".help-navigation", "background: var(--theme-surface-muted)")
        self.assert_rule_contains(
            ".help-navigation", "border-right: 1px solid var(--theme-border)"
        )
        self.assert_rule_contains(
            '.help-navigation button[aria-current="page"]',
            "background: var(--theme-selection)",
        )
        self.assert_rule_contains(
            ".settings-row", "grid-template-columns: minmax(260px, 1fr) minmax(180px, 310px)"
        )
        self.assert_rule_contains(
            ".settings-command-row", "grid-template-columns: minmax(72px, .42fr)"
        )
        self.assert_rule_contains(
            ".settings-command-description small", "display: block"
        )
        self.assert_rule_contains(".settings-actions", "background: var(--theme-surface-raised)")

    def test_version_information_uses_a_compact_dedicated_dialog(self) -> None:
        self.assert_rule_contains(
            ".dialog-backdrop > .version-dialog",
            "width: min(440px, calc(100vw - 32px))",
        )
        self.assert_rule_contains(".version-dialog-actions", "justify-content: flex-end")


if __name__ == "__main__":
    unittest.main()
