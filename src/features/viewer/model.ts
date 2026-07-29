export type ViewMode = "single" | "spread";
export type ReadingDirection = "rightToLeft" | "leftToRight";

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
