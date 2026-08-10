import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addBookshelfItem,
  addBookshelfItemResult,
  listBookmarks,
  listBookshelf,
  migrateLegacyCollections,
  nextBookmark,
  removeBookshelfItem,
  resolveBookmarks,
  saveBookmark,
  saveBookmarkResult,
} from "./collections";

const BOOKMARKS_KEY = "comic-explorer.bookmarks.v1";
const BOOKSHELF_KEY = "comic-explorer.bookshelf.v1";

describe("reading collections", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("deduplicates by page key, resolves current order, drops missing pages, and wraps", () => {
    saveBookmark({ itemKey: "book", pageIndex: 4, pageKey: "5.png", createdAt: 1 });
    saveBookmark({ itemKey: "book", pageIndex: 1, pageKey: "2.png", createdAt: 2 });
    saveBookmark({ itemKey: "book", pageIndex: 7, pageKey: "5.png", createdAt: 3 });

    const stored = listBookmarks("book");
    expect(stored.map((bookmark) => bookmark.pageKey)).toEqual(["2.png", "5.png"]);
    const pageKeys = ["5.png", "new.png", "2.png"];
    expect(resolveBookmarks(stored, pageKeys).map((bookmark) => [
      bookmark.pageKey,
      bookmark.pageIndex,
    ])).toEqual([
      ["5.png", 0],
      ["2.png", 2],
    ]);
    expect(nextBookmark(stored, pageKeys, 0)?.pageKey).toBe("2.png");
    expect(nextBookmark(stored, pageKeys, 2)?.pageKey).toBe("5.png");
    expect(resolveBookmarks(stored, ["new.png"])).toEqual([]);
  });

  it("restores only valid rows from null, wrong-shape, and mixed legacy JSON", () => {
    localStorage.setItem(BOOKSHELF_KEY, "null");
    expect(listBookshelf()).toEqual([]);
    localStorage.setItem(BOOKSHELF_KEY, JSON.stringify({ path: "book.cbz" }));
    expect(listBookshelf()).toEqual([]);
    localStorage.setItem(
      BOOKSHELF_KEY,
      JSON.stringify([null, 42, "", "book.cbz", "book.cbz"]),
    );
    expect(listBookshelf()).toEqual(["book.cbz"]);

    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([
      null,
      { itemKey: "book", pageIndex: -1, pageKey: "bad.png", createdAt: 1 },
      { itemKey: "book", pageIndex: 0, pageKey: "ok.png", createdAt: 1 },
      { itemKey: "book", pageIndex: 1, pageKey: "", createdAt: 1 },
      { itemKey: "book", pageIndex: 2, pageKey: "late.png", createdAt: Number.NaN },
    ]));
    expect(listBookmarks("book")).toEqual([
      { itemKey: "book", pageIndex: 0, pageKey: "ok.png", createdAt: 1 },
    ]);
  });

  it("keeps bookshelf entries unique and removable", () => {
    addBookshelfItem("Series/02.cbz");
    addBookshelfItem("Series/01.cbz");
    addBookshelfItem("Series/01.cbz");
    expect(listBookshelf()).toEqual(["Series/01.cbz", "Series/02.cbz"]);
    expect(removeBookshelfItem("Series/01.cbz")).toEqual(["Series/02.cbz"]);
  });

  it("returns the persisted value and an explicit failure when storage rejects a write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    const result = addBookshelfItemResult("book.cbz");
    const bookmarkResult = saveBookmarkResult({
      itemKey: "book.cbz",
      pageIndex: 0,
      pageKey: "1.png",
      createdAt: 1,
    });

    expect(result).toEqual({ ok: false, value: [], reason: "write-failed" });
    expect(bookmarkResult).toEqual({ ok: false, value: [], reason: "write-failed" });
    expect(listBookshelf()).toEqual([]);
  });

  it("migrates unscoped v1 data to one root without leaking it to another root", () => {
    localStorage.setItem(BOOKSHELF_KEY, JSON.stringify(["Series/01.cbz"]));
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([
      { itemKey: "Series/01.cbz", pageIndex: 0, pageKey: "1.png", createdAt: 1 },
    ]));

    expect(migrateLegacyCollections("root-a").ok).toBe(true);
    expect(listBookshelf("root-a")).toEqual(["Series/01.cbz"]);
    expect(listBookmarks("Series/01.cbz", "root-a")).toHaveLength(1);
    expect(listBookshelf("root-b")).toEqual([]);
    expect(listBookmarks("Series/01.cbz", "root-b")).toEqual([]);

    expect(addBookshelfItemResult("Other/02.cbz", "root-b").ok).toBe(true);
    expect(migrateLegacyCollections("root-b").ok).toBe(true);
    expect(listBookshelf("root-a")).toEqual(["Series/01.cbz"]);
    expect(listBookshelf("root-b")).toEqual(["Other/02.cbz"]);
  });
});
