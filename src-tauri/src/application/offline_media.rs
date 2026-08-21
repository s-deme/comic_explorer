use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use crate::api::{RequestContext, Response};
use crate::catalog::{encode_wic_jpeg, read_cover};
use crate::domain::{AppError, ErrorCode, FileKind, ItemKind, RelativePath, classify_file_name};
use crate::state::{
    MAX_OFFLINE_MEDIA_ENTRIES, MAX_OFFLINE_MEDIA_THUMBNAIL_BYTES, MAX_OFFLINE_MEDIA_THUMBNAILS,
    MAX_OFFLINE_MEDIA_TOTAL_THUMBNAIL_BYTES, NewOfflineMediaEntry, OfflineMediaRecord,
    OfflineMediaThumbnail,
};

use super::{
    AppState,
    cli_launch::{CliLaunchMode, CliLaunchPlan},
    error_response, library_root, request_error, unix_millis, validate_request,
};

const MAX_SCAN_DEPTH: usize = 64;
const ICONS: [&str; 4] = ["disc", "removable", "archive", "star"];
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OfflineMediaStatus {
    #[serde(flatten)]
    pub record: OfflineMediaRecord,
    pub available: bool,
    pub connected_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OfflineMediaCatalog {
    pub media: Vec<OfflineMediaStatus>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OfflineMediaDetail {
    pub media: OfflineMediaStatus,
    pub entries: Vec<NewOfflineMediaEntry>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OfflineMediaThumbnailPayload {
    pub jpeg: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegisterOfflineMediaRequest {
    pub name: String,
    pub icon: String,
}

#[derive(Debug)]
struct ScanResult {
    volume: library_root::VolumeIdentity,
    source_subpath: String,
    entries: Vec<NewOfflineMediaEntry>,
    thumbnails: Vec<OfflineMediaThumbnail>,
}

fn ok<T>(context: &RequestContext, data: T) -> Response<T> {
    Response::Ok {
        request_id: context.request_id.clone(),
        generation: context.generation,
        data,
    }
}

fn invalid(message: &str) -> AppError {
    request_error(ErrorCode::InvalidRequest, message)
}

fn validate_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if !(1..=128).contains(&name.encode_utf16().count()) || name.chars().any(char::is_control) {
        return Err(invalid(
            "媒体名は制御文字を含まない1〜128文字で指定してください。",
        ));
    }
    Ok(name.into())
}

fn validate_icon(icon: &str) -> Result<String, AppError> {
    ICONS
        .contains(&icon)
        .then(|| icon.to_owned())
        .ok_or_else(|| invalid("媒体icon presetが不正です。"))
}

fn path_error(path: &Path, error: std::io::Error) -> AppError {
    let code = match error.kind() {
        std::io::ErrorKind::NotFound => ErrorCode::NotFound,
        std::io::ErrorKind::PermissionDenied => ErrorCode::AccessDenied,
        _ => ErrorCode::InvalidPath,
    };
    AppError {
        code,
        message: format!("媒体を読み取れません: {} ({error})", path.display()),
        target: None,
        retryable: true,
    }
}

fn modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

#[cfg(target_os = "windows")]
fn is_reparse(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes() & 0x400 != 0
}

#[cfg(not(target_os = "windows"))]
fn is_reparse(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

fn entry_kind(path: &Path, metadata: &fs::Metadata) -> &'static str {
    if metadata.is_dir() {
        return "folder";
    }
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    match classify_file_name(name) {
        FileKind::Image => "image",
        FileKind::Archive => "archive",
        FileKind::Pdf => "pdf",
        FileKind::Unsupported => "other",
    }
}

fn create_thumbnail(root: &Path, relative: &RelativePath) -> Option<OfflineMediaThumbnail> {
    let cover = read_cover(root, relative).ok()?;
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let output = std::env::temp_dir().join(format!(
        "comic-explorer-media-{}-{sequence}.jpg",
        std::process::id()
    ));
    let (width, height) = encode_wic_jpeg(&cover.bytes, &output).ok()?;
    let jpeg = fs::read(&output).ok();
    let _ = fs::remove_file(&output);
    let jpeg = jpeg?;
    (jpeg.len() <= MAX_OFFLINE_MEDIA_THUMBNAIL_BYTES).then(|| OfflineMediaThumbnail {
        relative_path: relative.as_str().into(),
        jpeg,
        width,
        height,
    })
}

fn scan_snapshot(root: &Path, cancellation: &CancellationToken) -> Result<ScanResult, AppError> {
    let root = root
        .canonicalize()
        .map_err(|error| path_error(root, error))?;
    let volume = library_root::volume_identity_for_path(&root)?;
    let source_subpath = root
        .strip_prefix(&volume.root)
        .map_err(|_| invalid("Library root is not inside its volume root."))?
        .to_string_lossy()
        .replace('\\', "/");
    let mut entries = Vec::new();
    let mut thumbnails = Vec::new();
    let mut thumbnail_bytes = 0usize;
    let mut pending = vec![(root.clone(), 0usize)];
    while let Some((directory, depth)) = pending.pop() {
        if cancellation.is_cancelled() {
            return Err(AppError::cancelled());
        }
        if depth > MAX_SCAN_DEPTH {
            return Err(request_error(
                ErrorCode::ResourceLimit,
                "媒体階層は64 levelまでです。",
            ));
        }
        let mut children = fs::read_dir(&directory)
            .map_err(|error| path_error(&directory, error))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| path_error(&directory, error))?;
        children.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());
        for (sort_order, child) in children.into_iter().enumerate() {
            if cancellation.is_cancelled() {
                return Err(AppError::cancelled());
            }
            if entries.len() >= MAX_OFFLINE_MEDIA_ENTRIES {
                return Err(request_error(
                    ErrorCode::ResourceLimit,
                    "媒体snapshotは50,000 entryまでです。",
                ));
            }
            let path = child.path();
            let metadata = fs::symlink_metadata(&path).map_err(|error| path_error(&path, error))?;
            if is_reparse(&metadata) {
                continue;
            }
            let relative = path
                .strip_prefix(&root)
                .map_err(|_| invalid("媒体entryがroot外です。"))?
                .to_string_lossy()
                .replace('\\', "/");
            let relative = RelativePath::parse(relative)
                .map_err(|_| invalid("媒体entryの相対pathが不正です。"))?;
            if relative.as_str().is_empty() {
                continue;
            }
            let parent_path = Path::new(relative.as_str())
                .parent()
                .map(|value| value.to_string_lossy().replace('\\', "/"))
                .filter(|value| value != ".")
                .unwrap_or_default();
            let kind = entry_kind(&path, &metadata).to_owned();
            if metadata.is_dir() {
                pending.push((path.clone(), depth + 1));
            }
            if thumbnails.len() < MAX_OFFLINE_MEDIA_THUMBNAILS && kind != "other" {
                if let Some(thumbnail) = create_thumbnail(&root, &relative) {
                    if thumbnail_bytes + thumbnail.jpeg.len()
                        <= MAX_OFFLINE_MEDIA_TOTAL_THUMBNAIL_BYTES
                    {
                        thumbnail_bytes += thumbnail.jpeg.len();
                        thumbnails.push(thumbnail);
                    }
                }
            }
            entries.push(NewOfflineMediaEntry {
                relative_path: relative.as_str().into(),
                parent_path,
                name: child
                    .file_name()
                    .to_string_lossy()
                    .chars()
                    .take(255)
                    .collect(),
                kind,
                size_bytes: if metadata.is_file() {
                    metadata.len()
                } else {
                    0
                },
                modified_ms: modified_ms(&metadata),
                sort_order: sort_order as u32,
            });
        }
    }
    Ok(ScanResult {
        volume,
        source_subpath,
        entries,
        thumbnails,
    })
}

fn connected_volumes() -> Vec<library_root::VolumeIdentity> {
    library_root::logical_drive_roots()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|root| library_root::volume_identity_for_path(&root).ok())
        .collect()
}

fn status(
    record: OfflineMediaRecord,
    volumes: &[library_root::VolumeIdentity],
) -> OfflineMediaStatus {
    let connected = volumes
        .iter()
        .find(|volume| volume.identity == record.identity);
    OfflineMediaStatus {
        record,
        available: connected.is_some(),
        connected_root: connected.map(|volume| library_root::display_path(&volume.root)),
    }
}

fn catalog(state: &AppState) -> Result<OfflineMediaCatalog, AppError> {
    let volumes = connected_volumes();
    let guard = state
        .store
        .lock()
        .map_err(|_| invalid("State store is unavailable."))?;
    let store = guard
        .as_ref()
        .ok_or_else(|| invalid("State store is unavailable."))?;
    Ok(OfflineMediaCatalog {
        media: store
            .list_offline_media()?
            .into_iter()
            .map(|record| status(record, &volumes))
            .collect(),
    })
}

#[tauri::command]
pub fn list_offline_media(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<OfflineMediaCatalog>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    Ok(match catalog(&state) {
        Ok(value) => ok(&context, value),
        Err(error) => error_response(&context, error),
    })
}

#[tauri::command]
pub async fn register_offline_media(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    request: RegisterOfflineMediaRequest,
) -> Result<Response<OfflineMediaCatalog>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let name = match validate_name(&request.name) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let icon = match validate_icon(&request.icon) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let root = match state
        .library_root
        .lock()
        .map_err(|_| "library root poisoned")?
        .clone()
    {
        Some(root) => root,
        None => {
            return Ok(error_response(
                &context,
                invalid("Library rootを選択してください。"),
            ));
        }
    };
    let cancellation = state
        .offline_media
        .lock()
        .map_err(|_| "offline media state poisoned")?
        .begin(context.generation);
    let worker_cancellation = cancellation.clone();
    let scan = match tokio::task::spawn_blocking(move || scan_snapshot(&root, &worker_cancellation))
        .await
    {
        Ok(Ok(value)) => value,
        Ok(Err(error)) => return Ok(error_response(&context, error)),
        Err(error) => {
            return Ok(error_response(
                &context,
                request_error(
                    ErrorCode::Internal,
                    &format!("媒体scan workerが失敗しました: {error}"),
                ),
            ));
        }
    };
    if cancellation.is_cancelled()
        || !state
            .offline_media
            .lock()
            .map_err(|_| "offline media state poisoned")?
            .is_current(context.generation)
    {
        return Ok(error_response(&context, AppError::cancelled()));
    }
    let store_guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = store_guard.as_ref() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    if let Err(error) = store.insert_offline_media(
        &scan.volume.identity,
        &name,
        &scan.source_subpath,
        &scan.volume.label,
        &icon,
        &scan.volume.filesystem,
        scan.volume.serial,
        unix_millis().max(0) as u64,
        &scan.entries,
        &scan.thumbnails,
    ) {
        return Ok(error_response(&context, error));
    }
    drop(store_guard);
    Ok(match catalog(&state) {
        Ok(value) => ok(&context, value),
        Err(error) => error_response(&context, error),
    })
}

#[tauri::command]
pub fn cancel_offline_media_registration(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<bool>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    state
        .offline_media
        .lock()
        .map_err(|_| "offline media state poisoned")?
        .cancel(context.generation);
    Ok(ok(&context, true))
}

#[tauri::command]
pub fn get_offline_media(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    media_id: i64,
) -> Result<Response<OfflineMediaDetail>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let volumes = connected_volumes();
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    Ok(match store.offline_media_snapshot(media_id) {
        Ok(mut snapshot) => {
            let record = snapshot.media.remove(0);
            ok(
                &context,
                OfflineMediaDetail {
                    media: status(record, &volumes),
                    entries: snapshot.entries,
                },
            )
        }
        Err(error) => error_response(&context, error),
    })
}

#[tauri::command]
pub fn get_offline_media_thumbnail(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    media_id: i64,
    relative_path: String,
) -> Result<Response<Option<OfflineMediaThumbnailPayload>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let relative = match RelativePath::parse(&relative_path) {
        Ok(value) if !value.as_str().is_empty() => value,
        _ => {
            return Ok(error_response(
                &context,
                invalid("Thumbnail path is invalid."),
            ));
        }
    };
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    Ok(
        match store.offline_media_thumbnail(media_id, relative.as_str()) {
            Ok(value) => ok(
                &context,
                value.map(|value| OfflineMediaThumbnailPayload {
                    jpeg: value.jpeg,
                    width: value.width,
                    height: value.height,
                }),
            ),
            Err(error) => error_response(&context, error),
        },
    )
}

#[tauri::command]
pub fn set_offline_media_icon(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    media_id: i64,
    icon: String,
) -> Result<Response<OfflineMediaCatalog>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let icon = match validate_icon(&icon) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    if let Err(error) = store.set_offline_media_icon(media_id, &icon) {
        return Ok(error_response(&context, error));
    }
    drop(guard);
    Ok(match catalog(&state) {
        Ok(value) => ok(&context, value),
        Err(error) => error_response(&context, error),
    })
}

#[tauri::command]
pub fn delete_offline_media(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    media_id: i64,
    confirmed: bool,
) -> Result<Response<OfflineMediaCatalog>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !confirmed {
        return Ok(error_response(
            &context,
            invalid("媒体台帳の削除には確認が必要です。"),
        ));
    }
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    if let Err(error) = store.delete_offline_media(media_id) {
        return Ok(error_response(&context, error));
    }
    drop(guard);
    Ok(match catalog(&state) {
        Ok(value) => ok(&context, value),
        Err(error) => error_response(&context, error),
    })
}

#[tauri::command]
pub fn open_offline_media_entry(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    media_id: i64,
    relative_path: String,
) -> Result<Response<CliLaunchPlan>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let relative = match RelativePath::parse(&relative_path) {
        Ok(value) if !value.as_str().is_empty() => value,
        _ => {
            return Ok(error_response(
                &context,
                invalid("媒体entry pathが不正です。"),
            ));
        }
    };
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(
            &context,
            invalid("State store is unavailable."),
        ));
    };
    let snapshot = match store.offline_media_snapshot(media_id) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let record = &snapshot.media[0];
    let Some(entry) = snapshot
        .entries
        .iter()
        .find(|entry| entry.relative_path == relative.as_str())
    else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::NotFound, "媒体entryが台帳にありません。"),
        ));
    };
    let Some(volume) = connected_volumes()
        .into_iter()
        .find(|volume| volume.identity == record.identity)
    else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::NotFound, "媒体が接続されていません。"),
        ));
    };
    let requested_root = volume.root.join(&record.source_subpath);
    let root = match requested_root.canonicalize() {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, path_error(&requested_root, error))),
    };
    let requested_target = root.join(relative.as_str());
    let target = match requested_target.canonicalize() {
        Ok(value) => value,
        Err(error) => {
            return Ok(error_response(
                &context,
                path_error(&requested_target, error),
            ));
        }
    };
    if !target.starts_with(&root) {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::OutsideLibraryRoot,
                "媒体entryが登録root外へ解決されました。",
            ),
        ));
    }
    let kind = match entry.kind.as_str() {
        "folder" => ItemKind::Folder,
        "image" => ItemKind::Page,
        "archive" => ItemKind::Archive,
        "pdf" => ItemKind::Pdf,
        _ => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::UnsupportedFormat, "この媒体entryは開けません。"),
            ));
        }
    };
    Ok(ok(
        &context,
        CliLaunchPlan {
            library_root: library_root::display_path(&root),
            item_relative_path: Some(relative.as_str().into()),
            item_kind: Some(kind),
            mode: CliLaunchMode::Normal,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn req_ley_p5_001_name_icon_and_relative_path_validation_is_strict() {
        assert!(validate_name("Disc").is_ok());
        assert!(validate_name("").is_err());
        assert!(validate_name("bad\nname").is_err());
        assert!(validate_icon("disc").is_ok());
        assert!(validate_icon("custom-file").is_err());
        assert!(RelativePath::parse("Books/one.cbz").is_ok());
        assert!(RelativePath::parse("../escape").is_err());
    }

    #[test]
    fn req_ley_p5_001_cancelled_scan_never_builds_a_snapshot() {
        let token = CancellationToken::new();
        token.cancel();
        assert_eq!(
            scan_snapshot(Path::new("."), &token).unwrap_err().code,
            ErrorCode::Cancelled
        );
    }
}
