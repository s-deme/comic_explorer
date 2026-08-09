// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CATALOG_VIEW_MODES,
  DEFAULT_CATALOG_VIEW_MODE,
  normalizeCatalogViewMode,
} from "./view-mode";

describe("catalog view mode", () => {
  it("keeps the C0 enum and cover-list default stable", () => {
    expect(CATALOG_VIEW_MODES).toEqual([
      "small_thumbnail",
      "detail_list",
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
});
