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

    def test_theme_preview_covers_tokens_without_overriding_the_app_theme(self) -> None:
        preview_rules = "\n".join(
            match.group(0)
            for match in re.finditer(r"(?ms)^\.theme-preview[^\{]*\{[^}]*\}", STYLES)
        )
        preview_tokens = set(re.findall(r"var\(--preview-([a-z-]+)\)", preview_rules))
        self.assertEqual(preview_tokens, THEME_TOKENS)
        self.assertNotIn("--theme-", preview_rules)

    def test_tree_labels_inherit_the_semantic_foreground(self) -> None:
        self.assert_rule_contains(".folder-tree", "color: var(--theme-text)")
        self.assert_rule_contains(".tree-node", "color: var(--theme-text)")
        self.assert_rule_contains(".tree-scroll", "overflow: auto")

    def test_viewer_toolbar_does_not_clip_controls_and_hides_closed_panels(self) -> None:
        self.assert_rule_contains(".viewer-toolbar", "overflow: visible")
        self.assert_rule_contains(".viewer-toolbar", "flex-wrap: wrap")
        self.assert_rule_contains('.viewer-more-panel[data-open="false"]', "display: none")

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

    def test_viewer_transform_and_loupe_states_have_visible_on_off_feedback(self) -> None:
        self.assert_rule_contains(
            '.viewer-more-action[aria-pressed="true"],\n.viewer-toolbar-loupe[aria-pressed="true"]',
            "background: var(--theme-accent)",
        )
        self.assert_rule_contains(
            '.viewer-image-transform-status[data-transformed="true"]',
            "border-color: var(--theme-accent)",
        )

    def test_viewer_background_settings_are_independent_of_the_app_theme(self) -> None:
        self.assert_rule_contains('.viewer-stage[data-background="black"]', "background-color: #000")
        self.assert_rule_contains('.viewer-stage[data-background="light"]', "background-color: #e6e8eb")
        self.assertNotIn("--theme-", self.rule_body(".viewer-stage"))
        self.assertNotIn("--theme-", self.rule_body('.viewer-stage[data-background="checker"]'))

    def test_normal_viewer_chrome_uses_the_selected_app_theme(self) -> None:
        self.assert_rule_contains(".viewer", "color: var(--theme-text)")
        self.assert_rule_contains(
            ".viewer-toolbar", "background: var(--theme-surface-muted)"
        )
        self.assert_rule_contains(
            ".viewer-page-navigator", "background: var(--theme-surface-muted)"
        )

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

    def test_viewer_cursor_hides_only_for_an_idle_non_panning_stage(self) -> None:
        self.assert_rule_contains(
            '.viewer-stage[data-cursor-hidden="true"][data-panning="false"]',
            "cursor: none",
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

    def test_thumbnail_images_stay_within_their_cards(self) -> None:
        for mode in ("small_thumbnail", "cover_list", "reference_tile"):
            with self.subTest(mode=mode):
                self.assert_rule_contains(f".catalog-item--{mode} .thumbnail", "overflow: hidden")
        self.assert_rule_contains(
            ".catalog-item--small_thumbnail",
            "grid-template-rows: var(--catalog-thumbnail-height) minmax(0, 1fr)",
        )
        self.assert_rule_contains(
            ".catalog-item--cover_list",
            "grid-template-rows: var(--catalog-thumbnail-height) minmax(0, 1fr)",
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

    def test_settings_and_help_selection_use_the_active_theme(self) -> None:
        for selector in (".settings-navigation", ".help-navigation"):
            with self.subTest(selector=selector):
                self.assert_rule_contains(selector, "background: var(--theme-surface-muted)")
                self.assert_rule_contains(
                    f'{selector} button[aria-current="page"]',
                    "background: var(--theme-selection)",
                )

if __name__ == "__main__":
    unittest.main()
