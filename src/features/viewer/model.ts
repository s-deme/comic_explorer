export const VIEW_MODES = ["auto", "single", "spread"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  auto: "自動",
  single: "単ページ",
  spread: "見開き",
};
export const AUTO_SPREAD_MIN_VIEWPORT_ASPECT = 1.25;
export const SPREAD_PAIRINGS = ["continuous", "odd", "even"] as const;
export type SpreadPairing = (typeof SPREAD_PAIRINGS)[number];
export const SPREAD_PAIRING_LABELS: Record<SpreadPairing, string> = {
  continuous: "制限なし",
  odd: "奇数ページから",
  even: "偶数ページから",
};
export interface SpreadRules {
  portraitMaxAspectPercent: number;
  autoViewportMinAspectPercent: number;
  firstPageSingle: boolean;
  pairing: SpreadPairing;
}
export const MIN_PORTRAIT_ASPECT_PERCENT = 50;
export const MAX_PORTRAIT_ASPECT_PERCENT = 100;
export const MIN_AUTO_VIEWPORT_ASPECT_PERCENT = 100;
export const MAX_AUTO_VIEWPORT_ASPECT_PERCENT = 300;
export const DEFAULT_SPREAD_RULES: SpreadRules = {
  portraitMaxAspectPercent: 100,
  autoViewportMinAspectPercent: 125,
  firstPageSingle: false,
  pairing: "continuous",
};
export type ReadingDirection = "rightToLeft" | "leftToRight";
export type ScaleMode = "fit" | "width" | "height" | "original" | "custom";
export const FIT_BASES = ["spread", "page"] as const;
export type FitBasis = (typeof FIT_BASES)[number];
export const FIT_BASIS_LABELS: Record<FitBasis, string> = {
  spread: "見開き全体",
  page: "各ページ",
};
export interface FitRules {
  allowUpscale: boolean;
  basis: FitBasis;
  includePageMargin: boolean;
}
export const DEFAULT_FIT_RULES: FitRules = {
  allowUpscale: false,
  basis: "spread",
  includePageMargin: true,
};
export type ViewerBackground = "checker" | "dark" | "black" | "light";
export type ZoomRetention = "global" | "book" | "page";
export type ViewerGridColor = "light" | "dark";
export type ViewerLayoutMode = "paged";
export const PAGE_SCAN_MODES = ["vertical", "n", "z"] as const;
export type PageScanMode = (typeof PAGE_SCAN_MODES)[number];
export const PAGE_SCAN_MODE_LABELS: Record<PageScanMode, string> = {
  vertical: "標準縦送り",
  n: "N字",
  z: "Z字",
};
export const DEFAULT_PAGE_SCAN_MODE: PageScanMode = "vertical";

export const VIEWER_LAYOUT_MODES: ViewerLayoutMode[] = [
  "paged",
];

export const VIEWER_LAYOUT_MODE_LABELS: Record<ViewerLayoutMode, string> = {
  paged: "ページ",
};

export function normalizeViewerLayoutMode(_value: string): ViewerLayoutMode {
  return "paged";
}

export const MIN_SCALE = 0.01;
export const MAX_SCALE = 8;
export const SCALE_STEP = 0.1;
export const DEFAULT_SCALE = 1;
export const MIN_LOUPE_SIZE = 80;
export const MAX_LOUPE_SIZE = 400;
export const DEFAULT_LOUPE_SIZE = 180;
export const MIN_LOUPE_ZOOM = 1.25;
export const MAX_LOUPE_ZOOM = 8;
export const DEFAULT_LOUPE_ZOOM = 2;
export const VIEWER_BACKGROUNDS: ViewerBackground[] = [
  "checker",
  "dark",
  "black",
  "light",
];
export const DEFAULT_VIEWER_BACKGROUND: ViewerBackground = "checker";
export const MIN_VIEWER_SPACING = 0;
export const MAX_VIEWER_SPACING = 64;
export const DEFAULT_VIEWER_PAGE_MARGIN = 0;
export const DEFAULT_VIEWER_SPREAD_GAP = 8;
export const VIEWER_CURSOR_AUTO_HIDE_DELAYS = [0, 1_000, 2_000, 3_000, 5_000] as const;
export const DEFAULT_VIEWER_CURSOR_AUTO_HIDE_MS = 0;
export const ZOOM_RETENTIONS: ZoomRetention[] = ["global", "book", "page"];
export const DEFAULT_ZOOM_RETENTION: ZoomRetention = "global";
export const VIEWER_GRID_COLORS: ViewerGridColor[] = ["light", "dark"];
export const DEFAULT_VIEWER_GRID_COLOR: ViewerGridColor = "light";
export const MIN_VIEWER_GRID_SIZE = 8;
export const MAX_VIEWER_GRID_SIZE = 256;
export const DEFAULT_VIEWER_GRID_SIZE = 32;
export const MIN_PAN_FACTOR = 0.5;
export const MAX_PAN_FACTOR = 2;
export const DEFAULT_PAN_FACTOR = 1;
export const MIN_WHEEL_DEAD_ZONE = 0;
export const MAX_WHEEL_DEAD_ZONE = 200;
export const DEFAULT_WHEEL_DEAD_ZONE = 0;
export const MIN_SCROLL_STEP_PERCENT = 10;
export const MAX_SCROLL_STEP_PERCENT = 100;
export const DEFAULT_SCROLL_STEP_PERCENT = 90;
export const MIN_KEY_SCROLL_ACCELERATION_PERCENT = 100;
export const MAX_KEY_SCROLL_ACCELERATION_PERCENT = 300;
export const DEFAULT_KEY_SCROLL_ACCELERATION_PERCENT = 150;
export const DEFAULT_KEY_SCROLL_CONTINUOUS = true;
export const MIN_WHEEL_SCROLL_FACTOR = 0.5;
export const MAX_WHEEL_SCROLL_FACTOR = 2;
export const DEFAULT_WHEEL_SCROLL_FACTOR = 1;
export const DEFAULT_SMOOTH_SCROLL = true;
export const MIN_PREFETCH_PAGE_COUNT = 0;
export const MAX_PREFETCH_PAGE_COUNT = 4;
export const DEFAULT_PREFETCH_AHEAD = 4;
export const DEFAULT_PREFETCH_BEHIND = 0;
export const MIN_PREFETCH_MEMORY_MIB = 16;
export const MAX_PREFETCH_MEMORY_MIB = 512;
export const DEFAULT_PREFETCH_MEMORY_MIB = 256;

export function isPortraitAspectPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_PORTRAIT_ASPECT_PERCENT
    && value <= MAX_PORTRAIT_ASPECT_PERCENT;
}

export function isAutoViewportAspectPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_AUTO_VIEWPORT_ASPECT_PERCENT
    && value <= MAX_AUTO_VIEWPORT_ASPECT_PERCENT;
}

export function isScrollStepPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_SCROLL_STEP_PERCENT
    && value <= MAX_SCROLL_STEP_PERCENT;
}

export function isKeyScrollAccelerationPercent(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= MIN_KEY_SCROLL_ACCELERATION_PERCENT
    && value <= MAX_KEY_SCROLL_ACCELERATION_PERCENT;
}

export function isWheelScrollFactor(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
    && value >= MIN_WHEEL_SCROLL_FACTOR
    && value <= MAX_WHEEL_SCROLL_FACTOR;
}

export function isLoupeSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_LOUPE_SIZE && value <= MAX_LOUPE_SIZE;
}

export function isLoupeZoom(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
    && value >= MIN_LOUPE_ZOOM && value <= MAX_LOUPE_ZOOM;
}

export function isPrefetchPageCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_PREFETCH_PAGE_COUNT && value <= MAX_PREFETCH_PAGE_COUNT;
}

export function isPrefetchMemoryMiB(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_PREFETCH_MEMORY_MIB && value <= MAX_PREFETCH_MEMORY_MIB;
}

export function prefetchWindowIndices(
  visible: readonly number[],
  pageCount: number,
  ahead: number,
  behind: number,
): number[] {
  if (visible.length === 0 || !Number.isInteger(pageCount) || pageCount <= 0) return [];
  const safeAhead = isPrefetchPageCount(ahead) ? ahead : DEFAULT_PREFETCH_AHEAD;
  const safeBehind = isPrefetchPageCount(behind) ? behind : DEFAULT_PREFETCH_BEHIND;
  const first = Math.min(...visible);
  const last = Math.max(...visible);
  const result: number[] = [];
  for (let index = last + 1; index < pageCount && result.length < safeAhead; index += 1) {
    result.push(index);
  }
  for (let offset = 1; offset <= safeBehind; offset += 1) {
    const index = first - offset;
    if (index < 0) break;
    result.push(index);
  }
  return result;
}

export function wheelDeltaPixels(
  delta: number,
  deltaMode: number,
  viewportSize: number,
  factor = DEFAULT_WHEEL_SCROLL_FACTOR,
): number {
  if (!Number.isFinite(delta)) return 0;
  const safeViewport = Number.isFinite(viewportSize) && viewportSize > 0 ? viewportSize : 1;
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? safeViewport : 1;
  const safeFactor = isWheelScrollFactor(factor) ? factor : DEFAULT_WHEEL_SCROLL_FACTOR;
  return delta * unit * safeFactor;
}

export interface PageScanViewport {
  left: number;
  top: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
}

export function pageScanTarget(
  viewport: PageScanViewport,
  mode: PageScanMode,
  readingDirection: ReadingDirection,
  stepPercent: number,
  move: -1 | 1,
  factor = 1,
): { left: number; top: number } | null {
  const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const left = Math.min(maxLeft, Math.max(0, viewport.left));
  const top = Math.min(maxTop, Math.max(0, viewport.top));
  const safePercent = isScrollStepPercent(stepPercent)
    ? stepPercent
    : DEFAULT_SCROLL_STEP_PERCENT;
  const safeFactor = Number.isFinite(factor) && factor >= 1 && factor <= 3 ? factor : 1;
  const stepX = Math.max(1, Math.floor(viewport.clientWidth * safePercent / 100 * safeFactor));
  const stepY = Math.max(1, Math.floor(viewport.clientHeight * safePercent / 100 * safeFactor));
  const forwardX = readingDirection === "rightToLeft" ? -1 : 1;
  const leadingLeft = readingDirection === "rightToLeft" ? maxLeft : 0;
  const trailingLeft = readingDirection === "rightToLeft" ? 0 : maxLeft;
  const canMoveX = (direction: -1 | 1) => direction > 0
    ? left < maxLeft - 1
    : left > 1;
  const moveX = (direction: -1 | 1) => Math.min(
    maxLeft,
    Math.max(0, left + direction * stepX),
  );

  if (mode === "vertical") {
    if (move > 0 && top < maxTop - 1) return { left, top: Math.min(maxTop, top + stepY) };
    if (move < 0 && top > 1) return { left, top: Math.max(0, top - stepY) };
    return null;
  }

  const forward = forwardX as -1 | 1;
  const backward = -forward as -1 | 1;
  if (mode === "n") {
    if (move > 0) {
      if (top < maxTop - 1) return { left, top: Math.min(maxTop, top + stepY) };
      if (canMoveX(forward)) return { left: moveX(forward), top: 0 };
    } else {
      if (top > 1) return { left, top: Math.max(0, top - stepY) };
      if (canMoveX(backward)) return { left: moveX(backward), top: maxTop };
    }
    return null;
  }

  if (move > 0) {
    if (canMoveX(forward)) return { left: moveX(forward), top };
    if (top < maxTop - 1) return { left: leadingLeft, top: Math.min(maxTop, top + stepY) };
  } else {
    if (canMoveX(backward)) return { left: moveX(backward), top };
    if (top > 1) return { left: trailingLeft, top: Math.max(0, top - stepY) };
  }
  return null;
}

export type KeyboardScrollArrow = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export function keyboardScrollTarget(
  viewport: PageScanViewport,
  key: KeyboardScrollArrow,
  stepPercent: number,
  accelerationPercent: number,
  repeated: boolean,
): { left: number; top: number } | null {
  const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const left = Math.min(maxLeft, Math.max(0, viewport.left));
  const top = Math.min(maxTop, Math.max(0, viewport.top));
  const safeStep = isScrollStepPercent(stepPercent)
    ? stepPercent
    : DEFAULT_SCROLL_STEP_PERCENT;
  const safeAcceleration = isKeyScrollAccelerationPercent(accelerationPercent)
    ? accelerationPercent
    : DEFAULT_KEY_SCROLL_ACCELERATION_PERCENT;
  const factor = repeated ? safeAcceleration / 100 : 1;
  const stepX = Math.max(1, Math.floor(viewport.clientWidth * safeStep / 100 * factor));
  const stepY = Math.max(1, Math.floor(viewport.clientHeight * safeStep / 100 * factor));
  const target = {
    left: key === "ArrowLeft"
      ? Math.max(0, left - stepX)
      : key === "ArrowRight" ? Math.min(maxLeft, left + stepX) : left,
    top: key === "ArrowUp"
      ? Math.max(0, top - stepY)
      : key === "ArrowDown" ? Math.min(maxTop, top + stepY) : top,
  };
  return target.left === left && target.top === top ? null : target;
}

export function isPagePairable(
  width: number,
  height: number,
  portraitMaxAspectPercent = DEFAULT_SPREAD_RULES.portraitMaxAspectPercent,
): boolean {
  return Number.isFinite(width) && Number.isFinite(height)
    && width > 0 && height > 0
    && width / height <= portraitMaxAspectPercent / 100;
}

export function autoSpreadForViewport(
  width: number,
  height: number,
  minAspectPercent = DEFAULT_SPREAD_RULES.autoViewportMinAspectPercent,
): boolean {
  return Number.isFinite(width) && Number.isFinite(height)
    && width > 0 && height > 0
    && width / height >= minAspectPercent / 100;
}

export function randomPageIndex(
  currentIndex: number,
  pageCount: number,
  randomValue: number = Math.random(),
): number {
  if (pageCount <= 1) return Math.max(0, Math.min(currentIndex, pageCount - 1));
  const bounded = Math.max(0, Math.min(randomValue, 1 - Number.EPSILON));
  const candidate = Math.floor(bounded * (pageCount - 1));
  return candidate >= currentIndex ? candidate + 1 : candidate;
}

export function normalizeViewerBackground(value: unknown): ViewerBackground {
  return typeof value === "string"
    && VIEWER_BACKGROUNDS.includes(value as ViewerBackground)
    ? value as ViewerBackground
    : DEFAULT_VIEWER_BACKGROUND;
}

export function isViewerSpacing(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= MIN_VIEWER_SPACING
    && value <= MAX_VIEWER_SPACING;
}

export function normalizeViewerSpacing(value: unknown, fallback: number): number {
  return isViewerSpacing(value) ? value : fallback;
}

export function isViewerCursorAutoHideMs(value: unknown): value is number {
  return typeof value === "number"
    && VIEWER_CURSOR_AUTO_HIDE_DELAYS.includes(
      value as typeof VIEWER_CURSOR_AUTO_HIDE_DELAYS[number],
    );
}

export function normalizeViewerCursorAutoHideMs(value: unknown): number {
  return isViewerCursorAutoHideMs(value)
    ? value
    : DEFAULT_VIEWER_CURSOR_AUTO_HIDE_MS;
}

export function normalizeZoomRetention(value: unknown): ZoomRetention {
  return typeof value === "string" && ZOOM_RETENTIONS.includes(value as ZoomRetention)
    ? value as ZoomRetention
    : DEFAULT_ZOOM_RETENTION;
}

export function normalizeViewerGridColor(value: unknown): ViewerGridColor {
  return typeof value === "string" && VIEWER_GRID_COLORS.includes(value as ViewerGridColor)
    ? value as ViewerGridColor
    : DEFAULT_VIEWER_GRID_COLOR;
}

export function isViewerGridSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_VIEWER_GRID_SIZE && value <= MAX_VIEWER_GRID_SIZE;
}

export function isPanFactor(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
    && value >= MIN_PAN_FACTOR && value <= MAX_PAN_FACTOR;
}

export function isWheelDeadZone(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_WHEEL_DEAD_ZONE && value <= MAX_WHEEL_DEAD_ZONE;
}

export function scaleForPixelDimension(
  requestedPixels: number,
  naturalPixels: number,
): number | null {
  if (
    !Number.isInteger(requestedPixels)
    || requestedPixels < 1
    || requestedPixels > 32_768
    || !Number.isFinite(naturalPixels)
    || naturalPixels <= 0
  ) return null;
  const scale = requestedPixels / naturalPixels;
  return scale >= MIN_SCALE && scale <= MAX_SCALE ? normalizeScale(scale) : null;
}

export interface ViewerScaleState {
  mode: ScaleMode;
  scale: number;
  loupeEnabled: boolean;
}

export type ViewerScaleAction =
  | { type: "mode"; mode: ScaleMode }
  | { type: "scale"; scale: number }
  | { type: "zoomIn"; baseScale?: number }
  | { type: "zoomOut"; baseScale?: number }
  | { type: "loupe"; enabled: boolean };

export function normalizeScale(value: number): number {
  const safeValue = Number.isFinite(value) ? value : DEFAULT_SCALE;
  return Number(Math.min(MAX_SCALE, Math.max(MIN_SCALE, safeValue)).toFixed(4));
}

export interface NaturalPageSize {
  width: number;
  height: number;
}

export function fitScaleForPages(
  pages: readonly NaturalPageSize[],
  viewportWidth: number,
  viewportHeight: number,
  pageMargin: number,
  spreadGap: number,
  rules: FitRules = DEFAULT_FIT_RULES,
): number | null {
  if (
    pages.length === 0
    || pages.some((page) => !Number.isFinite(page.width) || page.width <= 0
      || !Number.isFinite(page.height) || page.height <= 0)
    || !Number.isFinite(viewportWidth) || viewportWidth <= 0
    || !Number.isFinite(viewportHeight) || viewportHeight <= 0
  ) return null;
  const margin = rules.includePageMargin ? Math.max(0, pageMargin) * 2 : 0;
  const availableWidth = Math.max(1, viewportWidth - margin);
  const availableHeight = Math.max(1, viewportHeight - margin);
  const fixedSpreadGap = rules.basis === "spread"
    ? Math.max(0, pages.length - 1) * Math.max(0, spreadGap)
    : 0;
  const widthAvailableToImages = Math.max(1, availableWidth - fixedSpreadGap);
  const contentWidth = rules.basis === "spread"
    ? pages.reduce((sum, page) => sum + page.width, 0)
    : Math.max(...pages.map((page) => page.width));
  const contentHeight = Math.max(...pages.map((page) => page.height));
  let result = Math.min(widthAvailableToImages / contentWidth, availableHeight / contentHeight);
  if (!rules.allowUpscale) result = Math.min(1, result);
  return normalizeScale(result);
}

export function createViewerScaleState(
  mode: ScaleMode,
  scale: number,
  loupeEnabled: boolean,
): ViewerScaleState {
  return { mode, scale: normalizeScale(scale), loupeEnabled };
}

export function scaleReducer(
  state: ViewerScaleState,
  action: ViewerScaleAction,
): ViewerScaleState {
  switch (action.type) {
    case "mode":
      return { ...state, mode: action.mode };
    case "scale":
      return { ...state, mode: "custom", scale: normalizeScale(action.scale) };
    case "zoomIn":
      return {
        ...state,
        mode: "custom",
        scale: normalizeScale((action.baseScale ?? state.scale) + SCALE_STEP),
      };
    case "zoomOut":
      return {
        ...state,
        mode: "custom",
        scale: normalizeScale((action.baseScale ?? state.scale) - SCALE_STEP),
      };
    case "loupe":
      return { ...state, loupeEnabled: action.enabled };
  }
}

export function clampLoupePointer(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 0), Math.max(0, width)),
    y: Math.min(Math.max(y, 0), Math.max(0, height)),
  };
}

export function clampLoupeCenter(position: number, extent: number, size: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(extent) || extent <= 0) return 0;
  if (!Number.isFinite(size) || size <= 0 || size >= extent) return extent / 2;
  const radius = size / 2;
  return Math.min(Math.max(position, radius), extent - radius);
}

export interface ViewerState {
  index: number;
  mode: ViewMode;
  direction: ReadingDirection;
  history: number[];
}

export type ViewerAction =
  | {
      type: "next";
      pageCount: number;
      landscape: ReadonlySet<number>;
      autoSpread?: boolean;
      spreadRules?: SpreadRules;
    }
  | { type: "previous" }
  | { type: "shift"; delta: -1 | 1; pageCount: number }
  | { type: "mode"; mode: ViewMode }
  | { type: "toggleDirection" }
  | { type: "go"; index: number };

export function visibleIndices(
  state: ViewerState,
  pageCount: number,
  landscape: ReadonlySet<number>,
  autoSpread = true,
  spreadRules: SpreadRules = DEFAULT_SPREAD_RULES,
): number[] {
  if (state.index >= pageCount) return [];
  const pageNumber = state.index + 1;
  const pairingAllowed = spreadRules.pairing === "continuous"
    || (spreadRules.pairing === "odd" && pageNumber % 2 === 1)
    || (spreadRules.pairing === "even" && pageNumber % 2 === 0);
  if (
    state.mode === "single" ||
    (state.mode === "auto" && !autoSpread) ||
    (spreadRules.firstPageSingle && state.index === 0) ||
    !pairingAllowed ||
    landscape.has(state.index) ||
    landscape.has(state.index + 1) ||
    state.index + 1 >= pageCount
  ) {
    return [state.index];
  }
  return [state.index, state.index + 1];
}

export function viewerReducer(
  state: ViewerState,
  action: ViewerAction,
): ViewerState {
  switch (action.type) {
    case "next": {
      const visible = visibleIndices(
        state,
        action.pageCount,
        action.landscape,
        action.autoSpread,
        action.spreadRules,
      );
      const next = state.index + Math.max(1, visible.length);
      if (next >= action.pageCount) return state;
      return { ...state, index: next, history: [...state.history, state.index] };
    }
    case "previous": {
      const previous = state.history.at(-1);
      if (previous === undefined) return state;
      return { ...state, index: previous, history: state.history.slice(0, -1) };
    }
    case "shift": {
      const index = Math.min(
        Math.max(0, state.index + action.delta),
        Math.max(0, action.pageCount - 1),
      );
      if (index === state.index) return state;
      const history =
        action.delta < 0 && state.history.at(-1) === index
          ? state.history.slice(0, -1)
          : action.delta > 0
            ? [...state.history, state.index]
            : state.history;
      return { ...state, index, history };
    }
    case "mode":
      return { ...state, mode: action.mode };
    case "toggleDirection":
      return {
        ...state,
        direction:
          state.direction === "rightToLeft" ? "leftToRight" : "rightToLeft",
      };
    case "go":
      return { ...state, index: action.index, history: [] };
  }
}
