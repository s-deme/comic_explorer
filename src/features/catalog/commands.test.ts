import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../types/domain";
import {
  catalogCsv,
  matchesMask,
  rangeSelection,
  selectEntriesByKind,
  toggleEntrySelection,
} from "./commands";

const entries: CatalogEntry[] = [
  { relativePath: "01.jpg" as never, kind: "page", byteSize: 10 },
  { relativePath: "Book A" as never, kind: "comicFolder" },
  { relativePath: "volume.cbz" as never, kind: "archive", byteSize: 20 },
];

describe("catalog commands", () => {
  it("selects by kind and supports toggle/range selection", () => {
    expect(selectEntriesByKind(entries, "image")).toEqual(["01.jpg"]);
    expect(toggleEntrySelection(["01.jpg"], "01.jpg")).toEqual([]);
    expect(rangeSelection(entries, "01.jpg", "volume.cbz")).toEqual(
      entries.map((entry) => entry.relativePath),
    );
  });

  it("matches case-insensitive masks and multiple patterns", () => {
    expect(matchesMask(entries[1], "book ?")).toBe(true);
    expect(matchesMask(entries[2], "*.jpg;*.cbz")).toBe(true);
    expect(matchesMask(entries[0], "*.png")).toBe(false);
  });

  it("exports stable metadata columns with CSV escaping", () => {
    const csv = catalogCsv([
      { ...entries[0], relativePath: "a,b.jpg" as never },
    ]);
    expect(csv).toContain("name,kind,relativePath,size,modified");
    expect(csv).toContain('"a,b.jpg",page,"a,b.jpg",10,');
  });
});
