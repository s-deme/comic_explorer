import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../types/domain";
import {
  catalogCsv,
  rangeSelection,
  selectEntriesByKind,
  toggleEntrySelection,
} from "./commands";

const entries: CatalogEntry[] = [
  { relativePath: "01.jpg" as never, kind: "page", byteSize: 10 },
  { relativePath: "document.pdf" as never, kind: "pdf", byteSize: 15 },
  { relativePath: "Book A" as never, kind: "comicFolder" },
  { relativePath: "volume.cbz" as never, kind: "archive", byteSize: 20 },
];

describe("catalog commands", () => {
  it("selects by kind and supports toggle/range selection", () => {
    expect(selectEntriesByKind(entries, "image")).toEqual(["01.jpg"]);
    expect(selectEntriesByKind(entries, "file")).toEqual([
      "01.jpg",
      "document.pdf",
      "volume.cbz",
    ]);
    expect(toggleEntrySelection(["01.jpg"], "01.jpg")).toEqual([]);
    expect(rangeSelection(entries, "01.jpg", "volume.cbz")).toEqual(
      entries.map((entry) => entry.relativePath),
    );
  });

  it("exports stable metadata columns with CSV escaping", () => {
    const csv = catalogCsv([
      { ...entries[0], relativePath: "a,b.jpg" as never },
      { ...entries[0], relativePath: "=HYPERLINK(\"https://example.invalid\")" as never },
    ]);
    expect(csv).toContain("name,kind,relativePath,size,modified");
    expect(csv).toContain('"a,b.jpg",page,"a,b.jpg",10,');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(csv).not.toContain('\n"=HYPERLINK');
  });
});
