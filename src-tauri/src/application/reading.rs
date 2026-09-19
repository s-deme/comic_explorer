//! Persisted reading position, page bookmarks, and recent reading history.
use super::settings::{PageBookmarkEntry, ReadingHistoryEntry};
use super::{AppState, error_response, request_error, unix_millis, validate_request};
use crate::api::{RequestContext, Response};
use crate::domain::{AppError, ErrorCode, RelativePath};
use crate::state::{BookmarkRecord, StateStore};

fn bookmark_path(value: String, label: &str) -> Result<RelativePath, AppError> {
    match RelativePath::parse(value) {
        Ok(path) if !path.as_str().is_empty() => Ok(path),
        _ => Err(request_error(
            ErrorCode::InvalidPath,
            &format!("Bookmark {label} must be a non-empty relative path."),
        )),
    }
}

fn bookmark_entries(records: Vec<BookmarkRecord>) -> Result<Vec<PageBookmarkEntry>, AppError> {
    records
        .into_iter()
        .map(|record| {
            Ok(PageBookmarkEntry {
                item_key: bookmark_path(record.item_key, "item key")?,
                page_key: bookmark_path(record.page_key, "page key")?,
                page_index: record.natural_ordinal,
                created_at: record.created_at_ms,
            })
        })
        .collect()
}

fn load_bookmarks(
    store: &StateStore,
    root_namespace: &str,
    item_key: &RelativePath,
) -> Result<Vec<PageBookmarkEntry>, AppError> {
    bookmark_entries(store.list_bookmarks(root_namespace, item_key.as_str())?)
}

fn bookmark_root_namespace(state: &AppState) -> Result<String, AppError> {
    state
        .library_root
        .lock()
        .map_err(|_| request_error(ErrorCode::Internal, "Library root state is unavailable."))?
        .as_ref()
        .map(|root| root.to_string_lossy().into_owned())
        .ok_or_else(|| request_error(ErrorCode::InvalidRequest, "A library root is required."))
}

#[tauri::command]
pub fn list_page_bookmarks(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_key: String,
) -> Result<Response<Vec<PageBookmarkEntry>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let item_key = match bookmark_path(item_key, "item key") {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let root_namespace = match bookmark_root_namespace(&state) {
        Ok(root) => root,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::Internal,
                "Local bookmark storage is unavailable.",
            ),
        ));
    };
    let data = match load_bookmarks(store, &root_namespace, &item_key) {
        Ok(data) => data,
        Err(error) => return Ok(error_response(&context, error)),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[tauri::command]
pub fn save_page_bookmark(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_key: String,
    page_key: String,
    page_index: u64,
    created_at: u64,
) -> Result<Response<Vec<PageBookmarkEntry>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let item_key = match bookmark_path(item_key, "item key") {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let page_key = match bookmark_path(page_key, "page key") {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    if page_index > i64::MAX as u64 || created_at > i64::MAX as u64 {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::InvalidRequest,
                "Bookmark ordinal or timestamp is invalid.",
            ),
        ));
    }
    let root_namespace = match bookmark_root_namespace(&state) {
        Ok(root) => root,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::Internal,
                "Local bookmark storage is unavailable.",
            ),
        ));
    };
    if let Err(error) = store.save_bookmark(&BookmarkRecord {
        root_namespace: root_namespace.clone(),
        item_key: item_key.as_str().into(),
        page_key: page_key.as_str().into(),
        natural_ordinal: page_index,
        created_at_ms: created_at,
    }) {
        return Ok(error_response(&context, error));
    }
    let data = match load_bookmarks(store, &root_namespace, &item_key) {
        Ok(data) => data,
        Err(error) => return Ok(error_response(&context, error)),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[tauri::command]
pub fn delete_page_bookmark(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_key: String,
    page_key: String,
) -> Result<Response<Vec<PageBookmarkEntry>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let item_key = match bookmark_path(item_key, "item key") {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let page_key = match bookmark_path(page_key, "page key") {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let root_namespace = match bookmark_root_namespace(&state) {
        Ok(root) => root,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::Internal,
                "Local bookmark storage is unavailable.",
            ),
        ));
    };
    if let Err(error) = store.delete_bookmark(&root_namespace, item_key.as_str(), page_key.as_str())
    {
        return Ok(error_response(&context, error));
    }
    let data = match load_bookmarks(store, &root_namespace, &item_key) {
        Ok(data) => data,
        Err(error) => return Ok(error_response(&context, error)),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[tauri::command]
pub fn list_reading_history(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Vec<ReadingHistoryEntry>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    let entries = match store.list_reading_history() {
        Ok(entries) => entries,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let data = entries
        .into_iter()
        .map(|(item_identity, last_viewed_at_ms)| {
            RelativePath::parse(item_identity)
                .map(|item_identity| ReadingHistoryEntry {
                    item_identity,
                    last_viewed_at_ms,
                })
                .map_err(|message| AppError {
                    code: ErrorCode::Internal,
                    message: message.into(),
                    target: None,
                    retryable: false,
                })
        })
        .collect::<Result<Vec<_>, _>>();
    let data = match data {
        Ok(data) => data,
        Err(error) => return Ok(error_response(&context, error)),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[tauri::command]
pub fn clear_reading_history(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<()>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    if let Err(error) = store.clear_reading_history() {
        return Ok(error_response(&context, error));
    }
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: (),
    })
}

#[tauri::command]
pub fn save_reading_position(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_key: String,
    page_key: String,
    natural_ordinal: usize,
) -> Result<Response<()>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let page_key = RelativePath::parse(page_key).map_err(str::to_string)?;
    if let Some(store) = state.store.lock().map_err(|_| "state poisoned")?.as_ref() {
        store
            .save_reading_position(
                &item_key,
                &crate::state::ReadingPosition {
                    page_key,
                    natural_ordinal,
                },
                unix_millis(),
            )
            .map_err(|error| error.message)?;
    }
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: (),
    })
}
