use std::collections::HashSet;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::api::{RequestContext, Response};
use crate::catalog::{CatalogEntry, enumerate_folder_with_hidden};
use crate::domain::{AppError, ErrorCode, ItemKind, RelativePath};
use crate::state::CsvExportPresetRecord;

use super::{AppState, error_response, request_error, unix_millis, validate_request};

const MAX_COLUMNS: usize = 12;
const MAX_PRESET_JSON_BYTES: usize = 8_192;
const MAX_EXPORT_ROWS: usize = 50_000;
const MAX_EXPORT_BYTES: usize = 16 * 1024 * 1024;
const MAX_RECURSION_DEPTH: usize = 64;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum CsvColumn {
    Name,
    Stem,
    Extension,
    Kind,
    RelativePath,
    Size,
    ModifiedMs,
    NamePart1,
    NamePart2,
    NamePart3,
    NamePart4,
}

impl CsvColumn {
    fn header(self) -> &'static str {
        match self {
            Self::Name => "name",
            Self::Stem => "stem",
            Self::Extension => "extension",
            Self::Kind => "kind",
            Self::RelativePath => "relativePath",
            Self::Size => "size",
            Self::ModifiedMs => "modifiedMs",
            Self::NamePart1 => "namePart1",
            Self::NamePart2 => "namePart2",
            Self::NamePart3 => "namePart3",
            Self::NamePart4 => "namePart4",
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CsvSizeUnit {
    Bytes,
    Kib,
    Mib,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CsvExportConfig {
    pub columns: Vec<CsvColumn>,
    pub include_header: bool,
    pub size_unit: CsvSizeUnit,
    #[serde(default)]
    pub split_delimiter: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CsvExportPreset {
    pub name: String,
    pub config: CsvExportConfig,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CsvExportScope {
    Selected,
    Current,
    Recursive,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CsvExportRequest {
    pub config: CsvExportConfig,
    pub scope: CsvExportScope,
    pub current_path: String,
    #[serde(default)]
    pub selected_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CsvExportResult {
    pub file_name: String,
    pub bytes: Vec<u8>,
    pub row_count: usize,
}

fn invalid(message: &str) -> AppError {
    request_error(ErrorCode::InvalidRequest, message)
}

fn validate_name(name: &str) -> Result<String, AppError> {
    let normalized = name.trim();
    let length = normalized.encode_utf16().count();
    if !(1..=64).contains(&length)
        || normalized
            .chars()
            .any(|value| value.is_control() || matches!(value, '/' | '\\'))
    {
        return Err(invalid("CSV export preset name is invalid."));
    }
    Ok(normalized.to_owned())
}

fn validate_config(config: CsvExportConfig) -> Result<CsvExportConfig, AppError> {
    if config.columns.is_empty() || config.columns.len() > MAX_COLUMNS {
        return Err(invalid("CSV export must contain between 1 and 12 columns."));
    }
    let unique = config.columns.iter().copied().collect::<HashSet<_>>();
    if unique.len() != config.columns.len() {
        return Err(invalid("CSV export columns must be unique."));
    }
    if let Some(delimiter) = config.split_delimiter.as_deref() {
        let length = delimiter.encode_utf16().count();
        if length == 0
            || length > 8
            || delimiter
                .chars()
                .any(|value| value.is_control() || matches!(value, '/' | '\\'))
        {
            return Err(invalid("CSV filename delimiter is invalid."));
        }
    }
    Ok(config)
}

fn store_unavailable() -> AppError {
    request_error(ErrorCode::InvalidRequest, "State store is not available.")
}

#[tauri::command]
pub fn list_csv_export_presets(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Vec<CsvExportPreset>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let store = match guard.as_ref() {
        Some(store) => store,
        None => return Ok(error_response(&context, store_unavailable())),
    };
    let records = match store.list_csv_export_presets() {
        Ok(records) => records,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let mut presets = Vec::with_capacity(records.len());
    for record in records {
        let config = match serde_json::from_str::<CsvExportConfig>(&record.config_json)
            .map_err(|_| invalid("Stored CSV export preset is invalid."))
            .and_then(validate_config)
        {
            Ok(config) => config,
            Err(error) => return Ok(error_response(&context, error)),
        };
        presets.push(CsvExportPreset {
            name: record.name,
            config,
            updated_at_ms: record.updated_at_ms,
        });
    }
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: presets,
    })
}

#[tauri::command]
pub fn save_csv_export_preset(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    name: String,
    config: CsvExportConfig,
    overwrite: bool,
) -> Result<Response<CsvExportPreset>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let name = match validate_name(&name) {
        Ok(name) => name,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let config = match validate_config(config) {
        Ok(config) => config,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let config_json = match serde_json::to_string(&config) {
        Ok(value) if value.len() <= MAX_PRESET_JSON_BYTES => value,
        _ => {
            return Ok(error_response(
                &context,
                invalid("CSV export preset is too large."),
            ));
        }
    };
    let updated_at_ms = unix_millis().max(0) as u64;
    let record = CsvExportPresetRecord {
        name: name.clone(),
        config_json,
        updated_at_ms,
    };
    let mut guard = state.store.lock().map_err(|_| "state poisoned")?;
    let store = match guard.as_mut() {
        Some(store) => store,
        None => return Ok(error_response(&context, store_unavailable())),
    };
    if let Err(error) = store.save_csv_export_preset(&record, overwrite) {
        return Ok(error_response(&context, error));
    }
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: CsvExportPreset {
            name,
            config,
            updated_at_ms,
        },
    })
}

#[tauri::command]
pub fn delete_csv_export_preset(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    name: String,
    confirmed: bool,
) -> Result<Response<()>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !confirmed {
        return Ok(error_response(
            &context,
            invalid("CSV export preset deletion requires confirmation."),
        ));
    }
    let name = match validate_name(&name) {
        Ok(name) => name,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let mut guard = state.store.lock().map_err(|_| "state poisoned")?;
    let store = match guard.as_mut() {
        Some(store) => store,
        None => return Ok(error_response(&context, store_unavailable())),
    };
    if let Err(error) = store.delete_csv_export_preset(&name) {
        return Ok(error_response(&context, error));
    }
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: (),
    })
}

fn current_root(state: &AppState) -> Result<std::path::PathBuf, AppError> {
    state
        .library_root
        .lock()
        .map_err(|_| request_error(ErrorCode::Internal, "Library state is unavailable."))?
        .clone()
        .ok_or_else(|| invalid("Library root is not configured."))
}

fn show_hidden(state: &AppState) -> bool {
    state
        .store
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().and_then(|store| store.load_settings().ok()))
        .is_some_and(|settings| settings.show_hidden_files)
}

fn is_reparse_point(path: &Path) -> bool {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return true;
    };
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(windows))]
    false
}

fn collect_entries(
    root: &Path,
    current: &RelativePath,
    scope: CsvExportScope,
    selected_paths: &[String],
    include_hidden: bool,
) -> Result<Vec<CatalogEntry>, AppError> {
    let directory = root.join(current.as_str());
    let direct = enumerate_folder_with_hidden(root, &directory, include_hidden)?;
    match scope {
        CsvExportScope::Current => Ok(direct),
        CsvExportScope::Selected => {
            if selected_paths.is_empty() || selected_paths.len() > MAX_EXPORT_ROWS {
                return Err(invalid("CSV selected scope requires 1 to 50000 items."));
            }
            let mut requested = HashSet::with_capacity(selected_paths.len());
            for value in selected_paths {
                let parsed = RelativePath::parse(value.clone())
                    .map_err(|_| invalid("CSV selection contains an invalid path."))?;
                if !requested.insert(parsed.as_str().to_owned()) {
                    return Err(invalid("CSV selection contains duplicate items."));
                }
            }
            let filtered = direct
                .into_iter()
                .filter(|entry| requested.contains(entry.relative_path.as_str()))
                .collect::<Vec<_>>();
            if filtered.len() != requested.len() {
                return Err(invalid(
                    "CSV selection must contain only current folder items.",
                ));
            }
            Ok(filtered)
        }
        CsvExportScope::Recursive => {
            let mut result = Vec::new();
            let mut pending = vec![(current.clone(), 0_usize)];
            while let Some((relative, depth)) = pending.pop() {
                if depth > MAX_RECURSION_DEPTH {
                    return Err(invalid("CSV recursive scope exceeds depth 64."));
                }
                let entries = enumerate_folder_with_hidden(
                    root,
                    &root.join(relative.as_str()),
                    include_hidden,
                )?;
                for entry in entries {
                    if result.len() >= MAX_EXPORT_ROWS {
                        return Err(invalid("CSV export exceeds 50000 rows."));
                    }
                    if entry.kind == ItemKind::Folder
                        && !is_reparse_point(&root.join(entry.relative_path.as_str()))
                    {
                        pending.push((entry.relative_path.clone(), depth + 1));
                    }
                    result.push(entry);
                }
            }
            result.sort_by(|left, right| {
                left.relative_path
                    .as_str()
                    .cmp(right.relative_path.as_str())
            });
            Ok(result)
        }
    }
}

fn entry_name(entry: &CatalogEntry) -> &str {
    entry
        .relative_path
        .as_str()
        .rsplit('/')
        .next()
        .unwrap_or_default()
}

fn stem_and_extension(name: &str) -> (&str, &str) {
    match name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() => (stem, extension),
        _ => (name, ""),
    }
}

fn item_kind(kind: ItemKind) -> &'static str {
    match kind {
        ItemKind::Folder => "folder",
        ItemKind::ComicFolder => "comicFolder",
        ItemKind::Archive => "archive",
        ItemKind::Pdf => "pdf",
        ItemKind::Page => "page",
        ItemKind::Unsupported => "unsupported",
    }
}

fn size_value(value: Option<u64>, unit: CsvSizeUnit) -> String {
    let Some(value) = value else {
        return String::new();
    };
    match unit {
        CsvSizeUnit::Bytes => value.to_string(),
        CsvSizeUnit::Kib => format!("{:.2}", value as f64 / 1024.0),
        CsvSizeUnit::Mib => format!("{:.2}", value as f64 / (1024.0 * 1024.0)),
    }
}

fn column_value(entry: &CatalogEntry, column: CsvColumn, config: &CsvExportConfig) -> String {
    let name = entry_name(entry);
    let (stem, extension) = stem_and_extension(name);
    let parts = config
        .split_delimiter
        .as_deref()
        .map(|delimiter| stem.splitn(4, delimiter).collect::<Vec<_>>())
        .unwrap_or_else(|| vec![stem]);
    match column {
        CsvColumn::Name => name.to_owned(),
        CsvColumn::Stem => stem.to_owned(),
        CsvColumn::Extension => extension.to_owned(),
        CsvColumn::Kind => item_kind(entry.kind).to_owned(),
        CsvColumn::RelativePath => entry.relative_path.as_str().to_owned(),
        CsvColumn::Size => size_value(entry.byte_size, config.size_unit),
        CsvColumn::ModifiedMs => entry
            .modified_ms
            .map(|value| value.to_string())
            .unwrap_or_default(),
        CsvColumn::NamePart1 => parts.first().copied().unwrap_or_default().to_owned(),
        CsvColumn::NamePart2 => parts.get(1).copied().unwrap_or_default().to_owned(),
        CsvColumn::NamePart3 => parts.get(2).copied().unwrap_or_default().to_owned(),
        CsvColumn::NamePart4 => parts.get(3).copied().unwrap_or_default().to_owned(),
    }
}

fn csv_cell(value: &str) -> String {
    let mut safe = String::with_capacity(value.len() + 3);
    if value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        safe.push('\'');
    }
    safe.push_str(value);
    if safe.contains([',', '"', '\r', '\n']) {
        format!("\"{}\"", safe.replace('"', "\"\""))
    } else {
        safe
    }
}

fn push_csv_row(
    bytes: &mut Vec<u8>,
    values: impl IntoIterator<Item = String>,
) -> Result<(), AppError> {
    let line = values
        .into_iter()
        .map(|value| csv_cell(&value))
        .collect::<Vec<_>>()
        .join(",");
    if bytes.len().saturating_add(line.len()).saturating_add(2) > MAX_EXPORT_BYTES {
        return Err(invalid("CSV export exceeds 16 MiB."));
    }
    bytes.extend_from_slice(line.as_bytes());
    bytes.extend_from_slice(b"\r\n");
    Ok(())
}

fn build_csv(config: &CsvExportConfig, entries: &[CatalogEntry]) -> Result<Vec<u8>, AppError> {
    if entries.len() > MAX_EXPORT_ROWS {
        return Err(invalid("CSV export exceeds 50000 rows."));
    }
    let mut bytes = Vec::with_capacity(entries.len().saturating_mul(96).min(MAX_EXPORT_BYTES));
    bytes.extend_from_slice(&[0xef, 0xbb, 0xbf]);
    if config.include_header {
        push_csv_row(
            &mut bytes,
            config
                .columns
                .iter()
                .map(|column| column.header().to_owned()),
        )?;
    }
    for entry in entries {
        push_csv_row(
            &mut bytes,
            config
                .columns
                .iter()
                .map(|column| column_value(entry, *column, config)),
        )?;
    }
    Ok(bytes)
}

#[tauri::command]
pub async fn export_catalog_csv(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    request: CsvExportRequest,
) -> Result<Response<CsvExportResult>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let config = match validate_config(request.config) {
        Ok(config) => config,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let current = match RelativePath::parse(request.current_path) {
        Ok(current) => current,
        Err(_) => {
            return Ok(error_response(
                &context,
                invalid("CSV current path is invalid."),
            ));
        }
    };
    let root = match current_root(&state) {
        Ok(root) => root,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let include_hidden = show_hidden(&state);
    let scope = request.scope;
    let selected_paths = request.selected_paths;
    let worker_root = root.clone();
    let worker_current = current.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let entries = collect_entries(
            &worker_root,
            &worker_current,
            scope,
            &selected_paths,
            include_hidden,
        )?;
        let bytes = build_csv(&config, &entries)?;
        Ok::<_, AppError>((bytes, entries.len()))
    })
    .await
    .map_err(|error| format!("CSV export worker failed: {error}"))?;
    let (bytes, row_count) = match result {
        Ok(result) => result,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let base = current
        .as_str()
        .rsplit('/')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or("catalog");
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: CsvExportResult {
            file_name: format!("{base}.csv"),
            bytes,
            row_count,
        },
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::Instant;

    use super::*;

    fn config(columns: Vec<CsvColumn>) -> CsvExportConfig {
        CsvExportConfig {
            columns,
            include_header: true,
            size_unit: CsvSizeUnit::Kib,
            split_delimiter: Some("_".into()),
        }
    }

    fn entry(path: String, size: u64) -> CatalogEntry {
        CatalogEntry {
            relative_path: RelativePath::parse(path).unwrap(),
            kind: ItemKind::Page,
            has_folder_archive_cover: false,
            byte_size: Some(size),
            modified_ms: Some(123),
            archive_kind: None,
        }
    }

    #[test]
    fn req_ley_p3_020_validates_schema_and_generates_safe_ordered_csv() {
        let config = validate_config(config(vec![
            CsvColumn::NamePart2,
            CsvColumn::RelativePath,
            CsvColumn::Size,
        ]))
        .unwrap();
        let bytes = build_csv(
            &config,
            &[
                entry("book_01.jpg".into(), 1536),
                entry("=formula_02.jpg".into(), 1024),
            ],
        )
        .unwrap();
        let csv = String::from_utf8(bytes[3..].to_vec()).unwrap();
        assert_eq!(
            csv,
            "namePart2,relativePath,size\r\n01,book_01.jpg,1.50\r\n02,'=formula_02.jpg,1.00\r\n"
        );
        let mut duplicate = config.clone();
        duplicate.columns = vec![CsvColumn::Name, CsvColumn::Name];
        assert_eq!(
            validate_config(duplicate).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        let mut invalid_delimiter = config;
        invalid_delimiter.split_delimiter = Some("/".into());
        assert_eq!(
            validate_config(invalid_delimiter).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
    }

    #[test]
    fn req_ley_p3_020_formats_50000_rows_within_bounded_time_and_size() {
        let config = config(vec![
            CsvColumn::Name,
            CsvColumn::Kind,
            CsvColumn::RelativePath,
            CsvColumn::Size,
            CsvColumn::ModifiedMs,
        ]);
        let entries = (0..MAX_EXPORT_ROWS)
            .map(|index| entry(format!("folder/page_{index:05}.jpg"), index as u64))
            .collect::<Vec<_>>();
        let started = Instant::now();
        let bytes = build_csv(&config, &entries).unwrap();
        assert!(bytes.len() <= MAX_EXPORT_BYTES);
        assert!(started.elapsed().as_secs_f32() < 5.0);
        eprintln!(
            "REQ-LEY-P3-020 formatted {} rows / {} bytes in {:.3} ms",
            entries.len(),
            bytes.len(),
            started.elapsed().as_secs_f64() * 1000.0
        );
    }

    #[test]
    fn req_ley_p3_020_scopes_stay_contained_and_recursive_depth_fails_closed() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-csv-scope-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        fs::create_dir_all(root.join("current/child")).unwrap();
        fs::write(root.join("current/a.jpg"), b"a").unwrap();
        fs::write(root.join("current/child/b.jpg"), b"b").unwrap();
        let current = RelativePath::parse("current").unwrap();

        let direct = collect_entries(&root, &current, CsvExportScope::Current, &[], true).unwrap();
        assert_eq!(direct.len(), 2);
        let selected = collect_entries(
            &root,
            &current,
            CsvExportScope::Selected,
            &["current/a.jpg".into()],
            true,
        )
        .unwrap();
        assert_eq!(selected[0].relative_path.as_str(), "current/a.jpg");
        assert_eq!(
            collect_entries(
                &root,
                &current,
                CsvExportScope::Selected,
                &["../outside.jpg".into()],
                true,
            )
            .unwrap_err()
            .code,
            ErrorCode::InvalidRequest
        );
        let recursive =
            collect_entries(&root, &current, CsvExportScope::Recursive, &[], true).unwrap();
        assert!(
            recursive
                .iter()
                .any(|entry| entry.relative_path.as_str() == "current/child/b.jpg")
        );

        let mut deep = root.join("deep");
        fs::create_dir_all(&deep).unwrap();
        for index in 0..=MAX_RECURSION_DEPTH {
            deep = deep.join(format!("d{index}"));
            fs::create_dir(&deep).unwrap();
        }
        assert_eq!(
            collect_entries(
                &root,
                &RelativePath::parse("deep").unwrap(),
                CsvExportScope::Recursive,
                &[],
                true,
            )
            .unwrap_err()
            .code,
            ErrorCode::InvalidRequest
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn req_ley_p3_020_never_follows_directory_links() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-csv-link-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        fs::create_dir_all(root.join("current/target")).unwrap();
        fs::write(root.join("current/target/page.jpg"), b"page").unwrap();
        let link = root.join("current/link");
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_dir(root.join("current/target"), &link).is_ok();
        #[cfg(unix)]
        let linked = std::os::unix::fs::symlink(root.join("current/target"), &link).is_ok();
        #[cfg(not(any(windows, unix)))]
        let linked = false;
        if linked {
            let entries = collect_entries(
                &root,
                &RelativePath::parse("current").unwrap(),
                CsvExportScope::Recursive,
                &[],
                true,
            )
            .unwrap();
            assert!(
                !entries
                    .iter()
                    .any(|entry| entry.relative_path.as_str() == "current/link/page.jpg")
            );
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn req_ley_p3_020_rejects_output_over_16_mib() {
        let config = config(vec![CsvColumn::RelativePath]);
        let suffix = "x".repeat(360);
        let entries = (0..MAX_EXPORT_ROWS)
            .map(|index| entry(format!("{index:05}-{suffix}.jpg"), 1))
            .collect::<Vec<_>>();
        assert_eq!(
            build_csv(&config, &entries).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
    }
}
