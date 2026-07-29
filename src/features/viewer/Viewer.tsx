import { useEffect, useMemo, useReducer, useState } from "react";
import {
  saveReadingPosition,
  type ViewerSession,
} from "../library/client";
import {
  viewerReducer,
  visibleIndices,
  type ReadingDirection,
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
}

export function Viewer({
  session,
  generation,
  onClose,
  onNextItem,
  initialMode,
  initialDirection,
  onSettingsChange,
}: ViewerProps) {
  const [state, dispatch] = useReducer(viewerReducer, {
    index: session.startIndex,
    mode: initialMode,
    direction: initialDirection,
    history: [],
  });
  const [landscape, setLandscape] = useState<Set<number>>(new Set());
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const visible = useMemo(
    () => visibleIndices(state, session.pages.length, landscape),
    [landscape, session.pages.length, state],
  );

  function next() {
    if (state.index + Math.max(1, visible.length) >= session.pages.length) {
      onNextItem?.();
      return;
    }
    dispatch({
      type: "next",
      pageCount: session.pages.length,
      landscape,
    });
  }

  function close() {
    void saveReadingPosition(session, state.index, generation);
    onClose();
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
        className="viewer-stage"
        onWheel={(event) => {
          if (event.deltaY > 0) next();
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
        <div className="page-spread" data-direction={state.direction}>
          {ordered.map((index) =>
            imageErrors.has(index) ? (
              <div className="page-error" role="alert" key={session.pages[index].id}>
                <h2>画像を読み込めません</h2>
                <p>{session.pages[index].relativePath}</p>
                <button onClick={() => dispatch({ type: "previous" })}>前ページ</button>
                <button onClick={next}>次ページ</button>
                <button onClick={close}>一覧へ戻る</button>
              </div>
            ) : (
              <img
                key={session.pages[index].id}
                src={session.pages[index].mediaUri}
                alt={`${session.displayName} ${index + 1}ページ`}
                onLoad={(event) => {
                  if (event.currentTarget.naturalWidth > event.currentTarget.naturalHeight) {
                    setLandscape((current) => new Set(current).add(index));
                  }
                }}
                onError={() => setImageErrors((current) => new Set(current).add(index))}
              />
            ),
          )}
        </div>
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
        {session.pages[state.index + visible.length] && (
          <img
            className="prefetch-page"
            src={session.pages[state.index + visible.length].mediaUri}
            alt=""
            aria-hidden="true"
          />
        )}
      </div>
    </section>
  );
}
