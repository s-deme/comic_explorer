import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ApiResponse } from "../../types/api";
import type { ItemMetadata } from "../library/client";
import { useItemMetadata } from "./useItemMetadata";

it("keeps a new item's metadata when an older rating save completes, and invalidates loads on close", async () => {
  const first: ItemMetadata = { itemIdentity: "first.cbz" as never, memo: "first", rating: null };
  const second: ItemMetadata = { itemIdentity: "second.cbz" as never, memo: "second", rating: 3 };
  const ok = (data: ItemMetadata): ApiResponse<ItemMetadata> => ({
    status: "ok", requestId: "test" as never, generation: 1 as never, data,
  });
  let finishRating!: (response: ApiResponse<ItemMetadata>) => void;
  let finishLoad!: (response: ApiResponse<ItemMetadata>) => void;
  const api = {
    getItemMetadata: vi.fn().mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second)),
    saveItemMemo: vi.fn(),
    setItemRating: vi.fn().mockReturnValue(new Promise((resolve) => { finishRating = resolve; })),
  };
  const { result } = renderHook(() => useItemMetadata(api));
  await act(() => result.current.loadItemMetadata("first.cbz"));
  let saving!: Promise<void>;
  act(() => { saving = result.current.persistRating(5); });
  await act(() => result.current.loadItemMetadata("second.cbz"));
  await act(async () => { finishRating(ok({ ...first, rating: 5 })); await saving; });
  expect(result.current.itemMetadata).toEqual(second);
  expect(result.current.memoDraft).toBe("second");
  expect(result.current.ratingSaveState).toBe("idle");
  expect(result.current.metadataLoading).toBe(false);

  api.getItemMetadata.mockReturnValueOnce(new Promise((resolve) => { finishLoad = resolve; }));
  let loading!: Promise<void>;
  act(() => { loading = result.current.loadItemMetadata("first.cbz"); });
  act(() => result.current.resetItemMetadata());
  await act(async () => { finishLoad(ok(first)); await loading; });
  expect(result.current.itemMetadata).toBeNull();
  expect(result.current.memoDraft).toBe("");
});
