import { afterEach, describe, expect, it } from "vitest";
import {
  addBookshelfItem,
  listBookmarks,
  listBookshelf,
  nextBookmark,
  removeBookshelfItem,
  saveBookmark,
} from "./collections";

describe("reading collections", () => {
  afterEach(() => localStorage.clear());

  it("stores sorted, idempotent page bookmarks and wraps next lookup", () => {
    saveBookmark({ itemKey: "book", pageIndex: 4, pageKey: "5.png", createdAt: 2 });
    saveBookmark({ itemKey: "book", pageIndex: 1, pageKey: "2.png", createdAt: 1 });
    expect(listBookmarks("book").map((bookmark) => bookmark.pageIndex)).toEqual([1, 4]);
    expect(nextBookmark(listBookmarks("book"), 4)?.pageIndex).toBe(1);
  });

  it("keeps bookshelf entries unique and removable", () => {
    addBookshelfItem("Series/02.cbz");
    addBookshelfItem("Series/01.cbz");
    addBookshelfItem("Series/01.cbz");
    expect(listBookshelf()).toEqual(["Series/01.cbz", "Series/02.cbz"]);
    expect(removeBookshelfItem("Series/01.cbz")).toEqual(["Series/02.cbz"]);
  });
});
