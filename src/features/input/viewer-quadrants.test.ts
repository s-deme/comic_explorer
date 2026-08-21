import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEWER_QUADRANT_BINDINGS,
  strictViewerQuadrantBindings,
  viewerQuadrantAt,
} from "./viewer-quadrants";

describe("viewer quadrant registry", () => {
  it("requires the exact safe shape", () => {
    expect(strictViewerQuadrantBindings(DEFAULT_VIEWER_QUADRANT_BINDINGS)).toEqual(
      DEFAULT_VIEWER_QUADRANT_BINDINGS,
    );
    expect(strictViewerQuadrantBindings({ ...DEFAULT_VIEWER_QUADRANT_BINDINGS, center: "nextPage" })).toBeNull();
    expect(strictViewerQuadrantBindings({ ...DEFAULT_VIEWER_QUADRANT_BINDINGS, topLeft: "delete" })).toBeNull();
  });

  it("uses stage halves and assigns exact center boundaries right and bottom", () => {
    const bounds = { left: 10, top: 20, width: 100, height: 80 };
    expect(viewerQuadrantAt(59, 59, bounds)).toBe("topLeft");
    expect(viewerQuadrantAt(60, 59, bounds)).toBe("topRight");
    expect(viewerQuadrantAt(59, 60, bounds)).toBe("bottomLeft");
    expect(viewerQuadrantAt(60, 60, bounds)).toBe("bottomRight");
    expect(viewerQuadrantAt(60, 60, { ...bounds, width: 0 })).toBeNull();
  });
});
