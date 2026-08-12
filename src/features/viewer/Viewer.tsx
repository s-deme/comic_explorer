import { Fragment, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  loadPage,
  saveReadingPosition,
  type ViewerSession,
} from "../library/client";
import {
  clampLoupePointer,
  createViewerScaleState,
  LOUPE_SIZE,
  LOUPE_ZOOM,
  scaleReducer,
  viewerReducer,
  visibleIndices,
  type ReadingDirection,
  type ScaleMode,
  type ViewerScaleAction,
  type ViewerScaleState,
  type ViewMode,
  type ViewerLayoutMode,
} from "./model";
import {
  VIEWER_LAYOUT_MODE_LABELS,
  VIEWER_LAYOUT_MODES,
} from "./model";
import {
  tauriFullscreenAdapter,
  type FullscreenAdapter,
} from "./fullscreen";
import {
  customShortcutCommand,
  fallbackShortcutCommand,
  isViewerShortcutCommand,
  normalizeShortcutBindings,
  type ShortcutBindings,
} from "../input/shortcuts";
import { resolveBookmarks, type PageBookmark } from "../reading/collections";
import {
  normalizeMouseGestures,
  type MouseGestureAction,
  type MouseGestureBindings,
} from "../settings/profile";
import {
  END_OF_VOLUME_POLICY_LABELS,
  normalizeEndOfVolumePolicy,
  type EndOfVolumePolicy,
} from "../catalog/end-of-volume";

const FULLSCREEN_EDGE_REVEAL_HEIGHT = 32;
const VIEWER_PREFETCH_AHEAD = 4;

interface ViewerProps {
  session: ViewerSession;
  generation: number;
  onClose: () => void;
  onNextItem?: () => void;
  onPreviousItem?: () => void;
  endOfVolumePolicy?: EndOfVolumePolicy;
  onEndOfVolumePolicyChange?: (policy: EndOfVolumePolicy) => void;
  initialMode: ViewMode;
  initialLayoutMode?: ViewerLayoutMode;
  initialDirection: ReadingDirection;
  onSettingsChange: (mode: ViewMode, direction: ReadingDirection) => void;
  onLayoutChange?: (layoutMode: ViewerLayoutMode) => void;
  initialScaleMode?: ScaleMode;
  initialScale?: number;
  initialLoupeEnabled?: boolean;
  onScaleChange?: (scale: ViewerScaleState) => void;
  shortcuts?: ShortcutBindings;
  fullscreenAdapter?: FullscreenAdapter;
  initialFullscreen?: boolean;
  slideshowIntervalMs?: number;
  bookmarks?: PageBookmark[];
  onPageChange?: (index: number) => void;
  mouseGestures?: MouseGestureBindings;
  detached?: boolean;
  onToggleDetached?: () => void;
  onSaveBookmark?: (index: number) => void;
  onNextBookmark?: (index: number) => number | null;
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
  initialLayoutMode = "paged",
  initialDirection,
  onSettingsChange,
  onLayoutChange,
  initialScaleMode = "fit",
  initialScale = 1,
  initialLoupeEnabled = false,
  onScaleChange,
  shortcuts,
  fullscreenAdapter = tauriFullscreenAdapter,
  initialFullscreen = false,
  slideshowIntervalMs,
  bookmarks = [],
  onPageChange,
  mouseGestures,
  detached = false,
  onToggleDetached,
  onSaveBookmark,
  onNextBookmark,
}: ViewerProps) {
  const [state, dispatch] = useReducer(viewerReducer, {
    index: session.startIndex,
    mode: initialMode,
    direction: initialDirection,
    history: [],
  });
  const [landscape, setLandscape] = useState<Set<number>>(new Set());
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
  const [layoutMode, setLayoutMode] =
    useState<ViewerLayoutMode>(initialLayoutMode);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenToolbarVisible, setFullscreenToolbarVisible] = useState(true);
  const [fullscreenPageNavigatorVisible, setFullscreenPageNavigatorVisible] = useState(true);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [bookmarkListOpen, setBookmarkListOpen] = useState(false);
  const [loupe, setLoupe] = useState<LoupeState | null>(null);
  const activeShortcuts = useMemo(
    () => normalizeShortcutBindings(shortcuts),
    [shortcuts],
  );
  const activeMouseGestures = useMemo(
    () => normalizeMouseGestures(mouseGestures),
    [mouseGestures],
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const pageRequests = useRef(new Set<number>());
  const scrollAnchorFrameRef = useRef<number | null>(null);
  const pointerDragRef = useRef<PointerDragState | null>(null);
  const rightButtonHeldRef = useRef(false);
  const [panning, setPanning] = useState(false);
  const initialFullscreenRequested = useRef(false);

  useEffect(() => {
    const releaseRightButton = (event: PointerEvent) => {
      if (event.button === 2) rightButtonHeldRef.current = false;
    };
    const resetRightButton = () => {
      rightButtonHeldRef.current = false;
    };
    window.addEventListener("pointerup", releaseRightButton);
    window.addEventListener("blur", resetRightButton);
    return () => {
      window.removeEventListener("pointerup", releaseRightButton);
      window.removeEventListener("blur", resetRightButton);
    };
  }, []);
  const positionTimerRef = useRef<number | null>(null);
  const visible = useMemo(
    () => visibleIndices(state, session.pages.length, landscape),
    [landscape, session.pages.length, state],
  );
  const nextStartIndex = state.index + Math.max(1, visible.length);
  const nextVisible = useMemo(() => {
    if (nextStartIndex >= session.pages.length) return [];
    if (
      state.mode === "single"
      || landscape.has(nextStartIndex)
      || nextStartIndex + 1 >= session.pages.length
    ) {
      return [nextStartIndex];
    }
    return [nextStartIndex, nextStartIndex + 1];
  }, [landscape, nextStartIndex, session.pages.length, state.mode]);
  const resolvedBookmarks = useMemo(
    () => resolveBookmarks(bookmarks, session.pages.map((page) => page.relativePath)),
    [bookmarks, session.pages],
  );

  useEffect(() => {
    const wanted =
      layoutMode === "paged"
        ? [...visible]
        : Array.from(
          {
            length: Math.min(
              session.pages.length,
              state.index + VIEWER_PREFETCH_AHEAD + 1,
            ) - state.index,
          },
          (_, offset) => state.index + offset,
        );
    if (layoutMode === "paged") {
      wanted.push(...nextVisible);
    }
    wanted.forEach((index) => {
      if (mediaUris[index] || imageErrors.has(index) || pageRequests.current.has(index)) return;
      pageRequests.current.add(index);
      void loadPage(session, index, generation, visible.includes(index) ? "visible" : "near")
        .then((response) => {
          if (response.status === "ok" && response.generation === generation) {
            setMediaUris((current) => ({ ...current, [index]: response.data.mediaUri }));
          } else if (response.status === "error") {
            setImageErrors((current) => new Set(current).add(index));
          } else {
            pageRequests.current.delete(index);
          }
        })
        .catch(() => setImageErrors((current) => new Set(current).add(index)));
    });
  }, [generation, imageErrors, layoutMode, mediaUris, nextVisible, session, state.index, visible]);

  function cancelScheduledPositionSave() {
    if (positionTimerRef.current === null) return;
    window.clearTimeout(positionTimerRef.current);
    positionTimerRef.current = null;
  }

  async function flushReadingPosition() {
    cancelScheduledPositionSave();
    await saveReadingPosition(session, state.index, generation);
  }

  function advanceVerticalOverflow(): boolean {
    if (layoutMode !== "paged") return false;
    const spread = spreadRef.current;
    if (!spread) return false;
    const maxScrollTop = Math.max(0, spread.scrollHeight - spread.clientHeight);
    if (maxScrollTop <= 1 || spread.scrollTop >= maxScrollTop - 1) return false;
    const nextScrollTop = Math.min(
      maxScrollTop,
      spread.scrollTop + Math.max(1, Math.floor(spread.clientHeight * 0.9)),
    );
    if (typeof spread.scrollTo === "function") {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      spread.scrollTo({
        top: nextScrollTop,
        left: spread.scrollLeft,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    } else {
      spread.scrollTop = nextScrollTop;
    }
    return true;
  }

  function next() {
    if (advanceVerticalOverflow()) return;
    if (state.index + Math.max(1, visible.length) >= session.pages.length) {
      void flushReadingPosition().finally(() =>
        onNextItem?.(),
      );
      return;
    }
    if (
      layoutMode === "paged"
      && nextVisible.some((index) => !readyPages.has(index) && !imageErrors.has(index))
    ) {
      setPendingNextIndex(nextStartIndex);
      return;
    }
    dispatch({
      type: "next",
      pageCount: session.pages.length,
      landscape,
    });
  }

  useLayoutEffect(() => {
    if (layoutMode !== "paged") return;
    const spread = spreadRef.current;
    if (spread) spread.scrollTop = 0;
  }, [layoutMode, state.index]);

  function previous() {
    if (state.index === 0) {
      void flushReadingPosition().finally(() => onPreviousItem?.());
      return;
    }
    dispatch({ type: "previous" });
  }

  useEffect(() => {
    if (pendingNextIndex === null || pendingNextIndex !== nextStartIndex) return;
    if (nextVisible.some((index) => !readyPages.has(index) && !imageErrors.has(index))) return;
    setPendingNextIndex(null);
    dispatch({
      type: "next",
      pageCount: session.pages.length,
      landscape,
    });
  }, [imageErrors, landscape, nextStartIndex, nextVisible, pendingNextIndex, readyPages, session.pages.length]);

  async function requestFullscreen(next: boolean): Promise<boolean> {
    setFullscreenError(null);
    try {
      if (next) await fullscreenAdapter.enter();
      else await fullscreenAdapter.exit();
      if (next) fullscreenButtonRef.current?.blur();
      setFullscreenToolbarVisible(!next);
      setFullscreenPageNavigatorVisible(!next);
      setFullscreen(next);
      if (!next) requestAnimationFrame(() => fullscreenButtonRef.current?.focus());
      return true;
    } catch {
      setFullscreenError("全画面表示を切り替えられません。もう一度お試しください。");
      return false;
    }
  }

  async function close() {
    if (fullscreen && !(await requestFullscreen(false))) return;
    await flushReadingPosition();
    onClose();
  }

  function changeMode(mode: ViewMode) {
    dispatch({ type: "mode", mode });
    onSettingsChange(mode, state.direction);
  }

  function changeLayout(next: ViewerLayoutMode) {
    setLayoutMode(next);
    onLayoutChange?.(next);
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
  }, [fullscreen, landscape, layoutMode, readyPages, scale.mode, scale.scale, state.index, state.mode]);

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
      stageX: event.clientX - stageRect.left,
      stageY: event.clientY - stageRect.top,
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
    let mounted = true;
    void fullscreenAdapter
      .isFullscreen()
      .then((current) => {
        if (mounted) setFullscreen(current);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [fullscreenAdapter]);

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
    if (slideshowIntervalMs === undefined || slideshowIntervalMs < 500) return;
    const timer = window.setTimeout(next, slideshowIntervalMs);
    return () => window.clearTimeout(timer);
  }, [slideshowIntervalMs, state.index, state.mode, visible.length]);

  useEffect(() => {
    if (layoutMode === "paged") return;
    const anchor = stageRef.current?.querySelector<HTMLElement>(
      `[data-page-index="${state.index}"].viewer-page`,
    );
    if (!anchor) return;
    anchor.focus({ preventScroll: true });
    anchor.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [layoutMode, state.index]);

  useEffect(() => () => {
    if (scrollAnchorFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollAnchorFrameRef.current);
    }
  }, []);

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

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (detached && event.key === "Escape") {
        event.preventDefault();
        if (fullscreen) void requestFullscreen(false);
        else void close();
        return;
      }
      const customCommand = customShortcutCommand(event, activeShortcuts);
      const command = isViewerShortcutCommand(customCommand)
        ? customCommand
        : fallbackShortcutCommand(event, state.direction);
      if (command === undefined) return;
      event.preventDefault();
      switch (command) {
        case "closeViewer":
          if (fullscreen) void requestFullscreen(false);
          else void close();
          break;
        case "nextPage":
          next();
          break;
        case "previousPage":
          previous();
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
  const scrollLayout = layoutMode !== "paged";
  const naturalScrollIndices = session.pages.map((_, index) => index);
  const scrollIndices =
    state.direction === "rightToLeft"
      ? [...naturalScrollIndices].reverse()
      : naturalScrollIndices;
  const scheduleScrollAnchorUpdate = () => {
    if (layoutMode === "paged" || scrollAnchorFrameRef.current !== null) return;
    scrollAnchorFrameRef.current = window.requestAnimationFrame(() => {
      scrollAnchorFrameRef.current = null;
      const spread = spreadRef.current;
      if (!spread) return;
      const viewport = spread.getBoundingClientRect();
      const vertical = layoutMode === "vertical_scroll";
      const viewportStart = vertical ? viewport.top : viewport.left;
      const viewportEnd = vertical ? viewport.bottom : viewport.right;
      let bestIndex: number | null = null;
      let bestOverlap = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      spread.querySelectorAll<HTMLElement>(".viewer-page").forEach((page) => {
        const bounds = page.getBoundingClientRect();
        const start = vertical ? bounds.top : bounds.left;
        const end = vertical ? bounds.bottom : bounds.right;
        const overlap = Math.max(0, Math.min(end, viewportEnd) - Math.max(start, viewportStart));
        if (overlap <= 0) return;
        const distance = Math.abs(start - viewportStart);
        const index = Number(page.dataset.pageIndex);
        if (!Number.isInteger(index)) return;
        if (overlap > bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
          bestIndex = index;
          bestOverlap = overlap;
          bestDistance = distance;
        }
      });
      if (bestIndex !== null && bestIndex !== state.index) {
        dispatch({ type: "go", index: bestIndex });
      }
    });
  };
  const renderPage = (index: number, withAnchor = false) => {
    const page = session.pages[index];
    const content = imageErrors.has(index) ? (
      <div className="page-error" role="alert">
        <h2>画像を読み込めません</h2>
        <p>{page.relativePath}</p>
        <button onClick={previous}>前ページ</button>
        <button data-product-id="viewer-error-next" onClick={next}>次ページ</button>
        <button onClick={close}>一覧へ戻る</button>
      </div>
    ) : mediaUris[index] ? (
      <img
        src={mediaUris[index]}
        alt={`${session.displayName} ${index + 1}ページ`}
        data-page-index={index}
        onLoad={(event) => {
          setReadyPages((current) => new Set(current).add(index));
          if (event.currentTarget.naturalWidth > event.currentTarget.naturalHeight) {
            setLandscape((current) => new Set(current).add(index));
          }
        }}
        onError={() => setImageErrors((current) => new Set(current).add(index))}
      />
    ) : (
      <p role="status">ページを読み込んでいます。</p>
    );
    if (!withAnchor) return content;
    return (
      <article
        className="viewer-page"
        data-page-index={index}
        aria-label={`ページ ${index + 1}`}
        tabIndex={index === state.index ? 0 : -1}
        onFocus={() => {
          if (index !== state.index) dispatch({ type: "go", index });
        }}
      >
        {content}
      </article>
    );
  };

  return (
    <section
      className="viewer"
      aria-label={`${session.displayName} ビューワ`}
      data-layout-mode={layoutMode}
      data-fullscreen={fullscreen}
      data-toolbar-visible={!fullscreen || fullscreenToolbarVisible}
      data-page-navigator-visible={!fullscreen || fullscreenPageNavigatorVisible}
      data-slideshow={slideshowIntervalMs !== undefined}
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
            && !(event.relatedTarget instanceof Node
              && event.currentTarget.contains(event.relatedTarget))
          ) {
            setFullscreenToolbarVisible(false);
          }
        }}
      >
        <strong>{session.displayName}</strong>
        <span>{state.mode === "single" ? "単ページ" : "見開き"}</span>
        <span>{state.direction === "rightToLeft" ? "右開き" : "左開き"}</span>
        <label className="viewer-layout-control">
          レイアウト
          <select
            aria-label="閲覧レイアウト"
            value={layoutMode}
            onChange={(event) =>
              changeLayout(event.target.value as ViewerLayoutMode)
            }
          >
            {VIEWER_LAYOUT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {VIEWER_LAYOUT_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        {onEndOfVolumePolicyChange !== undefined && (
          <label className="viewer-end-of-volume-control">
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
                <option key={policy} value={policy}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="viewer-scale-control">
          倍率
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
          <input
            aria-label="任意倍率（%）"
            type="number"
            min="25"
            max="400"
            step="1"
            value={Math.round(scale.scale * 100)}
            disabled={scale.mode !== "custom"}
            onChange={(event) => {
              const next = Number(event.target.value) / 100;
              if (Number.isFinite(next)) applyScale({ type: "scale", scale: next });
            }}
          />
          <span aria-label="現在の倍率">{Math.round(displayedScale * 100)}%</span>
        </label>
        <button
          className="viewer-icon-button"
          aria-label="前ページ"
          title="前ページへ移動"
          onClick={previous}
        >
          <span aria-hidden="true">◀</span>
        </button>
        <button
          className="viewer-icon-button"
          aria-label="次ページ"
          title="次ページへ移動"
          onClick={next}
        >
          <span aria-hidden="true">▶</span>
        </button>
        <button
          className="viewer-icon-button"
          aria-label="倍率を下げる"
          title="倍率を下げる"
          onClick={() => applyScale({ type: "zoomOut" })}
        >
          <span aria-hidden="true">−</span>
        </button>
        <button
          className="viewer-icon-button"
          aria-label="倍率を上げる"
          title="倍率を上げる"
          onClick={() => applyScale({ type: "zoomIn" })}
        >
          <span aria-hidden="true">＋</span>
        </button>
        <button
          className="viewer-icon-button"
          aria-label="ルーペ"
          title={scale.loupeEnabled ? "ルーペを無効にする" : "ルーペを有効にする"}
          aria-pressed={scale.loupeEnabled}
          onClick={() => applyScale({ type: "loupe", enabled: !scale.loupeEnabled })}
        >
          <span aria-hidden="true">⌕</span>
        </button>
        <button
          className="viewer-icon-button"
          aria-label={state.mode === "single" ? "見開きへ" : "単ページへ"}
          title={state.mode === "single" ? "見開き表示へ切り替え" : "単ページ表示へ切り替え"}
          onClick={() => changeMode(state.mode === "single" ? "spread" : "single")}
        >
          <span aria-hidden="true">{state.mode === "single" ? "▯▯" : "▯"}</span>
        </button>
        <button
          className="viewer-icon-button"
          aria-label="読み方向"
          title={state.direction === "rightToLeft"
            ? "読み方向を左開きへ切り替え"
            : "読み方向を右開きへ切り替え"}
          onClick={toggleDirection}
        >
          <span aria-hidden="true">⇄</span>
        </button>
        <button
          className="viewer-icon-button"
          type="button"
          aria-label="しおりを保存"
          title="現在のページをしおりに保存"
          onClick={() => onSaveBookmark?.(state.index)}
        >
          <span aria-hidden="true">★</span>
        </button>
        <button
          className="viewer-icon-button"
          type="button"
          aria-label="次のしおり"
          title="次のしおりへ移動"
          disabled={resolvedBookmarks.length === 0}
          onClick={jumpToNextBookmark}
        >
          <span aria-hidden="true">★→</span>
        </button>
        <button
          className="viewer-icon-button"
          type="button"
          aria-label="しおり一覧"
          title="しおり一覧を表示"
          disabled={bookmarks.length === 0}
          onClick={() => setBookmarkListOpen(true)}
        >
          <span aria-hidden="true">☷</span>
        </button>
        <button
          className="viewer-icon-button"
          type="button"
          aria-label={detached ? "画像表示を統合" : "画像表示を分離"}
          title={detached ? "画像表示をメイン画面へ統合" : "画像表示を別領域へ分離"}
          aria-pressed={detached}
          onClick={onToggleDetached}
        >
          <span aria-hidden="true">{detached ? "↙" : "↗"}</span>
        </button>
        <button
          ref={fullscreenButtonRef}
          className="viewer-icon-button"
          aria-label={fullscreen ? "全画面表示を終了" : "全画面表示"}
          title={fullscreen ? "全画面表示を終了" : "全画面表示へ切り替え"}
          aria-pressed={fullscreen}
          onClick={() => void requestFullscreen(!fullscreen)}
        >
          <span aria-hidden="true">{fullscreen ? "⊡" : "⛶"}</span>
        </button>
        <button
          className="viewer-icon-button"
          type="button"
          aria-label="一覧へ戻る"
          title="ビューワを閉じて一覧へ戻る"
          data-product-id="viewer-close"
          onClick={close}
        >
          <span aria-hidden="true">↩</span>
        </button>
        {fullscreenError !== null && (
          <span className="fullscreen-error" role="status">
            {fullscreenError}
          </span>
        )}
      </header>
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
        onPointerMove={(event) => {
          updateLoupe(event);
          const drag = pointerDragRef.current;
          if (!drag || drag.pointerId !== event.pointerId || !drag.pannable) return;
          const spread = spreadRef.current;
          if (!spread) return;
          const deltaX = event.clientX - drag.lastX;
          const deltaY = event.clientY - drag.lastY;
          if (Math.abs(event.clientX - drag.startX) >= 4 || Math.abs(event.clientY - drag.startY) >= 4) {
            setPanning(true);
          }
          spread.scrollLeft -= deltaX;
          spread.scrollTop -= deltaY;
          drag.lastX = event.clientX;
          drag.lastY = event.clientY;
          event.preventDefault();
        }}
        onPointerLeave={() => setLoupe(null)}
        onPointerDown={(event) => {
          if (event.button === 2) {
            rightButtonHeldRef.current = true;
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
          };
          if (pannable) event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerUp={(event) => {
          if (event.button === 2) {
            rightButtonHeldRef.current = false;
            event.preventDefault();
            return;
          }
          if (event.button !== 0) return;
          const drag = pointerDragRef.current;
          pointerDragRef.current = null;
          setPanning(false);
          if (!drag || drag.pointerId !== event.pointerId || drag.pannable) return;
          if (Math.abs(event.clientX - drag.startX) < 48) return;
          const action = event.clientX < drag.startX
            ? activeMouseGestures.swipeLeft
            : activeMouseGestures.swipeRight;
          applyMouseGesture(action);
        }}
        onPointerCancel={() => {
          rightButtonHeldRef.current = false;
          pointerDragRef.current = null;
          setPanning(false);
        }}
        onContextMenu={(event) => event.preventDefault()}
        onDoubleClick={() => void requestFullscreen(!fullscreen)}
        onWheel={(event) => {
          const rightWheel = rightButtonHeldRef.current || (event.buttons & 2) !== 0;
          if (rightWheel && event.deltaY !== 0) {
            event.preventDefault();
            applyMouseGesture(
              event.deltaY > 0
                ? activeMouseGestures.rightWheelDown
                : activeMouseGestures.rightWheelUp,
            );
          } else if (event.ctrlKey) {
            event.preventDefault();
            applyScale({ type: event.deltaY > 0 ? "zoomOut" : "zoomIn" });
          } else if (scrollLayout) {
            const spread = spreadRef.current;
            if (spread) {
              if (layoutMode === "horizontal_scroll") {
                const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
                  ? event.deltaX
                  : event.deltaY;
                spread.scrollLeft += delta;
              } else {
                spread.scrollLeft += event.deltaX;
                spread.scrollTop += event.deltaY;
              }
              event.preventDefault();
            }
          } else if (!scrollLayout && event.deltaY !== 0) {
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
          data-layout-mode={layoutMode}
          data-direction={state.direction}
          data-scale-mode={scale.mode}
          data-scale={scale.scale}
          data-page-count={scrollLayout ? session.pages.length : ordered.length}
          data-page-anchor={state.index}
          data-loupe-enabled={scale.loupeEnabled}
          style={{ "--viewer-custom-scale": scale.scale } as CSSProperties}
          onScroll={scheduleScrollAnchorUpdate}
        >
          {(scrollLayout ? scrollIndices : ordered).map((index) =>
            scrollLayout ? (
              <span key={session.pages[index].id} className="viewer-page-slot">
                {renderPage(index, true)}
              </span>
            ) : (
              <Fragment key={session.pages[index].id}>
                {renderPage(index)}
              </Fragment>
            ),
          )}
        </div>
        {scale.loupeEnabled && loupe && mediaUris[loupe.index] && (
          <div
            className="viewer-loupe"
            role="img"
            aria-label="ポインタ周辺ルーペ"
            style={
              {
                left: loupe.stageX,
                top: loupe.stageY,
                backgroundImage: `url("${mediaUris[loupe.index]}")`,
                backgroundSize: `${loupe.imageWidth * LOUPE_ZOOM}px ${loupe.imageHeight * LOUPE_ZOOM}px`,
                backgroundPosition: `${LOUPE_SIZE / 2 - loupe.imageX * LOUPE_ZOOM}px ${LOUPE_SIZE / 2 - loupe.imageY * LOUPE_ZOOM}px`,
              } as CSSProperties
            }
          />
        )}
        {!scrollLayout && nextVisible.map((index) => mediaUris[index] && (
          <img
            key={session.pages[index].id}
            className="prefetch-page"
            src={mediaUris[index]}
            alt=""
            aria-hidden="true"
            onLoad={(event) => {
              setReadyPages((current) => new Set(current).add(index));
              if (event.currentTarget.naturalWidth > event.currentTarget.naturalHeight) {
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
      </nav>
    </section>
  );
}
