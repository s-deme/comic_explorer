import {
  DEFAULT_SHORTCUTS,
  normalizeShortcutBindings,
  type ShortcutBindings,
} from "../input/shortcuts";
import type { CatalogViewMode } from "../catalog/view-mode";
import type { ScaleMode, ViewerLayoutMode, ViewMode } from "../viewer/model";
import type { EndOfVolumePolicy } from "../catalog/end-of-volume";
import type { SortField } from "../catalog/sort";

export const SETTINGS_PROFILE_VERSION = 1;
export const APP_VERSION = "0.1.0";

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
  const numberOr = (key: string, fallback: number) =>
    typeof candidate[key] === "number" && Number.isFinite(candidate[key]) ? candidate[key] as number : fallback;
  const stringOr = <T extends string>(key: string, fallback: T): T =>
    typeof candidate[key] === "string" ? candidate[key] as T : fallback;
  return {
    profileVersion: SETTINGS_PROFILE_VERSION,
    sortField: stringOr("sortField", "name") as SortField,
    sortDescending: candidate.sortDescending === true,
    endOfVolumePolicy: stringOr("endOfVolumePolicy", "auto_next") as EndOfVolumePolicy,
    catalogViewMode: stringOr("catalogViewMode", "cover_list") as CatalogViewMode,
    viewMode: stringOr("viewMode", "single") as ViewMode,
    layoutMode: stringOr("layoutMode", "paged") as ViewerLayoutMode,
    readingDirection: stringOr("readingDirection", "rightToLeft") as SettingsProfile["readingDirection"],
    scaleMode: stringOr("scaleMode", "fit") as ScaleMode,
    scale: Math.min(4, Math.max(0.25, numberOr("scale", 1))),
    loupeEnabled: candidate.loupeEnabled === true,
    shortcuts: normalizeShortcutBindings(candidate.shortcuts ?? DEFAULT_SHORTCUTS),
    mouseGestures: normalizeMouseGestures(candidate.mouseGestures),
  };
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
): void {
  try {
    storage?.setItem("comic-explorer.mouse-gestures", JSON.stringify(bindings));
  } catch {
    // Browser storage may be disabled; the current-session state remains usable.
  }
}
