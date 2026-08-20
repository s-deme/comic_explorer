// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  clampLoupePointer,
  createViewerScaleState,
  DEFAULT_VIEWER_BACKGROUND,
  DEFAULT_VIEWER_CURSOR_AUTO_HIDE_MS,
  DEFAULT_VIEWER_GRID_COLOR,
  DEFAULT_ZOOM_RETENTION,
  DEFAULT_VIEWER_PAGE_MARGIN,
  DEFAULT_VIEWER_SPREAD_GAP,
  MAX_SCALE,
  MIN_SCALE,
  normalizeViewerBackground,
  normalizeViewerCursorAutoHideMs,
  normalizeViewerSpacing,
  normalizeScale,
  normalizeViewerLayoutMode,
  normalizeViewerGridColor,
  normalizeZoomRetention,
  isPanFactor,
  isViewerGridSize,
  isWheelDeadZone,
  scaleForPixelDimension,
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

  it("FT-B23-001 shifts a spread anchor by exactly one page without crossing bounds", () => {
    let state = viewerReducer(initial, { type: "shift", delta: 1, pageCount: 5 });
    expect(state.index).toBe(1);
    expect(visibleIndices(state, 5, new Set())).toEqual([1, 2]);

    state = viewerReducer(state, { type: "shift", delta: -1, pageCount: 5 });
    expect(state.index).toBe(0);
    expect(viewerReducer(state, { type: "shift", delta: -1, pageCount: 5 })).toBe(state);

    const final = { ...initial, index: 4 };
    expect(viewerReducer(final, { type: "shift", delta: 1, pageCount: 5 })).toBe(final);
  });
});

describe("FR-B01 scale model", () => {
  it("FT-B01-001 clamps arbitrary倍率 while retaining the displayed percentage", () => {
    expect(normalizeScale(Number.NaN)).toBe(1);
    expect(normalizeScale(MIN_SCALE - 1)).toBe(MIN_SCALE);
    expect(normalizeScale(MAX_SCALE + 1)).toBe(MAX_SCALE);
    expect(normalizeScale(1.06)).toBe(1.06);
    expect(
      scaleReducer(createViewerScaleState("fit", 1, false), {
        type: "scale",
        scale: 2.37,
      }),
    ).toEqual({ mode: "custom", scale: 2.37, loupeEnabled: false });
  });

  it("FT-B01-006 changes from the current fitted display scale and reverses it", () => {
    const enlarged = scaleReducer(
      createViewerScaleState("fit", 1, false),
      { type: "zoomIn", baseScale: 0.58 },
    );
    expect(enlarged).toEqual({ mode: "custom", scale: 0.68, loupeEnabled: false });
    expect(scaleReducer(enlarged, { type: "zoomOut" })).toEqual({
      mode: "custom",
      scale: 0.58,
      loupeEnabled: false,
    });
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

  it("REQ-LEY-P1-003 and REQ-LEY-P1-006 support 1–800% and safe pixel dimensions", () => {
    expect(MIN_SCALE).toBe(0.01);
    expect(MAX_SCALE).toBe(8);
    expect(scaleForPixelDimension(1, 100)).toBe(0.01);
    expect(scaleForPixelDimension(8_000, 1_000)).toBe(8);
    expect(scaleForPixelDimension(32_769, 1_000)).toBeNull();
    expect(scaleForPixelDimension(100, 0)).toBeNull();
    expect(scaleForPixelDimension(100.5, 1_000)).toBeNull();
  });

  it("validates P1-A retention, grid, pan, and wheel preferences", () => {
    expect(normalizeZoomRetention("book")).toBe("book");
    expect(normalizeZoomRetention("forever")).toBe(DEFAULT_ZOOM_RETENTION);
    expect(normalizeViewerGridColor("dark")).toBe("dark");
    expect(normalizeViewerGridColor("red")).toBe(DEFAULT_VIEWER_GRID_COLOR);
    expect(isViewerGridSize(8)).toBe(true);
    expect(isViewerGridSize(257)).toBe(false);
    expect(isPanFactor(0.5)).toBe(true);
    expect(isPanFactor(2.01)).toBe(false);
    expect(isWheelDeadZone(200)).toBe(true);
    expect(isWheelDeadZone(200.5)).toBe(false);
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

describe("FR-B23 viewer appearance settings", () => {
  it("FT-B23-002 normalizes backgrounds, spacing and cursor delay to safe defaults", () => {
    expect(normalizeViewerBackground("black")).toBe("black");
    expect(normalizeViewerBackground("transparent")).toBe(DEFAULT_VIEWER_BACKGROUND);
    expect(normalizeViewerSpacing(24, DEFAULT_VIEWER_PAGE_MARGIN)).toBe(24);
    expect(normalizeViewerSpacing(65, DEFAULT_VIEWER_PAGE_MARGIN)).toBe(
      DEFAULT_VIEWER_PAGE_MARGIN,
    );
    expect(normalizeViewerSpacing(-1, DEFAULT_VIEWER_SPREAD_GAP)).toBe(
      DEFAULT_VIEWER_SPREAD_GAP,
    );
    expect(normalizeViewerCursorAutoHideMs(3_000)).toBe(3_000);
    expect(normalizeViewerCursorAutoHideMs(4_000)).toBe(
      DEFAULT_VIEWER_CURSOR_AUTO_HIDE_MS,
    );
  });
});
