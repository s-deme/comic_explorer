import {
  DEFAULT_SHORTCUTS,
  VIEWER_SHORTCUT_COMMANDS,
  validateShortcutBindings,
  type ShortcutBindings,
} from "../input/shortcuts";
import {
  CATALOG_VIEW_MODES,
  DEFAULT_CATALOG_VIEW_MODE,
  type CatalogViewMode,
} from "../catalog/view-mode";
import {
  DEFAULT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  VIEWER_LAYOUT_MODES,
  type ScaleMode,
  type ViewerLayoutMode,
  type ViewMode,
} from "../viewer/model";
import {
  DEFAULT_END_OF_VOLUME_POLICY,
  END_OF_VOLUME_POLICIES,
  type EndOfVolumePolicy,
} from "../catalog/end-of-volume";
import type { SortField } from "../catalog/sort";
import packageMetadata from "../../../package.json";

export const SETTINGS_PROFILE_VERSION = 1;
export const APP_VERSION = packageMetadata.version;

export const MOUSE_GESTURE_ACTIONS = ["none", ...VIEWER_SHORTCUT_COMMANDS] as const;
export type MouseGestureAction = (typeof MOUSE_GESTURE_ACTIONS)[number];
export const LEGACY_MOUSE_GESTURE_NAMES = ["swipeLeft", "swipeRight", "doubleClick"] as const;
export const MOUSE_GESTURE_NAMES = [
  "swipeLeft",
  "swipeRight",
  "wheelUp",
  "wheelDown",
  "rightWheelUp",
  "rightWheelDown",
  "middleClick",
  "backButton",
  "forwardButton",
  "doubleClick",
] as const;
export type MouseGestureName = (typeof MOUSE_GESTURE_NAMES)[number];
export const CONFIGURABLE_MOUSE_GESTURE_NAMES = MOUSE_GESTURE_NAMES.filter(
  (name) => name !== "doubleClick",
) as Exclude<MouseGestureName, "doubleClick">[];
export type MouseGestureBindings = Record<MouseGestureName, MouseGestureAction>;

export const DEFAULT_MOUSE_GESTURES: MouseGestureBindings = {
  swipeLeft: "nextPage",
  swipeRight: "previousPage",
  wheelUp: "previousPage",
  wheelDown: "nextPage",
  rightWheelUp: "zoomIn",
  rightWheelDown: "zoomOut",
  middleClick: "none",
  backButton: "previousPage",
  forwardButton: "nextPage",
  doubleClick: "toggleFullscreen",
};

export interface SettingsProfile {
  profileVersion: number;
  sortField: SortField;
  sortDescending: boolean;
  endOfVolumePolicy: EndOfVolumePolicy;
  catalogViewMode: CatalogViewMode;
  viewMode: ViewMode;
  layoutMode: ViewerLayoutMode;
  readingDirection: "rightToLeft" | "leftToRight";
  scaleMode: ScaleMode;
  scale: number;
  loupeEnabled: boolean;
  treeVisible: boolean;
  menuBarVisible: boolean;
  toolbarVisible: boolean;
  shortcuts: ShortcutBindings;
  mouseGestures: MouseGestureBindings;
}

export function createDefaultSettingsProfile(): SettingsProfile {
  return {
    profileVersion: SETTINGS_PROFILE_VERSION,
    sortField: "name",
    sortDescending: false,
    endOfVolumePolicy: DEFAULT_END_OF_VOLUME_POLICY,
    catalogViewMode: DEFAULT_CATALOG_VIEW_MODE,
    viewMode: "single",
    layoutMode: "paged",
    readingDirection: "rightToLeft",
    scaleMode: "fit",
    scale: DEFAULT_SCALE,
    loupeEnabled: false,
    treeVisible: true,
    menuBarVisible: true,
    toolbarVisible: true,
    shortcuts: { ...DEFAULT_SHORTCUTS },
    mouseGestures: { ...DEFAULT_MOUSE_GESTURES },
  };
}

export function normalizeMouseGestures(value: unknown): MouseGestureBindings {
  const result = { ...DEFAULT_MOUSE_GESTURES };
  if (value === null || typeof value !== "object" || Array.isArray(value)) return result;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const fullShape = keys.length === MOUSE_GESTURE_NAMES.length
    && keys.every((name) => MOUSE_GESTURE_NAMES.includes(name as MouseGestureName));
  const legacyShape = keys.length === LEGACY_MOUSE_GESTURE_NAMES.length
    && keys.every((name) => LEGACY_MOUSE_GESTURE_NAMES.includes(
      name as typeof LEGACY_MOUSE_GESTURE_NAMES[number],
    ));
  if (!fullShape && !legacyShape) return result;
  for (const name of MOUSE_GESTURE_NAMES) {
    const action = candidate[name];
    if (typeof action === "string" && MOUSE_GESTURE_ACTIONS.includes(action as MouseGestureAction)) {
      result[name] = action as MouseGestureAction;
    }
  }
  result.doubleClick = "toggleFullscreen";
  return result;
}

export type GestureUpdateResult =
  | { ok: true; bindings: MouseGestureBindings }
  | { ok: false; reason: "fixed" };

export function remapMouseGesture(
  bindings: MouseGestureBindings,
  name: MouseGestureName,
  action: MouseGestureAction,
): GestureUpdateResult {
  if (name === "doubleClick") return { ok: false, reason: "fixed" };
  return { ok: true, bindings: { ...bindings, [name]: action } };
}

export function normalizeSettingsProfile(value: unknown): SettingsProfile | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const sortField = enumValue(candidate.sortField, ["name", "modified", "size", "kind"] as const);
  const endOfVolumePolicy = enumValue(candidate.endOfVolumePolicy, END_OF_VOLUME_POLICIES);
  const catalogViewMode = enumValue(candidate.catalogViewMode, CATALOG_VIEW_MODES);
  const viewMode = enumValue(candidate.viewMode, ["single", "spread"] as const);
  const layoutMode = enumValue(candidate.layoutMode, VIEWER_LAYOUT_MODES);
  const readingDirection = enumValue(candidate.readingDirection, ["rightToLeft", "leftToRight"] as const);
  const scaleMode = enumValue(candidate.scaleMode, ["fit", "width", "height", "original", "custom"] as const);
  const shortcuts = strictShortcutBindings(candidate.shortcuts);
  const mouseGestures = strictMouseGestureBindings(candidate.mouseGestures);
  if (
    candidate.profileVersion !== SETTINGS_PROFILE_VERSION ||
    sortField === null ||
    typeof candidate.sortDescending !== "boolean" ||
    endOfVolumePolicy === null ||
    catalogViewMode === null ||
    viewMode === null ||
    layoutMode === null ||
    readingDirection === null ||
    scaleMode === null ||
    typeof candidate.scale !== "number" ||
    !Number.isFinite(candidate.scale) ||
    candidate.scale < MIN_SCALE ||
    candidate.scale > MAX_SCALE ||
    typeof candidate.loupeEnabled !== "boolean" ||
    typeof candidate.treeVisible !== "boolean" ||
    typeof candidate.menuBarVisible !== "boolean" ||
    typeof candidate.toolbarVisible !== "boolean" ||
    shortcuts === null ||
    mouseGestures === null
  ) {
    return null;
  }
  return {
    profileVersion: SETTINGS_PROFILE_VERSION,
    sortField,
    sortDescending: candidate.sortDescending,
    endOfVolumePolicy,
    catalogViewMode,
    viewMode,
    layoutMode,
    readingDirection,
    scaleMode,
    scale: candidate.scale,
    loupeEnabled: candidate.loupeEnabled,
    treeVisible: candidate.treeVisible,
    menuBarVisible: candidate.menuBarVisible,
    toolbarVisible: candidate.toolbarVisible,
    shortcuts,
    mouseGestures,
  };
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && allowed.includes(value as T)
    ? value as T
    : null;
}

function strictShortcutBindings(value: unknown): ShortcutBindings | null {
  return validateShortcutBindings(value);
}

function strictMouseGestureBindings(value: unknown): MouseGestureBindings | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const fullShape = keys.length === MOUSE_GESTURE_NAMES.length
    && keys.every((name) => MOUSE_GESTURE_NAMES.includes(name as MouseGestureName));
  const legacyShape = keys.length === LEGACY_MOUSE_GESTURE_NAMES.length
    && keys.every((name) => LEGACY_MOUSE_GESTURE_NAMES.includes(name as typeof LEGACY_MOUSE_GESTURE_NAMES[number]));
  if (!fullShape && !legacyShape) return null;
  const result = {} as MouseGestureBindings;
  for (const name of MOUSE_GESTURE_NAMES) {
    const raw = Object.prototype.hasOwnProperty.call(candidate, name)
      ? candidate[name]
      : DEFAULT_MOUSE_GESTURES[name];
    const action = enumValue(raw, MOUSE_GESTURE_ACTIONS);
    if (action === null) return null;
    if (name === "doubleClick") {
      result[name] = "toggleFullscreen";
      continue;
    }
    result[name] = action;
  }
  return result;
}

export function loadMouseGestures(storage: Pick<Storage, "getItem"> | undefined): MouseGestureBindings {
  try {
    const raw = storage?.getItem("comic-explorer.mouse-gestures");
    return raw === null || raw === undefined ? { ...DEFAULT_MOUSE_GESTURES } : normalizeMouseGestures(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_MOUSE_GESTURES };
  }
}

export function saveMouseGestures(
  storage: Pick<Storage, "setItem"> | undefined,
  bindings: MouseGestureBindings,
): boolean {
  try {
    storage?.setItem("comic-explorer.mouse-gestures", JSON.stringify(bindings));
    return storage !== undefined;
  } catch {
    // Browser storage may be disabled; the current-session state remains usable.
    return false;
  }
}
