use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use super::{AppState, error_response, request_error, validate_request};
use crate::api::{MAX_IMAGE_BYTES, RequestContext, Response};
use crate::domain::{AppError, ErrorCode, RelativePath};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileOperationKind {
    Rename,
    CreateFolder,
    Copy,
    Move,
    Recycle,
    Delete,
    Cut,
    ClipboardCopy,
    PasteCopy,
    PasteMove,
    Reveal,
    OpenDefault,
    OpenWith,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOperationResult {
    pub operation: FileOperationKind,
    pub affected: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileClipboardStatus {
    pub available: bool,
    pub cut: bool,
    pub items: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TransferKind {
    Copy,
    Move,
}

const MAX_FILE_OPERATION_ITEMS: usize = 10_000;
const MAX_FILE_NAME_UTF16: usize = 255;
const MAX_CLIPBOARD_PATH_UTF16: usize = 32_767;
const MAX_CLIPBOARD_TOTAL_UTF16: usize = 16 * 1024 * 1024;

fn operation_response(
    context: RequestContext,
    result: Result<FileOperationResult, AppError>,
) -> Response<FileOperationResult> {
    match result {
        Ok(data) => Response::Ok {
            request_id: context.request_id,
            generation: context.generation,
            data,
        },
        Err(error) if error.code == ErrorCode::Cancelled => Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        },
        Err(error) => error_response(&context, error),
    }
}

fn clipboard_response(
    context: RequestContext,
    result: Result<FileClipboardStatus, AppError>,
) -> Response<FileClipboardStatus> {
    match result {
        Ok(data) => Response::Ok {
            request_id: context.request_id,
            generation: context.generation,
            data,
        },
        Err(error) => error_response(&context, error),
    }
}

fn configured_root(state: &AppState) -> Result<PathBuf, AppError> {
    state
        .library_root
        .lock()
        .map_err(|_| request_error(ErrorCode::Internal, "Library root state is unavailable."))?
        .clone()
        .ok_or_else(|| request_error(ErrorCode::InvalidRequest, "Library root is not configured."))
}

fn parse_relative(value: String) -> Result<RelativePath, AppError> {
    RelativePath::parse(value).map_err(|message| request_error(ErrorCode::InvalidPath, message))
}

fn parse_non_root_relative(value: String) -> Result<RelativePath, AppError> {
    let relative = parse_relative(value)?;
    if relative.as_str().is_empty() {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "The library root cannot be changed as an item.",
        ));
    }
    Ok(relative)
}

fn canonical_root(root: &Path) -> Result<PathBuf, AppError> {
    root.canonicalize()
        .map_err(|error| file_io_error(None, error))
}

fn contained_existing_path(root: &Path, relative: &RelativePath) -> Result<PathBuf, AppError> {
    let canonical_root = canonical_root(root)?;
    let requested = canonical_root.join(relative.as_str());
    let metadata = fs::symlink_metadata(&requested)
        .map_err(|error| file_io_error(Some(relative.clone()), error))?;
    if metadata_is_reparse_point(&metadata) {
        return Err(AppError {
            code: ErrorCode::OutsideLibraryRoot,
            message: "Symbolic links and reparse-point items cannot be changed.".into(),
            target: Some(relative.clone()),
            retryable: false,
        });
    }
    let canonical = requested
        .canonicalize()
        .map_err(|error| file_io_error(Some(relative.clone()), error))?;
    if !canonical.starts_with(&canonical_root) {
        return Err(AppError {
            code: ErrorCode::OutsideLibraryRoot,
            message: "The item resolves outside the configured library root.".into(),
            target: Some(relative.clone()),
            retryable: false,
        });
    }
    Ok(canonical)
}

fn contained_directory(root: &Path, relative: &RelativePath) -> Result<PathBuf, AppError> {
    let directory = if relative.as_str().is_empty() {
        canonical_root(root)?
    } else {
        contained_existing_path(root, relative)?
    };
    if !directory.is_dir() {
        return Err(AppError {
            code: ErrorCode::InvalidPath,
            message: "The destination is not a folder.".into(),
            target: Some(relative.clone()),
            retryable: false,
        });
    }
    Ok(directory)
}

fn contained_sources(
    root: &Path,
    relative_paths: Vec<String>,
) -> Result<Vec<(RelativePath, PathBuf)>, AppError> {
    if relative_paths.is_empty() {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Select at least one item.",
        ));
    }
    if relative_paths.len() > MAX_FILE_OPERATION_ITEMS {
        return Err(request_error(
            ErrorCode::ResourceLimit,
            "Too many items were selected for one file operation.",
        ));
    }
    let mut seen = HashSet::new();
    let mut sources = Vec::with_capacity(relative_paths.len());
    for value in relative_paths {
        let relative = parse_non_root_relative(value)?;
        let path = contained_existing_path(root, &relative)?;
        let key = path.to_string_lossy().to_lowercase();
        if !seen.insert(key) {
            return Err(AppError {
                code: ErrorCode::Conflict,
                message: "The same file operation source was selected more than once.".into(),
                target: Some(relative),
                retryable: false,
            });
        }
        sources.push((relative, path));
    }
    Ok(sources)
}

fn validate_item_name(value: &str) -> Result<&str, AppError> {
    if value.is_empty()
        || value.encode_utf16().count() > MAX_FILE_NAME_UTF16
        || value.trim() != value
        || value == "."
        || value == ".."
    {
        return Err(invalid_name_error());
    }
    if value.ends_with('.')
        || value.ends_with(' ')
        || value
            .chars()
            .any(|character| character < ' ' || r#"<>:"/\|?*"#.contains(character))
    {
        return Err(invalid_name_error());
    }
    let stem = value
        .split('.')
        .next()
        .unwrap_or(value)
        .to_ascii_uppercase();
    let reserved = matches!(
        stem.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || stem
        .strip_prefix("COM")
        .or_else(|| stem.strip_prefix("LPT"))
        .and_then(|number| number.parse::<u8>().ok())
        .is_some_and(|number| (1..=9).contains(&number));
    if reserved {
        return Err(invalid_name_error());
    }
    Ok(value)
}

fn invalid_name_error() -> AppError {
    request_error(
        ErrorCode::InvalidPath,
        "The name is empty, reserved, or contains characters Windows does not allow.",
    )
}

fn metadata_is_reparse_point(metadata: &fs::Metadata) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;

        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(target_os = "windows"))]
    {
        metadata.file_type().is_symlink()
    }
}

fn target_conflict(target: &Path) -> AppError {
    AppError {
        code: ErrorCode::Conflict,
        message: format!(
            "An item with the same name already exists: {}",
            target.display()
        ),
        target: None,
        retryable: false,
    }
}

fn file_io_error(target: Option<RelativePath>, error: io::Error) -> AppError {
    let (code, retryable) = match error.kind() {
        io::ErrorKind::NotFound => (ErrorCode::NotFound, true),
        io::ErrorKind::PermissionDenied => (ErrorCode::AccessDenied, true),
        io::ErrorKind::AlreadyExists => (ErrorCode::Conflict, false),
        io::ErrorKind::InvalidInput => (ErrorCode::InvalidPath, false),
        _ => (ErrorCode::Internal, true),
    };
    AppError {
        code,
        message: error.to_string(),
        target,
        retryable,
    }
}

fn rename_item(
    root: &Path,
    relative: RelativePath,
    new_name: String,
) -> Result<FileOperationResult, AppError> {
    let new_name = validate_item_name(&new_name)?;
    let source = contained_existing_path(root, &relative)?;
    if source.file_name() == Some(OsStr::new(new_name)) {
        return Ok(FileOperationResult {
            operation: FileOperationKind::Rename,
            affected: 0,
        });
    }
    let target = source
        .parent()
        .ok_or_else(|| request_error(ErrorCode::InvalidPath, "The item has no parent folder."))?
        .join(new_name);
    if target.exists() && !same_windows_path(&source, &target) {
        return Err(target_conflict(&target));
    }
    fs::rename(&source, &target).map_err(|error| file_io_error(Some(relative), error))?;
    Ok(FileOperationResult {
        operation: FileOperationKind::Rename,
        affected: 1,
    })
}

fn create_folder(
    root: &Path,
    parent: RelativePath,
    name: String,
) -> Result<FileOperationResult, AppError> {
    let name = validate_item_name(&name)?;
    let parent_path = contained_directory(root, &parent)?;
    let target = parent_path.join(name);
    if target.exists() {
        return Err(target_conflict(&target));
    }
    fs::create_dir(&target).map_err(|error| file_io_error(Some(parent), error))?;
    Ok(FileOperationResult {
        operation: FileOperationKind::CreateFolder,
        affected: 1,
    })
}

fn same_windows_path(left: &Path, right: &Path) -> bool {
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
}

fn validate_transfer(sources: &[PathBuf], destination: &Path) -> Result<PathBuf, AppError> {
    let destination = destination
        .canonicalize()
        .map_err(|error| file_io_error(None, error))?;
    if !destination.is_dir() {
        return Err(request_error(
            ErrorCode::InvalidPath,
            "The selected destination is not a folder.",
        ));
    }
    let mut names = HashSet::new();
    for source in sources {
        let metadata = fs::symlink_metadata(source).map_err(|error| file_io_error(None, error))?;
        if metadata_is_reparse_point(&metadata) {
            return Err(request_error(
                ErrorCode::OutsideLibraryRoot,
                "Symbolic links and reparse-point items cannot be copied or moved.",
            ));
        }
        let canonical = source
            .canonicalize()
            .map_err(|error| file_io_error(None, error))?;
        let name = canonical.file_name().ok_or_else(|| {
            request_error(ErrorCode::InvalidPath, "A source item has no file name.")
        })?;
        let folded = name.to_string_lossy().to_lowercase();
        if !names.insert(folded) {
            return Err(request_error(
                ErrorCode::Conflict,
                "Multiple sources have the same destination name.",
            ));
        }
        if canonical.is_dir() && destination.starts_with(&canonical) {
            return Err(request_error(
                ErrorCode::Conflict,
                "A folder cannot be copied or moved into itself or one of its descendants.",
            ));
        }
        let target = destination.join(name);
        if target.exists() || same_windows_path(&canonical, &target) {
            return Err(target_conflict(&target));
        }
    }
    Ok(destination)
}

fn transfer_items(
    sources: Vec<PathBuf>,
    destination: PathBuf,
    kind: TransferKind,
) -> Result<FileOperationResult, AppError> {
    let destination = validate_transfer(&sources, &destination)?;
    for source in &sources {
        let name = source.file_name().ok_or_else(|| {
            request_error(ErrorCode::InvalidPath, "A source item has no file name.")
        })?;
        let target = destination.join(name);
        match kind {
            TransferKind::Copy => copy_path(source, &target)?,
            TransferKind::Move => move_path(source, &target)?,
        }
    }
    Ok(FileOperationResult {
        operation: match kind {
            TransferKind::Copy => FileOperationKind::Copy,
            TransferKind::Move => FileOperationKind::Move,
        },
        affected: sources.len(),
    })
}

fn copy_path(source: &Path, target: &Path) -> Result<(), AppError> {
    let metadata = fs::symlink_metadata(source).map_err(|error| file_io_error(None, error))?;
    if metadata_is_reparse_point(&metadata) {
        return Err(request_error(
            ErrorCode::OutsideLibraryRoot,
            "Symbolic links and reparse-point items cannot be copied.",
        ));
    }
    if metadata.is_file() {
        return match fs::copy(source, target) {
            Ok(_) => Ok(()),
            Err(error) => {
                let _ = fs::remove_file(target);
                Err(file_io_error(None, error))
            }
        };
    }
    if !metadata.is_dir() {
        return Err(request_error(
            ErrorCode::UnsupportedFormat,
            "Only files and folders can be copied.",
        ));
    }
    fs::create_dir(target).map_err(|error| file_io_error(None, error))?;
    let result = (|| {
        for entry in fs::read_dir(source).map_err(|error| file_io_error(None, error))? {
            let entry = entry.map_err(|error| file_io_error(None, error))?;
            copy_path(&entry.path(), &target.join(entry.file_name()))?;
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(target);
    }
    result
}

fn move_path(source: &Path, target: &Path) -> Result<(), AppError> {
    match fs::rename(source, target) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::CrossesDevices => {
            copy_path(source, target)?;
            let removal = if source.is_dir() {
                fs::remove_dir_all(source)
            } else {
                fs::remove_file(source)
            };
            if let Err(error) = removal {
                let mut operation_error = file_io_error(None, error);
                operation_error.message = format!(
                    "The item was copied to {}, but its source could not be removed: {}",
                    target.display(),
                    operation_error.message
                );
                return Err(operation_error);
            }
            Ok(())
        }
        Err(error) => Err(file_io_error(None, error)),
    }
}

fn delete_items(sources: Vec<PathBuf>, permanent: bool) -> Result<FileOperationResult, AppError> {
    shell_delete(&sources, !permanent)?;
    Ok(FileOperationResult {
        operation: if permanent {
            FileOperationKind::Delete
        } else {
            FileOperationKind::Recycle
        },
        affected: sources.len(),
    })
}

#[tauri::command]
pub async fn rename_file_item(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_path: String,
    new_name: String,
) -> Result<Response<FileOperationResult>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let root = match configured_root(&state) {
        Ok(root) => root,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let relative = match parse_non_root_relative(item_relative_path) {
        Ok(relative) => relative,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let lock = state.file_operations.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| {
            request_error(ErrorCode::Internal, "File operation state is unavailable.")
        })?;
        rename_item(&root, relative, new_name)
    })
    .await
    .map_err(|error| format!("rename worker failed: {error}"))?;
    Ok(operation_response(context, result))
}

#[tauri::command]
pub async fn create_file_folder(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    parent_relative_path: String,
    name: String,
) -> Result<Response<FileOperationResult>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let root = match configured_root(&state) {
        Ok(root) => root,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let parent = match parse_relative(parent_relative_path) {
        Ok(parent) => parent,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let lock = state.file_operations.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| {
            request_error(ErrorCode::Internal, "File operation state is unavailable.")
        })?;
        create_folder(&root, parent, name)
    })
    .await
    .map_err(|error| format!("create folder worker failed: {error}"))?;
    Ok(operation_response(context, result))
}

async fn transfer_to_picked_folder(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_paths: Vec<String>,
    kind: TransferKind,
) -> Result<Response<FileOperationResult>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let root = match configured_root(&state) {
        Ok(root) => root,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let sources: Vec<PathBuf> = match contained_sources(&root, item_relative_paths) {
        Ok(sources) => sources.into_iter().map(|(_, path)| path).collect(),
        Err(error) => return Ok(error_response(&context, error)),
    };
    #[cfg(target_os = "windows")]
    let destination = tauri::async_runtime::spawn_blocking(super::library_root::pick_folder)
        .await
        .map_err(|error| format!("folder picker worker failed: {error}"))?;
    #[cfg(not(target_os = "windows"))]
    let destination: Result<Option<PathBuf>, AppError> = Err(request_error(
        ErrorCode::UnsupportedFormat,
        "Folder transfer is available only on Windows.",
    ));
    let Some(destination) = (match destination {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    }) else {
        return Ok(Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        });
    };
    let lock = state.file_operations.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| {
            request_error(ErrorCode::Internal, "File operation state is unavailable.")
        })?;
        transfer_items(sources, destination, kind)
    })
    .await
    .map_err(|error| format!("file transfer worker failed: {error}"))?;
    Ok(operation_response(context, result))
}

#[tauri::command]
pub async fn copy_file_items_to_folder(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_paths: Vec<String>,
) -> Result<Response<FileOperationResult>, String> {
    transfer_to_picked_folder(state, context, item_relative_paths, TransferKind::Copy).await
}

#[tauri::command]
pub async fn move_file_items_to_folder(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_paths: Vec<String>,
) -> Result<Response<FileOperationResult>, String> {
    transfer_to_picked_folder(state, context, item_relative_paths, TransferKind::Move).await
}

#[tauri::command]
pub async fn move_file_items_to_destination(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_paths: Vec<String>,
    destination_relative_path: String,
) -> Result<Response<FileOperationResult>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let root = match configured_root(&state) {
        Ok(root) => root,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let sources: Vec<PathBuf> = match contained_sources(&root, item_relative_paths) {
        Ok(sources) => sources.into_iter().map(|(_, path)| path).collect(),
        Err(error) => return Ok(error_response(&context, error)),
    };
    let destination = match parse_relative(destination_relative_path)
        .and_then(|relative| contained_directory(&root, &relative))
    {
        Ok(destination) => destination,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let lock = state.file_operations.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| {
            request_error(ErrorCode::Internal, "File operation state is unavailable.")
        })?;
        transfer_items(sources, destination, TransferKind::Move)
    })
    .await
    .map_err(|error| format!("file drag-and-drop worker failed: {error}"))?;
    Ok(operation_response(context, result))
}

#[tauri::command]
pub async fn delete_file_items(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_paths: Vec<String>,
    permanent: bool,
) -> Result<Response<FileOperationResult>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let root = match configured_root(&state) {
        Ok(root) => root,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let sources: Vec<PathBuf> = match contained_sources(&root, item_relative_paths) {
        Ok(sources) => sources.into_iter().map(|(_, path)| path).collect(),
        Err(error) => return Ok(error_response(&context, error)),
    };
    let lock = state.file_operations.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| {
            request_error(ErrorCode::Internal, "File operation state is unavailable.")
        })?;
        delete_items(sources, permanent)
    })
    .await
    .map_err(|error| format!("delete worker failed: {error}"))?;
    Ok(operation_response(context, result))
}

#[tauri::command]
pub async fn set_file_clipboard(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_paths: Vec<String>,
    cut: bool,
) -> Result<Response<FileOperationResult>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let root = match configured_root(&state) {
        Ok(root) => root,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let sources: Vec<PathBuf> = match contained_sources(&root, item_relative_paths) {
        Ok(sources) => sources.into_iter().map(|(_, path)| path).collect(),
        Err(error) => return Ok(error_response(&context, error)),
    };
    let count = sources.len();
    let lock = state.file_operations.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| {
            request_error(ErrorCode::Internal, "File operation state is unavailable.")
        })?;
        write_file_clipboard(&sources, cut)?;
        Ok(FileOperationResult {
            operation: if cut {
                FileOperationKind::Cut
            } else {
                FileOperationKind::ClipboardCopy
            },
            affected: count,
        })
    })
    .await
    .map_err(|error| format!("clipboard worker failed: {error}"))?;
    Ok(operation_response(context, result))
}

#[tauri::command]
pub async fn file_clipboard_status(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<FileClipboardStatus>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let result = tauri::async_runtime::spawn_blocking(read_file_clipboard_status)
        .await
        .map_err(|error| format!("clipboard status worker failed: {error}"))?;
    Ok(clipboard_response(context, result))
}

#[tauri::command]
pub async fn paste_file_items(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    destination_relative_path: String,
) -> Result<Response<FileOperationResult>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let root = match configured_root(&state) {
        Ok(root) => root,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let destination_relative = match parse_relative(destination_relative_path) {
        Ok(relative) => relative,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let destination = match contained_directory(&root, &destination_relative) {
        Ok(destination) => destination,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let lock = state.file_operations.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| {
            request_error(ErrorCode::Internal, "File operation state is unavailable.")
        })?;
        let (sources, cut) = read_file_clipboard()?;
        if sources.is_empty() {
            return Err(request_error(
                ErrorCode::InvalidRequest,
                "The Windows clipboard does not contain files.",
            ));
        }
        let kind = if cut {
            TransferKind::Move
        } else {
            TransferKind::Copy
        };
        transfer_items(sources.clone(), destination, kind)?;
        if cut {
            // The move has already committed. A clipboard lock must not turn a
            // successful filesystem mutation into a reported failure.
            let _ = clear_clipboard();
        }
        Ok(FileOperationResult {
            operation: if cut {
                FileOperationKind::PasteMove
            } else {
                FileOperationKind::PasteCopy
            },
            affected: sources.len(),
        })
    })
    .await
    .map_err(|error| format!("paste worker failed: {error}"))?;
    Ok(operation_response(context, result))
}

async fn shell_open_command(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_path: String,
    operation: FileOperationKind,
) -> Result<Response<FileOperationResult>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let root = match configured_root(&state) {
        Ok(root) => root,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let relative = match parse_non_root_relative(item_relative_path) {
        Ok(relative) => relative,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let path = match contained_existing_path(&root, &relative) {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let result = tauri::async_runtime::spawn_blocking(move || {
        launch_shell_item(&path, operation)?;
        Ok(FileOperationResult {
            operation,
            affected: 1,
        })
    })
    .await
    .map_err(|error| format!("Windows shell worker failed: {error}"))?;
    Ok(operation_response(context, result))
}

#[tauri::command]
pub async fn reveal_file_item(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_path: String,
) -> Result<Response<FileOperationResult>, String> {
    shell_open_command(
        state,
        context,
        item_relative_path,
        FileOperationKind::Reveal,
    )
    .await
}

#[tauri::command]
pub async fn open_file_item_default(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_path: String,
) -> Result<Response<FileOperationResult>, String> {
    shell_open_command(
        state,
        context,
        item_relative_path,
        FileOperationKind::OpenDefault,
    )
    .await
}

#[tauri::command]
pub async fn open_file_item_with(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_path: String,
) -> Result<Response<FileOperationResult>, String> {
    shell_open_command(
        state,
        context,
        item_relative_path,
        FileOperationKind::OpenWith,
    )
    .await
}

#[cfg(target_os = "windows")]
fn launch_shell_item(path: &Path, operation: FileOperationKind) -> Result<(), AppError> {
    let mut command = match operation {
        FileOperationKind::Reveal => {
            let mut command = Command::new("explorer.exe");
            command.arg(format!("/select,{}", path.display()));
            command
        }
        FileOperationKind::OpenWith => {
            let mut command = Command::new("rundll32.exe");
            command.arg("shell32.dll,OpenAs_RunDLL").arg(path);
            command
        }
        FileOperationKind::OpenDefault => {
            let mut command = Command::new("explorer.exe");
            command.arg(path);
            command
        }
        _ => {
            return Err(request_error(
                ErrorCode::InvalidRequest,
                "Unsupported Windows shell operation.",
            ));
        }
    };
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| file_io_error(None, error))
}

#[cfg(not(target_os = "windows"))]
fn launch_shell_item(_path: &Path, _operation: FileOperationKind) -> Result<(), AppError> {
    Err(request_error(
        ErrorCode::UnsupportedFormat,
        "Windows shell operations are available only on Windows.",
    ))
}

fn shell_delete(sources: &[PathBuf], allow_undo: bool) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Shell::{
            FO_DELETE, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_NORECURSEREPARSE,
            SHFILEOPSTRUCTW, SHFileOperationW,
        };
        use windows::core::PCWSTR;

        // Windows canonicalization commonly adds an extended-length prefix.
        // The legacy Shell delete API does not consistently accept that form,
        // even though ordinary filesystem APIs do.
        let shell_sources: Vec<PathBuf> = sources
            .iter()
            .map(|path| PathBuf::from(super::library_root::display_path(path)))
            .collect();
        let from = wide_multi_string(shell_sources.iter().map(PathBuf::as_path))?;
        let mut flags = FOF_NOCONFIRMATION.0 | FOF_NOERRORUI.0 | FOF_NORECURSEREPARSE.0;
        if allow_undo {
            flags |= FOF_ALLOWUNDO.0;
        }
        let mut operation = SHFILEOPSTRUCTW {
            wFunc: FO_DELETE,
            pFrom: PCWSTR(from.as_ptr()),
            fFlags: flags as u16,
            ..Default::default()
        };
        let result = unsafe { SHFileOperationW(&mut operation) };
        if operation.fAnyOperationsAborted.as_bool() {
            return Err(AppError::cancelled());
        }
        if result != 0 {
            return Err(shell_error(result));
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (sources, allow_undo);
        Err(request_error(
            ErrorCode::UnsupportedFormat,
            "Windows recycle-bin operations are available only on Windows.",
        ))
    }
}

#[cfg(target_os = "windows")]
fn wide_multi_string<'a>(paths: impl Iterator<Item = &'a Path>) -> Result<Vec<u16>, AppError> {
    use std::os::windows::ffi::OsStrExt;

    let mut result = Vec::new();
    for path in paths {
        let wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        if wide.contains(&0) {
            return Err(request_error(
                ErrorCode::InvalidPath,
                "A path contains NUL.",
            ));
        }
        result.extend(wide);
        result.push(0);
    }
    result.push(0);
    Ok(result)
}

#[cfg(target_os = "windows")]
fn shell_error(code: i32) -> AppError {
    let (error_code, retryable) = match code as u32 {
        2 | 3 => (ErrorCode::NotFound, true),
        5 | 32 => (ErrorCode::AccessDenied, true),
        80 | 183 => (ErrorCode::Conflict, false),
        _ => (ErrorCode::Internal, true),
    };
    AppError {
        code: error_code,
        message: format!("Windows shell file operation failed with code {code}."),
        target: None,
        retryable,
    }
}

#[cfg(target_os = "windows")]
struct ClipboardGuard;

#[cfg(target_os = "windows")]
impl ClipboardGuard {
    fn open() -> Result<Self, AppError> {
        use windows::Win32::System::DataExchange::OpenClipboard;
        unsafe { OpenClipboard(None) }.map_err(clipboard_error)?;
        Ok(Self)
    }
}

#[cfg(target_os = "windows")]
impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        use windows::Win32::System::DataExchange::CloseClipboard;
        let _ = unsafe { CloseClipboard() };
    }
}

const DIB_V5_HEADER_BYTES: usize = 124;

fn build_dib_v5(width: u32, height: u32, bgra: &[u8]) -> Result<Vec<u8>, AppError> {
    let pixel_bytes = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|pixels| pixels.checked_mul(4))
        .and_then(|bytes| usize::try_from(bytes).ok())
        .ok_or_else(|| clipboard_error("Image clipboard dimensions cannot fit in memory."))?;
    let payload_bytes = DIB_V5_HEADER_BYTES
        .checked_add(pixel_bytes)
        .ok_or_else(|| clipboard_error("Image clipboard payload size overflowed."))?;
    if width == 0
        || height == 0
        || bgra.len() != pixel_bytes
        || u64::try_from(payload_bytes).unwrap_or(u64::MAX) > MAX_IMAGE_BYTES
    {
        return Err(clipboard_error(
            "Image clipboard payload exceeds the resource limit.",
        ));
    }
    let width =
        i32::try_from(width).map_err(|_| clipboard_error("Image clipboard width is too large."))?;
    let height = i32::try_from(height)
        .map_err(|_| clipboard_error("Image clipboard height is too large."))?;
    let image_size = u32::try_from(pixel_bytes)
        .map_err(|_| clipboard_error("Image clipboard pixel buffer is too large."))?;
    let mut payload = Vec::new();
    payload
        .try_reserve_exact(payload_bytes)
        .map_err(|_| clipboard_error("Cannot allocate image clipboard memory."))?;
    payload.resize(payload_bytes, 0);
    let write_u16 = |buffer: &mut [u8], offset: usize, value: u16| {
        buffer[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
    };
    let write_u32 = |buffer: &mut [u8], offset: usize, value: u32| {
        buffer[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    };
    let write_i32 = |buffer: &mut [u8], offset: usize, value: i32| {
        buffer[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    };
    write_u32(&mut payload, 0, DIB_V5_HEADER_BYTES as u32);
    write_i32(&mut payload, 4, width);
    write_i32(&mut payload, 8, -height);
    write_u16(&mut payload, 12, 1);
    write_u16(&mut payload, 14, 32);
    write_u32(&mut payload, 16, 3); // BI_BITFIELDS
    write_u32(&mut payload, 20, image_size);
    write_u32(&mut payload, 40, 0x00ff_0000);
    write_u32(&mut payload, 44, 0x0000_ff00);
    write_u32(&mut payload, 48, 0x0000_00ff);
    write_u32(&mut payload, 52, 0xff00_0000);
    write_u32(&mut payload, 56, 0x7352_4742); // LCS_sRGB
    payload[DIB_V5_HEADER_BYTES..].copy_from_slice(bgra);
    Ok(payload)
}

#[cfg(target_os = "windows")]
pub(crate) fn write_image_clipboard(
    width: u32,
    height: u32,
    bgra: &[u8],
) -> Result<usize, AppError> {
    use windows::Win32::Foundation::{GlobalFree, HANDLE};
    use windows::Win32::System::DataExchange::{EmptyClipboard, SetClipboardData};
    use windows::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock};
    use windows::Win32::System::Ole::CF_DIBV5;

    let payload = build_dib_v5(width, height, bgra)?;
    let memory = unsafe { GlobalAlloc(GMEM_MOVEABLE, payload.len()) }.map_err(clipboard_error)?;
    let pointer = unsafe { GlobalLock(memory) };
    if pointer.is_null() {
        let _ = unsafe { GlobalFree(Some(memory)) };
        return Err(clipboard_error("Cannot lock image clipboard memory."));
    }
    unsafe {
        std::ptr::copy_nonoverlapping(payload.as_ptr(), pointer.cast::<u8>(), payload.len());
        let _ = GlobalUnlock(memory);
    }
    let _guard = match ClipboardGuard::open() {
        Ok(guard) => guard,
        Err(error) => {
            let _ = unsafe { GlobalFree(Some(memory)) };
            return Err(error);
        }
    };
    if let Err(error) = unsafe { EmptyClipboard() } {
        let _ = unsafe { GlobalFree(Some(memory)) };
        return Err(clipboard_error(error));
    }
    if let Err(error) = unsafe { SetClipboardData(CF_DIBV5.0 as u32, Some(HANDLE(memory.0))) } {
        let _ = unsafe { GlobalFree(Some(memory)) };
        return Err(clipboard_error(error));
    }
    Ok(payload.len())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn write_image_clipboard(
    _width: u32,
    _height: u32,
    _bgra: &[u8],
) -> Result<usize, AppError> {
    Err(request_error(
        ErrorCode::UnsupportedFormat,
        "Image clipboard operations are available only on Windows.",
    ))
}

#[cfg(target_os = "windows")]
fn write_file_clipboard(paths: &[PathBuf], cut: bool) -> Result<(), AppError> {
    use std::mem::size_of;
    use std::os::windows::ffi::OsStrExt;

    use windows::Win32::Foundation::{GlobalFree, HANDLE};
    use windows::Win32::System::DataExchange::{
        EmptyClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock};
    use windows::Win32::System::Ole::{CF_HDROP, DROPEFFECT_COPY, DROPEFFECT_MOVE};
    use windows::Win32::UI::Shell::DROPFILES;
    use windows::core::w;

    let mut wide_paths = Vec::new();
    for path in paths {
        wide_paths.extend(path.as_os_str().encode_wide());
        wide_paths.push(0);
    }
    wide_paths.push(0);
    let byte_count = size_of::<DROPFILES>() + wide_paths.len() * size_of::<u16>();
    let drop_memory = unsafe { GlobalAlloc(GMEM_MOVEABLE, byte_count) }.map_err(clipboard_error)?;
    let drop_pointer = unsafe { GlobalLock(drop_memory) };
    if drop_pointer.is_null() {
        let _ = unsafe { GlobalFree(Some(drop_memory)) };
        return Err(clipboard_error("Cannot lock file clipboard memory."));
    }
    unsafe {
        std::ptr::write_unaligned(
            drop_pointer.cast::<DROPFILES>(),
            DROPFILES {
                pFiles: size_of::<DROPFILES>() as u32,
                fWide: true.into(),
                ..Default::default()
            },
        );
        std::ptr::copy_nonoverlapping(
            wide_paths.as_ptr(),
            drop_pointer
                .cast::<u8>()
                .add(size_of::<DROPFILES>())
                .cast::<u16>(),
            wide_paths.len(),
        );
        let _ = GlobalUnlock(drop_memory);
    }

    let effect_memory = match unsafe { GlobalAlloc(GMEM_MOVEABLE, size_of::<u32>()) } {
        Ok(memory) => memory,
        Err(error) => {
            let _ = unsafe { GlobalFree(Some(drop_memory)) };
            return Err(clipboard_error(error));
        }
    };
    let effect_pointer = unsafe { GlobalLock(effect_memory) };
    if effect_pointer.is_null() {
        let _ = unsafe { GlobalFree(Some(drop_memory)) };
        let _ = unsafe { GlobalFree(Some(effect_memory)) };
        return Err(clipboard_error("Cannot lock clipboard effect memory."));
    }
    unsafe {
        std::ptr::write_unaligned(
            effect_pointer.cast::<u32>(),
            if cut {
                DROPEFFECT_MOVE.0
            } else {
                DROPEFFECT_COPY.0
            },
        );
        let _ = GlobalUnlock(effect_memory);
    }

    let _guard = match ClipboardGuard::open() {
        Ok(guard) => guard,
        Err(error) => {
            let _ = unsafe { GlobalFree(Some(drop_memory)) };
            let _ = unsafe { GlobalFree(Some(effect_memory)) };
            return Err(error);
        }
    };
    if let Err(error) = unsafe { EmptyClipboard() } {
        let _ = unsafe { GlobalFree(Some(drop_memory)) };
        let _ = unsafe { GlobalFree(Some(effect_memory)) };
        return Err(clipboard_error(error));
    }
    if let Err(error) = unsafe { SetClipboardData(CF_HDROP.0 as u32, Some(HANDLE(drop_memory.0))) }
    {
        let _ = unsafe { GlobalFree(Some(drop_memory)) };
        let _ = unsafe { GlobalFree(Some(effect_memory)) };
        return Err(clipboard_error(error));
    }
    let effect_format = unsafe { RegisterClipboardFormatW(w!("Preferred DropEffect")) };
    if effect_format == 0 {
        let _ = unsafe { GlobalFree(Some(effect_memory)) };
        return Err(clipboard_error(
            "Cannot register the clipboard drop effect.",
        ));
    }
    if let Err(error) = unsafe { SetClipboardData(effect_format, Some(HANDLE(effect_memory.0))) } {
        let _ = unsafe { GlobalFree(Some(effect_memory)) };
        return Err(clipboard_error(error));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn write_file_clipboard(_paths: &[PathBuf], _cut: bool) -> Result<(), AppError> {
    Err(request_error(
        ErrorCode::UnsupportedFormat,
        "File clipboard operations are available only on Windows.",
    ))
}

#[cfg(target_os = "windows")]
fn read_file_clipboard() -> Result<(Vec<PathBuf>, bool), AppError> {
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::DataExchange::{
        GetClipboardData, IsClipboardFormatAvailable, RegisterClipboardFormatW,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};
    use windows::Win32::System::Ole::{CF_HDROP, DROPEFFECT_MOVE};
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};
    use windows::core::w;

    if unsafe { IsClipboardFormatAvailable(CF_HDROP.0 as u32) }.is_err() {
        return Ok((Vec::new(), false));
    }
    let _guard = ClipboardGuard::open()?;
    let handle = unsafe { GetClipboardData(CF_HDROP.0 as u32) }.map_err(clipboard_error)?;
    let drop = HDROP(handle.0);
    let count = unsafe { DragQueryFileW(drop, u32::MAX, None) };
    if count as usize > MAX_FILE_OPERATION_ITEMS {
        return Err(request_error(
            ErrorCode::ResourceLimit,
            "The Windows clipboard contains too many file items.",
        ));
    }
    let mut paths = Vec::with_capacity(count as usize);
    let mut total_utf16 = 0usize;
    for index in 0..count {
        let length = unsafe { DragQueryFileW(drop, index, None) };
        let length = length as usize;
        total_utf16 = total_utf16.saturating_add(length + 1);
        if length > MAX_CLIPBOARD_PATH_UTF16 || total_utf16 > MAX_CLIPBOARD_TOTAL_UTF16 {
            return Err(request_error(
                ErrorCode::ResourceLimit,
                "The Windows file clipboard path data is too large.",
            ));
        }
        let mut buffer = vec![0u16; length + 1];
        let copied = unsafe { DragQueryFileW(drop, index, Some(&mut buffer)) };
        if copied == 0 {
            return Err(clipboard_error(
                "Cannot read a file path from the clipboard.",
            ));
        }
        paths.push(PathBuf::from(String::from_utf16_lossy(
            &buffer[..copied as usize],
        )));
    }
    let effect_format = unsafe { RegisterClipboardFormatW(w!("Preferred DropEffect")) };
    let cut = if effect_format == 0 {
        false
    } else if let Ok(effect_handle) = unsafe { GetClipboardData(effect_format) } {
        let global = HGLOBAL(effect_handle.0);
        let pointer = unsafe { GlobalLock(global) };
        if pointer.is_null() {
            false
        } else {
            let effect = unsafe { std::ptr::read_unaligned(pointer.cast::<u32>()) };
            let _ = unsafe { GlobalUnlock(global) };
            effect & DROPEFFECT_MOVE.0 != 0
        }
    } else {
        false
    };
    Ok((paths, cut))
}

#[cfg(not(target_os = "windows"))]
fn read_file_clipboard() -> Result<(Vec<PathBuf>, bool), AppError> {
    Err(request_error(
        ErrorCode::UnsupportedFormat,
        "File clipboard operations are available only on Windows.",
    ))
}

fn read_file_clipboard_status() -> Result<FileClipboardStatus, AppError> {
    let (paths, cut) = read_file_clipboard()?;
    Ok(FileClipboardStatus {
        available: !paths.is_empty(),
        cut,
        items: paths.len(),
    })
}

#[cfg(target_os = "windows")]
fn clear_clipboard() -> Result<(), AppError> {
    use windows::Win32::System::DataExchange::EmptyClipboard;

    let _guard = ClipboardGuard::open()?;
    unsafe { EmptyClipboard() }.map_err(clipboard_error)
}

#[cfg(not(target_os = "windows"))]
fn clear_clipboard() -> Result<(), AppError> {
    Err(request_error(
        ErrorCode::UnsupportedFormat,
        "File clipboard operations are available only on Windows.",
    ))
}

fn clipboard_error(error: impl std::fmt::Display) -> AppError {
    AppError {
        code: ErrorCode::AccessDenied,
        message: format!("Windows file clipboard is unavailable: {error}"),
        target: None,
        retryable: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "windows")]
    static CLIPBOARD_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn fixture(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "comic-explorer-file-operation-{name}-{}-{}",
            std::process::id(),
            super::super::unix_millis()
        ))
    }

    #[test]
    fn names_reject_windows_reserved_and_unsafe_forms() {
        for value in [
            "", " name", "name ", "name.", "..", "a/b", "a\\b", "CON", "CONIN$", "lpt9.txt",
        ] {
            assert!(validate_item_name(value).is_err(), "{value}");
        }
        assert!(validate_item_name(&"長".repeat(MAX_FILE_NAME_UTF16 + 1)).is_err());
        assert_eq!(validate_item_name("第1巻.cbz").unwrap(), "第1巻.cbz");
    }

    #[test]
    fn rename_and_create_are_scoped_and_never_overwrite() {
        let root = fixture("rename-create");
        fs::create_dir_all(root.join("books")).unwrap();
        fs::write(root.join("books/old.cbz"), b"book").unwrap();

        let renamed = rename_item(
            &root,
            RelativePath::parse("books/old.cbz").unwrap(),
            "new.cbz".into(),
        )
        .unwrap();
        assert_eq!(renamed.affected, 1);
        assert!(root.join("books/new.cbz").is_file());
        fs::write(root.join("books/existing.cbz"), b"other").unwrap();
        assert_eq!(
            rename_item(
                &root,
                RelativePath::parse("books/new.cbz").unwrap(),
                "existing.cbz".into(),
            )
            .unwrap_err()
            .code,
            ErrorCode::Conflict
        );

        create_folder(
            &root,
            RelativePath::parse("books").unwrap(),
            "new folder".into(),
        )
        .unwrap();
        assert!(root.join("books/new folder").is_dir());
        assert_eq!(
            create_folder(
                &root,
                RelativePath::parse("books").unwrap(),
                "new folder".into(),
            )
            .unwrap_err()
            .code,
            ErrorCode::Conflict
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn transfer_preflight_rejects_collisions_and_descendants() {
        let root = fixture("transfer");
        let source = root.join("source");
        let child = source.join("child");
        let destination = root.join("destination");
        fs::create_dir_all(&child).unwrap();
        fs::create_dir_all(&destination).unwrap();

        assert_eq!(
            validate_transfer(std::slice::from_ref(&source), &child)
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        fs::create_dir(destination.join("source")).unwrap();
        assert_eq!(
            validate_transfer(std::slice::from_ref(&source), &destination)
                .unwrap_err()
                .code,
            ErrorCode::Conflict
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn shell_delete_paths_remove_only_extended_length_prefixes() {
        assert_eq!(
            super::super::library_root::display_path(Path::new(r"\\?\C:\Comics\book.cbz")),
            r"C:\Comics\book.cbz"
        );
        assert_eq!(
            super::super::library_root::display_path(Path::new(
                r"\\?\UNC\server\share\Comics\book.cbz"
            )),
            r"\\server\share\Comics\book.cbz"
        );
    }

    #[test]
    fn req_ley_p2_014_builds_bounded_top_down_dib_v5() {
        let pixels = [3, 2, 1, 4, 7, 6, 5, 8];
        let payload = build_dib_v5(2, 1, &pixels).unwrap();
        assert_eq!(payload.len(), DIB_V5_HEADER_BYTES + pixels.len());
        assert_eq!(u32::from_le_bytes(payload[0..4].try_into().unwrap()), 124);
        assert_eq!(i32::from_le_bytes(payload[4..8].try_into().unwrap()), 2);
        assert_eq!(i32::from_le_bytes(payload[8..12].try_into().unwrap()), -1);
        assert_eq!(u16::from_le_bytes(payload[14..16].try_into().unwrap()), 32);
        assert_eq!(
            u32::from_le_bytes(payload[52..56].try_into().unwrap()),
            0xff00_0000
        );
        assert_eq!(&payload[DIB_V5_HEADER_BYTES..], &pixels);
        assert!(build_dib_v5(2, 1, &[0; 4]).is_err());
        assert!(build_dib_v5(u32::MAX, u32::MAX, &[]).is_err());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_file_clipboard_round_trips_copy_and_cut_effects() {
        let _clipboard = CLIPBOARD_TEST_LOCK.lock().unwrap();
        let root = fixture("clipboard");
        fs::create_dir_all(&root).unwrap();
        let first = root.join("first.cbz");
        let second = root.join("second.pdf");
        fs::write(&first, b"first").unwrap();
        fs::write(&second, b"second").unwrap();

        write_file_clipboard(&[first.clone(), second.clone()], false).unwrap();
        let (copied, cut) = read_file_clipboard().unwrap();
        assert_eq!(copied, vec![first.clone(), second.clone()]);
        assert!(!cut);

        write_file_clipboard(std::slice::from_ref(&first), true).unwrap();
        let (copied, cut) = read_file_clipboard().unwrap();
        assert_eq!(copied, vec![first]);
        assert!(cut);
        clear_clipboard().unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn req_ley_p2_014_windows_image_clipboard_exposes_dib_v5() {
        use windows::Win32::System::DataExchange::IsClipboardFormatAvailable;
        use windows::Win32::System::Ole::CF_DIBV5;

        let _clipboard = CLIPBOARD_TEST_LOCK.lock().unwrap();
        let bytes = write_image_clipboard(1, 1, &[30, 20, 10, 40]).unwrap();
        assert_eq!(bytes, DIB_V5_HEADER_BYTES + 4);
        assert!(unsafe { IsClipboardFormatAvailable(CF_DIBV5.0 as u32) }.is_ok());
        clear_clipboard().unwrap();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_copy_move_and_permanent_delete_change_only_selected_targets() {
        let root = fixture("shell-transfer");
        let source = root.join("source");
        let destination = root.join("destination");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&destination).unwrap();
        let copied_source = source.join("copy.cbz");
        let moved_source = source.join("move.pdf");
        fs::write(&copied_source, b"copy").unwrap();
        fs::write(&moved_source, b"move").unwrap();

        transfer_items(
            vec![copied_source.clone()],
            destination.clone(),
            TransferKind::Copy,
        )
        .unwrap();
        assert!(copied_source.is_file());
        assert_eq!(fs::read(destination.join("copy.cbz")).unwrap(), b"copy");

        transfer_items(
            vec![moved_source.clone()],
            destination.clone(),
            TransferKind::Move,
        )
        .unwrap();
        assert!(!moved_source.exists());
        assert_eq!(fs::read(destination.join("move.pdf")).unwrap(), b"move");

        delete_items(vec![destination.join("copy.cbz")], true).unwrap();
        assert!(!destination.join("copy.cbz").exists());
        assert!(destination.join("move.pdf").is_file());
        fs::remove_dir_all(root).unwrap();
    }
}
