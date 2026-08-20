import {
  DEFAULT_SHORTCUTS,
  VIEWER_SHORTCUT_COMMANDS,
  validateShortcutBindings,
  type ShortcutBindings,
} from "../input/shortcuts";
import {
  CATALOG_VIEW_MODES,
  DEFAULT_CATALOG_VIEW_MODE,
  DEFAULT_CATALOG_THUMBNAIL_SIZES,
  MAX_CATALOG_THUMBNAIL_SIZE,
  MIN_CATALOG_THUMBNAIL_SIZE,
  type CatalogThumbnailSizes,
  type CatalogViewMode,
} from "../catalog/view-mode";
import {
  DEFAULT_VIEWER_BACKGROUND,
  DEFAULT_VIEWER_CURSOR_AUTO_HIDE_MS,
  DEFAULT_PAN_FACTOR,
  DEFAULT_VIEWER_GRID_COLOR,
  DEFAULT_VIEWER_GRID_SIZE,
  DEFAULT_WHEEL_DEAD_ZONE,
  DEFAULT_ZOOM_RETENTION,
  DEFAULT_VIEWER_PAGE_MARGIN,
  DEFAULT_VIEWER_SPREAD_GAP,
  DEFAULT_SCALE,
  isViewerCursorAutoHideMs,
  isPanFactor,
  isViewerGridSize,
  isViewerSpacing,
  isWheelDeadZone,
  MAX_SCALE,
  MIN_SCALE,
  VIEWER_BACKGROUNDS,
  VIEWER_GRID_COLORS,
  VIEWER_LAYOUT_MODES,
  type ScaleMode,
  type ViewerBackground,
  type ViewerGridColor,
  type ViewerLayoutMode,
  type ViewMode,
  type ZoomRetention,
  ZOOM_RETENTIONS,
} from "../viewer/model";
import {
  DEFAULT_END_OF_VOLUME_POLICY,
  END_OF_VOLUME_POLICIES,
  type EndOfVolumePolicy,
} from "../catalog/end-of-volume";
import type { SortField } from "../catalog/sort";
import packageMetadata from "../../../package.json";

export const SETTINGS_PROFILE_VERSION = 6;
export const APP_VERSION = packageMetadata.version;

export const NAVIGATION_SELECTION_POLICIES = ["none", "first", "last", "restore"] as const;
export type NavigationSelectionPolicy = (typeof NAVIGATION_SELECTION_POLICIES)[number];
export const DEFAULT_NAVIGATION_SELECTION_POLICY: NavigationSelectionPolicy = "restore";
export const THUMBNAIL_GENERATION_SCOPES = ["visible", "near", "all"] as const;
export type ThumbnailGenerationScope = (typeof THUMBNAIL_GENERATION_SCOPES)[number];
export const DEFAULT_THUMBNAIL_GENERATION_SCOPE: ThumbnailGenerationScope = "near";
export const STARTUP_LOCATIONS = ["last", "driveRoot"] as const;
export type StartupLocation = (typeof STARTUP_LOCATIONS)[number];
export const DEFAULT_STARTUP_LOCATION: StartupLocation = "last";

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
  catalogThumbnailSizes: CatalogThumbnailSizes;
  viewMode: ViewMode;
  layoutMode: ViewerLayoutMode;
  readingDirection: "rightToLeft" | "leftToRight";
  scaleMode: ScaleMode;
  scale: number;
  loupeEnabled: boolean;
  viewerBackground: ViewerBackground;
  viewerPageMargin: number;
  viewerSpreadGap: number;
  cursorAutoHideMs: number;
  zoomRetention: ZoomRetention;
  viewerGridEnabled: boolean;
  viewerGridSize: number;
  viewerGridColor: ViewerGridColor;
  panFactor: number;
  wheelDeadZone: number;
  treeVisible: boolean;
  menuBarVisible: boolean;
  toolbarVisible: boolean;
  addressBarVisible: boolean;
  statusBarVisible: boolean;
  alwaysOnTop: boolean;
  navigationSelectionPolicy: NavigationSelectionPolicy;
  thumbnailGenerationScope: ThumbnailGenerationScope;
  startupLocation: StartupLocation;
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
    catalogThumbnailSizes: { ...DEFAULT_CATALOG_THUMBNAIL_SIZES },
    viewMode: "single",
    layoutMode: "paged",
    readingDirection: "rightToLeft",
    scaleMode: "fit",
    scale: DEFAULT_SCALE,
    loupeEnabled: false,
    viewerBackground: DEFAULT_VIEWER_BACKGROUND,
    viewerPageMargin: DEFAULT_VIEWER_PAGE_MARGIN,
    viewerSpreadGap: DEFAULT_VIEWER_SPREAD_GAP,
    cursorAutoHideMs: DEFAULT_VIEWER_CURSOR_AUTO_HIDE_MS,
    zoomRetention: DEFAULT_ZOOM_RETENTION,
    viewerGridEnabled: false,
    viewerGridSize: DEFAULT_VIEWER_GRID_SIZE,
    viewerGridColor: DEFAULT_VIEWER_GRID_COLOR,
    panFactor: DEFAULT_PAN_FACTOR,
    wheelDeadZone: DEFAULT_WHEEL_DEAD_ZONE,
    treeVisible: true,
    menuBarVisible: true,
    toolbarVisible: true,
    addressBarVisible: true,
    statusBarVisible: true,
    alwaysOnTop: false,
    navigationSelectionPolicy: DEFAULT_NAVIGATION_SELECTION_POLICY,
    thumbnailGenerationScope: DEFAULT_THUMBNAIL_GENERATION_SCOPE,
    startupLocation: DEFAULT_STARTUP_LOCATION,
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
  const catalogThumbnailSizes = candidate.profileVersion === 1
    ? { ...DEFAULT_CATALOG_THUMBNAIL_SIZES }
    : candidate.profileVersion === 2
      ? migrateV2CatalogThumbnailSizes(candidate.catalogThumbnailSizes)
      : strictCatalogThumbnailSizes(candidate.catalogThumbnailSizes);
  const viewMode = enumValue(candidate.viewMode, ["single", "spread"] as const);
  const layoutMode = enumValue(candidate.layoutMode, VIEWER_LAYOUT_MODES);
  const readingDirection = enumValue(candidate.readingDirection, ["rightToLeft", "leftToRight"] as const);
  const scaleMode = enumValue(candidate.scaleMode, ["fit", "width", "height", "original", "custom"] as const);
  const shortcuts = strictShortcutBindings(candidate.shortcuts);
  const mouseGestures = strictMouseGestureBindings(candidate.mouseGestures);
  const legacyViewerAppearance =
    candidate.profileVersion === 1
    || candidate.profileVersion === 2
    || candidate.profileVersion === 3;
  const legacyP1Preferences = legacyViewerAppearance || candidate.profileVersion === 4;
  const viewerBackground = legacyViewerAppearance
    ? DEFAULT_VIEWER_BACKGROUND
    : enumValue(candidate.viewerBackground, VIEWER_BACKGROUNDS);
  const viewerPageMargin = legacyViewerAppearance
    ? DEFAULT_VIEWER_PAGE_MARGIN
    : candidate.viewerPageMargin;
  const viewerSpreadGap = legacyViewerAppearance
    ? DEFAULT_VIEWER_SPREAD_GAP
    : candidate.viewerSpreadGap;
  const cursorAutoHideMs = legacyViewerAppearance
    ? DEFAULT_VIEWER_CURSOR_AUTO_HIDE_MS
    : candidate.cursorAutoHideMs;
  const zoomRetention = legacyP1Preferences
    ? DEFAULT_ZOOM_RETENTION
    : enumValue(candidate.zoomRetention, ZOOM_RETENTIONS);
  const viewerGridEnabled = legacyP1Preferences ? false : candidate.viewerGridEnabled;
  const viewerGridSize = legacyP1Preferences ? DEFAULT_VIEWER_GRID_SIZE : candidate.viewerGridSize;
  const viewerGridColor = legacyP1Preferences
    ? DEFAULT_VIEWER_GRID_COLOR
    : enumValue(candidate.viewerGridColor, VIEWER_GRID_COLORS);
  const panFactor = legacyP1Preferences ? DEFAULT_PAN_FACTOR : candidate.panFactor;
  const wheelDeadZone = legacyP1Preferences ? DEFAULT_WHEEL_DEAD_ZONE : candidate.wheelDeadZone;
  const addressBarVisible = legacyP1Preferences ? true : candidate.addressBarVisible;
  const statusBarVisible = legacyP1Preferences ? true : candidate.statusBarVisible;
  const alwaysOnTop = legacyP1Preferences ? false : candidate.alwaysOnTop;
  const legacyP1BPreferences = legacyP1Preferences || candidate.profileVersion === 5;
  const navigationSelectionPolicy = legacyP1BPreferences
    ? DEFAULT_NAVIGATION_SELECTION_POLICY
    : enumValue(candidate.navigationSelectionPolicy, NAVIGATION_SELECTION_POLICIES);
  const thumbnailGenerationScope = legacyP1BPreferences
    ? DEFAULT_THUMBNAIL_GENERATION_SCOPE
    : enumValue(candidate.thumbnailGenerationScope, THUMBNAIL_GENERATION_SCOPES);
  const startupLocation = legacyP1BPreferences
    ? DEFAULT_STARTUP_LOCATION
    : enumValue(candidate.startupLocation, STARTUP_LOCATIONS);
  if (
    (candidate.profileVersion !== 1
      && candidate.profileVersion !== 2
      && candidate.profileVersion !== 3
      && candidate.profileVersion !== 4
      && candidate.profileVersion !== 5
      && candidate.profileVersion !== SETTINGS_PROFILE_VERSION) ||
    sortField === null ||
    typeof candidate.sortDescending !== "boolean" ||
    endOfVolumePolicy === null ||
    catalogViewMode === null ||
    catalogThumbnailSizes === null ||
    viewMode === null ||
    layoutMode === null ||
    readingDirection === null ||
    scaleMode === null ||
    typeof candidate.scale !== "number" ||
    !Number.isFinite(candidate.scale) ||
    candidate.scale < MIN_SCALE ||
    candidate.scale > MAX_SCALE ||
    typeof candidate.loupeEnabled !== "boolean" ||
    viewerBackground === null ||
    !isViewerSpacing(viewerPageMargin) ||
    !isViewerSpacing(viewerSpreadGap) ||
    !isViewerCursorAutoHideMs(cursorAutoHideMs) ||
    zoomRetention === null ||
    typeof viewerGridEnabled !== "boolean" ||
    !isViewerGridSize(viewerGridSize) ||
    viewerGridColor === null ||
    !isPanFactor(panFactor) ||
    !isWheelDeadZone(wheelDeadZone) ||
    typeof candidate.treeVisible !== "boolean" ||
    typeof candidate.menuBarVisible !== "boolean" ||
    typeof candidate.toolbarVisible !== "boolean" ||
    typeof addressBarVisible !== "boolean" ||
    typeof statusBarVisible !== "boolean" ||
    typeof alwaysOnTop !== "boolean" ||
    navigationSelectionPolicy === null ||
    thumbnailGenerationScope === null ||
    startupLocation === null ||
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
    catalogThumbnailSizes,
    viewMode,
    layoutMode,
    readingDirection,
    scaleMode,
    scale: candidate.scale,
    loupeEnabled: candidate.loupeEnabled,
    viewerBackground,
    viewerPageMargin,
    viewerSpreadGap,
    cursorAutoHideMs,
    zoomRetention,
    viewerGridEnabled,
    viewerGridSize,
    viewerGridColor,
    panFactor,
    wheelDeadZone,
    treeVisible: candidate.treeVisible,
    menuBarVisible: candidate.menuBarVisible,
    toolbarVisible: candidate.toolbarVisible,
    addressBarVisible,
    statusBarVisible,
    alwaysOnTop,
    navigationSelectionPolicy,
    thumbnailGenerationScope,
    startupLocation,
    shortcuts,
    mouseGestures,
  };
}

function strictCatalogThumbnailSizes(value: unknown): CatalogThumbnailSizes | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const valid = (size: unknown): size is number => typeof size === "number"
    && Number.isInteger(size)
    && size >= MIN_CATALOG_THUMBNAIL_SIZE
    && size <= MAX_CATALOG_THUMBNAIL_SIZE;
  return valid(candidate.smallThumbnail)
    && valid(candidate.coverList)
    && valid(candidate.cardGrid)
    && valid(candidate.referenceTile)
    ? {
        smallThumbnail: candidate.smallThumbnail,
        coverList: candidate.coverList,
        cardGrid: candidate.cardGrid,
        referenceTile: candidate.referenceTile,
      }
    : null;
}

function migrateV2CatalogThumbnailSizes(value: unknown): CatalogThumbnailSizes | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const migrated = strictCatalogThumbnailSizes({
    ...candidate,
    cardGrid: DEFAULT_CATALOG_THUMBNAIL_SIZES.cardGrid,
  });
  return migrated;
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
