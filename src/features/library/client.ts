import { invoke } from "@tauri-apps/api/core";
import {
  API_VERSION,
  type ApiResponse,
  type RequestContext,
} from "../../types/api";
import type {
  CatalogEntry,
  Generation,
  ItemKind,
  PageId,
  RelativePath,
  RequestId,
} from "../../types/domain";
import type { ScaleMode, ViewerLayoutMode } from "../viewer/model";
import type { EndOfVolumePolicy } from "../catalog/end-of-volume";
import type { CatalogViewMode } from "../catalog/view-mode";
import type { SearchRequestOptions } from "../catalog/search-options";
import type { ShortcutBindings } from "../input/shortcuts";
import type { MouseGestureBindings, SettingsProfile } from "../settings/profile";

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

export async function restoreLibraryRoot(
  generation: number,
): Promise<ApiResponse<{ absolutePath: string } | null>> {
  return invoke("get_library_root", {
    context: context(generation),
  });
}

export interface WindowsDrive {
  absolutePath: string;
  name: string;
}

export async function listWindowsDrives(
  generation: number,
): Promise<ApiResponse<WindowsDrive[]>> {
  return invoke("list_windows_drives", {
    context: context(generation),
  });
}

export interface CatalogSettings {
  sortField: "name" | "modified" | "size" | "kind";
  sortDescending: boolean;
  endOfVolumePolicy: EndOfVolumePolicy;
  catalogViewMode: CatalogViewMode;
  viewMode: "single" | "spread";
  layoutMode: ViewerLayoutMode;
  readingDirection: "rightToLeft" | "leftToRight";
  scaleMode: ScaleMode;
  scale: number;
  loupeEnabled: boolean;
  treeVisible: boolean;
  menuBarVisible: boolean;
  toolbarVisible: boolean;
  shortcuts: ShortcutBindings;
  mouseGestures: MouseGestureBindings;
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
    | "layoutMode"
    | "readingDirection"
    | "scaleMode"
    | "scale"
    | "loupeEnabled"
  >,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("set_viewer_settings", {
    context: context(generation),
    viewMode: settings.viewMode,
    layoutMode: settings.layoutMode,
    readingDirection: settings.readingDirection,
    scaleMode: settings.scaleMode,
    scale: settings.scale,
    loupeEnabled: settings.loupeEnabled,
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
      viewMode: profile.viewMode,
      layoutMode: profile.layoutMode,
      readingDirection: profile.readingDirection,
      scaleMode: profile.scaleMode,
      scale: profile.scale,
      loupeEnabled: profile.loupeEnabled,
      treeVisible: profile.treeVisible,
      menuBarVisible: profile.menuBarVisible,
      toolbarVisible: profile.toolbarVisible,
      shortcuts: profile.shortcuts,
      mouseGestures: profile.mouseGestures,
    },
  });
}

export interface TrayStatus {
  available: boolean;
  stored: boolean;
  reason: string | null;
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

export type FavoriteStatus = "available" | "moved" | "missing";

export interface FavoriteEntry {
  favoriteId: string;
  itemIdentity: string;
  relativePath: RelativePath;
  resolvedPath: RelativePath | null;
  kind: ItemKind | null;
  status: FavoriteStatus;
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

export type FileOperationKind =
  | "rename"
  | "createFolder"
  | "copy"
  | "move"
  | "recycle"
  | "delete"
  | "cut"
  | "clipboardCopy"
  | "pasteCopy"
  | "pasteMove"
  | "reveal"
  | "openDefault"
  | "openWith";

export interface FileOperationResult {
  operation: FileOperationKind;
  affected: number;
}

export interface FileClipboardStatus {
  available: boolean;
  cut: boolean;
  items: number;
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

export async function searchLibrary(
  query: string,
  generation: number,
  options: SearchRequestOptions,
): Promise<ApiResponse<CatalogEntry[]>> {
  return invoke("search_library", {
    context: context(generation),
    query,
    options,
  });
}

export type DiagnosticStatus =
  | "added"
  | "changed"
  | "missing"
  | "duplicate"
  | "corrupt";
export type DiagnosticSeverity = "info" | "warning" | "error";

export interface DiagnosticSnapshotEntry {
  itemIdentity: string;
  relativePath: RelativePath;
  kind: ItemKind;
  byteSize: number | null;
  modifiedMs: number | null;
  contentHash: string;
}

export interface DiagnosticFinding {
  status: DiagnosticStatus;
  severity: DiagnosticSeverity;
  itemIdentity: string;
  relativePath: RelativePath | null;
  kind: ItemKind | null;
  contentHash: string | null;
  message: string;
  retryable: boolean;
}

export interface DiagnosticSummary {
  scanned: number;
  findings: number;
  added: number;
  changed: number;
  missing: number;
  duplicates: number;
  corrupt: number;
  errors: number;
}

export interface DiagnosticReport {
  schema: "fr-b09/v1";
  snapshot: DiagnosticSnapshotEntry[];
  findings: DiagnosticFinding[];
  summary: DiagnosticSummary;
  retryRequested: boolean;
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

export interface ThumbnailData {
  itemRelativePath: RelativePath;
  contentHash: string;
  mediaUri: string;
  cacheHit: boolean;
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

export async function listTreeChildren(
  relativePath: string,
  generation: number,
): Promise<ApiResponse<CatalogEntry[]>> {
  return invoke("list_tree_children", {
    context: context(generation),
    relativePath,
  });
}

export interface ViewerPage {
  id: PageId;
  relativePath: RelativePath;
  mediaUri: string;
}

export interface ViewerSession {
  itemKey: string;
  displayName: string;
  pages: ViewerPage[];
  startIndex: number;
}

export interface ItemMetadata {
  itemIdentity: RelativePath;
  memo: string | null;
  rating: number | null;
}

export interface TagEntry {
  tagId: string;
  name: string;
  itemCount: number;
}

export interface ItemTags {
  itemIdentity: RelativePath;
  tags: TagEntry[];
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

export interface ReadingHistoryEntry {
  itemIdentity: RelativePath;
  lastViewedAtMs: number;
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
