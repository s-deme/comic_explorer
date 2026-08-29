import { Fragment, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  copyViewerPageToClipboard,
  loadPage,
  resolveViewerRectangleZoom,
  saveReadingPosition,
  type ViewerSession,
} from "../library/client";
import { presentError, presentUnexpectedError } from "../errors/presentation";
import {
  clampLoupePointer,
  clampLoupeCenter,
  autoSpreadForViewport,
  createViewerScaleState,
  DEFAULT_VIEWER_BACKGROUND,
  DEFAULT_VIEWER_CURSOR_AUTO_HIDE_MS,
  DEFAULT_VIEWER_PAGE_MARGIN,
  DEFAULT_VIEWER_SPREAD_GAP,
  DEFAULT_SPREAD_RULES,
  DEFAULT_FIT_RULES,
  DEFAULT_PAN_FACTOR,
  DEFAULT_VIEWER_GRID_COLOR,
  DEFAULT_VIEWER_GRID_SIZE,
  DEFAULT_WHEEL_DEAD_ZONE,
  DEFAULT_SCROLL_STEP_PERCENT,
  DEFAULT_KEY_SCROLL_ACCELERATION_PERCENT,
  DEFAULT_KEY_SCROLL_CONTINUOUS,
  DEFAULT_SMOOTH_SCROLL,
  DEFAULT_PAGE_SCAN_MODE,
  DEFAULT_ZOOM_RETENTION,
  DEFAULT_LOUPE_SIZE,
  DEFAULT_LOUPE_ZOOM,
  DEFAULT_PREFETCH_AHEAD,
  DEFAULT_PREFETCH_BEHIND,
  normalizeViewerBackground,
  normalizeViewerCursorAutoHideMs,
  normalizeViewerSpacing,
  normalizeViewerGridColor,
  normalizeZoomRetention,
  randomPageIndex,
  isPanFactor,
  isViewerGridSize,
  isWheelDeadZone,
  isScrollStepPercent,
  isKeyScrollAccelerationPercent,
  keyboardScrollTarget,
  isPagePairable,
  type KeyboardScrollArrow,
  isLoupeSize,
  isLoupeZoom,
  isPrefetchPageCount,
  prefetchWindowIndices,
  fitScaleForPages,
  pageScanTarget,
  PAGE_SCAN_MODES,
  scaleForPixelDimension,
  scaleReducer,
  viewerReducer,
  visibleIndices,
  VIEW_MODE_LABELS,
  VIEW_MODES,
  type ReadingDirection,
  type ScaleMode,
  type ViewerScaleAction,
  type ViewerScaleState,
  type ViewerBackground,
  type ViewerGridColor,
  type ViewMode,
  type SpreadRules,
  type FitRules,
  type PageScanMode,
  type ZoomRetention,
} from "./model";
import {
  tauriFullscreenAdapter,
  type FullscreenAdapter,
} from "./fullscreen";
import {
  applyWindowTitle,
  tauriWindowTitleAdapter,
  type WindowTitleAdapter,
} from "../workspace/window";
import {
  customShortcutCommand,
  fallbackShortcutCommand,
  isViewerShortcutCommand,
  normalizeShortcutBindings,
  type ShortcutBindings,
} from "../input/shortcuts";
import {
  DEFAULT_VIEWER_QUADRANT_BINDINGS,
  DEFAULT_VIEWER_RIGHT_CLICK_ACTION,
  strictViewerQuadrantBindings,
  strictViewerRightClickAction,
  viewerQuadrantAt,
  type ViewerQuadrantBindings,
  type ViewerRightClickAction,
} from "../input/viewer-quadrants";
import { resolveBookmarks, type PageBookmark } from "../reading/collections";
import {
  normalizeMouseGestures,
  type FullscreenEscapeBehavior,
  type MouseGestureAction,
  type MouseGestureBindings,
} from "../settings/profile";
import {
  END_OF_VOLUME_POLICY_LABELS,
  normalizeEndOfVolumePolicy,
  type EndOfVolumePolicy,
} from "../catalog/end-of-volume";
import {
  createRandomSlideshowQueue,
  DEFAULT_SLIDESHOW_INTERVAL_MS,
  DEFAULT_SLIDESHOW_ORDER,
  isSlideshowIntervalMs,
  isSlideshowOrder,
  type SlideshowOrder,
} from "./slideshow";
import {
  applyViewerImageTransform,
  IDENTITY_IMAGE_TRANSFORM,
  imageTransformCss,
  isIdentityImageTransform,
  transformedImageSize,
  type ImageTransformAction,
  type ViewerImageTransform,
} from "./image-transform";
import { FilterDialog } from "./FilterDialog";

const FULLSCREEN_EDGE_REVEAL_HEIGHT = 32;

interface ViewerProps {
  session: ViewerSession;
  generation: number;
  onClose: () => void;
  onNextItem?: () => void;
  onPreviousItem?: () => void;
  endOfVolumePolicy?: EndOfVolumePolicy;
  onEndOfVolumePolicyChange?: (policy: EndOfVolumePolicy) => void;
  initialMode: ViewMode;
  spreadRules?: SpreadRules;
  fitRules?: FitRules;
  initialDirection: ReadingDirection;
  onSettingsChange: (mode: ViewMode, direction: ReadingDirection) => void;
  initialScaleMode?: ScaleMode;
  initialScale?: number;
  initialLoupeEnabled?: boolean;
  loupeSize?: number;
  loupeZoom?: number;
  prefetchAhead?: number;
  prefetchBehind?: number;
  initialBackground?: ViewerBackground;
  initialPageMargin?: number;
  initialSpreadGap?: number;
  initialCursorAutoHideMs?: number;
  zoomRetention?: ZoomRetention;
  viewerGridEnabled?: boolean;
  viewerGridSize?: number;
  viewerGridColor?: ViewerGridColor;
  panFactor?: number;
  wheelDeadZone?: number;
  scrollStepPercent?: number;
  keyScrollAccelerationPercent?: number;
  keyScrollContinuous?: boolean;
  smoothScroll?: boolean;
  pageScanMode?: PageScanMode;
  onScaleChange?: (scale: ViewerScaleState) => void;
  shortcuts?: ShortcutBindings;
  fullscreenAdapter?: FullscreenAdapter;
  windowTitleAdapter?: WindowTitleAdapter;
  initialFullscreen?: boolean;
  fullscreenEscapeBehavior?: FullscreenEscapeBehavior;
  preventDisplaySleepFullscreen?: boolean;
  initialSlideshow?: boolean;
  slideshowIntervalMs?: number;
  slideshowOrder?: SlideshowOrder;
  slideshowRepeatCurrentItem?: boolean;
  bookmarks?: PageBookmark[];
  onPageChange?: (index: number) => void;
  mouseGestures?: MouseGestureBindings;
  quadrantBindings?: ViewerQuadrantBindings;
  rightClickAction?: ViewerRightClickAction;
  onSaveBookmark?: (index: number) => void;
  onNextBookmark?: (index: number) => number | null;
  onDeleteBookmark?: (pageKey: string) => void;
}

interface LoupeState {
  index: number;
  stageX: number;
  stageY: number;
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
}

interface PointerDragState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  pannable: boolean;
  quadrantClickEligible: boolean;
  moved: boolean;
}

interface RightClickState {
  pointerId: number;
  startX: number;
  startY: number;
  eligible: boolean;
  canceled: boolean;
}

interface RectangleZoomSelection {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function Viewer({
  session,
  generation,
  onClose,
  onNextItem,
  onPreviousItem,
  endOfVolumePolicy = "auto_next",
  onEndOfVolumePolicyChange,
  initialMode,
  spreadRules = DEFAULT_SPREAD_RULES,
  fitRules = DEFAULT_FIT_RULES,
  initialDirection,
  onSettingsChange,
  initialScaleMode = "fit",
  initialScale = 1,
  initialLoupeEnabled = false,
  loupeSize: initialLoupeSize = DEFAULT_LOUPE_SIZE,
  loupeZoom: initialLoupeZoom = DEFAULT_LOUPE_ZOOM,
  prefetchAhead: initialPrefetchAhead = DEFAULT_PREFETCH_AHEAD,
  prefetchBehind: initialPrefetchBehind = DEFAULT_PREFETCH_BEHIND,
  initialBackground = DEFAULT_VIEWER_BACKGROUND,
  initialPageMargin = DEFAULT_VIEWER_PAGE_MARGIN,
  initialSpreadGap = DEFAULT_VIEWER_SPREAD_GAP,
  initialCursorAutoHideMs = DEFAULT_VIEWER_CURSOR_AUTO_HIDE_MS,
  zoomRetention: initialZoomRetention = DEFAULT_ZOOM_RETENTION,
  viewerGridEnabled = false,
  viewerGridSize: initialViewerGridSize = DEFAULT_VIEWER_GRID_SIZE,
  viewerGridColor: initialViewerGridColor = DEFAULT_VIEWER_GRID_COLOR,
  panFactor: initialPanFactor = DEFAULT_PAN_FACTOR,
  wheelDeadZone: initialWheelDeadZone = DEFAULT_WHEEL_DEAD_ZONE,
  scrollStepPercent: initialScrollStepPercent = DEFAULT_SCROLL_STEP_PERCENT,
  keyScrollAccelerationPercent: initialKeyScrollAccelerationPercent =
    DEFAULT_KEY_SCROLL_ACCELERATION_PERCENT,
  keyScrollContinuous: initialKeyScrollContinuous = DEFAULT_KEY_SCROLL_CONTINUOUS,
  smoothScroll: initialSmoothScroll = DEFAULT_SMOOTH_SCROLL,
  pageScanMode: initialPageScanMode = DEFAULT_PAGE_SCAN_MODE,
  onScaleChange,
  shortcuts,
  fullscreenAdapter = tauriFullscreenAdapter,
  windowTitleAdapter = tauriWindowTitleAdapter,
  initialFullscreen = false,
  fullscreenEscapeBehavior = "exitFullscreen",
  preventDisplaySleepFullscreen = false,
  initialSlideshow,
  slideshowIntervalMs,
  slideshowOrder: initialSlideshowOrder = DEFAULT_SLIDESHOW_ORDER,
  slideshowRepeatCurrentItem = false,
  bookmarks = [],
  onPageChange,
  mouseGestures,
  quadrantBindings,
  rightClickAction,
  onSaveBookmark,
  onNextBookmark,
  onDeleteBookmark,
}: ViewerProps) {
  const viewerBackground = normalizeViewerBackground(initialBackground);
  const loupeSize = isLoupeSize(initialLoupeSize) ? initialLoupeSize : DEFAULT_LOUPE_SIZE;
  const loupeZoom = isLoupeZoom(initialLoupeZoom) ? initialLoupeZoom : DEFAULT_LOUPE_ZOOM;
  const prefetchAhead = isPrefetchPageCount(initialPrefetchAhead)
    ? initialPrefetchAhead
    : DEFAULT_PREFETCH_AHEAD;
  const prefetchBehind = isPrefetchPageCount(initialPrefetchBehind)
    ? initialPrefetchBehind
    : DEFAULT_PREFETCH_BEHIND;
  const viewerPageMargin = normalizeViewerSpacing(
    initialPageMargin,
    DEFAULT_VIEWER_PAGE_MARGIN,
  );
  const viewerSpreadGap = normalizeViewerSpacing(
    initialSpreadGap,
    DEFAULT_VIEWER_SPREAD_GAP,
  );
  const cursorAutoHideMs = normalizeViewerCursorAutoHideMs(
    initialCursorAutoHideMs,
  );
  const zoomRetention = normalizeZoomRetention(initialZoomRetention);
  const viewerGridSize = isViewerGridSize(initialViewerGridSize)
    ? initialViewerGridSize
    : DEFAULT_VIEWER_GRID_SIZE;
  const viewerGridColor = normalizeViewerGridColor(initialViewerGridColor);
  const panFactor = isPanFactor(initialPanFactor) ? initialPanFactor : DEFAULT_PAN_FACTOR;
  const wheelDeadZone = isWheelDeadZone(initialWheelDeadZone)
    ? initialWheelDeadZone
    : DEFAULT_WHEEL_DEAD_ZONE;
  const scrollStepPercent = isScrollStepPercent(initialScrollStepPercent)
    ? initialScrollStepPercent
    : DEFAULT_SCROLL_STEP_PERCENT;
  const keyScrollAccelerationPercent = isKeyScrollAccelerationPercent(
    initialKeyScrollAccelerationPercent,
  ) ? initialKeyScrollAccelerationPercent : DEFAULT_KEY_SCROLL_ACCELERATION_PERCENT;
  const keyScrollContinuous = typeof initialKeyScrollContinuous === "boolean"
    ? initialKeyScrollContinuous
    : DEFAULT_KEY_SCROLL_CONTINUOUS;
  const smoothScroll = typeof initialSmoothScroll === "boolean"
    ? initialSmoothScroll
    : DEFAULT_SMOOTH_SCROLL;
  const pageScanMode = PAGE_SCAN_MODES.includes(initialPageScanMode)
    ? initialPageScanMode
    : DEFAULT_PAGE_SCAN_MODE;
  const activeSlideshowIntervalMs = isSlideshowIntervalMs(slideshowIntervalMs)
    ? slideshowIntervalMs
    : DEFAULT_SLIDESHOW_INTERVAL_MS;
  const slideshowOrder = isSlideshowOrder(initialSlideshowOrder)
    ? initialSlideshowOrder
    : DEFAULT_SLIDESHOW_ORDER;
  const [state, dispatch] = useReducer(viewerReducer, {
    index: session.startIndex,
    mode: initialMode,
    direction: initialDirection,
    history: [],
  });
  const [landscape, setLandscape] = useState<Set<number>>(new Set());
  const [pageSizes, setPageSizes] = useState<Map<number, { width: number; height: number }>>(
    () => new Map(),
  );
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [readyPages, setReadyPages] = useState<Set<number>>(new Set());
  const [pendingNextIndex, setPendingNextIndex] = useState<number | null>(null);
  const [mediaUris, setMediaUris] = useState<Record<number, string>>(() =>
    Object.fromEntries(session.pages.flatMap((page, index) => page.mediaUri ? [[index, page.mediaUri]] : [])),
  );
  const [scale, setScale] = useState<ViewerScaleState>(() =>
    createViewerScaleState(initialScaleMode, initialScale, initialLoupeEnabled),
  );
  const [displayedScale, setDisplayedScale] = useState(initialScale);
  const [autoSpread, setAutoSpread] = useState(() =>
    autoSpreadForViewport(
      window.innerWidth,
      window.innerHeight,
      spreadRules.autoViewportMinAspectPercent,
    ));
  const [fitViewport, setFitViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenToolbarVisible, setFullscreenToolbarVisible] = useState(true);
  const [fullscreenPageNavigatorVisible, setFullscreenPageNavigatorVisible] = useState(true);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
  const [clipboardCopying, setClipboardCopying] = useState(false);
  const [imageTransformNotice, setImageTransformNotice] = useState<string | null>(null);
  const [bookmarkListOpen, setBookmarkListOpen] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [toolbarMoreOpen, setToolbarMoreOpen] = useState(false);
  const [slideshowRunning, setSlideshowRunning] = useState(
    (initialSlideshow ?? slideshowIntervalMs !== undefined) && session.pages.length > 1,
  );
  const [slideshowPlaybackAllowed, setSlideshowPlaybackAllowed] = useState(
    () => document.visibilityState !== "hidden",
  );
  const [loupe, setLoupe] = useState<LoupeState | null>(null);
  const [pixelWidthInput, setPixelWidthInput] = useState("");
  const [pixelHeightInput, setPixelHeightInput] = useState("");
  const [pixelScaleError, setPixelScaleError] = useState<string | null>(null);
  const [rectangleZoomError, setRectangleZoomError] = useState<string | null>(null);
  const activeShortcuts = useMemo(
    () => normalizeShortcutBindings(shortcuts),
    [shortcuts],
  );
  const activeMouseGestures = useMemo(
    () => normalizeMouseGestures(mouseGestures),
    [mouseGestures],
  );
  const activeQuadrantBindings = useMemo(
    () => strictViewerQuadrantBindings(quadrantBindings)
      ?? { ...DEFAULT_VIEWER_QUADRANT_BINDINGS },
    [quadrantBindings],
  );
  const activeRightClickAction = useMemo(
    () => strictViewerRightClickAction(rightClickAction)
      ?? DEFAULT_VIEWER_RIGHT_CLICK_ACTION,
    [rightClickAction],
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const pageRequests = useRef(new Set<number>());
  const retainedIndicesRef = useRef(new Set<number>());
  const pointerDragRef = useRef<PointerDragState | null>(null);
  const quadrantClickTimerRef = useRef<number | null>(null);
  const pageScanInitializedRef = useRef(false);
  const rightButtonHeldRef = useRef(false);
  const rightClickRef = useRef<RightClickState | null>(null);
  const [panning, setPanning] = useState(false);
  const [rectangleZoomArmed, setRectangleZoomArmed] = useState(false);
  const [rectangleZoomSelection, setRectangleZoomSelection] =
    useState<RectangleZoomSelection | null>(null);
  const rectangleZoomSelectionRef = useRef<RectangleZoomSelection | null>(null);
  const rectangleZoomRequestRef = useRef(0);
  const [cursorHidden, setCursorHidden] = useState(false);
  const cursorInsideStageRef = useRef(false);
  const cursorHideTimerRef = useRef<number | null>(null);
  const initialFullscreenRequested = useRef(false);
  const displayAwakeHeldRef = useRef(false);
  const fullscreenRef = useRef(false);
  const lifecycleMountedRef = useRef(true);
  const randomSlideshowQueueRef = useRef<number[]>([]);
  const clipboardRequestRef = useRef(0);
  const pageTransformsRef = useRef(new Map<number, ViewerImageTransform>());
  const [imageTransformRevision, setImageTransformRevision] = useState(0);

  function reloadFilteredPages() {
    pageRequests.current.clear();
    retainedIndicesRef.current.clear();
    setMediaUris({});
    setReadyPages(new Set());
    setImageErrors(new Set());
    setLandscape(new Set());
    setPageSizes(new Map());
    setPendingNextIndex(null);
    setImageTransformNotice("フィルター変更を適用し、現在ページをRustから再読込します。");
  }

  useLayoutEffect(() => {
    const update = () => {
      const bounds = spreadRef.current?.getBoundingClientRect();
      const width = bounds !== undefined && bounds.width > 0
        ? bounds.width
        : window.innerWidth;
      const height = bounds !== undefined && bounds.height > 0
        ? bounds.height
        : window.innerHeight;
      setAutoSpread(autoSpreadForViewport(
        width,
        height,
        spreadRules.autoViewportMinAspectPercent,
      ));
      setFitViewport((current) => current.width === width && current.height === height
        ? current
        : { width, height });
    };
    update();
    window.addEventListener("resize", update);
    if (typeof ResizeObserver === "undefined" || spreadRef.current === null) {
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(spreadRef.current);
    return () => {
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [fullscreen, spreadRules.autoViewportMinAspectPercent]);

  useEffect(() => {
    const releaseRightButton = (event: PointerEvent) => {
      if (event.button === 2) {
        rightButtonHeldRef.current = false;
        rightClickRef.current = null;
      }
    };
    const resetRightButton = () => {
      rightButtonHeldRef.current = false;
      rightClickRef.current = null;
      cancelRectangleZoom();
    };
    window.addEventListener("pointerup", releaseRightButton);
    window.addEventListener("blur", resetRightButton);
    return () => {
      window.removeEventListener("pointerup", releaseRightButton);
      window.removeEventListener("blur", resetRightButton);
    };
  }, []);
  const positionTimerRef = useRef<number | null>(null);

  function clearCursorHideTimer() {
    if (cursorHideTimerRef.current === null) return;
    window.clearTimeout(cursorHideTimerRef.current);
    cursorHideTimerRef.current = null;
  }

  function scheduleCursorHide() {
    clearCursorHideTimer();
    setCursorHidden(false);
    if (
      !cursorInsideStageRef.current
      || cursorAutoHideMs === 0
      || pointerDragRef.current !== null
      || rightButtonHeldRef.current
      || panning
      || rectangleZoomArmed
      || scale.loupeEnabled
    ) return;
    cursorHideTimerRef.current = window.setTimeout(() => {
      cursorHideTimerRef.current = null;
      setCursorHidden(true);
    }, cursorAutoHideMs);
  }

  useEffect(() => {
    scheduleCursorHide();
    return clearCursorHideTimer;
  }, [cursorAutoHideMs, panning, rectangleZoomArmed, scale.loupeEnabled]);
  const transformForPage = (index: number): ViewerImageTransform =>
    pageTransformsRef.current.get(index) ?? IDENTITY_IMAGE_TRANSFORM;
  const effectiveLandscape = useMemo(() => {
    const next = new Set(landscape);
    pageSizes.forEach((size, index) => {
      const transformed = transformedImageSize(size, transformForPage(index));
      if (isPagePairable(
        transformed.width,
        transformed.height,
        spreadRules.portraitMaxAspectPercent,
      )) next.delete(index);
      else next.add(index);
    });
    return next;
  }, [imageTransformRevision, landscape, pageSizes, spreadRules.portraitMaxAspectPercent]);
  const visible = useMemo(
    () => visibleIndices(
      state,
      session.pages.length,
      effectiveLandscape,
      autoSpread,
      spreadRules,
    ),
    [autoSpread, effectiveLandscape, session.pages.length, spreadRules, state],
  );
  const nextStartIndex = state.index + Math.max(1, visible.length);
  const nextVisible = useMemo(() => {
    if (nextStartIndex >= session.pages.length) return [];
    return visibleIndices(
      { ...state, index: nextStartIndex },
      session.pages.length,
      effectiveLandscape,
      autoSpread,
      spreadRules,
    );
  }, [autoSpread, effectiveLandscape, nextStartIndex, session.pages.length, spreadRules, state]);
  const prefetchIndices = useMemo(
    () => prefetchWindowIndices(
      visible,
      session.pages.length,
      prefetchAhead,
      prefetchBehind,
    ),
    [prefetchAhead, prefetchBehind, session.pages.length, visible],
  );
  const retainedIndices = useMemo(() => Array.from(new Set([
    ...visible,
    ...prefetchIndices,
    ...(pendingNextIndex === null ? [] : nextVisible),
  ])), [nextVisible, pendingNextIndex, prefetchIndices, visible]);
  const preloadIndices = useMemo(
    () => retainedIndices.filter((index) => !visible.includes(index)),
    [retainedIndices, visible],
  );
  retainedIndicesRef.current = new Set(retainedIndices);
  const calculatedFitScale = useMemo(() => {
    if (scale.mode !== "fit") return null;
    const sizes = visible.map((index) => {
      const size = pageSizes.get(index);
      return size === undefined ? undefined : transformedImageSize(size, transformForPage(index));
    });
    if (sizes.some((size) => size === undefined)) return null;
    return fitScaleForPages(
      sizes as { width: number; height: number }[],
      fitViewport.width,
      fitViewport.height,
      viewerPageMargin,
      viewerSpreadGap,
      fitRules,
    );
  }, [fitRules, fitViewport.height, fitViewport.width, imageTransformRevision, pageSizes, scale.mode, viewerPageMargin, viewerSpreadGap, visible]);
  const resolvedBookmarks = useMemo(
    () => resolveBookmarks(bookmarks, session.pages.map((page) => page.relativePath)),
    [bookmarks, session.pages],
  );

  useEffect(() => {
    retainedIndices.forEach((index) => {
      if (mediaUris[index] || imageErrors.has(index) || pageRequests.current.has(index)) return;
      pageRequests.current.add(index);
      const demanded = visible.includes(index)
        || (pendingNextIndex !== null && nextVisible.includes(index));
      void loadPage(
        session,
        index,
        generation,
        demanded ? "visible" : "near",
      )
        .then((response) => {
          pageRequests.current.delete(index);
          if (
            response.status === "ok"
            && response.generation === generation
            && retainedIndicesRef.current.has(index)
          ) {
            setMediaUris((current) => ({ ...current, [index]: response.data.mediaUri }));
          } else if (response.status === "error" && retainedIndicesRef.current.has(index)) {
            setImageErrors((current) => new Set(current).add(index));
          }
        })
        .catch(() => {
          pageRequests.current.delete(index);
          if (retainedIndicesRef.current.has(index)) {
            setImageErrors((current) => new Set(current).add(index));
          }
        });
    });
  }, [generation, imageErrors, mediaUris, nextVisible, pendingNextIndex, retainedIndices, session, visible]);

  useEffect(() => {
    const retained = new Set(retainedIndices);
    const pruneSet = (current: Set<number>) => {
      if ([...current].every((index) => retained.has(index))) return current;
      return new Set([...current].filter((index) => retained.has(index)));
    };
    setReadyPages(pruneSet);
    setImageErrors(pruneSet);
    setLandscape(pruneSet);
    setPageSizes((current) => {
      if ([...current.keys()].every((index) => retained.has(index))) return current;
      return new Map([...current].filter(([index]) => retained.has(index)));
    });
    setMediaUris((current) => {
      const entries = Object.entries(current);
      if (entries.every(([index]) => retained.has(Number(index)))) return current;
      return Object.fromEntries(entries.filter(([index]) => retained.has(Number(index))));
    });
  }, [retainedIndices]);

  function cancelScheduledPositionSave() {
    if (positionTimerRef.current === null) return;
    window.clearTimeout(positionTimerRef.current);
    positionTimerRef.current = null;
  }

  async function flushReadingPosition() {
    cancelScheduledPositionSave();
    await saveReadingPosition(session, state.index, generation);
  }

  function scrollPageOverflow(move: -1 | 1, factor = 1): boolean {
    const spread = spreadRef.current;
    if (!spread) return false;
    const maxScrollLeft = Math.max(0, spread.scrollWidth - spread.clientWidth);
    const initialLeft = pageScanMode !== "vertical" && !pageScanInitializedRef.current
      ? state.direction === "rightToLeft" ? maxScrollLeft : 0
      : spread.scrollLeft;
    const target = pageScanTarget({
      left: initialLeft,
      top: spread.scrollTop,
      clientWidth: spread.clientWidth,
      clientHeight: spread.clientHeight,
      scrollWidth: spread.scrollWidth,
      scrollHeight: spread.scrollHeight,
    }, pageScanMode, state.direction, scrollStepPercent, move, factor);
    pageScanInitializedRef.current = true;
    if (target === null) return false;
    if (typeof spread.scrollTo === "function") {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      spread.scrollTo({
        top: target.top,
        left: target.left,
        behavior: smoothScroll && !reducedMotion ? "smooth" : "auto",
      });
    } else {
      spread.scrollLeft = target.left;
      spread.scrollTop = target.top;
    }
    return true;
  }

  function scrollWithKeyboardArrow(key: KeyboardScrollArrow, repeated: boolean): boolean {
    const spread = spreadRef.current;
    if (!spread) return false;
    const target = keyboardScrollTarget({
      left: spread.scrollLeft,
      top: spread.scrollTop,
      clientWidth: spread.clientWidth,
      clientHeight: spread.clientHeight,
      scrollWidth: spread.scrollWidth,
      scrollHeight: spread.scrollHeight,
    }, key, scrollStepPercent, keyScrollAccelerationPercent, repeated);
    if (target === null) return false;
    if (typeof spread.scrollTo === "function") {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      spread.scrollTo({
        top: target.top,
        left: target.left,
        behavior: smoothScroll && !reducedMotion ? "smooth" : "auto",
      });
    } else {
      spread.scrollLeft = target.left;
      spread.scrollTop = target.top;
    }
    return true;
  }

  function next(factor = 1, skipOverflow = false) {
    if (!skipOverflow && scrollPageOverflow(1, factor)) return;
    if (state.index + Math.max(1, visible.length) >= session.pages.length) {
      void flushReadingPosition().finally(() =>
        onNextItem?.(),
      );
      return;
    }
    if (nextVisible.some((index) => !readyPages.has(index) && !imageErrors.has(index))) {
      setPendingNextIndex(nextStartIndex);
      return;
    }
    dispatch({
      type: "next",
      pageCount: session.pages.length,
      landscape: effectiveLandscape,
      autoSpread,
      spreadRules,
    });
  }

  useLayoutEffect(() => {
    const spread = spreadRef.current;
    pageScanInitializedRef.current = false;
    if (spread) {
      spread.scrollLeft = 0;
      spread.scrollTop = 0;
    }
  }, [pageScanMode, state.direction, state.index]);

  function previous(factor = 1, skipOverflow = false) {
    if (!skipOverflow && scrollPageOverflow(-1, factor)) return;
    if (state.index === 0) {
      void flushReadingPosition().finally(() => onPreviousItem?.());
      return;
    }
    dispatch({ type: "previous" });
  }

  function randomPage() {
    if (session.pages.length <= 1) return;
    dispatch({
      type: "go",
      index: randomPageIndex(state.index, session.pages.length),
    });
  }

  function applyImageTransform(action: ImageTransformAction) {
    const pageIndex = state.index;
    const current = transformForPage(pageIndex);
    const next = applyViewerImageTransform(current, action);
    if (isIdentityImageTransform(next)) {
      pageTransformsRef.current.delete(pageIndex);
    } else {
      pageTransformsRef.current.set(pageIndex, next);
    }
    setImageTransformRevision((revision) => revision + 1);
    setLoupe(null);
    const actionLabel = action === "rotateClockwise"
      ? "時計回りに90度回転"
      : action === "flipHorizontal"
        ? "左右反転"
        : action === "flipVertical"
          ? "上下反転"
          : "回転・反転をリセット";
    setImageTransformNotice(`ページ ${pageIndex + 1} を${actionLabel}しました。`);
  }

  function advanceSlideshow() {
    if (slideshowOrder === "random") {
      let queue = randomSlideshowQueueRef.current.filter((index) => index !== state.index);
      if (queue.length === 0) {
        queue = createRandomSlideshowQueue(session.pages.length, state.index);
      }
      const [target, ...remaining] = queue;
      if (target === undefined) {
        setSlideshowRunning(false);
        return;
      }
      randomSlideshowQueueRef.current = remaining;
      dispatch({ type: "go", index: target });
      if (remaining.length === 0 && !slideshowRepeatCurrentItem) {
        setSlideshowRunning(false);
      }
      return;
    }
    if (slideshowOrder === "reverse") {
      if (slideshowRepeatCurrentItem && state.index === 0) {
        dispatch({ type: "go", index: session.pages.length - 1 });
      } else {
        previous();
      }
      return;
    }
    const atEnd = state.index + Math.max(1, visible.length) >= session.pages.length;
    if (slideshowRepeatCurrentItem && atEnd) {
      dispatch({ type: "go", index: 0 });
    } else {
      next();
    }
  }

  function toggleSlideshow() {
    setSlideshowRunning((current) => {
      if (!current && slideshowOrder === "random") randomSlideshowQueueRef.current = [];
      return !current;
    });
  }

  async function copyCurrentPageImage() {
    if (clipboardCopying) return;
    const request = ++clipboardRequestRef.current;
    const pageIndex = state.index;
    setClipboardCopying(true);
    setClipboardNotice(`ページ ${pageIndex + 1} をクリップボードへコピーしています。`);
    try {
      const response = await copyViewerPageToClipboard(session, pageIndex, generation);
      if (request !== clipboardRequestRef.current) return;
      if (response.status === "ok") {
        setClipboardNotice(
          `ページ ${pageIndex + 1} を ${response.data.width}×${response.data.height}px の画像としてコピーしました。`,
        );
      } else if (response.status === "error") {
        setClipboardNotice(`画像をコピーできませんでした。${presentError(response.error)}`);
      } else {
        setClipboardNotice("画像のコピーはキャンセルされました。もう一度お試しください。");
      }
    } catch {
      if (request === clipboardRequestRef.current) {
        setClipboardNotice(`画像をコピーできませんでした。${presentUnexpectedError()}`);
      }
    } finally {
      if (request === clipboardRequestRef.current) setClipboardCopying(false);
    }
  }

  useEffect(() => {
    if (pendingNextIndex === null || pendingNextIndex !== nextStartIndex) return;
    if (nextVisible.some((index) => !readyPages.has(index) && !imageErrors.has(index))) return;
    setPendingNextIndex(null);
    dispatch({
      type: "next",
      pageCount: session.pages.length,
      landscape: effectiveLandscape,
      autoSpread,
      spreadRules,
    });
  }, [autoSpread, effectiveLandscape, imageErrors, nextStartIndex, nextVisible, pendingNextIndex, readyPages, session.pages.length, spreadRules]);

  async function requestFullscreen(next: boolean): Promise<boolean> {
    setFullscreenError(null);
    try {
      if (next) {
        await fullscreenAdapter.enter();
        if (!lifecycleMountedRef.current) {
          await fullscreenAdapter.exit().catch(() => undefined);
          return false;
        }
        if (preventDisplaySleepFullscreen) {
          try {
            if (fullscreenAdapter.setDisplayAwake === undefined) {
              throw new Error("display awake control unavailable");
            }
            await fullscreenAdapter.setDisplayAwake(true);
            displayAwakeHeldRef.current = true;
            if (!lifecycleMountedRef.current) {
              await fullscreenAdapter.setDisplayAwake(false).catch(() => undefined);
              displayAwakeHeldRef.current = false;
              await fullscreenAdapter.exit().catch(() => undefined);
              return false;
            }
          } catch (error) {
            await fullscreenAdapter.exit().catch(() => undefined);
            throw error;
          }
        }
      } else {
        const hadDisplayRequest = displayAwakeHeldRef.current;
        if (hadDisplayRequest) {
          await fullscreenAdapter.setDisplayAwake?.(false);
          displayAwakeHeldRef.current = false;
        }
        try {
          await fullscreenAdapter.exit();
        } catch (error) {
          if (hadDisplayRequest) {
            await fullscreenAdapter.setDisplayAwake?.(true);
            displayAwakeHeldRef.current = true;
          }
          throw error;
        }
      }
      if (next) fullscreenButtonRef.current?.blur();
      setFullscreenToolbarVisible(!next);
      setFullscreenPageNavigatorVisible(!next);
      fullscreenRef.current = next;
      setFullscreen(next);
      if (!next) requestAnimationFrame(() => fullscreenButtonRef.current?.focus());
      return true;
    } catch {
      if (lifecycleMountedRef.current) {
        setFullscreenError("全画面表示を切り替えられません。もう一度お試しください。");
      }
      return false;
    }
  }

  async function close() {
    if (fullscreen && !(await requestFullscreen(false))) return;
    await flushReadingPosition();
    onClose();
  }

  function handleCloseCommand() {
    if (!fullscreen || fullscreenEscapeBehavior === "closeViewer") void close();
    else void requestFullscreen(false);
  }

  function changeMode(mode: ViewMode) {
    dispatch({ type: "mode", mode });
    onSettingsChange(mode, state.direction);
  }

  function shiftOnePage(delta: -1 | 1) {
    if (state.mode !== "spread") return;
    dispatch({ type: "shift", delta, pageCount: session.pages.length });
  }

  function toggleDirection() {
    const direction =
      state.direction === "rightToLeft" ? "leftToRight" : "rightToLeft";
    dispatch({ type: "toggleDirection" });
    onSettingsChange(state.mode, direction);
  }

  function currentDisplayedScale(): number | undefined {
    const spread = spreadRef.current;
    const image = spread?.querySelector<HTMLImageElement>(
      `img[data-page-index="${state.index}"]:not(.prefetch-page)`,
    );
    if (!image) return undefined;
    const rect = image.getBoundingClientRect();
    const widthScale = image.naturalWidth > 0 ? rect.width / image.naturalWidth : 0;
    const heightScale = image.naturalHeight > 0 ? rect.height / image.naturalHeight : 0;
    const measured = widthScale > 0 ? widthScale : heightScale;
    return Number.isFinite(measured) && measured > 0 ? measured : undefined;
  }

  function applyScale(action: ViewerScaleAction) {
    const baseScale =
      (action.type === "zoomIn" || action.type === "zoomOut")
      && scale.mode !== "custom"
        ? currentDisplayedScale()
        : undefined;
    const zoomAction =
      action.type === "zoomIn" || action.type === "zoomOut"
        ? { ...action, baseScale }
        : action;
    const next = scaleReducer(scale, zoomAction);
    setScale(next);
    setDisplayedScale(next.scale);
    onScaleChange?.(next);
    if (!next.loupeEnabled) setLoupe(null);
  }

  function cancelRectangleZoom() {
    rectangleZoomRequestRef.current += 1;
    rectangleZoomSelectionRef.current = null;
    setRectangleZoomSelection(null);
    setRectangleZoomArmed(false);
  }

  function toggleRectangleZoom() {
    setRectangleZoomError(null);
    if (rectangleZoomArmed) {
      cancelRectangleZoom();
      return;
    }
    clearQuadrantClickTimer();
    pointerDragRef.current = null;
    rightClickRef.current = null;
    rightButtonHeldRef.current = false;
    setPanning(false);
    setRectangleZoomArmed(true);
  }

  async function applyRectangleZoom(selection: RectangleZoomSelection) {
    const stage = stageRef.current;
    const spread = spreadRef.current;
    if (stage === null || spread === null) return;
    const bounds = stage.getBoundingClientRect();
    const selectionLeft = Math.min(selection.startX, selection.currentX);
    const selectionTop = Math.min(selection.startY, selection.currentY);
    const selectionWidth = Math.abs(selection.currentX - selection.startX);
    const selectionHeight = Math.abs(selection.currentY - selection.startY);
    if (selectionWidth < 12 || selectionHeight < 12) return;
    const viewportWidth = spread.clientWidth > 0 ? spread.clientWidth : bounds.width;
    const viewportHeight = spread.clientHeight > 0 ? spread.clientHeight : bounds.height;
    const currentScale = currentDisplayedScale() ?? displayedScale;
    const request = ++rectangleZoomRequestRef.current;
    setRectangleZoomArmed(false);
    setRectangleZoomError(null);
    try {
      const response = await resolveViewerRectangleZoom({
        viewportWidth,
        viewportHeight,
        selectionLeft,
        selectionTop,
        selectionWidth,
        selectionHeight,
        scrollLeft: spread.scrollLeft,
        scrollTop: spread.scrollTop,
        currentScale,
      }, generation);
      if (request !== rectangleZoomRequestRef.current) return;
      if (response.status === "error") {
        setRectangleZoomError(`矩形ズームを適用できません。${presentError(response.error)}`);
        return;
      }
      if (response.status !== "ok" || response.generation !== generation) return;
      applyScale({ type: "scale", scale: response.data.scale });
      window.requestAnimationFrame(() => {
        if (request !== rectangleZoomRequestRef.current || spreadRef.current === null) return;
        const target = spreadRef.current;
        target.scrollLeft = Math.min(
          response.data.scrollLeft,
          Math.max(0, target.scrollWidth - target.clientWidth),
        );
        target.scrollTop = Math.min(
          response.data.scrollTop,
          Math.max(0, target.scrollHeight - target.clientHeight),
        );
      });
    } catch {
      if (request === rectangleZoomRequestRef.current) {
        setRectangleZoomError(`矩形ズームを適用できません。${presentUnexpectedError()}`);
      }
    }
  }

  useEffect(() => {
    cancelRectangleZoom();
    return () => {
      rectangleZoomRequestRef.current += 1;
      rectangleZoomSelectionRef.current = null;
    };
  }, [generation, session.itemKey]);

  function applyPixelDimension(axis: "width" | "height", value: string) {
    const image = spreadRef.current?.querySelector<HTMLImageElement>(
      `img[data-page-index="${state.index}"]:not(.prefetch-page)`,
    );
    const requested = Number(value);
    const natural = axis === "width" ? image?.naturalWidth : image?.naturalHeight;
    const next = scaleForPixelDimension(requested, natural ?? 0);
    if (next === null) {
      setPixelScaleError("1〜32768pxかつ1〜800%に収まる寸法を指定してください。");
      return;
    }
    setPixelScaleError(null);
    applyScale({ type: "scale", scale: next });
  }

  useEffect(() => {
    if (zoomRetention !== "page") return;
    const reset = createViewerScaleState(initialScaleMode, initialScale, initialLoupeEnabled);
    setScale(reset);
    setDisplayedScale(reset.scale);
    setLoupe(null);
  }, [state.index, zoomRetention]);

  useLayoutEffect(() => {
    if (scale.mode === "custom") {
      setDisplayedScale(scale.scale);
      return;
    }
    const updateDisplayedScale = () => {
      const measured = currentDisplayedScale();
      if (measured !== undefined) setDisplayedScale(measured);
    };
    updateDisplayedScale();
    window.addEventListener("resize", updateDisplayedScale);
    if (typeof ResizeObserver === "undefined" || !spreadRef.current) {
      return () => window.removeEventListener("resize", updateDisplayedScale);
    }
    const observer = new ResizeObserver(updateDisplayedScale);
    observer.observe(spreadRef.current);
    return () => {
      window.removeEventListener("resize", updateDisplayedScale);
      observer.disconnect();
    };
  }, [fullscreen, imageTransformRevision, readyPages, scale.mode, scale.scale, state.index, state.mode]);

  function updateLoupe(event: ReactPointerEvent<HTMLDivElement>) {
    if (!scale.loupeEnabled) return;
    const stage = stageRef.current;
    if (!stage) return;
    const image = Array.from(
      stage.querySelectorAll<HTMLImageElement>(
        ".page-spread img:not(.prefetch-page)",
      ),
    ).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    });
    if (!image) {
      setLoupe(null);
      return;
    }
    const imageRect = image.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const pointer = clampLoupePointer(
      event.clientX - imageRect.left,
      event.clientY - imageRect.top,
      imageRect.width,
      imageRect.height,
    );
    const index = Number(image.dataset.pageIndex);
    if (!Number.isInteger(index)) {
      setLoupe(null);
      return;
    }
    setLoupe({
      index,
      stageX: clampLoupeCenter(event.clientX - stageRect.left, stageRect.width, loupeSize),
      stageY: clampLoupeCenter(event.clientY - stageRect.top, stageRect.height, loupeSize),
      imageX: pointer.x,
      imageY: pointer.y,
      imageWidth: imageRect.width,
      imageHeight: imageRect.height,
    });
  }

  useEffect(() => {
    setLoupe(null);
  }, [scale.mode, scale.scale, state.index]);

  useEffect(() => {
    void applyWindowTitle(windowTitleAdapter, `Comic Explorer — ${session.displayName}`);
    return () => {
      void applyWindowTitle(windowTitleAdapter, "Comic Explorer");
    };
  }, [session.displayName, session.itemKey, windowTitleAdapter]);

  useEffect(() => {
    let mounted = true;
    lifecycleMountedRef.current = true;
    void fullscreenAdapter
      .isFullscreen()
      .then((current) => {
        if (mounted) {
          fullscreenRef.current = current;
          setFullscreen(current);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      lifecycleMountedRef.current = false;
      void (async () => {
        if (displayAwakeHeldRef.current) {
          displayAwakeHeldRef.current = false;
          if (fullscreenAdapter.setDisplayAwake !== undefined) {
            await fullscreenAdapter.setDisplayAwake(false).catch(() => undefined);
          }
        }
        if (fullscreenRef.current) {
          fullscreenRef.current = false;
          await fullscreenAdapter.exit().catch(() => undefined);
        }
      })();
    };
  }, [fullscreenAdapter, preventDisplaySleepFullscreen]);

  useEffect(() => {
    setFullscreenToolbarVisible(!fullscreen);
    setFullscreenPageNavigatorVisible(!fullscreen);
  }, [fullscreen]);

  useEffect(() => {
    if (!initialFullscreen || initialFullscreenRequested.current) return;
    initialFullscreenRequested.current = true;
    void requestFullscreen(true);
  }, [initialFullscreen]);

  useEffect(() => {
    setSlideshowRunning(
      (initialSlideshow ?? slideshowIntervalMs !== undefined) && session.pages.length > 1,
    );
  }, [initialSlideshow, session.itemKey, session.pages.length, slideshowIntervalMs]);

  useEffect(() => {
    randomSlideshowQueueRef.current = [];
  }, [session.itemKey, session.pages.length, slideshowOrder]);

  useEffect(() => {
    clipboardRequestRef.current += 1;
    setClipboardCopying(false);
    setClipboardNotice(null);
  }, [session.itemKey, state.index]);

  useEffect(() => {
    const updateVisibility = () => {
      setSlideshowPlaybackAllowed(document.visibilityState !== "hidden");
    };
    const pauseForBlur = () => setSlideshowPlaybackAllowed(false);
    const resumeForFocus = () => {
      if (document.visibilityState !== "hidden") setSlideshowPlaybackAllowed(true);
    };
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("blur", pauseForBlur);
    window.addEventListener("focus", resumeForFocus);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("blur", pauseForBlur);
      window.removeEventListener("focus", resumeForFocus);
    };
  }, []);

  useEffect(() => {
    if (!slideshowRunning || !slideshowPlaybackAllowed || session.pages.length <= 1) return;
    const timer = window.setTimeout(advanceSlideshow, activeSlideshowIntervalMs);
    return () => window.clearTimeout(timer);
  }, [
    activeSlideshowIntervalMs,
    session.pages.length,
    slideshowPlaybackAllowed,
    slideshowRunning,
    slideshowOrder,
    slideshowRepeatCurrentItem,
    state.index,
    state.mode,
    visible.length,
  ]);

  useEffect(() => {
    positionTimerRef.current = window.setTimeout(() => {
      positionTimerRef.current = null;
      void saveReadingPosition(session, state.index, generation);
    }, 250);
    return cancelScheduledPositionSave;
  }, [generation, session, state.index]);

  useEffect(() => {
    onPageChange?.(state.index);
  }, [onPageChange, state.index]);

  function jumpToNextBookmark() {
    const resolvedNext = resolvedBookmarks.find((bookmark) => bookmark.pageIndex > state.index)
      ?? resolvedBookmarks[0];
    const next = onNextBookmark?.(state.index) ?? resolvedNext?.pageIndex;
    if (next !== null && next !== undefined) dispatch({ type: "go", index: next });
  }

  function applyMouseGesture(action: MouseGestureAction | undefined) {
    switch (action) {
      case "nextPage":
        next();
        break;
      case "previousPage":
        previous();
        break;
      case "closeViewer":
        void close();
        break;
      case "singlePage":
        changeMode("single");
        break;
      case "spreadPage":
        changeMode("spread");
        break;
      case "toggleDirection":
        toggleDirection();
        break;
      case "zoomIn":
        applyScale({ type: "zoomIn" });
        break;
      case "zoomOut":
        applyScale({ type: "zoomOut" });
        break;
      case "toggleLoupe":
        applyScale({ type: "loupe", enabled: !scale.loupeEnabled });
        break;
      case "toggleFullscreen":
        void requestFullscreen(!fullscreen);
        break;
      case "none":
      case undefined:
        break;
    }
  }

  function clearQuadrantClickTimer() {
    if (quadrantClickTimerRef.current === null) return;
    window.clearTimeout(quadrantClickTimerRef.current);
    quadrantClickTimerRef.current = null;
  }

  function scheduleQuadrantClick(clientX: number, clientY: number) {
    clearQuadrantClickTimer();
    const bounds = stageRef.current?.getBoundingClientRect();
    if (bounds === undefined) return;
    const quadrant = viewerQuadrantAt(clientX, clientY, bounds);
    if (quadrant === null) return;
    const action = activeQuadrantBindings[quadrant];
    if (action === "none") return;
    quadrantClickTimerRef.current = window.setTimeout(() => {
      quadrantClickTimerRef.current = null;
      applyMouseGesture(action);
    }, 250);
  }

  useEffect(() => clearQuadrantClickTimer, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.isComposing) return;
      if (toolbarMoreOpen && event.key === "Escape") {
        event.preventDefault();
        setToolbarMoreOpen(false);
        return;
      }
      if (rectangleZoomArmed && event.key === "Escape") {
        event.preventDefault();
        cancelRectangleZoom();
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editingText = target !== null && (
        target.matches("input, textarea, select, [contenteditable=true]")
        || target.closest("[contenteditable=true]") !== null
        || target.closest('[role="dialog"]') !== null
      );
      const keyboardArrow = !editingText
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
        ? event.key as KeyboardScrollArrow
        : null;
      if (keyboardArrow !== null) {
        if (event.repeat && !keyScrollContinuous) {
          event.preventDefault();
          return;
        }
        if (scrollWithKeyboardArrow(keyboardArrow, event.repeat)) {
          event.preventDefault();
          return;
        }
      }
      if (!editingText && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const transformAction: ImageTransformAction | undefined = event.key === "]"
          ? "rotateClockwise"
          : event.key.toLowerCase() === "h"
            ? "flipHorizontal"
            : event.key.toLowerCase() === "v"
              ? "flipVertical"
              : event.key === "0"
                ? "reset"
                : undefined;
        if (transformAction !== undefined) {
          event.preventDefault();
          applyImageTransform(transformAction);
          return;
        }
      }
      if (editingText) return;
      const customCommand = customShortcutCommand(event, activeShortcuts);
      const command = isViewerShortcutCommand(customCommand)
        ? customCommand
        : fallbackShortcutCommand(event, state.direction);
      if (command === undefined) return;
      event.preventDefault();
      if (
        event.repeat
        && !keyScrollContinuous
        && (command === "nextPage" || command === "previousPage")
      ) return;
      const keyScrollFactor = event.repeat ? keyScrollAccelerationPercent / 100 : 1;
      switch (command) {
        case "closeViewer":
          handleCloseCommand();
          break;
        case "nextPage":
          next(keyScrollFactor, keyboardArrow !== null);
          break;
        case "previousPage":
          previous(keyScrollFactor, keyboardArrow !== null);
          break;
        case "singlePage":
          changeMode("single");
          break;
        case "spreadPage":
          changeMode("spread");
          break;
        case "toggleDirection":
          toggleDirection();
          break;
        case "zoomIn":
          applyScale({ type: "zoomIn" });
          break;
        case "zoomOut":
          applyScale({ type: "zoomOut" });
          break;
        case "toggleLoupe":
          applyScale({ type: "loupe", enabled: !scale.loupeEnabled });
          break;
        case "toggleFullscreen":
          void requestFullscreen(!fullscreen);
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const progress =
    visible.length === 2
      ? `${visible[0] + 1}-${visible[1] + 1} / ${session.pages.length}`
      : `${state.index + 1} / ${session.pages.length}`;
  const ordered =
    state.direction === "rightToLeft" && visible.length === 2
      ? [...visible].reverse()
      : visible;
  const renderPage = (index: number) => {
    const page = session.pages[index];
    const imageTransform = transformForPage(index);
    const content = imageErrors.has(index) ? (
      <div className="page-error" role="alert">
        <h2>画像を読み込めません</h2>
        <p>{page.relativePath}</p>
        <button onClick={() => previous()}>前ページ</button>
        <button data-product-id="viewer-error-next" onClick={() => next()}>次ページ</button>
        <button onClick={close}>ビューワを閉じる</button>
      </div>
    ) : mediaUris[index] ? (
      <img
        src={mediaUris[index]}
        alt={`${session.displayName} ${index + 1}ページ`}
        data-page-index={index}
        data-image-transformed={!isIdentityImageTransform(imageTransform)}
        data-quarter-turns={imageTransform.quarterTurns}
        data-flip-horizontal={imageTransform.flipHorizontal}
        data-flip-vertical={imageTransform.flipVertical}
        style={{ transform: imageTransformCss(imageTransform) }}
        onLoad={(event) => {
          setReadyPages((current) => new Set(current).add(index));
          const width = event.currentTarget.naturalWidth;
          const height = event.currentTarget.naturalHeight;
          if (width > 0 && height > 0) {
            setPageSizes((current) => {
              const existing = current.get(index);
              if (existing?.width === width && existing.height === height) return current;
              return new Map(current).set(index, { width, height });
            });
          }
          if (!isPagePairable(
            width,
            height,
            spreadRules.portraitMaxAspectPercent,
          )) {
            setLandscape((current) => new Set(current).add(index));
          }
        }}
        onError={() => setImageErrors((current) => new Set(current).add(index))}
      />
    ) : (
      <p role="status">ページを読み込んでいます。</p>
    );
    return content;
  };

  return (
    <section
      className="viewer"
      aria-label={`${session.displayName} ビューワ`}
      data-layout-mode="paged"
      data-fullscreen={fullscreen}
      data-toolbar-more-open={toolbarMoreOpen}
      data-toolbar-visible={!fullscreen || fullscreenToolbarVisible}
      data-page-navigator-visible={!fullscreen || fullscreenPageNavigatorVisible}
      data-slideshow={slideshowRunning}
      data-slideshow-order={slideshowOrder}
      data-slideshow-repeat-current={slideshowRepeatCurrentItem}
      onPointerMove={(event) => {
        if (
          fullscreen
          && !fullscreenToolbarVisible
          && event.clientY <= FULLSCREEN_EDGE_REVEAL_HEIGHT
        ) {
          setFullscreenToolbarVisible(true);
        }
        if (
          fullscreen
          && !fullscreenPageNavigatorVisible
          && event.clientY >= window.innerHeight - FULLSCREEN_EDGE_REVEAL_HEIGHT
        ) {
          setFullscreenPageNavigatorVisible(true);
        }
      }}
    >
      <header
        className="viewer-toolbar"
        onPointerLeave={(event) => {
          if (
            fullscreen
            && !toolbarMoreOpen
            && !(event.relatedTarget instanceof Node
              && event.currentTarget.contains(event.relatedTarget))
          ) {
            setFullscreenToolbarVisible(false);
          }
        }}
      >
        <div className="viewer-toolbar-identity">
          <button
            className="viewer-icon-button viewer-toolbar-close"
            type="button"
            aria-label="一覧へ戻る"
            title="ビューワを閉じる（一覧は開いたまま）"
            data-product-id="viewer-close"
            onClick={close}
          >
            <span aria-hidden="true">↩</span>
          </button>
          <strong title={session.displayName}>{session.displayName}</strong>
        </div>
        <div className="viewer-toolbar-controls" aria-label="表示操作">
          <div className="viewer-toolbar-group viewer-toolbar-group--view" role="group" aria-label="表示枚数">
            <label className="viewer-layout-control">
              <span className="visually-hidden">表示枚数</span>
              <select
                aria-label="表示枚数"
                value={state.mode}
                onChange={(event) => changeMode(event.target.value as ViewMode)}
              >
                {VIEW_MODES.map((mode) => (
                  <option key={mode} value={mode}>{VIEW_MODE_LABELS[mode]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="viewer-toolbar-group viewer-toolbar-group--scale" role="group" aria-label="倍率">
            <label className="viewer-scale-control">
              <span className="visually-hidden">倍率</span>
              <select
                aria-label="倍率モード"
                value={scale.mode}
                onChange={(event) =>
                  applyScale({ type: "mode", mode: event.target.value as ScaleMode })
                }
              >
                <option value="fit">全体フィット</option>
                <option value="width">横幅フィット</option>
                <option value="height">高さフィット</option>
                <option value="original">原寸</option>
                <option value="custom">任意倍率</option>
              </select>
              <span className="viewer-scale-percent" aria-label="現在の倍率">{Math.round(displayedScale * 100)}%</span>
            </label>
            <button
              className="viewer-icon-button viewer-toolbar-zoom-out"
              aria-label="倍率を下げる"
              title="倍率を下げる"
              onClick={() => applyScale({ type: "zoomOut" })}
            >
              <span aria-hidden="true">−</span>
            </button>
            <button
              className="viewer-icon-button viewer-toolbar-zoom-in"
              aria-label="倍率を上げる"
              title="倍率を上げる"
              onClick={() => applyScale({ type: "zoomIn" })}
            >
              <span aria-hidden="true">＋</span>
            </button>
          </div>
          <div className="viewer-toolbar-group viewer-toolbar-group--utility" role="group" aria-label="しおりと補助操作">
            <button
              className="viewer-icon-button viewer-toolbar-bookmark"
              type="button"
              aria-label="しおりを保存"
              title="現在のページをしおりに保存"
              onClick={() => onSaveBookmark?.(state.index)}
            >
              <span aria-hidden="true">★</span>
            </button>
            <button
              className="viewer-icon-button viewer-toolbar-more"
              type="button"
              aria-label={toolbarMoreOpen ? "その他の操作を閉じる" : "その他の操作"}
              title={toolbarMoreOpen ? "その他の操作を閉じる" : "その他の操作を表示"}
              aria-controls="viewer-more-panel"
              aria-expanded={toolbarMoreOpen}
              onClick={() => setToolbarMoreOpen((open) => !open)}
            >
              <span aria-hidden="true">⋯</span>
            </button>
          </div>
          <div className="viewer-toolbar-group viewer-toolbar-group--window" role="group" aria-label="ウィンドウ操作">
            <button
              ref={fullscreenButtonRef}
              className="viewer-icon-button viewer-toolbar-fullscreen"
              aria-label={fullscreen ? "全画面表示を終了" : "全画面表示"}
              title={fullscreen ? "全画面表示を終了" : "全画面表示へ切り替え"}
              aria-pressed={fullscreen}
              onClick={() => void requestFullscreen(!fullscreen)}
            >
              <span aria-hidden="true">{fullscreen ? "⊡" : "⛶"}</span>
            </button>
          </div>
        </div>
        {(fullscreenError !== null || clipboardNotice !== null || imageTransformNotice !== null) && (
          <div className="viewer-toolbar-notices">
            {fullscreenError !== null && (
              <span className="fullscreen-error" role="status">{fullscreenError}</span>
            )}
            {clipboardNotice !== null && (
              <span className="fullscreen-error" role="status">{clipboardNotice}</span>
            )}
            {imageTransformNotice !== null && (
              <span className="fullscreen-error" role="status">{imageTransformNotice}</span>
            )}
          </div>
        )}
      </header>
      <section
        id="viewer-more-panel"
        className="viewer-more-panel"
        role="region"
        aria-labelledby="viewer-more-title"
        data-open={toolbarMoreOpen}
        onPointerLeave={(event) => {
          if (
            fullscreen
            && !(event.relatedTarget instanceof Node
              && event.currentTarget.contains(event.relatedTarget))
          ) {
            setToolbarMoreOpen(false);
            setFullscreenToolbarVisible(false);
          }
        }}
      >
        <header className="viewer-more-panel-header">
          <div>
            <h2 id="viewer-more-title">その他の操作</h2>
            <p>表示・移動・画像処理をまとめて調整できます。</p>
          </div>
          <button type="button" onClick={() => setToolbarMoreOpen(false)}>閉じる</button>
        </header>
        <div className="viewer-more-groups">
          <section className="viewer-more-group" aria-labelledby="viewer-more-display-title">
            <h3 id="viewer-more-display-title">表示とサイズ</h3>
            <label className="viewer-more-field">
              任意倍率（%）
              <input
                aria-label="任意倍率（%）"
                type="number"
                min="1"
                max="800"
                step="1"
                value={Math.round(scale.scale * 100)}
                disabled={scale.mode !== "custom"}
                onChange={(event) => {
                  const next = Number(event.target.value) / 100;
                  if (Number.isFinite(next)) applyScale({ type: "scale", scale: next });
                }}
              />
            </label>
            <div className="viewer-more-pixel-controls">
              <label className="viewer-more-field">
                表示幅（px）
                <input
                  aria-label="表示幅（px）"
                  type="number"
                  min="1"
                  max="32768"
                  step="1"
                  value={pixelWidthInput}
                  onChange={(event) => setPixelWidthInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applyPixelDimension("width", pixelWidthInput);
                  }}
                />
              </label>
              <button
                type="button"
                className="viewer-more-apply"
                aria-label="表示幅を適用"
                title="表示幅を適用"
                onClick={() => applyPixelDimension("width", pixelWidthInput)}
              >適用</button>
              <label className="viewer-more-field">
                表示高さ（px）
                <input
                  aria-label="表示高さ（px）"
                  type="number"
                  min="1"
                  max="32768"
                  step="1"
                  value={pixelHeightInput}
                  onChange={(event) => setPixelHeightInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applyPixelDimension("height", pixelHeightInput);
                  }}
                />
              </label>
              <button
                type="button"
                className="viewer-more-apply"
                aria-label="表示高さを適用"
                title="表示高さを適用"
                onClick={() => applyPixelDimension("height", pixelHeightInput)}
              >適用</button>
            </div>
            <div className="viewer-more-actions">
              <button
                className="viewer-more-action"
                aria-label="矩形ズーム"
                title={rectangleZoomArmed
                  ? "矩形ズームを解除"
                  : "stage上で拡大する範囲をドラッグ"}
                aria-pressed={rectangleZoomArmed}
                onClick={toggleRectangleZoom}
              >
                <span aria-hidden="true">▣＋</span><span>矩形ズーム</span>
              </button>
              <button
                className="viewer-more-action"
                aria-label="ルーペ"
                title={scale.loupeEnabled ? "ルーペを無効にする" : "ルーペを有効にする"}
                aria-pressed={scale.loupeEnabled}
                onClick={() => applyScale({ type: "loupe", enabled: !scale.loupeEnabled })}
              >
                <span aria-hidden="true">⌕</span><span>ルーペ</span>
              </button>
            </div>
            {pixelScaleError && <span className="viewer-control-error" role="alert">{pixelScaleError}</span>}
            {rectangleZoomError && <span className="viewer-control-error" role="alert">{rectangleZoomError}</span>}
          </section>
          <section className="viewer-more-group" aria-labelledby="viewer-more-navigation-title">
            <h3 id="viewer-more-navigation-title">移動と読み方</h3>
            {onEndOfVolumePolicyChange !== undefined && (
              <label className="viewer-more-field">
                巻末動作
                <select
                  aria-label="巻末動作"
                  value={endOfVolumePolicy}
                  onChange={(event) =>
                    onEndOfVolumePolicyChange(
                      normalizeEndOfVolumePolicy(event.target.value),
                    )
                  }
                >
                  {Object.entries(END_OF_VOLUME_POLICY_LABELS).map(([policy, label]) => (
                    <option key={policy} value={policy}>{label}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="viewer-more-actions">
              <button
                className="viewer-more-action"
                aria-label="読み方向"
                title={state.direction === "rightToLeft"
                  ? "読み方向を左開きへ切り替え"
                  : "読み方向を右開きへ切り替え"}
                onClick={toggleDirection}
              >
                <span aria-hidden="true">⇄</span><span>{state.direction === "rightToLeft" ? "左開きへ" : "右開きへ"}</span>
              </button>
              <button
                className="viewer-more-action"
                aria-label="見開きを1ページ戻す"
                title="見開きの開始位置を1ページ戻す"
                disabled={state.mode !== "spread" || state.index === 0}
                onClick={() => shiftOnePage(-1)}
              >
                <span aria-hidden="true">1◀</span><span>見開きを1ページ戻す</span>
              </button>
              <button
                className="viewer-more-action"
                aria-label="見開きを1ページ進める"
                title="見開きの開始位置を1ページ進める"
                disabled={state.mode !== "spread" || state.index + 1 >= session.pages.length}
                onClick={() => shiftOnePage(1)}
              >
                <span aria-hidden="true">▶1</span><span>見開きを1ページ進める</span>
              </button>
              <button
                className="viewer-more-action"
                aria-label="ランダムページ"
                title="現在以外のページへランダム移動"
                disabled={session.pages.length <= 1}
                onClick={randomPage}
              >
                <span aria-hidden="true">⤨</span><span>ランダムページ</span>
              </button>
            </div>
          </section>
          <section className="viewer-more-group" aria-labelledby="viewer-more-bookmark-title">
            <h3 id="viewer-more-bookmark-title">しおりと共有</h3>
            <div className="viewer-more-actions">
              <button
                className="viewer-more-action"
                type="button"
                aria-label="次のしおり"
                title="次のしおりへ移動"
                disabled={resolvedBookmarks.length === 0}
                onClick={jumpToNextBookmark}
              >
                <span aria-hidden="true">★→</span><span>次のしおり</span>
              </button>
              <button
                className="viewer-more-action"
                type="button"
                aria-label="しおり一覧"
                title="しおり一覧を表示"
                disabled={bookmarks.length === 0}
                onClick={() => {
                  setToolbarMoreOpen(false);
                  setBookmarkListOpen(true);
                }}
              >
                <span aria-hidden="true">☷</span><span>しおり一覧</span>
              </button>
              <button
                className="viewer-more-action"
                type="button"
                aria-label="現在ページの画像をコピー"
                title="現在ページを画像データとしてクリップボードへコピー"
                disabled={clipboardCopying}
                onClick={() => void copyCurrentPageImage()}
              >
                <span aria-hidden="true">▣</span><span>画像をコピー</span>
              </button>
            </div>
          </section>
          <section className="viewer-more-group" aria-labelledby="viewer-more-image-title">
            <h3 id="viewer-more-image-title">画像</h3>
            <div className="viewer-more-actions">
              <button
                className="viewer-more-action"
                type="button"
                aria-label="時計回りに90度回転"
                title="現在ページを時計回りに90度回転 (])"
                onClick={() => applyImageTransform("rotateClockwise")}
              >
                <span aria-hidden="true">↻</span><span>90度回転</span>
              </button>
              <button
                className="viewer-more-action"
                type="button"
                aria-label="左右反転"
                title="現在ページを左右反転 (H)"
                onClick={() => applyImageTransform("flipHorizontal")}
              >
                <span aria-hidden="true">↔</span><span>左右反転</span>
              </button>
              <button
                className="viewer-more-action"
                type="button"
                aria-label="上下反転"
                title="現在ページを上下反転 (V)"
                onClick={() => applyImageTransform("flipVertical")}
              >
                <span aria-hidden="true">↕</span><span>上下反転</span>
              </button>
              <button
                className="viewer-more-action"
                type="button"
                aria-label="回転・反転をリセット"
                title="現在ページの回転・反転をリセット (0)"
                disabled={isIdentityImageTransform(transformForPage(state.index))}
                onClick={() => applyImageTransform("reset")}
              >
                <span aria-hidden="true">0°</span><span>回転・反転をリセット</span>
              </button>
              <button
                className="viewer-more-action"
                type="button"
                aria-label="画像フィルター"
                title="非破壊画像フィルターを設定"
                onClick={() => {
                  setToolbarMoreOpen(false);
                  setFilterDialogOpen(true);
                }}
              >
                <span aria-hidden="true">◐</span><span>画像フィルター</span>
              </button>
            </div>
          </section>
        </div>
      </section>
      {filterDialogOpen && (
        <FilterDialog
          generation={generation}
          onApplied={reloadFilteredPages}
          onClose={() => setFilterDialogOpen(false)}
        />
      )}
      {bookmarkListOpen && (
        <div className="dialog-backdrop">
          <section
            className="bookmark-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="しおり一覧"
          >
            <h2>しおり一覧</h2>
            {bookmarks.length === 0 ? (
              <p>保存済みのしおりはありません。</p>
            ) : (
              <ul>
                {bookmarks.map((bookmark) => {
                  const resolved = resolvedBookmarks.find(
                    (candidate) => candidate.itemKey === bookmark.itemKey
                      && candidate.pageKey === bookmark.pageKey,
                  );
                  return (
                    <li key={`${bookmark.itemKey}:${bookmark.pageKey}`}>
                      <button
                        type="button"
                        disabled={resolved === undefined}
                        onClick={() => {
                          if (resolved === undefined) return;
                          dispatch({ type: "go", index: resolved.pageIndex });
                          setBookmarkListOpen(false);
                        }}
                      >
                        {resolved === undefined
                          ? `${bookmark.pageKey}（現在の作品では見つかりません）`
                          : `${resolved.pageIndex + 1}ページ: ${bookmark.pageKey}`}
                      </button>
                      <button
                        type="button"
                        aria-label={`しおりを削除: ${bookmark.pageKey}`}
                        onClick={() => onDeleteBookmark?.(bookmark.pageKey)}
                      >
                        削除
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <button type="button" onClick={() => setBookmarkListOpen(false)}>閉じる</button>
          </section>
        </div>
      )}
      <div
        ref={stageRef}
        className="viewer-stage"
        data-panning={panning}
        data-rectangle-zoom={rectangleZoomArmed}
        data-background={viewerBackground}
        data-cursor-hidden={cursorHidden}
        style={{
          "--viewer-page-margin": viewerPageMargin + "px",
          "--viewer-spread-gap": viewerSpreadGap + "px",
          "--viewer-spread-half-gap": viewerSpreadGap / 2 + "px",
        } as CSSProperties}
        onPointerEnter={() => {
          cursorInsideStageRef.current = true;
          scheduleCursorHide();
        }}
        onPointerMove={(event) => {
          const rectangle = rectangleZoomSelectionRef.current;
          if (rectangle?.pointerId === event.pointerId) {
            const bounds = event.currentTarget.getBoundingClientRect();
            const next = {
              ...rectangle,
              currentX: Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width),
              currentY: Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height),
            };
            rectangleZoomSelectionRef.current = next;
            setRectangleZoomSelection(next);
            event.preventDefault();
            return;
          }
          scheduleCursorHide();
          updateLoupe(event);
          const rightClick = rightClickRef.current;
          if (
            rightClick?.pointerId === event.pointerId
            && (Math.abs(event.clientX - rightClick.startX) >= 4
              || Math.abs(event.clientY - rightClick.startY) >= 4)
          ) rightClick.canceled = true;
          const drag = pointerDragRef.current;
          if (!drag || drag.pointerId !== event.pointerId || !drag.pannable) return;
          const spread = spreadRef.current;
          if (!spread) return;
          const deltaX = event.clientX - drag.lastX;
          const deltaY = event.clientY - drag.lastY;
          if (Math.abs(event.clientX - drag.startX) >= 4 || Math.abs(event.clientY - drag.startY) >= 4) {
            drag.moved = true;
            setPanning(true);
          }
          spread.scrollLeft -= deltaX * panFactor;
          spread.scrollTop -= deltaY * panFactor;
          pageScanInitializedRef.current = true;
          drag.lastX = event.clientX;
          drag.lastY = event.clientY;
          event.preventDefault();
        }}
        onPointerLeave={() => {
          cursorInsideStageRef.current = false;
          clearCursorHideTimer();
          setCursorHidden(false);
          setLoupe(null);
        }}
        onPointerDown={(event) => {
          clearQuadrantClickTimer();
          clearCursorHideTimer();
          setCursorHidden(false);
          if (rectangleZoomArmed) {
            if (
              event.button === 0
              && event.pointerType === "mouse"
              && !event.ctrlKey
              && !event.metaKey
              && !event.shiftKey
              && !event.altKey
            ) {
              const bounds = event.currentTarget.getBoundingClientRect();
              const startX = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width);
              const startY = Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height);
              const selection = {
                pointerId: event.pointerId,
                startX,
                startY,
                currentX: startX,
                currentY: startY,
              };
              rectangleZoomSelectionRef.current = selection;
              setRectangleZoomSelection(selection);
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }
            event.preventDefault();
            return;
          }
          if (event.button === 2) {
            rightButtonHeldRef.current = true;
            rightClickRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              eligible: event.pointerType === "mouse"
                && !event.ctrlKey
                && !event.metaKey
                && !event.shiftKey
                && !event.altKey,
              canceled: false,
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            event.preventDefault();
            return;
          }
          const buttonGesture = event.button === 1
            ? activeMouseGestures.middleClick
            : event.button === 3
              ? activeMouseGestures.backButton
              : event.button === 4
                ? activeMouseGestures.forwardButton
                : undefined;
          if (buttonGesture !== undefined) {
            event.preventDefault();
            applyMouseGesture(buttonGesture);
            return;
          }
          if (event.button !== 0) return;
          const spread = spreadRef.current;
          const pannable = spread !== null && (
            spread.scrollWidth > spread.clientWidth
            || spread.scrollHeight > spread.clientHeight
          );
          pointerDragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY,
            pannable,
            quadrantClickEligible: event.pointerType === "mouse"
              && !event.ctrlKey
              && !event.metaKey
              && !event.shiftKey
              && !event.altKey,
            moved: false,
          };
          if (pannable) event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerUp={(event) => {
          const rectangle = rectangleZoomSelectionRef.current;
          if (rectangle?.pointerId === event.pointerId) {
            const bounds = event.currentTarget.getBoundingClientRect();
            const completed = {
              ...rectangle,
              currentX: Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width),
              currentY: Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height),
            };
            rectangleZoomSelectionRef.current = null;
            setRectangleZoomSelection(null);
            event.preventDefault();
            void applyRectangleZoom(completed);
            return;
          }
          if (rectangleZoomArmed) {
            event.preventDefault();
            return;
          }
          if (event.button === 2) {
            const rightClick = rightClickRef.current;
            rightClickRef.current = null;
            rightButtonHeldRef.current = false;
            scheduleCursorHide();
            event.preventDefault();
            if (
              rightClick?.pointerId === event.pointerId
              && rightClick.eligible
              && !rightClick.canceled
              && event.pointerType === "mouse"
              && !event.ctrlKey
              && !event.metaKey
              && !event.shiftKey
              && !event.altKey
            ) applyMouseGesture(activeRightClickAction);
            return;
          }
          if (event.button !== 0) {
            scheduleCursorHide();
            return;
          }
          const drag = pointerDragRef.current;
          pointerDragRef.current = null;
          setPanning(false);
          scheduleCursorHide();
          if (!drag || drag.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - drag.startX;
          const deltaY = event.clientY - drag.startY;
          const moved = drag.moved || Math.abs(deltaX) >= 4 || Math.abs(deltaY) >= 4;
          if (
            !moved
            && drag.quadrantClickEligible
            && event.pointerType === "mouse"
            && !event.ctrlKey
            && !event.metaKey
            && !event.shiftKey
            && !event.altKey
          ) {
            scheduleQuadrantClick(event.clientX, event.clientY);
            return;
          }
          if (drag.pannable || Math.abs(deltaX) < 48) return;
          const action = event.clientX < drag.startX
            ? activeMouseGestures.swipeLeft
            : activeMouseGestures.swipeRight;
          applyMouseGesture(action);
        }}
        onPointerCancel={() => {
          if (rectangleZoomArmed || rectangleZoomSelectionRef.current !== null) {
            cancelRectangleZoom();
          }
          clearQuadrantClickTimer();
          rightButtonHeldRef.current = false;
          rightClickRef.current = null;
          pointerDragRef.current = null;
          setPanning(false);
          scheduleCursorHide();
        }}
        onContextMenu={(event) => event.preventDefault()}
        onDoubleClick={(event) => {
          if (rectangleZoomArmed) {
            event.preventDefault();
            return;
          }
          clearQuadrantClickTimer();
          void requestFullscreen(!fullscreen);
        }}
        onWheel={(event) => {
          if (rectangleZoomArmed) {
            event.preventDefault();
            return;
          }
          const rightWheel = rightButtonHeldRef.current || (event.buttons & 2) !== 0;
          if (rightWheel && event.deltaY !== 0) {
            if (rightClickRef.current !== null) rightClickRef.current.canceled = true;
            event.preventDefault();
            applyMouseGesture(
              event.deltaY > 0
                ? activeMouseGestures.rightWheelDown
                : activeMouseGestures.rightWheelUp,
            );
          } else if (event.ctrlKey) {
            event.preventDefault();
            applyScale({ type: event.deltaY > 0 ? "zoomOut" : "zoomIn" });
          } else if (event.deltaY !== 0) {
            if (Math.abs(event.deltaY) < wheelDeadZone) return;
            event.preventDefault();
            applyMouseGesture(
              event.deltaY > 0
                ? activeMouseGestures.wheelDown
                : activeMouseGestures.wheelUp,
            );
          }
        }}
      >
        <div
          ref={spreadRef}
          className="page-spread"
          data-layout-mode="paged"
          data-direction={state.direction}
          data-scale-mode={scale.mode}
          data-scale={scale.scale}
          data-page-count={ordered.length}
          data-effective-view-mode={visible.length === 2 ? "spread" : "single"}
          data-page-anchor={state.index}
          data-loupe-enabled={scale.loupeEnabled}
          data-fit-scale-active={calculatedFitScale !== null}
          style={{
            "--viewer-custom-scale": scale.scale,
            "--viewer-fit-scale": calculatedFitScale ?? 1,
          } as CSSProperties}
        >
          {ordered.map((index) =>
            <Fragment key={session.pages[index].id}>
              {renderPage(index)}
            </Fragment>,
          )}
        </div>
        {rectangleZoomSelection && (
          <div
            className="viewer-rectangle-zoom-selection"
            aria-hidden="true"
            style={{
              left: Math.min(rectangleZoomSelection.startX, rectangleZoomSelection.currentX),
              top: Math.min(rectangleZoomSelection.startY, rectangleZoomSelection.currentY),
              width: Math.abs(rectangleZoomSelection.currentX - rectangleZoomSelection.startX),
              height: Math.abs(rectangleZoomSelection.currentY - rectangleZoomSelection.startY),
            }}
          />
        )}
        {viewerGridEnabled && (
          <div
            className="viewer-grid-overlay"
            data-grid-color={viewerGridColor}
            aria-hidden="true"
            style={{ "--viewer-grid-size": `${viewerGridSize}px` } as CSSProperties}
          />
        )}
        {scale.loupeEnabled && loupe && mediaUris[loupe.index] && (
          <div
            className="viewer-loupe"
            role="img"
            aria-label="ポインタ周辺ルーペ"
            style={
              {
                left: loupe.stageX,
                top: loupe.stageY,
                "--viewer-loupe-size": `${loupeSize}px`,
              } as CSSProperties
            }
          >
            <span
              className="viewer-loupe-surface"
              aria-hidden="true"
              data-quarter-turns={transformForPage(loupe.index).quarterTurns}
              data-flip-horizontal={transformForPage(loupe.index).flipHorizontal}
              data-flip-vertical={transformForPage(loupe.index).flipVertical}
              style={{
                backgroundImage: `url("${mediaUris[loupe.index]}")`,
                backgroundSize: `${loupe.imageWidth * loupeZoom}px ${loupe.imageHeight * loupeZoom}px`,
                backgroundPosition: `${loupeSize / 2 - loupe.imageX * loupeZoom}px ${loupeSize / 2 - loupe.imageY * loupeZoom}px`,
                transform: imageTransformCss(transformForPage(loupe.index)),
              }}
            />
          </div>
        )}
        {preloadIndices.map((index) => mediaUris[index] && (
          <img
            key={session.pages[index].id}
            className="prefetch-page"
            src={mediaUris[index]}
            alt=""
            aria-hidden="true"
            onLoad={(event) => {
              setReadyPages((current) => new Set(current).add(index));
              const width = event.currentTarget.naturalWidth;
              const height = event.currentTarget.naturalHeight;
              if (width > 0 && height > 0) {
                setPageSizes((current) => {
                  const existing = current.get(index);
                  if (existing?.width === width && existing.height === height) return current;
                  return new Map(current).set(index, { width, height });
                });
              }
              if (!isPagePairable(
                width,
                height,
                spreadRules.portraitMaxAspectPercent,
              )) {
                setLandscape((current) => new Set(current).add(index));
              }
            }}
            onError={() => setImageErrors((current) => new Set(current).add(index))}
          />
        ))}
      </div>
      <nav
        className="viewer-page-navigator"
        aria-label="ページ移動"
        onPointerLeave={(event) => {
          if (
            fullscreen
            && !(event.relatedTarget instanceof Node
              && event.currentTarget.contains(event.relatedTarget))
          ) {
            setFullscreenPageNavigatorVisible(false);
          }
        }}
      >
        <input
          type="range"
          dir="rtl"
          aria-label="ページ移動"
          aria-valuetext={progress}
          min="0"
          max={Math.max(0, session.pages.length - 1)}
          step="1"
          value={state.index}
          disabled={session.pages.length <= 1}
          onChange={(event) => dispatch({ type: "go", index: Number(event.target.value) })}
        />
        <output aria-live="polite">{progress}</output>
        <div className="viewer-page-actions" role="group" aria-label="ページ操作">
          <button
            className="viewer-icon-button viewer-page-action"
            type="button"
            aria-label="前ページ"
            title="前ページへ移動"
            onClick={() => previous()}
          >
            <span aria-hidden="true">◀</span>
          </button>
          <button
            className="viewer-icon-button viewer-page-action"
            type="button"
            aria-label="次ページ"
            title="次ページへ移動"
            onClick={() => next()}
          >
            <span aria-hidden="true">▶</span>
          </button>
          <button
            className="viewer-icon-button viewer-page-action viewer-page-action--slideshow"
            type="button"
            aria-label={slideshowRunning ? "スライドショーを停止" : "スライドショーを開始"}
            title={slideshowRunning
              ? "スライドショーを停止"
              : `${activeSlideshowIntervalMs / 1000}秒間隔・${slideshowOrder === "forward" ? "順方向" : slideshowOrder === "reverse" ? "逆方向" : "ランダム"}でスライドショーを開始`}
            aria-pressed={slideshowRunning}
            disabled={session.pages.length <= 1}
            onClick={toggleSlideshow}
          >
            <span aria-hidden="true">{slideshowRunning ? "Ⅱ" : "▷"}</span>
          </button>
        </div>
      </nav>
    </section>
  );
}
