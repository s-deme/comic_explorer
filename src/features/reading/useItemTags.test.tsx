import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ApiResponse } from "../../types/api";
import type { ItemTags, TagEntry } from "../library/client";
import { useItemTags } from "./useItemTags";

it("refreshes tags after assignment and removal, preserves drafts on failure, and ignores stale search results", async () => {
  const tag: TagEntry = { tagId: "tag-1", name: "読了", itemCount: 1 };
  const ok = <T,>(data: T): ApiResponse<T> => ({
    status: "ok", requestId: "test" as never, generation: 1 as never, data,
  });
  const item = (tags: TagEntry[]): ItemTags => ({ itemIdentity: "book.cbz" as never, tags });
  const api = {
    assignTag: vi.fn().mockResolvedValue(ok(item([tag]))),
    removeTag: vi.fn().mockResolvedValue(ok(item([]))),
    getItemTags: vi.fn().mockResolvedValue(ok(item([]))),
    listTags: vi.fn().mockResolvedValue(ok([tag])),
    queryTags: vi.fn(),
    renameTag: vi.fn(),
  };
  const { result } = renderHook(() => useItemTags("book.cbz", api));
  act(() => result.current.setTagNameDraft(tag.name));
  await act(() => result.current.assignTagToSelected());
  expect(api.assignTag).toHaveBeenCalledWith("book.cbz", tag.name, expect.any(Number));
  expect(result.current.selectedTags).toEqual([tag]);
  expect(result.current.tagNameDraft).toBe("");
  await act(() => result.current.removeTagFromSelected(tag));
  expect(api.removeTag).toHaveBeenCalledWith("book.cbz", tag.tagId, expect.any(Number));
  expect(result.current.selectedTags).toEqual([]);
  expect(api.listTags).toHaveBeenCalledTimes(2);

  api.assignTag.mockRejectedValueOnce(new Error("offline"));
  act(() => result.current.setTagNameDraft("未保存"));
  await act(() => result.current.assignTagToSelected());
  expect(result.current.tagNameDraft).toBe("未保存");
  expect(result.current.tagNotice).not.toBeNull();
  expect(result.current.tagsLoading).toBe(false);

  let finish!: (response: ApiResponse<TagEntry[]>) => void;
  api.queryTags.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.refreshTags("old"); });
  api.queryTags.mockResolvedValueOnce(ok([]));
  await act(() => result.current.refreshTags("new"));
  await act(async () => { finish(ok([tag])); await pending; });
  expect(result.current.tagResults).toEqual([]);
  expect(result.current.tagsLoading).toBe(false);
});
