mod coordinator;
mod scheduler;

pub use coordinator::NavigationCoordinator;
pub use scheduler::{BoundedPriorityQueue, Priority, QueueItem};

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::api::{Generation, RequestContext, Response};
use crate::catalog::{CatalogEntry, enumerate_folder};
use crate::domain::{AppError, ErrorCode, RelativePath, RequestId};
use crate::state::{AppPaths, StateStore};

pub struct AppState {
    library_root: Mutex<Option<PathBuf>>,
    navigation: Mutex<NavigationCoordinator>,
    store: Mutex<Option<StateStore>>,
}

impl Default for AppState {
    fn default() -> Self {
        let (store, library_root) = AppPaths::discover()
            .and_then(|paths| StateStore::open(&paths).map(|(store, _)| store))
            .and_then(|store| {
                let library_root = store.load_settings()?.library_root;
                Ok((Some(store), library_root))
            })
            .unwrap_or((None, None));
        Self {
            library_root: Mutex::new(library_root),
            navigation: Mutex::new(NavigationCoordinator::default()),
            store: Mutex::new(store),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRoot {
    pub absolute_path: String,
}

#[tauri::command]
pub fn get_library_root(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Option<LibraryRoot>>, String> {
    if let Err(error) = context.validate() {
        return Ok(error_response(&context, error));
    }
    let root = state
        .library_root
        .lock()
        .map_err(|_| "state poisoned")?
        .as_ref()
        .map(|path| LibraryRoot {
            absolute_path: path.to_string_lossy().into_owned(),
        });
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: root,
    })
}

#[tauri::command]
pub async fn set_library_root(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    absolute_path: String,
) -> Result<Response<LibraryRoot>, String> {
    if let Err(error) = context.validate() {
        return Ok(error_response(&context, error));
    }
    let requested = PathBuf::from(absolute_path);
    let canonical =
        match tauri::async_runtime::spawn_blocking(move || requested.canonicalize()).await {
            Ok(Ok(path)) if path.is_dir() => path,
            Ok(Ok(_)) => {
                return Ok(error_response(
                    &context,
                    request_error(ErrorCode::InvalidPath, "Library root is not a directory."),
                ));
            }
            Ok(Err(error)) => {
                return Ok(error_response(
                    &context,
                    request_error(
                        ErrorCode::InvalidPath,
                        &format!("Cannot resolve library root: {error}"),
                    ),
                ));
            }
            Err(error) => return Err(format!("library root worker failed: {error}")),
        };
    *state.library_root.lock().map_err(|_| "state poisoned")? = Some(canonical.clone());
    if let Some(store) = state.store.lock().map_err(|_| "state poisoned")?.as_mut() {
        let mut settings = store.load_settings().map_err(|error| error.message)?;
        settings.library_root = Some(canonical.clone());
        store
            .save_settings(&settings)
            .map_err(|error| error.message)?;
    }
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: LibraryRoot {
            absolute_path: canonical.to_string_lossy().into_owned(),
        },
    })
}

#[tauri::command]
pub async fn list_folder(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    relative_path: String,
) -> Result<Response<Vec<CatalogEntry>>, String> {
    if let Err(error) = context.validate() {
        return Ok(error_response(&context, error));
    }
    let relative_path = match RelativePath::parse(relative_path) {
        Ok(path) => path,
        Err(message) => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidPath, message),
            ));
        }
    };
    let root = match state
        .library_root
        .lock()
        .map_err(|_| "state poisoned")?
        .clone()
    {
        Some(root) => root,
        None => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidRequest, "Library root is not configured."),
            ));
        }
    };
    let cancellation = state
        .navigation
        .lock()
        .map_err(|_| "state poisoned")?
        .begin(context.generation);
    let requested_directory = root.join(relative_path.as_str());
    let worker_root = root.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        if cancellation.is_cancelled() {
            return Err(AppError::cancelled());
        }
        let result = enumerate_folder(&worker_root, &requested_directory);
        if cancellation.is_cancelled() {
            Err(AppError::cancelled())
        } else {
            result
        }
    })
    .await
    .map_err(|error| format!("catalog worker failed: {error}"))?;

    let is_current = state
        .navigation
        .lock()
        .map_err(|_| "state poisoned")?
        .is_current(context.generation);
    if !is_current {
        return Ok(Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        });
    }
    Ok(match result {
        Ok(data) => Response::Ok {
            request_id: context.request_id,
            generation: context.generation,
            data,
        },
        Err(error) if error.code == ErrorCode::Cancelled => Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        },
        Err(error) => Response::Error {
            request_id: context.request_id,
            generation: context.generation,
            error,
        },
    })
}

#[tauri::command]
pub fn cancel_navigation(
    state: tauri::State<'_, AppState>,
    request_id: RequestId,
    generation: Generation,
) -> Result<Response<()>, String> {
    state
        .navigation
        .lock()
        .map_err(|_| "state poisoned")?
        .cancel(generation);
    Ok(Response::Cancelled {
        request_id,
        generation,
    })
}

fn error_response<T>(context: &RequestContext, error: AppError) -> Response<T> {
    Response::Error {
        request_id: context.request_id.clone(),
        generation: context.generation,
        error,
    }
}

fn request_error(code: ErrorCode, message: &str) -> AppError {
    AppError {
        code,
        message: message.into(),
        target: None,
        retryable: false,
    }
}
