mod coordinator;
mod scheduler;

pub use coordinator::NavigationCoordinator;
pub use scheduler::{BoundedPriorityQueue, Priority, QueueItem};

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::api::{Generation, MAX_IMAGE_BYTES, RequestContext, Response};
use crate::catalog::{
    CatalogEntry, enumerate_archive_pages, enumerate_folder, enumerate_folder_pages,
};
use crate::domain::{
    AppError, ErrorCode, FileKind, PageId, RelativePath, RequestId, classify_file_name,
};
use crate::media::{MediaGrant, MediaTokenRegistry, PageSource};
use crate::state::{AppPaths, StateStore};

pub struct AppState {
    library_root: Mutex<Option<PathBuf>>,
    navigation: Mutex<NavigationCoordinator>,
    store: Mutex<Option<StateStore>>,
    pub(crate) media: Mutex<MediaTokenRegistry>,
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
            media: Mutex::new(MediaTokenRegistry::new(Duration::from_secs(15 * 60))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRoot {
    pub absolute_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSettings {
    pub sort_field: String,
    pub sort_descending: bool,
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
pub fn get_catalog_settings(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<CatalogSettings>, String> {
    if let Err(error) = context.validate() {
        return Ok(error_response(&context, error));
    }
    let settings = state
        .store
        .lock()
        .map_err(|_| "state poisoned")?
        .as_ref()
        .map(|store| store.load_settings())
        .transpose()
        .map_err(|error| error.message)?
        .unwrap_or_default();
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: CatalogSettings {
            sort_field: settings.sort_field,
            sort_descending: settings.sort_descending,
        },
    })
}

#[tauri::command]
pub fn set_catalog_sort(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    sort_field: String,
    sort_descending: bool,
) -> Result<Response<CatalogSettings>, String> {
    if let Err(error) = context.validate() {
        return Ok(error_response(&context, error));
    }
    if !matches!(sort_field.as_str(), "name" | "modified" | "size" | "kind") {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::InvalidRequest, "Sort field is invalid."),
        ));
    }
    if let Some(store) = state.store.lock().map_err(|_| "state poisoned")?.as_mut() {
        let mut settings = store.load_settings().map_err(|error| error.message)?;
        settings.sort_field.clone_from(&sort_field);
        settings.sort_descending = sort_descending;
        store
            .save_settings(&settings)
            .map_err(|error| error.message)?;
    }
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: CatalogSettings {
            sort_field,
            sort_descending,
        },
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

#[tauri::command]
pub async fn open_comic(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_path: String,
) -> Result<Response<ViewerSession>, String> {
    if let Err(error) = context.validate() {
        return Ok(error_response(&context, error));
    }
    let item_relative = match RelativePath::parse(&item_relative_path) {
        Ok(path) if !path.as_str().is_empty() => path,
        _ => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidPath, "Comic item path is invalid."),
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
    let item_path = root.join(item_relative.as_str());
    let worker_root = root.clone();
    let worker_item = item_path.clone();
    let is_archive = classify_file_name(item_relative.as_str()) == FileKind::Archive;
    let page_paths = tauri::async_runtime::spawn_blocking(move || {
        if is_archive {
            enumerate_archive_pages(&worker_item)
        } else {
            enumerate_folder_pages(&worker_root, &worker_item)
        }
    })
    .await
    .map_err(|error| format!("page enumeration worker failed: {error}"))?;
    let page_paths = match page_paths {
        Ok(pages) if !pages.is_empty() => pages,
        Ok(_) => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::NotFound, "No supported pages were found."),
            ));
        }
        Err(error) => return Ok(error_response(&context, error)),
    };

    let mut registry = state.media.lock().map_err(|_| "state poisoned")?;
    registry.revoke_all();
    let pages = page_paths
        .into_iter()
        .enumerate()
        .map(|(index, relative_path)| {
            let id = PageId::parse(format!("page-{index}")).expect("generated page id");
            let mime_type = if relative_path
                .as_str()
                .to_ascii_lowercase()
                .ends_with(".png")
            {
                "image/png"
            } else {
                "image/jpeg"
            };
            let source = if is_archive {
                PageSource::ArchiveEntry {
                    archive: item_path.clone(),
                    entry: relative_path.as_str().into(),
                }
            } else {
                PageSource::File(root.join(relative_path.as_str()))
            };
            let token = registry.issue(MediaGrant {
                page_id: id.clone(),
                mime_type,
                max_bytes: MAX_IMAGE_BYTES,
                source,
            });
            ViewerPage {
                id,
                relative_path,
                media_uri: format!("comic://localhost/{token}"),
            }
        })
        .collect::<Vec<_>>();
    drop(registry);

    let start_index = state
        .store
        .lock()
        .map_err(|_| "state poisoned")?
        .as_ref()
        .and_then(|store| {
            store
                .reading_position(item_relative.as_str())
                .ok()
                .flatten()
        })
        .and_then(|saved| {
            crate::state::resolve_reading_position(
                Some(&saved),
                &pages
                    .iter()
                    .map(|page| page.relative_path.clone())
                    .collect::<Vec<_>>(),
            )
        })
        .unwrap_or(0);
    let display_name = item_relative
        .as_str()
        .rsplit('/')
        .next()
        .unwrap_or(item_relative.as_str())
        .into();
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: ViewerSession {
            item_key: item_relative.to_string(),
            display_name,
            pages,
            start_index,
        },
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
    if let Err(error) = context.validate() {
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

fn unix_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(i64::MAX)
}
