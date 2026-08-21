import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATALOG_MOUSE_BINDINGS,
  strictCatalogMouseBindings,
} from "./catalog-mouse";

describe("catalog mouse registry", () => {
  it("REQ-LEY-P3-013 accepts only the complete safe gesture/action shape", () => {
    expect(strictCatalogMouseBindings(DEFAULT_CATALOG_MOUSE_BINDINGS))
      .toEqual(DEFAULT_CATALOG_MOUSE_BINDINGS);
    expect(strictCatalogMouseBindings({
      ...DEFAULT_CATALOG_MOUSE_BINDINGS,
      middleClick: "toggleSearch",
    })).toEqual(expect.objectContaining({ middleClick: "toggleSearch" }));
    expect(strictCatalogMouseBindings({
      ...DEFAULT_CATALOG_MOUSE_BINDINGS,
      middleClick: "delete",
    })).toBeNull();
    const missing = { ...DEFAULT_CATALOG_MOUSE_BINDINGS } as Record<string, string>;
    delete missing.forwardButton;
    expect(strictCatalogMouseBindings(missing)).toBeNull();
  });
});
