import { describe, expect, it } from "vitest";
import type { CatalogEntry, RelativePath } from "../../types/domain";
import {
  MAX_USER_THUMBNAIL_BYTES,
  mergeImportedThumbnails,
  normalizeManagedThumbnails,
  resolveImportTargets,
  thumbnailStats,
} from "./thumbnail-maintenance";

const jpeg = "data:image/jpeg;base64,/9j/2Q==";

function entry(relativePath: string, kind: CatalogEntry["kind"] = "archive"): CatalogEntry {
  return { relativePath: relativePath as RelativePath, kind };
}

describe("thumbnail maintenance", () => {
  it("normalizes app-local JPEG records and reports count and bytes", () => {
    const thumbnails = normalizeManagedThumbnails({
      "book.cbz": { itemRelativePath: "book.cbz", dataUrl: jpeg, bytes: 120, importedAtMs: 4 },
      bad: { itemRelativePath: "bad", dataUrl: "data:image/png;base64,AA==", bytes: 10 },
    });
    expect(thumbnailStats(thumbnails)).toEqual({ count: 1, bytes: 120 });
  });

  it("matches JPEG names to visible archive or comic-folder targets and rejects ambiguity", () => {
    const files = [
      new File(["a"], "book.jpg", { type: "image/jpeg" }),
      new File(["b"], "missing.jpg", { type: "image/jpeg" }),
    ];
    const result = resolveImportTargets(files, [entry("book.cbz"), entry("book", "comicFolder")]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0]).toContain("一意");
  });

  it("imports and replaces records without exceeding the app-local capacity", () => {
    const current = normalizeManagedThumbnails({
      "old.cbz": { itemRelativePath: "old.cbz", dataUrl: jpeg, bytes: 120, importedAtMs: 1 },
    });
    const merged = mergeImportedThumbnails(current, [
      { itemRelativePath: "new.cbz", dataUrl: jpeg, bytes: 240 },
    ], 5);
    expect(merged.accepted).toBe(1);
    expect(merged.thumbnails["new.cbz"].importedAtMs).toBe(5);
    expect(thumbnailStats(merged.thumbnails).bytes).toBe(360);
    expect(MAX_USER_THUMBNAIL_BYTES).toBeGreaterThan(360);
  });
});
