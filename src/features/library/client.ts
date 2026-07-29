import { invoke } from "@tauri-apps/api/core";
import {
  API_VERSION,
  type ApiResponse,
  type RequestContext,
} from "../../types/api";
import type {
  CatalogEntry,
  Generation,
  PageId,
  RelativePath,
  RequestId,
} from "../../types/domain";

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
  viewMode: "single" | "spread";
  readingDirection: "rightToLeft" | "leftToRight";
}

export async function saveViewerSettings(
  settings: Pick<CatalogSettings, "viewMode" | "readingDirection">,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("set_viewer_settings", {
    context: context(generation),
    viewMode: settings.viewMode,
    readingDirection: settings.readingDirection,
  });
}

export async function getCatalogSettings(
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("get_catalog_settings", { context: context(generation) });
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

export async function openComic(
  itemRelativePath: string,
  generation: number,
): Promise<ApiResponse<ViewerSession>> {
  return invoke("open_comic", {
    context: context(generation),
    itemRelativePath,
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
