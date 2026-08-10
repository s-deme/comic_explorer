// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CatalogEntry, RelativePath } from "../../types/domain";
import { sortCatalogEntries } from "./sort";
import {
  normalizeEndOfVolumePolicy,
  resolveEndOfVolume,
  type EndOfVolumePolicy,
} from "./end-of-volume";

function entry(relativePath: string, kind: CatalogEntry["kind"]) {
  return {
    relativePath: relativePath as RelativePath,
    kind,
    ...(kind === "archive" ? { archiveKind: "cbz" as const } : {}),
  } satisfies CatalogEntry;
}

const books = [
  entry("01-first.cbz", "archive"),
  entry("02-second", "comicFolder"),
  entry("plain-folder", "folder"),
];

describe("FR-B02 end-of-volume policy resolver", () => {
  it("FT-B02-001 opens the next sorted comic with auto_next", () => {
    expect(resolveEndOfVolume(books, "01-first.cbz", "auto_next")).toEqual({
      kind: "open",
      entry: books[1],
      reason: "next",
    });
  });

  it("FT-B02-002 returns a confirmation decision before opening the next comic", () => {
    expect(resolveEndOfVolume(books, "01-first.cbz", "confirm_next")).toEqual({
      kind: "confirm",
      entry: books[1],
    });
  });

  it("FT-B02-003 returns to the library when return_library has a next comic", () => {
    expect(resolveEndOfVolume(books, "01-first.cbz", "return_library")).toEqual({
      kind: "return_library",
    });
  });

  it("FT-B02-004 stops safely without skipping the current comic", () => {
    expect(resolveEndOfVolume(books, "01-first.cbz", "stop")).toEqual({
      kind: "stop",
      reason: "policy",
    });
    expect(resolveEndOfVolume(books, "02-second", "stop")).toEqual({
      kind: "stop",
      reason: "no_next",
    });
  });

  it("FT-B02-005 loops from the final comic to the sorted readable first", () => {
    expect(resolveEndOfVolume(books, "02-second", "loop")).toEqual({
      kind: "open",
      entry: books[0],
      reason: "loop",
    });
  });

  it("FT-B02-006 follows the selected sort order and defaults unknown values safely", () => {
    const sorted = sortCatalogEntries(
      [
        entry("z-last.cbz", "archive"),
        entry("a-first.cbz", "archive"),
        entry("m-middle.cbz", "archive"),
      ],
      "name",
      "ascending",
    );
    expect(sorted.map((item) => item.relativePath)).toEqual([
      "a-first.cbz",
      "m-middle.cbz",
      "z-last.cbz",
    ]);
    expect(resolveEndOfVolume(sorted, "m-middle.cbz", "auto_next")).toEqual({
      kind: "open",
      entry: sorted[2],
      reason: "next",
    });
    expect(resolveEndOfVolume(sorted, "z-last.cbz", "loop")).toEqual({
      kind: "open",
      entry: sorted[0],
      reason: "loop",
    });
    expect(normalizeEndOfVolumePolicy("legacy")).toBe(
      "auto_next" satisfies EndOfVolumePolicy,
    );
  });

  it("treats a standalone PDF as a readable volume", () => {
    const values = [entry("01-first.cbz", "archive"), entry("02-second.pdf", "pdf")];
    expect(resolveEndOfVolume(values, "01-first.cbz", "auto_next")).toEqual({
      kind: "open",
      entry: values[1],
      reason: "next",
    });
    expect(resolveEndOfVolume(values, "02-second.pdf", "loop")).toEqual({
      kind: "open",
      entry: values[0],
      reason: "loop",
    });
  });
});
