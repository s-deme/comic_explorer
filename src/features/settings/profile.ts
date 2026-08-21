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
  DEFAULT_SCROLL_STEP_PERCENT,
  DEFAULT_WHEEL_SCROLL_FACTOR,
  DEFAULT_SMOOTH_SCROLL,
  DEFAULT_PAGE_SCAN_MODE,
  DEFAULT_LOUPE_SIZE,
  DEFAULT_LOUPE_ZOOM,
  DEFAULT_PREFETCH_AHEAD,
  DEFAULT_PREFETCH_BEHIND,
  DEFAULT_PREFETCH_MEMORY_MIB,
  DEFAULT_ZOOM_RETENTION,
  DEFAULT_VIEWER_PAGE_MARGIN,
  DEFAULT_VIEWER_SPREAD_GAP,
  DEFAULT_SPREAD_RULES,
  DEFAULT_FIT_RULES,
  DEFAULT_SCALE,
  isViewerCursorAutoHideMs,
  isPanFactor,
  isViewerGridSize,
  isViewerSpacing,
  isAutoViewportAspectPercent,
  isPortraitAspectPercent,
  isWheelDeadZone,
  isScrollStepPercent,
  isWheelScrollFactor,
  isLoupeSize,
  isLoupeZoom,
  isPrefetchPageCount,
  isPrefetchMemoryMiB,
  MAX_SCALE,
  MIN_SCALE,
  VIEWER_BACKGROUNDS,
  VIEWER_GRID_COLORS,
  VIEWER_LAYOUT_MODES,
  VIEW_MODES,
  SPREAD_PAIRINGS,
  FIT_BASES,
  PAGE_SCAN_MODES,
  type ScaleMode,
  type ViewerBackground,
  type ViewerGridColor,
  type ViewerLayoutMode,
  type ViewMode,
  type SpreadPairing,
  type FitBasis,
  type PageScanMode,
  type ZoomRetention,
  ZOOM_RETENTIONS,
} from "../viewer/model";
import {
  DEFAULT_END_OF_VOLUME_POLICY,
  END_OF_VOLUME_POLICIES,
  type EndOfVolumePolicy,
} from "../catalog/end-of-volume";
import {
  DEFAULT_SLIDESHOW_INTERVAL_MS,
  DEFAULT_SLIDESHOW_ORDER,
  isSlideshowIntervalMs,
  isSlideshowOrder,
  type SlideshowOrder,
} from "../viewer/slideshow";
import type { SortField } from "../catalog/sort";
import packageMetadata from "../../../package.json";

export const SETTINGS_PROFILE_VERSION = 20;
export const APP_VERSION = packageMetadata.version;

export const MIN_TREE_WIDTH = 180;
export const MAX_TREE_WIDTH = 480;
export const DEFAULT_TREE_WIDTH = 240;

export const FOLDER_OPEN_RULES = ["navigate", "read", "none"] as const;
export type FolderOpenRule = (typeof FOLDER_OPEN_RULES)[number];
export const FILE_OPEN_RULES = ["read", "none"] as const;
export type FileOpenRule = (typeof FILE_OPEN_RULES)[number];

export const FULLSCREEN_ESCAPE_BEHAVIORS = ["exitFullscreen", "closeViewer"] as const;
export type FullscreenEscapeBehavior = (typeof FULLSCREEN_ESCAPE_BEHAVIORS)[number];
export const DEFAULT_FULLSCREEN_ESCAPE_BEHAVIOR: FullscreenEscapeBehavior = "exitFullscreen";
export const TRAY_CLOSE_BEHAVIORS = ["quit", "store"] as const;
export type TrayCloseBehavior = (typeof TRAY_CLOSE_BEHAVIORS)[number];
export const TRAY_RESTORE_GESTURES = ["singleClick", "doubleClick"] as const;
export type TrayRestoreGesture = (typeof TRAY_RESTORE_GESTURES)[number];

export const NAVIGATION_SELECTION_POLICIES = ["none", "first", "last", "restore"] as const;
export type NavigationSelectionPolicy = (typeof NAVIGATION_SELECTION_POLICIES)[number];
export const DEFAULT_NAVIGATION_SELECTION_POLICY: NavigationSelectionPolicy = "restore";
export const THUMBNAIL_GENERATION_SCOPES = ["visible", "near", "all"] as const;
export type ThumbnailGenerationScope = (typeof THUMBNAIL_GENERATION_SCOPES)[number];
export const DEFAULT_THUMBNAIL_GENERATION_SCOPE: ThumbnailGenerationScope = "near";
export const STARTUP_LOCATIONS = ["last", "driveRoot"] as const;
export type StartupLocation = (typeof STARTUP_LOCATIONS)[number];
export const DEFAULT_STARTUP_LOCATION: StartupLocation = "last";
export const CATALOG_PALETTES = ["system", "paper", "midnight", "highContrast"] as const;
export type CatalogPalette = (typeof CATALOG_PALETTES)[number];
export const DEFAULT_CATALOG_PALETTE: CatalogPalette = "system";

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
  spreadPortraitMaxAspectPercent: number;
  autoSpreadMinViewportAspectPercent: number;
  spreadFirstPageSingle: boolean;
  spreadPairing: SpreadPairing;
  fitAllowUpscale: boolean;
  fitBasis: FitBasis;
  fitIncludePageMargin: boolean;
  layoutMode: ViewerLayoutMode;
  readingDirection: "rightToLeft" | "leftToRight";
  scaleMode: ScaleMode;
  scale: number;
  loupeEnabled: boolean;
  loupeSize: number;
  loupeZoom: number;
  prefetchAhead: number;
  prefetchBehind: number;
  prefetchMemoryMiB: number;
  fullscreenEscapeBehavior: FullscreenEscapeBehavior;
  preventDisplaySleepFullscreen: boolean;
  trayStoreOnMinimize: boolean;
  trayCloseBehavior: TrayCloseBehavior;
  trayRestoreGesture: TrayRestoreGesture;
  slideshowIntervalMs: number;
  slideshowOrder: SlideshowOrder;
  slideshowRepeatCurrentItem: boolean;
  viewerCatalogSelectionSync: boolean;
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
  scrollStepPercent: number;
  wheelScrollFactor: number;
  smoothScroll: boolean;
  pageScanMode: PageScanMode;
  treeVisible: boolean;
  treeAutoCollapse: boolean;
  treeConfirmChildren: boolean;
  treeWidth: number;
  menuBarVisible: boolean;
  toolbarVisible: boolean;
  addressBarVisible: boolean;
  statusBarVisible: boolean;
  alwaysOnTop: boolean;
  navigationSelectionPolicy: NavigationSelectionPolicy;
  thumbnailGenerationScope: ThumbnailGenerationScope;
  startupLocation: StartupLocation;
  showHiddenFiles: boolean;
  catalogPalette: CatalogPalette;
  restoreLastViewer: boolean;
  autoRefreshCurrentFolder: boolean;
  folderOpenRule: FolderOpenRule;
  imageOpenRule: FileOpenRule;
  archiveOpenRule: FileOpenRule;
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
    spreadPortraitMaxAspectPercent: DEFAULT_SPREAD_RULES.portraitMaxAspectPercent,
    autoSpreadMinViewportAspectPercent: DEFAULT_SPREAD_RULES.autoViewportMinAspectPercent,
    spreadFirstPageSingle: DEFAULT_SPREAD_RULES.firstPageSingle,
    spreadPairing: DEFAULT_SPREAD_RULES.pairing,
    fitAllowUpscale: DEFAULT_FIT_RULES.allowUpscale,
    fitBasis: DEFAULT_FIT_RULES.basis,
    fitIncludePageMargin: DEFAULT_FIT_RULES.includePageMargin,
    layoutMode: "paged",
    readingDirection: "rightToLeft",
    scaleMode: "fit",
    scale: DEFAULT_SCALE,
    loupeEnabled: false,
    loupeSize: DEFAULT_LOUPE_SIZE,
    loupeZoom: DEFAULT_LOUPE_ZOOM,
    prefetchAhead: DEFAULT_PREFETCH_AHEAD,
    prefetchBehind: DEFAULT_PREFETCH_BEHIND,
    prefetchMemoryMiB: DEFAULT_PREFETCH_MEMORY_MIB,
    fullscreenEscapeBehavior: DEFAULT_FULLSCREEN_ESCAPE_BEHAVIOR,
    preventDisplaySleepFullscreen: false,
    trayStoreOnMinimize: false,
    trayCloseBehavior: "quit",
    trayRestoreGesture: "singleClick",
    slideshowIntervalMs: DEFAULT_SLIDESHOW_INTERVAL_MS,
    slideshowOrder: DEFAULT_SLIDESHOW_ORDER,
    slideshowRepeatCurrentItem: false,
    viewerCatalogSelectionSync: true,
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
    scrollStepPercent: DEFAULT_SCROLL_STEP_PERCENT,
    wheelScrollFactor: DEFAULT_WHEEL_SCROLL_FACTOR,
    smoothScroll: DEFAULT_SMOOTH_SCROLL,
    pageScanMode: DEFAULT_PAGE_SCAN_MODE,
    treeVisible: true,
    treeAutoCollapse: false,
    treeConfirmChildren: true,
    treeWidth: DEFAULT_TREE_WIDTH,
    menuBarVisible: true,
    toolbarVisible: true,
    addressBarVisible: true,
    statusBarVisible: true,
    alwaysOnTop: false,
    navigationSelectionPolicy: DEFAULT_NAVIGATION_SELECTION_POLICY,
    thumbnailGenerationScope: DEFAULT_THUMBNAIL_GENERATION_SCOPE,
    startupLocation: DEFAULT_STARTUP_LOCATION,
    showHiddenFiles: false,
    catalogPalette: DEFAULT_CATALOG_PALETTE,
    restoreLastViewer: false,
    autoRefreshCurrentFolder: true,
    folderOpenRule: "navigate",
    imageOpenRule: "read",
    archiveOpenRule: "read",
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
  const viewMode = enumValue(candidate.viewMode, VIEW_MODES);
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
  const legacyP1CPreferences = legacyP1BPreferences || candidate.profileVersion === 6;
  const showHiddenFiles = legacyP1CPreferences ? false : candidate.showHiddenFiles;
  const catalogPalette = legacyP1CPreferences
    ? DEFAULT_CATALOG_PALETTE
    : enumValue(candidate.catalogPalette, CATALOG_PALETTES);
  const restoreLastViewer = legacyP1CPreferences ? false : candidate.restoreLastViewer;
  const legacySpreadRules = legacyP1CPreferences || candidate.profileVersion === 7;
  const spreadPortraitMaxAspectPercent = legacySpreadRules
    ? DEFAULT_SPREAD_RULES.portraitMaxAspectPercent
    : candidate.spreadPortraitMaxAspectPercent;
  const autoSpreadMinViewportAspectPercent = legacySpreadRules
    ? DEFAULT_SPREAD_RULES.autoViewportMinAspectPercent
    : candidate.autoSpreadMinViewportAspectPercent;
  const spreadFirstPageSingle = legacySpreadRules
    ? DEFAULT_SPREAD_RULES.firstPageSingle
    : candidate.spreadFirstPageSingle;
  const spreadPairing = legacySpreadRules
    ? DEFAULT_SPREAD_RULES.pairing
    : enumValue(candidate.spreadPairing, SPREAD_PAIRINGS);
  const legacyFitRules = legacySpreadRules || candidate.profileVersion === 8;
  const fitAllowUpscale = legacyFitRules
    ? DEFAULT_FIT_RULES.allowUpscale
    : candidate.fitAllowUpscale;
  const fitBasis = legacyFitRules
    ? DEFAULT_FIT_RULES.basis
    : enumValue(candidate.fitBasis, FIT_BASES);
  const fitIncludePageMargin = legacyFitRules
    ? DEFAULT_FIT_RULES.includePageMargin
    : candidate.fitIncludePageMargin;
  const legacyScrollPreferences = legacyFitRules || candidate.profileVersion === 9;
  const scrollStepPercent = legacyScrollPreferences
    ? DEFAULT_SCROLL_STEP_PERCENT
    : candidate.scrollStepPercent;
  const wheelScrollFactor = legacyScrollPreferences
    ? DEFAULT_WHEEL_SCROLL_FACTOR
    : candidate.wheelScrollFactor;
  const smoothScroll = legacyScrollPreferences
    ? DEFAULT_SMOOTH_SCROLL
    : candidate.smoothScroll;
  const legacyPageScan = legacyScrollPreferences || candidate.profileVersion === 10;
  const pageScanMode = legacyPageScan
    ? DEFAULT_PAGE_SCAN_MODE
    : enumValue(candidate.pageScanMode, PAGE_SCAN_MODES);
  const legacyLoupePreferences = legacyPageScan || candidate.profileVersion === 11;
  const loupeSize = legacyLoupePreferences ? DEFAULT_LOUPE_SIZE : candidate.loupeSize;
  const loupeZoom = legacyLoupePreferences ? DEFAULT_LOUPE_ZOOM : candidate.loupeZoom;
  const legacyPrefetchPreferences = legacyLoupePreferences || candidate.profileVersion === 12;
  const prefetchAhead = legacyPrefetchPreferences
    ? DEFAULT_PREFETCH_AHEAD
    : candidate.prefetchAhead;
  const prefetchBehind = legacyPrefetchPreferences
    ? DEFAULT_PREFETCH_BEHIND
    : candidate.prefetchBehind;
  const prefetchMemoryMiB = legacyPrefetchPreferences
    ? DEFAULT_PREFETCH_MEMORY_MIB
    : candidate.prefetchMemoryMiB;
  const legacyFullscreenPreferences = legacyPrefetchPreferences || candidate.profileVersion === 13;
  const fullscreenEscapeBehavior = legacyFullscreenPreferences
    ? DEFAULT_FULLSCREEN_ESCAPE_BEHAVIOR
    : enumValue(candidate.fullscreenEscapeBehavior, FULLSCREEN_ESCAPE_BEHAVIORS);
  const preventDisplaySleepFullscreen = legacyFullscreenPreferences
    ? false
    : candidate.preventDisplaySleepFullscreen;
  const legacyTrayPreferences = legacyFullscreenPreferences || candidate.profileVersion === 14;
  const trayStoreOnMinimize = legacyTrayPreferences ? false : candidate.trayStoreOnMinimize;
  const trayCloseBehavior = legacyTrayPreferences
    ? "quit"
    : enumValue(candidate.trayCloseBehavior, TRAY_CLOSE_BEHAVIORS);
  const trayRestoreGesture = legacyTrayPreferences
    ? "singleClick"
    : enumValue(candidate.trayRestoreGesture, TRAY_RESTORE_GESTURES);
  const legacySlideshowPreferences = legacyTrayPreferences || candidate.profileVersion === 15;
  const slideshowIntervalMs = legacySlideshowPreferences
    ? DEFAULT_SLIDESHOW_INTERVAL_MS
    : candidate.slideshowIntervalMs;
  const slideshowOrder = legacySlideshowPreferences
    ? DEFAULT_SLIDESHOW_ORDER
    : isSlideshowOrder(candidate.slideshowOrder) ? candidate.slideshowOrder : null;
  const slideshowRepeatCurrentItem = legacySlideshowPreferences
    ? false
    : candidate.slideshowRepeatCurrentItem;
  const legacyViewerCatalogSelectionSync = legacySlideshowPreferences || candidate.profileVersion === 16;
  const viewerCatalogSelectionSync = legacyViewerCatalogSelectionSync
    ? true
    : candidate.viewerCatalogSelectionSync;
  const legacyAutoRefreshCurrentFolder = legacyViewerCatalogSelectionSync
    || candidate.profileVersion === 17;
  const autoRefreshCurrentFolder = legacyAutoRefreshCurrentFolder
    ? true
    : candidate.autoRefreshCurrentFolder;
  const legacyTreePreferences = legacyAutoRefreshCurrentFolder
    || candidate.profileVersion === 18;
  const treeAutoCollapse = legacyTreePreferences ? false : candidate.treeAutoCollapse;
  const treeConfirmChildren = legacyTreePreferences ? true : candidate.treeConfirmChildren;
  const treeWidth = legacyTreePreferences ? DEFAULT_TREE_WIDTH : candidate.treeWidth;
  const legacyOpenRules = legacyTreePreferences || candidate.profileVersion === 19;
  const folderOpenRule = legacyOpenRules
    ? "navigate"
    : enumValue(candidate.folderOpenRule, FOLDER_OPEN_RULES);
  const imageOpenRule = legacyOpenRules
    ? "read"
    : enumValue(candidate.imageOpenRule, FILE_OPEN_RULES);
  const archiveOpenRule = legacyOpenRules
    ? "read"
    : enumValue(candidate.archiveOpenRule, FILE_OPEN_RULES);
  if (
    (candidate.profileVersion !== 1
      && candidate.profileVersion !== 2
      && candidate.profileVersion !== 3
      && candidate.profileVersion !== 4
      && candidate.profileVersion !== 5
      && candidate.profileVersion !== 6
      && candidate.profileVersion !== 7
      && candidate.profileVersion !== 8
      && candidate.profileVersion !== 9
      && candidate.profileVersion !== 10
      && candidate.profileVersion !== 11
      && candidate.profileVersion !== 12
      && candidate.profileVersion !== 13
      && candidate.profileVersion !== 14
      && candidate.profileVersion !== 15
      && candidate.profileVersion !== 16
      && candidate.profileVersion !== 17
      && candidate.profileVersion !== 18
      && candidate.profileVersion !== 19
      && candidate.profileVersion !== SETTINGS_PROFILE_VERSION) ||
    sortField === null ||
    typeof candidate.sortDescending !== "boolean" ||
    endOfVolumePolicy === null ||
    catalogViewMode === null ||
    catalogThumbnailSizes === null ||
    viewMode === null ||
    !isPortraitAspectPercent(spreadPortraitMaxAspectPercent) ||
    !isAutoViewportAspectPercent(autoSpreadMinViewportAspectPercent) ||
    typeof spreadFirstPageSingle !== "boolean" ||
    spreadPairing === null ||
    typeof fitAllowUpscale !== "boolean" ||
    fitBasis === null ||
    typeof fitIncludePageMargin !== "boolean" ||
    layoutMode === null ||
    readingDirection === null ||
    scaleMode === null ||
    typeof candidate.scale !== "number" ||
    !Number.isFinite(candidate.scale) ||
    candidate.scale < MIN_SCALE ||
    candidate.scale > MAX_SCALE ||
    typeof candidate.loupeEnabled !== "boolean" ||
    !isLoupeSize(loupeSize) ||
    !isLoupeZoom(loupeZoom) ||
    !isPrefetchPageCount(prefetchAhead) ||
    !isPrefetchPageCount(prefetchBehind) ||
    !isPrefetchMemoryMiB(prefetchMemoryMiB) ||
    fullscreenEscapeBehavior === null ||
    typeof preventDisplaySleepFullscreen !== "boolean" ||
    typeof trayStoreOnMinimize !== "boolean" ||
    trayCloseBehavior === null ||
    trayRestoreGesture === null ||
    !isSlideshowIntervalMs(slideshowIntervalMs) ||
    slideshowOrder === null ||
    typeof slideshowRepeatCurrentItem !== "boolean" ||
    typeof viewerCatalogSelectionSync !== "boolean" ||
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
    !isScrollStepPercent(scrollStepPercent) ||
    !isWheelScrollFactor(wheelScrollFactor) ||
    typeof smoothScroll !== "boolean" ||
    pageScanMode === null ||
    typeof candidate.treeVisible !== "boolean" ||
    typeof treeAutoCollapse !== "boolean" ||
    typeof treeConfirmChildren !== "boolean" ||
    typeof treeWidth !== "number" ||
    !Number.isInteger(treeWidth) ||
    treeWidth < MIN_TREE_WIDTH ||
    treeWidth > MAX_TREE_WIDTH ||
    typeof candidate.menuBarVisible !== "boolean" ||
    typeof candidate.toolbarVisible !== "boolean" ||
    typeof addressBarVisible !== "boolean" ||
    typeof statusBarVisible !== "boolean" ||
    typeof alwaysOnTop !== "boolean" ||
    navigationSelectionPolicy === null ||
    thumbnailGenerationScope === null ||
    startupLocation === null ||
    typeof showHiddenFiles !== "boolean" ||
    catalogPalette === null ||
    typeof restoreLastViewer !== "boolean" ||
    typeof autoRefreshCurrentFolder !== "boolean" ||
    folderOpenRule === null ||
    imageOpenRule === null ||
    archiveOpenRule === null ||
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
    spreadPortraitMaxAspectPercent,
    autoSpreadMinViewportAspectPercent,
    spreadFirstPageSingle,
    spreadPairing,
    fitAllowUpscale,
    fitBasis,
    fitIncludePageMargin,
    layoutMode,
    readingDirection,
    scaleMode,
    scale: candidate.scale,
    loupeEnabled: candidate.loupeEnabled,
    loupeSize,
    loupeZoom,
    prefetchAhead,
    prefetchBehind,
    prefetchMemoryMiB,
    fullscreenEscapeBehavior,
    preventDisplaySleepFullscreen,
    trayStoreOnMinimize,
    trayCloseBehavior,
    trayRestoreGesture,
    slideshowIntervalMs,
    slideshowOrder,
    slideshowRepeatCurrentItem,
    viewerCatalogSelectionSync,
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
    scrollStepPercent,
    wheelScrollFactor,
    smoothScroll,
    pageScanMode,
    treeVisible: candidate.treeVisible,
    treeAutoCollapse,
    treeConfirmChildren,
    treeWidth,
    menuBarVisible: candidate.menuBarVisible,
    toolbarVisible: candidate.toolbarVisible,
    addressBarVisible,
    statusBarVisible,
    alwaysOnTop,
    navigationSelectionPolicy,
    thumbnailGenerationScope,
    startupLocation,
    showHiddenFiles,
    catalogPalette,
    restoreLastViewer,
    autoRefreshCurrentFolder,
    folderOpenRule,
    imageOpenRule,
    archiveOpenRule,
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
