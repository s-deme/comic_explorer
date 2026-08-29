use std::hash::{DefaultHasher, Hash, Hasher};

use serde::{Deserialize, Serialize};

use crate::api::{RequestContext, Response};
use crate::domain::{AppError, ErrorCode};
use crate::state::{
    CustomThemeRecord, MAX_CUSTOM_THEMES, MAX_THEME_TRANSPORT_INTEGER, Settings, StateStore,
};

use super::{AppState, error_response, request_error, unix_millis, validate_request};

pub const MAX_THEME_DEFINITION_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BuiltinThemeId {
    Light,
    Dark,
    Paper,
    Midnight,
    Oled,
    Forest,
    HighContrast,
    Sakura,
    Ocean,
    Meadow,
    Lavender,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThemeBaseScheme {
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ThemeSelection {
    System,
    Builtin { theme_id: BuiltinThemeId },
    Custom { theme_id: i64, revision: u64 },
}

impl Default for ThemeSelection {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeColorsV1 {
    pub canvas: String,
    pub surface: String,
    pub surface_muted: String,
    pub surface_raised: String,
    pub text: String,
    pub text_muted: String,
    pub border: String,
    pub accent: String,
    pub on_accent: String,
    pub selection: String,
    pub on_selection: String,
    pub focus: String,
    pub danger: String,
    pub on_danger: String,
    pub warning: String,
    pub success: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeDefinitionV1 {
    pub schema_version: u8,
    pub name: String,
    pub base_scheme: ThemeBaseScheme,
    pub colors: ThemeColorsV1,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomThemeSnapshot {
    pub theme_id: i64,
    pub revision: u64,
    pub definition: ThemeDefinitionV1,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeContrastViolation {
    pub foreground: String,
    pub background: String,
    pub actual_ratio: f64,
    pub required_ratio: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomThemeEntry {
    pub theme_id: i64,
    pub revision: u64,
    pub definition: ThemeDefinitionV1,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvalidCustomThemeEntry {
    pub theme_id: i64,
    pub name: String,
    pub reason: String,
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomThemeCatalog {
    pub themes: Vec<CustomThemeEntry>,
    pub invalid_themes: Vec<InvalidCustomThemeEntry>,
    pub maximum_themes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveCustomThemeRequest {
    pub theme_id: Option<i64>,
    pub expected_revision: Option<u64>,
    pub definition: ThemeDefinitionV1,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomThemeExport {
    pub file_name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomThemeImportConflict {
    pub theme_id: i64,
    pub revision: u64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomThemeImportPreview {
    pub definition: ThemeDefinitionV1,
    pub conflict: Option<CustomThemeImportConflict>,
    pub confirmation_key: String,
    pub byte_length: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct NormalizedThemeSettings {
    pub selection: ThemeSelection,
    pub snapshot: Option<CustomThemeSnapshot>,
    pub fallback_reason: Option<String>,
}

fn invalid(message: impl Into<String>) -> AppError {
    request_error(ErrorCode::InvalidRequest, &message.into())
}

fn conflict(message: impl Into<String>) -> AppError {
    request_error(ErrorCode::Conflict, &message.into())
}

fn resource(message: impl Into<String>) -> AppError {
    request_error(ErrorCode::ResourceLimit, &message.into())
}

fn valid_theme_id(theme_id: i64) -> bool {
    theme_id > 0 && theme_id as u64 <= MAX_THEME_TRANSPORT_INTEGER
}

fn valid_revision(revision: u64) -> bool {
    (1..=MAX_THEME_TRANSPORT_INTEGER).contains(&revision)
}

fn ok<T>(context: &RequestContext, data: T) -> Response<T> {
    Response::Ok {
        request_id: context.request_id.clone(),
        generation: context.generation,
        data,
    }
}

fn validate_name(name: &str) -> Result<String, AppError> {
    let normalized = name.trim();
    if !(1..=64).contains(&normalized.encode_utf16().count())
        || normalized
            .chars()
            .any(|character| character.is_control() || matches!(character, '/' | '\\'))
    {
        return Err(invalid(
            "Theme names must contain 1 to 64 UTF-16 code units without control characters.",
        ));
    }
    Ok(normalized.into())
}

fn normalize_hex(value: &str) -> Result<String, AppError> {
    let bytes = value.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' || !bytes[1..].iter().all(u8::is_ascii_hexdigit) {
        return Err(invalid("Theme colors must use the #RRGGBB format."));
    }
    Ok(value.to_ascii_uppercase())
}

fn parse_hex(value: &str) -> [u8; 3] {
    [
        u8::from_str_radix(&value[1..3], 16).expect("validated red channel"),
        u8::from_str_radix(&value[3..5], 16).expect("validated green channel"),
        u8::from_str_radix(&value[5..7], 16).expect("validated blue channel"),
    ]
}

fn relative_luminance(value: &str) -> f64 {
    let channels = parse_hex(value);
    let linear = |channel: u8| {
        let channel = f64::from(channel) / 255.0;
        if channel <= 0.04045 {
            channel / 12.92
        } else {
            ((channel + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * linear(channels[0]) + 0.7152 * linear(channels[1]) + 0.0722 * linear(channels[2])
}

pub(crate) fn contrast_ratio(foreground: &str, background: &str) -> f64 {
    let foreground = relative_luminance(foreground);
    let background = relative_luminance(background);
    (foreground.max(background) + 0.05) / (foreground.min(background) + 0.05)
}

fn color_value<'a>(colors: &'a ThemeColorsV1, key: &str) -> &'a str {
    match key {
        "canvas" => &colors.canvas,
        "surface" => &colors.surface,
        "surfaceMuted" => &colors.surface_muted,
        "surfaceRaised" => &colors.surface_raised,
        "text" => &colors.text,
        "textMuted" => &colors.text_muted,
        "border" => &colors.border,
        "accent" => &colors.accent,
        "onAccent" => &colors.on_accent,
        "selection" => &colors.selection,
        "onSelection" => &colors.on_selection,
        "focus" => &colors.focus,
        "danger" => &colors.danger,
        "onDanger" => &colors.on_danger,
        "warning" => &colors.warning,
        "success" => &colors.success,
        _ => unreachable!("fixed semantic theme key"),
    }
}

pub fn theme_contrast_violations(definition: &ThemeDefinitionV1) -> Vec<ThemeContrastViolation> {
    let surfaces = ["canvas", "surface", "surfaceMuted", "surfaceRaised"];
    let mut pairs = Vec::new();
    for foreground in [
        "text",
        "textMuted",
        "accent",
        "danger",
        "warning",
        "success",
    ] {
        for background in surfaces {
            pairs.push((foreground, background, 4.5));
        }
    }
    pairs.extend([
        ("onAccent", "accent", 4.5),
        ("onSelection", "selection", 4.5),
        ("onDanger", "danger", 4.5),
    ]);
    for foreground in ["border", "focus"] {
        for background in surfaces {
            pairs.push((foreground, background, 3.0));
        }
    }
    pairs
        .into_iter()
        .filter_map(|(foreground, background, required_ratio)| {
            let actual_ratio = contrast_ratio(
                color_value(&definition.colors, foreground),
                color_value(&definition.colors, background),
            );
            (actual_ratio < required_ratio).then(|| ThemeContrastViolation {
                foreground: foreground.into(),
                background: background.into(),
                actual_ratio,
                required_ratio,
            })
        })
        .collect()
}

pub(crate) fn normalize_theme_definition(
    mut definition: ThemeDefinitionV1,
) -> Result<ThemeDefinitionV1, AppError> {
    if definition.schema_version != 1 {
        return Err(invalid("Theme schemaVersion must be 1."));
    }
    definition.name = validate_name(&definition.name)?;
    let colors = &mut definition.colors;
    for color in [
        &mut colors.canvas,
        &mut colors.surface,
        &mut colors.surface_muted,
        &mut colors.surface_raised,
        &mut colors.text,
        &mut colors.text_muted,
        &mut colors.border,
        &mut colors.accent,
        &mut colors.on_accent,
        &mut colors.selection,
        &mut colors.on_selection,
        &mut colors.focus,
        &mut colors.danger,
        &mut colors.on_danger,
        &mut colors.warning,
        &mut colors.success,
    ] {
        *color = normalize_hex(color)?;
    }
    let violations = theme_contrast_violations(&definition);
    if let Some(violation) = violations.first() {
        return Err(invalid(format!(
            "Theme contrast is too low for {} on {} ({:.2}:1; {:.1}:1 required).",
            violation.foreground,
            violation.background,
            violation.actual_ratio,
            violation.required_ratio
        )));
    }
    let bytes = serde_json::to_vec(&definition).map_err(|error| {
        request_error(
            ErrorCode::Internal,
            &format!("Theme serialization failed: {error}"),
        )
    })?;
    if bytes.len() > MAX_THEME_DEFINITION_BYTES {
        return Err(resource("Theme definition exceeds 64 KiB."));
    }
    Ok(definition)
}

pub(crate) fn canonical_definition_json(
    definition: &ThemeDefinitionV1,
) -> Result<String, AppError> {
    let json = serde_json::to_string(definition).map_err(|error| {
        request_error(
            ErrorCode::Internal,
            &format!("Theme serialization failed: {error}"),
        )
    })?;
    if json.len() > MAX_THEME_DEFINITION_BYTES {
        return Err(resource("Theme definition exceeds 64 KiB."));
    }
    Ok(json)
}

fn parse_definition_json(json: &str) -> Result<ThemeDefinitionV1, AppError> {
    if json.len() > MAX_THEME_DEFINITION_BYTES {
        return Err(resource("Theme definition exceeds 64 KiB."));
    }
    serde_json::from_str::<ThemeDefinitionV1>(json)
        .map_err(|_| invalid("Stored custom theme definition is invalid."))
        .and_then(normalize_theme_definition)
}

fn parse_import(bytes: &[u8]) -> Result<ThemeDefinitionV1, AppError> {
    if bytes.is_empty() || bytes.len() > MAX_THEME_DEFINITION_BYTES {
        return Err(resource(
            "Theme import must contain between 1 byte and 64 KiB.",
        ));
    }
    let definition = serde_json::from_slice::<ThemeDefinitionV1>(bytes).map_err(|_| {
        invalid("Theme import must be UTF-8 JSON with the complete schema v1 shape.")
    })?;
    normalize_theme_definition(definition)
}

fn parse_record(record: &CustomThemeRecord) -> Result<CustomThemeEntry, AppError> {
    let definition = parse_definition_json(&record.definition_json)?;
    if definition.name != record.name
        || !valid_theme_id(record.theme_id)
        || !valid_revision(record.revision)
    {
        return Err(invalid("Stored custom theme metadata is inconsistent."));
    }
    Ok(CustomThemeEntry {
        theme_id: record.theme_id,
        revision: record.revision,
        definition,
        created_at_ms: record.created_at_ms,
        updated_at_ms: record.updated_at_ms,
        active: false,
    })
}

fn raw_custom_theme_id(settings: &Settings) -> Option<i64> {
    serde_json::from_str::<ThemeSelection>(&settings.app_theme_selection_json)
        .ok()
        .and_then(|selection| match selection {
            ThemeSelection::Custom { theme_id, revision }
                if valid_theme_id(theme_id) && valid_revision(revision) =>
            {
                Some(theme_id)
            }
            _ => None,
        })
}

fn effective_active_custom_theme_id(store: &StateStore, settings: &Settings) -> Option<i64> {
    match normalize_stored_theme_settings(settings, Some(store)).selection {
        ThemeSelection::Custom { theme_id, .. } => Some(theme_id),
        _ => None,
    }
}

fn reject_active_custom_theme_mutation(store: &StateStore, theme_id: i64) -> Result<(), AppError> {
    let settings = store.load_settings()?;
    if effective_active_custom_theme_id(store, &settings) == Some(theme_id) {
        return Err(conflict(
            "The currently applied custom theme cannot be changed; duplicate it or apply another theme first.",
        ));
    }
    Ok(())
}

fn catalog(store: &StateStore) -> Result<CustomThemeCatalog, AppError> {
    let settings = store.load_settings()?;
    let active_theme_id = effective_active_custom_theme_id(store, &settings);
    let mut themes = Vec::new();
    let mut invalid_themes = Vec::new();
    for record in store.list_custom_theme_records()? {
        match parse_record(&record) {
            Ok(mut theme) => {
                theme.active = active_theme_id == Some(theme.theme_id);
                themes.push(theme);
            }
            Err(error) => invalid_themes.push(InvalidCustomThemeEntry {
                theme_id: record.theme_id,
                name: record.name,
                reason: error.message,
                active: active_theme_id == Some(record.theme_id),
            }),
        }
    }
    Ok(CustomThemeCatalog {
        themes,
        invalid_themes,
        maximum_themes: MAX_CUSTOM_THEMES as usize,
    })
}

fn delete_custom_theme_record(
    store: &mut StateStore,
    theme_id: i64,
) -> Result<CustomThemeCatalog, AppError> {
    let mut settings = store.load_settings()?;
    if effective_active_custom_theme_id(store, &settings) == Some(theme_id) {
        return Err(conflict(
            "The currently applied custom theme cannot be deleted.",
        ));
    }
    if raw_custom_theme_id(&settings) == Some(theme_id) {
        let selection = ThemeSelection::Builtin {
            theme_id: BuiltinThemeId::Light,
        };
        let (selection_json, snapshot_json) = encode_theme_settings(&selection, None)?;
        settings.app_theme_selection_json = selection_json;
        settings.custom_theme_snapshot_json = snapshot_json;
        store.delete_custom_theme_and_save_settings(theme_id, &settings)?;
    } else {
        store.delete_custom_theme(theme_id)?;
    }
    catalog(store)
}

fn snapshot_json(snapshot: &CustomThemeSnapshot) -> Result<String, AppError> {
    serde_json::to_string(snapshot).map_err(|error| {
        request_error(
            ErrorCode::Internal,
            &format!("Theme snapshot serialization failed: {error}"),
        )
    })
}

pub(crate) fn normalize_theme_profile_fields(
    selection: ThemeSelection,
    snapshot: Option<CustomThemeSnapshot>,
) -> Result<(ThemeSelection, Option<CustomThemeSnapshot>), AppError> {
    match (&selection, snapshot) {
        (ThemeSelection::System | ThemeSelection::Builtin { .. }, None) => Ok((selection, None)),
        (ThemeSelection::Custom { theme_id, revision }, Some(mut snapshot))
            if valid_theme_id(*theme_id)
                && valid_revision(*revision)
                && snapshot.theme_id == *theme_id
                && snapshot.revision == *revision =>
        {
            snapshot.definition = normalize_theme_definition(snapshot.definition)?;
            Ok((selection, Some(snapshot)))
        }
        (ThemeSelection::Custom { .. }, _) => Err(invalid(
            "Custom theme selection requires a matching positive ID, revision, and snapshot.",
        )),
        _ => Err(invalid(
            "System and built-in theme selections must not contain a custom snapshot.",
        )),
    }
}

pub(crate) fn encode_theme_settings(
    selection: &ThemeSelection,
    snapshot: Option<&CustomThemeSnapshot>,
) -> Result<(String, Option<String>), AppError> {
    let selection_json = serde_json::to_string(selection).map_err(|error| {
        request_error(
            ErrorCode::Internal,
            &format!("Theme selection serialization failed: {error}"),
        )
    })?;
    let snapshot_json = snapshot.map(snapshot_json).transpose()?;
    Ok((selection_json, snapshot_json))
}

pub(crate) fn normalize_stored_theme_settings(
    settings: &Settings,
    store: Option<&StateStore>,
) -> NormalizedThemeSettings {
    let fallback = |reason: String| NormalizedThemeSettings {
        selection: ThemeSelection::Builtin {
            theme_id: BuiltinThemeId::Light,
        },
        snapshot: None,
        fallback_reason: Some(reason),
    };
    let selection = match serde_json::from_str::<ThemeSelection>(&settings.app_theme_selection_json)
    {
        Ok(selection) => selection,
        Err(_) => {
            return fallback("保存済みテーマ選択が破損しているためライトへ戻しました。".into());
        }
    };
    let snapshot = match settings.custom_theme_snapshot_json.as_deref() {
        Some(json) => match serde_json::from_str::<CustomThemeSnapshot>(json) {
            Ok(snapshot) => Some(snapshot),
            Err(_) => {
                return fallback(
                    "保存済みカスタムテーマが破損しているためライトへ戻しました。".into(),
                );
            }
        },
        None => None,
    };
    let (selection, snapshot) = match normalize_theme_profile_fields(selection, snapshot) {
        Ok(value) => value,
        Err(_) => return fallback("保存済みテーマが不整合なためライトへ戻しました。".into()),
    };
    if let (Some(store), ThemeSelection::Custom { theme_id, revision }) = (store, &selection) {
        let record = match store.custom_theme_record(*theme_id) {
            Ok(Some(record)) => record,
            Ok(None) => {
                return fallback("カスタムテーマが見つからないためライトへ戻しました。".into());
            }
            Err(_) => {
                return fallback("カスタムテーマを確認できないためライトへ戻しました。".into());
            }
        };
        let entry = match parse_record(&record) {
            Ok(entry) => entry,
            Err(_) => {
                return fallback("カスタムテーマが破損しているためライトへ戻しました。".into());
            }
        };
        let snapshot = snapshot
            .as_ref()
            .expect("custom theme settings normalization requires a snapshot");
        if entry.revision != *revision || entry.definition != snapshot.definition {
            return fallback(
                "保存済みカスタムテーマが更新され不整合なためライトへ戻しました。".into(),
            );
        }
    }
    NormalizedThemeSettings {
        selection,
        snapshot,
        fallback_reason: None,
    }
}

fn truncate_utf16(value: &str, maximum: usize) -> String {
    let mut length = 0usize;
    value
        .chars()
        .take_while(|character| {
            let next = length + character.len_utf16();
            if next > maximum {
                false
            } else {
                length = next;
                true
            }
        })
        .collect()
}

fn available_copy_definition(
    store: &StateStore,
    definition: &ThemeDefinitionV1,
) -> Result<ThemeDefinitionV1, AppError> {
    for copy_number in 1..=MAX_CUSTOM_THEMES {
        let suffix = if copy_number == 1 {
            " (copy)".to_owned()
        } else {
            format!(" (copy {copy_number})")
        };
        let maximum_base = 64usize.saturating_sub(suffix.encode_utf16().count());
        let name = format!(
            "{}{}",
            truncate_utf16(&definition.name, maximum_base),
            suffix
        );
        if store.custom_theme_record_by_name(&name)?.is_none() {
            let mut copy = definition.clone();
            copy.name = name;
            return normalize_theme_definition(copy);
        }
    }
    Err(resource("No unique custom theme copy name is available."))
}

pub(crate) enum ThemeProfileMaterialization {
    Ready {
        selection: ThemeSelection,
        snapshot: Option<CustomThemeSnapshot>,
    },
    Create {
        definition: ThemeDefinitionV1,
    },
}

pub(crate) fn plan_theme_profile_materialization(
    store: &StateStore,
    selection: ThemeSelection,
    snapshot: Option<CustomThemeSnapshot>,
) -> Result<ThemeProfileMaterialization, AppError> {
    let (selection, snapshot) = normalize_theme_profile_fields(selection, snapshot)?;
    let ThemeSelection::Custom { theme_id, revision } = selection else {
        return Ok(ThemeProfileMaterialization::Ready {
            selection,
            snapshot: None,
        });
    };
    let snapshot = snapshot.expect("custom selection normalization requires snapshot");
    let expected_json = canonical_definition_json(&snapshot.definition)?;
    if let Some(record) = store.custom_theme_record(theme_id)? {
        if let Ok(entry) = parse_record(&record)
            && entry.revision == revision
            && canonical_definition_json(&entry.definition)? == expected_json
        {
            return Ok(ThemeProfileMaterialization::Ready {
                selection: ThemeSelection::Custom { theme_id, revision },
                snapshot: Some(snapshot),
            });
        }
    }

    // A profile snapshot is portable. Reuse an identical local definition
    // when possible; otherwise create a non-overwriting safe copy.
    for record in store.list_custom_theme_records()? {
        if let Ok(entry) = parse_record(&record)
            && entry.definition == snapshot.definition
        {
            let snapshot = CustomThemeSnapshot {
                theme_id: entry.theme_id,
                revision: entry.revision,
                definition: entry.definition,
            };
            return Ok(ThemeProfileMaterialization::Ready {
                selection: ThemeSelection::Custom {
                    theme_id: snapshot.theme_id,
                    revision: snapshot.revision,
                },
                snapshot: Some(snapshot),
            });
        }
    }

    let definition = if store
        .custom_theme_record_by_name(&snapshot.definition.name)?
        .is_some()
    {
        available_copy_definition(store, &snapshot.definition)?
    } else {
        snapshot.definition
    };
    Ok(ThemeProfileMaterialization::Create { definition })
}

pub(crate) fn theme_profile_fields_for_record(
    record: &CustomThemeRecord,
    definition: ThemeDefinitionV1,
) -> (ThemeSelection, Option<CustomThemeSnapshot>) {
    let snapshot = CustomThemeSnapshot {
        theme_id: record.theme_id,
        revision: record.revision,
        definition,
    };
    (
        ThemeSelection::Custom {
            theme_id: snapshot.theme_id,
            revision: snapshot.revision,
        },
        Some(snapshot),
    )
}

pub(crate) fn apply_theme_record_to_settings(
    settings: &mut Settings,
    record: &CustomThemeRecord,
    definition: ThemeDefinitionV1,
) -> Result<(), AppError> {
    let (selection, snapshot) = theme_profile_fields_for_record(record, definition);
    let (selection_json, snapshot_json) = encode_theme_settings(&selection, snapshot.as_ref())?;
    settings.app_theme_selection_json = selection_json;
    settings.custom_theme_snapshot_json = snapshot_json;
    Ok(())
}

fn import_confirmation_key(bytes: &[u8], conflict: Option<&CustomThemeRecord>) -> String {
    let mut hasher = DefaultHasher::new();
    "custom-theme-import-v1".hash(&mut hasher);
    bytes.hash(&mut hasher);
    if let Some(record) = conflict {
        record.theme_id.hash(&mut hasher);
        record.revision.hash(&mut hasher);
        record.name.to_lowercase().hash(&mut hasher);
        record.definition_json.hash(&mut hasher);
    }
    format!("{:016x}", hasher.finish())
}

fn import_preview(store: &StateStore, bytes: &[u8]) -> Result<CustomThemeImportPreview, AppError> {
    let definition = parse_import(bytes)?;
    let conflict = store.custom_theme_record_by_name(&definition.name)?;
    let confirmation_key = import_confirmation_key(bytes, conflict.as_ref());
    Ok(CustomThemeImportPreview {
        definition,
        conflict: conflict.map(|record| CustomThemeImportConflict {
            theme_id: record.theme_id,
            revision: record.revision,
            name: record.name,
        }),
        confirmation_key,
        byte_length: bytes.len(),
    })
}

#[tauri::command]
pub fn list_custom_themes(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<CustomThemeCatalog>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    Ok(match catalog(store) {
        Ok(value) => ok(&context, value),
        Err(error) => error_response(&context, error),
    })
}

#[tauri::command]
pub fn save_custom_theme(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    request: SaveCustomThemeRequest,
) -> Result<Response<CustomThemeCatalog>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let definition = match normalize_theme_definition(request.definition) {
        Ok(definition) => definition,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let definition_json = match canonical_definition_json(&definition) {
        Ok(json) => json,
        Err(error) => return Ok(error_response(&context, error)),
    };
    if !matches!((request.theme_id, request.expected_revision), (None, None))
        && !matches!(
            (request.theme_id, request.expected_revision),
            (Some(theme_id), Some(revision))
                if valid_theme_id(theme_id) && valid_revision(revision)
        )
    {
        return Ok(error_response(
            &context,
            invalid("Theme ID and expected revision must both be omitted or positive."),
        ));
    }
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    let now_ms = unix_millis().max(0) as u64;
    let result = match (request.theme_id, request.expected_revision) {
        (Some(theme_id), Some(revision)) => reject_active_custom_theme_mutation(store, theme_id)
            .and_then(|()| {
                store.update_custom_theme(
                    theme_id,
                    revision,
                    &definition.name,
                    &definition_json,
                    now_ms,
                )
            }),
        (None, None) => store.create_custom_theme(&definition.name, &definition_json, now_ms),
        _ => unreachable!("validated theme save shape"),
    };
    if let Err(error) = result {
        return Ok(error_response(&context, error));
    }
    Ok(match catalog(store) {
        Ok(value) => ok(&context, value),
        Err(error) => error_response(&context, error),
    })
}

#[tauri::command]
pub fn delete_custom_theme(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    theme_id: i64,
    confirmed: bool,
) -> Result<Response<CustomThemeCatalog>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !valid_theme_id(theme_id) || !confirmed {
        return Ok(error_response(
            &context,
            invalid("Custom theme deletion requires a positive ID and confirmation."),
        ));
    }
    let mut guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_mut() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    Ok(match delete_custom_theme_record(store, theme_id) {
        Ok(value) => ok(&context, value),
        Err(error) => error_response(&context, error),
    })
}

#[tauri::command]
pub fn export_custom_theme(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    theme_id: i64,
) -> Result<Response<CustomThemeExport>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !valid_theme_id(theme_id) {
        return Ok(error_response(
            &context,
            invalid("Custom theme ID is invalid."),
        ));
    }
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    let record = match store.custom_theme_record(theme_id) {
        Ok(Some(record)) => record,
        Ok(None) => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::NotFound, "Custom theme was not found."),
            ));
        }
        Err(error) => return Ok(error_response(&context, error)),
    };
    let entry = match parse_record(&record) {
        Ok(entry) => entry,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let mut bytes = match serde_json::to_vec_pretty(&entry.definition) {
        Ok(bytes) => bytes,
        Err(error) => return Err(format!("theme export serialization failed: {error}")),
    };
    bytes.push(b'\n');
    if bytes.len() > MAX_THEME_DEFINITION_BYTES {
        return Ok(error_response(
            &context,
            resource("Theme export exceeds 64 KiB."),
        ));
    }
    Ok(ok(
        &context,
        CustomThemeExport {
            file_name: format!("comic-explorer-theme-{theme_id}.json"),
            bytes,
        },
    ))
}

#[tauri::command]
pub fn preview_custom_theme_import(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    bytes: Vec<u8>,
) -> Result<Response<CustomThemeImportPreview>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    Ok(match import_preview(store, &bytes) {
        Ok(value) => ok(&context, value),
        Err(error) => error_response(&context, error),
    })
}

#[tauri::command]
pub fn execute_custom_theme_import(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    bytes: Vec<u8>,
    confirmation_key: String,
    replace_existing: bool,
) -> Result<Response<CustomThemeCatalog>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    let preview = match import_preview(store, &bytes) {
        Ok(preview) => preview,
        Err(error) => return Ok(error_response(&context, error)),
    };
    if preview.confirmation_key != confirmation_key {
        return Ok(error_response(
            &context,
            conflict("Custom theme import preview is stale or unconfirmed."),
        ));
    }
    let definition_json = match canonical_definition_json(&preview.definition) {
        Ok(json) => json,
        Err(error) => return Ok(error_response(&context, error)),
    };
    if replace_existing
        && let Some(conflict) = preview.conflict.as_ref()
        && let Err(error) = reject_active_custom_theme_mutation(store, conflict.theme_id)
    {
        return Ok(error_response(&context, error));
    }
    let now_ms = unix_millis().max(0) as u64;
    let result = match (preview.conflict, replace_existing) {
        (None, false) => {
            store.create_custom_theme(&preview.definition.name, &definition_json, now_ms)
        }
        (Some(conflict), true) => store.replace_custom_theme_by_name(
            &preview.definition.name,
            &definition_json,
            conflict.theme_id,
            conflict.revision,
            now_ms,
        ),
        (Some(_), false) => Err(conflict(
            "A custom theme with that name exists; explicit replace is required.",
        )),
        (None, true) => Err(invalid(
            "Replace may be requested only when the preview reports a name conflict.",
        )),
    };
    if let Err(error) = result {
        return Ok(error_response(&context, error));
    }
    Ok(match catalog(store) {
        Ok(value) => ok(&context, value),
        Err(error) => error_response(&context, error),
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;
    use crate::state::AppPaths;

    fn temporary_paths(label: &str) -> AppPaths {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        AppPaths::under(
            std::env::temp_dir().join(format!("comic-explorer-theme-application-{label}-{nonce}")),
        )
    }

    fn valid_definition() -> ThemeDefinitionV1 {
        ThemeDefinitionV1 {
            schema_version: 1,
            name: "Night Blue".into(),
            base_scheme: ThemeBaseScheme::Dark,
            colors: ThemeColorsV1 {
                canvas: "#080B10".into(),
                surface: "#10151D".into(),
                surface_muted: "#171D27".into(),
                surface_raised: "#1D2531".into(),
                text: "#FFFFFF".into(),
                text_muted: "#C4CFDC".into(),
                border: "#8B9AAF".into(),
                accent: "#84BDFF".into(),
                on_accent: "#061426".into(),
                selection: "#B9D9FF".into(),
                on_selection: "#081522".into(),
                focus: "#F2C94C".into(),
                danger: "#FF8C8C".into(),
                on_danger: "#250000".into(),
                warning: "#FFD166".into(),
                success: "#79E09A".into(),
            },
        }
    }

    #[test]
    fn fr_b24_accepts_every_builtin_theme_selection() {
        for theme_id in [
            "light",
            "dark",
            "paper",
            "midnight",
            "oled",
            "forest",
            "highContrast",
            "sakura",
            "ocean",
            "meadow",
            "lavender",
        ] {
            let selection: ThemeSelection =
                serde_json::from_str(&format!(r#"{{"kind":"builtin","themeId":"{theme_id}"}}"#,))
                    .unwrap();
            assert!(normalize_theme_profile_fields(selection, None).is_ok());
        }
    }

    #[test]
    fn fr_b24_definition_is_strict_canonical_and_contrast_checked() {
        let mut definition = valid_definition();
        definition.name = "  Night Blue  ".into();
        definition.colors.text = "#ffffff".into();
        let normalized = normalize_theme_definition(definition).unwrap();
        assert_eq!(normalized.name, "Night Blue");
        assert_eq!(normalized.colors.text, "#FFFFFF");
        assert!(theme_contrast_violations(&normalized).is_empty());

        let mut low_contrast = normalized.clone();
        low_contrast.colors.text_muted = low_contrast.colors.surface.clone();
        assert_eq!(
            normalize_theme_definition(low_contrast).unwrap_err().code,
            ErrorCode::InvalidRequest
        );

        let unknown = serde_json::to_value(normalized).unwrap();
        let mut unknown = unknown.as_object().unwrap().clone();
        unknown.insert("css".into(), serde_json::json!("body{}"));
        assert!(serde_json::from_value::<ThemeDefinitionV1>(unknown.into()).is_err());
    }

    #[test]
    fn fr_b24_selection_requires_exact_custom_snapshot_shape() {
        let definition = normalize_theme_definition(valid_definition()).unwrap();
        let selection = ThemeSelection::Custom {
            theme_id: 4,
            revision: 2,
        };
        let snapshot = CustomThemeSnapshot {
            theme_id: 4,
            revision: 2,
            definition,
        };
        assert!(normalize_theme_profile_fields(selection.clone(), Some(snapshot.clone())).is_ok());
        assert!(normalize_theme_profile_fields(selection, None).is_err());
        assert!(
            normalize_theme_profile_fields(ThemeSelection::System, Some(snapshot.clone())).is_err()
        );
        let unsafe_id = MAX_THEME_TRANSPORT_INTEGER as i64 + 1;
        let mut unsafe_snapshot = snapshot.clone();
        unsafe_snapshot.theme_id = unsafe_id;
        assert!(
            normalize_theme_profile_fields(
                ThemeSelection::Custom {
                    theme_id: unsafe_id,
                    revision: 2,
                },
                Some(unsafe_snapshot),
            )
            .is_err()
        );
        let mut unknown_snapshot = serde_json::to_value(snapshot).unwrap();
        unknown_snapshot
            .as_object_mut()
            .unwrap()
            .insert("css".into(), serde_json::json!("body{}"));
        assert!(serde_json::from_value::<CustomThemeSnapshot>(unknown_snapshot).is_err());
    }

    #[test]
    fn req_fr_b24_004_import_is_byte_bounded_previewed_and_stale_safe() {
        let paths = temporary_paths("import");
        let store = StateStore::open(&paths).unwrap().0;
        let definition = normalize_theme_definition(valid_definition()).unwrap();
        let bytes = serde_json::to_vec(&definition).unwrap();
        let preview = import_preview(&store, &bytes).unwrap();
        assert!(preview.conflict.is_none());
        assert_eq!(preview.byte_length, bytes.len());
        let created = store
            .create_custom_theme(
                &definition.name,
                &canonical_definition_json(&definition).unwrap(),
                1,
            )
            .unwrap();
        let conflict_preview = import_preview(&store, &bytes).unwrap();
        assert_eq!(
            conflict_preview.conflict.as_ref().unwrap().theme_id,
            created.theme_id
        );
        assert_ne!(preview.confirmation_key, conflict_preview.confirmation_key);
        assert_eq!(
            parse_import(&vec![b' '; MAX_THEME_DEFINITION_BYTES + 1])
                .unwrap_err()
                .code,
            ErrorCode::ResourceLimit
        );
        assert_eq!(
            parse_import(&[0xff, 0xfe]).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn req_fr_b24_005_portable_snapshot_materializes_without_overwrite() {
        let paths = temporary_paths("snapshot");
        let mut store = StateStore::open(&paths).unwrap().0;
        let definition = normalize_theme_definition(valid_definition()).unwrap();
        let mut same_palette_different_name = definition.clone();
        same_palette_different_name.name = "Local Alias".into();
        store
            .create_custom_theme(
                &same_palette_different_name.name,
                &canonical_definition_json(&same_palette_different_name).unwrap(),
                1,
            )
            .unwrap();
        store
            .create_custom_theme(
                &definition.name,
                &canonical_definition_json(&{
                    let mut other = definition.clone();
                    other.colors.canvas = "#000000".into();
                    other
                })
                .unwrap(),
                1,
            )
            .unwrap();
        let selection = ThemeSelection::Custom {
            theme_id: 777,
            revision: 9,
        };
        let snapshot = CustomThemeSnapshot {
            theme_id: 777,
            revision: 9,
            definition,
        };
        let ThemeProfileMaterialization::Create { definition } =
            plan_theme_profile_materialization(&store, selection, Some(snapshot)).unwrap()
        else {
            panic!("expected a portable copy plan");
        };
        let mut settings = store.load_settings().unwrap();
        let definition_json = canonical_definition_json(&definition).unwrap();
        let name = definition.name.clone();
        let record = store
            .create_custom_theme_and_save_settings(
                &mut settings,
                None,
                &name,
                &definition_json,
                2,
                |settings, record| apply_theme_record_to_settings(settings, record, definition),
            )
            .unwrap();
        let normalized = normalize_stored_theme_settings(&settings, Some(&store));
        let selection = normalized.selection;
        let snapshot = normalized.snapshot;
        let ThemeSelection::Custom { theme_id, revision } = selection else {
            panic!("expected custom selection");
        };
        assert_eq!(record.theme_id, theme_id);
        assert_eq!(revision, 1);
        assert_eq!(snapshot.unwrap().definition.name, "Night Blue (copy)");
        assert_eq!(store.list_custom_theme_records().unwrap().len(), 3);
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn req_fr_b24_004_and_005_active_mutation_is_rejected_and_stale_records_fall_back() {
        let paths = temporary_paths("active-stale");
        let mut store = StateStore::open(&paths).unwrap().0;
        let definition = normalize_theme_definition(valid_definition()).unwrap();
        let definition_json = canonical_definition_json(&definition).unwrap();
        let record = store
            .create_custom_theme(&definition.name, &definition_json, 1)
            .unwrap();
        let mut settings = store.load_settings().unwrap();
        apply_theme_record_to_settings(&mut settings, &record, definition.clone()).unwrap();
        store.save_settings(&settings).unwrap();

        assert_eq!(
            reject_active_custom_theme_mutation(&store, record.theme_id)
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        let import = import_preview(&store, definition_json.as_bytes()).unwrap();
        assert_eq!(import.conflict.unwrap().theme_id, record.theme_id);
        assert_eq!(
            reject_active_custom_theme_mutation(&store, record.theme_id)
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        assert!(
            normalize_stored_theme_settings(&settings, Some(&store))
                .fallback_reason
                .is_none()
        );

        let mut changed_definition = definition.clone();
        changed_definition.base_scheme = ThemeBaseScheme::Light;
        let changed_json = canonical_definition_json(&changed_definition).unwrap();
        store
            .connection()
            .execute(
                "UPDATE custom_themes SET definition_json=?1 WHERE id=?2",
                rusqlite::params![changed_json, record.theme_id],
            )
            .unwrap();
        assert!(
            normalize_stored_theme_settings(&settings, Some(&store))
                .fallback_reason
                .is_some()
        );
        store
            .connection()
            .execute(
                "UPDATE custom_themes SET definition_json=?1 WHERE id=?2",
                rusqlite::params![definition_json, record.theme_id],
            )
            .unwrap();
        store
            .update_custom_theme(
                record.theme_id,
                record.revision,
                &definition.name,
                &canonical_definition_json(&definition).unwrap(),
                2,
            )
            .unwrap();
        assert!(
            normalize_stored_theme_settings(&settings, Some(&store))
                .fallback_reason
                .is_some()
        );
        assert!(reject_active_custom_theme_mutation(&store, record.theme_id).is_ok());
        let stale_catalog = catalog(&store).unwrap();
        assert_eq!(stale_catalog.themes.len(), 1);
        assert!(!stale_catalog.themes[0].active);
        let repaired_catalog = delete_custom_theme_record(&mut store, record.theme_id).unwrap();
        assert!(repaired_catalog.themes.is_empty());
        assert!(repaired_catalog.invalid_themes.is_empty());
        let repaired_settings = store.load_settings().unwrap();
        assert_eq!(
            serde_json::from_str::<ThemeSelection>(&repaired_settings.app_theme_selection_json)
                .unwrap(),
            ThemeSelection::Builtin {
                theme_id: BuiltinThemeId::Light
            }
        );
        assert!(repaired_settings.custom_theme_snapshot_json.is_none());
        assert!(
            normalize_stored_theme_settings(&repaired_settings, Some(&store))
                .fallback_reason
                .is_none()
        );
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }

    #[test]
    fn req_fr_b24_005_corrupt_or_missing_stored_reference_falls_back_without_deletion() {
        let paths = temporary_paths("fallback");
        let store = StateStore::open(&paths).unwrap().0;
        let definition = normalize_theme_definition(valid_definition()).unwrap();
        let snapshot = CustomThemeSnapshot {
            theme_id: 88,
            revision: 1,
            definition,
        };
        let mut settings = Settings::default();
        settings.app_theme_selection_json = serde_json::to_string(&ThemeSelection::Custom {
            theme_id: 88,
            revision: 1,
        })
        .unwrap();
        settings.custom_theme_snapshot_json = Some(snapshot_json(&snapshot).unwrap());
        let normalized = normalize_stored_theme_settings(&settings, Some(&store));
        assert_eq!(
            normalized.selection,
            ThemeSelection::Builtin {
                theme_id: BuiltinThemeId::Light
            }
        );
        assert!(normalized.fallback_reason.is_some());
        assert!(store.list_custom_theme_records().unwrap().is_empty());
        drop(store);
        fs::remove_dir_all(paths.root).unwrap();
    }
}
