//! Domain-specific SQLite operations behind the StateStore connection boundary.

use super::*;

fn default_shortcut_bindings() -> BTreeMap<String, Vec<String>> {
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

fn default_mouse_gesture_bindings() -> BTreeMap<String, String> {
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

fn default_catalog_mouse_bindings() -> BTreeMap<String, String> {
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

fn default_viewer_quadrant_bindings() -> BTreeMap<String, String> {
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Settings {
    pub library_root: Option<PathBuf>,
    pub sort_field: String,
    pub sort_descending: bool,
    pub end_of_volume_policy: String,
    pub catalog_view_mode: String,
    pub small_thumbnail_size: String,
    pub cover_list_thumbnail_size: String,
    pub card_grid_thumbnail_size: String,
    pub reference_tile_thumbnail_size: String,
    pub view_mode: String,
    pub spread_portrait_max_aspect_percent: String,
    pub auto_spread_min_viewport_aspect_percent: String,
    pub spread_first_page_single: bool,
    pub spread_pairing: String,
    pub fit_allow_upscale: bool,
    pub fit_basis: String,
    pub fit_include_page_margin: bool,
    pub reading_direction: String,
    pub scale_mode: String,
    pub scale: String,
    pub loupe_enabled: bool,
    pub loupe_size: String,
    pub loupe_zoom: String,
    pub prefetch_ahead: String,
    pub prefetch_behind: String,
    pub prefetch_memory_mib: String,
    pub fullscreen_escape_behavior: String,
    pub prevent_display_sleep_fullscreen: bool,
    pub tray_store_on_minimize: bool,
    pub tray_close_behavior: String,
    pub tray_restore_gesture: String,
    pub slideshow_interval_ms: String,
    pub slideshow_order: String,
    pub slideshow_repeat_current_item: bool,
    pub viewer_catalog_selection_sync: bool,
    pub viewer_background: String,
    pub viewer_page_margin: String,
    pub viewer_spread_gap: String,
    pub cursor_auto_hide_ms: String,
    pub zoom_retention: String,
    pub viewer_grid_enabled: bool,
    pub viewer_grid_size: String,
    pub viewer_grid_color: String,
    pub pan_factor: String,
    pub wheel_dead_zone: String,
    pub scroll_step_percent: String,
    pub key_scroll_acceleration_percent: String,
    pub key_scroll_continuous: bool,
    pub smooth_scroll: bool,
    pub page_scan_mode: String,
    pub tree_visible: bool,
    pub tree_auto_collapse: bool,
    pub tree_confirm_children: bool,
    pub tree_width: u16,
    pub tree_height: u16,
    pub catalog_pane_position: String,
    pub folder_open_rule: String,
    pub image_open_rule: String,
    pub archive_open_rule: String,
    pub detail_grid_lines: String,
    pub detail_row_density: String,
    pub detail_show_kind: bool,
    pub detail_show_size: bool,
    pub detail_show_modified: bool,
    pub menu_bar_visible: bool,
    pub toolbar_visible: bool,
    pub address_bar_visible: bool,
    pub status_bar_visible: bool,
    pub always_on_top: bool,
    pub navigation_selection_policy: String,
    pub thumbnail_generation_scope: String,
    pub startup_location: String,
    pub show_hidden_files: bool,
    pub app_theme_selection_json: String,
    pub custom_theme_snapshot_json: Option<String>,
    pub restore_last_viewer: bool,
    pub auto_refresh_current_folder: bool,
    pub shortcut_bindings: BTreeMap<String, Vec<String>>,
    pub catalog_mouse_bindings: BTreeMap<String, String>,
    pub viewer_quadrant_bindings: BTreeMap<String, String>,
    pub viewer_right_click_action: String,
    pub mouse_gesture_bindings: BTreeMap<String, String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            library_root: None,
            sort_field: "name".into(),
            sort_descending: false,
            end_of_volume_policy: "auto_next".into(),
            catalog_view_mode: "cover_list".into(),
            small_thumbnail_size: "104".into(),
            cover_list_thumbnail_size: "144".into(),
            card_grid_thumbnail_size: "216".into(),
            reference_tile_thumbnail_size: "128".into(),
            view_mode: "single".into(),
            spread_portrait_max_aspect_percent: "100".into(),
            auto_spread_min_viewport_aspect_percent: "125".into(),
            spread_first_page_single: false,
            spread_pairing: "continuous".into(),
            fit_allow_upscale: false,
            fit_basis: "spread".into(),
            fit_include_page_margin: true,
            reading_direction: "rightToLeft".into(),
            scale_mode: "fit".into(),
            scale: "1".into(),
            loupe_enabled: false,
            loupe_size: "180".into(),
            loupe_zoom: "2".into(),
            prefetch_ahead: "4".into(),
            prefetch_behind: "0".into(),
            prefetch_memory_mib: "256".into(),
            fullscreen_escape_behavior: "exitFullscreen".into(),
            prevent_display_sleep_fullscreen: false,
            tray_store_on_minimize: false,
            tray_close_behavior: "quit".into(),
            tray_restore_gesture: "singleClick".into(),
            slideshow_interval_ms: "3000".into(),
            slideshow_order: "forward".into(),
            slideshow_repeat_current_item: false,
            viewer_catalog_selection_sync: true,
            viewer_background: "checker".into(),
            viewer_page_margin: "0".into(),
            viewer_spread_gap: "8".into(),
            cursor_auto_hide_ms: "0".into(),
            zoom_retention: "global".into(),
            viewer_grid_enabled: false,
            viewer_grid_size: "32".into(),
            viewer_grid_color: "light".into(),
            pan_factor: "1".into(),
            wheel_dead_zone: "0".into(),
            scroll_step_percent: "90".into(),
            key_scroll_acceleration_percent: "150".into(),
            key_scroll_continuous: true,
            smooth_scroll: true,
            page_scan_mode: "vertical".into(),
            tree_visible: true,
            tree_auto_collapse: false,
            tree_confirm_children: true,
            tree_width: 240,
            tree_height: 240,
            catalog_pane_position: "right".into(),
            folder_open_rule: "navigate".into(),
            image_open_rule: "read".into(),
            archive_open_rule: "read".into(),
            detail_grid_lines: "none".into(),
            detail_row_density: "standard".into(),
            detail_show_kind: true,
            detail_show_size: true,
            detail_show_modified: true,
            menu_bar_visible: true,
            toolbar_visible: true,
            address_bar_visible: true,
            status_bar_visible: true,
            always_on_top: false,
            navigation_selection_policy: "restore".into(),
            thumbnail_generation_scope: "near".into(),
            startup_location: "last".into(),
            show_hidden_files: false,
            app_theme_selection_json: r#"{"kind":"system"}"#.into(),
            custom_theme_snapshot_json: None,
            restore_last_viewer: false,
            auto_refresh_current_folder: true,
            shortcut_bindings: default_shortcut_bindings(),
            catalog_mouse_bindings: default_catalog_mouse_bindings(),
            viewer_quadrant_bindings: default_viewer_quadrant_bindings(),
            viewer_right_click_action: "none".into(),
            mouse_gesture_bindings: default_mouse_gesture_bindings(),
        }
    }
}

impl StateStore {
    pub fn load_settings(&self) -> Result<Settings, AppError> {
        let mut settings = Settings::default();
        let mut statement = self
            .connection
            .prepare("SELECT key, value FROM settings")
            .map_err(database_error)?;
        let values = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(database_error)?;
        for value in values {
            let (key, value) = value.map_err(database_error)?;
            match key.as_str() {
                "libraryRoot" => settings.library_root = Some(PathBuf::from(value)),
                "sortField" => settings.sort_field = value,
                "sortDescending" => settings.sort_descending = value == "true",
                "endOfVolumePolicy" => settings.end_of_volume_policy = value,
                "catalogViewMode" => settings.catalog_view_mode = value,
                "smallThumbnailSize" => settings.small_thumbnail_size = value,
                "coverListThumbnailSize" => settings.cover_list_thumbnail_size = value,
                "cardGridThumbnailSize" => settings.card_grid_thumbnail_size = value,
                "referenceTileThumbnailSize" => settings.reference_tile_thumbnail_size = value,
                "viewMode" => settings.view_mode = value,
                "spreadPortraitMaxAspectPercent" => {
                    settings.spread_portrait_max_aspect_percent = value
                }
                "autoSpreadMinViewportAspectPercent" => {
                    settings.auto_spread_min_viewport_aspect_percent = value
                }
                "spreadFirstPageSingle" => settings.spread_first_page_single = value == "true",
                "spreadPairing" => settings.spread_pairing = value,
                "fitAllowUpscale" => settings.fit_allow_upscale = value == "true",
                "fitBasis" => settings.fit_basis = value,
                "fitIncludePageMargin" => settings.fit_include_page_margin = value == "true",
                "readingDirection" => settings.reading_direction = value,
                "scaleMode" => settings.scale_mode = value,
                "scale" => settings.scale = value,
                "loupeEnabled" => settings.loupe_enabled = value == "true",
                "loupeSize" => settings.loupe_size = value,
                "loupeZoom" => settings.loupe_zoom = value,
                "prefetchAhead" => settings.prefetch_ahead = value,
                "prefetchBehind" => settings.prefetch_behind = value,
                "prefetchMemoryMiB" => settings.prefetch_memory_mib = value,
                "fullscreenEscapeBehavior" => settings.fullscreen_escape_behavior = value,
                "preventDisplaySleepFullscreen" => {
                    settings.prevent_display_sleep_fullscreen = value == "true"
                }
                "trayStoreOnMinimize" => settings.tray_store_on_minimize = value == "true",
                "trayCloseBehavior" => settings.tray_close_behavior = value,
                "trayRestoreGesture" => settings.tray_restore_gesture = value,
                "slideshowIntervalMs" => settings.slideshow_interval_ms = value,
                "slideshowOrder" => settings.slideshow_order = value,
                "slideshowRepeatCurrentItem" => {
                    settings.slideshow_repeat_current_item = value == "true"
                }
                "viewerCatalogSelectionSync" => {
                    settings.viewer_catalog_selection_sync = value == "true"
                }
                "viewerBackground" => settings.viewer_background = value,
                "viewerPageMargin" => settings.viewer_page_margin = value,
                "viewerSpreadGap" => settings.viewer_spread_gap = value,
                "cursorAutoHideMs" => settings.cursor_auto_hide_ms = value,
                "zoomRetention" => settings.zoom_retention = value,
                "viewerGridEnabled" => settings.viewer_grid_enabled = value == "true",
                "viewerGridSize" => settings.viewer_grid_size = value,
                "viewerGridColor" => settings.viewer_grid_color = value,
                "panFactor" => settings.pan_factor = value,
                "wheelDeadZone" => settings.wheel_dead_zone = value,
                "scrollStepPercent" => settings.scroll_step_percent = value,
                "keyScrollAccelerationPercent" => settings.key_scroll_acceleration_percent = value,
                "keyScrollContinuous" => settings.key_scroll_continuous = value == "true",
                "smoothScroll" => settings.smooth_scroll = value == "true",
                "pageScanMode" => settings.page_scan_mode = value,
                "treeVisible" => settings.tree_visible = value == "true",
                "treeAutoCollapse" => settings.tree_auto_collapse = value == "true",
                "treeConfirmChildren" => settings.tree_confirm_children = value == "true",
                "treeWidth" => {
                    settings.tree_width = value
                        .parse::<u16>()
                        .ok()
                        .filter(|width| (180..=480).contains(width))
                        .unwrap_or(240)
                }
                "treeHeight" => {
                    settings.tree_height = value
                        .parse::<u16>()
                        .ok()
                        .filter(|height| (120..=480).contains(height))
                        .unwrap_or(240)
                }
                "catalogPanePosition" => {
                    settings.catalog_pane_position = match value.as_str() {
                        "right" | "left" | "top" | "bottom" => value,
                        _ => "right".into(),
                    }
                }
                "folderOpenRule" => settings.folder_open_rule = value,
                "imageOpenRule" => settings.image_open_rule = value,
                "archiveOpenRule" => settings.archive_open_rule = value,
                "detailGridLines" => settings.detail_grid_lines = value,
                "detailRowDensity" => settings.detail_row_density = value,
                "detailShowKind" => settings.detail_show_kind = value == "true",
                "detailShowSize" => settings.detail_show_size = value == "true",
                "detailShowModified" => settings.detail_show_modified = value == "true",
                "menuBarVisible" => settings.menu_bar_visible = value == "true",
                "toolbarVisible" => settings.toolbar_visible = value == "true",
                "addressBarVisible" => settings.address_bar_visible = value == "true",
                "statusBarVisible" => settings.status_bar_visible = value == "true",
                "alwaysOnTop" => settings.always_on_top = value == "true",
                "navigationSelectionPolicy" => settings.navigation_selection_policy = value,
                "thumbnailGenerationScope" => settings.thumbnail_generation_scope = value,
                "startupLocation" => settings.startup_location = value,
                "showHiddenFiles" => settings.show_hidden_files = value == "true",
                "appThemeSelection" => settings.app_theme_selection_json = value,
                "customThemeSnapshot" => settings.custom_theme_snapshot_json = Some(value),
                "restoreLastViewer" => settings.restore_last_viewer = value == "true",
                "autoRefreshCurrentFolder" => {
                    settings.auto_refresh_current_folder = value == "true"
                }
                "shortcutBindings" => {
                    if let Ok(bindings) =
                        serde_json::from_str::<BTreeMap<String, Vec<String>>>(&value)
                    {
                        settings.shortcut_bindings = bindings;
                    } else if let Ok(legacy) =
                        serde_json::from_str::<BTreeMap<String, String>>(&value)
                    {
                        settings.shortcut_bindings = legacy
                            .into_iter()
                            .map(|(command, shortcut)| (command, vec![shortcut]))
                            .collect();
                    }
                }
                "catalogMouseBindings" => {
                    if let Ok(bindings) = serde_json::from_str::<BTreeMap<String, String>>(&value) {
                        settings.catalog_mouse_bindings = bindings;
                    }
                }
                "viewerQuadrantBindings" => {
                    if let Ok(bindings) = serde_json::from_str::<BTreeMap<String, String>>(&value) {
                        settings.viewer_quadrant_bindings = bindings;
                    }
                }
                "viewerRightClickAction" => settings.viewer_right_click_action = value,
                "mouseGestureBindings" => {
                    if let Ok(bindings) = serde_json::from_str::<BTreeMap<String, String>>(&value) {
                        settings.mouse_gesture_bindings = bindings;
                    }
                }
                _ => {}
            }
        }
        Ok(settings)
    }

    pub fn save_settings(&mut self, settings: &Settings) -> Result<(), AppError> {
        self.save_settings_with_active_profile(settings, None)
    }

    fn save_settings_with_active_profile(
        &mut self,
        settings: &Settings,
        active_profile: Option<&str>,
    ) -> Result<(), AppError> {
        let mut settings = settings.clone();
        self.save_settings_with_preparation(
            &mut settings,
            active_profile,
            |_transaction, _settings| Ok(()),
        )
    }

    pub(crate) fn save_settings_with_preparation<T, F>(
        &mut self,
        settings: &mut Settings,
        active_profile: Option<&str>,
        prepare: F,
    ) -> Result<T, AppError>
    where
        F: FnOnce(&rusqlite::Transaction<'_>, &mut Settings) -> Result<T, AppError>,
    {
        let transaction = self.connection.transaction().map_err(database_error)?;
        let output = prepare(&transaction, settings)?;
        let shortcut_bindings =
            serde_json::to_string(&settings.shortcut_bindings).map_err(|error| AppError {
                code: ErrorCode::Internal,
                message: format!("Shortcut settings could not be encoded: {error}"),
                target: None,
                retryable: false,
            })?;
        let catalog_mouse_bindings = serde_json::to_string(&settings.catalog_mouse_bindings)
            .map_err(|error| AppError {
                code: ErrorCode::Internal,
                message: format!("Catalog mouse settings could not be encoded: {error}"),
                target: None,
                retryable: false,
            })?;
        let viewer_quadrant_bindings = serde_json::to_string(&settings.viewer_quadrant_bindings)
            .map_err(|error| AppError {
                code: ErrorCode::Internal,
                message: format!("Viewer quadrant settings could not be encoded: {error}"),
                target: None,
                retryable: false,
            })?;
        let mouse_gesture_bindings = serde_json::to_string(&settings.mouse_gesture_bindings)
            .map_err(|error| AppError {
                code: ErrorCode::Internal,
                message: format!("Mouse gesture settings could not be encoded: {error}"),
                target: None,
                retryable: false,
            })?;
        let mut values = vec![
            ("sortField", settings.sort_field.clone()),
            ("sortDescending", settings.sort_descending.to_string()),
            ("endOfVolumePolicy", settings.end_of_volume_policy.clone()),
            ("catalogViewMode", settings.catalog_view_mode.clone()),
            ("smallThumbnailSize", settings.small_thumbnail_size.clone()),
            (
                "coverListThumbnailSize",
                settings.cover_list_thumbnail_size.clone(),
            ),
            (
                "cardGridThumbnailSize",
                settings.card_grid_thumbnail_size.clone(),
            ),
            (
                "referenceTileThumbnailSize",
                settings.reference_tile_thumbnail_size.clone(),
            ),
            ("viewMode", settings.view_mode.clone()),
            (
                "spreadPortraitMaxAspectPercent",
                settings.spread_portrait_max_aspect_percent.clone(),
            ),
            (
                "autoSpreadMinViewportAspectPercent",
                settings.auto_spread_min_viewport_aspect_percent.clone(),
            ),
            (
                "spreadFirstPageSingle",
                settings.spread_first_page_single.to_string(),
            ),
            ("spreadPairing", settings.spread_pairing.clone()),
            ("fitAllowUpscale", settings.fit_allow_upscale.to_string()),
            ("fitBasis", settings.fit_basis.clone()),
            (
                "fitIncludePageMargin",
                settings.fit_include_page_margin.to_string(),
            ),
            ("readingDirection", settings.reading_direction.clone()),
            ("scaleMode", settings.scale_mode.clone()),
            ("scale", settings.scale.clone()),
            ("loupeEnabled", settings.loupe_enabled.to_string()),
            ("loupeSize", settings.loupe_size.clone()),
            ("loupeZoom", settings.loupe_zoom.clone()),
            ("prefetchAhead", settings.prefetch_ahead.clone()),
            ("prefetchBehind", settings.prefetch_behind.clone()),
            ("prefetchMemoryMiB", settings.prefetch_memory_mib.clone()),
            (
                "fullscreenEscapeBehavior",
                settings.fullscreen_escape_behavior.clone(),
            ),
            (
                "preventDisplaySleepFullscreen",
                settings.prevent_display_sleep_fullscreen.to_string(),
            ),
            (
                "trayStoreOnMinimize",
                settings.tray_store_on_minimize.to_string(),
            ),
            ("trayCloseBehavior", settings.tray_close_behavior.clone()),
            ("trayRestoreGesture", settings.tray_restore_gesture.clone()),
            (
                "slideshowIntervalMs",
                settings.slideshow_interval_ms.clone(),
            ),
            ("slideshowOrder", settings.slideshow_order.clone()),
            (
                "slideshowRepeatCurrentItem",
                settings.slideshow_repeat_current_item.to_string(),
            ),
            (
                "viewerCatalogSelectionSync",
                settings.viewer_catalog_selection_sync.to_string(),
            ),
            ("viewerBackground", settings.viewer_background.clone()),
            ("viewerPageMargin", settings.viewer_page_margin.clone()),
            ("viewerSpreadGap", settings.viewer_spread_gap.clone()),
            ("cursorAutoHideMs", settings.cursor_auto_hide_ms.clone()),
            ("zoomRetention", settings.zoom_retention.clone()),
            (
                "viewerGridEnabled",
                settings.viewer_grid_enabled.to_string(),
            ),
            ("viewerGridSize", settings.viewer_grid_size.clone()),
            ("viewerGridColor", settings.viewer_grid_color.clone()),
            ("panFactor", settings.pan_factor.clone()),
            ("wheelDeadZone", settings.wheel_dead_zone.clone()),
            ("scrollStepPercent", settings.scroll_step_percent.clone()),
            (
                "keyScrollAccelerationPercent",
                settings.key_scroll_acceleration_percent.clone(),
            ),
            (
                "keyScrollContinuous",
                settings.key_scroll_continuous.to_string(),
            ),
            ("smoothScroll", settings.smooth_scroll.to_string()),
            ("pageScanMode", settings.page_scan_mode.clone()),
            ("treeVisible", settings.tree_visible.to_string()),
            ("treeAutoCollapse", settings.tree_auto_collapse.to_string()),
            (
                "treeConfirmChildren",
                settings.tree_confirm_children.to_string(),
            ),
            ("treeWidth", settings.tree_width.clamp(180, 480).to_string()),
            (
                "treeHeight",
                settings.tree_height.clamp(120, 480).to_string(),
            ),
            (
                "catalogPanePosition",
                match settings.catalog_pane_position.as_str() {
                    "right" | "left" | "top" | "bottom" => settings.catalog_pane_position.clone(),
                    _ => "right".into(),
                },
            ),
            ("folderOpenRule", settings.folder_open_rule.clone()),
            ("imageOpenRule", settings.image_open_rule.clone()),
            ("archiveOpenRule", settings.archive_open_rule.clone()),
            ("detailGridLines", settings.detail_grid_lines.clone()),
            ("detailRowDensity", settings.detail_row_density.clone()),
            ("detailShowKind", settings.detail_show_kind.to_string()),
            ("detailShowSize", settings.detail_show_size.to_string()),
            (
                "detailShowModified",
                settings.detail_show_modified.to_string(),
            ),
            ("menuBarVisible", settings.menu_bar_visible.to_string()),
            ("toolbarVisible", settings.toolbar_visible.to_string()),
            (
                "addressBarVisible",
                settings.address_bar_visible.to_string(),
            ),
            ("statusBarVisible", settings.status_bar_visible.to_string()),
            ("alwaysOnTop", settings.always_on_top.to_string()),
            (
                "navigationSelectionPolicy",
                settings.navigation_selection_policy.clone(),
            ),
            (
                "thumbnailGenerationScope",
                settings.thumbnail_generation_scope.clone(),
            ),
            ("startupLocation", settings.startup_location.clone()),
            ("showHiddenFiles", settings.show_hidden_files.to_string()),
            (
                "appThemeSelection",
                settings.app_theme_selection_json.clone(),
            ),
            (
                "restoreLastViewer",
                settings.restore_last_viewer.to_string(),
            ),
            (
                "autoRefreshCurrentFolder",
                settings.auto_refresh_current_folder.to_string(),
            ),
            ("shortcutBindings", shortcut_bindings),
            ("catalogMouseBindings", catalog_mouse_bindings),
            ("viewerQuadrantBindings", viewer_quadrant_bindings),
            (
                "viewerRightClickAction",
                settings.viewer_right_click_action.clone(),
            ),
            ("mouseGestureBindings", mouse_gesture_bindings),
        ];
        if let Some(root) = &settings.library_root {
            values.push(("libraryRoot", root.to_string_lossy().into_owned()));
        }
        for (key, value) in values {
            transaction
                .execute(
                    "INSERT INTO settings(key, value) VALUES(?1, ?2)
                     ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    params![key, value],
                )
                .map_err(database_error)?;
        }
        if settings.library_root.is_none() {
            transaction
                .execute("DELETE FROM settings WHERE key='libraryRoot'", [])
                .map_err(database_error)?;
        }
        transaction
            .execute(
                "DELETE FROM settings WHERE key IN ('layoutMode', 'wheelScrollFactor', 'catalogPalette')",
                [],
            )
            .map_err(database_error)?;
        if let Some(snapshot) = &settings.custom_theme_snapshot_json {
            transaction
                .execute(
                    "INSERT INTO settings(key, value) VALUES('customThemeSnapshot', ?1)
                     ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    [snapshot],
                )
                .map_err(database_error)?;
        } else {
            transaction
                .execute("DELETE FROM settings WHERE key='customThemeSnapshot'", [])
                .map_err(database_error)?;
        }
        if let Some(name) = active_profile {
            transaction
                .execute(
                    "INSERT INTO settings(key, value) VALUES('activeSettingsProfile', ?1)
                     ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    [name],
                )
                .map_err(database_error)?;
        } else {
            transaction
                .execute("DELETE FROM settings WHERE key='activeSettingsProfile'", [])
                .map_err(database_error)?;
        }
        transaction.commit().map_err(database_error)?;
        Ok(output)
    }

    pub fn list_named_settings_profiles(
        &self,
    ) -> Result<Vec<NamedSettingsProfileRecord>, AppError> {
        let active = self.active_settings_profile()?;
        let mut statement = self
            .connection
            .prepare(
                "SELECT name, profile_json, updated_at_ms
                 FROM named_settings_profiles
                 ORDER BY name COLLATE NOCASE ASC
                 LIMIT ?1",
            )
            .map_err(database_error)?;
        let rows = statement
            .query_map([MAX_SETTINGS_PROFILES], |row| {
                let name = row.get::<_, String>(0)?;
                Ok(NamedSettingsProfileRecord {
                    active: active.as_deref() == Some(name.as_str()),
                    name,
                    profile_json: row.get(1)?,
                    updated_at_ms: row.get::<_, i64>(2)?.max(0) as u64,
                })
            })
            .map_err(database_error)?;
        rows.map(|row| row.map_err(database_error)).collect()
    }

    pub fn named_settings_profile(
        &self,
        name: &str,
    ) -> Result<Option<NamedSettingsProfileRecord>, AppError> {
        let active = self.active_settings_profile()?;
        self.connection
            .query_row(
                "SELECT name, profile_json, updated_at_ms
                 FROM named_settings_profiles WHERE name=?1 COLLATE NOCASE",
                [name],
                |row| {
                    let stored_name = row.get::<_, String>(0)?;
                    Ok(NamedSettingsProfileRecord {
                        active: active.as_deref() == Some(stored_name.as_str()),
                        name: stored_name,
                        profile_json: row.get(1)?,
                        updated_at_ms: row.get::<_, i64>(2)?.max(0) as u64,
                    })
                },
            )
            .optional()
            .map_err(database_error)
    }

    pub fn save_named_settings_profile(
        &mut self,
        record: &NamedSettingsProfileRecord,
        overwrite: bool,
    ) -> Result<(), AppError> {
        let active_profile = self.active_settings_profile()?;
        let transaction = self.connection.transaction().map_err(database_error)?;
        let exists = transaction
            .query_row(
                "SELECT 1 FROM named_settings_profiles WHERE name=?1 COLLATE NOCASE",
                [&record.name],
                |_| Ok(()),
            )
            .optional()
            .map_err(database_error)?
            .is_some();
        if exists && active_profile.is_some_and(|active| active.eq_ignore_ascii_case(&record.name))
        {
            return Err(AppError {
                code: ErrorCode::Conflict,
                message: "The active settings profile cannot be overwritten.".into(),
                target: None,
                retryable: false,
            });
        }
        if exists && !overwrite {
            return Err(AppError {
                code: ErrorCode::Conflict,
                message: "A settings profile with that name already exists.".into(),
                target: None,
                retryable: false,
            });
        }
        if !exists {
            let count = transaction
                .query_row("SELECT COUNT(*) FROM named_settings_profiles", [], |row| {
                    row.get::<_, i64>(0)
                })
                .map_err(database_error)?;
            if count >= MAX_SETTINGS_PROFILES {
                return Err(AppError {
                    code: ErrorCode::InvalidRequest,
                    message: "Settings profile limit reached.".into(),
                    target: None,
                    retryable: false,
                });
            }
        }
        transaction
            .execute(
                "INSERT INTO named_settings_profiles(name, profile_json, updated_at_ms)
                 VALUES(?1, ?2, ?3)
                 ON CONFLICT(name) DO UPDATE SET
                   profile_json=excluded.profile_json,
                   updated_at_ms=excluded.updated_at_ms",
                params![
                    record.name,
                    record.profile_json,
                    i64::try_from(record.updated_at_ms).unwrap_or(i64::MAX),
                ],
            )
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)
    }

    pub fn delete_named_settings_profile(&self, name: &str) -> Result<bool, AppError> {
        if self
            .active_settings_profile()?
            .is_some_and(|active| active.eq_ignore_ascii_case(name))
        {
            return Err(AppError {
                code: ErrorCode::Conflict,
                message: "The active settings profile cannot be deleted.".into(),
                target: None,
                retryable: false,
            });
        }
        self.connection
            .execute(
                "DELETE FROM named_settings_profiles WHERE name=?1 COLLATE NOCASE",
                [name],
            )
            .map(|affected| affected > 0)
            .map_err(database_error)
    }

    pub fn activate_named_settings_profile(
        &mut self,
        name: &str,
        settings: &Settings,
    ) -> Result<(), AppError> {
        if self.named_settings_profile(name)?.is_none() {
            return Err(AppError {
                code: ErrorCode::NotFound,
                message: "Settings profile was not found.".into(),
                target: None,
                retryable: false,
            });
        }
        self.save_settings_with_active_profile(settings, Some(name))
    }

    fn active_settings_profile(&self) -> Result<Option<String>, AppError> {
        self.connection
            .query_row(
                "SELECT value FROM settings WHERE key='activeSettingsProfile'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)
    }
}
