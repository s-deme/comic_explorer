// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CATALOG_VIEW_MODES,
  DEFAULT_CATALOG_THUMBNAIL_SIZES,
  DEFAULT_CATALOG_VIEW_MODE,
  normalizeCatalogThumbnailSizes,
  normalizeCatalogViewMode,
} from "./view-mode";

describe("catalog view mode", () => {
  it("presents detail, small, cover grid and card grid in that order", () => {
    expect(CATALOG_VIEW_MODES).toEqual([
      "detail_list",
      "small_thumbnail",
      "cover_list",
      "reference_tile",
    ]);
    expect(DEFAULT_CATALOG_VIEW_MODE).toBe("cover_list");
  });

  it.each(["unknown", "", undefined, null])(
    "normalizes %s to the safe cover-list default",
    (value) => {
      expect(normalizeCatalogViewMode(value)).toBe("cover_list");
    },
  );

  it("normalizes each thumbnail size independently", () => {
    expect(normalizeCatalogThumbnailSizes({
      smallThumbnail: 160,
      coverList: 63,
      referenceTile: 176,
    })).toEqual({
      smallThumbnail: 160,
      coverList: DEFAULT_CATALOG_THUMBNAIL_SIZES.coverList,
      referenceTile: 176,
    });
  });
});
