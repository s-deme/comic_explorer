import { invoke } from "@tauri-apps/api/core";
import type { ApiResponse } from "../../../types/api";
import type {
  CliLaunchPlan,
  ShelfIcon,
  ShelfSnapshot,
  ShelfCleanupPreview,
  ShelfNodeDeletePreview,
  ShelfTextExport,
  ShelfImportPreview,
} from "./contracts";
import { context } from "./context";

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

export async function createShelf(
  name: string,
  icon: ShelfIcon,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("create_shelf", { context: context(generation), name, icon });
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

export async function deleteShelf(
  shelfId: number,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("delete_shelf", { context: context(generation), shelfId, confirmed: true });
}

export async function deleteShelfNodes(
  nodeIds: number[],
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("delete_shelf_nodes", {
    context: context(generation), nodeIds, confirmed: true,
  });
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

export async function executeShelfNodeDelete(
  nodeId: number,
  previewKey: string,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("execute_shelf_node_delete", {
    context: context(generation), nodeId, previewKey, confirmed: true,
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

export async function exportShelvesText(
  shelfId: number | null,
  generation: number,
): Promise<ApiResponse<ShelfTextExport>> {
  return invoke("export_shelves_text", { context: context(generation), shelfId });
}

export async function listShelves(generation: number): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("list_shelves", { context: context(generation) });
}

export async function migrateLegacyShelf(
  relativePaths: string[],
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("migrate_legacy_shelf", {
    context: context(generation), relativePaths,
  });
}

export async function openShelfItem(
  nodeId: number,
  generation: number,
): Promise<ApiResponse<CliLaunchPlan>> {
  return invoke("open_shelf_item", { context: context(generation), nodeId });
}

export async function previewShelfCleanup(
  shelfId: number,
  generation: number,
): Promise<ApiResponse<ShelfCleanupPreview>> {
  return invoke("preview_shelf_cleanup", { context: context(generation), shelfId });
}

export async function previewShelfNodeDelete(
  nodeId: number,
  generation: number,
): Promise<ApiResponse<ShelfNodeDeletePreview>> {
  return invoke("preview_shelf_node_delete", { context: context(generation), nodeId });
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

export async function reorderShelves(
  orderedIds: number[],
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("reorder_shelves", { context: context(generation), orderedIds });
}

export async function saveStartupShelf(
  shelfId: number | null,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("set_startup_shelf", { context: context(generation), shelfId });
}

export async function updateShelf(
  shelfId: number,
  name: string,
  icon: ShelfIcon,
  generation: number,
): Promise<ApiResponse<ShelfSnapshot>> {
  return invoke("update_shelf", { context: context(generation), shelfId, name, icon });
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
