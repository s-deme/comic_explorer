import {
  SHORTCUT_COMMANDS,
  normalizeShortcut,
  type ShortcutBindings,
} from "../input/shortcuts";
import { CATALOG_VIEW_MODES, type CatalogViewMode } from "../catalog/view-mode";
import {
  MAX_SCALE,
  MIN_SCALE,
  VIEWER_LAYOUT_MODES,
  type ScaleMode,
  type ViewerLayoutMode,
  type ViewMode,
} from "../viewer/model";
import {
  END_OF_VOLUME_POLICIES,
  type EndOfVolumePolicy,
} from "../catalog/end-of-volume";
import type { SortField } from "../catalog/sort";
import packageMetadata from "../../../package.json";

export const SETTINGS_PROFILE_VERSION = 1;
export const APP_VERSION = packageMetadata.version;

export const MOUSE_GESTURE_ACTIONS = [
  "none",
  "nextPage",
  "previousPage",
  "closeViewer",
] as const;
export type MouseGestureAction = (typeof MOUSE_GESTURE_ACTIONS)[number];
export const MOUSE_GESTURE_NAMES = ["swipeLeft", "swipeRight", "doubleClick"] as const;
export type MouseGestureName = (typeof MOUSE_GESTURE_NAMES)[number];
export type MouseGestureBindings = Record<MouseGestureName, MouseGestureAction>;

export const DEFAULT_MOUSE_GESTURES: MouseGestureBindings = {
  swipeLeft: "nextPage",
  swipeRight: "previousPage",
  doubleClick: "none",
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

export function normalizeMouseGestures(value: unknown): MouseGestureBindings {
  const result = { ...DEFAULT_MOUSE_GESTURES };
  if (value === null || typeof value !== "object" || Array.isArray(value)) return result;
  const candidate = value as Record<string, unknown>;
  for (const name of MOUSE_GESTURE_NAMES) {
    const action = candidate[name];
    if (typeof action === "string" && MOUSE_GESTURE_ACTIONS.includes(action as MouseGestureAction)) {
      result[name] = action as MouseGestureAction;
    }
  }
  const seen = new Set<MouseGestureAction>();
  for (const action of Object.values(result)) {
    if (action === "none") continue;
    if (seen.has(action)) return { ...DEFAULT_MOUSE_GESTURES };
    seen.add(action);
  }
  return result;
}

export type GestureUpdateResult =
  | { ok: true; bindings: MouseGestureBindings }
  | { ok: false; reason: "conflict" };

export function remapMouseGesture(
  bindings: MouseGestureBindings,
  name: MouseGestureName,
  action: MouseGestureAction,
): GestureUpdateResult {
  if (action !== "none" && Object.entries(bindings).some(([candidate, value]) => candidate !== name && value === action)) {
    return { ok: false, reason: "conflict" };
  }
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
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const result = {} as ShortcutBindings;
  const seen = new Set<string>();
  for (const command of SHORTCUT_COMMANDS) {
    if (!Object.prototype.hasOwnProperty.call(candidate, command)) return null;
    const shortcut = normalizeShortcut(candidate[command]);
    if (shortcut === null || seen.has(shortcut)) return null;
    result[command] = shortcut;
    seen.add(shortcut);
  }
  return result;
}

function strictMouseGestureBindings(value: unknown): MouseGestureBindings | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const result = {} as MouseGestureBindings;
  const seen = new Set<MouseGestureAction>();
  for (const name of MOUSE_GESTURE_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(candidate, name)) return null;
    const action = enumValue(candidate[name], MOUSE_GESTURE_ACTIONS);
    if (action === null || (action !== "none" && seen.has(action))) return null;
    result[name] = action;
    if (action !== "none") seen.add(action);
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
