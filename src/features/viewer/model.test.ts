// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  clampLoupePointer,
  createViewerScaleState,
  MAX_SCALE,
  MIN_SCALE,
  normalizeScale,
  normalizeViewerLayoutMode,
  scaleReducer,
  VIEWER_LAYOUT_MODES,
  viewerReducer,
  visibleIndices,
  type ViewerState,
} from "./model";

const initial: ViewerState = {
  index: 0,
  mode: "spread",
  direction: "rightToLeft",
  history: [],
};

describe("viewer page model", () => {
  it("keeps the leading page when mode or direction changes", () => {
    let state = viewerReducer(initial, { type: "mode", mode: "single" });
    state = viewerReducer(state, { type: "toggleDirection" });
    expect(state.index).toBe(0);
    expect(state.direction).toBe("leftToRight");
  });

  it("shows landscape and final odd pages alone", () => {
    expect(visibleIndices(initial, 5, new Set([0]))).toEqual([0]);
    expect(
      visibleIndices({ ...initial, index: 4 }, 5, new Set()),
    ).toEqual([4]);
  });

  it("uses display-unit history so previous is reversible", () => {
    let state = viewerReducer(initial, {
      type: "next",
      pageCount: 5,
      landscape: new Set(),
    });
    expect(state.index).toBe(2);
    state = viewerReducer(state, {
      type: "next",
      pageCount: 5,
      landscape: new Set([2]),
    });
    expect(state.index).toBe(3);
    state = viewerReducer(state, { type: "previous" });
    expect(state.index).toBe(2);
    state = viewerReducer(state, { type: "previous" });
    expect(state.index).toBe(0);
  });
});

describe("FR-B01 scale model", () => {
  it("FT-B01-001 clamps and rounds arbitrary倍率 at the shared boundaries", () => {
    expect(normalizeScale(Number.NaN)).toBe(1);
    expect(normalizeScale(MIN_SCALE - 1)).toBe(MIN_SCALE);
    expect(normalizeScale(MAX_SCALE + 1)).toBe(MAX_SCALE);
    expect(normalizeScale(1.06)).toBe(1.1);
    expect(
      scaleReducer(createViewerScaleState("fit", 1, false), {
        type: "scale",
        scale: 2.37,
      }),
    ).toEqual({ mode: "custom", scale: 2.4, loupeEnabled: false });
  });

  it("FT-B01-002 exposes common window, width, height and original fit modes", () => {
    const initial = createViewerScaleState("fit", 1, false);
    expect(
      ["fit", "width", "height", "original"].map((mode) =>
        scaleReducer(initial, { type: "mode", mode: mode as typeof initial.mode }).mode,
      ),
    ).toEqual(["fit", "width", "height", "original"]);
  });

  it("FT-B01-003 keeps the selected scale state independent of page navigation", () => {
    const selected = scaleReducer(
      createViewerScaleState("fit", 1, false),
      { type: "scale", scale: 1.8 },
    );
    expect(selected).toEqual({ mode: "custom", scale: 1.8, loupeEnabled: false });
    expect(
      scaleReducer(selected, { type: "mode", mode: "original" }),
    ).toEqual({ mode: "original", scale: 1.8, loupeEnabled: false });
  });

  it("FT-B01-004 clamps loupe pointer coordinates at every image boundary", () => {
    expect(clampLoupePointer(-10, 50, 320, 480)).toEqual({ x: 0, y: 50 });
    expect(clampLoupePointer(320, 480, 320, 480)).toEqual({ x: 320, y: 480 });
    expect(clampLoupePointer(999, -1, 320, 480)).toEqual({ x: 320, y: 0 });
  });

  it("FT-B01-005 restores custom scale and loupe state from persisted settings", () => {
    expect(createViewerScaleState("custom", 1.7, true)).toEqual({
      mode: "custom",
      scale: 1.7,
      loupeEnabled: true,
    });
  });
});

describe("FR-B04 viewer layout model", () => {
  it("FT-B04-001 fixes the three layout modes and keeps paged as the fallback", () => {
    expect(VIEWER_LAYOUT_MODES).toEqual([
      "paged",
      "vertical_scroll",
      "horizontal_scroll",
    ]);
    expect(normalizeViewerLayoutMode("paged")).toBe("paged");
    expect(normalizeViewerLayoutMode("vertical_scroll")).toBe("vertical_scroll");
    expect(normalizeViewerLayoutMode("horizontal_scroll")).toBe("horizontal_scroll");
    expect(normalizeViewerLayoutMode("fullscreen")).toBe("paged");
  });
});
