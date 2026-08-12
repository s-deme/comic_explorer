export interface NavigationState {
  current: string;
  back: string[];
  forward: string[];
}

export type NavigationAction =
  | { type: "navigate"; path: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "jumpBack"; index: number }
  | { type: "jumpForward"; index: number }
  | { type: "reset"; path: string };

export function normalizeWindowsDisplayPath(path: string): string {
  const trimmed = path.trim();
  const unquoted = trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;
  const normalized = unquoted.trim().replaceAll("/", "\\");
  const withoutExtendedPrefix = normalized.toLocaleLowerCase("en-US").startsWith("\\\\?\\unc\\")
    ? `\\\\${normalized.slice(8)}`
    : normalized.startsWith("\\\\?\\")
      ? normalized.slice(4)
      : normalized;
  return /^[a-zA-Z]:\\+$/.test(withoutExtendedPrefix)
    ? `${withoutExtendedPrefix[0]}:\\`
    : withoutExtendedPrefix.replace(/\\+$/, "");
}

export interface WindowsDriveAddress {
  driveRoot: string;
  relativePath: string;
}

export function parseWindowsDriveAddress(address: string): WindowsDriveAddress | null {
  const normalized = normalizeWindowsDisplayPath(address);
  const match = /^([a-zA-Z]):(?:\\(.*))?$/.exec(normalized);
  if (match === null) return null;
  const segments = (match[2] ?? "").split("\\").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  return {
    driveRoot: `${match[1].toLocaleUpperCase("en-US")}:\\`,
    relativePath: segments.join("/"),
  };
}

export function relativeAddressWithinRoot(
  address: string,
  libraryRoot: string,
): string | null {
  const normalizedAddress = normalizeWindowsDisplayPath(address);
  const normalizedRoot = normalizeWindowsDisplayPath(libraryRoot);
  const foldedAddress = normalizedAddress.toLocaleLowerCase("en-US");
  const foldedRoot = normalizedRoot.toLocaleLowerCase("en-US");

  if (foldedAddress === foldedRoot) return "";
  const rootPrefix = foldedRoot.endsWith("\\") ? foldedRoot : `${foldedRoot}\\`;
  if (!foldedAddress.startsWith(rootPrefix)) return null;

  const relative = normalizedAddress.slice(rootPrefix.length);
  if (relative.split("\\").some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return relative.replaceAll("\\", "/");
}

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
    case "jumpBack": {
      if (!Number.isInteger(action.index) || action.index < 0) return state;
      const target = state.back[action.index];
      if (target === undefined) return state;
      return {
        current: target,
        back: state.back.slice(0, action.index),
        forward: [
          ...state.back.slice(action.index + 1),
          state.current,
          ...state.forward,
        ],
      };
    }
    case "jumpForward": {
      if (!Number.isInteger(action.index) || action.index < 0) return state;
      const target = state.forward[action.index];
      if (target === undefined) return state;
      return {
        current: target,
        back: [
          ...state.back,
          state.current,
          ...state.forward.slice(0, action.index),
        ],
        forward: state.forward.slice(action.index + 1),
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
