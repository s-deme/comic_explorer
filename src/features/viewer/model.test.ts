// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  autoSpreadForViewport,
  isPagePairable,
  fitScaleForPages,
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
  isScrollStepPercent,
  isWheelScrollFactor,
  wheelDeltaPixels,
  randomPageIndex,
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
  it("maps random values uniformly onto every page except the current page", () => {
    expect(randomPageIndex(2, 5, 0)).toBe(0);
    expect(randomPageIndex(2, 5, 0.24)).toBe(0);
    expect(randomPageIndex(2, 5, 0.25)).toBe(1);
    expect(randomPageIndex(2, 5, 0.5)).toBe(3);
    expect(randomPageIndex(2, 5, 0.999999)).toBe(4);
    expect(randomPageIndex(0, 1, 0.5)).toBe(0);
  });

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

  it("REQ-LEY-P2-004 distinguishes automatic, single, and spread display units", () => {
    const automatic = { ...initial, mode: "auto" as const };
    expect(visibleIndices(automatic, 4, new Set(), true)).toEqual([0, 1]);
    expect(visibleIndices(automatic, 4, new Set(), false)).toEqual([0]);
    expect(visibleIndices(automatic, 4, new Set([0]), true)).toEqual([0]);
    expect(visibleIndices(automatic, 4, new Set([1]), true)).toEqual([0]);
    expect(visibleIndices({ ...initial, mode: "single" }, 4, new Set(), true)).toEqual([0]);
    expect(visibleIndices(initial, 4, new Set(), false)).toEqual([0, 1]);

    const narrowNext = viewerReducer(automatic, {
      type: "next", pageCount: 4, landscape: new Set(), autoSpread: false,
    });
    const wideNext = viewerReducer(automatic, {
      type: "next", pageCount: 4, landscape: new Set(), autoSpread: true,
    });
    expect(narrowNext.index).toBe(1);
    expect(wideNext.index).toBe(2);
  });

  it("REQ-LEY-P2-004 uses the fixed safe viewport threshold", () => {
    expect(autoSpreadForViewport(1000, 800)).toBe(true);
    expect(autoSpreadForViewport(999, 800)).toBe(false);
    expect(autoSpreadForViewport(0, 800)).toBe(false);
    expect(autoSpreadForViewport(Number.NaN, 800)).toBe(false);
  });

  it("REQ-LEY-P2-005 applies cover, parity, portrait, and width conditions", () => {
    const automatic = { ...initial, mode: "auto" as const };
    const coverEvenRules = {
      portraitMaxAspectPercent: 80,
      autoViewportMinAspectPercent: 160,
      firstPageSingle: true,
      pairing: "even" as const,
    };
    expect(visibleIndices(automatic, 6, new Set(), true, coverEvenRules)).toEqual([0]);
    expect(visibleIndices({ ...automatic, index: 1 }, 6, new Set(), true, coverEvenRules))
      .toEqual([1, 2]);
    expect(visibleIndices({ ...automatic, index: 2 }, 6, new Set(), true, coverEvenRules))
      .toEqual([2]);
    expect(visibleIndices({ ...automatic, index: 3 }, 6, new Set([4]), true, coverEvenRules))
      .toEqual([3]);
    expect(autoSpreadForViewport(1599, 1000, 160)).toBe(false);
    expect(autoSpreadForViewport(1600, 1000, 160)).toBe(true);
    expect(isPagePairable(800, 1000, 80)).toBe(true);
    expect(isPagePairable(801, 1000, 80)).toBe(false);

    const afterCover = viewerReducer(automatic, {
      type: "next",
      pageCount: 6,
      landscape: new Set(),
      autoSpread: true,
      spreadRules: coverEvenRules,
    });
    expect(afterCover.index).toBe(1);
    const afterPair = viewerReducer(afterCover, {
      type: "next",
      pageCount: 6,
      landscape: new Set(),
      autoSpread: true,
      spreadRules: coverEvenRules,
    });
    expect(afterPair.index).toBe(3);
  });

  it("REQ-LEY-P2-006 calculates bounded fit scales for spread, page, margin, and upscale rules", () => {
    const pages = [{ width: 400, height: 600 }, { width: 400, height: 600 }];
    expect(fitScaleForPages(pages, 1000, 800, 20, 10, {
      allowUpscale: false, basis: "spread", includePageMargin: true,
    })).toBe(1);
    expect(fitScaleForPages(pages, 500, 800, 20, 10, {
      allowUpscale: false, basis: "spread", includePageMargin: true,
    })).toBeCloseTo(450 / 800, 4);
    expect(fitScaleForPages(pages, 500, 800, 20, 10, {
      allowUpscale: false, basis: "page", includePageMargin: true,
    })).toBe(1);
    expect(fitScaleForPages([{ width: 100, height: 100 }], 400, 300, 0, 0, {
      allowUpscale: true, basis: "spread", includePageMargin: true,
    })).toBe(3);
    expect(fitScaleForPages([{ width: 100, height: 100 }], 400, 300, 0, 0, {
      allowUpscale: false, basis: "spread", includePageMargin: true,
    })).toBe(1);
    expect(fitScaleForPages([{ width: 0, height: 100 }], 400, 300, 0, 0)).toBeNull();
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

  it("REQ-LEY-P2-007 validates scroll settings and normalizes wheel delta units", () => {
    expect(isScrollStepPercent(10)).toBe(true);
    expect(isScrollStepPercent(101)).toBe(false);
    expect(isWheelScrollFactor(0.5)).toBe(true);
    expect(isWheelScrollFactor(2.01)).toBe(false);
    expect(wheelDeltaPixels(12, 0, 400, 1.5)).toBe(18);
    expect(wheelDeltaPixels(2, 1, 400, 1.5)).toBe(48);
    expect(wheelDeltaPixels(1, 2, 400, 0.5)).toBe(200);
    expect(wheelDeltaPixels(Number.NaN, 0, 400, 1)).toBe(0);
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
