import { Fragment, useEffect, useMemo, useReducer, useRef, useState } from "react";
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
  normalizeShortcutBindings,
  type ShortcutBindings,
} from "../input/shortcuts";

interface ViewerProps {
  session: ViewerSession;
  generation: number;
  onClose: () => void;
  onNextItem?: () => void;
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

export function Viewer({
  session,
  generation,
  onClose,
  onNextItem,
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
}: ViewerProps) {
  const [state, dispatch] = useReducer(viewerReducer, {
    index: session.startIndex,
    mode: initialMode,
    direction: initialDirection,
    history: [],
  });
  const [landscape, setLandscape] = useState<Set<number>>(new Set());
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [mediaUris, setMediaUris] = useState<Record<number, string>>(() =>
    Object.fromEntries(session.pages.flatMap((page, index) => page.mediaUri ? [[index, page.mediaUri]] : [])),
  );
  const [scale, setScale] = useState<ViewerScaleState>(() =>
    createViewerScaleState(initialScaleMode, initialScale, initialLoupeEnabled),
  );
  const [layoutMode, setLayoutMode] =
    useState<ViewerLayoutMode>(initialLayoutMode);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [loupe, setLoupe] = useState<LoupeState | null>(null);
  const activeShortcuts = useMemo(
    () => normalizeShortcutBindings(shortcuts),
    [shortcuts],
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const layoutInitialized = useRef(false);
  const visible = useMemo(
    () => visibleIndices(state, session.pages.length, landscape),
    [landscape, session.pages.length, state],
  );

  useEffect(() => {
    const wanted =
      layoutMode === "paged"
        ? [...visible]
        : session.pages.map((_, index) => index);
    const nextIndex = state.index + Math.max(1, visible.length);
    if (layoutMode === "paged" && nextIndex < session.pages.length) {
      wanted.push(nextIndex);
    }
    wanted.forEach((index) => {
      if (mediaUris[index] || imageErrors.has(index)) return;
      void loadPage(session, index, generation, visible.includes(index) ? "visible" : "near")
        .then((response) => {
          if (response.status === "ok" && response.generation === generation) {
            setMediaUris((current) => ({ ...current, [index]: response.data.mediaUri }));
          } else if (response.status === "error") {
            setImageErrors((current) => new Set(current).add(index));
          }
        })
        .catch(() => setImageErrors((current) => new Set(current).add(index)));
    });
  }, [generation, imageErrors, layoutMode, mediaUris, session, state.index, visible]);

  function next() {
    if (state.index + Math.max(1, visible.length) >= session.pages.length) {
      void saveReadingPosition(session, state.index, generation).finally(() =>
        onNextItem?.(),
      );
      return;
    }
    dispatch({
      type: "next",
      pageCount: session.pages.length,
      landscape,
    });
  }

  async function requestFullscreen(next: boolean): Promise<boolean> {
    setFullscreenError(null);
    try {
      if (next) await fullscreenAdapter.enter();
      else await fullscreenAdapter.exit();
      setFullscreen(next);
      requestAnimationFrame(() => fullscreenButtonRef.current?.focus());
      return true;
    } catch {
      setFullscreenError("全画面表示を切り替えられません。もう一度お試しください。");
      return false;
    }
  }

  async function close() {
    if (fullscreen && !(await requestFullscreen(false))) return;
    await saveReadingPosition(session, state.index, generation);
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

  function applyScale(action: ViewerScaleAction) {
    const next = scaleReducer(scale, action);
    setScale(next);
    onScaleChange?.(next);
    if (!next.loupeEnabled) setLoupe(null);
  }

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
    if (!layoutInitialized.current) {
      layoutInitialized.current = true;
      return;
    }
    if (layoutMode === "paged") return;
    const anchor = stageRef.current?.querySelector<HTMLElement>(
      `[data-page-index="${state.index}"].viewer-page`,
    );
    if (!anchor) return;
    anchor.focus({ preventScroll: true });
    anchor.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [layoutMode, state.index]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void saveReadingPosition(session, state.index, generation);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [generation, session, state.index]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const command =
        customShortcutCommand(event, activeShortcuts) ??
        fallbackShortcutCommand(event, state.direction);
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
          dispatch({ type: "previous" });
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
  const scrollIndices = session.pages.map((_, index) => index);
  const renderPage = (index: number, withAnchor = false) => {
    const page = session.pages[index];
    const content = imageErrors.has(index) ? (
      <div className="page-error" role="alert">
        <h2>画像を読み込めません</h2>
        <p>{page.relativePath}</p>
        <button onClick={() => dispatch({ type: "previous" })}>前ページ</button>
        <button onClick={next}>次ページ</button>
        <button onClick={close}>一覧へ戻る</button>
      </div>
    ) : mediaUris[index] ? (
      <img
        src={mediaUris[index]}
        alt={`${session.displayName} ${index + 1}ページ`}
        data-page-index={index}
        onLoad={(event) => {
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
    >
      <header className="viewer-toolbar">
        <strong>{session.displayName}</strong>
        <span>{state.mode === "single" ? "単ページ" : "見開き"}</span>
        <span>{state.direction === "rightToLeft" ? "右開き" : "左開き"}</span>
        <span>{progress}</span>
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
            aria-label="任意倍率"
            type="number"
            min="0.25"
            max="4"
            step="0.1"
            value={scale.scale}
            disabled={scale.mode !== "custom"}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) applyScale({ type: "scale", scale: next });
            }}
          />
          <span aria-label="現在の倍率">{Math.round(scale.scale * 100)}%</span>
        </label>
        <button
          aria-label="倍率を下げる"
          onClick={() => applyScale({ type: "zoomOut" })}
        >
          −
        </button>
        <button
          aria-label="倍率を上げる"
          onClick={() => applyScale({ type: "zoomIn" })}
        >
          ＋
        </button>
        <button
          aria-label="ルーペ"
          aria-pressed={scale.loupeEnabled}
          onClick={() => applyScale({ type: "loupe", enabled: !scale.loupeEnabled })}
        >
          ルーペ {scale.loupeEnabled ? "オン" : "オフ"}
        </button>
        <button
          onClick={() => changeMode(state.mode === "single" ? "spread" : "single")}
        >
          {state.mode === "single" ? "見開きへ" : "単ページへ"}
        </button>
        <button onClick={toggleDirection}>
          読み方向
        </button>
        <button
          ref={fullscreenButtonRef}
          aria-label={fullscreen ? "全画面表示を終了" : "全画面表示"}
          aria-pressed={fullscreen}
          onClick={() => void requestFullscreen(!fullscreen)}
        >
          {fullscreen ? "全画面終了" : "全画面"}
        </button>
        <button onClick={close}>一覧へ戻る</button>
        {fullscreenError !== null && (
          <span className="fullscreen-error" role="status">
            {fullscreenError}
          </span>
        )}
      </header>
      <div
        ref={stageRef}
        className="viewer-stage"
        onPointerMove={updateLoupe}
        onPointerLeave={() => setLoupe(null)}
        onWheel={(event) => {
          if (event.ctrlKey) {
            event.preventDefault();
            applyScale({ type: event.deltaY > 0 ? "zoomOut" : "zoomIn" });
          } else if (!scrollLayout) {
            if (event.deltaY > 0) next();
            else if (event.deltaY < 0) dispatch({ type: "previous" });
          }
        }}
      >
        {!scrollLayout && (
          <button
            className="page-zone page-zone-left"
            aria-label={
              state.direction === "rightToLeft" ? "次ページ" : "前ページ"
            }
            onClick={() =>
              state.direction === "rightToLeft"
                ? next()
                : dispatch({ type: "previous" })
            }
          />
        )}
        <div
          className="page-spread"
          data-layout-mode={layoutMode}
          data-direction={state.direction}
          data-scale-mode={scale.mode}
          data-scale={scale.scale}
          data-page-count={scrollLayout ? session.pages.length : ordered.length}
          data-page-anchor={state.index}
          data-loupe-enabled={scale.loupeEnabled}
          style={{ "--viewer-custom-scale": scale.scale } as CSSProperties}
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
        {!scrollLayout && (
          <button
            className="page-zone page-zone-right"
            aria-label={
              state.direction === "rightToLeft" ? "前ページ" : "次ページ"
            }
            onClick={() =>
              state.direction === "rightToLeft"
                ? dispatch({ type: "previous" })
                : next()
            }
          />
        )}
        {!scrollLayout && mediaUris[state.index + visible.length] && (
          <img
            className="prefetch-page"
            src={mediaUris[state.index + visible.length]}
            alt=""
            aria-hidden="true"
          />
        )}
      </div>
    </section>
  );
}
