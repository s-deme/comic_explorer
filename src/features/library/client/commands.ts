import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  API_VERSION,
  type ApiResponse,
  type RequestContext,
} from "../../../types/api";
import type {
  CatalogEntry,
  Generation,
  ItemKind,
  PageId,
  RelativePath,
  RequestId,
} from "../../../types/domain";
import type {
  ScaleMode,
  ViewerBackground,
  ViewerGridColor,
  ViewMode,
  SpreadPairing,
  FitBasis,
  PageScanMode,
  ZoomRetention,
} from "../../viewer/model";
import type { EndOfVolumePolicy } from "../../catalog/end-of-volume";
import type { CatalogThumbnailSizes, CatalogViewMode } from "../../catalog/view-mode";
import type { SearchRequestOptions } from "../../catalog/search-options";
import type { ShortcutBindings } from "../../input/shortcuts";
import type { CatalogMouseBindings } from "../../input/catalog-mouse";
import type { ViewerQuadrantBindings } from "../../input/viewer-quadrants";
import {
  SETTINGS_PROFILE_VERSION,
  type MouseGestureBindings,
  CatalogPanePosition,
  FileOpenRule,
  FolderOpenRule,
  DetailGridLineMode,
  DetailRowDensity,
  NavigationSelectionPolicy,
  SettingsProfile,
  StartupLocation,
  ThumbnailGenerationScope,
} from "../../settings/profile";
import type {
  CustomThemeSnapshot,
  ThemeDefinitionV1,
  ThemeSelection,
} from "../../settings/theme";
import type {
  CliLaunchPlan,
  CliLaunchRequest,
  ShelfIcon,
  NamedShelf,
  ShelfNode,
  ShelfSnapshot,
  ShelfCleanupPreview,
  ShelfNodeDeletePreview,
  ShelfTextExport,
  ShelfImportPreview,
  OfflineMediaIcon,
  OfflineMediaStatus,
  OfflineMediaEntry,
  OfflineMediaCatalog,
  OfflineMediaDetail,
  OfflineMediaThumbnailPayload,
  TonePoint,
  ViewerFilter,
  ViewerFilterStep,
  ViewerFilterSet,
  ViewerFilterCatalog,
  WindowsDrive,
  WindowsKnownFolder,
  CatalogSettings,
  NamedSettingsProfileSummary,
  CustomThemeRecord,
  InvalidCustomThemeRecord,
  CustomThemeCatalog,
  CustomThemeImportConflict,
  CustomThemeImportPreview,
  CustomThemeExport,
  SettingsProfileSwitchPreview,
  NativeSettingsProfile,
  TrayStatus,
  CatalogActivationTrigger,
  CatalogActivationAction,
  ViewerRectangleZoomInput,
  ViewerRectangleZoomPlan,
  FavoriteStatus,
  FavoriteEntry,
  CatalogFolderChange,
  FileOperationKind,
  FileOperationResult,
  FileClipboardStatus,
  FileUndoStatus,
  NativeFileDropItem,
  NativeFileDropPreview,
  RenamePreferences,
  BatchRenamePreviewItem,
  BatchRenamePreview,
  ExternalAppTargetMode,
  ExternalAppEntry,
  ExternalAppHistoryEntry,
  ExternalAppLaunchPreview,
  SearchResultEntry,
  CatalogMaskCandidate,
  CatalogMaskOptions,
  SavedCatalogMask,
  CsvColumn,
  CsvSizeUnit,
  CsvExportScope,
  CsvExportConfig,
  CsvExportPreset,
  CsvExportResult,
  DiagnosticStatus,
  DiagnosticSeverity,
  DiagnosticSnapshotEntry,
  DiagnosticFinding,
  DiagnosticSummary,
  DiagnosticReport,
  ThumbnailData,
  RecursiveThumbnailProgress,
  RecursiveThumbnailReport,
  TreeEntry,
  ArchiveVirtualEntryKind,
  ArchiveVirtualEntry,
  ArchiveVirtualTreeSnapshot,
  ArchiveThumbnailData,
  ViewerPage,
  ViewerSession,
  ItemMetadata,
  TagEntry,
  ItemTags,
  ReadingHistoryEntry,
  PageBookmarkEntry,
  ClipboardImageResult
} from "./contracts";

let requestSequence = 0;

function context(generation: number): RequestContext {
  requestSequence += 1;
  return {
    apiVersion: API_VERSION,
    requestId: `ui-${requestSequence}` as RequestId,
    generation: generation as Generation,
  };
}

export async function registerLibraryRoot(
  absolutePath: string,
  generation: number,
): Promise<ApiResponse<{ absolutePath: string }>> {
  return invoke("set_library_root", {
    context: context(generation),
    absolutePath,
  });
}

export async function pickLibraryRoot(
  generation: number,
): Promise<ApiResponse<{ absolutePath: string } | null>> {
  return invoke("pick_library_root", {
    context: context(generation),
  });
}

export async function pickSearchSource(
  generation: number,
): Promise<ApiResponse<{ absolutePath: string } | null>> {
  return invoke("pick_search_source", { context: context(generation) });
}

export async function pickLibraryFile(
  generation: number,
): Promise<ApiResponse<{ absolutePath: string } | null>> {
  return invoke("pick_library_file", { context: context(generation) });
}

export async function restoreLibraryRoot(
  generation: number,
): Promise<ApiResponse<{ absolutePath: string } | null>> {
  return invoke("get_library_root", {
    context: context(generation),
  });
}

export async function takeCliLaunchRequest(
  generation: number,
): Promise<ApiResponse<CliLaunchRequest | null>> {
  return invoke("take_cli_launch_request", {
    context: context(generation),
  });
}

export async function listenCliLaunchPending(
  handler: () => void,
): Promise<UnlistenFn> {
  return listen("cli-launch-pending", handler);
}

export async function listShelves(generation: number): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("list_shelves", { context: context(generation) });
}

export async function createShelf(
  name: string,
  icon: ShelfIcon,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("create_shelf", { context: context(generation), name, icon });
}

export async function updateShelf(
  shelfId: number,
  name: string,
  icon: ShelfIcon,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("update_shelf", { context: context(generation), shelfId, name, icon });
}

export async function deleteShelf(
  shelfId: number,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("delete_shelf", { context: context(generation), shelfId, confirmed: true });
}

export async function saveStartupShelf(
  shelfId: number | null,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("set_startup_shelf", { context: context(generation), shelfId });
}

export async function createShelfFolder(
  shelfId: number,
  parentId: number | null,
  name: string,
  icon: ShelfIcon,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("create_shelf_folder", {
    context: context(generation), shelfId, parentId, name, icon,
  });
}

export async function addShelfItems(
  shelfId: number,
  parentId: number | null,
  relativePaths: string[],
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("add_shelf_items", {
    context: context(generation),
    request: { shelfId, parentId, relativePaths },
  });
}

export async function migrateLegacyShelf(
  relativePaths: string[],
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("migrate_legacy_shelf", {
    context: context(generation), relativePaths,
  });
}

export async function updateShelfNode(
  nodeId: number,
  parentId: number | null,
  name: string,
  icon: ShelfIcon,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("update_shelf_node", {
    context: context(generation), nodeId, parentId, name, icon,
  });
}

export async function deleteShelfNodes(
  nodeIds: number[],
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("delete_shelf_nodes", {
    context: context(generation), nodeIds, confirmed: true,
  });
}

export async function previewShelfNodeDelete(
  nodeId: number,
  generation: number,
): Promise<ApiResponse<ShelfNodeDeletePreview>> {
  return invoke("preview_shelf_node_delete", { context: context(generation), nodeId });
}

export async function executeShelfNodeDelete(
  nodeId: number,
  previewKey: string,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("execute_shelf_node_delete", {
    context: context(generation), nodeId, previewKey, confirmed: true,
  });
}

export async function reorderShelves(
  orderedIds: number[],
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("reorder_shelves", { context: context(generation), orderedIds });
}

export async function reorderShelfNodes(
  shelfId: number,
  parentId: number | null,
  orderedIds: number[],
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("reorder_shelf_nodes", {
    context: context(generation), shelfId, parentId, orderedIds,
  });
}

export async function previewShelfCleanup(
  shelfId: number,
  generation: number,
): Promise<ApiResponse<ShelfCleanupPreview>> {
  return invoke("preview_shelf_cleanup", { context: context(generation), shelfId });
}

export async function executeShelfCleanup(
  shelfId: number,
  nodeIds: number[],
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("execute_shelf_cleanup", {
    context: context(generation), shelfId, nodeIds, confirmed: true,
  });
}

export async function openShelfItem(
  nodeId: number,
  generation: number,
): Promise<ApiResponse<CliLaunchPlan>> {
  return invoke("open_shelf_item", { context: context(generation), nodeId });
}

export async function exportShelvesText(
  shelfId: number | null,
  generation: number,
): Promise<ApiResponse<ShelfTextExport>> {
  return invoke("export_shelves_text", { context: context(generation), shelfId });
}

export async function previewShelvesImport(
  bytes: number[],
  replaceExisting: boolean,
  generation: number,
): Promise<ApiResponse<ShelfImportPreview>> {
  return invoke("preview_shelves_import", {
    context: context(generation), bytes, replaceExisting,
  });
}

export async function executeShelvesImport(
  bytes: number[],
  replaceExisting: boolean,
  previewKey: string,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("execute_shelves_import", {
    context: context(generation), bytes, replaceExisting, previewKey, confirmed: true,
  });
}

export async function listOfflineMedia(generation: number): Promise<ApiResponse<OfflineMediaCatalog>> {
  return invoke("list_offline_media", { context: context(generation) });
}

export async function registerOfflineMedia(
  name: string,
  icon: OfflineMediaIcon,
  generation: number,
): Promise<ApiResponse<OfflineMediaCatalog>> {
  return invoke("register_offline_media", {
    context: context(generation), request: { name, icon },
  });
}

export async function cancelOfflineMediaRegistration(generation: number): Promise<ApiResponse<boolean>> {
  return invoke("cancel_offline_media_registration", { context: context(generation) });
}

export async function getOfflineMedia(mediaId: number, generation: number): Promise<ApiResponse<OfflineMediaDetail>> {
  return invoke("get_offline_media", { context: context(generation), mediaId });
}

export async function getOfflineMediaThumbnail(
  mediaId: number,
  relativePath: string,
  generation: number,
): Promise<ApiResponse<OfflineMediaThumbnailPayload | null>> {
  return invoke("get_offline_media_thumbnail", { context: context(generation), mediaId, relativePath });
}

export async function setOfflineMediaIcon(
  mediaId: number,
  icon: OfflineMediaIcon,
  generation: number,
): Promise<ApiResponse<OfflineMediaCatalog>> {
  return invoke("set_offline_media_icon", { context: context(generation), mediaId, icon });
}

export async function deleteOfflineMedia(mediaId: number, generation: number): Promise<ApiResponse<OfflineMediaCatalog>> {
  return invoke("delete_offline_media", { context: context(generation), mediaId, confirmed: true });
}

export async function listViewerFilterSets(generation: number): Promise<ApiResponse<ViewerFilterCatalog>> {
  return invoke("list_viewer_filter_sets", { context: context(generation) });
}

export async function saveViewerFilterSet(name: string, chain: ViewerFilterStep[], overwrite: boolean, generation: number): Promise<ApiResponse<ViewerFilterCatalog>> {
  return invoke("save_viewer_filter_set", { context: context(generation), request: { name, chain, overwrite } });
}

export async function activateViewerFilterSet(filterSetId: number | null, generation: number): Promise<ApiResponse<ViewerFilterCatalog>> {
  return invoke("activate_viewer_filter_set", { context: context(generation), filterSetId });
}

export async function deleteViewerFilterSet(filterSetId: number, generation: number): Promise<ApiResponse<ViewerFilterCatalog>> {
  return invoke("delete_viewer_filter_set", { context: context(generation), filterSetId, confirmed: true });
}

export async function openOfflineMediaEntry(
  mediaId: number,
  relativePath: string,
  generation: number,
): Promise<ApiResponse<CliLaunchPlan>> {
  return invoke("open_offline_media_entry", { context: context(generation), mediaId, relativePath });
}

export async function setFullscreenDisplayAwake(
  enabled: boolean,
  generation: number,
): Promise<ApiResponse<boolean>> {
  return invoke("set_fullscreen_display_awake", {
    context: context(generation),
    enabled,
  });
}

export async function listWindowsDrives(
  generation: number,
): Promise<ApiResponse<WindowsDrive[]>> {
  return invoke("list_windows_drives", {
    context: context(generation),
  });
}

export async function listWindowsKnownFolders(
  generation: number,
): Promise<ApiResponse<WindowsKnownFolder[]>> {
  return invoke("list_windows_known_folders", { context: context(generation) });
}

export async function saveShortcutBindings(
  shortcuts: ShortcutBindings,
  generation: number,
): Promise<ApiResponse<ShortcutBindings>> {
  return invoke("set_shortcut_bindings", {
    context: context(generation),
    shortcuts,
  });
}

export async function saveViewerSettings(
  settings: Pick<
    CatalogSettings,
    | "viewMode"
    | "spreadPortraitMaxAspectPercent"
    | "autoSpreadMinViewportAspectPercent"
    | "spreadFirstPageSingle"
    | "spreadPairing"
    | "fitAllowUpscale"
    | "fitBasis"
    | "fitIncludePageMargin"
    | "readingDirection"
    | "scaleMode"
    | "scale"
    | "loupeEnabled"
    | "viewerBackground"
    | "viewerPageMargin"
    | "viewerSpreadGap"
    | "cursorAutoHideMs"
  >,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("set_viewer_settings", {
    context: context(generation),
    viewMode: settings.viewMode,
    spreadPortraitMaxAspectPercent: settings.spreadPortraitMaxAspectPercent,
    autoSpreadMinViewportAspectPercent: settings.autoSpreadMinViewportAspectPercent,
    spreadFirstPageSingle: settings.spreadFirstPageSingle,
    spreadPairing: settings.spreadPairing,
    fitAllowUpscale: settings.fitAllowUpscale,
    fitBasis: settings.fitBasis,
    fitIncludePageMargin: settings.fitIncludePageMargin,
    readingDirection: settings.readingDirection,
    scaleMode: settings.scaleMode,
    scale: settings.scale,
    loupeEnabled: settings.loupeEnabled,
    viewerBackground: settings.viewerBackground,
    viewerPageMargin: settings.viewerPageMargin,
    viewerSpreadGap: settings.viewerSpreadGap,
    cursorAutoHideMs: settings.cursorAutoHideMs,
  });
}

export async function saveSettingsProfile(
  profile: SettingsProfile,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("set_settings_profile", {
    context: context(generation),
    profile: {
      sortField: profile.sortField,
      sortDescending: profile.sortDescending,
      endOfVolumePolicy: profile.endOfVolumePolicy,
      catalogViewMode: profile.catalogViewMode,
      catalogThumbnailSizes: profile.catalogThumbnailSizes,
      viewMode: profile.viewMode,
      spreadPortraitMaxAspectPercent: profile.spreadPortraitMaxAspectPercent,
      autoSpreadMinViewportAspectPercent: profile.autoSpreadMinViewportAspectPercent,
      spreadFirstPageSingle: profile.spreadFirstPageSingle,
      spreadPairing: profile.spreadPairing,
      fitAllowUpscale: profile.fitAllowUpscale,
      fitBasis: profile.fitBasis,
      fitIncludePageMargin: profile.fitIncludePageMargin,
      readingDirection: profile.readingDirection,
      scaleMode: profile.scaleMode,
      scale: profile.scale,
      loupeEnabled: profile.loupeEnabled,
      loupeSize: profile.loupeSize,
      loupeZoom: profile.loupeZoom,
      prefetchAhead: profile.prefetchAhead,
      prefetchBehind: profile.prefetchBehind,
      prefetchMemoryMiB: profile.prefetchMemoryMiB,
      fullscreenEscapeBehavior: profile.fullscreenEscapeBehavior,
      preventDisplaySleepFullscreen: profile.preventDisplaySleepFullscreen,
      trayStoreOnMinimize: profile.trayStoreOnMinimize,
      trayCloseBehavior: profile.trayCloseBehavior,
      trayRestoreGesture: profile.trayRestoreGesture,
      slideshowIntervalMs: profile.slideshowIntervalMs,
      slideshowOrder: profile.slideshowOrder,
      slideshowRepeatCurrentItem: profile.slideshowRepeatCurrentItem,
      viewerCatalogSelectionSync: profile.viewerCatalogSelectionSync,
      viewerBackground: profile.viewerBackground,
      viewerPageMargin: profile.viewerPageMargin,
      viewerSpreadGap: profile.viewerSpreadGap,
      cursorAutoHideMs: profile.cursorAutoHideMs,
      zoomRetention: profile.zoomRetention,
      viewerGridEnabled: profile.viewerGridEnabled,
      viewerGridSize: profile.viewerGridSize,
      viewerGridColor: profile.viewerGridColor,
      panFactor: profile.panFactor,
      wheelDeadZone: profile.wheelDeadZone,
      scrollStepPercent: profile.scrollStepPercent,
      keyScrollAccelerationPercent: profile.keyScrollAccelerationPercent,
      keyScrollContinuous: profile.keyScrollContinuous,
      smoothScroll: profile.smoothScroll,
      pageScanMode: profile.pageScanMode,
      treeVisible: profile.treeVisible,
      treeAutoCollapse: profile.treeAutoCollapse,
      treeConfirmChildren: profile.treeConfirmChildren,
      treeWidth: profile.treeWidth,
      treeHeight: profile.treeHeight,
      catalogPanePosition: profile.catalogPanePosition,
      menuBarVisible: profile.menuBarVisible,
      toolbarVisible: profile.toolbarVisible,
      addressBarVisible: profile.addressBarVisible,
      statusBarVisible: profile.statusBarVisible,
      alwaysOnTop: profile.alwaysOnTop,
      themeSelection: profile.themeSelection,
      customThemeSnapshot: profile.customThemeSnapshot,
      navigationSelectionPolicy: profile.navigationSelectionPolicy,
      thumbnailGenerationScope: profile.thumbnailGenerationScope,
      startupLocation: profile.startupLocation,
      showHiddenFiles: profile.showHiddenFiles,
      restoreLastViewer: profile.restoreLastViewer,
      autoRefreshCurrentFolder: profile.autoRefreshCurrentFolder,
      folderOpenRule: profile.folderOpenRule,
      imageOpenRule: profile.imageOpenRule,
      archiveOpenRule: profile.archiveOpenRule,
      detailGridLines: profile.detailGridLines,
      detailRowDensity: profile.detailRowDensity,
      detailShowKind: profile.detailShowKind,
      detailShowSize: profile.detailShowSize,
      detailShowModified: profile.detailShowModified,
      shortcuts: profile.shortcuts,
      catalogMouseBindings: profile.catalogMouseBindings,
      viewerQuadrantBindings: profile.viewerQuadrantBindings,
      viewerRightClickAction: profile.viewerRightClickAction,
      mouseGestures: profile.mouseGestures,
    },
  });
}

export async function listCustomThemes(
  generation: number,
): Promise<ApiResponse<CustomThemeCatalog>> {
  return invoke("list_custom_themes", { context: context(generation) });
}

export async function saveCustomTheme(
  request: {
    themeId: number | null;
    expectedRevision: number | null;
    definition: ThemeDefinitionV1;
  },
  generation: number,
): Promise<ApiResponse<CustomThemeCatalog>> {
  return invoke("save_custom_theme", {
    context: context(generation),
    request,
  });
}

export async function deleteCustomTheme(
  themeId: number,
  confirmed: boolean,
  generation: number,
): Promise<ApiResponse<CustomThemeCatalog>> {
  return invoke("delete_custom_theme", {
    context: context(generation),
    themeId,
    confirmed,
  });
}

export async function exportCustomTheme(
  themeId: number,
  generation: number,
): Promise<ApiResponse<CustomThemeExport>> {
  return invoke("export_custom_theme", {
    context: context(generation),
    themeId,
  });
}

export async function previewCustomThemeImport(
  bytes: number[],
  generation: number,
): Promise<ApiResponse<CustomThemeImportPreview>> {
  return invoke("preview_custom_theme_import", {
    context: context(generation),
    bytes,
  });
}

export async function executeCustomThemeImport(
  bytes: number[],
  confirmationKey: string,
  replaceExisting: boolean,
  generation: number,
): Promise<ApiResponse<CustomThemeCatalog>> {
  return invoke("execute_custom_theme_import", {
    context: context(generation),
    bytes,
    confirmationKey,
    replaceExisting,
  });
}

function nativeSettingsProfile(profile: SettingsProfile): NativeSettingsProfile {
  const { profileVersion: _profileVersion, ...native } = profile;
  return native;
}

export async function listNamedSettingsProfiles(
  generation: number,
): Promise<ApiResponse<NamedSettingsProfileSummary[]>> {
  return invoke("list_named_settings_profiles", { context: context(generation) });
}

export async function saveNamedSettingsProfile(
  name: string,
  profile: SettingsProfile,
  overwrite: boolean,
  generation: number,
): Promise<ApiResponse<NamedSettingsProfileSummary>> {
  return invoke("save_named_settings_profile", {
    context: context(generation),
    name,
    profile: nativeSettingsProfile(profile),
    overwrite,
  });
}

export async function previewNamedSettingsProfileSwitch(
  name: string,
  generation: number,
): Promise<ApiResponse<SettingsProfileSwitchPreview>> {
  const response = await invoke<ApiResponse<{
    name: string;
    changedFieldCount: number;
    profile: NativeSettingsProfile;
    confirmationKey: string;
  }>>("preview_named_settings_profile_switch", {
    context: context(generation),
    name,
  });
  if (response.status !== "ok") return response;
  return {
    ...response,
    data: {
      ...response.data,
      profile: {
        profileVersion: SETTINGS_PROFILE_VERSION,
        ...response.data.profile,
      },
    },
  };
}

export async function executeNamedSettingsProfileSwitch(
  name: string,
  confirmationKey: string,
  confirmed: boolean,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("execute_named_settings_profile_switch", {
    context: context(generation),
    name,
    confirmationKey,
    confirmed,
  });
}

export async function deleteNamedSettingsProfile(
  name: string,
  confirmed: boolean,
  generation: number,
): Promise<ApiResponse<boolean>> {
  return invoke("delete_named_settings_profile", {
    context: context(generation),
    name,
    confirmed,
  });
}

export async function getTrayStatus(
  generation: number,
): Promise<ApiResponse<TrayStatus>> {
  return invoke("get_tray_status", { context: context(generation) });
}

export async function storeMainWindowInTray(
  generation: number,
): Promise<ApiResponse<TrayStatus>> {
  return invoke("store_main_window_in_tray", { context: context(generation) });
}

export async function restoreMainWindowFromTray(
  generation: number,
): Promise<ApiResponse<TrayStatus>> {
  return invoke("restore_main_window_from_tray", { context: context(generation) });
}

export async function quitApplication(
  generation: number,
): Promise<ApiResponse<void>> {
  return invoke("quit_application", { context: context(generation) });
}

export async function getCatalogSettings(
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("get_catalog_settings", { context: context(generation) });
}

export async function resolveCatalogActivation(
  kind: ItemKind,
  trigger: CatalogActivationTrigger,
  generation: number,
): Promise<ApiResponse<CatalogActivationAction>> {
  return invoke("resolve_catalog_activation", {
    context: context(generation),
    kind,
    trigger,
  });
}

export async function resolveViewerRectangleZoom(
  input: ViewerRectangleZoomInput,
  generation: number,
): Promise<ApiResponse<ViewerRectangleZoomPlan>> {
  return invoke("resolve_viewer_rectangle_zoom", {
    context: context(generation),
    input,
  });
}

export async function listFavorites(
  generation: number,
): Promise<ApiResponse<FavoriteEntry[]>> {
  return invoke("list_favorites", { context: context(generation) });
}

export async function addFavorite(
  itemRelativePath: string,
  generation: number,
): Promise<ApiResponse<FavoriteEntry[]>> {
  return invoke("add_favorite", {
    context: context(generation),
    itemRelativePath,
  });
}

export async function removeFavorite(
  favoriteId: string,
  generation: number,
): Promise<ApiResponse<FavoriteEntry[]>> {
  return invoke("remove_favorite", {
    context: context(generation),
    favoriteId,
  });
}

export async function resolveFavorite(
  favoriteId: string,
  itemRelativePath: string,
  generation: number,
): Promise<ApiResponse<FavoriteEntry[]>> {
  return invoke("resolve_favorite", {
    context: context(generation),
    favoriteId,
    itemRelativePath,
  });
}

export async function takeRecoveryNotice(
  generation: number,
): Promise<ApiResponse<boolean>> {
  return invoke("take_recovery_notice", { context: context(generation) });
}

export async function saveCatalogSort(
  settings: Pick<CatalogSettings, "sortField" | "sortDescending">,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("set_catalog_sort", {
    context: context(generation),
    sortField: settings.sortField,
    sortDescending: settings.sortDescending,
  });
}

export async function saveEndOfVolumePolicy(
  policy: EndOfVolumePolicy,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("set_end_of_volume_policy", {
    context: context(generation),
    policy,
  });
}

export async function saveCatalogViewMode(
  catalogViewMode: CatalogViewMode,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("set_catalog_view_mode", {
    context: context(generation),
    catalogViewMode,
  });
}

export async function listFolder(
  relativePath: string,
  generation: number,
): Promise<ApiResponse<CatalogEntry[]>> {
  return invoke("list_folder", {
    context: context(generation),
    relativePath,
  });
}

export async function listenCatalogFolderChanges(
  handler: (change: CatalogFolderChange) => void,
): Promise<UnlistenFn> {
  return listen<CatalogFolderChange>("catalog-folder-changed", (event) => handler(event.payload));
}

export async function watchLibraryFolder(
  relativePath: string,
  generation: number,
): Promise<ApiResponse<boolean>> {
  return invoke("watch_library_folder", {
    context: context(generation),
    relativePath,
  });
}

export async function stopLibraryFolderWatch(
  generation: number,
): Promise<ApiResponse<boolean>> {
  return invoke("stop_library_folder_watch", { context: context(generation) });
}

export async function renameFileItem(
  itemRelativePath: string,
  newName: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("rename_file_item", {
    context: context(generation),
    itemRelativePath,
    newName,
  });
}

export async function getRenamePreferences(generation: number): Promise<ApiResponse<RenamePreferences>> {
  return invoke("get_rename_preferences", { context: context(generation) });
}

export async function saveRenamePreferences(
  preferences: RenamePreferences,
  generation: number,
): Promise<ApiResponse<RenamePreferences>> {
  return invoke("save_rename_preferences", { context: context(generation), preferences });
}

export async function previewBatchRename(
  itemRelativePaths: string[],
  baseName: string,
  preferences: RenamePreferences,
  generation: number,
): Promise<ApiResponse<BatchRenamePreview>> {
  return invoke("preview_batch_rename", {
    context: context(generation), itemRelativePaths, baseName, preferences,
  });
}

export async function executeBatchRename(
  itemRelativePaths: string[],
  baseName: string,
  preferences: RenamePreferences,
  previewKey: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("execute_batch_rename", {
    context: context(generation), itemRelativePaths, baseName, preferences, previewKey, confirmed: true,
  });
}

export async function createFileFolder(
  parentRelativePath: string,
  name: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("create_file_folder", {
    context: context(generation),
    parentRelativePath,
    name,
  });
}

export async function copyFileItemsToFolder(
  itemRelativePaths: string[],
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("copy_file_items_to_folder", {
    context: context(generation),
    itemRelativePaths,
  });
}

export async function moveFileItemsToFolder(
  itemRelativePaths: string[],
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("move_file_items_to_folder", {
    context: context(generation),
    itemRelativePaths,
  });
}

export async function moveFileItemsToDestination(
  itemRelativePaths: string[],
  destinationRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("move_file_items_to_destination", {
    context: context(generation),
    itemRelativePaths,
    destinationRelativePath,
  });
}

export async function copyFileItemsToDestination(
  itemRelativePaths: string[],
  destinationRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("copy_file_items_to_destination", {
    context: context(generation),
    itemRelativePaths,
    destinationRelativePath,
  });
}

export async function previewNativeFileDrop(
  absolutePaths: string[],
  destinationRelativePath: string,
  generation: number,
): Promise<ApiResponse<NativeFileDropPreview>> {
  return invoke("preview_native_file_drop", {
    context: context(generation),
    absolutePaths,
    destinationRelativePath,
  });
}

export async function copyNativeFileDrop(
  absolutePaths: string[],
  destinationRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("copy_native_file_drop", {
    context: context(generation),
    absolutePaths,
    destinationRelativePath,
  });
}

export async function startNativeFileDrag(
  itemRelativePaths: string[],
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("start_native_file_drag", {
    context: context(generation),
    itemRelativePaths,
  });
}

export async function deleteFileItems(
  itemRelativePaths: string[],
  permanent: boolean,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("delete_file_items", {
    context: context(generation),
    itemRelativePaths,
    permanent,
  });
}

export async function getFileUndoStatus(
  generation: number,
): Promise<ApiResponse<FileUndoStatus>> {
  return invoke("get_file_undo_status", { context: context(generation) });
}

export async function undoLastFileOperation(
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("undo_last_file_operation", { context: context(generation) });
}

export async function setFileClipboard(
  itemRelativePaths: string[],
  cut: boolean,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("set_file_clipboard", {
    context: context(generation),
    itemRelativePaths,
    cut,
  });
}

export async function getFileClipboardStatus(
  generation: number,
): Promise<ApiResponse<FileClipboardStatus>> {
  return invoke("file_clipboard_status", { context: context(generation) });
}

export async function pasteFileItems(
  destinationRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("paste_file_items", {
    context: context(generation),
    destinationRelativePath,
  });
}

export async function revealFileItem(
  itemRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("reveal_file_item", {
    context: context(generation),
    itemRelativePath,
  });
}

export async function openFileItemDefault(
  itemRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("open_file_item_default", {
    context: context(generation),
    itemRelativePath,
  });
}

export async function openFileItemWith(
  itemRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("open_file_item_with", {
    context: context(generation),
    itemRelativePath,
  });
}

export async function listExternalApps(generation: number): Promise<ApiResponse<ExternalAppEntry[]>> {
  return invoke("list_external_apps", { context: context(generation) });
}

export async function registerExternalApp(
  displayName: string,
  fixedArgs: string[],
  targetMode: ExternalAppTargetMode,
  generation: number,
): Promise<ApiResponse<ExternalAppEntry>> {
  return invoke("register_external_app", { context: context(generation), displayName, fixedArgs, targetMode });
}

export async function updateExternalApp(
  appId: number,
  displayName: string,
  fixedArgs: string[],
  targetMode: ExternalAppTargetMode,
  generation: number,
): Promise<ApiResponse<ExternalAppEntry>> {
  return invoke("update_external_app", { context: context(generation), appId, displayName, fixedArgs, targetMode });
}

export async function deleteExternalApp(appId: number, generation: number): Promise<ApiResponse<boolean>> {
  return invoke("delete_external_app", { context: context(generation), appId });
}

export async function previewExternalAppLaunch(
  appId: number,
  itemRelativePaths: string[],
  generation: number,
): Promise<ApiResponse<ExternalAppLaunchPreview>> {
  return invoke("preview_external_app_launch", { context: context(generation), appId, itemRelativePaths });
}

export async function launchExternalApp(
  appId: number,
  itemRelativePaths: string[],
  previewKey: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("launch_external_app", {
    context: context(generation), appId, itemRelativePaths, previewKey, confirmed: true,
  });
}

export async function listExternalAppHistory(
  generation: number,
): Promise<ApiResponse<ExternalAppHistoryEntry[]>> {
  return invoke("list_external_app_history", { context: context(generation) });
}

export async function searchLibrary(
  query: string,
  generation: number,
  options: SearchRequestOptions,
): Promise<ApiResponse<SearchResultEntry[]>> {
  return invoke("search_library", {
    context: context(generation),
    query,
    options,
  });
}

export async function evaluateCatalogMask(
  mask: string,
  candidates: CatalogMaskCandidate[],
  options: CatalogMaskOptions,
  generation: number,
): Promise<ApiResponse<boolean[]>> {
  return invoke("evaluate_catalog_mask", {
    context: context(generation),
    mask,
    candidates,
    options,
  });
}

export async function listCatalogMasks(
  generation: number,
): Promise<ApiResponse<SavedCatalogMask[]>> {
  return invoke("list_catalog_masks", { context: context(generation) });
}

export async function saveCatalogMask(
  name: string,
  expression: string,
  options: CatalogMaskOptions,
  generation: number,
): Promise<ApiResponse<SavedCatalogMask[]>> {
  return invoke("save_catalog_mask", {
    context: context(generation),
    name,
    expression,
    options,
  });
}

export async function deleteCatalogMask(
  name: string,
  generation: number,
): Promise<ApiResponse<SavedCatalogMask[]>> {
  return invoke("delete_catalog_mask", {
    context: context(generation),
    name,
  });
}

export async function listCsvExportPresets(
  generation: number,
): Promise<ApiResponse<CsvExportPreset[]>> {
  return invoke("list_csv_export_presets", { context: context(generation) });
}

export async function saveCsvExportPreset(
  name: string,
  config: CsvExportConfig,
  overwrite: boolean,
  generation: number,
): Promise<ApiResponse<CsvExportPreset>> {
  return invoke("save_csv_export_preset", {
    context: context(generation),
    name,
    config,
    overwrite,
  });
}

export async function deleteCsvExportPreset(
  name: string,
  generation: number,
): Promise<ApiResponse<void>> {
  return invoke("delete_csv_export_preset", {
    context: context(generation),
    name,
    confirmed: true,
  });
}

export async function exportCatalogCsv(
  request: {
    config: CsvExportConfig;
    scope: CsvExportScope;
    currentPath: string;
    selectedPaths: string[];
  },
  generation: number,
): Promise<ApiResponse<CsvExportResult>> {
  return invoke("export_catalog_csv", {
    context: context(generation),
    request,
  });
}

export async function diagnoseLibrary(
  baseline: DiagnosticSnapshotEntry[] | null,
  generation: number,
  retry = false,
): Promise<ApiResponse<DiagnosticReport>> {
  return invoke("diagnose_library", {
    context: context(generation),
    baseline,
    retry,
  });
}

export async function cancelLibraryDiagnostics(
  generation: number,
): Promise<ApiResponse<void>> {
  const request = context(generation);
  return invoke("cancel_library_diagnostics", {
    requestId: request.requestId,
    generation: request.generation,
  });
}

export async function getThumbnail(
  itemRelativePath: string,
  generation: number,
  retry = false,
  priority: "visible" | "near" | "background" = "visible",
): Promise<ApiResponse<ThumbnailData>> {
  return invoke("get_thumbnail", {
    context: context(generation),
    itemRelativePath,
    retry,
    priority,
  });
}

export async function listenRecursiveThumbnailProgress(
  handler: (progress: RecursiveThumbnailProgress) => void,
): Promise<UnlistenFn> {
  return listen<RecursiveThumbnailProgress>("recursive-thumbnail-progress", (event) =>
    handler(event.payload));
}

export async function generateRecursiveThumbnails(
  relativePath: string,
  generation: number,
): Promise<ApiResponse<RecursiveThumbnailReport>> {
  return invoke("generate_recursive_thumbnails", {
    context: context(generation),
    relativePath,
  });
}

export async function cancelRecursiveThumbnailGeneration(
  generation: number,
): Promise<ApiResponse<void>> {
  const request = context(generation);
  return invoke("cancel_recursive_thumbnail_generation", {
    requestId: request.requestId,
    generation: request.generation,
  });
}

export async function listArchiveVirtualTree(
  archiveRelativePath: string,
  generation: number,
): Promise<ApiResponse<ArchiveVirtualTreeSnapshot>> {
  return invoke("list_archive_virtual_tree", {
    context: context(generation),
    archiveRelativePath,
  });
}

export async function getArchiveThumbnail(
  archiveRelativePath: string,
  pageKey: string,
  generation: number,
  priority: "visible" | "near" | "background" = "visible",
): Promise<ApiResponse<ArchiveThumbnailData>> {
  return invoke("get_archive_thumbnail", {
    context: context(generation),
    archiveRelativePath,
    pageKey,
    priority,
  });
}

export async function copyArchivePageToClipboard(
  archiveRelativePath: string,
  pageKey: string,
  generation: number,
): Promise<ApiResponse<ClipboardImageResult>> {
  return invoke("copy_archive_page_to_clipboard", {
    context: context(generation),
    archiveRelativePath,
    pageKey,
  });
}

export async function listTreeChildren(
  relativePath: string,
  generation: number,
): Promise<ApiResponse<TreeEntry[]>> {
  return invoke("list_tree_children", {
    context: context(generation),
    relativePath,
  });
}

export async function getItemTags(
  itemIdentity: string,
  generation: number,
): Promise<ApiResponse<ItemTags>> {
  return invoke("get_item_tags", {
    context: context(generation),
    itemIdentity,
  });
}

export async function listTags(
  generation: number,
): Promise<ApiResponse<TagEntry[]>> {
  return invoke("list_tags", { context: context(generation) });
}

export async function queryTags(
  query: string,
  generation: number,
): Promise<ApiResponse<TagEntry[]>> {
  return invoke("query_tags", {
    context: context(generation),
    query,
  });
}

export async function assignTag(
  itemIdentity: string,
  tagName: string,
  generation: number,
): Promise<ApiResponse<ItemTags>> {
  return invoke("assign_tag", {
    context: context(generation),
    itemIdentity,
    tagName,
  });
}

export async function removeTag(
  itemIdentity: string,
  tagId: string,
  generation: number,
): Promise<ApiResponse<ItemTags>> {
  return invoke("remove_tag", {
    context: context(generation),
    itemIdentity,
    tagId,
  });
}

export async function renameTag(
  tagId: string,
  newName: string,
  generation: number,
): Promise<ApiResponse<TagEntry>> {
  return invoke("rename_tag", {
    context: context(generation),
    tagId,
    newName,
  });
}

export async function openComic(
  itemRelativePath: string,
  generation: number,
): Promise<ApiResponse<ViewerSession>> {
  return invoke("open_comic", {
    context: context(generation),
    itemRelativePath,
  });
}

export async function getItemMetadata(
  itemIdentity: string,
  generation: number,
): Promise<ApiResponse<ItemMetadata>> {
  return invoke("get_item_metadata", {
    context: context(generation),
    itemIdentity,
  });
}

export async function saveItemMemo(
  itemIdentity: string,
  body: string,
  generation: number,
): Promise<ApiResponse<ItemMetadata>> {
  return invoke("save_item_memo", {
    context: context(generation),
    itemIdentity,
    body,
  });
}

export async function setItemRating(
  itemIdentity: string,
  rating: number | null,
  generation: number,
): Promise<ApiResponse<ItemMetadata>> {
  return invoke("set_item_rating", {
    context: context(generation),
    itemIdentity,
    rating,
  });
}

export async function listReadingHistory(
  generation: number,
): Promise<ApiResponse<ReadingHistoryEntry[]>> {
  return invoke("list_reading_history", { context: context(generation) });
}

export async function clearReadingHistory(
  generation: number,
): Promise<ApiResponse<void>> {
  return invoke("clear_reading_history", { context: context(generation) });
}

export async function listPageBookmarks(
  itemKey: string,
  generation: number,
): Promise<ApiResponse<PageBookmarkEntry[]>> {
  return invoke("list_page_bookmarks", {
    context: context(generation),
    itemKey,
  });
}

export async function savePageBookmark(
  bookmark: PageBookmarkEntry,
  generation: number,
): Promise<ApiResponse<PageBookmarkEntry[]>> {
  return invoke("save_page_bookmark", {
    context: context(generation),
    ...bookmark,
  });
}

export async function deletePageBookmark(
  itemKey: string,
  pageKey: string,
  generation: number,
): Promise<ApiResponse<PageBookmarkEntry[]>> {
  return invoke("delete_page_bookmark", {
    context: context(generation),
    itemKey,
    pageKey,
  });
}

export async function loadPage(
  session: ViewerSession,
  index: number,
  generation: number,
  priority: "visible" | "near" | "background" = "visible",
): Promise<ApiResponse<{ pageId: PageId; mediaUri: string }>> {
  return invoke("load_page", {
    context: context(generation),
    itemRelativePath: session.itemKey,
    pageRelativePath: session.pages[index].relativePath,
    priority,
  });
}

export async function copyViewerPageToClipboard(
  session: ViewerSession,
  index: number,
  generation: number,
): Promise<ApiResponse<ClipboardImageResult>> {
  return invoke("copy_viewer_page_to_clipboard", {
    context: context(generation),
    itemRelativePath: session.itemKey,
    pageRelativePath: session.pages[index].relativePath,
  });
}

export async function saveReadingPosition(
  session: ViewerSession,
  index: number,
  generation: number,
): Promise<ApiResponse<void>> {
  return invoke("save_reading_position", {
    context: context(generation),
    itemKey: session.itemKey,
    pageKey: session.pages[index].relativePath,
    naturalOrdinal: index,
  });
}
