import { invoke } from "@tauri-apps/api/core";
import type { ApiResponse } from "../../../types/api";
import type { PageId } from "../../../types/domain";
import type {
  ViewerRectangleZoomInput,
  ViewerRectangleZoomPlan,
  ViewerSession,
  ItemMetadata,
  TagEntry,
  ItemTags,
  ReadingHistoryEntry,
  PageBookmarkEntry,
  ClipboardImageResult,
} from "./contracts";
import { context } from "./context";

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

export async function clearReadingHistory(
  generation: number,
): Promise<ApiResponse<void>> {
  return invoke("clear_reading_history", { context: context(generation) });
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

export async function getItemMetadata(
  itemIdentity: string,
  generation: number,
): Promise<ApiResponse<ItemMetadata>> {
  return invoke("get_item_metadata", {
    context: context(generation),
    itemIdentity,
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

export async function listPageBookmarks(
  itemKey: string,
  generation: number,
): Promise<ApiResponse<PageBookmarkEntry[]>> {
  return invoke("list_page_bookmarks", {
    context: context(generation),
    itemKey,
  });
}

export async function listReadingHistory(
  generation: number,
): Promise<ApiResponse<ReadingHistoryEntry[]>> {
  return invoke("list_reading_history", { context: context(generation) });
}

export async function listTags(
  generation: number,
): Promise<ApiResponse<TagEntry[]>> {
  return invoke("list_tags", { context: context(generation) });
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

export async function openComic(
  itemRelativePath: string,
  generation: number,
): Promise<ApiResponse<ViewerSession>> {
  return invoke("open_comic", {
    context: context(generation),
    itemRelativePath,
  });
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

export async function resolveViewerRectangleZoom(
  input: ViewerRectangleZoomInput,
  generation: number,
): Promise<ApiResponse<ViewerRectangleZoomPlan>> {
  return invoke("resolve_viewer_rectangle_zoom", {
    context: context(generation),
    input,
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

export async function savePageBookmark(
  bookmark: PageBookmarkEntry,
  generation: number,
): Promise<ApiResponse<PageBookmarkEntry[]>> {
  return invoke("save_page_bookmark", {
    context: context(generation),
    ...bookmark,
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
