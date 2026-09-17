import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ApiResponse } from "../../../types/api";
import type { CatalogEntry, ItemKind } from "../../../types/domain";
import type { EndOfVolumePolicy } from "../../catalog/end-of-volume";
import type { CatalogViewMode } from "../../catalog/view-mode";
import type { SearchRequestOptions } from "../../catalog/search-options";
import type {
  CatalogSettings,
  CatalogActivationTrigger,
  CatalogActivationAction,
  FavoriteEntry,
  CatalogFolderChange,
  SearchResultEntry,
  CatalogMaskCandidate,
  CatalogMaskOptions,
  SavedCatalogMask,
  CsvExportScope,
  CsvExportConfig,
  CsvExportPreset,
  CsvExportResult,
  DiagnosticSnapshotEntry,
  DiagnosticReport,
  ThumbnailData,
  RecursiveThumbnailProgress,
  RecursiveThumbnailReport,
  TreeEntry,
  ArchiveVirtualTreeSnapshot,
  ArchiveThumbnailData,
  ClipboardImageResult,
} from "./contracts";
import { context } from "./context";

export async function addFavorite(
  itemRelativePath: string,
  generation: number,
): Promise<ApiResponse<FavoriteEntry[]>> {
  return invoke("add_favorite", {
    context: context(generation),
    itemRelativePath,
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

export async function cancelRecursiveThumbnailGeneration(
  generation: number,
): Promise<ApiResponse<void>> {
  const request = context(generation);
  return invoke("cancel_recursive_thumbnail_generation", {
    requestId: request.requestId,
    generation: request.generation,
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

export async function generateRecursiveThumbnails(
  relativePath: string,
  generation: number,
): Promise<ApiResponse<RecursiveThumbnailReport>> {
  return invoke("generate_recursive_thumbnails", {
    context: context(generation),
    relativePath,
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

export async function getCatalogSettings(
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("get_catalog_settings", { context: context(generation) });
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

export async function listArchiveVirtualTree(
  archiveRelativePath: string,
  generation: number,
): Promise<ApiResponse<ArchiveVirtualTreeSnapshot>> {
  return invoke("list_archive_virtual_tree", {
    context: context(generation),
    archiveRelativePath,
  });
}

export async function listCatalogMasks(
  generation: number,
): Promise<ApiResponse<SavedCatalogMask[]>> {
  return invoke("list_catalog_masks", { context: context(generation) });
}

export async function listCsvExportPresets(
  generation: number,
): Promise<ApiResponse<CsvExportPreset[]>> {
  return invoke("list_csv_export_presets", { context: context(generation) });
}

export async function listFavorites(
  generation: number,
): Promise<ApiResponse<FavoriteEntry[]>> {
  return invoke("list_favorites", { context: context(generation) });
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

export async function listTreeChildren(
  relativePath: string,
  generation: number,
): Promise<ApiResponse<TreeEntry[]>> {
  return invoke("list_tree_children", {
    context: context(generation),
    relativePath,
  });
}

export async function listenCatalogFolderChanges(
  handler: (change: CatalogFolderChange) => void,
): Promise<UnlistenFn> {
  return listen<CatalogFolderChange>("catalog-folder-changed", (event) => handler(event.payload));
}

export async function listenRecursiveThumbnailProgress(
  handler: (progress: RecursiveThumbnailProgress) => void,
): Promise<UnlistenFn> {
  return listen<RecursiveThumbnailProgress>("recursive-thumbnail-progress", (event) =>
    handler(event.payload));
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

export async function saveCatalogViewMode(
  catalogViewMode: CatalogViewMode,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("set_catalog_view_mode", {
    context: context(generation),
    catalogViewMode,
  });
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

export async function saveEndOfVolumePolicy(
  policy: EndOfVolumePolicy,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("set_end_of_volume_policy", {
    context: context(generation),
    policy,
  });
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

export async function stopLibraryFolderWatch(
  generation: number,
): Promise<ApiResponse<boolean>> {
  return invoke("stop_library_folder_watch", { context: context(generation) });
}

export async function takeRecoveryNotice(
  generation: number,
): Promise<ApiResponse<boolean>> {
  return invoke("take_recovery_notice", { context: context(generation) });
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

export async function removeFavorite(
  favoriteId: string,
  generation: number,
): Promise<ApiResponse<FavoriteEntry[]>> {
  return invoke("remove_favorite", {
    context: context(generation),
    favoriteId,
  });
}
