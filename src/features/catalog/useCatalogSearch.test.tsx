import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { searchLibrary } from "../library/client";
import { useCatalogSearch } from "./useCatalogSearch";

vi.mock("../library/client", () => ({ searchLibrary: vi.fn(), pickSearchSource: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it("preserves the shared navigation generation and discards a response after clearing", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(searchLibrary).mockReturnValue(new Promise((resolve) => { finish = resolve; }) as never);
  const generation = { current: 5 };
  const onSearchStart = vi.fn();
  const { result } = renderHook(() => useCatalogSearch({
    generation, libraryRoot: "C:\\Comics", currentPath: "Series", onSearchStart,
  }));
  act(() => result.current.setSearchQuery("*.cbz"));
  let pending!: Promise<void>;
  act(() => { pending = result.current.runSearch(); });
  expect(searchLibrary).toHaveBeenCalledWith("*.cbz", 6, expect.objectContaining({
    fixedLocation: "Series", sourceRoots: ["C:\\Comics"],
  }));
  expect(onSearchStart).toHaveBeenCalledOnce();
  act(() => result.current.clearSearch());
  await act(async () => {
    finish({ status: "ok", data: [{ relativePath: "old.cbz" }] });
    await pending;
  });
  expect(generation.current).toBe(7);
  expect(result.current.searchState).toEqual({ status: "idle" });
  expect(result.current.searchQuery).toBe("");
});
