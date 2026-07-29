export interface NavigationState {
  current: string;
  back: string[];
  forward: string[];
}

export type NavigationAction =
  | { type: "navigate"; path: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reset"; path: string };

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case "navigate":
      if (action.path === state.current) return state;
      return {
        current: action.path,
        back: [...state.back, state.current],
        forward: [],
      };
    case "back": {
      const target = state.back.at(-1);
      if (target === undefined) return state;
      return {
        current: target,
        back: state.back.slice(0, -1),
        forward: [state.current, ...state.forward],
      };
    }
    case "forward": {
      const [target, ...rest] = state.forward;
      if (target === undefined) return state;
      return {
        current: target,
        back: [...state.back, state.current],
        forward: rest,
      };
    }
    case "reset":
      return { current: action.path, back: [], forward: [] };
  }
}

export function parentPath(path: string): string | null {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  if (normalized === "") return null;
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? "" : normalized.slice(0, separator);
}
