export type ViewMode = "single" | "spread";
export type ReadingDirection = "rightToLeft" | "leftToRight";
export type ScaleMode = "fit" | "width" | "height" | "original" | "custom";

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;
export const SCALE_STEP = 0.1;
export const DEFAULT_SCALE = 1;
export const LOUPE_ZOOM = 2;
export const LOUPE_SIZE = 180;

export interface ViewerScaleState {
  mode: ScaleMode;
  scale: number;
  loupeEnabled: boolean;
}

export type ViewerScaleAction =
  | { type: "mode"; mode: ScaleMode }
  | { type: "scale"; scale: number }
  | { type: "zoomIn" }
  | { type: "zoomOut" }
  | { type: "loupe"; enabled: boolean };

export function normalizeScale(value: number): number {
  const safeValue = Number.isFinite(value) ? value : DEFAULT_SCALE;
  const rounded = Math.round(safeValue / SCALE_STEP) * SCALE_STEP;
  return Number(Math.min(MAX_SCALE, Math.max(MIN_SCALE, rounded)).toFixed(2));
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
        scale: normalizeScale(state.scale + SCALE_STEP),
      };
    case "zoomOut":
      return {
        ...state,
        mode: "custom",
        scale: normalizeScale(state.scale - SCALE_STEP),
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
