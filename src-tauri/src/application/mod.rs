mod coordinator;
mod library_root;
mod scheduler;

pub use coordinator::NavigationCoordinator;
pub use scheduler::{BoundedPriorityQueue, Priority, PriorityTaskPool, QueueItem};

use std::io::Cursor;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use crate::api::{Generation, MAX_IMAGE_BYTES, RequestContext, Response};
use crate::catalog::{
    CatalogEntry, enumerate_archive_pages, enumerate_folder, enumerate_folder_pages,
};
use crate::domain::{
    AppError, ErrorCode, FileKind, ItemKind, PageId, RelativePath, RequestId, classify_file_name,
    page_id_for,
};
use crate::media::{MediaGrant, MediaTokenRegistry, PageSource, media_uri, read_grant_bytes};
use crate::state::{AppPaths, StateStore, ThumbnailPipeline};
use library_root::validate_library_root;

pub struct AppState {
    library_root: Mutex<Option<PathBuf>>,
    navigation: Mutex<NavigationCoordinator>,
    viewer: Arc<Mutex<NavigationCoordinator>>,
    store: Arc<Mutex<Option<StateStore>>>,
    thumbnails: Arc<Mutex<Option<ThumbnailPipeline>>>,
    thumbnail_workers: PriorityTaskPool,
    page_workers: PriorityTaskPool,
    pub(crate) media: Mutex<MediaTokenRegistry>,
    recovery_notice: Mutex<bool>,
    shutting_down: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        let (store, library_root, thumbnails, recovered) = AppPaths::discover()
            .and_then(|paths| {
                StateStore::open(&paths).and_then(|(store, notice)| {
                    ThumbnailPipeline::new(&paths)
                        .map(|pipeline| (store, pipeline, notice.is_some()))
                })
            })
            .and_then(|(store, pipeline, recovered)| {
                let library_root = store.load_settings()?.library_root;
                Ok((Some(store), library_root, Some(pipeline), recovered))
            })
            .unwrap_or((None, None, None, false));
        Self {
            library_root: Mutex::new(library_root),
            navigation: Mutex::new(NavigationCoordinator::default()),
            viewer: Arc::new(Mutex::new(NavigationCoordinator::default())),
            store: Arc::new(Mutex::new(store)),
            thumbnails: Arc::new(Mutex::new(thumbnails)),
            thumbnail_workers: PriorityTaskPool::new(2, 64),
            page_workers: PriorityTaskPool::new(2, 16),
            media: Mutex::new(MediaTokenRegistry::new(Duration::from_secs(15 * 60))),
            recovery_notice: Mutex::new(recovered),
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
        if let Ok(mut viewer) = self.viewer.lock() {
            viewer.shutdown();
        }
        if let Ok(mut media) = self.media.lock() {
            media.revoke_all();
        }
        self.thumbnail_workers.shutdown();
        self.page_workers.shutdown();
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

    fn take_recovery_notice(&self) -> Result<bool, String> {
        Ok(std::mem::take(
            &mut *self
                .recovery_notice
                .lock()
                .map_err(|_| "recovery notice state poisoned")?,
        ))
    }
}

pub fn run_shutdown_process_harness() -> Result<serde_json::Value, String> {
    let paths = AppPaths::discover().map_err(|error| error.message)?;
    let state = AppState::default();
    let navigation = state
        .navigation
        .lock()
        .map_err(|_| "navigation state poisoned")?
        .begin(Generation(91));
    let viewer = state
        .viewer
        .lock()
        .map_err(|_| "viewer state poisoned")?
        .begin(Generation(92));
    let media_token = state
        .media
        .lock()
        .map_err(|_| "media state poisoned")?
        .issue(MediaGrant {
            page_id: PageId::parse("shutdown-harness-page").map_err(str::to_string)?,
            mime_type: "image/png",
            max_bytes: MAX_IMAGE_BYTES,
            source: PageSource::Memory(b"\x89PNG\r\n\x1a\n".to_vec()),
        });
    state
        .store
        .lock()
        .map_err(|_| "store state poisoned")?
        .as_ref()
        .ok_or_else(|| "shutdown harness store is unavailable".to_string())?
        .save_reading_position(
            "shutdown-book",
            &crate::state::ReadingPosition {
                page_key: RelativePath::parse("page-7.png").map_err(str::to_string)?,
                natural_ordinal: 6,
            },
            unix_millis(),
        )
        .map_err(|error| error.message)?;
    state.shutdown();
    if !navigation.is_cancelled() || !viewer.is_cancelled() {
        return Err("shutdown did not cancel active generations".into());
    }
    if state
        .media
        .lock()
        .map_err(|_| "media state poisoned")?
        .resolve(&media_token)
        .is_ok()
    {
        return Err("shutdown did not revoke media tokens".into());
    }
    if state
        .page_workers
        .submit(Priority::Visible, CancellationToken::new(), || {})
        .is_ok()
    {
        return Err("shutdown page queue accepted new work".into());
    }
    let (reopened, _) = StateStore::open(&paths).map_err(|error| error.message)?;
    let saved = reopened
        .reading_position("shutdown-book")
        .map_err(|error| error.message)?
        .ok_or_else(|| "shutdown position was not flushed".to_string())?;
    drop(reopened);
    let moved = paths.root.with_extension("closed");
    std::fs::rename(&paths.root, &moved).map_err(|error| {
        format!(
            "app-data handles remained open ({} -> {}): {error}",
            paths.root.display(),
            moved.display()
        )
    })?;
    std::fs::rename(&moved, &paths.root).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "status": "ok",
        "position": saved.page_key.as_str(),
        "navigationCancelled": true,
        "viewerCancelled": true,
        "mediaRevoked": true,
        "queueRejected": true,
        "handlesClosed": true
    }))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRoot {
    pub absolute_path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSettings {
    pub sort_field: String,
    pub sort_descending: bool,
    pub end_of_volume_policy: String,
    pub catalog_view_mode: String,
    pub view_mode: String,
    pub layout_mode: String,
    pub reading_direction: String,
    pub scale_mode: String,
    pub scale: f64,
    pub loupe_enabled: bool,
}

const MIN_VIEWER_SCALE: f64 = 0.25;
const MAX_VIEWER_SCALE: f64 = 4.0;

fn viewer_scale(settings: &crate::state::Settings) -> f64 {
    settings
        .scale
        .parse::<f64>()
        .ok()
        .filter(|scale| scale.is_finite())
        .filter(|scale| (MIN_VIEWER_SCALE..=MAX_VIEWER_SCALE).contains(scale))
        .unwrap_or(1.0)
}

fn viewer_scale_mode(settings: &crate::state::Settings) -> String {
    if matches!(
        settings.scale_mode.as_str(),
        "fit" | "width" | "height" | "original" | "custom"
    ) {
        settings.scale_mode.clone()
    } else {
        "fit".into()
    }
}

fn end_of_volume_policy(settings: &crate::state::Settings) -> String {
    if matches!(
        settings.end_of_volume_policy.as_str(),
        "auto_next" | "confirm_next" | "return_library" | "stop" | "loop"
    ) {
        settings.end_of_volume_policy.clone()
    } else {
        "auto_next".into()
    }
}

fn catalog_view_mode(settings: &crate::state::Settings) -> String {
    if matches!(
        settings.catalog_view_mode.as_str(),
        "small_thumbnail" | "detail_list" | "cover_list"
    ) {
        settings.catalog_view_mode.clone()
    } else {
        "cover_list".into()
    }
}

fn viewer_layout_mode(settings: &crate::state::Settings) -> String {
    if matches!(
        settings.layout_mode.as_str(),
        "paged" | "vertical_scroll" | "horizontal_scroll"
    ) {
        settings.layout_mode.clone()
    } else {
        "paged".into()
    }
}

fn catalog_settings(settings: crate::state::Settings) -> CatalogSettings {
    let scale = viewer_scale(&settings);
    let scale_mode = viewer_scale_mode(&settings);
    let end_of_volume_policy = end_of_volume_policy(&settings);
    let catalog_view_mode = catalog_view_mode(&settings);
    let layout_mode = viewer_layout_mode(&settings);
    CatalogSettings {
        sort_field: settings.sort_field,
        sort_descending: settings.sort_descending,
        end_of_volume_policy,
        catalog_view_mode,
        view_mode: settings.view_mode,
        layout_mode,
        reading_direction: settings.reading_direction,
        scale_mode,
        scale,
        loupe_enabled: settings.loupe_enabled,
    }
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageResponse {
    pub page_id: PageId,
    pub media_uri: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThumbnailPriority {
    Background,
    Near,
    Visible,
}

pub type PagePriority = ThumbnailPriority;

impl From<ThumbnailPriority> for Priority {
    fn from(value: ThumbnailPriority) -> Self {
        match value {
            ThumbnailPriority::Background => Priority::Background,
            ThumbnailPriority::Near => Priority::Near,
            ThumbnailPriority::Visible => Priority::Visible,
        }
    }
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
        data: catalog_settings(settings),
    })
}

#[tauri::command]
pub fn take_recovery_notice(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<bool>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let recovered = state.take_recovery_notice()?;
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: recovered,
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
    let settings = {
        let mut stores = state.store.lock().map_err(|_| "state poisoned")?;
        let mut settings = stores
            .as_ref()
            .map(|store| store.load_settings())
            .transpose()
            .map_err(|error| error.message)?
            .unwrap_or_default();
        settings.sort_field.clone_from(&sort_field);
        settings.sort_descending = sort_descending;
        if let Some(store) = stores.as_mut() {
            store
                .save_settings(&settings)
                .map_err(|error| error.message)?;
        }
        settings
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: catalog_settings(settings),
    })
}

#[tauri::command]
pub fn set_end_of_volume_policy(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    policy: String,
) -> Result<Response<CatalogSettings>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !matches!(
        policy.as_str(),
        "auto_next" | "confirm_next" | "return_library" | "stop" | "loop"
    ) {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::InvalidRequest,
                "End-of-volume policy is invalid.",
            ),
        ));
    }
    let settings = {
        let mut stores = state.store.lock().map_err(|_| "state poisoned")?;
        let mut settings = stores
            .as_ref()
            .map(|store| store.load_settings())
            .transpose()
            .map_err(|error| error.message)?
            .unwrap_or_default();
        settings.end_of_volume_policy = policy;
        if let Some(store) = stores.as_mut() {
            store
                .save_settings(&settings)
                .map_err(|error| error.message)?;
        }
        settings
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: catalog_settings(settings),
    })
}

#[tauri::command]
pub fn set_catalog_view_mode(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    catalog_view_mode: String,
) -> Result<Response<CatalogSettings>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !matches!(
        catalog_view_mode.as_str(),
        "small_thumbnail" | "detail_list" | "cover_list"
    ) {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::InvalidRequest, "Catalog view mode is invalid."),
        ));
    }
    let settings = {
        let mut stores = state.store.lock().map_err(|_| "state poisoned")?;
        let mut settings = stores
            .as_ref()
            .map(|store| store.load_settings())
            .transpose()
            .map_err(|error| error.message)?
            .unwrap_or_default();
        settings.catalog_view_mode = catalog_view_mode;
        if let Some(store) = stores.as_mut() {
            store
                .save_settings(&settings)
                .map_err(|error| error.message)?;
        }
        settings
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: catalog_settings(settings),
    })
}

#[tauri::command]
pub fn set_viewer_settings(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    view_mode: String,
    layout_mode: String,
    reading_direction: String,
    scale_mode: String,
    scale: f64,
    loupe_enabled: bool,
) -> Result<Response<CatalogSettings>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !matches!(view_mode.as_str(), "single" | "spread")
        || !matches!(
            layout_mode.as_str(),
            "paged" | "vertical_scroll" | "horizontal_scroll"
        )
        || !matches!(reading_direction.as_str(), "rightToLeft" | "leftToRight")
        || !matches!(
            scale_mode.as_str(),
            "fit" | "width" | "height" | "original" | "custom"
        )
        || !scale.is_finite()
        || !(MIN_VIEWER_SCALE..=MAX_VIEWER_SCALE).contains(&scale)
    {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::InvalidRequest, "Viewer settings are invalid."),
        ));
    }
    let settings = {
        let mut stores = state.store.lock().map_err(|_| "state poisoned")?;
        let mut settings = stores
            .as_ref()
            .map(|store| store.load_settings())
            .transpose()
            .map_err(|error| error.message)?
            .unwrap_or_default();
        settings.view_mode = view_mode;
        settings.layout_mode = layout_mode;
        settings.reading_direction = reading_direction;
        settings.scale_mode = scale_mode;
        settings.scale = scale.to_string();
        settings.loupe_enabled = loupe_enabled;
        if let Some(store) = stores.as_mut() {
            store
                .save_settings(&settings)
                .map_err(|error| error.message)?;
        }
        settings
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: catalog_settings(settings),
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
        enumerate_folder_port(&worker_root, &requested_directory, &cancellation)
    })
    .await
    .map_err(|error| format!("catalog worker failed: {error}"))?;

    let is_current = state
        .navigation
        .lock()
        .map_err(|_| "state poisoned")?
        .is_current(context.generation);
    Ok(port_response(context, result, is_current))
}

#[tauri::command]
pub async fn search_library(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    query: String,
) -> Result<Response<Vec<CatalogEntry>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let normalized_query = normalize_search_text(&query);
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
    let worker_root = root.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        search_library_port(&worker_root, &normalized_query, &cancellation)
    })
    .await
    .map_err(|error| format!("search worker failed: {error}"))?;

    let is_current = state
        .navigation
        .lock()
        .map_err(|_| "state poisoned")?
        .is_current(context.generation);
    Ok(port_response(context, result, is_current))
}

#[tauri::command]
pub async fn get_thumbnail(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_path: String,
    retry: bool,
    priority: ThumbnailPriority,
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
    let cancellation = state
        .navigation
        .lock()
        .map_err(|_| "state poisoned")?
        .cancellation_for(context.generation);
    let pipelines = state.thumbnails.clone();
    let stores = state.store.clone();
    let worker_item = item.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    if state
        .thumbnail_workers
        .submit(priority.into(), cancellation.clone(), move || {
            let result = resolve_thumbnail(
                &pipelines,
                &stores,
                &root,
                &worker_item,
                retry,
                unix_millis(),
            );
            if !cancellation.is_cancelled() {
                let _ = sender.send(result);
            }
        })
        .is_err()
    {
        return Ok(Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        });
    }
    let result = match receiver.await {
        Ok(result) => result,
        Err(_) => {
            return Ok(Response::Cancelled {
                request_id: context.request_id,
                generation: context.generation,
            });
        }
    };
    if !state
        .navigation
        .lock()
        .map_err(|_| "state poisoned")?
        .is_current(context.generation)
    {
        return Ok(Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        });
    }
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
            media_uri: media_uri(&token),
            cache_hit: thumbnail.cache_hit,
        },
    })
}

fn resolve_thumbnail(
    pipelines: &Mutex<Option<ThumbnailPipeline>>,
    stores: &Mutex<Option<StateStore>>,
    root: &std::path::Path,
    item: &RelativePath,
    retry: bool,
    now_ms: i64,
) -> Result<crate::state::ThumbnailResult, AppError> {
    let mut pipelines = pipelines
        .lock()
        .map_err(|_| request_error(ErrorCode::Internal, "Thumbnail pipeline state is poisoned."))?;
    let Some(pipeline) = pipelines.as_mut() else {
        return Err(request_error(
            ErrorCode::UnsupportedFormat,
            "Thumbnail generation is unavailable on this platform.",
        ));
    };
    if retry {
        pipeline.retry(item);
    }
    let stores = stores
        .lock()
        .map_err(|_| request_error(ErrorCode::Internal, "Thumbnail cache state is poisoned."))?;
    let Some(store) = stores.as_ref() else {
        return Err(request_error(
            ErrorCode::Internal,
            "Thumbnail cache is unavailable.",
        ));
    };
    #[cfg(target_os = "windows")]
    {
        pipeline.resolve(store, root, item, now_ms)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (store, root, now_ms);
        Err(request_error(
            ErrorCode::UnsupportedFormat,
            "WIC thumbnail generation requires Windows.",
        ))
    }
}

fn read_page_bytes(grant: &MediaGrant, target: &RelativePath) -> Result<Vec<u8>, AppError> {
    let result = read_grant_bytes(grant).and_then(|bytes| {
        crate::catalog::inspect_image(&mut Cursor::new(&bytes), bytes.len() as u64)?;
        Ok(bytes)
    });
    result.map_err(|mut error| {
        error.target = Some(target.clone());
        error
    })
}

fn enumerate_folder_port(
    root: &std::path::Path,
    directory: &std::path::Path,
    cancellation: &CancellationToken,
) -> Result<Vec<CatalogEntry>, AppError> {
    if cancellation.is_cancelled() {
        return Err(AppError::cancelled());
    }
    let result = enumerate_folder(root, directory);
    if cancellation.is_cancelled() {
        Err(AppError::cancelled())
    } else {
        result
    }
}

fn search_library_port(
    root: &std::path::Path,
    query: &str,
    cancellation: &CancellationToken,
) -> Result<Vec<CatalogEntry>, AppError> {
    if query.is_empty() {
        return Ok(Vec::new());
    }
    if cancellation.is_cancelled() {
        return Err(AppError::cancelled());
    }
    let root = root.canonicalize().map_err(|source| {
        let code = match source.kind() {
            std::io::ErrorKind::NotFound => ErrorCode::NotFound,
            std::io::ErrorKind::PermissionDenied => ErrorCode::AccessDenied,
            _ => ErrorCode::InvalidPath,
        };
        request_error(code, "Cannot read the library root.")
    })?;
    if !root.is_dir() {
        return Err(request_error(
            ErrorCode::InvalidPath,
            "Library root is not a directory.",
        ));
    }
    let mut results = Vec::new();
    search_directory(&root, &root, query, cancellation, &mut results)?;
    results.sort_by(|left, right| {
        crate::domain::natural_cmp(left.relative_path.as_str(), right.relative_path.as_str())
    });
    if cancellation.is_cancelled() {
        Err(AppError::cancelled())
    } else {
        Ok(results)
    }
}

fn search_directory(
    root: &std::path::Path,
    directory: &std::path::Path,
    query: &str,
    cancellation: &CancellationToken,
    results: &mut Vec<CatalogEntry>,
) -> Result<(), AppError> {
    if cancellation.is_cancelled() {
        return Err(AppError::cancelled());
    }
    let entries = crate::catalog::enumerate_folder(root, directory)?;
    for entry in entries {
        if cancellation.is_cancelled() {
            return Err(AppError::cancelled());
        }
        let name = entry
            .relative_path
            .as_str()
            .rsplit('/')
            .next()
            .unwrap_or(entry.relative_path.as_str());
        if normalize_search_text(name).contains(query) {
            results.push(entry.clone());
        }
        if matches!(entry.kind, ItemKind::Folder | ItemKind::ComicFolder) {
            search_directory(
                root,
                &root.join(entry.relative_path.as_str()),
                query,
                cancellation,
                results,
            )?;
        }
    }
    Ok(())
}

fn normalize_search_text(value: &str) -> String {
    value
        .trim()
        .chars()
        .flat_map(|character| {
            let folded = match character {
                '\u{3000}' => ' ',
                '\u{ff01}'..='\u{ff5e}' => {
                    char::from_u32(character as u32 - 0xfee0).unwrap_or(character)
                }
                _ => character,
            };
            folded.to_lowercase()
        })
        .collect()
}

fn enumerate_pages_port(
    root: &std::path::Path,
    item: &std::path::Path,
    is_archive: bool,
    cancellation: &CancellationToken,
) -> Result<Vec<RelativePath>, AppError> {
    if cancellation.is_cancelled() {
        return Err(AppError::cancelled());
    }
    let result = if is_archive {
        enumerate_archive_pages(item)
    } else {
        enumerate_folder_pages(root, item)
    };
    if cancellation.is_cancelled() {
        Err(AppError::cancelled())
    } else {
        result
    }
}

fn port_response<T>(
    context: RequestContext,
    result: Result<T, AppError>,
    is_current: bool,
) -> Response<T> {
    if !is_current
        || result
            .as_ref()
            .is_err_and(|error| error.code == ErrorCode::Cancelled)
    {
        return Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        };
    }
    match result {
        Ok(data) => Response::Ok {
            request_id: context.request_id,
            generation: context.generation,
            data,
        },
        Err(error) => Response::Error {
            request_id: context.request_id,
            generation: context.generation,
            error,
        },
    }
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
    let viewer_cancellation = state
        .viewer
        .lock()
        .map_err(|_| "state poisoned")?
        .begin(context.generation);
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
        enumerate_pages_port(&worker_root, &worker_item, is_archive, &viewer_cancellation)
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
    if !state
        .viewer
        .lock()
        .map_err(|_| "state poisoned")?
        .is_current(context.generation)
    {
        return Ok(Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        });
    }

    let mut registry = state.media.lock().map_err(|_| "state poisoned")?;
    registry.revoke_all();
    let pages = page_paths
        .into_iter()
        .map(|relative_path| {
            let id = page_id_for(item_relative.as_str(), relative_path.as_str());
            ViewerPage {
                id,
                relative_path,
                media_uri: String::new(),
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
pub async fn load_page(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_path: String,
    page_relative_path: String,
    priority: PagePriority,
) -> Result<Response<PageResponse>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let item = RelativePath::parse(item_relative_path).map_err(str::to_string)?;
    let page = RelativePath::parse(page_relative_path).map_err(str::to_string)?;
    let root = state
        .library_root
        .lock()
        .map_err(|_| "state poisoned")?
        .clone()
        .ok_or_else(|| "library root is not configured".to_string())?;
    let is_archive = classify_file_name(item.as_str()) == FileKind::Archive;
    let source = if is_archive {
        PageSource::ArchiveEntry {
            archive: root.join(item.as_str()),
            entry: page.as_str().into(),
        }
    } else {
        PageSource::File(root.join(page.as_str()))
    };
    let page_id = page_id_for(item.as_str(), page.as_str());
    let mime_type = if page.as_str().to_ascii_lowercase().ends_with(".png") {
        "image/png"
    } else {
        "image/jpeg"
    };
    let cancellation = state
        .viewer
        .lock()
        .map_err(|_| "state poisoned")?
        .cancellation_for(context.generation);
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let grant = MediaGrant {
        page_id: page_id.clone(),
        mime_type,
        max_bytes: MAX_IMAGE_BYTES,
        source,
    };
    let worker_page = page.clone();
    if state
        .page_workers
        .submit(priority.into(), cancellation.clone(), move || {
            let result = read_page_bytes(&grant, &worker_page).map(|bytes| (grant, bytes));
            if !cancellation.is_cancelled() {
                let _ = sender.send(result);
            }
        })
        .is_err()
    {
        return Ok(Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        });
    }
    let Ok(result) = receiver.await else {
        return Ok(Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        });
    };
    if !state
        .viewer
        .lock()
        .map_err(|_| "state poisoned")?
        .is_current(context.generation)
    {
        return Ok(Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        });
    }
    let (grant, bytes) = match result {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let token = state
        .media
        .lock()
        .map_err(|_| "state poisoned")?
        .issue(MediaGrant {
            source: PageSource::Memory(bytes),
            ..grant
        });
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: PageResponse {
            page_id,
            media_uri: media_uri(&token),
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
    use std::sync::Condvar;

    #[test]
    fn catalog_view_mode_defaults_to_cover_list_for_missing_or_unknown_values() {
        let mut settings = crate::state::Settings::default();
        assert_eq!(catalog_view_mode(&settings), "cover_list");

        settings.catalog_view_mode = "detail_list".into();
        assert_eq!(catalog_view_mode(&settings), "detail_list");

        settings.catalog_view_mode = "not-a-mode".into();
        assert_eq!(catalog_view_mode(&settings), "cover_list");
    }

    #[test]
    fn viewer_layout_mode_defaults_to_paged_for_missing_or_unknown_values() {
        let mut settings = crate::state::Settings::default();
        assert_eq!(viewer_layout_mode(&settings), "paged");

        settings.layout_mode = "vertical_scroll".into();
        assert_eq!(viewer_layout_mode(&settings), "vertical_scroll");

        settings.layout_mode = "horizontal_scroll".into();
        assert_eq!(viewer_layout_mode(&settings), "horizontal_scroll");

        settings.layout_mode = "fullscreen".into();
        assert_eq!(viewer_layout_mode(&settings), "paged");
    }

    #[test]
    fn shutdown_is_idempotent_cancels_work_revokes_media_and_closes_store() {
        let state = AppState {
            library_root: Mutex::new(None),
            navigation: Mutex::new(NavigationCoordinator::default()),
            viewer: Arc::new(Mutex::new(NavigationCoordinator::default())),
            store: Arc::new(Mutex::new(None)),
            thumbnails: Arc::new(Mutex::new(None)),
            thumbnail_workers: PriorityTaskPool::new(1, 1),
            page_workers: PriorityTaskPool::new(1, 1),
            media: Mutex::new(MediaTokenRegistry::new(Duration::from_secs(60))),
            recovery_notice: Mutex::new(false),
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

    #[test]
    fn recovery_notice_is_consumed_once_without_exposing_internal_details() {
        let state = AppState {
            library_root: Mutex::new(None),
            navigation: Mutex::new(NavigationCoordinator::default()),
            viewer: Arc::new(Mutex::new(NavigationCoordinator::default())),
            store: Arc::new(Mutex::new(None)),
            thumbnails: Arc::new(Mutex::new(None)),
            thumbnail_workers: PriorityTaskPool::new(1, 1),
            page_workers: PriorityTaskPool::new(1, 1),
            media: Mutex::new(MediaTokenRegistry::new(Duration::from_secs(60))),
            recovery_notice: Mutex::new(true),
            shutting_down: AtomicBool::new(false),
        };

        assert_eq!(state.take_recovery_notice().unwrap(), true);
        assert_eq!(state.take_recovery_notice().unwrap(), false);
        state.shutdown();
    }

    #[test]
    fn connected_page_workers_commit_only_latest_of_one_hundred_viewer_generations() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated/FIX-IMAGE-001/portrait.png");
        let pool = PriorityTaskPool::new(2, 128);
        let blocker = Arc::new((Mutex::new(false), Condvar::new()));
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        for _ in 0..2 {
            let blocker = blocker.clone();
            let started_tx = started_tx.clone();
            pool.submit(
                Priority::Visible,
                tokio_util::sync::CancellationToken::new(),
                move || {
                    started_tx.send(()).unwrap();
                    let (lock, ready) = &*blocker;
                    let mut released = lock.lock().unwrap();
                    while !*released {
                        released = ready.wait(released).unwrap();
                    }
                },
            )
            .unwrap();
        }
        started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let coordinator = Arc::new(Mutex::new(NavigationCoordinator::default()));
        let (result_tx, result_rx) = std::sync::mpsc::channel();
        for value in 1..=100 {
            let generation = Generation(value);
            let cancellation = coordinator.lock().unwrap().begin(generation);
            let coordinator = coordinator.clone();
            let result_tx = result_tx.clone();
            let grant = MediaGrant {
                page_id: PageId::parse(format!("page-{value}")).unwrap(),
                mime_type: "image/png",
                max_bytes: MAX_IMAGE_BYTES,
                source: PageSource::File(fixture.clone()),
            };
            pool.submit(Priority::Visible, cancellation.clone(), move || {
                let result = read_grant_bytes(&grant);
                if !cancellation.is_cancelled()
                    && coordinator.lock().unwrap().is_current(generation)
                {
                    result_tx.send((generation, result)).unwrap();
                }
            })
            .unwrap();
        }
        let (lock, ready) = &*blocker;
        *lock.lock().unwrap() = true;
        ready.notify_all();
        let (generation, bytes) = result_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(generation, Generation(100));
        assert!(bytes.unwrap().starts_with(b"\x89PNG\r\n\x1a\n"));
        assert!(result_rx.recv_timeout(Duration::from_millis(100)).is_err());
        pool.shutdown();
    }

    #[test]
    fn page_adapter_reports_the_target_and_recovers_on_the_next_real_page() {
        let fixtures =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/generated");
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-page-recovery-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        let comic = root.join("book");
        std::fs::create_dir_all(&comic).unwrap();
        std::fs::copy(
            fixtures.join("FIX-IMAGE-ERROR-001/corrupt.png"),
            comic.join("1-corrupt.png"),
        )
        .unwrap();
        std::fs::copy(
            fixtures.join("FIX-IMAGE-001/portrait.png"),
            comic.join("2-normal.png"),
        )
        .unwrap();
        let pages = enumerate_folder_pages(&root, &comic).unwrap();
        assert_eq!(
            pages.iter().map(RelativePath::as_str).collect::<Vec<_>>(),
            ["book/1-corrupt.png", "book/2-normal.png"]
        );
        let corrupt_target = pages[0].clone();
        let corrupt = MediaGrant {
            page_id: PageId::parse("corrupt-page").unwrap(),
            mime_type: "image/png",
            max_bytes: MAX_IMAGE_BYTES,
            source: PageSource::File(root.join(corrupt_target.as_str())),
        };
        let error = read_page_bytes(&corrupt, &corrupt_target).unwrap_err();
        assert_eq!(error.code, ErrorCode::CorruptImage);
        assert_eq!(error.target, Some(corrupt_target));

        let next_target = pages[1].clone();
        let next = MediaGrant {
            page_id: PageId::parse("next-page").unwrap(),
            mime_type: "image/png",
            max_bytes: MAX_IMAGE_BYTES,
            source: PageSource::File(root.join(next_target.as_str())),
        };
        let bytes = read_page_bytes(&next, &next_target).unwrap();
        assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn folder_and_archive_ports_distinguish_success_missing_and_cancel() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated")
            .canonicalize()
            .unwrap();
        let active = CancellationToken::new();
        let entries = enumerate_folder_port(&root, &root.join("FIX-NESTED-001"), &active).unwrap();
        assert!(!entries.is_empty());
        assert_eq!(
            enumerate_folder_port(&root, &root.join("missing"), &active)
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        let pages =
            enumerate_pages_port(&root, &root.join("FIX-ZIP-001/standard.cbz"), true, &active)
                .unwrap();
        assert!(!pages.is_empty());

        let cancelled = CancellationToken::new();
        cancelled.cancel();
        assert_eq!(
            enumerate_folder_port(&root, &root.join("FIX-NESTED-001"), &cancelled)
                .unwrap_err()
                .code,
            ErrorCode::Cancelled
        );
        assert_eq!(
            enumerate_pages_port(
                &root,
                &root.join("FIX-ZIP-001/standard.cbz"),
                true,
                &cancelled,
            )
            .unwrap_err()
            .code,
            ErrorCode::Cancelled
        );
    }

    #[test]
    fn search_port_matches_case_width_and_unicode_normalized_names_across_kinds() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-search-kinds-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        std::fs::create_dir_all(root.join("Sample Folder")).unwrap();
        std::fs::write(root.join("Ｓａｍｐｌｅ.cbz"), b"archive").unwrap();
        std::fs::write(root.join("Café.png"), b"image").unwrap();

        let cancellation = CancellationToken::new();
        let sample =
            search_library_port(&root, &normalize_search_text("  SAMPLE  "), &cancellation)
                .unwrap();
        assert_eq!(
            sample
                .iter()
                .map(|entry| entry.relative_path.as_str())
                .collect::<Vec<_>>(),
            ["Sample Folder", "Ｓａｍｐｌｅ.cbz"]
        );
        assert_eq!(sample[0].kind, ItemKind::Folder);
        assert_eq!(sample[1].kind, ItemKind::Archive);

        let unicode =
            search_library_port(&root, &normalize_search_text("CAFÉ"), &cancellation).unwrap();
        assert_eq!(unicode.len(), 1);
        assert_eq!(unicode[0].kind, ItemKind::Page);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn search_port_rescans_the_library_and_returns_new_entries_without_an_index() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-search-rescan-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let cancellation = CancellationToken::new();

        let before =
            search_library_port(&root, &normalize_search_text("new volume"), &cancellation)
                .unwrap();
        assert!(before.is_empty());

        std::fs::write(root.join("New Volume.cbz"), b"archive").unwrap();
        let after = search_library_port(&root, &normalize_search_text("new volume"), &cancellation)
            .unwrap();
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].relative_path.as_str(), "New Volume.cbz");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn application_boundary_preserves_context_and_rejects_stale_real_results() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated")
            .canonicalize()
            .unwrap();
        let cancellation = CancellationToken::new();
        let success = enumerate_folder_port(&root, &root.join("FIX-LIBRARY-001"), &cancellation);
        let context = RequestContext {
            api_version: crate::api::API_VERSION,
            request_id: RequestId::parse("fixture-success").unwrap(),
            generation: Generation(41),
        };
        match port_response(context, success, true) {
            Response::Ok {
                request_id,
                generation,
                data,
            } => {
                assert_eq!(request_id.as_str(), "fixture-success");
                assert_eq!(generation, Generation(41));
                assert!(data.iter().any(|entry| {
                    entry.relative_path.as_str().ends_with("volume.cbz")
                        && entry.kind == crate::domain::ItemKind::Archive
                }));
            }
            response => panic!("unexpected success response: {response:?}"),
        }

        let missing = enumerate_folder_port(&root, &root.join("missing"), &cancellation);
        let context = RequestContext {
            api_version: crate::api::API_VERSION,
            request_id: RequestId::parse("fixture-error").unwrap(),
            generation: Generation(42),
        };
        match port_response(context, missing, true) {
            Response::Error {
                request_id,
                generation,
                error,
            } => {
                assert_eq!(request_id.as_str(), "fixture-error");
                assert_eq!(generation, Generation(42));
                assert_eq!(error.code, ErrorCode::NotFound);
            }
            response => panic!("unexpected error response: {response:?}"),
        }

        let stale = enumerate_folder_port(&root, &root.join("FIX-LIBRARY-001"), &cancellation);
        let context = RequestContext {
            api_version: crate::api::API_VERSION,
            request_id: RequestId::parse("fixture-stale").unwrap(),
            generation: Generation(40),
        };
        assert!(matches!(
            port_response(context, stale, false),
            Response::Cancelled {
                request_id,
                generation: Generation(40)
            } if request_id.as_str() == "fixture-stale"
        ));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn real_thumbnail_pipeline_commits_only_latest_of_one_hundred_queued_generations() {
        let test_root = std::env::temp_dir().join(format!(
            "comic-explorer-connected-worker-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        let paths = AppPaths::under(test_root.clone());
        let (store, _) = StateStore::open(&paths).unwrap();
        let pipeline = ThumbnailPipeline::new(&paths).unwrap();
        let stores = Arc::new(Mutex::new(Some(store)));
        let pipelines = Arc::new(Mutex::new(Some(pipeline)));
        let fixture_root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/generated");
        let item = RelativePath::parse("FIX-IMAGE-001").unwrap();
        let pool = PriorityTaskPool::new(2, 128);
        let blocker = Arc::new((Mutex::new(false), Condvar::new()));
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        for _ in 0..2 {
            let blocker = blocker.clone();
            let started_tx = started_tx.clone();
            pool.submit(
                Priority::Visible,
                tokio_util::sync::CancellationToken::new(),
                move || {
                    started_tx.send(()).unwrap();
                    let (lock, ready) = &*blocker;
                    let mut released = lock.lock().unwrap();
                    while !*released {
                        released = ready.wait(released).unwrap();
                    }
                },
            )
            .unwrap();
        }
        started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        started_rx.recv_timeout(Duration::from_secs(2)).unwrap();

        let coordinator = Arc::new(Mutex::new(NavigationCoordinator::default()));
        let (result_tx, result_rx) = std::sync::mpsc::channel();
        for value in 1..=100 {
            let generation = Generation(value);
            let cancellation = coordinator.lock().unwrap().begin(generation);
            let coordinator = coordinator.clone();
            let result_tx = result_tx.clone();
            let stores = stores.clone();
            let pipelines = pipelines.clone();
            let root = fixture_root.clone();
            let item = item.clone();
            pool.submit(Priority::Visible, cancellation.clone(), move || {
                let result =
                    resolve_thumbnail(&pipelines, &stores, &root, &item, false, unix_millis());
                if !cancellation.is_cancelled()
                    && coordinator.lock().unwrap().is_current(generation)
                {
                    result_tx.send((generation, result)).unwrap();
                }
            })
            .unwrap();
        }

        let (lock, ready) = &*blocker;
        *lock.lock().unwrap() = true;
        ready.notify_all();
        let (generation, result) = result_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        assert_eq!(generation, Generation(100));
        assert!(result.unwrap().path.is_file());
        assert!(result_rx.recv_timeout(Duration::from_millis(100)).is_err());

        pool.shutdown();
        assert!(
            pool.submit(
                Priority::Visible,
                tokio_util::sync::CancellationToken::new(),
                || {}
            )
            .is_err()
        );
        drop(pipelines);
        drop(stores);
        std::fs::remove_dir_all(test_root).unwrap();
    }
}
