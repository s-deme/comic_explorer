import { useEffect, useMemo, useReducer, useRef, useState } from "react";
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
} from "./model";

interface ViewerProps {
  session: ViewerSession;
  generation: number;
  onClose: () => void;
  onNextItem?: () => void;
  initialMode: ViewMode;
  initialDirection: ReadingDirection;
  onSettingsChange: (mode: ViewMode, direction: ReadingDirection) => void;
  initialScaleMode?: ScaleMode;
  initialScale?: number;
  initialLoupeEnabled?: boolean;
  onScaleChange?: (scale: ViewerScaleState) => void;
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
  initialDirection,
  onSettingsChange,
  initialScaleMode = "fit",
  initialScale = 1,
  initialLoupeEnabled = false,
  onScaleChange,
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
  const [loupe, setLoupe] = useState<LoupeState | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const visible = useMemo(
    () => visibleIndices(state, session.pages.length, landscape),
    [landscape, session.pages.length, state],
  );

  useEffect(() => {
    const wanted = [...visible];
    const nextIndex = state.index + Math.max(1, visible.length);
    if (nextIndex < session.pages.length) wanted.push(nextIndex);
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
  }, [generation, imageErrors, mediaUris, session, state.index, visible]);

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

  function close() {
    void saveReadingPosition(session, state.index, generation).finally(onClose);
  }

  function changeMode(mode: ViewMode) {
    dispatch({ type: "mode", mode });
    onSettingsChange(mode, state.direction);
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
    const timer = window.setTimeout(() => {
      void saveReadingPosition(session, state.index, generation);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [generation, session, state.index]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      else if (
        event.key === "PageDown" ||
        event.key === " " ||
        (event.key === "ArrowLeft" && state.direction === "rightToLeft") ||
        (event.key === "ArrowRight" && state.direction === "leftToRight")
      ) {
        event.preventDefault();
        next();
      } else if (
        event.key === "PageUp" ||
        (event.key === "ArrowRight" && state.direction === "rightToLeft") ||
        (event.key === "ArrowLeft" && state.direction === "leftToRight")
      ) {
        event.preventDefault();
        dispatch({ type: "previous" });
      } else if (event.key === "1") changeMode("single");
      else if (event.key === "2") changeMode("spread");
      else if (event.key.toLowerCase() === "r") toggleDirection();
      else if (event.key === "+" || event.key === "=") applyScale({ type: "zoomIn" });
      else if (event.key === "-" || event.key === "_") applyScale({ type: "zoomOut" });
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

  return (
    <section className="viewer" aria-label={`${session.displayName} ビューワ`}>
      <header className="viewer-toolbar">
        <strong>{session.displayName}</strong>
        <span>{state.mode === "single" ? "単ページ" : "見開き"}</span>
        <span>{state.direction === "rightToLeft" ? "右開き" : "左開き"}</span>
        <span>{progress}</span>
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
        <button onClick={close}>一覧へ戻る</button>
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
          } else if (event.deltaY > 0) next();
          else if (event.deltaY < 0) dispatch({ type: "previous" });
        }}
      >
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
        <div
          className="page-spread"
          data-direction={state.direction}
          data-scale-mode={scale.mode}
          data-scale={scale.scale}
          data-page-count={ordered.length}
          data-loupe-enabled={scale.loupeEnabled}
          style={{ "--viewer-custom-scale": scale.scale } as CSSProperties}
        >
          {ordered.map((index) =>
            imageErrors.has(index) ? (
              <div className="page-error" role="alert" key={session.pages[index].id}>
                <h2>画像を読み込めません</h2>
                <p>{session.pages[index].relativePath}</p>
                <button onClick={() => dispatch({ type: "previous" })}>前ページ</button>
                <button onClick={next}>次ページ</button>
                <button onClick={close}>一覧へ戻る</button>
              </div>
            ) : mediaUris[index] ? (
              <img
                key={session.pages[index].id}
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
            ) : <p role="status" key={session.pages[index].id}>ページを読み込んでいます。</p>,
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
        {mediaUris[state.index + visible.length] && (
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
