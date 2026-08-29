//! Canonical settings normalization and profile conversion.
//!
//! Commands stay in the application boundary; this module keeps pure
//! normalization and persistence-shape translation together.

use super::*;

pub(super) fn default_shortcuts() -> BTreeMap<String, Vec<String>> {
    [
        ("openSelected", "Enter"),
        ("navigateBack", "Alt+ArrowLeft"),
        ("navigateForward", "Alt+ArrowRight"),
        ("navigateUp", "Alt+ArrowUp"),
        ("refreshCatalog", "F5"),
        ("toggleSearch", "Ctrl+F"),
        ("nextPage", "PageDown"),
        ("previousPage", "PageUp"),
        ("closeViewer", "Escape"),
        ("singlePage", "1"),
        ("spreadPage", "2"),
        ("toggleDirection", "R"),
        ("zoomIn", "+"),
        ("zoomOut", "-"),
        ("toggleLoupe", "L"),
        ("toggleFullscreen", "F11"),
    ]
    .into_iter()
    .map(|(command, shortcut)| (command.to_owned(), vec![shortcut.to_owned()]))
    .collect()
}

pub(super) fn valid_shortcut_key(value: &str) -> bool {
    if value.is_empty() || value.chars().any(char::is_whitespace) {
        return false;
    }
    let mut remainder = value;
    for modifier in ["Ctrl+", "Alt+", "Shift+", "Meta+"] {
        if remainder.starts_with(modifier) {
            remainder = &remainder[modifier.len()..];
        }
    }
    if remainder.is_empty() || (remainder.contains('+') && remainder != "+") {
        return false;
    }
    matches!(
        remainder,
        "Escape"
            | "Space"
            | "PageUp"
            | "PageDown"
            | "ArrowLeft"
            | "ArrowRight"
            | "ArrowUp"
            | "ArrowDown"
            | "+"
            | "-"
            | "_"
            | "="
            | "Enter"
            | "Tab"
            | "Home"
            | "End"
            | "R"
            | "N"
            | "P"
            | "1"
            | "2"
            | "3"
            | "4"
            | "5"
            | "6"
            | "7"
            | "8"
            | "9"
            | "0"
    ) || (remainder.len() == 1 && remainder.as_bytes()[0].is_ascii_alphabetic())
        || (remainder.starts_with('F')
            && remainder[1..]
                .parse::<u8>()
                .ok()
                .is_some_and(|value| (1..=12).contains(&value)))
}

pub(super) fn normalize_shortcuts(
    shortcuts: &BTreeMap<String, Vec<String>>,
) -> Option<BTreeMap<String, Vec<String>>> {
    let full_shape = shortcuts.len() == SHORTCUT_COMMANDS.len()
        && shortcuts
            .keys()
            .all(|command| SHORTCUT_COMMANDS.contains(&command.as_str()));
    let legacy_shape = shortcuts.len() == LEGACY_SHORTCUT_COMMANDS.len()
        && shortcuts
            .keys()
            .all(|command| LEGACY_SHORTCUT_COMMANDS.contains(&command.as_str()));
    if (!full_shape && !legacy_shape)
        || shortcuts.values().any(|bindings| {
            bindings.is_empty()
                || bindings.len() > 4
                || bindings.iter().any(|shortcut| {
                    !valid_shortcut_key(shortcut)
                        || matches!(
                            shortcut.as_str(),
                            "Alt+F"
                                | "Alt+E"
                                | "Alt+V"
                                | "Alt+O"
                                | "Alt+H"
                                | "Alt+F4"
                                | "Ctrl+X"
                                | "Ctrl+C"
                                | "Ctrl+V"
                                | "Delete"
                        )
                })
        })
    {
        return None;
    }
    let mut normalized = shortcuts.clone();
    let mut seen = std::collections::BTreeSet::new();
    for bindings in normalized.values() {
        for shortcut in bindings {
            if !seen.insert(shortcut.clone()) {
                return None;
            }
        }
    }
    if legacy_shape {
        let defaults = default_shortcuts();
        let mut fallback_index = 0;
        for command in MIGRATED_SHORTCUT_COMMANDS {
            let mut shortcut = defaults[command][0].as_str();
            while seen.contains(shortcut) {
                shortcut = MIGRATION_SHORTCUT_FALLBACKS.get(fallback_index)?;
                fallback_index += 1;
            }
            normalized.insert(command.to_owned(), vec![shortcut.to_owned()]);
            seen.insert(shortcut.to_owned());
        }
    }
    Some(normalized)
}

pub(super) fn default_mouse_gestures() -> BTreeMap<String, String> {
    [
        ("swipeLeft", "nextPage"),
        ("swipeRight", "previousPage"),
        ("wheelUp", "previousPage"),
        ("wheelDown", "nextPage"),
        ("rightWheelUp", "zoomIn"),
        ("rightWheelDown", "zoomOut"),
        ("middleClick", "none"),
        ("backButton", "previousPage"),
        ("forwardButton", "nextPage"),
        ("doubleClick", "toggleFullscreen"),
    ]
    .into_iter()
    .map(|(gesture, action)| (gesture.to_owned(), action.to_owned()))
    .collect()
}

pub(super) fn normalize_mouse_gestures(
    gestures: &BTreeMap<String, String>,
) -> Option<BTreeMap<String, String>> {
    let full_shape = gestures.len() == MOUSE_GESTURE_NAMES.len()
        && gestures
            .keys()
            .all(|gesture| MOUSE_GESTURE_NAMES.contains(&gesture.as_str()));
    let legacy_shape = gestures.len() == LEGACY_MOUSE_GESTURE_NAMES.len()
        && gestures
            .keys()
            .all(|gesture| LEGACY_MOUSE_GESTURE_NAMES.contains(&gesture.as_str()));
    if (!full_shape && !legacy_shape)
        || gestures
            .values()
            .any(|action| !MOUSE_GESTURE_ACTIONS.contains(&action.as_str()))
    {
        return None;
    }
    let mut normalized = default_mouse_gestures();
    normalized.extend(gestures.clone());
    normalized.insert("doubleClick".into(), "toggleFullscreen".into());
    Some(normalized)
}

pub(super) fn default_catalog_mouse_bindings() -> BTreeMap<String, String> {
    [
        ("primaryClick", "selectOnly"),
        ("doubleClick", "openSelected"),
        ("middleClick", "none"),
        ("backButton", "navigateBack"),
        ("forwardButton", "navigateForward"),
    ]
    .into_iter()
    .map(|(gesture, action)| (gesture.to_owned(), action.to_owned()))
    .collect()
}

pub(super) fn normalize_catalog_mouse_bindings(
    bindings: &BTreeMap<String, String>,
) -> Option<BTreeMap<String, String>> {
    (bindings.len() == CATALOG_MOUSE_GESTURE_NAMES.len()
        && bindings
            .keys()
            .all(|gesture| CATALOG_MOUSE_GESTURE_NAMES.contains(&gesture.as_str()))
        && bindings
            .values()
            .all(|action| CATALOG_MOUSE_ACTIONS.contains(&action.as_str())))
    .then(|| bindings.clone())
}

pub(super) fn default_viewer_quadrant_bindings() -> BTreeMap<String, String> {
    [
        ("topLeft", "previousPage"),
        ("topRight", "nextPage"),
        ("bottomLeft", "previousPage"),
        ("bottomRight", "nextPage"),
    ]
    .into_iter()
    .map(|(quadrant, action)| (quadrant.to_owned(), action.to_owned()))
    .collect()
}

pub(super) fn normalize_viewer_quadrant_bindings(
    bindings: &BTreeMap<String, String>,
) -> Option<BTreeMap<String, String>> {
    (bindings.len() == VIEWER_QUADRANT_NAMES.len()
        && bindings
            .keys()
            .all(|quadrant| VIEWER_QUADRANT_NAMES.contains(&quadrant.as_str()))
        && bindings
            .values()
            .all(|action| VIEWER_QUADRANT_ACTIONS.contains(&action.as_str())))
    .then(|| bindings.clone())
}

pub(super) fn normalize_viewer_right_click_action(action: &str) -> Option<String> {
    VIEWER_QUADRANT_ACTIONS
        .contains(&action)
        .then(|| action.to_owned())
}

pub(super) fn shortcuts_for_settings(
    settings: &crate::state::Settings,
) -> BTreeMap<String, Vec<String>> {
    normalize_shortcuts(&settings.shortcut_bindings).unwrap_or_else(default_shortcuts)
}

pub(super) fn viewer_scale(settings: &crate::state::Settings) -> f64 {
    settings
        .scale
        .parse::<f64>()
        .ok()
        .filter(|scale| scale.is_finite())
        .filter(|scale| (MIN_VIEWER_SCALE..=MAX_VIEWER_SCALE).contains(scale))
        .unwrap_or(1.0)
}

pub(super) fn viewer_scale_mode(settings: &crate::state::Settings) -> String {
    if matches!(
        settings.scale_mode.as_str(),
        "fit" | "width" | "height" | "original" | "custom"
    ) {
        settings.scale_mode.clone()
    } else {
        "fit".into()
    }
}

pub(super) fn end_of_volume_policy(settings: &crate::state::Settings) -> String {
    if matches!(
        settings.end_of_volume_policy.as_str(),
        "auto_next" | "confirm_next" | "return_library" | "stop" | "loop"
    ) {
        settings.end_of_volume_policy.clone()
    } else {
        "auto_next".into()
    }
}

pub(super) fn catalog_view_mode(settings: &crate::state::Settings) -> String {
    if matches!(
        settings.catalog_view_mode.as_str(),
        "small_thumbnail" | "detail_list" | "cover_list" | "card_grid" | "reference_tile"
    ) {
        settings.catalog_view_mode.clone()
    } else {
        "cover_list".into()
    }
}

pub(super) fn viewer_view_mode(settings: &crate::state::Settings) -> String {
    if matches!(settings.view_mode.as_str(), "auto" | "single" | "spread") {
        settings.view_mode.clone()
    } else {
        "single".into()
    }
}

pub(super) fn catalog_thumbnail_sizes(settings: &crate::state::Settings) -> CatalogThumbnailSizes {
    fn valid_size(value: &str, fallback: u16) -> u16 {
        value
            .parse::<u16>()
            .ok()
            .filter(|size| (MIN_CATALOG_THUMBNAIL_SIZE..=MAX_CATALOG_THUMBNAIL_SIZE).contains(size))
            .unwrap_or(fallback)
    }
    CatalogThumbnailSizes {
        small_thumbnail: valid_size(
            &settings.small_thumbnail_size,
            DEFAULT_CATALOG_THUMBNAIL_SIZES.small_thumbnail,
        ),
        cover_list: valid_size(
            &settings.cover_list_thumbnail_size,
            DEFAULT_CATALOG_THUMBNAIL_SIZES.cover_list,
        ),
        card_grid: valid_size(
            &settings.card_grid_thumbnail_size,
            DEFAULT_CATALOG_THUMBNAIL_SIZES.card_grid,
        ),
        reference_tile: valid_size(
            &settings.reference_tile_thumbnail_size,
            DEFAULT_CATALOG_THUMBNAIL_SIZES.reference_tile,
        ),
    }
}

pub(super) fn viewer_background(settings: &crate::state::Settings) -> String {
    if matches!(
        settings.viewer_background.as_str(),
        "checker" | "dark" | "black" | "light"
    ) {
        settings.viewer_background.clone()
    } else {
        "checker".into()
    }
}

pub(super) fn viewer_spacing(value: &str, fallback: u16) -> u16 {
    value
        .parse::<u16>()
        .ok()
        .filter(|spacing| *spacing <= MAX_VIEWER_SPACING)
        .unwrap_or(fallback)
}

pub(super) fn spread_percent(value: &str, minimum: u16, maximum: u16, fallback: u16) -> u16 {
    value
        .parse::<u16>()
        .ok()
        .filter(|percent| (minimum..=maximum).contains(percent))
        .unwrap_or(fallback)
}

pub(super) fn spread_pairing(settings: &crate::state::Settings) -> String {
    match settings.spread_pairing.as_str() {
        "continuous" | "odd" | "even" => settings.spread_pairing.clone(),
        _ => "continuous".into(),
    }
}

pub(super) fn fit_basis(settings: &crate::state::Settings) -> String {
    match settings.fit_basis.as_str() {
        "spread" | "page" => settings.fit_basis.clone(),
        _ => "spread".into(),
    }
}

pub(super) fn viewer_cursor_auto_hide_ms(settings: &crate::state::Settings) -> u32 {
    settings
        .cursor_auto_hide_ms
        .parse::<u32>()
        .ok()
        .filter(|delay| matches!(*delay, 0 | 1_000 | 2_000 | 3_000 | 5_000))
        .unwrap_or(0)
}

pub(super) fn zoom_retention(settings: &crate::state::Settings) -> String {
    match settings.zoom_retention.as_str() {
        "global" | "book" | "page" => settings.zoom_retention.clone(),
        _ => "global".into(),
    }
}

pub(super) fn viewer_grid_size(settings: &crate::state::Settings) -> u16 {
    settings
        .viewer_grid_size
        .parse::<u16>()
        .ok()
        .filter(|size| (MIN_VIEWER_GRID_SIZE..=MAX_VIEWER_GRID_SIZE).contains(size))
        .unwrap_or(32)
}

pub(super) fn viewer_grid_color(settings: &crate::state::Settings) -> String {
    match settings.viewer_grid_color.as_str() {
        "light" | "dark" => settings.viewer_grid_color.clone(),
        _ => "light".into(),
    }
}

pub(super) fn pan_factor(settings: &crate::state::Settings) -> f64 {
    settings
        .pan_factor
        .parse::<f64>()
        .ok()
        .filter(|factor| factor.is_finite() && (MIN_PAN_FACTOR..=MAX_PAN_FACTOR).contains(factor))
        .unwrap_or(1.0)
}

pub(super) fn wheel_dead_zone(settings: &crate::state::Settings) -> u16 {
    settings
        .wheel_dead_zone
        .parse::<u16>()
        .ok()
        .filter(|threshold| *threshold <= MAX_WHEEL_DEAD_ZONE)
        .unwrap_or(0)
}

pub(super) fn scroll_step_percent(settings: &crate::state::Settings) -> u16 {
    settings
        .scroll_step_percent
        .parse::<u16>()
        .ok()
        .filter(|percent| (MIN_SCROLL_STEP_PERCENT..=MAX_SCROLL_STEP_PERCENT).contains(percent))
        .unwrap_or(90)
}

pub(super) fn key_scroll_acceleration_percent(settings: &crate::state::Settings) -> u16 {
    settings
        .key_scroll_acceleration_percent
        .parse::<u16>()
        .ok()
        .filter(|percent| {
            (MIN_KEY_SCROLL_ACCELERATION_PERCENT..=MAX_KEY_SCROLL_ACCELERATION_PERCENT)
                .contains(percent)
        })
        .unwrap_or(DEFAULT_KEY_SCROLL_ACCELERATION_PERCENT)
}

pub(super) fn page_scan_mode(settings: &crate::state::Settings) -> String {
    match settings.page_scan_mode.as_str() {
        "vertical" | "n" | "z" => settings.page_scan_mode.clone(),
        _ => "vertical".into(),
    }
}

pub(super) fn loupe_size(settings: &crate::state::Settings) -> u16 {
    settings
        .loupe_size
        .parse::<u16>()
        .ok()
        .filter(|size| (MIN_LOUPE_SIZE..=MAX_LOUPE_SIZE).contains(size))
        .unwrap_or(180)
}

pub(super) fn loupe_zoom(settings: &crate::state::Settings) -> f64 {
    settings
        .loupe_zoom
        .parse::<f64>()
        .ok()
        .filter(|zoom| zoom.is_finite() && (MIN_LOUPE_ZOOM..=MAX_LOUPE_ZOOM).contains(zoom))
        .unwrap_or(2.0)
}

pub(super) fn prefetch_page_count(value: &str, default: u8) -> u8 {
    value
        .parse::<u8>()
        .ok()
        .filter(|count| *count <= MAX_PREFETCH_PAGE_COUNT)
        .unwrap_or(default)
}

pub(super) fn prefetch_memory_mib(settings: &crate::state::Settings) -> u16 {
    settings
        .prefetch_memory_mib
        .parse::<u16>()
        .ok()
        .filter(|limit| (MIN_PREFETCH_MEMORY_MIB..=MAX_PREFETCH_MEMORY_MIB).contains(limit))
        .unwrap_or(DEFAULT_PREFETCH_MEMORY_MIB)
}

pub(super) fn slideshow_interval_ms(settings: &crate::state::Settings) -> u32 {
    settings
        .slideshow_interval_ms
        .parse::<u32>()
        .ok()
        .filter(|interval| {
            (MIN_SLIDESHOW_INTERVAL_MS..=MAX_SLIDESHOW_INTERVAL_MS).contains(interval)
        })
        .unwrap_or(3_000)
}

pub(super) fn slideshow_order(settings: &crate::state::Settings) -> String {
    match settings.slideshow_order.as_str() {
        "forward" | "reverse" | "random" => settings.slideshow_order.clone(),
        _ => "forward".into(),
    }
}

pub(super) fn catalog_settings(settings: crate::state::Settings) -> CatalogSettings {
    catalog_settings_resolved(settings, None)
}

pub(super) fn catalog_settings_resolved(
    settings: crate::state::Settings,
    store: Option<&StateStore>,
) -> CatalogSettings {
    let normalized_theme = themes::normalize_stored_theme_settings(&settings, store);
    let scale = viewer_scale(&settings);
    let scale_mode = viewer_scale_mode(&settings);
    let end_of_volume_policy = end_of_volume_policy(&settings);
    let catalog_view_mode = catalog_view_mode(&settings);
    let view_mode = viewer_view_mode(&settings);
    let spread_portrait_max_aspect_percent = spread_percent(
        &settings.spread_portrait_max_aspect_percent,
        MIN_PORTRAIT_ASPECT_PERCENT,
        MAX_PORTRAIT_ASPECT_PERCENT,
        100,
    );
    let auto_spread_min_viewport_aspect_percent = spread_percent(
        &settings.auto_spread_min_viewport_aspect_percent,
        MIN_AUTO_VIEWPORT_ASPECT_PERCENT,
        MAX_AUTO_VIEWPORT_ASPECT_PERCENT,
        125,
    );
    let spread_pairing = spread_pairing(&settings);
    let fit_basis = fit_basis(&settings);
    let catalog_thumbnail_sizes = catalog_thumbnail_sizes(&settings);
    let slideshow_interval_ms = slideshow_interval_ms(&settings);
    let slideshow_order = slideshow_order(&settings);
    let viewer_background = viewer_background(&settings);
    let viewer_page_margin =
        viewer_spacing(&settings.viewer_page_margin, DEFAULT_VIEWER_PAGE_MARGIN);
    let viewer_spread_gap = viewer_spacing(&settings.viewer_spread_gap, DEFAULT_VIEWER_SPREAD_GAP);
    let cursor_auto_hide_ms = viewer_cursor_auto_hide_ms(&settings);
    let zoom_retention = zoom_retention(&settings);
    let viewer_grid_size = viewer_grid_size(&settings);
    let viewer_grid_color = viewer_grid_color(&settings);
    let pan_factor = pan_factor(&settings);
    let wheel_dead_zone = wheel_dead_zone(&settings);
    let scroll_step_percent = scroll_step_percent(&settings);
    let key_scroll_acceleration_percent = key_scroll_acceleration_percent(&settings);
    let page_scan_mode = page_scan_mode(&settings);
    let loupe_size = loupe_size(&settings);
    let loupe_zoom = loupe_zoom(&settings);
    let prefetch_ahead = prefetch_page_count(&settings.prefetch_ahead, DEFAULT_PREFETCH_AHEAD);
    let prefetch_behind = prefetch_page_count(&settings.prefetch_behind, DEFAULT_PREFETCH_BEHIND);
    let prefetch_memory_mib = prefetch_memory_mib(&settings);
    let shortcuts = shortcuts_for_settings(&settings);
    let catalog_mouse_bindings = normalize_catalog_mouse_bindings(&settings.catalog_mouse_bindings)
        .unwrap_or_else(default_catalog_mouse_bindings);
    let viewer_quadrant_bindings =
        normalize_viewer_quadrant_bindings(&settings.viewer_quadrant_bindings)
            .unwrap_or_else(default_viewer_quadrant_bindings);
    let viewer_right_click_action =
        normalize_viewer_right_click_action(&settings.viewer_right_click_action)
            .unwrap_or_else(|| "none".into());
    let mouse_gestures = normalize_mouse_gestures(&settings.mouse_gesture_bindings)
        .unwrap_or_else(default_mouse_gestures);
    CatalogSettings {
        sort_field: settings.sort_field,
        sort_descending: settings.sort_descending,
        end_of_volume_policy,
        catalog_view_mode,
        catalog_thumbnail_sizes,
        view_mode,
        spread_portrait_max_aspect_percent,
        auto_spread_min_viewport_aspect_percent,
        spread_first_page_single: settings.spread_first_page_single,
        spread_pairing,
        fit_allow_upscale: settings.fit_allow_upscale,
        fit_basis,
        fit_include_page_margin: settings.fit_include_page_margin,
        reading_direction: settings.reading_direction,
        scale_mode,
        scale,
        loupe_enabled: settings.loupe_enabled,
        loupe_size,
        loupe_zoom,
        prefetch_ahead,
        prefetch_behind,
        prefetch_memory_mib,
        fullscreen_escape_behavior: match settings.fullscreen_escape_behavior.as_str() {
            "exitFullscreen" | "closeViewer" => settings.fullscreen_escape_behavior,
            _ => "exitFullscreen".into(),
        },
        prevent_display_sleep_fullscreen: settings.prevent_display_sleep_fullscreen,
        tray_store_on_minimize: settings.tray_store_on_minimize,
        tray_close_behavior: match settings.tray_close_behavior.as_str() {
            "quit" | "store" => settings.tray_close_behavior,
            _ => "quit".into(),
        },
        tray_restore_gesture: match settings.tray_restore_gesture.as_str() {
            "singleClick" | "doubleClick" => settings.tray_restore_gesture,
            _ => "singleClick".into(),
        },
        slideshow_interval_ms,
        slideshow_order,
        slideshow_repeat_current_item: settings.slideshow_repeat_current_item,
        viewer_catalog_selection_sync: settings.viewer_catalog_selection_sync,
        viewer_background,
        viewer_page_margin,
        viewer_spread_gap,
        cursor_auto_hide_ms,
        zoom_retention,
        viewer_grid_enabled: settings.viewer_grid_enabled,
        viewer_grid_size,
        viewer_grid_color,
        pan_factor,
        wheel_dead_zone,
        scroll_step_percent,
        key_scroll_acceleration_percent,
        key_scroll_continuous: settings.key_scroll_continuous,
        smooth_scroll: settings.smooth_scroll,
        page_scan_mode,
        tree_visible: settings.tree_visible,
        tree_auto_collapse: settings.tree_auto_collapse,
        tree_confirm_children: settings.tree_confirm_children,
        tree_width: settings.tree_width.clamp(180, 480),
        tree_height: settings.tree_height.clamp(120, 480),
        catalog_pane_position: match settings.catalog_pane_position.as_str() {
            "right" | "left" | "top" | "bottom" => settings.catalog_pane_position,
            _ => "right".into(),
        },
        folder_open_rule: match settings.folder_open_rule.as_str() {
            "navigate" | "read" | "none" => settings.folder_open_rule,
            _ => "navigate".into(),
        },
        image_open_rule: match settings.image_open_rule.as_str() {
            "read" | "none" => settings.image_open_rule,
            _ => "read".into(),
        },
        archive_open_rule: match settings.archive_open_rule.as_str() {
            "read" | "none" => settings.archive_open_rule,
            _ => "read".into(),
        },
        detail_grid_lines: match settings.detail_grid_lines.as_str() {
            "none" | "horizontal" | "both" => settings.detail_grid_lines,
            _ => "none".into(),
        },
        detail_row_density: match settings.detail_row_density.as_str() {
            "compact" | "standard" | "comfortable" => settings.detail_row_density,
            _ => "standard".into(),
        },
        detail_show_kind: settings.detail_show_kind,
        detail_show_size: settings.detail_show_size,
        detail_show_modified: settings.detail_show_modified,
        menu_bar_visible: settings.menu_bar_visible,
        toolbar_visible: settings.toolbar_visible,
        address_bar_visible: settings.address_bar_visible,
        status_bar_visible: settings.status_bar_visible,
        always_on_top: settings.always_on_top,
        navigation_selection_policy: match settings.navigation_selection_policy.as_str() {
            "none" | "first" | "last" | "restore" => settings.navigation_selection_policy,
            _ => "restore".into(),
        },
        thumbnail_generation_scope: match settings.thumbnail_generation_scope.as_str() {
            "visible" | "near" | "all" => settings.thumbnail_generation_scope,
            _ => "near".into(),
        },
        startup_location: match settings.startup_location.as_str() {
            "last" | "driveRoot" => settings.startup_location,
            _ => "last".into(),
        },
        show_hidden_files: settings.show_hidden_files,
        theme_selection: normalized_theme.selection,
        custom_theme_snapshot: normalized_theme.snapshot,
        theme_fallback_reason: normalized_theme.fallback_reason,
        restore_last_viewer: settings.restore_last_viewer,
        auto_refresh_current_folder: settings.auto_refresh_current_folder,
        shortcuts,
        catalog_mouse_bindings,
        viewer_quadrant_bindings,
        viewer_right_click_action,
        mouse_gestures,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerPage {
    pub id: PageId,
    pub relative_path: RelativePath,
    pub media_uri: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerSession {
    pub item_key: String,
    pub display_name: String,
    pub pages: Vec<ViewerPage>,
    pub start_index: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemMetadata {
    pub item_identity: RelativePath,
    pub memo: Option<String>,
    pub rating: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagEntry {
    pub tag_id: String,
    pub name: String,
    pub item_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemTags {
    pub item_identity: RelativePath,
    pub tags: Vec<TagEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingHistoryEntry {
    pub item_identity: RelativePath,
    pub last_viewed_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageBookmarkEntry {
    pub item_key: RelativePath,
    pub page_key: RelativePath,
    pub page_index: u64,
    pub created_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailResponse {
    pub item_relative_path: RelativePath,
    pub content_hash: String,
    pub media_uri: String,
    pub cache_hit: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageResponse {
    pub page_id: PageId,
    pub media_uri: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThumbnailPriority {
    Background,
    Near,
    Visible,
}

pub type PagePriority = ThumbnailPriority;

impl From<ThumbnailPriority> for Priority {
    fn from(value: ThumbnailPriority) -> Self {
        match value {
            ThumbnailPriority::Background => Priority::Background,
            ThumbnailPriority::Near => Priority::Near,
            ThumbnailPriority::Visible => Priority::Visible,
        }
    }
}
