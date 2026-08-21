mod coordinator;
mod display_awake;
pub mod file_operations;
mod folder_watch;
mod library_root;
mod recursive_thumbnails;
mod scheduler;
mod search_query;

pub use coordinator::NavigationCoordinator;
pub use scheduler::{BoundedPriorityQueue, Priority, PriorityTaskPool, QueueItem};

use std::collections::{BTreeMap, HashSet};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio_util::sync::CancellationToken;

use crate::api::{Generation, MAX_IMAGE_BYTES, RequestContext, Response};
#[cfg(test)]
use crate::catalog::enumerate_folder_pages;
use crate::catalog::{
    CatalogEntry, enumerate_archive_pages, enumerate_folder, enumerate_folder_pages_with_hidden,
    enumerate_folder_with_hidden, enumerate_pdf_pages, has_child_folder_with_hidden,
    render_pdf_page,
};
use crate::diagnostics::{DiagnosticReport, DiagnosticSnapshotEntry, scan_library};
use crate::domain::{
    AppError, ErrorCode, FileKind, ImageFormat, ItemKind, PageId, RelativePath, RequestId,
    classify_file_name, item_id_for, page_id_for,
};
use crate::media::{MediaGrant, MediaTokenRegistry, PageSource, media_uri, read_grant_bytes};
use crate::state::{
    AppPaths, BookmarkRecord, CatalogMaskRecord, FavoriteRecord, StateStore, ThumbnailPins,
    ThumbnailPipeline,
};
use library_root::validate_library_root;
use recursive_thumbnails::collect_recursive_thumbnail_candidates;
#[cfg(test)]
use search_query::normalize_search_text;
use search_query::{
    SearchExpression, matches_search_query, parse_catalog_mask, parse_search_query,
};

pub struct AppState {
    library_root: Mutex<Option<PathBuf>>,
    search_sources: Mutex<BTreeMap<String, PathBuf>>,
    folder_watch: Mutex<Option<folder_watch::FolderWatch>>,
    navigation: Mutex<NavigationCoordinator>,
    diagnostics: Mutex<NavigationCoordinator>,
    recursive_thumbnails: Mutex<NavigationCoordinator>,
    viewer: Arc<Mutex<NavigationCoordinator>>,
    store: Arc<Mutex<Option<StateStore>>>,
    thumbnails: Arc<Mutex<Option<ThumbnailPipeline>>>,
    thumbnail_pins: ThumbnailPins,
    thumbnail_workers: PriorityTaskPool,
    page_workers: PriorityTaskPool,
    file_operations: Arc<Mutex<()>>,
    display_awake: Mutex<display_awake::DisplayAwakeRequest>,
    pub(crate) media: Mutex<MediaTokenRegistry>,
    recovery_notice: Mutex<bool>,
    shutting_down: AtomicBool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    #[serde(default = "default_search_subfolders")]
    include_subfolders: bool,
    #[serde(default = "default_search_folders")]
    include_folders: bool,
    #[serde(default = "default_search_files")]
    include_files: bool,
    #[serde(default)]
    fixed_location: Option<String>,
    #[serde(default)]
    min_size_bytes: Option<u64>,
    #[serde(default)]
    max_size_bytes: Option<u64>,
    #[serde(default)]
    modified_after_ms: Option<u64>,
    #[serde(default)]
    modified_before_ms: Option<u64>,
    #[serde(default)]
    source_roots: Vec<String>,
}

const fn default_search_subfolders() -> bool {
    true
}

const fn default_search_folders() -> bool {
    true
}

const fn default_search_files() -> bool {
    true
}

fn search_source_key(path: &Path) -> String {
    library_root::display_path(path).to_lowercase()
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            include_subfolders: true,
            include_folders: true,
            include_files: true,
            fixed_location: None,
            min_size_bytes: None,
            max_size_bytes: None,
            modified_after_ms: None,
            modified_before_ms: None,
            source_roots: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogMaskOptions {
    #[serde(default = "default_search_folders")]
    include_folders: bool,
    #[serde(default = "default_search_files")]
    include_files: bool,
    #[serde(default)]
    min_size_bytes: Option<u64>,
    #[serde(default)]
    max_size_bytes: Option<u64>,
    #[serde(default)]
    modified_after_ms: Option<u64>,
    #[serde(default)]
    modified_before_ms: Option<u64>,
}

impl Default for CatalogMaskOptions {
    fn default() -> Self {
        Self {
            include_folders: true,
            include_files: true,
            min_size_bytes: None,
            max_size_bytes: None,
            modified_after_ms: None,
            modified_before_ms: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogMaskCandidate {
    basename: String,
    kind: ItemKind,
    byte_size: Option<u64>,
    modified_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedCatalogMask {
    name: String,
    expression: String,
    options: CatalogMaskOptions,
    updated_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultEntry {
    #[serde(flatten)]
    entry: CatalogEntry,
    source_root: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub relative_path: RelativePath,
    pub has_children: Option<bool>,
}

const CATALOG_FOLDER_CHANGED_EVENT: &str = "catalog-folder-changed";
const RECURSIVE_THUMBNAIL_PROGRESS_EVENT: &str = "recursive-thumbnail-progress";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CatalogFolderChangeEvent {
    generation: Generation,
    library_root: String,
    relative_path: String,
    status: String,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecursiveThumbnailProgress {
    generation: Generation,
    phase: String,
    relative_path: String,
    processed: usize,
    total: usize,
    generated: usize,
    cache_hits: usize,
    failed: usize,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecursiveThumbnailReport {
    total: usize,
    generated: usize,
    cache_hits: usize,
    failed: usize,
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
        let thumbnail_pins = thumbnails
            .as_ref()
            .map(ThumbnailPipeline::pins)
            .unwrap_or_default();
        let search_sources = library_root
            .as_ref()
            .map(|root| {
                [(search_source_key(root), root.clone())]
                    .into_iter()
                    .collect()
            })
            .unwrap_or_default();
        Self {
            library_root: Mutex::new(library_root),
            search_sources: Mutex::new(search_sources),
            folder_watch: Mutex::new(None),
            navigation: Mutex::new(NavigationCoordinator::default()),
            diagnostics: Mutex::new(NavigationCoordinator::default()),
            recursive_thumbnails: Mutex::new(NavigationCoordinator::default()),
            viewer: Arc::new(Mutex::new(NavigationCoordinator::default())),
            store: Arc::new(Mutex::new(store)),
            thumbnails: Arc::new(Mutex::new(thumbnails)),
            thumbnail_pins,
            thumbnail_workers: PriorityTaskPool::new(2, 64),
            page_workers: PriorityTaskPool::new(2, 16),
            file_operations: Arc::new(Mutex::new(())),
            display_awake: Mutex::new(display_awake::DisplayAwakeRequest::default()),
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
        if let Ok(mut diagnostics) = self.diagnostics.lock() {
            diagnostics.shutdown();
        }
        if let Ok(mut recursive_thumbnails) = self.recursive_thumbnails.lock() {
            recursive_thumbnails.shutdown();
        }
        if let Ok(mut viewer) = self.viewer.lock() {
            viewer.shutdown();
        }
        if let Ok(mut media) = self.media.lock() {
            media.revoke_all();
        }
        if let Ok(mut display_awake) = self.display_awake.lock() {
            let _ = display_awake.set_enabled(false);
        }
        if let Ok(mut folder_watch) = self.folder_watch.lock() {
            folder_watch.take();
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

    pub(crate) fn tray_preferences(&self) -> Result<(bool, String, String), String> {
        let settings = self
            .store
            .lock()
            .map_err(|_| "state poisoned")?
            .as_ref()
            .map(|store| store.load_settings())
            .transpose()
            .map_err(|error| error.message)?
            .unwrap_or_default();
        Ok((
            settings.tray_store_on_minimize,
            settings.tray_close_behavior,
            settings.tray_restore_gesture,
        ))
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsDrive {
    pub absolute_path: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsKnownFolder {
    pub id: String,
    pub name: String,
    pub absolute_path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSettings {
    pub sort_field: String,
    pub sort_descending: bool,
    pub end_of_volume_policy: String,
    pub catalog_view_mode: String,
    pub catalog_thumbnail_sizes: CatalogThumbnailSizes,
    pub view_mode: String,
    pub spread_portrait_max_aspect_percent: u16,
    pub auto_spread_min_viewport_aspect_percent: u16,
    pub spread_first_page_single: bool,
    pub spread_pairing: String,
    pub fit_allow_upscale: bool,
    pub fit_basis: String,
    pub fit_include_page_margin: bool,
    pub layout_mode: String,
    pub reading_direction: String,
    pub scale_mode: String,
    pub scale: f64,
    pub loupe_enabled: bool,
    pub loupe_size: u16,
    pub loupe_zoom: f64,
    pub prefetch_ahead: u8,
    pub prefetch_behind: u8,
    #[serde(rename = "prefetchMemoryMiB")]
    pub prefetch_memory_mib: u16,
    pub fullscreen_escape_behavior: String,
    pub prevent_display_sleep_fullscreen: bool,
    pub tray_store_on_minimize: bool,
    pub tray_close_behavior: String,
    pub tray_restore_gesture: String,
    pub slideshow_interval_ms: u32,
    pub slideshow_order: String,
    pub slideshow_repeat_current_item: bool,
    pub viewer_catalog_selection_sync: bool,
    pub viewer_background: String,
    pub viewer_page_margin: u16,
    pub viewer_spread_gap: u16,
    pub cursor_auto_hide_ms: u32,
    pub zoom_retention: String,
    pub viewer_grid_enabled: bool,
    pub viewer_grid_size: u16,
    pub viewer_grid_color: String,
    pub pan_factor: f64,
    pub wheel_dead_zone: u16,
    pub scroll_step_percent: u16,
    pub key_scroll_acceleration_percent: u16,
    pub key_scroll_continuous: bool,
    pub wheel_scroll_factor: f64,
    pub smooth_scroll: bool,
    pub page_scan_mode: String,
    pub tree_visible: bool,
    pub tree_auto_collapse: bool,
    pub tree_confirm_children: bool,
    pub tree_width: u16,
    pub folder_open_rule: String,
    pub image_open_rule: String,
    pub archive_open_rule: String,
    pub detail_grid_lines: String,
    pub detail_row_density: String,
    pub detail_show_kind: bool,
    pub detail_show_size: bool,
    pub detail_show_modified: bool,
    pub menu_bar_visible: bool,
    pub toolbar_visible: bool,
    pub address_bar_visible: bool,
    pub status_bar_visible: bool,
    pub always_on_top: bool,
    pub navigation_selection_policy: String,
    pub thumbnail_generation_scope: String,
    pub startup_location: String,
    pub show_hidden_files: bool,
    pub catalog_palette: String,
    pub restore_last_viewer: bool,
    pub auto_refresh_current_folder: bool,
    pub shortcuts: BTreeMap<String, Vec<String>>,
    pub catalog_mouse_bindings: BTreeMap<String, String>,
    pub mouse_gestures: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogThumbnailSizes {
    pub small_thumbnail: u16,
    pub cover_list: u16,
    pub card_grid: u16,
    pub reference_tile: u16,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsProfileInput {
    pub sort_field: String,
    pub sort_descending: bool,
    pub end_of_volume_policy: String,
    pub catalog_view_mode: String,
    pub catalog_thumbnail_sizes: CatalogThumbnailSizes,
    pub view_mode: String,
    pub spread_portrait_max_aspect_percent: u16,
    pub auto_spread_min_viewport_aspect_percent: u16,
    pub spread_first_page_single: bool,
    pub spread_pairing: String,
    pub fit_allow_upscale: bool,
    pub fit_basis: String,
    pub fit_include_page_margin: bool,
    pub layout_mode: String,
    pub reading_direction: String,
    pub scale_mode: String,
    pub scale: f64,
    pub loupe_enabled: bool,
    pub loupe_size: u16,
    pub loupe_zoom: f64,
    pub prefetch_ahead: u8,
    pub prefetch_behind: u8,
    #[serde(rename = "prefetchMemoryMiB")]
    pub prefetch_memory_mib: u16,
    pub fullscreen_escape_behavior: String,
    pub prevent_display_sleep_fullscreen: bool,
    pub tray_store_on_minimize: bool,
    pub tray_close_behavior: String,
    pub tray_restore_gesture: String,
    pub slideshow_interval_ms: u32,
    pub slideshow_order: String,
    pub slideshow_repeat_current_item: bool,
    pub viewer_catalog_selection_sync: bool,
    pub viewer_background: String,
    pub viewer_page_margin: u16,
    pub viewer_spread_gap: u16,
    pub cursor_auto_hide_ms: u32,
    pub zoom_retention: String,
    pub viewer_grid_enabled: bool,
    pub viewer_grid_size: u16,
    pub viewer_grid_color: String,
    pub pan_factor: f64,
    pub wheel_dead_zone: u16,
    pub scroll_step_percent: u16,
    pub key_scroll_acceleration_percent: u16,
    pub key_scroll_continuous: bool,
    pub wheel_scroll_factor: f64,
    pub smooth_scroll: bool,
    pub page_scan_mode: String,
    pub tree_visible: bool,
    pub tree_auto_collapse: bool,
    pub tree_confirm_children: bool,
    pub tree_width: u16,
    pub folder_open_rule: String,
    pub image_open_rule: String,
    pub archive_open_rule: String,
    pub detail_grid_lines: String,
    pub detail_row_density: String,
    pub detail_show_kind: bool,
    pub detail_show_size: bool,
    pub detail_show_modified: bool,
    pub menu_bar_visible: bool,
    pub toolbar_visible: bool,
    pub address_bar_visible: bool,
    pub status_bar_visible: bool,
    pub always_on_top: bool,
    pub navigation_selection_policy: String,
    pub thumbnail_generation_scope: String,
    pub startup_location: String,
    pub show_hidden_files: bool,
    pub catalog_palette: String,
    pub restore_last_viewer: bool,
    pub auto_refresh_current_folder: bool,
    pub shortcuts: BTreeMap<String, Vec<String>>,
    pub catalog_mouse_bindings: BTreeMap<String, String>,
    pub mouse_gestures: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FavoriteStatus {
    Available,
    Moved,
    Missing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteEntry {
    pub favorite_id: String,
    pub item_identity: String,
    pub relative_path: RelativePath,
    pub resolved_path: Option<RelativePath>,
    pub kind: Option<ItemKind>,
    pub status: FavoriteStatus,
}

const MIN_VIEWER_SCALE: f64 = 0.01;
const MAX_VIEWER_SCALE: f64 = 8.0;
const MAX_VIEWER_SPACING: u16 = 64;
const MIN_PORTRAIT_ASPECT_PERCENT: u16 = 50;
const MAX_PORTRAIT_ASPECT_PERCENT: u16 = 100;
const MIN_AUTO_VIEWPORT_ASPECT_PERCENT: u16 = 100;
const MAX_AUTO_VIEWPORT_ASPECT_PERCENT: u16 = 300;
const MIN_VIEWER_GRID_SIZE: u16 = 8;
const MAX_VIEWER_GRID_SIZE: u16 = 256;
const MIN_PAN_FACTOR: f64 = 0.5;
const MAX_PAN_FACTOR: f64 = 2.0;
const MAX_WHEEL_DEAD_ZONE: u16 = 200;
const MIN_LOUPE_SIZE: u16 = 80;
const MAX_LOUPE_SIZE: u16 = 400;
const MIN_LOUPE_ZOOM: f64 = 1.25;
const MAX_LOUPE_ZOOM: f64 = 8.0;
const MAX_PREFETCH_PAGE_COUNT: u8 = 4;
const MIN_PREFETCH_MEMORY_MIB: u16 = 16;
const MAX_PREFETCH_MEMORY_MIB: u16 = 512;
const MIN_SLIDESHOW_INTERVAL_MS: u32 = 500;
const MAX_SLIDESHOW_INTERVAL_MS: u32 = 60_000;
const DEFAULT_PREFETCH_AHEAD: u8 = 4;
const DEFAULT_PREFETCH_BEHIND: u8 = 0;
const DEFAULT_PREFETCH_MEMORY_MIB: u16 = 256;
const MIN_SCROLL_STEP_PERCENT: u16 = 10;
const MAX_SCROLL_STEP_PERCENT: u16 = 100;
const MIN_KEY_SCROLL_ACCELERATION_PERCENT: u16 = 100;
const MAX_KEY_SCROLL_ACCELERATION_PERCENT: u16 = 300;
const DEFAULT_KEY_SCROLL_ACCELERATION_PERCENT: u16 = 150;
const MIN_WHEEL_SCROLL_FACTOR: f64 = 0.5;
const MAX_WHEEL_SCROLL_FACTOR: f64 = 2.0;
const DEFAULT_VIEWER_PAGE_MARGIN: u16 = 0;
const DEFAULT_VIEWER_SPREAD_GAP: u16 = 8;
const MIN_CATALOG_THUMBNAIL_SIZE: u16 = 64;
const MAX_CATALOG_THUMBNAIL_SIZE: u16 = 320;
const DEFAULT_CATALOG_THUMBNAIL_SIZES: CatalogThumbnailSizes = CatalogThumbnailSizes {
    small_thumbnail: 104,
    cover_list: 144,
    card_grid: 216,
    reference_tile: 128,
};

const LEGACY_SHORTCUT_COMMANDS: [&str; 8] = [
    "nextPage",
    "previousPage",
    "closeViewer",
    "singlePage",
    "spreadPage",
    "toggleDirection",
    "zoomIn",
    "zoomOut",
];

const SHORTCUT_COMMANDS: [&str; 16] = [
    "openSelected",
    "navigateBack",
    "navigateForward",
    "navigateUp",
    "refreshCatalog",
    "toggleSearch",
    "nextPage",
    "previousPage",
    "closeViewer",
    "singlePage",
    "spreadPage",
    "toggleDirection",
    "zoomIn",
    "zoomOut",
    "toggleLoupe",
    "toggleFullscreen",
];
const MIGRATED_SHORTCUT_COMMANDS: [&str; 8] = [
    "openSelected",
    "navigateBack",
    "navigateForward",
    "navigateUp",
    "refreshCatalog",
    "toggleSearch",
    "toggleLoupe",
    "toggleFullscreen",
];
const MIGRATION_SHORTCUT_FALLBACKS: [&str; 24] = [
    "Ctrl+Alt+F1",
    "Ctrl+Alt+F2",
    "Ctrl+Alt+F3",
    "Ctrl+Alt+F4",
    "Ctrl+Alt+F5",
    "Ctrl+Alt+F6",
    "Ctrl+Alt+F7",
    "Ctrl+Alt+F8",
    "Ctrl+Alt+F9",
    "Ctrl+Alt+F10",
    "Ctrl+Alt+F11",
    "Ctrl+Alt+F12",
    "Ctrl+Alt+Shift+F1",
    "Ctrl+Alt+Shift+F2",
    "Ctrl+Alt+Shift+F3",
    "Ctrl+Alt+Shift+F4",
    "Ctrl+Alt+Shift+F5",
    "Ctrl+Alt+Shift+F6",
    "Ctrl+Alt+Shift+F7",
    "Ctrl+Alt+Shift+F8",
    "Ctrl+Alt+Shift+F9",
    "Ctrl+Alt+Shift+F10",
    "Ctrl+Alt+Shift+F11",
    "Ctrl+Alt+Shift+F12",
];

const LEGACY_MOUSE_GESTURE_NAMES: [&str; 3] = ["swipeLeft", "swipeRight", "doubleClick"];
const MOUSE_GESTURE_NAMES: [&str; 10] = [
    "swipeLeft",
    "swipeRight",
    "wheelUp",
    "wheelDown",
    "rightWheelUp",
    "rightWheelDown",
    "middleClick",
    "backButton",
    "forwardButton",
    "doubleClick",
];
const MOUSE_GESTURE_ACTIONS: [&str; 11] = [
    "none",
    "nextPage",
    "previousPage",
    "closeViewer",
    "singlePage",
    "spreadPage",
    "toggleDirection",
    "zoomIn",
    "zoomOut",
    "toggleLoupe",
    "toggleFullscreen",
];
const CATALOG_MOUSE_GESTURE_NAMES: [&str; 5] = [
    "primaryClick",
    "doubleClick",
    "middleClick",
    "backButton",
    "forwardButton",
];
const CATALOG_MOUSE_ACTIONS: [&str; 8] = [
    "none",
    "selectOnly",
    "openSelected",
    "navigateBack",
    "navigateForward",
    "navigateUp",
    "refreshCatalog",
    "toggleSearch",
];

fn default_shortcuts() -> BTreeMap<String, Vec<String>> {
    [
        ("openSelected", "Enter"),
        ("navigateBack", "Alt+ArrowLeft"),
        ("navigateForward", "Alt+ArrowRight"),
        ("navigateUp", "Alt+ArrowUp"),
        ("refreshCatalog", "F5"),
        ("toggleSearch", "Ctrl+F"),
        ("nextPage", "PageDown"),
        ("previousPage", "PageUp"),
        ("closeViewer", "Escape"),
        ("singlePage", "1"),
        ("spreadPage", "2"),
        ("toggleDirection", "R"),
        ("zoomIn", "+"),
        ("zoomOut", "-"),
        ("toggleLoupe", "L"),
        ("toggleFullscreen", "F11"),
    ]
    .into_iter()
    .map(|(command, shortcut)| (command.to_owned(), vec![shortcut.to_owned()]))
    .collect()
}

fn valid_shortcut_key(value: &str) -> bool {
    if value.is_empty() || value.chars().any(char::is_whitespace) {
        return false;
    }
    let mut remainder = value;
    for modifier in ["Ctrl+", "Alt+", "Shift+", "Meta+"] {
        if remainder.starts_with(modifier) {
            remainder = &remainder[modifier.len()..];
        }
    }
    if remainder.is_empty() || (remainder.contains('+') && remainder != "+") {
        return false;
    }
    matches!(
        remainder,
        "Escape"
            | "Space"
            | "PageUp"
            | "PageDown"
            | "ArrowLeft"
            | "ArrowRight"
            | "ArrowUp"
            | "ArrowDown"
            | "+"
            | "-"
            | "_"
            | "="
            | "Enter"
            | "Tab"
            | "Home"
            | "End"
            | "R"
            | "N"
            | "P"
            | "1"
            | "2"
            | "3"
            | "4"
            | "5"
            | "6"
            | "7"
            | "8"
            | "9"
            | "0"
    ) || (remainder.len() == 1 && remainder.as_bytes()[0].is_ascii_alphabetic())
        || (remainder.starts_with('F')
            && remainder[1..]
                .parse::<u8>()
                .ok()
                .is_some_and(|value| (1..=12).contains(&value)))
}

fn normalize_shortcuts(
    shortcuts: &BTreeMap<String, Vec<String>>,
) -> Option<BTreeMap<String, Vec<String>>> {
    let full_shape = shortcuts.len() == SHORTCUT_COMMANDS.len()
        && shortcuts
            .keys()
            .all(|command| SHORTCUT_COMMANDS.contains(&command.as_str()));
    let legacy_shape = shortcuts.len() == LEGACY_SHORTCUT_COMMANDS.len()
        && shortcuts
            .keys()
            .all(|command| LEGACY_SHORTCUT_COMMANDS.contains(&command.as_str()));
    if (!full_shape && !legacy_shape)
        || shortcuts.values().any(|bindings| {
            bindings.is_empty()
                || bindings.len() > 4
                || bindings.iter().any(|shortcut| {
                    !valid_shortcut_key(shortcut)
                        || matches!(
                            shortcut.as_str(),
                            "Alt+F"
                                | "Alt+E"
                                | "Alt+V"
                                | "Alt+O"
                                | "Alt+H"
                                | "Alt+F4"
                                | "Ctrl+X"
                                | "Ctrl+C"
                                | "Ctrl+V"
                                | "Delete"
                        )
                })
        })
    {
        return None;
    }
    let mut normalized = shortcuts.clone();
    let mut seen = std::collections::BTreeSet::new();
    for bindings in normalized.values() {
        for shortcut in bindings {
            if !seen.insert(shortcut.clone()) {
                return None;
            }
        }
    }
    if legacy_shape {
        let defaults = default_shortcuts();
        let mut fallback_index = 0;
        for command in MIGRATED_SHORTCUT_COMMANDS {
            let mut shortcut = defaults[command][0].as_str();
            while seen.contains(shortcut) {
                shortcut = MIGRATION_SHORTCUT_FALLBACKS.get(fallback_index)?;
                fallback_index += 1;
            }
            normalized.insert(command.to_owned(), vec![shortcut.to_owned()]);
            seen.insert(shortcut.to_owned());
        }
    }
    Some(normalized)
}

fn default_mouse_gestures() -> BTreeMap<String, String> {
    [
        ("swipeLeft", "nextPage"),
        ("swipeRight", "previousPage"),
        ("wheelUp", "previousPage"),
        ("wheelDown", "nextPage"),
        ("rightWheelUp", "zoomIn"),
        ("rightWheelDown", "zoomOut"),
        ("middleClick", "none"),
        ("backButton", "previousPage"),
        ("forwardButton", "nextPage"),
        ("doubleClick", "toggleFullscreen"),
    ]
    .into_iter()
    .map(|(gesture, action)| (gesture.to_owned(), action.to_owned()))
    .collect()
}

fn normalize_mouse_gestures(
    gestures: &BTreeMap<String, String>,
) -> Option<BTreeMap<String, String>> {
    let full_shape = gestures.len() == MOUSE_GESTURE_NAMES.len()
        && gestures
            .keys()
            .all(|gesture| MOUSE_GESTURE_NAMES.contains(&gesture.as_str()));
    let legacy_shape = gestures.len() == LEGACY_MOUSE_GESTURE_NAMES.len()
        && gestures
            .keys()
            .all(|gesture| LEGACY_MOUSE_GESTURE_NAMES.contains(&gesture.as_str()));
    if (!full_shape && !legacy_shape)
        || gestures
            .values()
            .any(|action| !MOUSE_GESTURE_ACTIONS.contains(&action.as_str()))
    {
        return None;
    }
    let mut normalized = default_mouse_gestures();
    normalized.extend(gestures.clone());
    normalized.insert("doubleClick".into(), "toggleFullscreen".into());
    Some(normalized)
}

fn default_catalog_mouse_bindings() -> BTreeMap<String, String> {
    [
        ("primaryClick", "selectOnly"),
        ("doubleClick", "openSelected"),
        ("middleClick", "none"),
        ("backButton", "navigateBack"),
        ("forwardButton", "navigateForward"),
    ]
    .into_iter()
    .map(|(gesture, action)| (gesture.to_owned(), action.to_owned()))
    .collect()
}

fn normalize_catalog_mouse_bindings(
    bindings: &BTreeMap<String, String>,
) -> Option<BTreeMap<String, String>> {
    (bindings.len() == CATALOG_MOUSE_GESTURE_NAMES.len()
        && bindings
            .keys()
            .all(|gesture| CATALOG_MOUSE_GESTURE_NAMES.contains(&gesture.as_str()))
        && bindings
            .values()
            .all(|action| CATALOG_MOUSE_ACTIONS.contains(&action.as_str())))
    .then(|| bindings.clone())
}

fn shortcuts_for_settings(settings: &crate::state::Settings) -> BTreeMap<String, Vec<String>> {
    normalize_shortcuts(&settings.shortcut_bindings).unwrap_or_else(default_shortcuts)
}

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
        "small_thumbnail" | "detail_list" | "cover_list" | "card_grid" | "reference_tile"
    ) {
        settings.catalog_view_mode.clone()
    } else {
        "cover_list".into()
    }
}

fn viewer_view_mode(settings: &crate::state::Settings) -> String {
    if matches!(settings.view_mode.as_str(), "auto" | "single" | "spread") {
        settings.view_mode.clone()
    } else {
        "single".into()
    }
}

fn catalog_thumbnail_sizes(settings: &crate::state::Settings) -> CatalogThumbnailSizes {
    fn valid_size(value: &str, fallback: u16) -> u16 {
        value
            .parse::<u16>()
            .ok()
            .filter(|size| (MIN_CATALOG_THUMBNAIL_SIZE..=MAX_CATALOG_THUMBNAIL_SIZE).contains(size))
            .unwrap_or(fallback)
    }
    CatalogThumbnailSizes {
        small_thumbnail: valid_size(
            &settings.small_thumbnail_size,
            DEFAULT_CATALOG_THUMBNAIL_SIZES.small_thumbnail,
        ),
        cover_list: valid_size(
            &settings.cover_list_thumbnail_size,
            DEFAULT_CATALOG_THUMBNAIL_SIZES.cover_list,
        ),
        card_grid: valid_size(
            &settings.card_grid_thumbnail_size,
            DEFAULT_CATALOG_THUMBNAIL_SIZES.card_grid,
        ),
        reference_tile: valid_size(
            &settings.reference_tile_thumbnail_size,
            DEFAULT_CATALOG_THUMBNAIL_SIZES.reference_tile,
        ),
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

fn viewer_background(settings: &crate::state::Settings) -> String {
    if matches!(
        settings.viewer_background.as_str(),
        "checker" | "dark" | "black" | "light"
    ) {
        settings.viewer_background.clone()
    } else {
        "checker".into()
    }
}

fn viewer_spacing(value: &str, fallback: u16) -> u16 {
    value
        .parse::<u16>()
        .ok()
        .filter(|spacing| *spacing <= MAX_VIEWER_SPACING)
        .unwrap_or(fallback)
}

fn spread_percent(value: &str, minimum: u16, maximum: u16, fallback: u16) -> u16 {
    value
        .parse::<u16>()
        .ok()
        .filter(|percent| (minimum..=maximum).contains(percent))
        .unwrap_or(fallback)
}

fn spread_pairing(settings: &crate::state::Settings) -> String {
    match settings.spread_pairing.as_str() {
        "continuous" | "odd" | "even" => settings.spread_pairing.clone(),
        _ => "continuous".into(),
    }
}

fn fit_basis(settings: &crate::state::Settings) -> String {
    match settings.fit_basis.as_str() {
        "spread" | "page" => settings.fit_basis.clone(),
        _ => "spread".into(),
    }
}

fn viewer_cursor_auto_hide_ms(settings: &crate::state::Settings) -> u32 {
    settings
        .cursor_auto_hide_ms
        .parse::<u32>()
        .ok()
        .filter(|delay| matches!(*delay, 0 | 1_000 | 2_000 | 3_000 | 5_000))
        .unwrap_or(0)
}

fn zoom_retention(settings: &crate::state::Settings) -> String {
    match settings.zoom_retention.as_str() {
        "global" | "book" | "page" => settings.zoom_retention.clone(),
        _ => "global".into(),
    }
}

fn viewer_grid_size(settings: &crate::state::Settings) -> u16 {
    settings
        .viewer_grid_size
        .parse::<u16>()
        .ok()
        .filter(|size| (MIN_VIEWER_GRID_SIZE..=MAX_VIEWER_GRID_SIZE).contains(size))
        .unwrap_or(32)
}

fn viewer_grid_color(settings: &crate::state::Settings) -> String {
    match settings.viewer_grid_color.as_str() {
        "light" | "dark" => settings.viewer_grid_color.clone(),
        _ => "light".into(),
    }
}

fn pan_factor(settings: &crate::state::Settings) -> f64 {
    settings
        .pan_factor
        .parse::<f64>()
        .ok()
        .filter(|factor| factor.is_finite() && (MIN_PAN_FACTOR..=MAX_PAN_FACTOR).contains(factor))
        .unwrap_or(1.0)
}

fn wheel_dead_zone(settings: &crate::state::Settings) -> u16 {
    settings
        .wheel_dead_zone
        .parse::<u16>()
        .ok()
        .filter(|threshold| *threshold <= MAX_WHEEL_DEAD_ZONE)
        .unwrap_or(0)
}

fn scroll_step_percent(settings: &crate::state::Settings) -> u16 {
    settings
        .scroll_step_percent
        .parse::<u16>()
        .ok()
        .filter(|percent| (MIN_SCROLL_STEP_PERCENT..=MAX_SCROLL_STEP_PERCENT).contains(percent))
        .unwrap_or(90)
}

fn key_scroll_acceleration_percent(settings: &crate::state::Settings) -> u16 {
    settings
        .key_scroll_acceleration_percent
        .parse::<u16>()
        .ok()
        .filter(|percent| {
            (MIN_KEY_SCROLL_ACCELERATION_PERCENT..=MAX_KEY_SCROLL_ACCELERATION_PERCENT)
                .contains(percent)
        })
        .unwrap_or(DEFAULT_KEY_SCROLL_ACCELERATION_PERCENT)
}

fn wheel_scroll_factor(settings: &crate::state::Settings) -> f64 {
    settings
        .wheel_scroll_factor
        .parse::<f64>()
        .ok()
        .filter(|factor| {
            factor.is_finite()
                && (MIN_WHEEL_SCROLL_FACTOR..=MAX_WHEEL_SCROLL_FACTOR).contains(factor)
        })
        .unwrap_or(1.0)
}

fn page_scan_mode(settings: &crate::state::Settings) -> String {
    match settings.page_scan_mode.as_str() {
        "vertical" | "n" | "z" => settings.page_scan_mode.clone(),
        _ => "vertical".into(),
    }
}

fn loupe_size(settings: &crate::state::Settings) -> u16 {
    settings
        .loupe_size
        .parse::<u16>()
        .ok()
        .filter(|size| (MIN_LOUPE_SIZE..=MAX_LOUPE_SIZE).contains(size))
        .unwrap_or(180)
}

fn loupe_zoom(settings: &crate::state::Settings) -> f64 {
    settings
        .loupe_zoom
        .parse::<f64>()
        .ok()
        .filter(|zoom| zoom.is_finite() && (MIN_LOUPE_ZOOM..=MAX_LOUPE_ZOOM).contains(zoom))
        .unwrap_or(2.0)
}

fn prefetch_page_count(value: &str, default: u8) -> u8 {
    value
        .parse::<u8>()
        .ok()
        .filter(|count| *count <= MAX_PREFETCH_PAGE_COUNT)
        .unwrap_or(default)
}

fn prefetch_memory_mib(settings: &crate::state::Settings) -> u16 {
    settings
        .prefetch_memory_mib
        .parse::<u16>()
        .ok()
        .filter(|limit| (MIN_PREFETCH_MEMORY_MIB..=MAX_PREFETCH_MEMORY_MIB).contains(limit))
        .unwrap_or(DEFAULT_PREFETCH_MEMORY_MIB)
}

fn slideshow_interval_ms(settings: &crate::state::Settings) -> u32 {
    settings
        .slideshow_interval_ms
        .parse::<u32>()
        .ok()
        .filter(|interval| {
            (MIN_SLIDESHOW_INTERVAL_MS..=MAX_SLIDESHOW_INTERVAL_MS).contains(interval)
        })
        .unwrap_or(3_000)
}

fn slideshow_order(settings: &crate::state::Settings) -> String {
    match settings.slideshow_order.as_str() {
        "forward" | "reverse" | "random" => settings.slideshow_order.clone(),
        _ => "forward".into(),
    }
}

fn catalog_settings(settings: crate::state::Settings) -> CatalogSettings {
    let scale = viewer_scale(&settings);
    let scale_mode = viewer_scale_mode(&settings);
    let end_of_volume_policy = end_of_volume_policy(&settings);
    let catalog_view_mode = catalog_view_mode(&settings);
    let view_mode = viewer_view_mode(&settings);
    let spread_portrait_max_aspect_percent = spread_percent(
        &settings.spread_portrait_max_aspect_percent,
        MIN_PORTRAIT_ASPECT_PERCENT,
        MAX_PORTRAIT_ASPECT_PERCENT,
        100,
    );
    let auto_spread_min_viewport_aspect_percent = spread_percent(
        &settings.auto_spread_min_viewport_aspect_percent,
        MIN_AUTO_VIEWPORT_ASPECT_PERCENT,
        MAX_AUTO_VIEWPORT_ASPECT_PERCENT,
        125,
    );
    let spread_pairing = spread_pairing(&settings);
    let fit_basis = fit_basis(&settings);
    let catalog_thumbnail_sizes = catalog_thumbnail_sizes(&settings);
    let layout_mode = viewer_layout_mode(&settings);
    let slideshow_interval_ms = slideshow_interval_ms(&settings);
    let slideshow_order = slideshow_order(&settings);
    let viewer_background = viewer_background(&settings);
    let viewer_page_margin =
        viewer_spacing(&settings.viewer_page_margin, DEFAULT_VIEWER_PAGE_MARGIN);
    let viewer_spread_gap = viewer_spacing(&settings.viewer_spread_gap, DEFAULT_VIEWER_SPREAD_GAP);
    let cursor_auto_hide_ms = viewer_cursor_auto_hide_ms(&settings);
    let zoom_retention = zoom_retention(&settings);
    let viewer_grid_size = viewer_grid_size(&settings);
    let viewer_grid_color = viewer_grid_color(&settings);
    let pan_factor = pan_factor(&settings);
    let wheel_dead_zone = wheel_dead_zone(&settings);
    let scroll_step_percent = scroll_step_percent(&settings);
    let key_scroll_acceleration_percent = key_scroll_acceleration_percent(&settings);
    let wheel_scroll_factor = wheel_scroll_factor(&settings);
    let page_scan_mode = page_scan_mode(&settings);
    let loupe_size = loupe_size(&settings);
    let loupe_zoom = loupe_zoom(&settings);
    let prefetch_ahead = prefetch_page_count(&settings.prefetch_ahead, DEFAULT_PREFETCH_AHEAD);
    let prefetch_behind = prefetch_page_count(&settings.prefetch_behind, DEFAULT_PREFETCH_BEHIND);
    let prefetch_memory_mib = prefetch_memory_mib(&settings);
    let shortcuts = shortcuts_for_settings(&settings);
    let catalog_mouse_bindings = normalize_catalog_mouse_bindings(&settings.catalog_mouse_bindings)
        .unwrap_or_else(default_catalog_mouse_bindings);
    let mouse_gestures = normalize_mouse_gestures(&settings.mouse_gesture_bindings)
        .unwrap_or_else(default_mouse_gestures);
    CatalogSettings {
        sort_field: settings.sort_field,
        sort_descending: settings.sort_descending,
        end_of_volume_policy,
        catalog_view_mode,
        catalog_thumbnail_sizes,
        view_mode,
        spread_portrait_max_aspect_percent,
        auto_spread_min_viewport_aspect_percent,
        spread_first_page_single: settings.spread_first_page_single,
        spread_pairing,
        fit_allow_upscale: settings.fit_allow_upscale,
        fit_basis,
        fit_include_page_margin: settings.fit_include_page_margin,
        layout_mode,
        reading_direction: settings.reading_direction,
        scale_mode,
        scale,
        loupe_enabled: settings.loupe_enabled,
        loupe_size,
        loupe_zoom,
        prefetch_ahead,
        prefetch_behind,
        prefetch_memory_mib,
        fullscreen_escape_behavior: match settings.fullscreen_escape_behavior.as_str() {
            "exitFullscreen" | "closeViewer" => settings.fullscreen_escape_behavior,
            _ => "exitFullscreen".into(),
        },
        prevent_display_sleep_fullscreen: settings.prevent_display_sleep_fullscreen,
        tray_store_on_minimize: settings.tray_store_on_minimize,
        tray_close_behavior: match settings.tray_close_behavior.as_str() {
            "quit" | "store" => settings.tray_close_behavior,
            _ => "quit".into(),
        },
        tray_restore_gesture: match settings.tray_restore_gesture.as_str() {
            "singleClick" | "doubleClick" => settings.tray_restore_gesture,
            _ => "singleClick".into(),
        },
        slideshow_interval_ms,
        slideshow_order,
        slideshow_repeat_current_item: settings.slideshow_repeat_current_item,
        viewer_catalog_selection_sync: settings.viewer_catalog_selection_sync,
        viewer_background,
        viewer_page_margin,
        viewer_spread_gap,
        cursor_auto_hide_ms,
        zoom_retention,
        viewer_grid_enabled: settings.viewer_grid_enabled,
        viewer_grid_size,
        viewer_grid_color,
        pan_factor,
        wheel_dead_zone,
        scroll_step_percent,
        key_scroll_acceleration_percent,
        key_scroll_continuous: settings.key_scroll_continuous,
        wheel_scroll_factor,
        smooth_scroll: settings.smooth_scroll,
        page_scan_mode,
        tree_visible: settings.tree_visible,
        tree_auto_collapse: settings.tree_auto_collapse,
        tree_confirm_children: settings.tree_confirm_children,
        tree_width: settings.tree_width.clamp(180, 480),
        folder_open_rule: match settings.folder_open_rule.as_str() {
            "navigate" | "read" | "none" => settings.folder_open_rule,
            _ => "navigate".into(),
        },
        image_open_rule: match settings.image_open_rule.as_str() {
            "read" | "none" => settings.image_open_rule,
            _ => "read".into(),
        },
        archive_open_rule: match settings.archive_open_rule.as_str() {
            "read" | "none" => settings.archive_open_rule,
            _ => "read".into(),
        },
        detail_grid_lines: match settings.detail_grid_lines.as_str() {
            "none" | "horizontal" | "both" => settings.detail_grid_lines,
            _ => "none".into(),
        },
        detail_row_density: match settings.detail_row_density.as_str() {
            "compact" | "standard" | "comfortable" => settings.detail_row_density,
            _ => "standard".into(),
        },
        detail_show_kind: settings.detail_show_kind,
        detail_show_size: settings.detail_show_size,
        detail_show_modified: settings.detail_show_modified,
        menu_bar_visible: settings.menu_bar_visible,
        toolbar_visible: settings.toolbar_visible,
        address_bar_visible: settings.address_bar_visible,
        status_bar_visible: settings.status_bar_visible,
        always_on_top: settings.always_on_top,
        navigation_selection_policy: match settings.navigation_selection_policy.as_str() {
            "none" | "first" | "last" | "restore" => settings.navigation_selection_policy,
            _ => "restore".into(),
        },
        thumbnail_generation_scope: match settings.thumbnail_generation_scope.as_str() {
            "visible" | "near" | "all" => settings.thumbnail_generation_scope,
            _ => "near".into(),
        },
        startup_location: match settings.startup_location.as_str() {
            "last" | "driveRoot" => settings.startup_location,
            _ => "last".into(),
        },
        show_hidden_files: settings.show_hidden_files,
        catalog_palette: match settings.catalog_palette.as_str() {
            "system" | "paper" | "midnight" | "highContrast" => settings.catalog_palette,
            _ => "system".into(),
        },
        restore_last_viewer: settings.restore_last_viewer,
        auto_refresh_current_folder: settings.auto_refresh_current_folder,
        shortcuts,
        catalog_mouse_bindings,
        mouse_gestures,
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
pub struct ItemMetadata {
    pub item_identity: RelativePath,
    pub memo: Option<String>,
    pub rating: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagEntry {
    pub tag_id: String,
    pub name: String,
    pub item_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemTags {
    pub item_identity: RelativePath,
    pub tags: Vec<TagEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingHistoryEntry {
    pub item_identity: RelativePath,
    pub last_viewed_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageBookmarkEntry {
    pub item_key: RelativePath,
    pub page_key: RelativePath,
    pub page_index: u64,
    pub created_at: u64,
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
            absolute_path: library_root::display_path(path),
        });
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: root,
    })
}

#[tauri::command]
pub fn set_fullscreen_display_awake(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    enabled: bool,
) -> Result<Response<bool>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    state
        .display_awake
        .lock()
        .map_err(|_| "display awake state poisoned")?
        .set_enabled(enabled)?;
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: enabled,
    })
}

#[tauri::command]
pub fn list_windows_drives(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Vec<WindowsDrive>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    #[cfg(target_os = "windows")]
    let drives = match library_root::logical_drive_roots() {
        Ok(drives) => drives,
        Err(error) => return Ok(error_response(&context, error)),
    };
    #[cfg(not(target_os = "windows"))]
    let drives: Vec<PathBuf> = Vec::new();

    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: drives
            .into_iter()
            .map(|path| {
                let absolute_path = library_root::display_path(&path);
                #[cfg(target_os = "windows")]
                let name = library_root::drive_display_name(&path);
                #[cfg(not(target_os = "windows"))]
                let name = format!("ドライブ ({})", absolute_path.trim_end_matches('\\'));
                WindowsDrive {
                    absolute_path,
                    name,
                }
            })
            .collect(),
    })
}

#[tauri::command]
pub fn list_windows_known_folders(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Vec<WindowsKnownFolder>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    #[cfg(target_os = "windows")]
    let folders = library_root::windows_known_folders()
        .into_iter()
        .map(|(id, name, path)| WindowsKnownFolder {
            id: id.into(),
            name: name.into(),
            absolute_path: library_root::display_path(&path),
        })
        .collect();
    #[cfg(not(target_os = "windows"))]
    let folders = Vec::new();
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: folders,
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
pub fn list_favorites(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Vec<FavoriteEntry>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let Some(root) = state
        .library_root
        .lock()
        .map_err(|_| "state poisoned")?
        .clone()
    else {
        return Ok(Response::Ok {
            request_id: context.request_id,
            generation: context.generation,
            data: Vec::new(),
        });
    };
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    let data = match favorite_views(store, &root) {
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
pub fn add_favorite(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_path: String,
) -> Result<Response<Vec<FavoriteEntry>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let relative_path = match RelativePath::parse(item_relative_path) {
        Ok(path) if !path.as_str().is_empty() => path,
        _ => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidPath, "Favorite item path is invalid."),
            ));
        }
    };
    let root = match configured_library_root(&state)? {
        Some(root) => root,
        None => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidRequest, "Library root is not configured."),
            ));
        }
    };
    let target = match favorite_target(&root, &relative_path) {
        Ok(target) => target,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let identity = item_id_for(target.relative_path.as_str()).to_string();
    let favorite = FavoriteRecord {
        favorite_id: format!("favorite-{identity}"),
        item_identity: identity,
        relative_path: target.relative_path,
        kind: target.kind,
        size_bytes: target.byte_size,
        modified_ms: target.modified_ms,
    };
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    store
        .upsert_favorite(&favorite, unix_millis())
        .map_err(|error| error.message)?;
    let data = favorite_views(store, &root).map_err(|error| error.message)?;
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[tauri::command]
pub fn remove_favorite(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    favorite_id: String,
) -> Result<Response<Vec<FavoriteEntry>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if favorite_id.trim().is_empty() {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::InvalidRequest, "Favorite id is invalid."),
        ));
    }
    let root = configured_library_root(&state)?;
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    store
        .remove_favorite(&favorite_id)
        .map_err(|error| error.message)?;
    let data = match root {
        Some(root) => favorite_views(store, &root).map_err(|error| error.message)?,
        None => Vec::new(),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[tauri::command]
pub fn resolve_favorite(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    favorite_id: String,
    item_relative_path: String,
) -> Result<Response<Vec<FavoriteEntry>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let relative_path = match RelativePath::parse(item_relative_path) {
        Ok(path) if !path.as_str().is_empty() => path,
        _ => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidPath, "Favorite item path is invalid."),
            ));
        }
    };
    let root = match configured_library_root(&state)? {
        Some(root) => root,
        None => {
            return Ok(error_response(
                &context,
                request_error(ErrorCode::InvalidRequest, "Library root is not configured."),
            ));
        }
    };
    let target = match favorite_target(&root, &relative_path) {
        Ok(target) => target,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    let Some(existing) = store
        .favorite(&favorite_id)
        .map_err(|error| error.message)?
    else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::NotFound, "Favorite was not found."),
        ));
    };
    if existing.kind != target.kind {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::InvalidRequest, "Favorite kind does not match."),
        ));
    }
    let mut entries = Vec::new();
    if let Err(error) = enumerate_all_catalog_entries(&root, &root, &mut entries) {
        return Ok(error_response(&context, error));
    }
    if let Err(error) = strict_moved_favorite_resolve_target(&existing, &entries, &target) {
        return Ok(error_response(&context, error));
    }
    let updated = FavoriteRecord {
        relative_path: target.relative_path,
        kind: target.kind,
        size_bytes: target.byte_size,
        modified_ms: target.modified_ms,
        ..existing
    };
    store
        .upsert_favorite(&updated, unix_millis())
        .map_err(|error| error.message)?;
    let data = favorite_views(store, &root).map_err(|error| error.message)?;
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
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

fn metadata_item_identity(value: String) -> Result<RelativePath, AppError> {
    match RelativePath::parse(value) {
        Ok(path) if !path.as_str().is_empty() => Ok(path),
        _ => Err(request_error(
            ErrorCode::InvalidPath,
            "Metadata item identity must be a non-empty relative path.",
        )),
    }
}

fn load_item_metadata(
    store: &StateStore,
    item_identity: &RelativePath,
) -> Result<ItemMetadata, AppError> {
    Ok(ItemMetadata {
        item_identity: item_identity.clone(),
        memo: store.memo(item_identity.as_str())?,
        rating: store.rating(item_identity.as_str())?,
    })
}

fn tag_entries(rows: Vec<(String, String, u64)>) -> Vec<TagEntry> {
    rows.into_iter()
        .map(|(tag_id, name, item_count)| TagEntry {
            tag_id,
            name,
            item_count,
        })
        .collect()
}

fn load_item_tags(store: &StateStore, item_identity: &RelativePath) -> Result<ItemTags, AppError> {
    let stable_identity = item_id_for(item_identity.as_str()).to_string();
    Ok(ItemTags {
        item_identity: item_identity.clone(),
        tags: tag_entries(store.tags_for_item(&stable_identity)?),
    })
}

#[tauri::command]
pub fn get_item_tags(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_identity: String,
) -> Result<Response<ItemTags>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let item_identity = match metadata_item_identity(item_identity) {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    let data = match load_item_tags(store, &item_identity) {
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
pub fn list_tags(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Vec<TagEntry>>, String> {
    query_tags(state, context, String::new())
}

#[tauri::command]
pub fn query_tags(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    query: String,
) -> Result<Response<Vec<TagEntry>>, String> {
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
    let rows = match store.query_tags(&query) {
        Ok(rows) => rows,
        Err(error) => return Ok(error_response(&context, error)),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: tag_entries(rows),
    })
}

#[tauri::command]
pub fn assign_tag(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_identity: String,
    tag_name: String,
) -> Result<Response<ItemTags>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let item_identity = match metadata_item_identity(item_identity) {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stable_identity = item_id_for(item_identity.as_str()).to_string();
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    if let Err(error) = store.assign_tag(&stable_identity, &tag_name, unix_millis()) {
        return Ok(error_response(&context, error));
    }
    let data = match load_item_tags(store, &item_identity) {
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
pub fn remove_tag(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_identity: String,
    tag_id: String,
) -> Result<Response<ItemTags>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let item_identity = match metadata_item_identity(item_identity) {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    if tag_id.trim().is_empty() {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::InvalidRequest, "Tag id is invalid."),
        ));
    }
    let stable_identity = item_id_for(item_identity.as_str()).to_string();
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    if let Err(error) = store.remove_tag(&stable_identity, &tag_id) {
        return Ok(error_response(&context, error));
    }
    let data = match load_item_tags(store, &item_identity) {
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
pub fn rename_tag(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    tag_id: String,
    new_name: String,
) -> Result<Response<TagEntry>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if tag_id.trim().is_empty() {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::InvalidRequest, "Tag id is invalid."),
        ));
    }
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    let (tag_id, name, item_count) = match store.rename_tag(&tag_id, &new_name, unix_millis()) {
        Ok(tag) => tag,
        Err(error) => return Ok(error_response(&context, error)),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: TagEntry {
            tag_id,
            name,
            item_count,
        },
    })
}

#[tauri::command]
pub fn get_item_metadata(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_identity: String,
) -> Result<Response<ItemMetadata>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let item_identity = match metadata_item_identity(item_identity) {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    let data = match load_item_metadata(store, &item_identity) {
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
pub fn save_item_memo(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_identity: String,
    body: String,
) -> Result<Response<ItemMetadata>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let item_identity = match metadata_item_identity(item_identity) {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    if let Err(error) = store.save_memo(&item_identity.to_string(), &body, unix_millis()) {
        return Ok(error_response(&context, error));
    }
    let data = match load_item_metadata(store, &item_identity) {
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
pub fn set_item_rating(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_identity: String,
    rating: Option<i64>,
) -> Result<Response<ItemMetadata>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let item_identity = match metadata_item_identity(item_identity) {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    if let Err(error) = store.set_rating(&item_identity.to_string(), rating, unix_millis()) {
        return Ok(error_response(&context, error));
    }
    let data = match load_item_metadata(store, &item_identity) {
        Ok(data) => data,
        Err(error) => return Ok(error_response(&context, error)),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

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
        "small_thumbnail" | "detail_list" | "cover_list" | "card_grid" | "reference_tile"
    ) {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::InvalidRequest, "Catalog view mode is invalid."),
        ));
    }
    let settings = {
        let mut stores = match state.store.lock() {
            Ok(stores) => stores,
            Err(_) => {
                return Ok(error_response(
                    &context,
                    request_error(
                        ErrorCode::Internal,
                        "Local settings storage is unavailable.",
                    ),
                ));
            }
        };
        let Some(store) = stores.as_mut() else {
            return Ok(error_response(
                &context,
                request_error(
                    ErrorCode::Internal,
                    "Local settings storage is not initialized.",
                ),
            ));
        };
        let mut settings = match store.load_settings() {
            Ok(settings) => settings,
            Err(error) => return Ok(error_response(&context, error)),
        };
        settings.catalog_view_mode = catalog_view_mode;
        if let Err(error) = store.save_settings(&settings) {
            return Ok(error_response(&context, error));
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
pub fn set_shortcut_bindings(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    shortcuts: BTreeMap<String, Vec<String>>,
) -> Result<Response<BTreeMap<String, Vec<String>>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let Some(normalized) = normalize_shortcuts(&shortcuts) else {
        return Ok(error_response(
            &context,
            request_error(
                ErrorCode::InvalidRequest,
                "Shortcut bindings are invalid or conflicting.",
            ),
        ));
    };
    let settings = {
        let mut stores = match state.store.lock() {
            Ok(stores) => stores,
            Err(_) => {
                return Ok(error_response(
                    &context,
                    request_error(
                        ErrorCode::Internal,
                        "Local settings storage is unavailable.",
                    ),
                ));
            }
        };
        let Some(store) = stores.as_mut() else {
            return Ok(error_response(
                &context,
                request_error(
                    ErrorCode::Internal,
                    "Local settings storage is not initialized.",
                ),
            ));
        };
        let mut settings = match store.load_settings() {
            Ok(settings) => settings,
            Err(error) => return Ok(error_response(&context, error)),
        };
        settings.shortcut_bindings = normalized.clone();
        if let Err(error) = store.save_settings(&settings) {
            return Ok(error_response(&context, error));
        }
        settings
    };
    let _ = settings;
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: normalized,
    })
}

#[tauri::command]
pub fn set_viewer_settings(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    view_mode: String,
    spread_portrait_max_aspect_percent: u16,
    auto_spread_min_viewport_aspect_percent: u16,
    spread_first_page_single: bool,
    spread_pairing: String,
    fit_allow_upscale: bool,
    fit_basis: String,
    fit_include_page_margin: bool,
    layout_mode: String,
    reading_direction: String,
    scale_mode: String,
    scale: f64,
    loupe_enabled: bool,
    viewer_background: String,
    viewer_page_margin: u16,
    viewer_spread_gap: u16,
    cursor_auto_hide_ms: u32,
) -> Result<Response<CatalogSettings>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    if !matches!(view_mode.as_str(), "auto" | "single" | "spread")
        || !(MIN_PORTRAIT_ASPECT_PERCENT..=MAX_PORTRAIT_ASPECT_PERCENT)
            .contains(&spread_portrait_max_aspect_percent)
        || !(MIN_AUTO_VIEWPORT_ASPECT_PERCENT..=MAX_AUTO_VIEWPORT_ASPECT_PERCENT)
            .contains(&auto_spread_min_viewport_aspect_percent)
        || !matches!(spread_pairing.as_str(), "continuous" | "odd" | "even")
        || !matches!(fit_basis.as_str(), "spread" | "page")
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
        || !matches!(
            viewer_background.as_str(),
            "checker" | "dark" | "black" | "light"
        )
        || viewer_page_margin > MAX_VIEWER_SPACING
        || viewer_spread_gap > MAX_VIEWER_SPACING
        || !matches!(cursor_auto_hide_ms, 0 | 1_000 | 2_000 | 3_000 | 5_000)
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
        settings.spread_portrait_max_aspect_percent =
            spread_portrait_max_aspect_percent.to_string();
        settings.auto_spread_min_viewport_aspect_percent =
            auto_spread_min_viewport_aspect_percent.to_string();
        settings.spread_first_page_single = spread_first_page_single;
        settings.spread_pairing = spread_pairing;
        settings.fit_allow_upscale = fit_allow_upscale;
        settings.fit_basis = fit_basis;
        settings.fit_include_page_margin = fit_include_page_margin;
        settings.layout_mode = layout_mode;
        settings.reading_direction = reading_direction;
        settings.scale_mode = scale_mode;
        settings.scale = scale.to_string();
        settings.loupe_enabled = loupe_enabled;
        settings.viewer_background = viewer_background;
        settings.viewer_page_margin = viewer_page_margin.to_string();
        settings.viewer_spread_gap = viewer_spread_gap.to_string();
        settings.cursor_auto_hide_ms = cursor_auto_hide_ms.to_string();
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

fn validate_settings_profile(
    profile: &SettingsProfileInput,
) -> Result<
    (
        BTreeMap<String, Vec<String>>,
        BTreeMap<String, String>,
        BTreeMap<String, String>,
    ),
    AppError,
> {
    let shortcuts = normalize_shortcuts(&profile.shortcuts).ok_or_else(|| {
        request_error(
            ErrorCode::InvalidRequest,
            "Shortcut bindings are invalid or conflicting.",
        )
    })?;
    let mouse_gestures = normalize_mouse_gestures(&profile.mouse_gestures).ok_or_else(|| {
        request_error(
            ErrorCode::InvalidRequest,
            "Mouse gesture bindings are invalid or conflicting.",
        )
    })?;
    let catalog_mouse_bindings = normalize_catalog_mouse_bindings(&profile.catalog_mouse_bindings)
        .ok_or_else(|| {
            request_error(
                ErrorCode::InvalidRequest,
                "Catalog mouse bindings contain an unknown gesture or action.",
            )
        })?;
    if !matches!(
        profile.sort_field.as_str(),
        "name" | "modified" | "size" | "kind"
    ) || !matches!(
        profile.end_of_volume_policy.as_str(),
        "auto_next" | "confirm_next" | "return_library" | "stop" | "loop"
    ) || !matches!(
        profile.catalog_view_mode.as_str(),
        "small_thumbnail" | "detail_list" | "cover_list" | "card_grid" | "reference_tile"
    ) || !matches!(profile.view_mode.as_str(), "auto" | "single" | "spread")
        || !(MIN_PORTRAIT_ASPECT_PERCENT..=MAX_PORTRAIT_ASPECT_PERCENT)
            .contains(&profile.spread_portrait_max_aspect_percent)
        || !(MIN_AUTO_VIEWPORT_ASPECT_PERCENT..=MAX_AUTO_VIEWPORT_ASPECT_PERCENT)
            .contains(&profile.auto_spread_min_viewport_aspect_percent)
        || !matches!(
            profile.spread_pairing.as_str(),
            "continuous" | "odd" | "even"
        )
        || !matches!(profile.fit_basis.as_str(), "spread" | "page")
        || ![
            profile.catalog_thumbnail_sizes.small_thumbnail,
            profile.catalog_thumbnail_sizes.cover_list,
            profile.catalog_thumbnail_sizes.card_grid,
            profile.catalog_thumbnail_sizes.reference_tile,
        ]
        .into_iter()
        .all(|size| (MIN_CATALOG_THUMBNAIL_SIZE..=MAX_CATALOG_THUMBNAIL_SIZE).contains(&size))
        || !matches!(
            profile.layout_mode.as_str(),
            "paged" | "vertical_scroll" | "horizontal_scroll"
        )
        || !matches!(
            profile.reading_direction.as_str(),
            "rightToLeft" | "leftToRight"
        )
        || !matches!(
            profile.scale_mode.as_str(),
            "fit" | "width" | "height" | "original" | "custom"
        )
        || !profile.scale.is_finite()
        || !(MIN_VIEWER_SCALE..=MAX_VIEWER_SCALE).contains(&profile.scale)
        || !(MIN_LOUPE_SIZE..=MAX_LOUPE_SIZE).contains(&profile.loupe_size)
        || !profile.loupe_zoom.is_finite()
        || !(MIN_LOUPE_ZOOM..=MAX_LOUPE_ZOOM).contains(&profile.loupe_zoom)
        || profile.prefetch_ahead > MAX_PREFETCH_PAGE_COUNT
        || profile.prefetch_behind > MAX_PREFETCH_PAGE_COUNT
        || !(MIN_PREFETCH_MEMORY_MIB..=MAX_PREFETCH_MEMORY_MIB)
            .contains(&profile.prefetch_memory_mib)
        || !matches!(
            profile.fullscreen_escape_behavior.as_str(),
            "exitFullscreen" | "closeViewer"
        )
        || !matches!(profile.tray_close_behavior.as_str(), "quit" | "store")
        || !matches!(
            profile.tray_restore_gesture.as_str(),
            "singleClick" | "doubleClick"
        )
        || !(MIN_SLIDESHOW_INTERVAL_MS..=MAX_SLIDESHOW_INTERVAL_MS)
            .contains(&profile.slideshow_interval_ms)
        || !matches!(
            profile.slideshow_order.as_str(),
            "forward" | "reverse" | "random"
        )
        || !matches!(
            profile.viewer_background.as_str(),
            "checker" | "dark" | "black" | "light"
        )
        || profile.viewer_page_margin > MAX_VIEWER_SPACING
        || profile.viewer_spread_gap > MAX_VIEWER_SPACING
        || !matches!(
            profile.cursor_auto_hide_ms,
            0 | 1_000 | 2_000 | 3_000 | 5_000
        )
        || !matches!(profile.zoom_retention.as_str(), "global" | "book" | "page")
        || !(MIN_VIEWER_GRID_SIZE..=MAX_VIEWER_GRID_SIZE).contains(&profile.viewer_grid_size)
        || !matches!(profile.viewer_grid_color.as_str(), "light" | "dark")
        || !profile.pan_factor.is_finite()
        || !(MIN_PAN_FACTOR..=MAX_PAN_FACTOR).contains(&profile.pan_factor)
        || profile.wheel_dead_zone > MAX_WHEEL_DEAD_ZONE
        || !(MIN_SCROLL_STEP_PERCENT..=MAX_SCROLL_STEP_PERCENT)
            .contains(&profile.scroll_step_percent)
        || !(MIN_KEY_SCROLL_ACCELERATION_PERCENT..=MAX_KEY_SCROLL_ACCELERATION_PERCENT)
            .contains(&profile.key_scroll_acceleration_percent)
        || !profile.wheel_scroll_factor.is_finite()
        || !(MIN_WHEEL_SCROLL_FACTOR..=MAX_WHEEL_SCROLL_FACTOR)
            .contains(&profile.wheel_scroll_factor)
        || !matches!(profile.page_scan_mode.as_str(), "vertical" | "n" | "z")
        || !(180..=480).contains(&profile.tree_width)
        || !matches!(
            profile.folder_open_rule.as_str(),
            "navigate" | "read" | "none"
        )
        || !matches!(profile.image_open_rule.as_str(), "read" | "none")
        || !matches!(profile.archive_open_rule.as_str(), "read" | "none")
        || !matches!(
            profile.detail_grid_lines.as_str(),
            "none" | "horizontal" | "both"
        )
        || !matches!(
            profile.detail_row_density.as_str(),
            "compact" | "standard" | "comfortable"
        )
        || !matches!(
            profile.navigation_selection_policy.as_str(),
            "none" | "first" | "last" | "restore"
        )
        || !matches!(
            profile.thumbnail_generation_scope.as_str(),
            "visible" | "near" | "all"
        )
        || !matches!(profile.startup_location.as_str(), "last" | "driveRoot")
        || !matches!(
            profile.catalog_palette.as_str(),
            "system" | "paper" | "midnight" | "highContrast"
        )
    {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Settings profile contains an invalid value.",
        ));
    }
    Ok((shortcuts, catalog_mouse_bindings, mouse_gestures))
}

#[tauri::command]
pub fn set_settings_profile(
    state: tauri::State<'_, AppState>,
    tray_state: tauri::State<'_, crate::tray::TrayState>,
    context: RequestContext,
    profile: SettingsProfileInput,
) -> Result<Response<CatalogSettings>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let (shortcuts, catalog_mouse_bindings, mouse_gestures) =
        match validate_settings_profile(&profile) {
            Ok(bindings) => bindings,
            Err(error) => return Ok(error_response(&context, error)),
        };
    let settings = {
        let mut stores = match state.store.lock() {
            Ok(stores) => stores,
            Err(_) => {
                return Ok(error_response(
                    &context,
                    request_error(
                        ErrorCode::Internal,
                        "Local settings storage is unavailable.",
                    ),
                ));
            }
        };
        let Some(store) = stores.as_mut() else {
            return Ok(error_response(
                &context,
                request_error(
                    ErrorCode::Internal,
                    "Local settings storage is not initialized.",
                ),
            ));
        };
        let mut settings = match store.load_settings() {
            Ok(settings) => settings,
            Err(error) => return Ok(error_response(&context, error)),
        };
        settings.sort_field = profile.sort_field;
        settings.sort_descending = profile.sort_descending;
        settings.end_of_volume_policy = profile.end_of_volume_policy;
        settings.catalog_view_mode = profile.catalog_view_mode;
        settings.small_thumbnail_size = profile.catalog_thumbnail_sizes.small_thumbnail.to_string();
        settings.cover_list_thumbnail_size = profile.catalog_thumbnail_sizes.cover_list.to_string();
        settings.card_grid_thumbnail_size = profile.catalog_thumbnail_sizes.card_grid.to_string();
        settings.reference_tile_thumbnail_size =
            profile.catalog_thumbnail_sizes.reference_tile.to_string();
        settings.view_mode = profile.view_mode;
        settings.spread_portrait_max_aspect_percent =
            profile.spread_portrait_max_aspect_percent.to_string();
        settings.auto_spread_min_viewport_aspect_percent =
            profile.auto_spread_min_viewport_aspect_percent.to_string();
        settings.spread_first_page_single = profile.spread_first_page_single;
        settings.spread_pairing = profile.spread_pairing;
        settings.fit_allow_upscale = profile.fit_allow_upscale;
        settings.fit_basis = profile.fit_basis;
        settings.fit_include_page_margin = profile.fit_include_page_margin;
        settings.layout_mode = profile.layout_mode;
        settings.reading_direction = profile.reading_direction;
        settings.scale_mode = profile.scale_mode;
        settings.scale = profile.scale.to_string();
        settings.loupe_enabled = profile.loupe_enabled;
        settings.loupe_size = profile.loupe_size.to_string();
        settings.loupe_zoom = profile.loupe_zoom.to_string();
        settings.prefetch_ahead = profile.prefetch_ahead.to_string();
        settings.prefetch_behind = profile.prefetch_behind.to_string();
        settings.prefetch_memory_mib = profile.prefetch_memory_mib.to_string();
        settings.fullscreen_escape_behavior = profile.fullscreen_escape_behavior;
        settings.prevent_display_sleep_fullscreen = profile.prevent_display_sleep_fullscreen;
        settings.tray_store_on_minimize = profile.tray_store_on_minimize;
        settings.tray_close_behavior = profile.tray_close_behavior;
        settings.tray_restore_gesture = profile.tray_restore_gesture;
        settings.slideshow_interval_ms = profile.slideshow_interval_ms.to_string();
        settings.slideshow_order = profile.slideshow_order;
        settings.slideshow_repeat_current_item = profile.slideshow_repeat_current_item;
        settings.viewer_catalog_selection_sync = profile.viewer_catalog_selection_sync;
        settings.viewer_background = profile.viewer_background;
        settings.viewer_page_margin = profile.viewer_page_margin.to_string();
        settings.viewer_spread_gap = profile.viewer_spread_gap.to_string();
        settings.cursor_auto_hide_ms = profile.cursor_auto_hide_ms.to_string();
        settings.zoom_retention = profile.zoom_retention;
        settings.viewer_grid_enabled = profile.viewer_grid_enabled;
        settings.viewer_grid_size = profile.viewer_grid_size.to_string();
        settings.viewer_grid_color = profile.viewer_grid_color;
        settings.pan_factor = profile.pan_factor.to_string();
        settings.wheel_dead_zone = profile.wheel_dead_zone.to_string();
        settings.scroll_step_percent = profile.scroll_step_percent.to_string();
        settings.key_scroll_acceleration_percent =
            profile.key_scroll_acceleration_percent.to_string();
        settings.key_scroll_continuous = profile.key_scroll_continuous;
        settings.wheel_scroll_factor = profile.wheel_scroll_factor.to_string();
        settings.smooth_scroll = profile.smooth_scroll;
        settings.page_scan_mode = profile.page_scan_mode;
        settings.tree_visible = profile.tree_visible;
        settings.tree_auto_collapse = profile.tree_auto_collapse;
        settings.tree_confirm_children = profile.tree_confirm_children;
        settings.tree_width = profile.tree_width;
        settings.folder_open_rule = profile.folder_open_rule;
        settings.image_open_rule = profile.image_open_rule;
        settings.archive_open_rule = profile.archive_open_rule;
        settings.detail_grid_lines = profile.detail_grid_lines;
        settings.detail_row_density = profile.detail_row_density;
        settings.detail_show_kind = profile.detail_show_kind;
        settings.detail_show_size = profile.detail_show_size;
        settings.detail_show_modified = profile.detail_show_modified;
        settings.menu_bar_visible = profile.menu_bar_visible;
        settings.toolbar_visible = profile.toolbar_visible;
        settings.address_bar_visible = profile.address_bar_visible;
        settings.status_bar_visible = profile.status_bar_visible;
        settings.always_on_top = profile.always_on_top;
        settings.navigation_selection_policy = profile.navigation_selection_policy;
        settings.thumbnail_generation_scope = profile.thumbnail_generation_scope;
        settings.startup_location = profile.startup_location;
        settings.show_hidden_files = profile.show_hidden_files;
        settings.catalog_palette = profile.catalog_palette;
        settings.restore_last_viewer = profile.restore_last_viewer;
        settings.auto_refresh_current_folder = profile.auto_refresh_current_folder;
        settings.shortcut_bindings = shortcuts;
        settings.catalog_mouse_bindings = catalog_mouse_bindings;
        settings.mouse_gesture_bindings = mouse_gestures;
        if let Err(error) = store.save_settings(&settings) {
            return Ok(error_response(&context, error));
        }
        tray_state.apply_preferences(
            settings.tray_store_on_minimize,
            &settings.tray_close_behavior,
            &settings.tray_restore_gesture,
        );
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

#[tauri::command]
pub async fn pick_search_source(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Option<LibraryRoot>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    #[cfg(target_os = "windows")]
    let picked = tauri::async_runtime::spawn_blocking(library_root::pick_folder)
        .await
        .map_err(|error| format!("search source picker worker failed: {error}"))?;
    #[cfg(not(target_os = "windows"))]
    let picked: Result<Option<PathBuf>, AppError> = Err(request_error(
        ErrorCode::UnsupportedFormat,
        "検索場所の選択画面はWindows版で利用できます。",
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
            Err(error) => return Err(format!("search source validation worker failed: {error}")),
        };
    let absolute_path = library_root::display_path(&canonical);
    state
        .search_sources
        .lock()
        .map_err(|_| "state poisoned")?
        .insert(search_source_key(&canonical), canonical);
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: Some(LibraryRoot { absolute_path }),
    })
}

#[tauri::command]
pub async fn pick_library_file(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Option<LibraryRoot>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    #[cfg(target_os = "windows")]
    let picked = tauri::async_runtime::spawn_blocking(library_root::pick_supported_file)
        .await
        .map_err(|error| format!("file picker worker failed: {error}"))?;
    #[cfg(not(target_os = "windows"))]
    let picked: Result<Option<PathBuf>, AppError> = Err(request_error(
        ErrorCode::UnsupportedFormat,
        "ファイル選択画面はWindows版で利用できます。",
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
    let canonical = match tauri::async_runtime::spawn_blocking(move || {
        library_root::validate_library_file(&picked)
    })
    .await
    {
        Ok(Ok(path)) => path,
        Ok(Err(error)) => return Ok(error_response(&context, error)),
        Err(error) => return Err(format!("file picker validation worker failed: {error}")),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: Some(LibraryRoot {
            absolute_path: library_root::display_path(&canonical),
        }),
    })
}

fn save_library_root(
    state: &tauri::State<'_, AppState>,
    context: &RequestContext,
    canonical: PathBuf,
) -> Result<Response<LibraryRoot>, String> {
    state
        .recursive_thumbnails
        .lock()
        .map_err(|_| "recursive thumbnail state poisoned")?
        .cancel_current();
    *state.library_root.lock().map_err(|_| "state poisoned")? = Some(canonical.clone());
    state
        .search_sources
        .lock()
        .map_err(|_| "state poisoned")?
        .insert(search_source_key(&canonical), canonical.clone());
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
            absolute_path: library_root::display_path(&canonical),
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
    let show_hidden = state
        .store
        .lock()
        .map_err(|_| "state poisoned")?
        .as_ref()
        .and_then(|store| store.load_settings().ok())
        .is_some_and(|settings| settings.show_hidden_files);
    reset_thumbnail_pins_for_navigation(&state.thumbnail_pins).map_err(|error| error.message)?;
    let requested_directory = root.join(relative_path.as_str());
    let worker_root = root.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        enumerate_folder_port(
            &worker_root,
            &requested_directory,
            show_hidden,
            &cancellation,
        )
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
pub fn watch_library_folder(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    context: RequestContext,
    relative_path: String,
) -> Result<Response<bool>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let relative = match RelativePath::parse(relative_path.clone()) {
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
    let directory = match resolve_watch_directory(&root, &relative) {
        Ok(directory) => directory,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let event_root = library_root::display_path(&root);
    let event_relative = relative.as_str().to_owned();
    let event_generation = context.generation;
    let watcher = match folder_watch::FolderWatch::start(&directory, move |signal| {
        let (status, message) = match signal {
            folder_watch::WatchSignal::Changed => ("changed", None),
            folder_watch::WatchSignal::Error(_) => (
                "error",
                Some("現在フォルダーの自動更新を継続できません。F5で再読み込みできます。".into()),
            ),
        };
        let _ = app.emit(
            CATALOG_FOLDER_CHANGED_EVENT,
            CatalogFolderChangeEvent {
                generation: event_generation,
                library_root: event_root.clone(),
                relative_path: event_relative.clone(),
                status: status.into(),
                message,
            },
        );
    }) {
        Ok(watcher) => watcher,
        Err(_) => {
            return Ok(error_response(
                &context,
                request_error(
                    ErrorCode::Internal,
                    "Current folder automatic refresh is unavailable.",
                ),
            ));
        }
    };
    state
        .folder_watch
        .lock()
        .map_err(|_| "state poisoned")?
        .replace(watcher);
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: true,
    })
}

#[tauri::command]
pub fn stop_library_folder_watch(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<bool>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let stopped = state
        .folder_watch
        .lock()
        .map_err(|_| "state poisoned")?
        .take()
        .is_some();
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: stopped,
    })
}

#[tauri::command]
pub async fn search_library(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    query: String,
    options: Option<SearchOptions>,
) -> Result<Response<Vec<SearchResultEntry>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
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
    let mut options = options.unwrap_or_default();
    let sources = match resolve_search_sources(&state, &root, &options.source_roots) {
        Ok(sources) => sources,
        Err(error) => return Ok(error_response(&context, error)),
    };
    if sources.len() > 1 {
        options.fixed_location = None;
    }
    let cancellation = state
        .navigation
        .lock()
        .map_err(|_| "state poisoned")?
        .begin(context.generation);
    let result = tauri::async_runtime::spawn_blocking(move || {
        search_library_sources_port(&sources, &query, &options, &cancellation)
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

const MAX_CATALOG_MASK_BASENAMES: usize = 100_000;
const MAX_CATALOG_MASK_BASENAME_CHARS: usize = 1_024;

#[tauri::command]
pub async fn evaluate_catalog_mask(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    mask: String,
    candidates: Vec<CatalogMaskCandidate>,
    options: Option<CatalogMaskOptions>,
) -> Result<Response<Vec<bool>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let options = options.unwrap_or_default();
    let result = tauri::async_runtime::spawn_blocking(move || {
        evaluate_catalog_mask_port(&mask, &candidates, &options)
    })
    .await
    .map_err(|error| format!("catalog mask worker failed: {error}"))?;
    Ok(port_response(context, result, true))
}

fn validate_catalog_mask_options(options: &CatalogMaskOptions) -> Result<(), AppError> {
    if !options.include_folders && !options.include_files {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Catalog mask must include folders, files, or both.",
        ));
    }
    if options
        .min_size_bytes
        .zip(options.max_size_bytes)
        .is_some_and(|(minimum, maximum)| minimum > maximum)
        || options
            .modified_after_ms
            .zip(options.modified_before_ms)
            .is_some_and(|(after, before)| after >= before)
    {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Catalog mask range is invalid.",
        ));
    }
    Ok(())
}

fn catalog_mask_candidate_matches_options(
    candidate: &CatalogMaskCandidate,
    options: &CatalogMaskOptions,
) -> bool {
    let folder = matches!(candidate.kind, ItemKind::Folder | ItemKind::ComicFolder);
    if (folder && !options.include_folders) || (!folder && !options.include_files) {
        return false;
    }
    if options
        .min_size_bytes
        .is_some_and(|minimum| candidate.byte_size.is_none_or(|value| value < minimum))
    {
        return false;
    }
    if options
        .max_size_bytes
        .is_some_and(|maximum| candidate.byte_size.is_none_or(|value| value > maximum))
    {
        return false;
    }
    if options
        .modified_after_ms
        .is_some_and(|after| candidate.modified_ms.is_none_or(|value| value < after))
    {
        return false;
    }
    if options
        .modified_before_ms
        .is_some_and(|before| candidate.modified_ms.is_none_or(|value| value >= before))
    {
        return false;
    }
    true
}

fn evaluate_catalog_mask_port(
    mask: &str,
    candidates: &[CatalogMaskCandidate],
    options: &CatalogMaskOptions,
) -> Result<Vec<bool>, AppError> {
    if candidates.len() > MAX_CATALOG_MASK_BASENAMES {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Catalog mask accepts at most 100000 basenames.",
        ));
    }
    if candidates.iter().any(|candidate| {
        candidate.basename.chars().count() > MAX_CATALOG_MASK_BASENAME_CHARS
            || candidate.basename.contains(['/', '\\', '\0'])
    }) {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Catalog mask received an invalid basename.",
        ));
    }
    validate_catalog_mask_options(options)?;
    let expression = parse_catalog_mask(mask)
        .map_err(|error| request_error(ErrorCode::InvalidRequest, error.0))?;
    Ok(candidates
        .iter()
        .map(|candidate| {
            catalog_mask_candidate_matches_options(candidate, options)
                && expression
                    .as_ref()
                    .is_none_or(|expression| matches_search_query(expression, &candidate.basename))
        })
        .collect())
}

fn saved_catalog_mask(record: CatalogMaskRecord) -> SavedCatalogMask {
    SavedCatalogMask {
        name: record.name,
        expression: record.expression,
        options: CatalogMaskOptions {
            include_folders: record.include_folders,
            include_files: record.include_files,
            min_size_bytes: record.min_size_bytes,
            max_size_bytes: record.max_size_bytes,
            modified_after_ms: record.modified_after_ms,
            modified_before_ms: record.modified_before_ms,
        },
        updated_at_ms: record.updated_at_ms,
    }
}

fn validate_catalog_mask_name(name: &str) -> Result<&str, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 64 || trimmed.chars().any(char::is_control) {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Saved catalog mask name must contain 1 to 64 visible characters.",
        ));
    }
    Ok(trimmed)
}

fn catalog_mask_record(
    name: &str,
    expression: String,
    options: CatalogMaskOptions,
) -> Result<CatalogMaskRecord, AppError> {
    let name = validate_catalog_mask_name(name)?.to_owned();
    parse_catalog_mask(&expression)
        .map_err(|error| request_error(ErrorCode::InvalidRequest, error.0))?;
    validate_catalog_mask_options(&options)?;
    Ok(CatalogMaskRecord {
        name,
        expression,
        include_folders: options.include_folders,
        include_files: options.include_files,
        min_size_bytes: options.min_size_bytes,
        max_size_bytes: options.max_size_bytes,
        modified_after_ms: options.modified_after_ms,
        modified_before_ms: options.modified_before_ms,
        updated_at_ms: unix_millis().max(0) as u64,
    })
}

#[tauri::command]
pub fn list_catalog_masks(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
) -> Result<Response<Vec<SavedCatalogMask>>, String> {
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
    let data = store
        .list_catalog_masks()
        .map_err(|error| error.message)?
        .into_iter()
        .map(saved_catalog_mask)
        .collect();
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[tauri::command]
pub fn save_catalog_mask(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    name: String,
    expression: String,
    options: CatalogMaskOptions,
) -> Result<Response<Vec<SavedCatalogMask>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let record = match catalog_mask_record(&name, expression, options) {
        Ok(record) => record,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let mut stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_mut() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    if let Err(error) = store.save_catalog_mask(&record) {
        return Ok(error_response(&context, error));
    }
    let data = store
        .list_catalog_masks()
        .map_err(|error| error.message)?
        .into_iter()
        .map(saved_catalog_mask)
        .collect();
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

#[tauri::command]
pub fn delete_catalog_mask(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    name: String,
) -> Result<Response<Vec<SavedCatalogMask>>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let name = match validate_catalog_mask_name(&name) {
        Ok(name) => name,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let stores = state.store.lock().map_err(|_| "state poisoned")?;
    let Some(store) = stores.as_ref() else {
        return Ok(error_response(
            &context,
            request_error(ErrorCode::Internal, "Local metadata is unavailable."),
        ));
    };
    if let Err(error) = store.delete_catalog_mask(name) {
        return Ok(error_response(&context, error));
    }
    let data = store
        .list_catalog_masks()
        .map_err(|error| error.message)?
        .into_iter()
        .map(saved_catalog_mask)
        .collect();
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data,
    })
}

/// Run the read-only FR-B09 scanner against the configured library root.
///
/// The baseline stays in the caller so a diagnostic report never creates a
/// sidecar or mutates the library.  Starting a new generation cancels the
/// previous diagnostic worker and stale results are discarded at this
/// boundary.
#[tauri::command]
pub async fn diagnose_library(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    baseline: Option<Vec<DiagnosticSnapshotEntry>>,
    retry: bool,
) -> Result<Response<DiagnosticReport>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
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
        .diagnostics
        .lock()
        .map_err(|_| "state poisoned")?
        .begin(context.generation);
    let worker_root = root.clone();
    let worker_baseline = baseline.unwrap_or_default();
    let result = tauri::async_runtime::spawn_blocking(move || {
        scan_library(&worker_root, &worker_baseline, retry, &cancellation)
    })
    .await
    .map_err(|error| format!("diagnostics worker failed: {error}"))?;

    let is_current = state
        .diagnostics
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
    let thumbnail_pins = state.thumbnail_pins.clone();
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
            if cancellation.is_cancelled() {
                if let Ok(thumbnail) = &result {
                    thumbnail_pins.unpin(&thumbnail.content_hash);
                }
            } else {
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
        if let Ok(thumbnail) = &result {
            state.thumbnail_pins.unpin(&thumbnail.content_hash);
        }
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

#[tauri::command]
pub async fn generate_recursive_thumbnails(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    context: RequestContext,
    relative_path: String,
) -> Result<Response<RecursiveThumbnailReport>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let start = match RelativePath::parse(relative_path) {
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
    let show_hidden = state
        .store
        .lock()
        .map_err(|_| "state poisoned")?
        .as_ref()
        .and_then(|store| store.load_settings().ok())
        .is_some_and(|settings| settings.show_hidden_files);
    let cancellation = state
        .recursive_thumbnails
        .lock()
        .map_err(|_| "recursive thumbnail state poisoned")?
        .begin(context.generation);
    emit_recursive_thumbnail_progress(
        &app,
        &context,
        "enumerating",
        &start,
        &RecursiveThumbnailReport::default(),
        0,
    );
    let worker_root = root.clone();
    let worker_start = start.clone();
    let worker_cancellation = cancellation.clone();
    let candidates = tauri::async_runtime::spawn_blocking(move || {
        collect_recursive_thumbnail_candidates(
            &worker_root,
            &worker_start,
            show_hidden,
            &worker_cancellation,
        )
    })
    .await
    .map_err(|error| format!("recursive thumbnail enumeration failed: {error}"))?;
    let is_current = state
        .recursive_thumbnails
        .lock()
        .map_err(|_| "recursive thumbnail state poisoned")?
        .is_current(context.generation);
    let candidates = match candidates {
        Ok(candidates) if is_current && !cancellation.is_cancelled() => candidates,
        result => {
            return Ok(port_response(
                context,
                result.map(|_| RecursiveThumbnailReport::default()),
                is_current,
            ));
        }
    };

    let mut report = RecursiveThumbnailReport {
        total: candidates.len(),
        ..RecursiveThumbnailReport::default()
    };
    emit_recursive_thumbnail_progress(&app, &context, "generating", &start, &report, 0);
    for candidate in candidates {
        if cancellation.is_cancelled() {
            emit_recursive_thumbnail_progress(
                &app,
                &context,
                "cancelled",
                &start,
                &report,
                report.generated + report.cache_hits + report.failed,
            );
            return Ok(Response::Cancelled {
                request_id: context.request_id,
                generation: context.generation,
            });
        }
        let result =
            resolve_recursive_thumbnail_candidate(&state, &root, &candidate, &cancellation).await;
        match record_recursive_thumbnail_result(&mut report, result) {
            Ok(Some(content_hash)) => state.thumbnail_pins.unpin(&content_hash),
            Ok(None) => {}
            Err(error) if error.code == ErrorCode::Cancelled => {
                emit_recursive_thumbnail_progress(
                    &app,
                    &context,
                    "cancelled",
                    &start,
                    &report,
                    report.generated + report.cache_hits + report.failed,
                );
                return Ok(Response::Cancelled {
                    request_id: context.request_id,
                    generation: context.generation,
                });
            }
            Err(_) => unreachable!("only cancellation stops recursive thumbnail generation"),
        }
        let processed = report.generated + report.cache_hits + report.failed;
        if processed == report.total || processed % 25 == 0 {
            emit_recursive_thumbnail_progress(
                &app,
                &context,
                "generating",
                &start,
                &report,
                processed,
            );
        }
    }
    let is_current = state
        .recursive_thumbnails
        .lock()
        .map_err(|_| "recursive thumbnail state poisoned")?
        .is_current(context.generation);
    if !is_current || cancellation.is_cancelled() {
        return Ok(Response::Cancelled {
            request_id: context.request_id,
            generation: context.generation,
        });
    }
    emit_recursive_thumbnail_progress(&app, &context, "completed", &start, &report, report.total);
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: report,
    })
}

fn record_recursive_thumbnail_result(
    report: &mut RecursiveThumbnailReport,
    result: Result<crate::state::ThumbnailResult, AppError>,
) -> Result<Option<String>, AppError> {
    match result {
        Ok(thumbnail) => {
            if thumbnail.cache_hit {
                report.cache_hits += 1;
            } else {
                report.generated += 1;
            }
            Ok(Some(thumbnail.content_hash))
        }
        Err(error) if error.code == ErrorCode::Cancelled => Err(error),
        Err(_) => {
            report.failed += 1;
            Ok(None)
        }
    }
}

async fn resolve_recursive_thumbnail_candidate(
    state: &AppState,
    root: &Path,
    candidate: &RelativePath,
    cancellation: &CancellationToken,
) -> Result<crate::state::ThumbnailResult, AppError> {
    loop {
        if cancellation.is_cancelled() {
            return Err(AppError::cancelled());
        }
        let pipelines = state.thumbnails.clone();
        let stores = state.store.clone();
        let thumbnail_pins = state.thumbnail_pins.clone();
        let worker_root = root.to_owned();
        let worker_candidate = candidate.clone();
        let worker_cancellation = cancellation.clone();
        let (sender, receiver) = tokio::sync::oneshot::channel();
        state
            .thumbnail_workers
            .submit(Priority::Background, cancellation.clone(), move || {
                let result = resolve_thumbnail(
                    &pipelines,
                    &stores,
                    &worker_root,
                    &worker_candidate,
                    false,
                    unix_millis(),
                );
                if worker_cancellation.is_cancelled() {
                    if let Ok(thumbnail) = &result {
                        thumbnail_pins.unpin(&thumbnail.content_hash);
                    }
                } else if let Err(result) = sender.send(result) {
                    if let Ok(thumbnail) = result {
                        thumbnail_pins.unpin(&thumbnail.content_hash);
                    }
                }
            })
            .map_err(|_| AppError::cancelled())?;
        match receiver.await {
            Ok(result) => return result,
            Err(_) if cancellation.is_cancelled() => return Err(AppError::cancelled()),
            Err(_) => tokio::task::yield_now().await,
        }
    }
}

fn emit_recursive_thumbnail_progress(
    app: &tauri::AppHandle,
    context: &RequestContext,
    phase: &str,
    start: &RelativePath,
    report: &RecursiveThumbnailReport,
    processed: usize,
) {
    let _ = app.emit(
        RECURSIVE_THUMBNAIL_PROGRESS_EVENT,
        RecursiveThumbnailProgress {
            generation: context.generation,
            phase: phase.into(),
            relative_path: start.as_str().into(),
            processed,
            total: report.total,
            generated: report.generated,
            cache_hits: report.cache_hits,
            failed: report.failed,
        },
    );
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

fn read_page_bytes(
    grant: &MediaGrant,
    target: &RelativePath,
) -> Result<(&'static str, Vec<u8>), AppError> {
    if grant.mime_type == "application/pdf" {
        let PageSource::File(path) = &grant.source else {
            return Err(AppError {
                code: ErrorCode::InvalidRequest,
                message: "PDF pages must be backed by a local PDF file.".into(),
                target: Some(target.clone()),
                retryable: false,
            });
        };
        return render_pdf_page(path, target)
            .map(|bytes| ("image/png", bytes))
            .map_err(|mut error| {
                error.target = Some(target.clone());
                error
            });
    }
    let result = read_grant_bytes(grant).and_then(|bytes| {
        let metadata = crate::catalog::inspect_image(&mut Cursor::new(&bytes), bytes.len() as u64)?;
        match metadata.format {
            ImageFormat::Bmp | ImageFormat::Tiff | ImageFormat::Ico => Ok((
                "image/png",
                crate::catalog::raster_delivery_png(&bytes, metadata.format)?,
            )),
            ImageFormat::Svg => {
                let (_, _, png) = crate::catalog::render_svg_png(&bytes, None)?;
                Ok(("image/png", png))
            }
            _ => Ok((grant.mime_type, bytes)),
        }
    });
    result.map_err(|mut error| {
        error.target = Some(target.clone());
        error
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FavoriteTarget {
    relative_path: RelativePath,
    kind: ItemKind,
    byte_size: Option<u64>,
    modified_ms: Option<u64>,
}

fn configured_library_root(state: &AppState) -> Result<Option<PathBuf>, String> {
    state
        .library_root
        .lock()
        .map(|root| root.clone())
        .map_err(|_| "state poisoned".into())
}

fn favorite_target(root: &Path, relative_path: &RelativePath) -> Result<FavoriteTarget, AppError> {
    let parent = relative_path
        .as_str()
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    let parent_path = RelativePath::parse(parent).map_err(|message| AppError {
        code: ErrorCode::InvalidPath,
        message: message.into(),
        target: Some(relative_path.clone()),
        retryable: false,
    })?;
    let entries = enumerate_folder(root, &root.join(parent_path.as_str()))?;
    let Some(entry) = entries
        .into_iter()
        .find(|entry| entry.relative_path.as_str() == relative_path.as_str())
    else {
        return Err(request_error(
            ErrorCode::NotFound,
            "Favorite target was not found in the library.",
        ));
    };
    if !favorite_kind(entry.kind) {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Only folders and comic items can be favorited.",
        ));
    }
    Ok(FavoriteTarget {
        relative_path: entry.relative_path,
        kind: entry.kind,
        byte_size: entry.byte_size,
        modified_ms: entry.modified_ms,
    })
}

fn favorite_kind(kind: ItemKind) -> bool {
    matches!(
        kind,
        ItemKind::Folder | ItemKind::ComicFolder | ItemKind::Archive | ItemKind::Pdf
    )
}

fn favorite_views(store: &StateStore, root: &Path) -> Result<Vec<FavoriteEntry>, AppError> {
    let records = store.list_favorites()?;
    if records.is_empty() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    enumerate_all_catalog_entries(root, root, &mut entries)?;
    Ok(records
        .iter()
        .map(|record| favorite_view(record, &entries))
        .collect())
}

fn enumerate_all_catalog_entries(
    root: &Path,
    directory: &Path,
    output: &mut Vec<crate::catalog::CatalogEntry>,
) -> Result<(), AppError> {
    let entries = enumerate_folder(root, directory)?;
    for entry in entries {
        let child_directory = entry.kind == ItemKind::Folder || entry.kind == ItemKind::ComicFolder;
        let child_path = root.join(entry.relative_path.as_str());
        output.push(entry);
        if child_directory {
            enumerate_all_catalog_entries(root, &child_path, output)?;
        }
    }
    Ok(())
}

fn favorite_view(
    record: &FavoriteRecord,
    entries: &[crate::catalog::CatalogEntry],
) -> FavoriteEntry {
    if let Some(current) = entries
        .iter()
        .find(|entry| entry.relative_path == record.relative_path && entry.kind == record.kind)
    {
        return FavoriteEntry {
            favorite_id: record.favorite_id.clone(),
            item_identity: record.item_identity.clone(),
            relative_path: record.relative_path.clone(),
            resolved_path: Some(current.relative_path.clone()),
            kind: Some(current.kind),
            status: FavoriteStatus::Available,
        };
    }

    let moved = moved_favorite_candidate(record, entries);
    let status = if moved.is_some() {
        FavoriteStatus::Moved
    } else {
        FavoriteStatus::Missing
    };
    FavoriteEntry {
        favorite_id: record.favorite_id.clone(),
        item_identity: record.item_identity.clone(),
        relative_path: record.relative_path.clone(),
        resolved_path: moved.map(|entry| entry.relative_path.clone()),
        kind: Some(record.kind),
        status,
    }
}

fn moved_favorite_candidate<'a>(
    record: &FavoriteRecord,
    entries: &'a [crate::catalog::CatalogEntry],
) -> Option<&'a crate::catalog::CatalogEntry> {
    let (Some(size_bytes), Some(modified_ms)) = (record.size_bytes, record.modified_ms) else {
        return None;
    };
    let name = record.relative_path.as_str().rsplit('/').next()?;
    let mut candidates = entries.iter().filter(|entry| {
        entry.kind == record.kind
            && entry.relative_path != record.relative_path
            && entry.relative_path.as_str().rsplit('/').next() == Some(name)
            && entry.byte_size == Some(size_bytes)
            && entry.modified_ms == Some(modified_ms)
    });
    let candidate = candidates.next()?;
    candidates.next().is_none().then_some(candidate)
}

fn strict_moved_favorite_resolve_target<'a>(
    record: &FavoriteRecord,
    entries: &'a [crate::catalog::CatalogEntry],
    requested: &FavoriteTarget,
) -> Result<&'a crate::catalog::CatalogEntry, AppError> {
    if entries
        .iter()
        .any(|entry| entry.relative_path == record.relative_path && entry.kind == record.kind)
    {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Favorite is still available at its stored path.",
        ));
    }
    let Some(candidate) = moved_favorite_candidate(record, entries) else {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Favorite resolution target is not the unique exact moved candidate.",
        ));
    };
    if candidate.relative_path != requested.relative_path
        || candidate.kind != requested.kind
        || candidate.byte_size != requested.byte_size
        || candidate.modified_ms != requested.modified_ms
    {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Favorite resolution target does not match the unique exact moved candidate.",
        ));
    }
    Ok(candidate)
}

fn enumerate_folder_port(
    root: &std::path::Path,
    directory: &std::path::Path,
    show_hidden: bool,
    cancellation: &CancellationToken,
) -> Result<Vec<CatalogEntry>, AppError> {
    if cancellation.is_cancelled() {
        return Err(AppError::cancelled());
    }
    let result = enumerate_folder_with_hidden(root, directory, show_hidden);
    if cancellation.is_cancelled() {
        Err(AppError::cancelled())
    } else {
        result
    }
}

fn reset_thumbnail_pins_for_navigation(pins: &ThumbnailPins) -> Result<(), AppError> {
    pins.clear()
}

fn resolve_watch_directory(root: &Path, relative: &RelativePath) -> Result<PathBuf, AppError> {
    let directory = root
        .join(relative.as_str())
        .canonicalize()
        .map_err(|source| {
            let code = match source.kind() {
                std::io::ErrorKind::NotFound => ErrorCode::NotFound,
                std::io::ErrorKind::PermissionDenied => ErrorCode::AccessDenied,
                _ => ErrorCode::InvalidPath,
            };
            request_error(code, "Current folder cannot be watched.")
        })?;
    if !directory.starts_with(root) || !directory.is_dir() {
        return Err(request_error(
            ErrorCode::InvalidPath,
            "Watch folder is outside the library root or is not a directory.",
        ));
    }
    Ok(directory)
}

const MAX_SEARCH_SOURCES: usize = 8;
const MAX_CROSS_SOURCE_RESULTS: usize = 50_000;

fn resolve_search_sources(
    state: &AppState,
    current_root: &Path,
    requested: &[String],
) -> Result<Vec<PathBuf>, AppError> {
    if requested.is_empty() {
        return Ok(vec![current_root.to_owned()]);
    }
    if requested.len() > MAX_SEARCH_SOURCES {
        return Err(request_error(
            ErrorCode::ResourceLimit,
            "Search accepts at most 8 sources.",
        ));
    }
    let approved = state
        .search_sources
        .lock()
        .map_err(|_| request_error(ErrorCode::Internal, "Search source state is unavailable."))?;
    resolve_approved_search_sources(current_root, requested, &approved)
}

fn resolve_approved_search_sources(
    current_root: &Path,
    requested: &[String],
    approved: &BTreeMap<String, PathBuf>,
) -> Result<Vec<PathBuf>, AppError> {
    if requested.is_empty() {
        return Ok(vec![current_root.to_owned()]);
    }
    if requested.len() > MAX_SEARCH_SOURCES {
        return Err(request_error(
            ErrorCode::ResourceLimit,
            "Search accepts at most 8 sources.",
        ));
    }
    let mut seen = HashSet::new();
    let mut sources = Vec::new();
    for requested_root in requested {
        let key = search_source_key(Path::new(requested_root));
        let Some(source) = approved.get(&key) else {
            return Err(request_error(
                ErrorCode::InvalidPath,
                "Search source was not approved by the folder picker.",
            ));
        };
        if seen.insert(key) {
            sources.push(source.clone());
        }
    }
    if sources.is_empty() {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Search requires at least one source.",
        ));
    }
    Ok(sources)
}

fn append_cross_source_result(
    combined: &mut Vec<SearchResultEntry>,
    seen: &mut HashSet<String>,
    source: &Path,
    source_root: &str,
    entry: CatalogEntry,
) -> Result<(), AppError> {
    let item_path = source.join(entry.relative_path.as_str());
    let canonical_item = item_path.canonicalize().unwrap_or(item_path);
    let key = library_root::display_path(&canonical_item).to_lowercase();
    if !seen.insert(key) {
        return Ok(());
    }
    if combined.len() >= MAX_CROSS_SOURCE_RESULTS {
        return Err(request_error(
            ErrorCode::ResourceLimit,
            "Search result limit exceeded across sources.",
        ));
    }
    combined.push(SearchResultEntry {
        entry,
        source_root: source_root.to_owned(),
    });
    Ok(())
}

fn search_library_sources_port(
    sources: &[PathBuf],
    query: &str,
    options: &SearchOptions,
    cancellation: &CancellationToken,
) -> Result<Vec<SearchResultEntry>, AppError> {
    if sources.is_empty() || sources.len() > MAX_SEARCH_SOURCES {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Search source count is invalid.",
        ));
    }
    let mut seen = HashSet::new();
    let mut combined = Vec::new();
    for source in sources {
        if cancellation.is_cancelled() {
            return Err(AppError::cancelled());
        }
        let source_root = library_root::display_path(source);
        for entry in search_library_with_options_port(source, query, options, cancellation)? {
            append_cross_source_result(&mut combined, &mut seen, source, &source_root, entry)?;
        }
    }
    Ok(combined)
}

fn search_library_port(
    root: &std::path::Path,
    query: &str,
    cancellation: &CancellationToken,
) -> Result<Vec<CatalogEntry>, AppError> {
    search_library_with_options_port(root, query, &SearchOptions::default(), cancellation)
}

fn search_library_with_options_port(
    root: &std::path::Path,
    query: &str,
    options: &SearchOptions,
    cancellation: &CancellationToken,
) -> Result<Vec<CatalogEntry>, AppError> {
    let expression = parse_search_query(query)
        .map_err(|error| request_error(ErrorCode::InvalidRequest, error.0))?;
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
    let directory = match options.fixed_location.as_deref() {
        Some(location) => {
            let relative = RelativePath::parse(location).map_err(|_| {
                request_error(ErrorCode::InvalidPath, "Search location is invalid.")
            })?;
            let directory = root.join(relative.as_str()).canonicalize().map_err(|_| {
                request_error(ErrorCode::InvalidPath, "Search location cannot be read.")
            })?;
            if !directory.starts_with(&root) || !directory.is_dir() {
                return Err(request_error(
                    ErrorCode::InvalidPath,
                    "Search location is outside the library root.",
                ));
            }
            directory
        }
        None => root.clone(),
    };
    let mut results = Vec::new();
    search_directory(
        &root,
        &directory,
        &expression,
        options,
        cancellation,
        &mut results,
    )?;
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
    query: &SearchExpression,
    options: &SearchOptions,
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
        if matches_search_query(query, name) && matches_search_options(&entry, options) {
            results.push(entry.clone());
        }
        if options.include_subfolders
            && matches!(entry.kind, ItemKind::Folder | ItemKind::ComicFolder)
        {
            search_directory(
                root,
                &root.join(entry.relative_path.as_str()),
                query,
                options,
                cancellation,
                results,
            )?;
        }
    }
    Ok(())
}

fn matches_search_options(entry: &CatalogEntry, options: &SearchOptions) -> bool {
    let folder = matches!(entry.kind, ItemKind::Folder | ItemKind::ComicFolder);
    if (folder && !options.include_folders) || (!folder && !options.include_files) {
        return false;
    }
    if let Some(minimum) = options.min_size_bytes {
        if entry.byte_size.map_or(true, |size| size < minimum) {
            return false;
        }
    }
    if let Some(maximum) = options.max_size_bytes {
        if entry.byte_size.map_or(true, |size| size > maximum) {
            return false;
        }
    }
    if let Some(after) = options.modified_after_ms {
        if entry.modified_ms.map_or(true, |modified| modified < after) {
            return false;
        }
    }
    if let Some(before) = options.modified_before_ms {
        if entry.modified_ms.map_or(true, |modified| modified > before) {
            return false;
        }
    }
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OpenItemKind {
    Folder,
    Archive,
    Image,
    Pdf,
}

fn contained_library_path(root: &Path, relative: &RelativePath) -> Result<PathBuf, AppError> {
    let safe_error = |code, message: &str, retryable| AppError {
        code,
        message: message.into(),
        target: Some(relative.clone()),
        retryable,
    };
    let canonical_root = root.canonicalize().map_err(|error| {
        let code = if error.kind() == std::io::ErrorKind::NotFound {
            ErrorCode::NotFound
        } else {
            ErrorCode::AccessDenied
        };
        safe_error(code, "The library root is unavailable.", true)
    })?;
    let candidate = root.join(relative.as_str());
    let canonical = candidate.canonicalize().map_err(|error| {
        let code = if error.kind() == std::io::ErrorKind::NotFound {
            ErrorCode::NotFound
        } else if error.kind() == std::io::ErrorKind::PermissionDenied {
            ErrorCode::AccessDenied
        } else {
            ErrorCode::InvalidPath
        };
        safe_error(code, "The requested library item is unavailable.", true)
    })?;
    if !canonical.starts_with(&canonical_root) {
        return Err(safe_error(
            ErrorCode::OutsideLibraryRoot,
            "The requested item is outside the registered library root.",
            false,
        ));
    }
    Ok(canonical)
}

fn open_item_kind(path: &Path, relative: &RelativePath) -> Result<OpenItemKind, AppError> {
    if path.is_dir() {
        return Ok(OpenItemKind::Folder);
    }
    if !path.is_file() {
        return Err(AppError {
            code: ErrorCode::InvalidPath,
            message: "The requested library item is not a file or folder.".into(),
            target: Some(relative.clone()),
            retryable: false,
        });
    }
    match classify_file_name(relative.as_str()) {
        FileKind::Archive => Ok(OpenItemKind::Archive),
        FileKind::Image => Ok(OpenItemKind::Image),
        FileKind::Pdf => Ok(OpenItemKind::Pdf),
        FileKind::Unsupported => Err(AppError {
            code: ErrorCode::UnsupportedFormat,
            message: "The selected file format is not supported by the viewer.".into(),
            target: Some(relative.clone()),
            retryable: false,
        }),
    }
}

fn enumerate_pages_port(
    root: &std::path::Path,
    item: &std::path::Path,
    item_relative: &RelativePath,
    kind: OpenItemKind,
    show_hidden: bool,
    cancellation: &CancellationToken,
) -> Result<Vec<RelativePath>, AppError> {
    if cancellation.is_cancelled() {
        return Err(AppError::cancelled());
    }
    let result = match kind {
        OpenItemKind::Archive => enumerate_archive_pages(item),
        OpenItemKind::Folder => enumerate_folder_pages_with_hidden(root, item, show_hidden),
        OpenItemKind::Image => {
            let mut file = std::fs::File::open(item).map_err(|error| AppError {
                code: if error.kind() == std::io::ErrorKind::NotFound {
                    ErrorCode::NotFound
                } else {
                    ErrorCode::AccessDenied
                },
                message: "The selected image could not be opened.".into(),
                target: Some(item_relative.clone()),
                retryable: true,
            })?;
            let byte_size = file
                .metadata()
                .map_err(|_| AppError {
                    code: ErrorCode::AccessDenied,
                    message: "The selected image metadata could not be read.".into(),
                    target: Some(item_relative.clone()),
                    retryable: true,
                })?
                .len();
            crate::catalog::inspect_image(&mut file, byte_size).map_err(|mut error| {
                error.target = Some(item_relative.clone());
                error
            })?;
            Ok(vec![item_relative.clone()])
        }
        OpenItemKind::Pdf => enumerate_pdf_pages(item),
    };
    if cancellation.is_cancelled() {
        Err(AppError::cancelled())
    } else {
        result
    }
}

fn viewer_item_for_opened_image(
    item: PathBuf,
    item_relative: RelativePath,
    kind: OpenItemKind,
) -> Result<(PathBuf, RelativePath, OpenItemKind, Option<RelativePath>), AppError> {
    if kind != OpenItemKind::Image {
        return Ok((item, item_relative, kind, None));
    }
    let parent = item
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| AppError {
            code: ErrorCode::InvalidPath,
            message: "The selected image has no readable parent folder.".into(),
            target: Some(item_relative.clone()),
            retryable: false,
        })?;
    let parent_relative = item_relative
        .as_str()
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    Ok((
        parent,
        RelativePath::parse(parent_relative).map_err(|_| AppError {
            code: ErrorCode::InvalidPath,
            message: "The selected image parent folder is invalid.".into(),
            target: Some(item_relative.clone()),
            retryable: false,
        })?,
        OpenItemKind::Folder,
        Some(item_relative),
    ))
}

fn viewer_start_index(
    requested_page: Option<&RelativePath>,
    saved_position: Option<&crate::state::ReadingPosition>,
    pages: &[RelativePath],
) -> usize {
    requested_page
        .and_then(|requested| pages.iter().position(|page| page == requested))
        .or_else(|| crate::state::resolve_reading_position(saved_position, pages))
        .unwrap_or(0)
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
) -> Result<Response<Vec<TreeEntry>>, String> {
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
    let (show_hidden, confirm_children) = state
        .store
        .lock()
        .map_err(|_| "state poisoned")?
        .as_ref()
        .and_then(|store| store.load_settings().ok())
        .map(|settings| (settings.show_hidden_files, settings.tree_confirm_children))
        .unwrap_or((false, true));
    let result = tauri::async_runtime::spawn_blocking(move || {
        enumerate_tree_children(&root, &requested_directory, show_hidden, confirm_children)
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
pub fn resolve_catalog_activation(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    kind: ItemKind,
    trigger: String,
) -> Result<Response<String>, String> {
    if let Err(error) = validate_request(&state, &context) {
        return Ok(error_response(&context, error));
    }
    let settings = state
        .store
        .lock()
        .map_err(|_| "state poisoned")?
        .as_ref()
        .map(|store| store.load_settings())
        .transpose();
    let settings = match settings {
        Ok(Some(settings)) => settings,
        Ok(None) => crate::state::Settings::default(),
        Err(error) => return Ok(error_response(&context, error)),
    };
    let action = match catalog_activation_action(kind, &trigger, &settings) {
        Ok(action) => action,
        Err(error) => return Ok(error_response(&context, error)),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: action.into(),
    })
}

fn catalog_activation_action(
    kind: ItemKind,
    trigger: &str,
    settings: &crate::state::Settings,
) -> Result<&'static str, AppError> {
    if !matches!(trigger, "doubleClick" | "enter" | "ctrlEnter") {
        return Err(request_error(
            ErrorCode::InvalidRequest,
            "Catalog activation trigger is invalid.",
        ));
    }
    if trigger == "ctrlEnter" {
        return Ok(match kind {
            ItemKind::Page | ItemKind::Archive | ItemKind::Pdf => "read",
            _ => "none",
        });
    }
    Ok(match kind {
        ItemKind::Folder | ItemKind::ComicFolder => match settings.folder_open_rule.as_str() {
            "read" => "read",
            "none" => "none",
            _ => "navigate",
        },
        ItemKind::Page => match settings.image_open_rule.as_str() {
            "none" => "none",
            _ => "read",
        },
        ItemKind::Archive | ItemKind::Pdf => match settings.archive_open_rule.as_str() {
            "none" => "none",
            _ => "read",
        },
        ItemKind::Unsupported => "none",
    })
}

fn enumerate_tree_children(
    root: &Path,
    requested_directory: &Path,
    show_hidden: bool,
    confirm_children: bool,
) -> Result<Vec<TreeEntry>, AppError> {
    enumerate_folder_with_hidden(root, requested_directory, show_hidden).and_then(|entries| {
        entries
            .into_iter()
            .filter(|entry| {
                matches!(
                    entry.kind,
                    crate::domain::ItemKind::Folder | crate::domain::ItemKind::ComicFolder
                )
            })
            .map(|entry| {
                let has_children = if confirm_children {
                    has_child_folder_with_hidden(
                        root,
                        &root.join(entry.relative_path.as_str()),
                        show_hidden,
                    )
                    .ok()
                } else {
                    None
                };
                Ok(TreeEntry {
                    relative_path: entry.relative_path,
                    has_children,
                })
            })
            .collect()
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
pub fn cancel_library_diagnostics(
    state: tauri::State<'_, AppState>,
    request_id: RequestId,
    generation: Generation,
) -> Result<Response<()>, String> {
    state
        .diagnostics
        .lock()
        .map_err(|_| "state poisoned")?
        .cancel(generation);
    Ok(Response::Cancelled {
        request_id,
        generation,
    })
}

#[tauri::command]
pub fn cancel_recursive_thumbnail_generation(
    state: tauri::State<'_, AppState>,
    request_id: RequestId,
    generation: Generation,
) -> Result<Response<()>, String> {
    state
        .recursive_thumbnails
        .lock()
        .map_err(|_| "recursive thumbnail state poisoned")?
        .cancel(generation);
    Ok(Response::Cancelled {
        request_id,
        generation,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ComicOpenHistoryBoundary {
    Success {
        page_count: usize,
        generation_current: bool,
    },
    Failed,
    Cancelled,
}

fn record_history_at_open_boundary(
    store: Option<&StateStore>,
    item_identity: &RelativePath,
    boundary: ComicOpenHistoryBoundary,
    last_viewed_at_ms: i64,
) -> Result<(), AppError> {
    if let (
        Some(store),
        ComicOpenHistoryBoundary::Success {
            page_count,
            generation_current: true,
        },
    ) = (store, boundary)
    {
        if page_count > 0 {
            store.record_reading_history(item_identity.as_str(), last_viewed_at_ms)?;
        }
    }
    Ok(())
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
    let item_path = match contained_library_path(&root, &item_relative) {
        Ok(path) => path,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let show_hidden = state
        .store
        .lock()
        .map_err(|_| "state poisoned")?
        .as_ref()
        .and_then(|store| store.load_settings().ok())
        .is_some_and(|settings| settings.show_hidden_files);
    let item_kind = match open_item_kind(&item_path, &item_relative) {
        Ok(kind) => kind,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let (item_path, item_relative, item_kind, requested_page) =
        match viewer_item_for_opened_image(item_path, item_relative, item_kind) {
            Ok(target) => target,
            Err(error) => return Ok(error_response(&context, error)),
        };
    let worker_root = root.clone();
    let worker_item = item_path.clone();
    let worker_relative = item_relative.clone();
    let page_paths = tauri::async_runtime::spawn_blocking(move || {
        enumerate_pages_port(
            &worker_root,
            &worker_item,
            &worker_relative,
            item_kind,
            show_hidden,
            &viewer_cancellation,
        )
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

    let boundary = ComicOpenHistoryBoundary::Success {
        page_count: page_paths.len(),
        generation_current: true,
    };
    if let Some(store) = state.store.lock().map_err(|_| "state poisoned")?.as_ref() {
        record_history_at_open_boundary(Some(store), &item_relative, boundary, unix_millis())
            .map_err(|error| error.message)?;
    }

    let saved_position = state
        .store
        .lock()
        .map_err(|_| "state poisoned")?
        .as_ref()
        .and_then(|store| {
            store
                .reading_position(item_relative.as_str())
                .ok()
                .flatten()
        });
    let start_index = viewer_start_index(
        requested_page.as_ref(),
        saved_position.as_ref(),
        &page_paths,
    );

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

    let display_name = if item_relative.as_str().is_empty() {
        "画像フォルダ".into()
    } else {
        item_relative
            .as_str()
            .rsplit('/')
            .next()
            .unwrap_or(item_relative.as_str())
            .into()
    };
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

fn viewer_page_grant(
    root: &std::path::Path,
    item: &RelativePath,
    page: &RelativePath,
) -> Result<MediaGrant, AppError> {
    let is_archive = classify_file_name(item.as_str()) == FileKind::Archive;
    let is_pdf = classify_file_name(item.as_str()) == FileKind::Pdf;
    let source = if is_archive {
        let archive = contained_library_path(root, item)?;
        if !archive.is_file() {
            return Err(request_error(
                ErrorCode::InvalidPath,
                "Archive path is not a file.",
            ));
        }
        PageSource::ArchiveEntry {
            archive,
            entry: page.as_str().into(),
        }
    } else {
        let source_path = if is_pdf { item } else { page };
        let file = contained_library_path(root, source_path)?;
        if !file.is_file() {
            return Err(request_error(
                ErrorCode::InvalidPath,
                if is_pdf {
                    "PDF path is not a file."
                } else {
                    "Page path is not a file."
                },
            ));
        }
        PageSource::File(file)
    };
    Ok(MediaGrant {
        page_id: page_id_for(item.as_str(), page.as_str()),
        mime_type: if is_pdf {
            "application/pdf"
        } else {
            page_mime_type(page)
        },
        max_bytes: MAX_IMAGE_BYTES,
        source,
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
    let prefetch_memory_mib = state
        .store
        .lock()
        .map_err(|_| "state poisoned")?
        .as_ref()
        .and_then(|store| store.load_settings().ok())
        .map(|settings| prefetch_memory_mib(&settings))
        .unwrap_or(DEFAULT_PREFETCH_MEMORY_MIB);
    let item = RelativePath::parse(item_relative_path).map_err(str::to_string)?;
    let page = RelativePath::parse(page_relative_path).map_err(str::to_string)?;
    let root = state
        .library_root
        .lock()
        .map_err(|_| "state poisoned")?
        .clone()
        .ok_or_else(|| "library root is not configured".to_string())?;
    let grant = match viewer_page_grant(&root, &item, &page) {
        Ok(grant) => grant,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let page_id = grant.page_id.clone();
    let cancellation = state
        .viewer
        .lock()
        .map_err(|_| "state poisoned")?
        .cancellation_for(context.generation);
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let worker_page = page.clone();
    if state
        .page_workers
        .submit(priority.into(), cancellation.clone(), move || {
            let result = read_page_bytes(&grant, &worker_page)
                .map(|(delivered_mime_type, bytes)| (grant, delivered_mime_type, bytes));
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
    let (grant, delivered_mime_type, bytes) = match result {
        Ok(value) => value,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let token = state
        .media
        .lock()
        .map_err(|_| "state poisoned")?
        .issue_bounded(
            MediaGrant {
                mime_type: delivered_mime_type,
                source: PageSource::Memory(bytes),
                ..grant
            },
            u64::from(prefetch_memory_mib) * 1024 * 1024,
        );
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: PageResponse {
            page_id,
            media_uri: media_uri(&token),
        },
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardImageResult {
    pub page_relative_path: RelativePath,
    pub width: u32,
    pub height: u32,
    pub payload_bytes: usize,
}

#[cfg(target_os = "windows")]
fn decode_clipboard_bgra(bytes: &[u8]) -> Result<(u32, u32, Vec<u8>), AppError> {
    crate::catalog::decode_wic_bgra(bytes)
}

#[cfg(not(target_os = "windows"))]
fn decode_clipboard_bgra(_bytes: &[u8]) -> Result<(u32, u32, Vec<u8>), AppError> {
    Err(request_error(
        ErrorCode::UnsupportedFormat,
        "Image clipboard operations are available only on Windows.",
    ))
}

#[tauri::command]
pub async fn copy_viewer_page_to_clipboard(
    state: tauri::State<'_, AppState>,
    context: RequestContext,
    item_relative_path: String,
    page_relative_path: String,
) -> Result<Response<ClipboardImageResult>, String> {
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
    let grant = match viewer_page_grant(&root, &item, &page) {
        Ok(grant) => grant,
        Err(error) => return Ok(error_response(&context, error)),
    };
    let worker_page = page.clone();
    let decoded = tauri::async_runtime::spawn_blocking(move || {
        let (_, bytes) = read_page_bytes(&grant, &worker_page)?;
        decode_clipboard_bgra(&bytes)
    })
    .await
    .map_err(|error| format!("image clipboard decode worker failed: {error}"))?;
    let (width, height, bgra) = match decoded {
        Ok(decoded) => decoded,
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
    let payload_bytes = match tauri::async_runtime::spawn_blocking(move || {
        file_operations::write_image_clipboard(width, height, &bgra)
    })
    .await
    .map_err(|error| format!("image clipboard worker failed: {error}"))?
    {
        Ok(bytes) => bytes,
        Err(error) => return Ok(error_response(&context, error)),
    };
    Ok(Response::Ok {
        request_id: context.request_id,
        generation: context.generation,
        data: ClipboardImageResult {
            page_relative_path: page,
            width,
            height,
            payload_bytes,
        },
    })
}

fn page_mime_type(page: &RelativePath) -> &'static str {
    match page
        .as_str()
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("bmp") => "image/bmp",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("tif" | "tiff") => "image/tiff",
        Some("ico") => "image/x-icon",
        Some("svg") => "image/svg+xml",
        Some("avif") => "image/avif",
        _ => "image/jpeg",
    }
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
    fn supported_images_use_exact_source_media_types_before_safe_transcoding() {
        assert_eq!(
            page_mime_type(&RelativePath::parse("chapter/00.BMP").unwrap()),
            "image/bmp"
        );
        assert_eq!(
            page_mime_type(&RelativePath::parse("chapter/01.WEBP").unwrap()),
            "image/webp"
        );
        assert_eq!(
            page_mime_type(&RelativePath::parse("chapter/02.GIF").unwrap()),
            "image/gif"
        );
        assert_eq!(
            page_mime_type(&RelativePath::parse("chapter/03.AVIF").unwrap()),
            "image/avif"
        );
        assert_eq!(
            page_mime_type(&RelativePath::parse("chapter/04.TIFF").unwrap()),
            "image/tiff"
        );
        assert_eq!(
            page_mime_type(&RelativePath::parse("chapter/05.ICO").unwrap()),
            "image/x-icon"
        );
        assert_eq!(
            page_mime_type(&RelativePath::parse("chapter/06.SVG").unwrap()),
            "image/svg+xml"
        );
    }

    #[test]
    fn shortcut_validation_accepts_default_and_modified_plus_bindings() {
        assert_eq!(
            normalize_shortcuts(&default_shortcuts()),
            Some(default_shortcuts())
        );
        assert!(valid_shortcut_key("+"));
        assert!(valid_shortcut_key("Ctrl++"));
        assert!(!valid_shortcut_key("Ctrl+++"));

        let mut multiple = default_shortcuts();
        multiple.get_mut("nextPage").unwrap().extend([
            "N".into(),
            "Ctrl+N".into(),
            "Shift+N".into(),
        ]);
        assert_eq!(normalize_shortcuts(&multiple), Some(multiple.clone()));

        let mut too_many = multiple.clone();
        too_many.get_mut("nextPage").unwrap().push("Alt+N".into());
        assert!(normalize_shortcuts(&too_many).is_none());

        let mut same_command_duplicate = multiple.clone();
        same_command_duplicate.get_mut("nextPage").unwrap()[1] = "PageDown".into();
        assert!(normalize_shortcuts(&same_command_duplicate).is_none());

        let mut cross_command_conflict = multiple.clone();
        cross_command_conflict
            .get_mut("previousPage")
            .unwrap()
            .push("N".into());
        assert!(normalize_shortcuts(&cross_command_conflict).is_none());

        let mut reserved = default_shortcuts();
        reserved.insert("nextPage".into(), vec!["Ctrl+C".into()]);
        assert!(normalize_shortcuts(&reserved).is_none());

        let mut empty = default_shortcuts();
        empty.insert("nextPage".into(), Vec::new());
        assert!(normalize_shortcuts(&empty).is_none());
    }

    #[test]
    fn catalog_view_mode_defaults_to_cover_list_for_missing_or_unknown_values() {
        let mut settings = crate::state::Settings::default();
        assert_eq!(catalog_view_mode(&settings), "cover_list");

        settings.catalog_view_mode = "detail_list".into();
        assert_eq!(catalog_view_mode(&settings), "detail_list");

        settings.catalog_view_mode = "reference_tile".into();
        assert_eq!(catalog_view_mode(&settings), "reference_tile");

        settings.catalog_view_mode = "card_grid".into();
        assert_eq!(catalog_view_mode(&settings), "card_grid");

        settings.catalog_view_mode = "not-a-mode".into();
        assert_eq!(catalog_view_mode(&settings), "cover_list");
    }

    #[test]
    fn req_ley_p2_004_viewer_mode_accepts_auto_and_defaults_invalid_values() {
        let mut settings = crate::state::Settings::default();
        assert_eq!(viewer_view_mode(&settings), "single");
        settings.view_mode = "auto".into();
        assert_eq!(viewer_view_mode(&settings), "auto");
        settings.view_mode = "spread".into();
        assert_eq!(viewer_view_mode(&settings), "spread");
        settings.view_mode = "unexpected".into();
        assert_eq!(viewer_view_mode(&settings), "single");
    }

    #[test]
    fn req_ley_p2_005_spread_rules_normalize_persisted_values() {
        let mut settings = crate::state::Settings::default();
        assert_eq!(
            spread_percent(
                &settings.spread_portrait_max_aspect_percent,
                MIN_PORTRAIT_ASPECT_PERCENT,
                MAX_PORTRAIT_ASPECT_PERCENT,
                100,
            ),
            100
        );
        assert_eq!(spread_pairing(&settings), "continuous");
        settings.spread_portrait_max_aspect_percent = "82".into();
        settings.auto_spread_min_viewport_aspect_percent = "160".into();
        settings.spread_pairing = "even".into();
        assert_eq!(
            spread_percent(
                &settings.spread_portrait_max_aspect_percent,
                MIN_PORTRAIT_ASPECT_PERCENT,
                MAX_PORTRAIT_ASPECT_PERCENT,
                100,
            ),
            82
        );
        assert_eq!(spread_pairing(&settings), "even");
        settings.spread_portrait_max_aspect_percent = "101".into();
        settings.auto_spread_min_viewport_aspect_percent = "invalid".into();
        settings.spread_pairing = "alternating".into();
        assert_eq!(
            spread_percent(
                &settings.spread_portrait_max_aspect_percent,
                MIN_PORTRAIT_ASPECT_PERCENT,
                MAX_PORTRAIT_ASPECT_PERCENT,
                100,
            ),
            100
        );
        assert_eq!(
            spread_percent(
                &settings.auto_spread_min_viewport_aspect_percent,
                MIN_AUTO_VIEWPORT_ASPECT_PERCENT,
                MAX_AUTO_VIEWPORT_ASPECT_PERCENT,
                125,
            ),
            125
        );
        assert_eq!(spread_pairing(&settings), "continuous");
    }

    #[test]
    fn req_ley_p2_006_fit_basis_defaults_invalid_persisted_values() {
        let mut settings = crate::state::Settings::default();
        assert_eq!(fit_basis(&settings), "spread");
        settings.fit_basis = "page".into();
        assert_eq!(fit_basis(&settings), "page");
        settings.fit_basis = "viewport-width".into();
        assert_eq!(fit_basis(&settings), "spread");
    }

    #[test]
    fn req_ley_p2_007_and_p3_012_scroll_preferences_default_and_bound_persisted_values() {
        let mut settings = crate::state::Settings::default();
        assert_eq!(scroll_step_percent(&settings), 90);
        assert_eq!(key_scroll_acceleration_percent(&settings), 150);
        assert!(settings.key_scroll_continuous);
        assert_eq!(wheel_scroll_factor(&settings), 1.0);
        settings.scroll_step_percent = "75".into();
        settings.key_scroll_acceleration_percent = "220".into();
        settings.key_scroll_continuous = false;
        settings.wheel_scroll_factor = "1.4".into();
        assert_eq!(scroll_step_percent(&settings), 75);
        assert_eq!(key_scroll_acceleration_percent(&settings), 220);
        assert!(!settings.key_scroll_continuous);
        assert_eq!(wheel_scroll_factor(&settings), 1.4);
        settings.scroll_step_percent = "101".into();
        settings.key_scroll_acceleration_percent = "301".into();
        settings.wheel_scroll_factor = "NaN".into();
        assert_eq!(scroll_step_percent(&settings), 90);
        assert_eq!(key_scroll_acceleration_percent(&settings), 150);
        assert_eq!(wheel_scroll_factor(&settings), 1.0);
    }

    #[test]
    fn req_ley_p2_008_page_scan_mode_defaults_invalid_persisted_values() {
        let mut settings = crate::state::Settings::default();
        assert_eq!(page_scan_mode(&settings), "vertical");
        settings.page_scan_mode = "n".into();
        assert_eq!(page_scan_mode(&settings), "n");
        settings.page_scan_mode = "z".into();
        assert_eq!(page_scan_mode(&settings), "z");
        settings.page_scan_mode = "diagonal".into();
        assert_eq!(page_scan_mode(&settings), "vertical");
    }

    #[test]
    fn req_ley_p2_009_loupe_preferences_default_and_bound_persisted_values() {
        let mut settings = crate::state::Settings::default();
        assert_eq!(loupe_size(&settings), 180);
        assert_eq!(loupe_zoom(&settings), 2.0);
        settings.loupe_size = "240".into();
        settings.loupe_zoom = "3.5".into();
        assert_eq!(loupe_size(&settings), 240);
        assert_eq!(loupe_zoom(&settings), 3.5);
        settings.loupe_size = "401".into();
        settings.loupe_zoom = "NaN".into();
        assert_eq!(loupe_size(&settings), 180);
        assert_eq!(loupe_zoom(&settings), 2.0);
    }

    #[test]
    fn req_ley_p2_010_prefetch_preferences_default_and_bound_persisted_values() {
        let mut settings = crate::state::Settings::default();
        assert_eq!(
            prefetch_page_count(&settings.prefetch_ahead, DEFAULT_PREFETCH_AHEAD),
            4
        );
        assert_eq!(
            prefetch_page_count(&settings.prefetch_behind, DEFAULT_PREFETCH_BEHIND),
            0
        );
        assert_eq!(prefetch_memory_mib(&settings), 256);
        settings.prefetch_ahead = "3".into();
        settings.prefetch_behind = "2".into();
        settings.prefetch_memory_mib = "192".into();
        assert_eq!(
            prefetch_page_count(&settings.prefetch_ahead, DEFAULT_PREFETCH_AHEAD),
            3
        );
        assert_eq!(
            prefetch_page_count(&settings.prefetch_behind, DEFAULT_PREFETCH_BEHIND),
            2
        );
        assert_eq!(prefetch_memory_mib(&settings), 192);
        settings.prefetch_ahead = "5".into();
        settings.prefetch_behind = "invalid".into();
        settings.prefetch_memory_mib = "8".into();
        assert_eq!(
            prefetch_page_count(&settings.prefetch_ahead, DEFAULT_PREFETCH_AHEAD),
            4
        );
        assert_eq!(
            prefetch_page_count(&settings.prefetch_behind, DEFAULT_PREFETCH_BEHIND),
            0
        );
        assert_eq!(prefetch_memory_mib(&settings), 256);
    }

    #[test]
    fn catalog_thumbnail_sizes_use_valid_persisted_values_and_safe_defaults() {
        let mut settings = crate::state::Settings::default();
        assert_eq!(
            catalog_thumbnail_sizes(&settings),
            DEFAULT_CATALOG_THUMBNAIL_SIZES
        );

        settings.small_thumbnail_size = "160".into();
        settings.cover_list_thumbnail_size = "192".into();
        settings.card_grid_thumbnail_size = "224".into();
        settings.reference_tile_thumbnail_size = "176".into();
        assert_eq!(
            catalog_thumbnail_sizes(&settings),
            CatalogThumbnailSizes {
                small_thumbnail: 160,
                cover_list: 192,
                card_grid: 224,
                reference_tile: 176,
            }
        );

        settings.small_thumbnail_size = "63".into();
        settings.cover_list_thumbnail_size = "invalid".into();
        settings.card_grid_thumbnail_size = "321".into();
        settings.reference_tile_thumbnail_size = "321".into();
        assert_eq!(
            catalog_thumbnail_sizes(&settings),
            DEFAULT_CATALOG_THUMBNAIL_SIZES
        );
    }

    #[test]
    fn fr_b19_and_req_ley_p3_013_settings_profile_validates_all_atomic_bindings() {
        let mut profile = SettingsProfileInput {
            sort_field: "name".into(),
            sort_descending: false,
            end_of_volume_policy: "auto_next".into(),
            catalog_view_mode: "card_grid".into(),
            catalog_thumbnail_sizes: CatalogThumbnailSizes {
                small_thumbnail: 104,
                cover_list: 144,
                card_grid: 216,
                reference_tile: 128,
            },
            view_mode: "single".into(),
            spread_portrait_max_aspect_percent: 100,
            auto_spread_min_viewport_aspect_percent: 125,
            spread_first_page_single: false,
            spread_pairing: "continuous".into(),
            fit_allow_upscale: false,
            fit_basis: "spread".into(),
            fit_include_page_margin: true,
            layout_mode: "paged".into(),
            reading_direction: "rightToLeft".into(),
            scale_mode: "fit".into(),
            scale: 1.0,
            loupe_enabled: false,
            loupe_size: 180,
            loupe_zoom: 2.0,
            prefetch_ahead: 4,
            prefetch_behind: 0,
            prefetch_memory_mib: 256,
            fullscreen_escape_behavior: "exitFullscreen".into(),
            prevent_display_sleep_fullscreen: false,
            tray_store_on_minimize: false,
            tray_close_behavior: "quit".into(),
            tray_restore_gesture: "singleClick".into(),
            slideshow_interval_ms: 3_000,
            slideshow_order: "forward".into(),
            slideshow_repeat_current_item: false,
            viewer_catalog_selection_sync: true,
            viewer_background: "checker".into(),
            viewer_page_margin: 0,
            viewer_spread_gap: 8,
            cursor_auto_hide_ms: 0,
            zoom_retention: "global".into(),
            viewer_grid_enabled: false,
            viewer_grid_size: 32,
            viewer_grid_color: "light".into(),
            pan_factor: 1.0,
            wheel_dead_zone: 0,
            scroll_step_percent: 90,
            key_scroll_acceleration_percent: 150,
            key_scroll_continuous: true,
            wheel_scroll_factor: 1.0,
            smooth_scroll: true,
            page_scan_mode: "vertical".into(),
            tree_visible: false,
            tree_auto_collapse: true,
            tree_confirm_children: true,
            tree_width: 320,
            folder_open_rule: "navigate".into(),
            image_open_rule: "read".into(),
            archive_open_rule: "read".into(),
            detail_grid_lines: "none".into(),
            detail_row_density: "standard".into(),
            detail_show_kind: true,
            detail_show_size: true,
            detail_show_modified: true,
            menu_bar_visible: true,
            toolbar_visible: false,
            address_bar_visible: true,
            status_bar_visible: true,
            always_on_top: false,
            navigation_selection_policy: "restore".into(),
            thumbnail_generation_scope: "near".into(),
            startup_location: "last".into(),
            show_hidden_files: false,
            catalog_palette: "system".into(),
            restore_last_viewer: false,
            auto_refresh_current_folder: true,
            shortcuts: default_shortcuts(),
            catalog_mouse_bindings: default_catalog_mouse_bindings(),
            mouse_gestures: default_mouse_gestures(),
        };
        let (shortcuts, catalog_mouse, gestures) = validate_settings_profile(&profile).unwrap();
        assert_eq!(shortcuts, profile.shortcuts);
        assert_eq!(catalog_mouse, profile.catalog_mouse_bindings);
        assert_eq!(gestures, profile.mouse_gestures);
        profile.detail_grid_lines = "vertical".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.detail_grid_lines = "both".into();
        profile.detail_row_density = "tiny".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.detail_row_density = "compact".into();
        validate_settings_profile(&profile).unwrap();
        let json = serde_json::to_value(&profile).unwrap();
        assert_eq!(json["prefetchMemoryMiB"], 256);
        assert!(json.get("prefetchMemoryMib").is_none());
        assert_eq!(
            serde_json::from_value::<SettingsProfileInput>(json)
                .unwrap()
                .prefetch_memory_mib,
            256
        );
        profile.slideshow_interval_ms = 499;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.slideshow_interval_ms = 3_000;
        profile.slideshow_order = "shuffleForever".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.slideshow_order = "random".into();

        profile.catalog_thumbnail_sizes.small_thumbnail = 63;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.catalog_thumbnail_sizes.small_thumbnail = 104;

        profile.viewer_page_margin = 65;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.viewer_page_margin = 0;
        profile.viewer_background = "transparent".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.viewer_background = "checker".into();
        profile.cursor_auto_hide_ms = 4_000;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.cursor_auto_hide_ms = 2_000;

        profile.spread_portrait_max_aspect_percent = 49;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.spread_portrait_max_aspect_percent = 100;
        profile.auto_spread_min_viewport_aspect_percent = 301;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.auto_spread_min_viewport_aspect_percent = 125;
        profile.spread_pairing = "alternating".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.spread_pairing = "even".into();
        profile.fit_basis = "viewport".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.fit_basis = "page".into();
        profile.loupe_size = 79;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.loupe_size = 240;
        profile.loupe_zoom = 8.01;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.loupe_zoom = 3.5;
        profile.prefetch_ahead = 5;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.prefetch_ahead = 3;
        profile.prefetch_memory_mib = 8;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.prefetch_memory_mib = 192;
        profile.tray_close_behavior = "ask".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.tray_close_behavior = "store".into();
        profile.tray_restore_gesture = "middleClick".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.tray_restore_gesture = "doubleClick".into();
        profile.scroll_step_percent = 9;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.scroll_step_percent = 75;
        profile.key_scroll_acceleration_percent = 99;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.key_scroll_acceleration_percent = 220;
        profile.wheel_scroll_factor = 2.01;
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.wheel_scroll_factor = 1.4;
        profile.page_scan_mode = "spiral".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.page_scan_mode = "z".into();

        profile.navigation_selection_policy = "middle".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.navigation_selection_policy = "restore".into();

        profile.catalog_palette = "custom".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.catalog_palette = "system".into();
        profile.thumbnail_generation_scope = "unlimited".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.thumbnail_generation_scope = "near".into();
        profile.startup_location = "desktop".into();
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.startup_location = "last".into();

        profile
            .mouse_gestures
            .insert("doubleClick".into(), "nextPage".into());
        profile
            .mouse_gestures
            .insert("middleClick".into(), "nextPage".into());
        let (_, _, gestures) = validate_settings_profile(&profile).unwrap();
        assert_eq!(gestures["doubleClick"], "toggleFullscreen");
        assert_eq!(gestures["middleClick"], "nextPage");

        profile
            .mouse_gestures
            .insert("middleClick".into(), "openSelected".into());
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.mouse_gestures = default_mouse_gestures();
        profile
            .catalog_mouse_bindings
            .insert("middleClick".into(), "delete".into());
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
        profile.catalog_mouse_bindings = default_catalog_mouse_bindings();
        profile
            .catalog_mouse_bindings
            .insert("unknownButton".into(), "none".into());
        assert_eq!(
            validate_settings_profile(&profile).unwrap_err().code,
            ErrorCode::InvalidRequest
        );
    }

    #[test]
    fn fr_b11_shortcut_migrates_exact_legacy_input_maps_with_new_defaults() {
        let mut legacy_shortcuts = default_shortcuts()
            .into_iter()
            .filter(|(command, _)| LEGACY_SHORTCUT_COMMANDS.contains(&command.as_str()))
            .collect::<BTreeMap<_, _>>();
        legacy_shortcuts.insert("nextPage".into(), vec!["F11".into()]);
        legacy_shortcuts.insert("previousPage".into(), vec!["Ctrl+F".into()]);
        let legacy_gestures = default_mouse_gestures()
            .into_iter()
            .filter(|(gesture, _)| LEGACY_MOUSE_GESTURE_NAMES.contains(&gesture.as_str()))
            .collect::<BTreeMap<_, _>>();

        let shortcuts = normalize_shortcuts(&legacy_shortcuts).unwrap();
        assert_eq!(shortcuts.len(), SHORTCUT_COMMANDS.len());
        assert_eq!(shortcuts["nextPage"], ["F11"]);
        assert_eq!(shortcuts["previousPage"], ["Ctrl+F"]);
        assert_eq!(shortcuts["toggleLoupe"], ["L"]);
        assert_ne!(shortcuts["toggleSearch"], ["Ctrl+F"]);
        assert_ne!(shortcuts["toggleFullscreen"], ["F11"]);

        let gestures = normalize_mouse_gestures(&legacy_gestures).unwrap();
        assert_eq!(gestures.len(), MOUSE_GESTURE_NAMES.len());
        assert_eq!(gestures["middleClick"], "none");
        assert_eq!(gestures["rightWheelUp"], "zoomIn");
        assert_eq!(gestures["doubleClick"], "toggleFullscreen");
    }

    #[test]
    fn opened_image_uses_its_parent_folder_as_the_viewer_item() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-image-folder-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        let folder = root.join("volume");
        std::fs::create_dir_all(&folder).unwrap();
        let mut jpeg = vec![
            0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x00, 0x01, 0x00, 0x01,
        ];
        jpeg.resize(24, 0);
        std::fs::write(folder.join("1.jpg"), &jpeg).unwrap();
        std::fs::write(folder.join("2.jpg"), jpeg).unwrap();
        let relative = RelativePath::parse("volume/2.jpg").unwrap();
        let item = contained_library_path(&root, &relative).unwrap();
        let kind = open_item_kind(&item, &relative).unwrap();
        let (viewer_item, viewer_relative, viewer_kind, requested_page) =
            viewer_item_for_opened_image(item, relative.clone(), kind).unwrap();
        let pages = enumerate_pages_port(
            &root,
            &viewer_item,
            &viewer_relative,
            viewer_kind,
            false,
            &CancellationToken::new(),
        )
        .unwrap();

        assert_eq!(viewer_relative, RelativePath::parse("volume").unwrap());
        assert_eq!(viewer_kind, OpenItemKind::Folder);
        assert_eq!(
            pages,
            vec![
                RelativePath::parse("volume/1.jpg").unwrap(),
                RelativePath::parse("volume/2.jpg").unwrap(),
            ]
        );
        assert_eq!(viewer_start_index(requested_page.as_ref(), None, &pages), 1);

        std::fs::remove_dir_all(root).unwrap();
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
    fn ft_b23_004_viewer_appearance_uses_valid_values_and_safe_defaults() {
        let mut settings = crate::state::Settings::default();
        assert_eq!(viewer_background(&settings), "checker");
        assert_eq!(
            viewer_spacing(&settings.viewer_page_margin, DEFAULT_VIEWER_PAGE_MARGIN),
            0
        );
        assert_eq!(
            viewer_spacing(&settings.viewer_spread_gap, DEFAULT_VIEWER_SPREAD_GAP),
            8
        );
        assert_eq!(viewer_cursor_auto_hide_ms(&settings), 0);

        settings.viewer_background = "light".into();
        settings.viewer_page_margin = "24".into();
        settings.viewer_spread_gap = "18".into();
        settings.cursor_auto_hide_ms = "3000".into();
        assert_eq!(viewer_background(&settings), "light");
        assert_eq!(
            viewer_spacing(&settings.viewer_page_margin, DEFAULT_VIEWER_PAGE_MARGIN),
            24
        );
        assert_eq!(
            viewer_spacing(&settings.viewer_spread_gap, DEFAULT_VIEWER_SPREAD_GAP),
            18
        );
        assert_eq!(viewer_cursor_auto_hide_ms(&settings), 3_000);

        settings.viewer_background = "transparent".into();
        settings.viewer_page_margin = "65".into();
        settings.viewer_spread_gap = "invalid".into();
        settings.cursor_auto_hide_ms = "4000".into();
        assert_eq!(viewer_background(&settings), "checker");
        assert_eq!(
            viewer_spacing(&settings.viewer_page_margin, DEFAULT_VIEWER_PAGE_MARGIN),
            0
        );
        assert_eq!(
            viewer_spacing(&settings.viewer_spread_gap, DEFAULT_VIEWER_SPREAD_GAP),
            8
        );
        assert_eq!(viewer_cursor_auto_hide_ms(&settings), 0);
    }

    #[test]
    fn shutdown_is_idempotent_cancels_work_revokes_media_and_closes_store() {
        let state = AppState {
            library_root: Mutex::new(None),
            search_sources: Mutex::new(BTreeMap::new()),
            folder_watch: Mutex::new(None),
            navigation: Mutex::new(NavigationCoordinator::default()),
            diagnostics: Mutex::new(NavigationCoordinator::default()),
            recursive_thumbnails: Mutex::new(NavigationCoordinator::default()),
            viewer: Arc::new(Mutex::new(NavigationCoordinator::default())),
            store: Arc::new(Mutex::new(None)),
            thumbnails: Arc::new(Mutex::new(None)),
            thumbnail_pins: ThumbnailPins::default(),
            thumbnail_workers: PriorityTaskPool::new(1, 1),
            page_workers: PriorityTaskPool::new(1, 1),
            file_operations: Arc::new(Mutex::new(())),
            display_awake: Mutex::new(display_awake::DisplayAwakeRequest::default()),
            media: Mutex::new(MediaTokenRegistry::new(Duration::from_secs(60))),
            recovery_notice: Mutex::new(false),
            shutting_down: AtomicBool::new(false),
        };
        let cancellation = state.navigation.lock().unwrap().begin(Generation(7));
        let recursive_cancellation = state
            .recursive_thumbnails
            .lock()
            .unwrap()
            .begin(Generation(8));
        let token = state.media.lock().unwrap().issue(MediaGrant {
            page_id: PageId::parse("shutdown-page").unwrap(),
            mime_type: "image/png",
            max_bytes: 10,
            source: PageSource::File(PathBuf::from("page.png")),
        });

        state.shutdown();
        state.shutdown();

        assert!(cancellation.is_cancelled());
        assert!(recursive_cancellation.is_cancelled());
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
    fn req_ley_p3_009_counts_generated_cache_hits_and_continues_after_item_failure() {
        let mut report = RecursiveThumbnailReport {
            total: 3,
            ..RecursiveThumbnailReport::default()
        };
        let generated = crate::state::ThumbnailResult {
            content_hash: "generated".into(),
            path: PathBuf::from("generated.jpg"),
            cache_hit: false,
        };
        let cached = crate::state::ThumbnailResult {
            content_hash: "cached".into(),
            path: PathBuf::from("cached.jpg"),
            cache_hit: true,
        };
        assert_eq!(
            record_recursive_thumbnail_result(&mut report, Ok(generated)).unwrap(),
            Some("generated".into())
        );
        assert_eq!(
            record_recursive_thumbnail_result(
                &mut report,
                Err(request_error(ErrorCode::CorruptImage, "broken cover")),
            )
            .unwrap(),
            None
        );
        assert_eq!(
            record_recursive_thumbnail_result(&mut report, Ok(cached)).unwrap(),
            Some("cached".into())
        );
        assert_eq!(
            report,
            RecursiveThumbnailReport {
                total: 3,
                generated: 1,
                cache_hits: 1,
                failed: 1,
            }
        );
        assert_eq!(
            record_recursive_thumbnail_result(&mut report, Err(AppError::cancelled()))
                .unwrap_err()
                .code,
            ErrorCode::Cancelled
        );
    }

    #[test]
    fn recovery_notice_is_consumed_once_without_exposing_internal_details() {
        let state = AppState {
            library_root: Mutex::new(None),
            search_sources: Mutex::new(BTreeMap::new()),
            folder_watch: Mutex::new(None),
            navigation: Mutex::new(NavigationCoordinator::default()),
            diagnostics: Mutex::new(NavigationCoordinator::default()),
            recursive_thumbnails: Mutex::new(NavigationCoordinator::default()),
            viewer: Arc::new(Mutex::new(NavigationCoordinator::default())),
            store: Arc::new(Mutex::new(None)),
            thumbnails: Arc::new(Mutex::new(None)),
            thumbnail_pins: ThumbnailPins::default(),
            thumbnail_workers: PriorityTaskPool::new(1, 1),
            page_workers: PriorityTaskPool::new(1, 1),
            file_operations: Arc::new(Mutex::new(())),
            display_awake: Mutex::new(display_awake::DisplayAwakeRequest::default()),
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
        drop(result_tx);
        match result_rx.recv_timeout(Duration::from_secs(5)) {
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {}
            Ok((generation, _)) => {
                panic!("stale viewer generation produced a result: {generation:?}")
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                panic!("cancelled viewer generations did not drain within the test deadline")
            }
        }
        pool.shutdown();
    }

    #[test]
    fn page_adapter_transcodes_additional_rasters_and_static_svg_to_safe_png_media() {
        use image::{DynamicImage, ImageBuffer, ImageFormat as DecoderFormat, Rgba};

        for (decoder_format, extension, mime_type) in [
            (DecoderFormat::Bmp, "bmp", "image/bmp"),
            (DecoderFormat::Tiff, "tiff", "image/tiff"),
            (DecoderFormat::Ico, "ico", "image/x-icon"),
        ] {
            let image =
                DynamicImage::ImageRgba8(ImageBuffer::from_pixel(5, 3, Rgba([10, 20, 30, 255])));
            let mut output = Cursor::new(Vec::new());
            image.write_to(&mut output, decoder_format).unwrap();
            let target = RelativePath::parse(format!("page.{extension}")).unwrap();
            let grant = MediaGrant {
                page_id: PageId::parse(format!("page-{extension}")).unwrap(),
                mime_type,
                max_bytes: MAX_IMAGE_BYTES,
                source: PageSource::Memory(output.into_inner()),
            };
            let (delivered_mime, bytes) = read_page_bytes(&grant, &target).unwrap();
            assert_eq!(delivered_mime, "image/png");
            assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));
        }

        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="5" height="3"><rect width="5" height="3" fill="blue"/></svg>"#;
        let target = RelativePath::parse("page.svg").unwrap();
        let grant = MediaGrant {
            page_id: PageId::parse("page-svg").unwrap(),
            mime_type: "image/svg+xml",
            max_bytes: MAX_IMAGE_BYTES,
            source: PageSource::Memory(svg.to_vec()),
        };
        let (delivered_mime, bytes) = read_page_bytes(&grant, &target).unwrap();
        assert_eq!(delivered_mime, "image/png");
        assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));
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
        let (mime_type, bytes) = read_page_bytes(&next, &next_target).unwrap();
        assert_eq!(mime_type, "image/png");
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
        let entries =
            enumerate_folder_port(&root, &root.join("FIX-NESTED-001"), false, &active).unwrap();
        assert!(!entries.is_empty());
        assert_eq!(
            enumerate_folder_port(&root, &root.join("missing"), false, &active)
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        let archive_relative = RelativePath::parse("FIX-ZIP-001/standard.cbz").unwrap();
        let pages = enumerate_pages_port(
            &root,
            &root.join(archive_relative.as_str()),
            &archive_relative,
            OpenItemKind::Archive,
            false,
            &active,
        )
        .unwrap();
        assert!(!pages.is_empty());

        let cancelled = CancellationToken::new();
        cancelled.cancel();
        assert_eq!(
            enumerate_folder_port(&root, &root.join("FIX-NESTED-001"), false, &cancelled)
                .unwrap_err()
                .code,
            ErrorCode::Cancelled
        );
        assert_eq!(
            enumerate_pages_port(
                &root,
                &root.join("FIX-ZIP-001/standard.cbz"),
                &archive_relative,
                OpenItemKind::Archive,
                false,
                &cancelled,
            )
            .unwrap_err()
            .code,
            ErrorCode::Cancelled
        );
    }

    #[test]
    fn folder_navigation_does_not_wait_for_the_thumbnail_pipeline_lock() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-navigation-thumbnail-lock-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        let paths = AppPaths::under(root.clone());
        let pipeline = ThumbnailPipeline::new(&paths).unwrap();
        let pins = pipeline.pins();
        pins.pin(&"01".repeat(32)).unwrap();
        let pipeline = Arc::new(Mutex::new(Some(pipeline)));
        let pipeline_guard = pipeline.lock().unwrap();
        let (completed_tx, completed_rx) = std::sync::mpsc::channel();

        let reset = std::thread::spawn(move || {
            completed_tx
                .send(reset_thumbnail_pins_for_navigation(&pins))
                .unwrap();
        });

        completed_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("pin reset must not acquire the busy thumbnail pipeline")
            .unwrap();
        drop(pipeline_guard);
        reset.join().unwrap();
        drop(pipeline);
        std::fs::remove_dir_all(root).unwrap();
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
    fn req_ley_p3_001_search_port_combines_wildcards_logic_and_existing_options() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-search-expression-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        std::fs::create_dir_all(root.join("Nested")).unwrap();
        std::fs::write(root.join("Final 01.cbz"), b"archive").unwrap();
        std::fs::write(root.join("Sample 02.cbz"), b"archive").unwrap();
        std::fs::write(root.join("Final 03.pdf"), b"pdf").unwrap();
        std::fs::write(root.join("Nested/Final 04.cbz"), b"nested").unwrap();

        let cancellation = CancellationToken::new();
        let mut options = SearchOptions::default();
        options.include_subfolders = false;
        let results = search_library_with_options_port(
            &root,
            "(*.cbz OR *.pdf) AND NOT sample*",
            &options,
            &cancellation,
        )
        .unwrap();
        assert_eq!(
            results
                .iter()
                .map(|entry| entry.relative_path.as_str())
                .collect::<Vec<_>>(),
            ["Final 01.cbz", "Final 03.pdf"]
        );

        let invalid = search_library_with_options_port(&root, "*.cbz AND", &options, &cancellation)
            .unwrap_err();
        assert_eq!(invalid.code, ErrorCode::InvalidRequest);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn req_ley_p3_004_cross_source_search_deduplicates_overlap_and_preserves_source_order() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-search-sources-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        let first = root.join("first");
        let nested = first.join("Nested");
        let second = root.join("second");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        std::fs::write(first.join("Volume Root.cbz"), b"root").unwrap();
        std::fs::write(nested.join("Volume Nested.cbz"), b"nested").unwrap();
        std::fs::write(second.join("Volume Nested.cbz"), b"other").unwrap();

        let results = search_library_sources_port(
            &[first.clone(), nested, second.clone()],
            "volume",
            &SearchOptions::default(),
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].source_root, library_root::display_path(&first));
        assert_eq!(results[1].source_root, library_root::display_path(&first));
        assert_eq!(results[2].source_root, library_root::display_path(&second));
        assert_eq!(
            results[0].entry.relative_path.as_str(),
            "Nested/Volume Nested.cbz"
        );
        assert_eq!(results[1].entry.relative_path.as_str(), "Volume Root.cbz");
        assert_eq!(results[2].entry.relative_path.as_str(), "Volume Nested.cbz");

        let missing = root.join("missing");
        assert_eq!(
            search_library_sources_port(
                &[missing],
                "volume",
                &SearchOptions::default(),
                &CancellationToken::new(),
            )
            .unwrap_err()
            .code,
            ErrorCode::NotFound
        );
        let cancelled = CancellationToken::new();
        cancelled.cancel();
        assert_eq!(
            search_library_sources_port(&[first], "volume", &SearchOptions::default(), &cancelled,)
                .unwrap_err()
                .code,
            ErrorCode::Cancelled
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn req_ley_p3_004_source_allowlist_and_total_result_limit_are_enforced() {
        let current = PathBuf::from(r"C:\Library");
        let other = PathBuf::from(r"D:\Comics");
        let approved = [
            (search_source_key(&current), current.clone()),
            (search_source_key(&other), other.clone()),
        ]
        .into_iter()
        .collect::<BTreeMap<_, _>>();
        let resolved = resolve_approved_search_sources(
            &current,
            &[
                r"C:\Library".into(),
                r"d:\comics".into(),
                r"D:\Comics".into(),
            ],
            &approved,
        )
        .unwrap();
        assert_eq!(resolved, [current.clone(), other.clone()]);
        assert_eq!(
            resolve_approved_search_sources(&current, &[r"E:\Unapproved".into()], &approved,)
                .unwrap_err()
                .code,
            ErrorCode::InvalidPath
        );
        assert_eq!(
            resolve_approved_search_sources(
                &current,
                &(0..=MAX_SEARCH_SOURCES)
                    .map(|index| format!(r"C:\source-{index}"))
                    .collect::<Vec<_>>(),
                &approved,
            )
            .unwrap_err()
            .code,
            ErrorCode::ResourceLimit
        );

        let fixture_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated/FIX-LIBRARY-001")
            .canonicalize()
            .unwrap();
        let entry = search_library_port(&fixture_root, "volume", &CancellationToken::new())
            .unwrap()
            .into_iter()
            .next()
            .expect("fixture search result");
        let source_root = library_root::display_path(&fixture_root);
        let seeded = SearchResultEntry {
            entry: entry.clone(),
            source_root: source_root.clone(),
        };
        let mut combined = vec![seeded; MAX_CROSS_SOURCE_RESULTS];
        let mut seen = HashSet::new();
        assert_eq!(
            append_cross_source_result(
                &mut combined,
                &mut seen,
                &fixture_root,
                &source_root,
                entry,
            )
            .unwrap_err()
            .code,
            ErrorCode::ResourceLimit
        );
    }

    #[test]
    fn req_ley_p3_005_watch_directory_stays_inside_the_canonical_library_root() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-watch-containment-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        std::fs::create_dir_all(root.join("Nested")).unwrap();
        std::fs::write(root.join("file.cbz"), b"not a directory").unwrap();
        let canonical_root = root.canonicalize().unwrap();
        let nested = RelativePath::parse("Nested").unwrap();
        assert_eq!(
            resolve_watch_directory(&canonical_root, &nested).unwrap(),
            root.join("Nested").canonicalize().unwrap()
        );
        assert!(RelativePath::parse("../outside").is_err());
        assert_eq!(
            resolve_watch_directory(&canonical_root, &RelativePath::parse("missing").unwrap(),)
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        assert_eq!(
            resolve_watch_directory(&canonical_root, &RelativePath::parse("file.cbz").unwrap(),)
                .unwrap_err()
                .code,
            ErrorCode::InvalidPath
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn req_ley_p3_006_tree_enumeration_measures_10000_direct_folders() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-tree-10000-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        std::fs::create_dir_all(&root).unwrap();
        for index in 0..10_000 {
            std::fs::create_dir(root.join(format!("folder-{index:05}"))).unwrap();
        }

        let started = std::time::Instant::now();
        let entries = enumerate_tree_children(&root, &root, false, true).unwrap();
        let elapsed = started.elapsed();
        eprintln!(
            "REQ-LEY-P3-006 10000 direct folders with child confirmation: {:.3} ms",
            elapsed.as_secs_f64() * 1000.0
        );
        assert_eq!(entries.len(), 10_000);
        assert!(
            entries
                .iter()
                .all(|entry| entry.has_children == Some(false))
        );
        assert!(elapsed < Duration::from_secs(60));
        let unconfirmed = enumerate_tree_children(&root, &root, false, false).unwrap();
        assert!(unconfirmed.iter().all(|entry| entry.has_children.is_none()));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn req_ley_p3_007_resolves_kind_rules_and_force_read_in_rust() {
        let mut settings = crate::state::Settings::default();
        for (kind, expected) in [
            (ItemKind::Folder, "navigate"),
            (ItemKind::ComicFolder, "navigate"),
            (ItemKind::Page, "read"),
            (ItemKind::Archive, "read"),
            (ItemKind::Pdf, "read"),
            (ItemKind::Unsupported, "none"),
        ] {
            assert_eq!(
                catalog_activation_action(kind, "doubleClick", &settings).unwrap(),
                expected
            );
            assert_eq!(
                catalog_activation_action(kind, "enter", &settings).unwrap(),
                expected
            );
        }

        settings.folder_open_rule = "read".into();
        assert_eq!(
            catalog_activation_action(ItemKind::Folder, "enter", &settings).unwrap(),
            "read"
        );
        settings.folder_open_rule = "none".into();
        settings.image_open_rule = "none".into();
        settings.archive_open_rule = "none".into();
        for kind in [
            ItemKind::Folder,
            ItemKind::ComicFolder,
            ItemKind::Page,
            ItemKind::Archive,
            ItemKind::Pdf,
        ] {
            assert_eq!(
                catalog_activation_action(kind, "doubleClick", &settings).unwrap(),
                "none"
            );
        }
        for kind in [ItemKind::Page, ItemKind::Archive, ItemKind::Pdf] {
            assert_eq!(
                catalog_activation_action(kind, "ctrlEnter", &settings).unwrap(),
                "read"
            );
        }
        assert_eq!(
            catalog_activation_action(ItemKind::Folder, "ctrlEnter", &settings).unwrap(),
            "none"
        );
        assert_eq!(
            catalog_activation_action(ItemKind::Page, "singleClick", &settings)
                .unwrap_err()
                .code,
            ErrorCode::InvalidRequest
        );
    }

    #[test]
    fn req_ley_p3_008_detail_format_defaults_invalid_persisted_values() {
        let mut settings = crate::state::Settings::default();
        settings.detail_grid_lines = "vertical".into();
        settings.detail_row_density = "tiny".into();
        settings.detail_show_kind = false;
        settings.detail_show_size = false;
        settings.detail_show_modified = false;
        let normalized = catalog_settings(settings);
        assert_eq!(normalized.detail_grid_lines, "none");
        assert_eq!(normalized.detail_row_density, "standard");
        assert!(!normalized.detail_show_kind);
        assert!(!normalized.detail_show_size);
        assert!(!normalized.detail_show_modified);

        let mut settings = crate::state::Settings::default();
        settings.detail_grid_lines = "both".into();
        settings.detail_row_density = "comfortable".into();
        let normalized = catalog_settings(settings);
        assert_eq!(normalized.detail_grid_lines, "both");
        assert_eq!(normalized.detail_row_density, "comfortable");
    }

    #[test]
    fn req_ley_p3_002_catalog_mask_port_is_bounded_and_evaluates_10000_basenames() {
        let candidates = (0..10_000)
            .map(|index| {
                let extension = if index % 2 == 0 { "cbz" } else { "jpg" };
                CatalogMaskCandidate {
                    basename: format!("volume-{index:05}.{extension}"),
                    kind: if index % 2 == 0 {
                        ItemKind::Archive
                    } else {
                        ItemKind::Page
                    },
                    byte_size: Some(index),
                    modified_ms: Some(index),
                }
            })
            .collect::<Vec<_>>();
        let started = std::time::Instant::now();
        let matches =
            evaluate_catalog_mask_port("*.cbz;*.pdf", &candidates, &CatalogMaskOptions::default())
                .unwrap();
        let elapsed = started.elapsed();
        eprintln!("REQ-LEY-P3-002 synthetic 10,000 basename evaluation: {elapsed:?}");
        assert_eq!(matches.iter().filter(|matched| **matched).count(), 5_000);
        assert!(
            elapsed < std::time::Duration::from_secs(2),
            "elapsed: {elapsed:?}"
        );

        assert!(
            evaluate_catalog_mask_port("*.cbz AND", &candidates, &CatalogMaskOptions::default())
                .is_err()
        );
        assert!(
            evaluate_catalog_mask_port("", &candidates, &CatalogMaskOptions::default())
                .unwrap()
                .into_iter()
                .all(|matched| matched)
        );
        let too_many = vec![
            CatalogMaskCandidate {
                basename: "x.cbz".to_owned(),
                kind: ItemKind::Archive,
                byte_size: None,
                modified_ms: None,
            };
            MAX_CATALOG_MASK_BASENAMES + 1
        ];
        assert_eq!(
            evaluate_catalog_mask_port("*.cbz", &too_many, &CatalogMaskOptions::default())
                .unwrap_err()
                .code,
            ErrorCode::InvalidRequest
        );
        assert!(
            evaluate_catalog_mask_port(
                "*.cbz",
                &[CatalogMaskCandidate {
                    basename: "dir/file.cbz".to_owned(),
                    kind: ItemKind::Archive,
                    byte_size: None,
                    modified_ms: None,
                }],
                &CatalogMaskOptions::default()
            )
            .is_err()
        );
    }

    #[test]
    fn req_ley_p3_003_catalog_mask_combines_kind_size_and_half_open_date_ranges() {
        let candidates = vec![
            CatalogMaskCandidate {
                basename: "folder".to_owned(),
                kind: ItemKind::Folder,
                byte_size: None,
                modified_ms: Some(1_500),
            },
            CatalogMaskCandidate {
                basename: "small.cbz".to_owned(),
                kind: ItemKind::Archive,
                byte_size: Some(99),
                modified_ms: Some(1_500),
            },
            CatalogMaskCandidate {
                basename: "match.cbz".to_owned(),
                kind: ItemKind::Archive,
                byte_size: Some(150),
                modified_ms: Some(1_500),
            },
            CatalogMaskCandidate {
                basename: "end.cbz".to_owned(),
                kind: ItemKind::Archive,
                byte_size: Some(150),
                modified_ms: Some(2_000),
            },
        ];
        let options = CatalogMaskOptions {
            include_folders: false,
            include_files: true,
            min_size_bytes: Some(100),
            max_size_bytes: Some(200),
            modified_after_ms: Some(1_000),
            modified_before_ms: Some(2_000),
        };
        assert_eq!(
            evaluate_catalog_mask_port("*.cbz", &candidates, &options).unwrap(),
            [false, false, true, false]
        );
        let mut invalid = options.clone();
        invalid.include_files = false;
        assert!(evaluate_catalog_mask_port("", &candidates, &invalid).is_err());
        invalid.include_files = true;
        invalid.min_size_bytes = Some(201);
        assert!(evaluate_catalog_mask_port("", &candidates, &invalid).is_err());

        let candidates = (0..10_000)
            .map(|index| CatalogMaskCandidate {
                basename: format!(
                    "volume-{index:05}-{}.cbz",
                    if index % 2 == 0 { "draft" } else { "final" }
                ),
                kind: ItemKind::Archive,
                byte_size: Some(index),
                modified_ms: Some(index),
            })
            .collect::<Vec<_>>();
        let options = CatalogMaskOptions {
            include_folders: false,
            include_files: true,
            min_size_bytes: Some(1_000),
            max_size_bytes: Some(9_000),
            modified_after_ms: Some(1_000),
            modified_before_ms: Some(9_000),
        };
        let started = std::time::Instant::now();
        let matches =
            evaluate_catalog_mask_port("volume-*.cbz AND NOT *draft*", &candidates, &options)
                .unwrap();
        let elapsed = started.elapsed();
        eprintln!("REQ-LEY-P3-003 synthetic 10,000 detailed mask evaluation: {elapsed:?}");
        assert_eq!(
            matches.into_iter().filter(|matched| *matched).count(),
            4_000
        );
        assert!(
            elapsed < std::time::Duration::from_secs(2),
            "elapsed: {elapsed:?}"
        );

        assert!(catalog_mask_record("", "*.cbz".into(), options.clone()).is_err());
        assert!(catalog_mask_record("valid", "*.cbz AND".into(), options).is_err());
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
    fn search_port_applies_scope_kind_size_date_and_fixed_location_options() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-search-options-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        std::fs::create_dir_all(root.join("Nested")).unwrap();
        std::fs::write(root.join("root-volume.cbz"), b"tiny").unwrap();
        std::fs::write(root.join("Nested/nested-volume.cbz"), b"large-search-entry").unwrap();

        let cancellation = CancellationToken::new();
        let mut options = SearchOptions::default();
        options.include_subfolders = false;
        let direct = search_library_with_options_port(
            &root,
            &normalize_search_text("volume"),
            &options,
            &cancellation,
        )
        .unwrap();
        assert_eq!(direct.len(), 1);
        assert_eq!(direct[0].relative_path.as_str(), "root-volume.cbz");

        options.include_subfolders = true;
        options.include_files = false;
        assert!(
            search_library_with_options_port(
                &root,
                &normalize_search_text("volume"),
                &options,
                &cancellation,
            )
            .unwrap()
            .is_empty()
        );

        options.include_files = true;
        options.min_size_bytes = Some(10);
        let sized = search_library_with_options_port(
            &root,
            &normalize_search_text("volume"),
            &options,
            &cancellation,
        )
        .unwrap();
        assert_eq!(sized.len(), 1);
        assert_eq!(sized[0].relative_path.as_str(), "Nested/nested-volume.cbz");

        options.min_size_bytes = None;
        options.modified_before_ms = Some(0);
        assert!(
            search_library_with_options_port(
                &root,
                &normalize_search_text("volume"),
                &options,
                &cancellation,
            )
            .unwrap()
            .is_empty()
        );

        options.modified_before_ms = None;
        options.fixed_location = Some("Nested".into());
        let fixed = search_library_with_options_port(
            &root,
            &normalize_search_text("volume"),
            &options,
            &cancellation,
        )
        .unwrap();
        assert_eq!(fixed.len(), 1);
        assert_eq!(fixed[0].relative_path.as_str(), "Nested/nested-volume.cbz");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn application_boundary_preserves_context_and_rejects_stale_real_results() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated")
            .canonicalize()
            .unwrap();
        let cancellation = CancellationToken::new();
        let success =
            enumerate_folder_port(&root, &root.join("FIX-LIBRARY-001"), false, &cancellation);
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

        let missing = enumerate_folder_port(&root, &root.join("missing"), false, &cancellation);
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

        let stale =
            enumerate_folder_port(&root, &root.join("FIX-LIBRARY-001"), false, &cancellation);
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

    #[test]
    fn fr_b07_history_deterministic_order_and_dedup() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-fr-b07-history-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        let paths = AppPaths::under(root.clone());
        let (store, _) = StateStore::open(&paths).unwrap();
        let item = RelativePath::parse("Series/A.cbz").unwrap();

        for boundary in [
            ComicOpenHistoryBoundary::Failed,
            ComicOpenHistoryBoundary::Success {
                page_count: 0,
                generation_current: true,
            },
            ComicOpenHistoryBoundary::Cancelled,
            ComicOpenHistoryBoundary::Success {
                page_count: 1,
                generation_current: false,
            },
        ] {
            record_history_at_open_boundary(Some(&store), &item, boundary, 100).unwrap();
            assert!(store.list_reading_history().unwrap().is_empty());
        }

        let other = RelativePath::parse("Series/B.cbz").unwrap();
        record_history_at_open_boundary(
            Some(&store),
            &other,
            ComicOpenHistoryBoundary::Success {
                page_count: 1,
                generation_current: true,
            },
            200,
        )
        .unwrap();
        record_history_at_open_boundary(
            Some(&store),
            &item,
            ComicOpenHistoryBoundary::Success {
                page_count: 1,
                generation_current: true,
            },
            200,
        )
        .unwrap();
        record_history_at_open_boundary(
            Some(&store),
            &item,
            ComicOpenHistoryBoundary::Success {
                page_count: 1,
                generation_current: true,
            },
            300,
        )
        .unwrap();

        assert_eq!(
            store.list_reading_history().unwrap(),
            vec![("Series/A.cbz".into(), 300), ("Series/B.cbz".into(), 200)]
        );
        assert_eq!(
            store
                .connection()
                .query_row("SELECT COUNT(*) FROM reading_history", [], |row| row
                    .get::<_, i64>(0),)
                .unwrap(),
            2
        );
        drop(store);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn favorite_target_enforces_relative_path_and_eligible_kind_boundaries() {
        let root = std::env::temp_dir().join(format!(
            "comic-explorer-favorite-target-{}-{}",
            std::process::id(),
            unix_millis()
        ));
        std::fs::create_dir_all(root.join("folder")).unwrap();
        std::fs::write(root.join("page.png"), b"not an image").unwrap();

        let folder = favorite_target(&root, &RelativePath::parse("folder").unwrap()).unwrap();
        assert_eq!(folder.kind, ItemKind::Folder);
        assert_eq!(
            favorite_target(&root, &RelativePath::parse("page.png").unwrap())
                .unwrap_err()
                .code,
            ErrorCode::InvalidRequest
        );
        assert!(RelativePath::parse("../outside").is_err());
        assert!(RelativePath::parse(r"C:\\outside").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fr_b06_favorite_strict_moved_missing_reresolve_and_path_safety() {
        fn archive(path: &str, size_bytes: Option<u64>, modified_ms: Option<u64>) -> CatalogEntry {
            CatalogEntry {
                relative_path: RelativePath::parse(path).unwrap(),
                kind: ItemKind::Archive,
                has_folder_archive_cover: false,
                byte_size: size_bytes,
                modified_ms,
                archive_kind: Some(crate::catalog::ArchiveKind::Cbz),
            }
        }

        let record = FavoriteRecord {
            favorite_id: "favorite-old".into(),
            item_identity: "item-original".into(),
            relative_path: RelativePath::parse("Old/01.cbz").unwrap(),
            kind: ItemKind::Archive,
            size_bytes: Some(12),
            modified_ms: Some(13),
        };
        let exact = archive("New/01.cbz", Some(12), Some(13));
        let requested = FavoriteTarget {
            relative_path: exact.relative_path.clone(),
            kind: exact.kind,
            byte_size: exact.byte_size,
            modified_ms: exact.modified_ms,
        };
        let entries = vec![exact.clone(), archive("Other/01.cbz", Some(12), Some(99))];

        let moved = favorite_view(&record, &entries);
        assert_eq!(moved.status, FavoriteStatus::Moved);
        assert_eq!(moved.resolved_path, Some(exact.relative_path.clone()));
        assert_eq!(moved.favorite_id, record.favorite_id);
        assert_eq!(moved.item_identity, record.item_identity);
        assert_eq!(
            strict_moved_favorite_resolve_target(&record, &entries, &requested)
                .unwrap()
                .relative_path,
            exact.relative_path
        );

        let arbitrary = FavoriteTarget {
            relative_path: RelativePath::parse("Other/01.cbz").unwrap(),
            kind: ItemKind::Archive,
            byte_size: Some(12),
            modified_ms: Some(99),
        };
        assert_eq!(
            strict_moved_favorite_resolve_target(&record, &entries, &arbitrary)
                .unwrap_err()
                .code,
            ErrorCode::InvalidRequest
        );

        let entries_with_original = vec![archive("Old/01.cbz", Some(12), Some(13)), exact.clone()];
        assert_eq!(
            favorite_view(&record, &entries_with_original).status,
            FavoriteStatus::Available
        );
        assert_eq!(
            strict_moved_favorite_resolve_target(&record, &entries_with_original, &requested,)
                .unwrap_err()
                .code,
            ErrorCode::InvalidRequest
        );

        let ambiguous = vec![
            archive("New/01.cbz", Some(12), Some(13)),
            archive("Elsewhere/01.cbz", Some(12), Some(13)),
        ];
        assert!(moved_favorite_candidate(&record, &ambiguous).is_none());
        assert_eq!(
            favorite_view(&record, &ambiguous).status,
            FavoriteStatus::Missing
        );

        let size_only = vec![archive("New/01.cbz", Some(12), Some(99))];
        assert!(moved_favorite_candidate(&record, &size_only).is_none());
        assert_eq!(
            favorite_view(&record, &size_only).status,
            FavoriteStatus::Missing
        );

        let name_only = vec![archive("New/01.cbz", Some(99), Some(99))];
        assert!(moved_favorite_candidate(&record, &name_only).is_none());
        assert_eq!(
            favorite_view(&record, &name_only).status,
            FavoriteStatus::Missing
        );

        let no_fingerprint = FavoriteRecord {
            size_bytes: None,
            ..record.clone()
        };
        assert!(moved_favorite_candidate(&no_fingerprint, &entries).is_none());
        assert_eq!(
            favorite_view(&no_fingerprint, &entries).status,
            FavoriteStatus::Missing
        );
        assert!(moved_favorite_candidate(&record, &[]).is_none());
        assert!(RelativePath::parse("../outside").is_err());
        assert!(RelativePath::parse(r"C:\\outside").is_err());
    }

    #[test]
    fn favorite_view_marks_a_unique_fingerprint_match_as_moved() {
        let record = FavoriteRecord {
            favorite_id: "favorite-old".into(),
            item_identity: "item-old".into(),
            relative_path: RelativePath::parse("Old/01.cbz").unwrap(),
            kind: ItemKind::Archive,
            size_bytes: Some(12),
            modified_ms: Some(13),
        };
        let entries = vec![crate::catalog::CatalogEntry {
            relative_path: RelativePath::parse("New/01.cbz").unwrap(),
            kind: ItemKind::Archive,
            has_folder_archive_cover: false,
            byte_size: Some(12),
            modified_ms: Some(13),
            archive_kind: Some(crate::catalog::ArchiveKind::Cbz),
        }];
        let view = favorite_view(&record, &entries);
        assert_eq!(view.status, FavoriteStatus::Moved);
        assert_eq!(
            view.resolved_path,
            Some(RelativePath::parse("New/01.cbz").unwrap())
        );
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
        drop(result_tx);
        match result_rx.recv_timeout(Duration::from_secs(10)) {
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {}
            Ok((generation, _)) => {
                panic!("stale thumbnail generation produced a result: {generation:?}")
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                panic!("cancelled thumbnail generations did not drain within the test deadline")
            }
        }
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
