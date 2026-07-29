mod coordinator;
mod library_root;
mod scheduler;

pub use coordinator::NavigationCoordinator;
pub use scheduler::{BoundedPriorityQueue, Priority, QueueItem};

use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::api::{Generation, MAX_IMAGE_BYTES, RequestContext, Response};
use crate::catalog::{
    CatalogEntry, enumerate_archive_pages, enumerate_folder, enumerate_folder_pages,
};
use crate::domain::{
    AppError, ErrorCode, FileKind, PageId, RelativePath, RequestId, classify_file_name, page_id_for,
};
use crate::media::{MediaGrant, MediaTokenRegistry, PageSource};
use crate::state::{AppPaths, StateStore, ThumbnailPipeline};
use library_root::validate_library_root;

pub struct AppState {
    library_root: Mutex<Option<PathBuf>>,
    navigation: Mutex<NavigationCoordinator>,
    store: Mutex<Option<StateStore>>,
    thumbnails: Mutex<Option<ThumbnailPipeline>>,
    pub(crate) media: Mutex<MediaTokenRegistry>,
    shutting_down: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        let (store, library_root, thumbnails) = AppPaths::discover()
            .and_then(|paths| {
                StateStore::open(&paths).and_then(|(store, _)| {
                    ThumbnailPipeline::new(&paths).map(|pipeline| (store, pipeline))
                })
            })
            .and_then(|(store, pipeline)| {
                let library_root = store.load_settings()?.library_root;
                Ok((Some(store), library_root, Some(pipeline)))
            })
            .unwrap_or((None, None, None));
        Self {
            library_root: Mutex::new(library_root),
            navigation: Mutex::new(NavigationCoordinator::default()),
            store: Mutex::new(store),
            thumbnails: Mutex::new(thumbnails),
            media: Mutex::new(MediaTokenRegistry::new(Duration::from_secs(15 * 60))),
            shutting_down: AtomicBool::new(false),
        }
    }
}

impl AppState {
    pub fn shutdown(&self) {
        if self.shutting_down.swap(true, Ordering::AcqRel) {
            return;
        }
        if let Ok(mut navigation) = self.navigation.lock() {
            navigation.shutdown();
        }
        if let Ok(mut media) = self.media.lock() {
            media.revoke_all();
        }
        if let Ok(mut thumbnails) = self.thumbnails.lock() {
            thumbnails.take();
        }
        // Dropping the connection closes SQLite and its WAL/SHM handles.
        if let Ok(mut store) = self.store.lock() {
            store.take();
        }
    }

    fn is_shutting_down(&self) -> bool {
        self.shutting_down.load(Ordering::Acquire)
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
    pub view_mode: String,
    pub reading_direction: String,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailResponse {
    pub item_relative_path: RelativePath,
    pub content_hash: String,
    pub media_uri: String,
    pub cache_hit: bool,
}

#[tauri::command]
pub fn get_library_root(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Option<LibraryRoot>>, String> {
    if let Err(error) = validate_request(&state, &context) {
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
    if let Err(error) = validate_request(&state, &context) {
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
            view_mode: settings.view_mode,
            reading_direction: settings.reading_direction,
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
    if let Err(error) = validate_request(&state, &context) {
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
            view_mode: state
                .store
                .lock()
                .map_err(|_| "state poisoned")?
                .as_ref()
                .and_then(|store| store.load_settings().ok())
                .unwrap_or_default()
                .view_mode,
            reading_direction: state
                .store
                .lock()
                .map_err(|_| "state poisoned")?
                .as_ref()
                .and_then(|store| store.load_settings().ok())
                .unwrap_or_default()
                .reading_direction,
        },
    })
}

#[tauri::command]
pub fn set_viewer_settings(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    view_mode: String,
    reading_direction: String,
) -> Result<Response<CatalogSettings>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !matches!(view_mode.as_str(), "single" | "spread")
        || !matches!(reading_direction.as_str(), "rightToLeft" | "leftToRight")
    {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::InvalidRequest, "Viewer settings are invalid."),
        ));
    }
    let mut settings = state
        .store
        .lock()
        .map_err(|_| "state poisoned")?
        .as_ref()
        .map(|store| store.load_settings())
        .transpose()
        .map_err(|error| error.message)?
        .unwrap_or_default();
    settings.view_mode = view_mode;
    settings.reading_direction = reading_direction;
    if let Some(store) = state.store.lock().map_err(|_| "state poisoned")?.as_mut() {
        store
            .save_settings(&settings)
            .map_err(|error| error.message)?;
    }
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: CatalogSettings {
            sort_field: settings.sort_field,
            sort_descending: settings.sort_descending,
            view_mode: settings.view_mode,
            reading_direction: settings.reading_direction,
        },
    })
}

#[tauri::command]
pub async fn set_library_root(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    absolute_path: String,
) -> Result<Response<LibraryRoot>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let requested = PathBuf::from(absolute_path);
    let canonical =
        match tauri::async_runtime::spawn_blocking(move || validate_library_root(&requested)).await
        {
            Ok(Ok(path)) => path,
            Ok(Err(error)) => return Ok(error_response(&context, error)),
            Err(error) => return Err(format!("library root worker failed: {error}")),
        };
    save_library_root(&state, &context, canonical)
}

#[tauri::command]
pub async fn pick_library_root(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Option<LibraryRoot>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    #[cfg(target_os = "windows")]
    let picked = tauri::async_runtime::spawn_blocking(library_root::pick_folder)
        .await
        .map_err(|error| format!("folder picker worker failed: {error}"))?;
    #[cfg(not(target_os = "windows"))]
    let picked: Result<Option<PathBuf>, AppError> = Err(request_error(
        ErrorCode::UnsupportedFormat,
        "フォルダ選択画面はWindows版で利用できます。",
    ));

    let picked = match picked {
        Ok(Some(path)) => path,
        Ok(None) => {
            return Ok(Response::Ok {
                request_id: context.request_id,
                generation: context.generation,
                data: None,
            });
        }
        Err(error) => return Ok(error_response(&context, error)),
    };
    let canonical =
        match tauri::async_runtime::spawn_blocking(move || validate_library_root(&picked)).await {
            Ok(Ok(path)) => path,
            Ok(Err(error)) => return Ok(error_response(&context, error)),
            Err(error) => return Err(format!("library root worker failed: {error}")),
        };
    save_library_root(&state, &context, canonical).map(|response| match response {
        Response::Ok {
            request_id,
            generation,
            data,
        } => Response::Ok {
            request_id,
            generation,
            data: Some(data),
        },
        Response::Error {
            request_id,
            generation,
            error,
        } => Response::Error {
            request_id,
            generation,
            error,
        },
        Response::Cancelled {
            request_id,
            generation,
        } => Response::Cancelled {
            request_id,
            generation,
        },
    })
}

fn save_library_root(
    state: &tauri::State<'_, AppState>,
    context: &RequestContext,
    canonical: PathBuf,
) -> Result<Response<LibraryRoot>, String> {
    *state.library_root.lock().map_err(|_| "state poisoned")? = Some(canonical.clone());
    if let Some(store) = state.store.lock().map_err(|_| "state poisoned")?.as_mut() {
        let mut settings = store.load_settings().map_err(|error| error.message)?;
        settings.library_root = Some(canonical.clone());
        store
            .save_settings(&settings)
            .map_err(|error| error.message)?;
    }
    Ok(Response::Ok {
        request_id: context.request_id.clone(),
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
    if let Err(error) = validate_request(&state, &context) {
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
    if let Some(pipeline) = state
        .thumbnails
        .lock()
        .map_err(|_| "state poisoned")?
        .as_mut()
    {
        pipeline.replace_pins(&[]).map_err(|error| error.message)?;
    }
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
pub fn get_thumbnail(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_path: String,
    retry: bool,
) -> Result<Response<ThumbnailResponse>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let item = match RelativePath::parse(item_relative_path) {
        Ok(item) if !item.as_str().is_empty() => item,
        _ => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidPath, "Thumbnail item path is invalid."),
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
    let mut pipelines = state.thumbnails.lock().map_err(|_| "state poisoned")?;
    let Some(pipeline) = pipelines.as_mut() else {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::UnsupportedFormat,
                "Thumbnail generation is unavailable on this platform.",
            ),
        ));
    };
    if retry {
        pipeline.retry(&item);
    }
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Thumbnail cache is unavailable."),
        ));
    };
    #[cfg(target_os = "windows")]
    let result = pipeline.resolve(store, &root, &item, unix_millis());
    #[cfg(not(target_os = "windows"))]
    let result: Result<crate::state::ThumbnailResult, AppError> = Err(request_error(
        ErrorCode::UnsupportedFormat,
        "WIC thumbnail generation requires Windows.",
    ));
    let thumbnail = match result {
        Ok(thumbnail) => thumbnail,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let page_id =
        PageId::parse(format!("thumbnail-{}", thumbnail.content_hash)).map_err(str::to_string)?;
    let token = state
        .media
        .lock()
        .map_err(|_| "state poisoned")?
        .issue(MediaGrant {
            page_id,
            mime_type: "image/jpeg",
            max_bytes: MAX_IMAGE_BYTES,
            source: PageSource::File(thumbnail.path),
        });
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: ThumbnailResponse {
            item_relative_path: item,
            content_hash: thumbnail.content_hash,
            media_uri: format!("comic://localhost/{token}"),
            cache_hit: thumbnail.cache_hit,
        },
    })
}

#[tauri::command]
pub async fn list_tree_children(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    relative_path: String,
) -> Result<Response<Vec<CatalogEntry>>, String> {
    if let Err(error) = validate_request(&state, &context) {
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
    let requested_directory = root.join(relative_path.as_str());
    let result = tauri::async_runtime::spawn_blocking(move || {
        enumerate_folder(&root, &requested_directory).map(|entries| {
            entries
                .into_iter()
                .filter(|entry| {
                    matches!(
                        entry.kind,
                        crate::domain::ItemKind::Folder | crate::domain::ItemKind::ComicFolder
                    )
                })
                .collect()
        })
    })
    .await
    .map_err(|error| format!("tree worker failed: {error}"))?;
    Ok(match result {
        Ok(data) => Response::Ok {
            request_id: context.request_id,
            generation: context.generation,
            data,
        },
        Err(error) => error_response(&context, error),
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
    if let Err(error) = validate_request(&state, &context) {
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
        .map(|relative_path| {
            let id = page_id_for(item_relative.as_str(), relative_path.as_str());
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

fn error_response<T>(context: &RequestContext, error: AppError) -> Response<T> {
    Response::Error {
        request_id: context.request_id.clone(),
        generation: context.generation,
        error,
    }
}

fn validate_request(state: &AppState, context: &RequestContext) -> Result<(), AppError> {
    context.validate()?;
    if state.is_shutting_down() {
        return Err(AppError::cancelled());
    }
    Ok(())
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

#[cfg(test)]
mod shutdown_tests {
    use super::*;

    #[test]
    fn shutdown_is_idempotent_cancels_work_revokes_media_and_closes_store() {
        let state = AppState {
            library_root: Mutex::new(None),
            navigation: Mutex::new(NavigationCoordinator::default()),
            store: Mutex::new(None),
            thumbnails: Mutex::new(None),
            media: Mutex::new(MediaTokenRegistry::new(Duration::from_secs(60))),
            shutting_down: AtomicBool::new(false),
        };
        let cancellation = state.navigation.lock().unwrap().begin(Generation(7));
        let token = state.media.lock().unwrap().issue(MediaGrant {
            page_id: PageId::parse("shutdown-page").unwrap(),
            mime_type: "image/png",
            max_bytes: 10,
            source: PageSource::File(PathBuf::from("page.png")),
        });

        state.shutdown();
        state.shutdown();

        assert!(cancellation.is_cancelled());
        assert!(state.is_shutting_down());
        assert!(state.media.lock().unwrap().resolve(&token).is_err());
        assert!(state.store.lock().unwrap().is_none());
        assert!(
            validate_request(
                &state,
                &RequestContext {
                    api_version: crate::api::API_VERSION,
                    request_id: RequestId::parse("after-shutdown").unwrap(),
                    generation: Generation(8),
                }
            )
            .is_err()
        );
    }
}
