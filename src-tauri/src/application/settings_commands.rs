//! Settings command adapter and settings-profile normalization.

use super::*;

#[tauri::command]
pub fn set_shortcut_bindings(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    shortcuts: BTreeMap<String, Vec<String>>,
) -> Result<Response<BTreeMap<String, Vec<String>>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let Some(normalized) = normalize_shortcuts(&shortcuts) else {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::InvalidRequest,
                "Shortcut bindings are invalid or conflicting.",
            ),
        ));
    };
    let settings = {
        let mut stores = match state.store.lock() {
            Ok(stores) => stores,
            Err(_) => {
                return Ok(error_response(
                    &context,
                    request_error(
                        ErrorCode::Internal,
                        "Local settings storage is unavailable.",
                    ),
                ));
            }
        };
        let Some(store) = stores.as_mut() else {
            return Ok(error_response(
                &context,
                request_error(
                    ErrorCode::Internal,
                    "Local settings storage is not initialized.",
                ),
            ));
        };
        let mut settings = match store.load_settings() {
            Ok(settings) => settings,
            Err(error) => return Ok(error_response(&context, error)),
        };
        settings.shortcut_bindings = normalized.clone();
        if let Err(error) = store.save_settings(&settings) {
            return Ok(error_response(&context, error));
        }
        settings
    };
    let _ = settings;
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: normalized,
    })
}

#[tauri::command]
pub fn set_viewer_settings(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    view_mode: String,
    spread_portrait_max_aspect_percent: u16,
    auto_spread_min_viewport_aspect_percent: u16,
    spread_first_page_single: bool,
    spread_pairing: String,
    fit_allow_upscale: bool,
    fit_basis: String,
    fit_include_page_margin: bool,
    reading_direction: String,
    scale_mode: String,
    scale: f64,
    loupe_enabled: bool,
    viewer_background: String,
    viewer_page_margin: u16,
    viewer_spread_gap: u16,
    cursor_auto_hide_ms: u32,
) -> Result<Response<CatalogSettings>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !matches!(view_mode.as_str(), "auto" | "single" | "spread")
        || !(MIN_PORTRAIT_ASPECT_PERCENT..=MAX_PORTRAIT_ASPECT_PERCENT)
            .contains(&spread_portrait_max_aspect_percent)
        || !(MIN_AUTO_VIEWPORT_ASPECT_PERCENT..=MAX_AUTO_VIEWPORT_ASPECT_PERCENT)
            .contains(&auto_spread_min_viewport_aspect_percent)
        || !matches!(spread_pairing.as_str(), "continuous" | "odd" | "even")
        || !matches!(fit_basis.as_str(), "spread" | "page")
        || !matches!(reading_direction.as_str(), "rightToLeft" | "leftToRight")
        || !matches!(
            scale_mode.as_str(),
            "fit" | "width" | "height" | "original" | "custom"
        )
        || !scale.is_finite()
        || !(MIN_VIEWER_SCALE..=MAX_VIEWER_SCALE).contains(&scale)
        || !matches!(
            viewer_background.as_str(),
            "checker" | "dark" | "black" | "light"
        )
        || viewer_page_margin > MAX_VIEWER_SPACING
        || viewer_spread_gap > MAX_VIEWER_SPACING
        || !matches!(cursor_auto_hide_ms, 0 | 1_000 | 2_000 | 3_000 | 5_000)
    {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::InvalidRequest, "Viewer settings are invalid."),
        ));
    }
    let data = {
        let mut stores = state.store.lock().map_err(|_| "state poisoned")?;
        let mut settings = stores
            .as_ref()
            .map(|store| store.load_settings())
            .transpose()
            .map_err(|error| error.message)?
            .unwrap_or_default();
        settings.view_mode = view_mode;
        settings.spread_portrait_max_aspect_percent =
            spread_portrait_max_aspect_percent.to_string();
        settings.auto_spread_min_viewport_aspect_percent =
            auto_spread_min_viewport_aspect_percent.to_string();
        settings.spread_first_page_single = spread_first_page_single;
        settings.spread_pairing = spread_pairing;
        settings.fit_allow_upscale = fit_allow_upscale;
        settings.fit_basis = fit_basis;
        settings.fit_include_page_margin = fit_include_page_margin;
        settings.reading_direction = reading_direction;
        settings.scale_mode = scale_mode;
        settings.scale = scale.to_string();
        settings.loupe_enabled = loupe_enabled;
        settings.viewer_background = viewer_background;
        settings.viewer_page_margin = viewer_page_margin.to_string();
        settings.viewer_spread_gap = viewer_spread_gap.to_string();
        settings.cursor_auto_hide_ms = cursor_auto_hide_ms.to_string();
        if let Some(store) = stores.as_mut() {
            store
                .save_settings(&settings)
                .map_err(|error| error.message)?;
        }
        catalog_settings_resolved(settings, stores.as_ref())
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

pub(crate) type NormalizedProfileBindings = (
    BTreeMap<String, Vec<String>>,
    BTreeMap<String, String>,
    BTreeMap<String, String>,
    String,
    BTreeMap<String, String>,
);

pub(crate) fn validate_settings_profile(
    profile: &SettingsProfileInput,
) -> Result<NormalizedProfileBindings, AppError> {
    themes::normalize_theme_profile_fields(
        profile.theme_selection.clone(),
        profile.custom_theme_snapshot.clone(),
    )?;
    let shortcuts = normalize_shortcuts(&profile.shortcuts).ok_or_else(|| {
        request_error(
            ErrorCode::InvalidRequest,
            "Shortcut bindings are invalid or conflicting.",
        )
    })?;
    let mouse_gestures = normalize_mouse_gestures(&profile.mouse_gestures).ok_or_else(|| {
        request_error(
            ErrorCode::InvalidRequest,
            "Mouse gesture bindings are invalid or conflicting.",
        )
    })?;
    let catalog_mouse_bindings = normalize_catalog_mouse_bindings(&profile.catalog_mouse_bindings)
        .ok_or_else(|| {
            request_error(
                ErrorCode::InvalidRequest,
                "Catalog mouse bindings contain an unknown gesture or action.",
            )
        })?;
    let viewer_quadrant_bindings =
        normalize_viewer_quadrant_bindings(&profile.viewer_quadrant_bindings).ok_or_else(|| {
            request_error(
                ErrorCode::InvalidRequest,
                "Viewer quadrant bindings contain an unknown quadrant or action.",
            )
        })?;
    let viewer_right_click_action = normalize_viewer_right_click_action(
        &profile.viewer_right_click_action,
    )
    .ok_or_else(|| {
        request_error(
            ErrorCode::InvalidRequest,
            "Viewer right-click binding contains an unknown action.",
        )
    })?;
    if !matches!(
        profile.sort_field.as_str(),
        "name" | "modified" | "size" | "kind"
    ) || !matches!(
        profile.end_of_volume_policy.as_str(),
        "auto_next" | "confirm_next" | "return_library" | "stop" | "loop"
    ) || !matches!(
        profile.catalog_view_mode.as_str(),
        "small_thumbnail" | "detail_list" | "cover_list" | "card_grid" | "reference_tile"
    ) || !matches!(profile.view_mode.as_str(), "auto" | "single" | "spread")
        || !(MIN_PORTRAIT_ASPECT_PERCENT..=MAX_PORTRAIT_ASPECT_PERCENT)
            .contains(&profile.spread_portrait_max_aspect_percent)
        || !(MIN_AUTO_VIEWPORT_ASPECT_PERCENT..=MAX_AUTO_VIEWPORT_ASPECT_PERCENT)
            .contains(&profile.auto_spread_min_viewport_aspect_percent)
        || !matches!(
            profile.spread_pairing.as_str(),
            "continuous" | "odd" | "even"
        )
        || !matches!(profile.fit_basis.as_str(), "spread" | "page")
        || ![
            profile.catalog_thumbnail_sizes.small_thumbnail,
            profile.catalog_thumbnail_sizes.cover_list,
            profile.catalog_thumbnail_sizes.card_grid,
            profile.catalog_thumbnail_sizes.reference_tile,
        ]
        .into_iter()
        .all(|size| (MIN_CATALOG_THUMBNAIL_SIZE..=MAX_CATALOG_THUMBNAIL_SIZE).contains(&size))
        || !matches!(
            profile.reading_direction.as_str(),
            "rightToLeft" | "leftToRight"
        )
        || !matches!(
            profile.scale_mode.as_str(),
            "fit" | "width" | "height" | "original" | "custom"
        )
        || !profile.scale.is_finite()
        || !(MIN_VIEWER_SCALE..=MAX_VIEWER_SCALE).contains(&profile.scale)
        || !(MIN_LOUPE_SIZE..=MAX_LOUPE_SIZE).contains(&profile.loupe_size)
        || !profile.loupe_zoom.is_finite()
        || !(MIN_LOUPE_ZOOM..=MAX_LOUPE_ZOOM).contains(&profile.loupe_zoom)
        || profile.prefetch_ahead > MAX_PREFETCH_PAGE_COUNT
        || profile.prefetch_behind > MAX_PREFETCH_PAGE_COUNT
        || !(MIN_PREFETCH_MEMORY_MIB..=MAX_PREFETCH_MEMORY_MIB)
            .contains(&profile.prefetch_memory_mib)
        || !matches!(
            profile.fullscreen_escape_behavior.as_str(),
            "exitFullscreen" | "closeViewer"
        )
        || !matches!(profile.tray_close_behavior.as_str(), "quit" | "store")
        || !matches!(
            profile.tray_restore_gesture.as_str(),
            "singleClick" | "doubleClick"
        )
        || !(MIN_SLIDESHOW_INTERVAL_MS..=MAX_SLIDESHOW_INTERVAL_MS)
            .contains(&profile.slideshow_interval_ms)
        || !matches!(
            profile.slideshow_order.as_str(),
            "forward" | "reverse" | "random"
        )
        || !matches!(
            profile.viewer_background.as_str(),
            "checker" | "dark" | "black" | "light"
        )
        || profile.viewer_page_margin > MAX_VIEWER_SPACING
        || profile.viewer_spread_gap > MAX_VIEWER_SPACING
        || !matches!(
            profile.cursor_auto_hide_ms,
            0 | 1_000 | 2_000 | 3_000 | 5_000
        )
        || !matches!(profile.zoom_retention.as_str(), "global" | "book" | "page")
        || !(MIN_VIEWER_GRID_SIZE..=MAX_VIEWER_GRID_SIZE).contains(&profile.viewer_grid_size)
        || !matches!(profile.viewer_grid_color.as_str(), "light" | "dark")
        || !profile.pan_factor.is_finite()
        || !(MIN_PAN_FACTOR..=MAX_PAN_FACTOR).contains(&profile.pan_factor)
        || profile.wheel_dead_zone > MAX_WHEEL_DEAD_ZONE
        || !(MIN_SCROLL_STEP_PERCENT..=MAX_SCROLL_STEP_PERCENT)
            .contains(&profile.scroll_step_percent)
        || !(MIN_KEY_SCROLL_ACCELERATION_PERCENT..=MAX_KEY_SCROLL_ACCELERATION_PERCENT)
            .contains(&profile.key_scroll_acceleration_percent)
        || !matches!(profile.page_scan_mode.as_str(), "vertical" | "n" | "z")
        || !(180..=480).contains(&profile.tree_width)
        || !(120..=480).contains(&profile.tree_height)
        || !matches!(
            profile.catalog_pane_position.as_str(),
            "right" | "left" | "top" | "bottom"
        )
        || !matches!(
            profile.folder_open_rule.as_str(),
            "navigate" | "read" | "none"
        )
        || !matches!(profile.image_open_rule.as_str(), "read" | "none")
        || !matches!(profile.archive_open_rule.as_str(), "read" | "none")
        || !matches!(
            profile.detail_grid_lines.as_str(),
            "none" | "horizontal" | "both"
        )
        || !matches!(
            profile.detail_row_density.as_str(),
            "compact" | "standard" | "comfortable"
        )
        || !matches!(
            profile.navigation_selection_policy.as_str(),
            "none" | "first" | "last" | "restore"
        )
        || !matches!(
            profile.thumbnail_generation_scope.as_str(),
            "visible" | "near" | "all"
        )
        || !matches!(profile.startup_location.as_str(), "last" | "driveRoot")
    {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Settings profile contains an invalid value.",
        ));
    }
    Ok((
        shortcuts,
        catalog_mouse_bindings,
        viewer_quadrant_bindings,
        viewer_right_click_action,
        mouse_gestures,
    ))
}

pub(crate) fn apply_settings_profile_to_settings(
    settings: &mut Settings,
    profile: SettingsProfileInput,
    bindings: NormalizedProfileBindings,
) -> Result<(), AppError> {
    let (shortcuts, catalog_mouse, quadrants, right_click, gestures) = bindings;
    settings.sort_field = profile.sort_field;
    settings.sort_descending = profile.sort_descending;
    settings.end_of_volume_policy = profile.end_of_volume_policy;
    settings.catalog_view_mode = profile.catalog_view_mode;
    settings.small_thumbnail_size = profile.catalog_thumbnail_sizes.small_thumbnail.to_string();
    settings.cover_list_thumbnail_size = profile.catalog_thumbnail_sizes.cover_list.to_string();
    settings.card_grid_thumbnail_size = profile.catalog_thumbnail_sizes.card_grid.to_string();
    settings.reference_tile_thumbnail_size =
        profile.catalog_thumbnail_sizes.reference_tile.to_string();
    settings.view_mode = profile.view_mode;
    settings.spread_portrait_max_aspect_percent =
        profile.spread_portrait_max_aspect_percent.to_string();
    settings.auto_spread_min_viewport_aspect_percent =
        profile.auto_spread_min_viewport_aspect_percent.to_string();
    settings.spread_first_page_single = profile.spread_first_page_single;
    settings.spread_pairing = profile.spread_pairing;
    settings.fit_allow_upscale = profile.fit_allow_upscale;
    settings.fit_basis = profile.fit_basis;
    settings.fit_include_page_margin = profile.fit_include_page_margin;
    settings.reading_direction = profile.reading_direction;
    settings.scale_mode = profile.scale_mode;
    settings.scale = profile.scale.to_string();
    settings.loupe_enabled = profile.loupe_enabled;
    settings.loupe_size = profile.loupe_size.to_string();
    settings.loupe_zoom = profile.loupe_zoom.to_string();
    settings.prefetch_ahead = profile.prefetch_ahead.to_string();
    settings.prefetch_behind = profile.prefetch_behind.to_string();
    settings.prefetch_memory_mib = profile.prefetch_memory_mib.to_string();
    settings.fullscreen_escape_behavior = profile.fullscreen_escape_behavior;
    settings.prevent_display_sleep_fullscreen = profile.prevent_display_sleep_fullscreen;
    settings.tray_store_on_minimize = profile.tray_store_on_minimize;
    settings.tray_close_behavior = profile.tray_close_behavior;
    settings.tray_restore_gesture = profile.tray_restore_gesture;
    settings.slideshow_interval_ms = profile.slideshow_interval_ms.to_string();
    settings.slideshow_order = profile.slideshow_order;
    settings.slideshow_repeat_current_item = profile.slideshow_repeat_current_item;
    settings.viewer_catalog_selection_sync = profile.viewer_catalog_selection_sync;
    settings.viewer_background = profile.viewer_background;
    settings.viewer_page_margin = profile.viewer_page_margin.to_string();
    settings.viewer_spread_gap = profile.viewer_spread_gap.to_string();
    settings.cursor_auto_hide_ms = profile.cursor_auto_hide_ms.to_string();
    settings.zoom_retention = profile.zoom_retention;
    settings.viewer_grid_enabled = profile.viewer_grid_enabled;
    settings.viewer_grid_size = profile.viewer_grid_size.to_string();
    settings.viewer_grid_color = profile.viewer_grid_color;
    settings.pan_factor = profile.pan_factor.to_string();
    settings.wheel_dead_zone = profile.wheel_dead_zone.to_string();
    settings.scroll_step_percent = profile.scroll_step_percent.to_string();
    settings.key_scroll_acceleration_percent = profile.key_scroll_acceleration_percent.to_string();
    settings.key_scroll_continuous = profile.key_scroll_continuous;
    settings.smooth_scroll = profile.smooth_scroll;
    settings.page_scan_mode = profile.page_scan_mode;
    settings.tree_visible = profile.tree_visible;
    settings.tree_auto_collapse = profile.tree_auto_collapse;
    settings.tree_confirm_children = profile.tree_confirm_children;
    settings.tree_width = profile.tree_width;
    settings.tree_height = profile.tree_height;
    settings.catalog_pane_position = profile.catalog_pane_position;
    settings.folder_open_rule = profile.folder_open_rule;
    settings.image_open_rule = profile.image_open_rule;
    settings.archive_open_rule = profile.archive_open_rule;
    settings.detail_grid_lines = profile.detail_grid_lines;
    settings.detail_row_density = profile.detail_row_density;
    settings.detail_show_kind = profile.detail_show_kind;
    settings.detail_show_size = profile.detail_show_size;
    settings.detail_show_modified = profile.detail_show_modified;
    settings.menu_bar_visible = profile.menu_bar_visible;
    settings.toolbar_visible = profile.toolbar_visible;
    settings.address_bar_visible = profile.address_bar_visible;
    settings.status_bar_visible = profile.status_bar_visible;
    settings.always_on_top = profile.always_on_top;
    settings.navigation_selection_policy = profile.navigation_selection_policy;
    settings.thumbnail_generation_scope = profile.thumbnail_generation_scope;
    settings.startup_location = profile.startup_location;
    settings.show_hidden_files = profile.show_hidden_files;
    let (theme_selection_json, custom_theme_snapshot_json) = themes::encode_theme_settings(
        &profile.theme_selection,
        profile.custom_theme_snapshot.as_ref(),
    )?;
    settings.app_theme_selection_json = theme_selection_json;
    settings.custom_theme_snapshot_json = custom_theme_snapshot_json;
    settings.restore_last_viewer = profile.restore_last_viewer;
    settings.auto_refresh_current_folder = profile.auto_refresh_current_folder;
    settings.shortcut_bindings = shortcuts;
    settings.catalog_mouse_bindings = catalog_mouse;
    settings.viewer_quadrant_bindings = quadrants;
    settings.viewer_right_click_action = right_click;
    settings.mouse_gesture_bindings = gestures;
    Ok(())
}

pub(crate) fn normalize_settings_profile_input(
    mut profile: SettingsProfileInput,
) -> Result<SettingsProfileInput, AppError> {
    let (shortcuts, catalog_mouse, quadrants, right_click, gestures) =
        validate_settings_profile(&profile)?;
    profile.shortcuts = shortcuts;
    profile.catalog_mouse_bindings = catalog_mouse;
    profile.viewer_quadrant_bindings = quadrants;
    profile.viewer_right_click_action = right_click;
    profile.mouse_gestures = gestures;
    let (theme_selection, custom_theme_snapshot) = themes::normalize_theme_profile_fields(
        profile.theme_selection,
        profile.custom_theme_snapshot,
    )?;
    profile.theme_selection = theme_selection;
    profile.custom_theme_snapshot = custom_theme_snapshot;
    Ok(profile)
}

pub(crate) fn decode_stored_settings_profile(
    profile_json: &str,
) -> Result<SettingsProfileInput, AppError> {
    let mut value = serde_json::from_str::<serde_json::Value>(profile_json).map_err(|_| {
        request_error(
            ErrorCode::UnsupportedFormat,
            "Stored settings profile is invalid.",
        )
    })?;
    let object = value.as_object_mut().ok_or_else(|| {
        request_error(
            ErrorCode::UnsupportedFormat,
            "Stored settings profile is invalid.",
        )
    })?;
    object.remove("layoutMode");
    object.remove("wheelScrollFactor");
    object.remove("catalogPalette");
    object.entry("treeHeight").or_insert(serde_json::json!(240));
    object
        .entry("catalogPanePosition")
        .or_insert(serde_json::json!("right"));
    object.entry("themeSelection").or_insert(serde_json::json!({
        "kind": "builtin",
        "themeId": "light"
    }));
    object
        .entry("customThemeSnapshot")
        .or_insert(serde_json::Value::Null);
    let stored_theme_selection = object
        .get("themeSelection")
        .cloned()
        .ok_or(())
        .and_then(|value| serde_json::from_value::<ThemeSelection>(value).map_err(|_| ()));
    let stored_theme_snapshot = object
        .get("customThemeSnapshot")
        .cloned()
        .ok_or(())
        .and_then(|value| {
            serde_json::from_value::<Option<CustomThemeSnapshot>>(value).map_err(|_| ())
        });
    let stored_theme_valid = match (stored_theme_selection, stored_theme_snapshot) {
        (Ok(selection), Ok(snapshot)) => {
            themes::normalize_theme_profile_fields(selection, snapshot).is_ok()
        }
        _ => false,
    };
    if !stored_theme_valid {
        object.insert(
            "themeSelection".into(),
            serde_json::json!({"kind": "builtin", "themeId": "light"}),
        );
        object.insert("customThemeSnapshot".into(), serde_json::Value::Null);
    }
    serde_json::from_value::<SettingsProfileInput>(value)
        .map_err(|_| {
            request_error(
                ErrorCode::UnsupportedFormat,
                "Stored settings profile is invalid.",
            )
        })
        .and_then(normalize_settings_profile_input)
}

pub(crate) fn validate_named_settings_profile_name(name: &str) -> Result<String, AppError> {
    let normalized = name.trim();
    let length = normalized.encode_utf16().count();
    if !(1..=64).contains(&length)
        || normalized
            .chars()
            .any(|character| character.is_control() || matches!(character, '/' | '\\'))
    {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Settings profile name is invalid.",
        ));
    }
    Ok(normalized.into())
}

pub(crate) fn settings_profile_confirmation_key(name: &str, profile_json: &str) -> String {
    let mut hasher = DefaultHasher::new();
    "settings-profile-v1".hash(&mut hasher);
    name.to_lowercase().hash(&mut hasher);
    profile_json.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub(crate) fn settings_profile_changed_fields(
    profile: &SettingsProfileInput,
    settings: Settings,
) -> u16 {
    let target = serde_json::to_value(profile).ok();
    let current = serde_json::to_value(catalog_settings(settings)).ok();
    match (target, current) {
        (Some(serde_json::Value::Object(target)), Some(serde_json::Value::Object(current))) => {
            target
                .iter()
                .filter(|(key, value)| current.get(*key) != Some(*value))
                .count()
                .try_into()
                .unwrap_or(u16::MAX)
        }
        _ => u16::MAX,
    }
}

#[tauri::command]
pub fn set_settings_profile(
    state: tauri::State<'_, AppState>,
    tray_state: tauri::State<'_, crate::tray::TrayState>,
    context: RequestContext,
    profile: SettingsProfileInput,
) -> Result<Response<CatalogSettings>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let (
        shortcuts,
        catalog_mouse_bindings,
        viewer_quadrant_bindings,
        viewer_right_click_action,
        mouse_gestures,
    ) = match validate_settings_profile(&profile) {
        Ok(bindings) => bindings,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let data = {
        let mut stores = match state.store.lock() {
            Ok(stores) => stores,
            Err(_) => {
                return Ok(error_response(
                    &context,
                    request_error(
                        ErrorCode::Internal,
                        "Local settings storage is unavailable.",
                    ),
                ));
            }
        };
        let Some(store) = stores.as_mut() else {
            return Ok(error_response(
                &context,
                request_error(
                    ErrorCode::Internal,
                    "Local settings storage is not initialized.",
                ),
            ));
        };
        let mut settings = match store.load_settings() {
            Ok(settings) => settings,
            Err(error) => return Ok(error_response(&context, error)),
        };
        let mut profile = profile;
        let materialization = match themes::plan_theme_profile_materialization(
            store,
            profile.theme_selection.clone(),
            profile.custom_theme_snapshot.clone(),
        ) {
            Ok(value) => value,
            Err(error) => return Ok(error_response(&context, error)),
        };
        let bindings = (
            shortcuts,
            catalog_mouse_bindings,
            viewer_quadrant_bindings,
            viewer_right_click_action,
            mouse_gestures,
        );
        match materialization {
            themes::ThemeProfileMaterialization::Ready {
                selection,
                snapshot,
            } => {
                profile.theme_selection = selection;
                profile.custom_theme_snapshot = snapshot;
                if let Err(error) =
                    apply_settings_profile_to_settings(&mut settings, profile, bindings)
                {
                    return Ok(error_response(&context, error));
                }
                if let Err(error) = store.save_settings(&settings) {
                    return Ok(error_response(&context, error));
                }
            }
            themes::ThemeProfileMaterialization::Create { definition } => {
                if let Err(error) =
                    apply_settings_profile_to_settings(&mut settings, profile, bindings)
                {
                    return Ok(error_response(&context, error));
                }
                let definition_json = match themes::canonical_definition_json(&definition) {
                    Ok(value) => value,
                    Err(error) => return Ok(error_response(&context, error)),
                };
                let name = definition.name.clone();
                if let Err(error) = store.create_custom_theme_and_save_settings(
                    &mut settings,
                    None,
                    &name,
                    &definition_json,
                    unix_millis().max(0) as u64,
                    |settings, record| {
                        themes::apply_theme_record_to_settings(settings, record, definition)
                    },
                ) {
                    return Ok(error_response(&context, error));
                }
            }
        }
        tray_state.apply_preferences(
            settings.tray_store_on_minimize,
            &settings.tray_close_behavior,
            &settings.tray_restore_gesture,
        );
        catalog_settings_resolved(settings, Some(store))
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[tauri::command]
pub fn list_named_settings_profiles(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Vec<NamedSettingsProfileSummary>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let stores = match state.store.lock() {
        Ok(stores) => stores,
        Err(_) => {
            return Ok(error_response(
                &context,
                request_error(
                    ErrorCode::Internal,
                    "Local settings storage is unavailable.",
                ),
            ));
        }
    };
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::Internal,
                "Local settings storage is not initialized.",
            ),
        ));
    };
    let records = match store.list_named_settings_profiles() {
        Ok(records) => records,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let mut summaries = Vec::with_capacity(records.len());
    for record in records {
        let profile = match decode_stored_settings_profile(&record.profile_json) {
            Ok(profile) => profile,
            Err(error) => return Ok(error_response(&context, error)),
        };
        let _ = profile;
        summaries.push(NamedSettingsProfileSummary {
            name: record.name,
            updated_at_ms: record.updated_at_ms,
            active: record.active,
        });
    }
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: summaries,
    })
}

#[tauri::command]
pub fn save_named_settings_profile(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    name: String,
    profile: SettingsProfileInput,
    overwrite: bool,
) -> Result<Response<NamedSettingsProfileSummary>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let name = match validate_named_settings_profile_name(&name) {
        Ok(name) => name,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let profile = match normalize_settings_profile_input(profile) {
        Ok(profile) => profile,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let profile_json = match serde_json::to_string(&profile) {
        Ok(profile_json) if profile_json.len() <= 131_072 => profile_json,
        _ => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidRequest, "Settings profile is too large."),
            ));
        }
    };
    let updated_at_ms = unix_millis().max(0) as u64;
    let mut stores = match state.store.lock() {
        Ok(stores) => stores,
        Err(_) => {
            return Ok(error_response(
                &context,
                request_error(
                    ErrorCode::Internal,
                    "Local settings storage is unavailable.",
                ),
            ));
        }
    };
    let Some(store) = stores.as_mut() else {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::Internal,
                "Local settings storage is not initialized.",
            ),
        ));
    };
    let record = NamedSettingsProfileRecord {
        name: name.clone(),
        profile_json,
        updated_at_ms,
        active: false,
    };
    if let Err(error) = store.save_named_settings_profile(&record, overwrite) {
        return Ok(error_response(&context, error));
    }
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: NamedSettingsProfileSummary {
            name,
            updated_at_ms,
            active: false,
        },
    })
}

pub(crate) fn stored_settings_profile(
    store: &StateStore,
    name: &str,
) -> Result<(NamedSettingsProfileRecord, SettingsProfileInput), AppError> {
    let record = store
        .named_settings_profile(name)?
        .ok_or_else(|| request_error(ErrorCode::NotFound, "Settings profile was not found."))?;
    let profile = decode_stored_settings_profile(&record.profile_json)?;
    Ok((record, profile))
}

#[tauri::command]
pub fn preview_named_settings_profile_switch(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    name: String,
) -> Result<Response<SettingsProfileSwitchPreview>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let name = match validate_named_settings_profile_name(&name) {
        Ok(name) => name,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stores = match state.store.lock() {
        Ok(stores) => stores,
        Err(_) => {
            return Ok(error_response(
                &context,
                request_error(
                    ErrorCode::Internal,
                    "Local settings storage is unavailable.",
                ),
            ));
        }
    };
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::Internal,
                "Local settings storage is not initialized.",
            ),
        ));
    };
    let (record, profile) = match stored_settings_profile(store, &name) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let current = match store.load_settings() {
        Ok(settings) => settings,
        Err(error) => return Ok(error_response(&context, error)),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: SettingsProfileSwitchPreview {
            name: record.name.clone(),
            changed_field_count: settings_profile_changed_fields(&profile, current),
            confirmation_key: settings_profile_confirmation_key(&record.name, &record.profile_json),
            profile,
        },
    })
}

#[tauri::command]
pub fn execute_named_settings_profile_switch(
    state: tauri::State<'_, AppState>,
    tray_state: tauri::State<'_, crate::tray::TrayState>,
    context: RequestContext,
    name: String,
    confirmation_key: String,
    confirmed: bool,
) -> Result<Response<CatalogSettings>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !confirmed {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::InvalidRequest,
                "Settings profile switch requires confirmation.",
            ),
        ));
    }
    let name = match validate_named_settings_profile_name(&name) {
        Ok(name) => name,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let mut stores = match state.store.lock() {
        Ok(stores) => stores,
        Err(_) => {
            return Ok(error_response(
                &context,
                request_error(
                    ErrorCode::Internal,
                    "Local settings storage is unavailable.",
                ),
            ));
        }
    };
    let Some(store) = stores.as_mut() else {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::Internal,
                "Local settings storage is not initialized.",
            ),
        ));
    };
    let (record, mut profile) = match stored_settings_profile(store, &name) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    if confirmation_key != settings_profile_confirmation_key(&record.name, &record.profile_json) {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::Conflict,
                "Settings profile changed after preview.",
            ),
        ));
    }
    let bindings = match validate_settings_profile(&profile) {
        Ok(bindings) => bindings,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let mut settings = match store.load_settings() {
        Ok(settings) => settings,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let materialization = match themes::plan_theme_profile_materialization(
        store,
        profile.theme_selection.clone(),
        profile.custom_theme_snapshot.clone(),
    ) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    match materialization {
        themes::ThemeProfileMaterialization::Ready {
            selection,
            snapshot,
        } => {
            profile.theme_selection = selection;
            profile.custom_theme_snapshot = snapshot;
            if let Err(error) = apply_settings_profile_to_settings(&mut settings, profile, bindings)
            {
                return Ok(error_response(&context, error));
            }
            if let Err(error) = store.activate_named_settings_profile(&record.name, &settings) {
                return Ok(error_response(&context, error));
            }
        }
        themes::ThemeProfileMaterialization::Create { definition } => {
            if let Err(error) = apply_settings_profile_to_settings(&mut settings, profile, bindings)
            {
                return Ok(error_response(&context, error));
            }
            let definition_json = match themes::canonical_definition_json(&definition) {
                Ok(value) => value,
                Err(error) => return Ok(error_response(&context, error)),
            };
            let name = definition.name.clone();
            if let Err(error) = store.create_custom_theme_and_save_settings(
                &mut settings,
                Some(&record.name),
                &name,
                &definition_json,
                unix_millis().max(0) as u64,
                |settings, theme_record| {
                    themes::apply_theme_record_to_settings(settings, theme_record, definition)
                },
            ) {
                return Ok(error_response(&context, error));
            }
        }
    }
    tray_state.apply_preferences(
        settings.tray_store_on_minimize,
        &settings.tray_close_behavior,
        &settings.tray_restore_gesture,
    );
    let data = catalog_settings_resolved(settings, Some(store));
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[tauri::command]
pub fn delete_named_settings_profile(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    name: String,
    confirmed: bool,
) -> Result<Response<bool>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !confirmed {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::InvalidRequest,
                "Settings profile deletion requires confirmation.",
            ),
        ));
    }
    let name = match validate_named_settings_profile_name(&name) {
        Ok(name) => name,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stores = match state.store.lock() {
        Ok(stores) => stores,
        Err(_) => {
            return Ok(error_response(
                &context,
                request_error(
                    ErrorCode::Internal,
                    "Local settings storage is unavailable.",
                ),
            ));
        }
    };
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::Internal,
                "Local settings storage is not initialized.",
            ),
        ));
    };
    match store.delete_named_settings_profile(&name) {
        Ok(deleted) => Ok(Response::Ok {
            request_id: context.request_id,
            generation: context.generation,
            data: deleted,
        }),
        Err(error) => Ok(error_response(&context, error)),
    }
}
