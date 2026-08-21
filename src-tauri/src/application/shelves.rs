use std::collections::{HashMap, HashSet};
use std::fs;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};

use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::api::{RequestContext, Response};
use crate::domain::{AppError, ErrorCode, FileKind, RelativePath, classify_file_name};
use crate::state::{NewShelfNodeRecord, ShelfSnapshotRecord};

use super::{
    AppState, cli_launch, error_response, library_root, request_error, unix_millis,
    validate_request,
};

const MAX_ADD_ITEMS: usize = 256;
const MAX_TREE_DEPTH: usize = 64;
const MAX_IMPORT_BYTES: usize = 16 * 1024 * 1024;
const MAX_IMPORT_LINE_BYTES: usize = 64 * 1024;
const MAX_IMPORT_NODES: usize = 50_000;
const ICONS: [&str; 5] = ["books", "folder", "star", "archive", "image"];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddShelfItemsRequest {
    pub shelf_id: i64,
    pub parent_id: Option<i64>,
    pub relative_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShelfCleanupPreview {
    pub missing_node_ids: Vec<i64>,
    pub unavailable_node_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShelfNodeDeletePreview {
    pub root_node_id: i64,
    pub total_node_count: usize,
    pub preview_key: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShelfTextExport {
    pub file_name: String,
    pub bytes: Vec<u8>,
    pub shelf_count: usize,
    pub node_count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShelfImportPreview {
    pub shelf_count: usize,
    pub node_count: usize,
    pub conflicting_names: Vec<String>,
    pub preview_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum ShelfTextLine {
    #[serde(rename = "comic-explorer-shelves")]
    Metadata { version: u32 },
    Shelf {
        key: String,
        name: String,
        icon: String,
    },
    Node {
        key: String,
        shelf: String,
        parent: Option<String>,
        node_type: String,
        name: String,
        target_path: Option<String>,
        target_kind: Option<String>,
        icon: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ImportedShelf {
    key: String,
    name: String,
    icon: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ImportedNode {
    key: String,
    shelf: String,
    parent: Option<String>,
    node_type: String,
    name: String,
    target_path: Option<String>,
    target_kind: Option<String>,
    icon: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ImportedDocument {
    shelves: Vec<ImportedShelf>,
    nodes: Vec<ImportedNode>,
}

fn invalid(message: &str) -> AppError {
    request_error(ErrorCode::InvalidRequest, message)
}

fn store_unavailable() -> AppError {
    invalid("State store is not available.")
}

fn validate_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if !(1..=64).contains(&name.encode_utf16().count())
        || name
            .chars()
            .any(|value| value.is_control() || matches!(value, '/' | '\\'))
    {
        return Err(invalid(
            "Shelf names must contain 1 to 64 characters without control characters or slashes.",
        ));
    }
    Ok(name.to_owned())
}

fn validate_icon(icon: &str) -> Result<String, AppError> {
    if !ICONS.contains(&icon) {
        return Err(invalid("Shelf icon preset is invalid."));
    }
    Ok(icon.to_owned())
}

fn validate_identity(value: i64, label: &str) -> Result<i64, AppError> {
    if value <= 0 {
        return Err(invalid(&format!("{label} is invalid.")));
    }
    Ok(value)
}

fn validate_text_key(value: &str) -> Result<String, AppError> {
    if value.is_empty()
        || value.len() > 128
        || value.chars().any(|character| {
            !character.is_ascii_alphanumeric() && character != '-' && character != '_'
        })
    {
        return Err(invalid("Shelf import key is invalid."));
    }
    Ok(value.to_owned())
}

fn validate_import_target(
    node_type: &str,
    target_path: Option<String>,
    target_kind: Option<String>,
) -> Result<(Option<String>, Option<String>), AppError> {
    match node_type {
        "folder" if target_path.is_none() && target_kind.is_none() => Ok((None, None)),
        "item" => {
            let path =
                target_path.ok_or_else(|| invalid("Imported shelf item path is missing."))?;
            if path.encode_utf16().count() > 32_767
                || path.chars().any(char::is_control)
                || !Path::new(&path).is_absolute()
            {
                return Err(invalid("Imported shelf item path is invalid."));
            }
            let kind =
                target_kind.ok_or_else(|| invalid("Imported shelf item kind is missing."))?;
            if !matches!(kind.as_str(), "folder" | "page" | "archive" | "pdf") {
                return Err(invalid("Imported shelf item kind is invalid."));
            }
            Ok((Some(path), Some(kind)))
        }
        _ => Err(invalid("Imported shelf node type is invalid.")),
    }
}

fn parse_shelf_document(bytes: &[u8]) -> Result<ImportedDocument, AppError> {
    if bytes.is_empty() || bytes.len() > MAX_IMPORT_BYTES {
        return Err(request_error(
            ErrorCode::ResourceLimit,
            "Shelf import must contain between 1 byte and 16 MiB.",
        ));
    }
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
    let text = std::str::from_utf8(bytes).map_err(|_| invalid("Shelf import must be UTF-8."))?;
    let mut lines = text.lines().filter(|line| !line.trim().is_empty());
    let first = lines
        .next()
        .ok_or_else(|| invalid("Shelf import metadata is missing."))?;
    if first.len() > MAX_IMPORT_LINE_BYTES {
        return Err(request_error(
            ErrorCode::ResourceLimit,
            "Shelf import line exceeds 64 KiB.",
        ));
    }
    match serde_json::from_str::<ShelfTextLine>(first)
        .map_err(|_| invalid("Shelf import metadata is invalid."))?
    {
        ShelfTextLine::Metadata { version: 1 } => {}
        _ => {
            return Err(request_error(
                ErrorCode::UnsupportedFormat,
                "Shelf import version is unsupported.",
            ));
        }
    }
    let mut shelves = Vec::new();
    let mut nodes = Vec::new();
    let mut shelf_keys = HashSet::new();
    let mut node_keys = HashSet::new();
    let mut node_shelf = HashMap::new();
    let mut node_depth = HashMap::new();
    let mut shelf_names = HashSet::new();
    let mut sibling_names = HashSet::new();
    let mut sibling_targets = HashSet::new();
    for line in lines {
        if line.len() > MAX_IMPORT_LINE_BYTES {
            return Err(request_error(
                ErrorCode::ResourceLimit,
                "Shelf import line exceeds 64 KiB.",
            ));
        }
        match serde_json::from_str::<ShelfTextLine>(line)
            .map_err(|_| invalid("Shelf import contains invalid JSON Lines."))?
        {
            ShelfTextLine::Metadata { .. } => {
                return Err(invalid("Shelf import metadata may appear only once."));
            }
            ShelfTextLine::Shelf { key, name, icon } => {
                let key = validate_text_key(&key)?;
                let name = validate_name(&name)?;
                let icon = validate_icon(&icon)?;
                if shelves.len() >= 64 {
                    return Err(request_error(
                        ErrorCode::ResourceLimit,
                        "Shelf import is limited to 64 shelves.",
                    ));
                }
                if !shelf_keys.insert(key.clone()) || !shelf_names.insert(name.to_lowercase()) {
                    return Err(request_error(
                        ErrorCode::Conflict,
                        "Shelf import contains duplicate shelves.",
                    ));
                }
                shelves.push(ImportedShelf { key, name, icon });
            }
            ShelfTextLine::Node {
                key,
                shelf,
                parent,
                node_type,
                name,
                target_path,
                target_kind,
                icon,
            } => {
                if nodes.len() >= MAX_IMPORT_NODES {
                    return Err(request_error(
                        ErrorCode::ResourceLimit,
                        "Shelf import is limited to 50,000 nodes.",
                    ));
                }
                let key = validate_text_key(&key)?;
                let shelf = validate_text_key(&shelf)?;
                let parent = parent.map(|value| validate_text_key(&value)).transpose()?;
                if !shelf_keys.contains(&shelf) || !node_keys.insert(key.clone()) {
                    return Err(invalid(
                        "Shelf import node references an invalid shelf or duplicate key.",
                    ));
                }
                let depth = match parent.as_ref() {
                    None => 1,
                    Some(parent) => {
                        if node_shelf.get(parent) != Some(&shelf) {
                            return Err(invalid(
                                "Shelf import parent must precede its child in the same shelf.",
                            ));
                        }
                        node_depth.get(parent).copied().unwrap_or(0) + 1
                    }
                };
                if depth > MAX_TREE_DEPTH {
                    return Err(request_error(
                        ErrorCode::ResourceLimit,
                        "Shelf import hierarchy exceeds 64 levels.",
                    ));
                }
                let name = validate_name(&name)?;
                let icon = validate_icon(&icon)?;
                let (target_path, target_kind) =
                    validate_import_target(&node_type, target_path, target_kind)?;
                let sibling_key = (shelf.clone(), parent.clone(), name.to_lowercase());
                if !sibling_names.insert(sibling_key) {
                    return Err(request_error(
                        ErrorCode::Conflict,
                        "Shelf import contains duplicate sibling names.",
                    ));
                }
                if let Some(path) = target_path.as_ref() {
                    let target_key = (shelf.clone(), parent.clone(), path.to_lowercase());
                    if !sibling_targets.insert(target_key) {
                        return Err(request_error(
                            ErrorCode::Conflict,
                            "Shelf import contains duplicate item targets.",
                        ));
                    }
                }
                node_shelf.insert(key.clone(), shelf.clone());
                node_depth.insert(key.clone(), depth);
                nodes.push(ImportedNode {
                    key,
                    shelf,
                    parent,
                    node_type,
                    name,
                    target_path,
                    target_kind,
                    icon,
                });
            }
        }
    }
    if shelves.is_empty() {
        return Err(invalid("Shelf import contains no shelves."));
    }
    let node_count_by_shelf =
        nodes
            .iter()
            .fold(HashMap::<&str, usize>::new(), |mut counts, node| {
                *counts.entry(&node.shelf).or_default() += 1;
                counts
            });
    if node_count_by_shelf.values().any(|count| *count > 10_000) {
        return Err(request_error(
            ErrorCode::ResourceLimit,
            "An imported shelf exceeds 10,000 nodes.",
        ));
    }
    Ok(ImportedDocument { shelves, nodes })
}

fn preview_key(bytes: &[u8], replace_existing: bool) -> String {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    replace_existing.hash(&mut hasher);
    format!("shelf-import-v1-{:016x}-{}", hasher.finish(), bytes.len())
}

fn shelf_node_delete_ids(
    snapshot: &ShelfSnapshotRecord,
    root_id: i64,
) -> Result<Vec<i64>, AppError> {
    if !snapshot.nodes.iter().any(|node| node.id == root_id) {
        return Err(request_error(
            ErrorCode::NotFound,
            "Shelf node was not found.",
        ));
    }
    let mut result = Vec::new();
    let mut pending = vec![root_id];
    while let Some(id) = pending.pop() {
        if result.len() >= 10_000 {
            return Err(request_error(
                ErrorCode::ResourceLimit,
                "Shelf node deletion is limited to 10,000 descendants.",
            ));
        }
        result.push(id);
        pending.extend(
            snapshot
                .nodes
                .iter()
                .filter(|node| node.parent_id == Some(id))
                .map(|node| node.id),
        );
    }
    result.sort_unstable();
    Ok(result)
}

fn shelf_node_delete_key(ids: &[i64]) -> String {
    let mut hasher = DefaultHasher::new();
    ids.hash(&mut hasher);
    format!("shelf-delete-v1-{:016x}-{}", hasher.finish(), ids.len())
}

fn database_error(error: rusqlite::Error) -> AppError {
    AppError {
        code: ErrorCode::Internal,
        message: format!("Local shelf database operation failed: {error}"),
        target: None,
        retryable: true,
    }
}

fn ok<T>(context: &RequestContext, data: T) -> Response<T> {
    Response::Ok {
        request_id: context.request_id.clone(),
        generation: context.generation,
        data,
    }
}

fn with_snapshot(
    state: &AppState,
    context: &RequestContext,
    mutate: impl FnOnce(&crate::state::StateStore) -> Result<(), AppError>,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(context, store_unavailable()));
    };
    if let Err(error) = mutate(store) {
        return Ok(error_response(context, error));
    }
    match store.shelf_snapshot() {
        Ok(snapshot) => Ok(ok(context, snapshot)),
        Err(error) => Ok(error_response(context, error)),
    }
}

#[tauri::command]
pub fn list_shelves(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    with_snapshot(&state, &context, |_| Ok(()))
}

#[tauri::command]
pub fn create_shelf(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    name: String,
    icon: String,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let name = match validate_name(&name) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let icon = match validate_icon(&icon) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    with_snapshot(&state, &context, |store| {
        store.create_shelf(&name, &icon, unix_millis()).map(|_| ())
    })
}

#[tauri::command]
pub fn update_shelf(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    shelf_id: i64,
    name: String,
    icon: String,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let shelf_id = match validate_identity(shelf_id, "Shelf id") {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let name = match validate_name(&name) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let icon = match validate_icon(&icon) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    with_snapshot(&state, &context, |store| {
        store.update_shelf(shelf_id, &name, &icon, unix_millis())
    })
}

#[tauri::command]
pub fn delete_shelf(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    shelf_id: i64,
    confirmed: bool,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !confirmed {
        return Ok(error_response(
            &context,
            invalid("Shelf deletion requires confirmation."),
        ));
    }
    let shelf_id = match validate_identity(shelf_id, "Shelf id") {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    with_snapshot(&state, &context, |store| store.delete_shelf(shelf_id))
}

#[tauri::command]
pub fn set_startup_shelf(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    shelf_id: Option<i64>,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if shelf_id.is_some_and(|value| value <= 0) {
        return Ok(error_response(
            &context,
            invalid("Startup shelf id is invalid."),
        ));
    }
    with_snapshot(&state, &context, |store| store.set_startup_shelf(shelf_id))
}

fn parent_depth(
    snapshot: &ShelfSnapshotRecord,
    shelf_id: i64,
    parent_id: Option<i64>,
) -> Result<usize, AppError> {
    let by_id = snapshot
        .nodes
        .iter()
        .map(|node| (node.id, node))
        .collect::<HashMap<_, _>>();
    let mut current = parent_id;
    let mut depth = 0;
    let mut visited = HashSet::new();
    while let Some(id) = current {
        if !visited.insert(id) {
            return Err(invalid("Shelf hierarchy contains a cycle."));
        }
        let node = by_id
            .get(&id)
            .filter(|node| node.shelf_id == shelf_id && node.node_type == "folder")
            .ok_or_else(|| invalid("Shelf parent is invalid."))?;
        depth += 1;
        if depth >= MAX_TREE_DEPTH {
            return Err(request_error(
                ErrorCode::ResourceLimit,
                "Shelf hierarchy is limited to 64 levels.",
            ));
        }
        current = node.parent_id;
    }
    Ok(depth)
}

#[tauri::command]
pub fn create_shelf_folder(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    shelf_id: i64,
    parent_id: Option<i64>,
    name: String,
    icon: String,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let name = match validate_name(&name) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let icon = match validate_icon(&icon) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    with_snapshot(&state, &context, |store| {
        let snapshot = store.shelf_snapshot()?;
        parent_depth(&snapshot, shelf_id, parent_id)?;
        store
            .create_shelf_folder(shelf_id, parent_id, &name, &icon, unix_millis())
            .map(|_| ())
    })
}

fn display_name(path: &Path) -> Result<String, AppError> {
    let value = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("Shelf item has no displayable name."))?;
    let mut result = String::new();
    for character in value.chars() {
        if result.encode_utf16().count() + character.len_utf16() > 64 {
            break;
        }
        result.push(character);
    }
    validate_name(&result)
}

fn classify_target(path: &Path) -> Result<(String, String), AppError> {
    if path.is_dir() {
        fs::read_dir(path).map_err(|error| path_error(path, error))?;
        return Ok(("folder".into(), "folder".into()));
    }
    if !path.is_file() {
        return Err(invalid("Shelf target is not a file or folder."));
    }
    fs::File::open(path).map_err(|error| path_error(path, error))?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    match classify_file_name(name) {
        FileKind::Image => Ok(("page".into(), "image".into())),
        FileKind::Archive => Ok(("archive".into(), "archive".into())),
        FileKind::Pdf => Ok(("pdf".into(), "books".into())),
        FileKind::Unsupported => Err(request_error(
            ErrorCode::UnsupportedFormat,
            "Unsupported files cannot be registered in a shelf.",
        )),
    }
}

fn path_error(path: &Path, error: std::io::Error) -> AppError {
    let (code, retryable) = match error.kind() {
        std::io::ErrorKind::NotFound => (ErrorCode::NotFound, true),
        std::io::ErrorKind::PermissionDenied => (ErrorCode::AccessDenied, true),
        _ => (ErrorCode::InvalidPath, true),
    };
    AppError {
        code,
        message: format!("Shelf target cannot be read: {} ({error})", path.display()),
        target: None,
        retryable,
    }
}

fn current_root(state: &AppState) -> Result<PathBuf, AppError> {
    state
        .library_root
        .lock()
        .map_err(|_| invalid("Library root state is unavailable."))?
        .clone()
        .ok_or_else(|| invalid("Select a library before adding shelf items."))
}

fn validate_relative_targets(
    state: &AppState,
    values: &[String],
    maximum: usize,
) -> Result<Vec<NewShelfNodeRecord>, AppError> {
    if values.is_empty() || values.len() > maximum {
        return Err(request_error(
            ErrorCode::ResourceLimit,
            &format!("Shelf registration must contain between 1 and {maximum} items."),
        ));
    }
    let root = current_root(state)?
        .canonicalize()
        .map_err(|error| path_error(Path::new("library"), error))?;
    let mut seen = HashSet::new();
    let mut items = Vec::with_capacity(values.len());
    for value in values {
        let relative =
            RelativePath::parse(value).map_err(|_| invalid("Shelf item path is invalid."))?;
        let requested = root.join(relative.as_str());
        let canonical = requested
            .canonicalize()
            .map_err(|error| path_error(&requested, error))?;
        if !canonical.starts_with(&root) {
            return Err(request_error(
                ErrorCode::OutsideLibraryRoot,
                "Shelf item resolves outside the current library.",
            ));
        }
        let key = library_root::display_path(&canonical).to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        let (target_kind, icon) = classify_target(&canonical)?;
        items.push(NewShelfNodeRecord {
            name: display_name(&canonical)?,
            target_path: library_root::display_path(&canonical),
            target_kind,
            icon,
        });
    }
    Ok(items)
}

#[tauri::command]
pub fn add_shelf_items(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    request: AddShelfItemsRequest,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let items = match validate_relative_targets(&state, &request.relative_paths, MAX_ADD_ITEMS) {
        Ok(items) => items,
        Err(error) => return Ok(error_response(&context, error)),
    };
    with_snapshot(&state, &context, |store| {
        let snapshot = store.shelf_snapshot()?;
        parent_depth(&snapshot, request.shelf_id, request.parent_id)?;
        store
            .add_shelf_items(request.shelf_id, request.parent_id, &items, unix_millis())
            .map(|_| ())
    })
}

#[tauri::command]
pub fn migrate_legacy_shelf(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    relative_paths: Vec<String>,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let items = match validate_relative_targets(&state, &relative_paths, 1_000) {
        Ok(items) => items,
        Err(error) => return Ok(error_response(&context, error)),
    };
    with_snapshot(&state, &context, |store| {
        let snapshot = store.shelf_snapshot()?;
        let shelf_id = match snapshot
            .shelves
            .iter()
            .find(|shelf| shelf.name.eq_ignore_ascii_case("移行済み"))
        {
            Some(shelf) => shelf.id,
            None => store.create_shelf("移行済み", "books", unix_millis())?,
        };
        store
            .add_shelf_items(shelf_id, None, &items, unix_millis())
            .map(|_| ())
    })
}

#[tauri::command]
pub fn update_shelf_node(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    node_id: i64,
    parent_id: Option<i64>,
    name: String,
    icon: String,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let name = match validate_name(&name) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let icon = match validate_icon(&icon) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    with_snapshot(&state, &context, |store| {
        let snapshot = store.shelf_snapshot()?;
        let shelf_id = snapshot
            .nodes
            .iter()
            .find(|node| node.id == node_id)
            .map(|node| node.shelf_id)
            .ok_or_else(|| request_error(ErrorCode::NotFound, "Shelf node was not found."))?;
        parent_depth(&snapshot, shelf_id, parent_id)?;
        store.update_shelf_node(node_id, parent_id, &name, &icon, unix_millis())
    })
}

#[tauri::command]
pub fn delete_shelf_nodes(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    node_ids: Vec<i64>,
    confirmed: bool,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !confirmed
        || node_ids.is_empty()
        || node_ids.len() > MAX_ADD_ITEMS
        || node_ids.iter().any(|id| *id <= 0)
    {
        return Ok(error_response(
            &context,
            invalid("Shelf node deletion requires a valid confirmed selection."),
        ));
    }
    let unique = node_ids
        .into_iter()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    with_snapshot(&state, &context, |store| {
        store.delete_shelf_nodes(&unique).map(|_| ())
    })
}

#[tauri::command]
pub fn preview_shelf_node_delete(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    node_id: i64,
) -> Result<Response<ShelfNodeDeletePreview>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(&context, store_unavailable()));
    };
    let snapshot = match store.shelf_snapshot() {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let ids = match shelf_node_delete_ids(&snapshot, node_id) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    Ok(ok(
        &context,
        ShelfNodeDeletePreview {
            root_node_id: node_id,
            total_node_count: ids.len(),
            preview_key: shelf_node_delete_key(&ids),
        },
    ))
}

#[tauri::command]
pub fn execute_shelf_node_delete(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    node_id: i64,
    preview_key: String,
    confirmed: bool,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !confirmed {
        return Ok(error_response(
            &context,
            invalid("Shelf node deletion requires confirmation."),
        ));
    }
    with_snapshot(&state, &context, |store| {
        let snapshot = store.shelf_snapshot()?;
        let ids = shelf_node_delete_ids(&snapshot, node_id)?;
        if shelf_node_delete_key(&ids) != preview_key {
            return Err(request_error(
                ErrorCode::Conflict,
                "Shelf hierarchy changed; preview deletion again.",
            ));
        }
        store.delete_shelf_nodes(&[node_id]).map(|_| ())
    })
}

#[tauri::command]
pub fn reorder_shelves(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    ordered_ids: Vec<i64>,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    with_snapshot(&state, &context, |store| {
        store.reorder_shelves(&ordered_ids)
    })
}

#[tauri::command]
pub fn reorder_shelf_nodes(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    shelf_id: i64,
    parent_id: Option<i64>,
    ordered_ids: Vec<i64>,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    with_snapshot(&state, &context, |store| {
        store.reorder_shelf_nodes(shelf_id, parent_id, &ordered_ids)
    })
}

#[tauri::command]
pub fn preview_shelf_cleanup(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    shelf_id: i64,
) -> Result<Response<ShelfCleanupPreview>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(&context, store_unavailable()));
    };
    let snapshot = match store.shelf_snapshot() {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let mut missing_node_ids = Vec::new();
    let mut unavailable_node_ids = Vec::new();
    for node in snapshot
        .nodes
        .iter()
        .filter(|node| node.shelf_id == shelf_id && node.node_type == "item")
        .take(10_001)
    {
        let Some(path) = node.target_path.as_deref() else {
            continue;
        };
        match fs::metadata(path) {
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                missing_node_ids.push(node.id)
            }
            Err(_) => unavailable_node_ids.push(node.id),
        }
    }
    if missing_node_ids.len() + unavailable_node_ids.len() > 10_000 {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::ResourceLimit,
                "Shelf cleanup is limited to 10,000 references.",
            ),
        ));
    }
    Ok(ok(
        &context,
        ShelfCleanupPreview {
            missing_node_ids,
            unavailable_node_ids,
        },
    ))
}

#[tauri::command]
pub fn execute_shelf_cleanup(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    shelf_id: i64,
    node_ids: Vec<i64>,
    confirmed: bool,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !confirmed || node_ids.len() > 10_000 {
        return Ok(error_response(
            &context,
            invalid("Shelf cleanup requires confirmation."),
        ));
    }
    with_snapshot(&state, &context, |store| {
        let snapshot = store.shelf_snapshot()?;
        let requested = node_ids.iter().copied().collect::<HashSet<_>>();
        let mut verified = Vec::new();
        for node in snapshot.nodes.iter().filter(|node| {
            node.shelf_id == shelf_id && node.node_type == "item" && requested.contains(&node.id)
        }) {
            let Some(path) = node.target_path.as_deref() else {
                continue;
            };
            match fs::metadata(path) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    verified.push(node.id)
                }
                _ => {}
            }
        }
        if verified.len() != requested.len() {
            return Err(request_error(
                ErrorCode::Conflict,
                "Shelf cleanup candidates changed; run preview again.",
            ));
        }
        store.delete_shelf_nodes(&verified).map(|_| ())
    })
}

#[tauri::command]
pub fn open_shelf_item(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    node_id: i64,
) -> Result<Response<cli_launch::CliLaunchPlan>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(&context, store_unavailable()));
    };
    let snapshot = match store.shelf_snapshot() {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let Some(path) = snapshot
        .nodes
        .iter()
        .find(|node| node.id == node_id && node.node_type == "item")
        .and_then(|node| node.target_path.as_deref())
    else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::NotFound, "Shelf item was not found."),
        ));
    };
    match cli_launch::resolve_target_plan(Path::new(path), cli_launch::CliLaunchMode::Normal) {
        Ok(plan) => Ok(ok(&context, plan)),
        Err(message) => Ok(error_response(
            &context,
            request_error(ErrorCode::InvalidPath, &message),
        )),
    }
}

fn append_export_nodes(
    output: &mut Vec<ShelfTextLine>,
    snapshot: &ShelfSnapshotRecord,
    shelf_id: i64,
    parent_id: Option<i64>,
    shelf_key: &str,
) {
    for node in snapshot
        .nodes
        .iter()
        .filter(|node| node.shelf_id == shelf_id && node.parent_id == parent_id)
    {
        let key = format!("node-{}", node.id);
        output.push(ShelfTextLine::Node {
            key: key.clone(),
            shelf: shelf_key.to_owned(),
            parent: parent_id.map(|id| format!("node-{id}")),
            node_type: node.node_type.clone(),
            name: node.name.clone(),
            target_path: node.target_path.clone(),
            target_kind: node.target_kind.clone(),
            icon: node.icon.clone(),
        });
        if node.node_type == "folder" {
            append_export_nodes(output, snapshot, shelf_id, Some(node.id), shelf_key);
        }
    }
}

#[tauri::command]
pub fn export_shelves_text(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    shelf_id: Option<i64>,
) -> Result<Response<ShelfTextExport>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(&context, store_unavailable()));
    };
    let snapshot = match store.shelf_snapshot() {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let shelves = snapshot
        .shelves
        .iter()
        .filter(|shelf| shelf_id.is_none_or(|id| shelf.id == id))
        .collect::<Vec<_>>();
    if shelves.is_empty() {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::NotFound, "No shelf is available to export."),
        ));
    }
    let mut lines = vec![ShelfTextLine::Metadata { version: 1 }];
    for shelf in &shelves {
        let key = format!("shelf-{}", shelf.id);
        lines.push(ShelfTextLine::Shelf {
            key: key.clone(),
            name: shelf.name.clone(),
            icon: shelf.icon.clone(),
        });
        append_export_nodes(&mut lines, &snapshot, shelf.id, None, &key);
    }
    let mut bytes = vec![0xef, 0xbb, 0xbf];
    for line in lines {
        let encoded = match serde_json::to_vec(&line) {
            Ok(value) => value,
            Err(_) => {
                return Ok(error_response(
                    &context,
                    invalid("Shelf export could not be encoded."),
                ));
            }
        };
        bytes.extend_from_slice(&encoded);
        bytes.extend_from_slice(b"\r\n");
        if bytes.len() > MAX_IMPORT_BYTES {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::ResourceLimit, "Shelf export exceeds 16 MiB."),
            ));
        }
    }
    let node_count = snapshot
        .nodes
        .iter()
        .filter(|node| shelves.iter().any(|shelf| shelf.id == node.shelf_id))
        .count();
    Ok(ok(
        &context,
        ShelfTextExport {
            file_name: if shelves.len() == 1 {
                "comic-explorer-shelf-v1.jsonl".into()
            } else {
                "comic-explorer-shelves-v1.jsonl".into()
            },
            bytes,
            shelf_count: shelves.len(),
            node_count,
        },
    ))
}

fn import_conflicts(snapshot: &ShelfSnapshotRecord, document: &ImportedDocument) -> Vec<String> {
    let stored = snapshot
        .shelves
        .iter()
        .map(|shelf| shelf.name.to_lowercase())
        .collect::<HashSet<_>>();
    document
        .shelves
        .iter()
        .filter(|shelf| stored.contains(&shelf.name.to_lowercase()))
        .map(|shelf| shelf.name.clone())
        .collect()
}

#[tauri::command]
pub fn preview_shelves_import(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    bytes: Vec<u8>,
    replace_existing: bool,
) -> Result<Response<ShelfImportPreview>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let document = match parse_shelf_document(&bytes) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let guard = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = guard.as_ref() else {
        return Ok(error_response(&context, store_unavailable()));
    };
    let snapshot = match store.shelf_snapshot() {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let conflicting_names = import_conflicts(&snapshot, &document);
    let resulting_count = snapshot.shelves.len() + document.shelves.len()
        - if replace_existing {
            conflicting_names.len()
        } else {
            0
        };
    if resulting_count > 64 {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::ResourceLimit,
                "Import would exceed the 64 shelf limit.",
            ),
        ));
    }
    Ok(ok(
        &context,
        ShelfImportPreview {
            shelf_count: document.shelves.len(),
            node_count: document.nodes.len(),
            conflicting_names,
            preview_key: preview_key(&bytes, replace_existing),
        },
    ))
}

fn apply_import(
    store: &crate::state::StateStore,
    document: &ImportedDocument,
    replace_existing: bool,
) -> Result<(), AppError> {
    let transaction = store
        .connection()
        .unchecked_transaction()
        .map_err(database_error)?;
    let conflicts = document
        .shelves
        .iter()
        .filter_map(|shelf| {
            transaction
                .query_row(
                    "SELECT id FROM virtual_shelves WHERE name=?1 COLLATE NOCASE",
                    [shelf.name.as_str()],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .transpose()
                .map(|result| result.map(|id| (shelf.name.clone(), id)))
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(database_error)?;
    if !replace_existing && !conflicts.is_empty() {
        return Err(request_error(
            ErrorCode::Conflict,
            "Imported shelf names already exist; choose explicit replacement.",
        ));
    }
    for (_, id) in conflicts {
        transaction
            .execute("DELETE FROM virtual_shelves WHERE id=?1", [id])
            .map_err(database_error)?;
    }
    let existing_count = transaction
        .query_row("SELECT COUNT(*) FROM virtual_shelves", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(database_error)?;
    if existing_count + document.shelves.len() as i64 > 64 {
        return Err(request_error(
            ErrorCode::ResourceLimit,
            "Import would exceed the 64 shelf limit.",
        ));
    }
    let mut next_shelf_order = transaction
        .query_row(
            "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM virtual_shelves",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(database_error)?;
    let now = unix_millis();
    let mut shelf_ids = HashMap::new();
    for shelf in &document.shelves {
        transaction
            .execute(
                "INSERT INTO virtual_shelves(name, icon, sort_order, created_at_ms, updated_at_ms)
                 VALUES(?1, ?2, ?3, ?4, ?4)",
                params![shelf.name, shelf.icon, next_shelf_order, now],
            )
            .map_err(database_error)?;
        shelf_ids.insert(shelf.key.clone(), transaction.last_insert_rowid());
        next_shelf_order += 1;
    }
    let mut node_ids = HashMap::new();
    let mut next_orders = HashMap::<(String, Option<String>), i64>::new();
    for node in &document.nodes {
        let shelf_id = *shelf_ids
            .get(&node.shelf)
            .ok_or_else(|| invalid("Imported shelf node references a missing shelf."))?;
        let parent_id = node
            .parent
            .as_ref()
            .map(|key| {
                node_ids
                    .get(key)
                    .copied()
                    .ok_or_else(|| invalid("Imported shelf node parent is missing."))
            })
            .transpose()?;
        let order_key = (node.shelf.clone(), node.parent.clone());
        let sort_order = *next_orders.entry(order_key).or_default();
        transaction
            .execute(
                "INSERT INTO virtual_shelf_nodes(
                    shelf_id, parent_id, node_type, name, target_path, target_kind,
                    icon, sort_order, created_at_ms, updated_at_ms
                 ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                params![
                    shelf_id,
                    parent_id,
                    node.node_type,
                    node.name,
                    node.target_path,
                    node.target_kind,
                    node.icon,
                    sort_order,
                    now
                ],
            )
            .map_err(database_error)?;
        node_ids.insert(node.key.clone(), transaction.last_insert_rowid());
        *next_orders
            .get_mut(&(node.shelf.clone(), node.parent.clone()))
            .unwrap() += 1;
    }
    transaction.commit().map_err(database_error)
}

#[tauri::command]
pub fn execute_shelves_import(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    bytes: Vec<u8>,
    replace_existing: bool,
    preview_key: String,
    confirmed: bool,
) -> Result<Response<ShelfSnapshotRecord>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !confirmed || preview_key != self::preview_key(&bytes, replace_existing) {
        return Ok(error_response(
            &context,
            invalid("Shelf import preview is stale or unconfirmed."),
        ));
    }
    let document = match parse_shelf_document(&bytes) {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    with_snapshot(&state, &context, |store| {
        apply_import(store, &document, replace_existing)
    })
}

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use crate::state::{ShelfNodeRecord, ShelfRecord};

    use super::*;

    fn document(lines: &[&str]) -> Vec<u8> {
        let mut value =
            b"\xef\xbb\xbf{\"type\":\"comic-explorer-shelves\",\"version\":1}\r\n".to_vec();
        for line in lines {
            value.extend_from_slice(line.as_bytes());
            value.extend_from_slice(b"\r\n");
        }
        value
    }

    #[test]
    fn req_ley_p4_001_json_lines_accepts_parent_first_versioned_hierarchy() {
        let bytes = document(&[
            r#"{"type":"shelf","key":"s1","name":"読む本","icon":"books"}"#,
            r#"{"type":"node","key":"n1","shelf":"s1","parent":null,"nodeType":"folder","name":"SF","targetPath":null,"targetKind":null,"icon":"folder"}"#,
            r#"{"type":"node","key":"n2","shelf":"s1","parent":"n1","nodeType":"item","name":"one.cbz","targetPath":"C:\\Comics\\one.cbz","targetKind":"archive","icon":"archive"}"#,
        ]);
        let parsed = parse_shelf_document(&bytes).unwrap();
        assert_eq!(parsed.shelves.len(), 1);
        assert_eq!(parsed.nodes.len(), 2);
        assert_eq!(parsed.nodes[1].parent.as_deref(), Some("n1"));
        assert_eq!(preview_key(&bytes, false), preview_key(&bytes, false));
        assert_ne!(preview_key(&bytes, false), preview_key(&bytes, true));
    }

    #[test]
    fn req_ley_p4_001_json_lines_rejects_child_first_relative_paths_and_unknown_fields() {
        for lines in [
            vec![
                r#"{"type":"shelf","key":"s1","name":"one","icon":"books"}"#,
                r#"{"type":"node","key":"n2","shelf":"s1","parent":"n1","nodeType":"folder","name":"child","targetPath":null,"targetKind":null,"icon":"folder"}"#,
            ],
            vec![
                r#"{"type":"shelf","key":"s1","name":"one","icon":"books"}"#,
                r#"{"type":"node","key":"n1","shelf":"s1","parent":null,"nodeType":"item","name":"book","targetPath":"relative.cbz","targetKind":"archive","icon":"archive"}"#,
            ],
            vec![r#"{"type":"shelf","key":"s1","name":"one","icon":"books","code":"no"}"#],
        ] {
            assert_eq!(
                parse_shelf_document(&document(&lines)).unwrap_err().code,
                ErrorCode::InvalidRequest
            );
        }
    }

    #[test]
    fn req_ley_p4_001_validates_presets_and_binds_recursive_delete_preview() {
        assert_eq!(validate_name("  Shelf  ").unwrap(), "Shelf");
        assert!(validate_name("bad/name").is_err());
        assert!(validate_name("\u{0000}").is_err());
        assert_eq!(validate_icon("archive").unwrap(), "archive");
        assert!(validate_icon("C:\\icons\\arbitrary.svg").is_err());

        let snapshot = ShelfSnapshotRecord {
            shelves: vec![ShelfRecord {
                id: 1,
                name: "Shelf".to_string(),
                icon: "books".to_string(),
                sort_order: 0,
            }],
            nodes: vec![
                ShelfNodeRecord {
                    id: 10,
                    shelf_id: 1,
                    parent_id: None,
                    node_type: "folder".to_string(),
                    name: "Parent".to_string(),
                    target_path: None,
                    target_kind: None,
                    icon: "folder".to_string(),
                    sort_order: 0,
                },
                ShelfNodeRecord {
                    id: 11,
                    shelf_id: 1,
                    parent_id: Some(10),
                    node_type: "item".to_string(),
                    name: "Child".to_string(),
                    target_path: Some("C:\\Comics\\child.cbz".to_string()),
                    target_kind: Some("archive".to_string()),
                    icon: "archive".to_string(),
                    sort_order: 0,
                },
            ],
            startup_shelf_id: None,
        };
        let ids = shelf_node_delete_ids(&snapshot, 10).unwrap();
        assert_eq!(ids, vec![10, 11]);
        let key = shelf_node_delete_key(&ids);
        assert_ne!(key, shelf_node_delete_key(&[10]));
        assert_eq!(key, shelf_node_delete_key(&ids));
        assert!(shelf_node_delete_ids(&snapshot, 999).is_err());
    }

    #[test]
    fn req_ley_p4_001_fifty_thousand_node_import_preview_is_bounded() {
        let mut bytes =
            b"\xef\xbb\xbf{\"type\":\"comic-explorer-shelves\",\"version\":1}\r\n".to_vec();
        for shelf in 0..5 {
            bytes.extend_from_slice(
                format!(
                    "{{\"type\":\"shelf\",\"key\":\"s{shelf}\",\"name\":\"shelf {shelf}\",\"icon\":\"books\"}}\r\n"
                )
                .as_bytes(),
            );
        }
        for shelf in 0..5 {
            for index in 0..10_000 {
                bytes.extend_from_slice(
                    format!(
                        "{{\"type\":\"node\",\"key\":\"n{shelf}-{index}\",\"shelf\":\"s{shelf}\",\"parent\":null,\"nodeType\":\"item\",\"name\":\"book {index}\",\"targetPath\":\"C:\\\\Books\\\\{shelf}\\\\{index}.cbz\",\"targetKind\":\"archive\",\"icon\":\"archive\"}}\r\n"
                    )
                    .as_bytes(),
                );
            }
        }
        assert!(bytes.len() < MAX_IMPORT_BYTES);
        let started = Instant::now();
        let parsed = parse_shelf_document(&bytes).unwrap();
        let elapsed = started.elapsed();
        assert_eq!(parsed.nodes.len(), 50_000);
        assert!(
            elapsed.as_secs_f32() < 3.0,
            "50,000 node import preview took {elapsed:?}"
        );
        eprintln!("REQ-LEY-P4-001 50,000-node import preview: {elapsed:?}");
    }
}
