// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CatalogEntry, RelativePath } from "../../types/domain";
import { naturalCompare, nextComicEntry, previousComicEntry, sortCatalogEntries } from "./sort";

function entry(
  relativePath: string,
  values: Partial<CatalogEntry> = {},
): CatalogEntry {
  return {
    relativePath: relativePath as RelativePath,
    kind: "archive",
    archiveKind: "zip",
    ...values,
  };
}

describe("catalog sorting", () => {
  it("uses numeric comparison and UTF-16 ordinal ties", () => {
    const values = ["1.png", "01.png", "001.png", "10.png", "2.png"];
    expect([...values].sort(naturalCompare)).toEqual([
      "001.png",
      "01.png",
      "1.png",
      "2.png",
      "10.png",
    ]);
  });

  it("keeps missing modified values and sizes last in both directions", () => {
    const values = [
      entry("missing.cbz", { archiveKind: "cbz" }),
      entry("small.zip", { byteSize: 10, modifiedMs: 100 }),
      entry("large.zip", { byteSize: 20, modifiedMs: 200 }),
    ];
    expect(sortCatalogEntries(values, "size", "ascending").map((item) => item.relativePath))
      .toEqual(["small.zip", "large.zip", "missing.cbz"]);
    expect(sortCatalogEntries(values, "size", "descending").map((item) => item.relativePath))
      .toEqual(["large.zip", "small.zip", "missing.cbz"]);
    expect(sortCatalogEntries(values, "modified", "descending").map((item) => item.relativePath))
      .toEqual(["large.zip", "small.zip", "missing.cbz"]);
    const runtimeNull = {
      ...entry("runtime-null-folder", { kind: "folder", archiveKind: undefined }),
      byteSize: null,
    } as unknown as CatalogEntry;
    expect(sortCatalogEntries([runtimeNull, values[1]], "size", "ascending")
      .map((item) => item.relativePath))
      .toEqual(["small.zip", "runtime-null-folder"]);
  });

  it("orders every supported archive kind and reverses the kind order", () => {
    const values = [
      entry("book.epub", { archiveKind: "epub" }),
      entry("book.rar", { archiveKind: "rar" }),
      entry("book.cbr", { archiveKind: "cbr" }),
      entry("book.7z", { archiveKind: "sevenZip" }),
      entry("book.cb7", { archiveKind: "cb7" }),
      entry("book.lzh", { archiveKind: "lzh" }),
      entry("book.cbz", { archiveKind: "cbz" }),
      entry("book.zip"),
      entry("comic", { kind: "comicFolder", archiveKind: undefined }),
      entry("folder", { kind: "folder", archiveKind: undefined }),
      entry("document.pdf", { kind: "pdf", archiveKind: undefined }),
    ];
    expect(sortCatalogEntries(values, "kind", "ascending").map((item) => item.relativePath))
      .toEqual([
        "folder", "comic", "book.zip", "book.cbz", "book.epub", "book.rar",
        "book.cbr", "book.7z", "book.cb7", "book.lzh", "document.pdf",
      ]);
    expect(sortCatalogEntries(values, "kind", "descending").map((item) => item.relativePath))
      .toEqual([
        "document.pdf", "book.lzh", "book.cb7", "book.7z", "book.cbr", "book.rar", "book.epub",
        "book.cbz", "book.zip", "comic", "folder",
      ]);
  });

  it("selects only the next readable item in the established list order", () => {
    const values = [
      entry("current.cbz", { archiveKind: "cbz" }),
      entry("plain-folder", { kind: "folder", archiveKind: undefined }),
      entry("next.pdf", { kind: "pdf", archiveKind: undefined }),
      entry("next-comic", { kind: "comicFolder", archiveKind: undefined }),
      entry("later.zip"),
    ];
    expect(nextComicEntry(values, "current.cbz")?.relativePath).toBe("plain-folder");
    expect(nextComicEntry(values, "later.zip")).toBeUndefined();
    expect(nextComicEntry(values, "missing.cbz")).toBeUndefined();
  });

  it("selects only the previous readable item in the established list order", () => {
    const values = [
      entry("first.pdf", { kind: "pdf", archiveKind: undefined }),
      entry("plain-folder", { kind: "folder", archiveKind: undefined }),
      entry("current.cbz", { archiveKind: "cbz" }),
      entry("later.zip"),
    ];
    expect(previousComicEntry(values, "current.cbz")?.relativePath).toBe("plain-folder");
    expect(previousComicEntry(values, "first.pdf")).toBeUndefined();
    expect(previousComicEntry(values, "missing.cbz")).toBeUndefined();
  });
});
