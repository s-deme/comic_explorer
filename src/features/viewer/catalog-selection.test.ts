import { describe, expect, it, vi } from "vitest";
import type { ViewerSession } from "../library/client";
import { resolveViewerCatalogSelection } from "./catalog-selection";

const session: ViewerSession = {
  itemKey: "book.cbz",
  displayName: "book.cbz",
  pages: [
    { id: "page-1" as never, relativePath: "01.png" as never, mediaUri: "" },
    { id: "page-2" as never, relativePath: "02.png" as never, mediaUri: "" },
  ],
  startIndex: 0,
};

describe("Viewer catalog selection", () => {
  it("REQ-LEY-P2-015 prefers the visible image-folder page", () => {
    expect(resolveViewerCatalogSelection(session, 1, new Set(["01.png", "02.png"])))
      .toBe("02.png");
  });

  it("REQ-LEY-P2-015 falls back to the visible archive or PDF item", () => {
    expect(resolveViewerCatalogSelection(session, 1, new Set(["book.cbz"])))
      .toBe("book.cbz");
    expect(resolveViewerCatalogSelection(session, 1, new Set(["other.cbz"])))
      .toBeNull();
  });

  it("REQ-LEY-P2-015 performs at most two indexed lookups per page change", () => {
    const has = vi.fn((path: string) => path === "book.cbz");
    const visiblePaths = { has } as unknown as ReadonlySet<string>;
    expect(resolveViewerCatalogSelection(session, 1, visiblePaths)).toBe("book.cbz");
    expect(has).toHaveBeenCalledTimes(2);
  });
});
