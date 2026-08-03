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

export async function searchLibrary(
  query: string,
  generation: number,
): Promise<ApiResponse<CatalogEntry[]>> {
  return invoke("search_library", {
    context: context(generation),
    query,
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
