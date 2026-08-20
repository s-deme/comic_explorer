export type ViewMode = "single" | "spread";
export type ReadingDirection = "rightToLeft" | "leftToRight";
export type ScaleMode = "fit" | "width" | "height" | "original" | "custom";
export type ViewerBackground = "checker" | "dark" | "black" | "light";
export type ViewerLayoutMode =
  | "paged"
  | "vertical_scroll"
  | "horizontal_scroll";

export const VIEWER_LAYOUT_MODES: ViewerLayoutMode[] = [
  "paged",
  "vertical_scroll",
  "horizontal_scroll",
];

export const VIEWER_LAYOUT_MODE_LABELS: Record<ViewerLayoutMode, string> = {
  paged: "ページ",
  vertical_scroll: "縦スクロール",
  horizontal_scroll: "横スクロール",
};

export function normalizeViewerLayoutMode(value: string): ViewerLayoutMode {
  return VIEWER_LAYOUT_MODES.includes(value as ViewerLayoutMode)
    ? (value as ViewerLayoutMode)
    : "paged";
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;
export const SCALE_STEP = 0.1;
export const DEFAULT_SCALE = 1;
export const LOUPE_ZOOM = 2;
export const LOUPE_SIZE = 180;
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

export interface ViewerState {
  index: number;
  mode: ViewMode;
  direction: ReadingDirection;
  history: number[];
}

export type ViewerAction =
  | { type: "next"; pageCount: number; landscape: ReadonlySet<number> }
  | { type: "previous" }
  | { type: "shift"; delta: -1 | 1; pageCount: number }
  | { type: "mode"; mode: ViewMode }
  | { type: "toggleDirection" }
  | { type: "go"; index: number };

export function visibleIndices(
  state: ViewerState,
  pageCount: number,
  landscape: ReadonlySet<number>,
): number[] {
  if (state.index >= pageCount) return [];
  if (
    state.mode === "single" ||
    landscape.has(state.index) ||
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
