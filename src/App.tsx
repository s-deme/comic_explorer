import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { CatalogGrid } from "./features/catalog/CatalogGrid";
import {
  navigationReducer,
  parentPath,
} from "./features/navigation/navigation";
import {
  listFolder,
  getCatalogSettings,
  getThumbnail,
  openComic,
  pickLibraryRoot,
  registerLibraryRoot,
  restoreLibraryRoot,
  saveCatalogSort,
  saveViewerSettings,
  type ViewerSession,
} from "./features/library/client";
import {
  nextComicEntry,
  sortCatalogEntries,
  type SortField,
} from "./features/catalog/sort";
import { Viewer } from "./features/viewer/Viewer";
import type { ReadingDirection, ViewMode } from "./features/viewer/model";
import { FolderTree } from "./features/navigation/FolderTree";
import type { CatalogEntry } from "./types/domain";
import type { ThumbnailViewState } from "./features/catalog/CatalogGrid";

type LoadState =
  | { status: "idle" }
  | { status: "loading"; path: string }
  | { status: "error"; path: string; message: string }
  | { status: "ready" };

export function App() {
  const generation = useRef(0);
  const viewerGeneration = useRef(0);
  const thumbnailRequests = useRef(new Set<string>());
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const [rootInput, setRootInput] = useState("");
  const [libraryRoot, setLibraryRoot] = useState<string | null>(null);
  const [navigation, dispatch] = useReducer(navigationReducer, {
    current: "",
    back: [],
    forward: [],
  });
  const [addressInput, setAddressInput] = useState("");
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, ThumbnailViewState>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDescending, setSortDescending] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [readingDirection, setReadingDirection] =
    useState<ReadingDirection>("rightToLeft");
  const [helpOpen, setHelpOpen] = useState(false);
  const [treeWidth, setTreeWidth] = useState(240);
  const [restoring, setRestoring] = useState(true);
  const [viewerSession, setViewerSession] = useState<ViewerSession | null>(null);

  useEffect(() => {
    const settingsGeneration = generation.current + 1;
    void getCatalogSettings(settingsGeneration)
      .then((response) => {
        if (response.status === "ok") {
          setSortField(response.data.sortField);
          setSortDescending(response.data.sortDescending);
          setViewMode(response.data.viewMode);
          setReadingDirection(response.data.readingDirection);
        }
      })
      .catch(() => undefined);
    generation.current += 1;
    const requestGeneration = generation.current;
    void restoreLibraryRoot(requestGeneration)
      .then(async (response) => {
        if (
          requestGeneration === generation.current &&
          response.status === "ok" &&
          response.data
        ) {
          setLibraryRoot(response.data.absolutePath);
          dispatch({ type: "reset", path: "" });
          await load("");
        }
      })
      .catch(() => undefined)
      .finally(() => setRestoring(false));
  }, []);

  const absoluteAddress = useMemo(() => {
    if (libraryRoot === null || navigation.current === "") {
      return libraryRoot ?? "";
    }
    return `${libraryRoot.replace(/[\\/]+$/, "")}\\${navigation.current.replaceAll("/", "\\")}`;
  }, [libraryRoot, navigation.current]);

  useEffect(() => setAddressInput(absoluteAddress), [absoluteAddress]);

  const sortedEntries = useMemo(
    () =>
      sortCatalogEntries(
        entries,
        sortField,
        sortDescending ? "descending" : "ascending",
      ),
    [entries, sortDescending, sortField],
  );

  useEffect(() => {
    const requestGeneration = generation.current;
    sortedEntries.forEach((entry, index) => {
      if (entry.kind !== "archive" && entry.kind !== "comicFolder") return;
      const priority =
        index < 15 ? "visible" : index < 40 ? "near" : "background";
      queueThumbnail(entry, requestGeneration, priority);
    });
  }, [sortedEntries]);

  async function load(relativePath: string) {
    generation.current += 1;
    const requestGeneration = generation.current;
    setLoadState({ status: "loading", path: relativePath });
    setSelectedPath(null);
    setThumbnails({});
    thumbnailRequests.current.clear();
    try {
      const response = await listFolder(relativePath, requestGeneration);
      if (requestGeneration !== generation.current) return;
      if (response.status === "ok") {
        setEntries(response.data);
        setLoadState({ status: "ready" });
      } else if (response.status === "error") {
        setLoadState({
          status: "error",
          path: relativePath,
          message: response.error.message,
        });
      }
    } catch (error) {
      if (requestGeneration === generation.current) {
        setLoadState({
          status: "error",
          path: relativePath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async function chooseRoot(event: React.FormEvent) {
    event.preventDefault();
    generation.current += 1;
    const response = await registerLibraryRoot(rootInput, generation.current);
    if (response.status === "ok") {
      setLibraryRoot(response.data.absolutePath);
      dispatch({ type: "reset", path: "" });
      await load("");
    } else if (response.status === "error") {
      setLoadState({ status: "error", path: rootInput, message: response.error.message });
    }
  }

  async function chooseRootWithPicker() {
    generation.current += 1;
    const response = await pickLibraryRoot(generation.current);
    if (response.status === "ok" && response.data) {
      setRootInput(response.data.absolutePath);
      setLibraryRoot(response.data.absolutePath);
      dispatch({ type: "reset", path: "" });
      await load("");
    } else if (response.status === "error") {
      setLoadState({
        status: "error",
        path: rootInput,
        message: response.error.message,
      });
    }
  }

  function navigate(path: string, history: "push" | "back" | "forward" = "push") {
    if (history === "push") dispatch({ type: "navigate", path });
    else dispatch({ type: history });
    void load(path);
  }

  function closeHelp() {
    setHelpOpen(false);
    requestAnimationFrame(() => helpTriggerRef.current?.focus());
  }

  function queueThumbnail(
    entry: CatalogEntry,
    requestGeneration: number,
    priority: "visible" | "near" | "background",
  ) {
    if (thumbnailRequests.current.has(entry.relativePath)) return;
    thumbnailRequests.current.add(entry.relativePath);
    setThumbnails((current) => ({
      ...current,
      [entry.relativePath]: { status: "loading" },
    }));
    void getThumbnail(entry.relativePath, requestGeneration, false, priority)
      .then((response) => {
        if (requestGeneration !== generation.current) return;
        if (response.status === "cancelled") {
          setThumbnails((current) => {
            const next = { ...current };
            delete next[entry.relativePath];
            return next;
          });
          return;
        }
        setThumbnails((current) => ({
          ...current,
          [entry.relativePath]:
            response.status === "ok"
              ? {
                  status: "ready",
                  mediaUri: response.data.mediaUri,
                  cacheHit: response.data.cacheHit,
                }
              : { status: "error" },
        }));
      })
      .catch(() => {
        if (requestGeneration === generation.current) {
          setThumbnails((current) => ({
            ...current,
            [entry.relativePath]: { status: "error" },
          }));
        }
      })
      .finally(() => thumbnailRequests.current.delete(entry.relativePath));
  }

  if (libraryRoot === null) {
    return (
      <main className="setup-screen">
        <div className="setup-card">
          <h1>Comic Explorer</h1>
          <p>漫画を保存しているローカルフォルダを登録してください。</p>
          {restoring && <p role="status">保存した設定を確認しています。</p>}
          <form onSubmit={chooseRoot}>
            <label htmlFor="library-root">ライブラリルート</label>
            <div className="setup-row">
              <input
                id="library-root"
                value={rootInput}
                onChange={(event) => setRootInput(event.target.value)}
                placeholder="C:\Comics"
                required
              />
              <button type="submit">登録</button>
            </div>
          </form>
          <button className="picker-button" type="button" onClick={() => void chooseRootWithPicker()}>
            フォルダを選択
          </button>
          {loadState.status === "error" && (
            <p role="alert">{loadState.message}</p>
          )}
        </div>
      </main>
    );
  }

  const selected = entries.find(
    (entry) => entry.relativePath === selectedPath,
  );
  const up = parentPath(navigation.current);

  function changeSort(nextField: SortField, nextDescending: boolean) {
    setSortField(nextField);
    setSortDescending(nextDescending);
    generation.current += 1;
    void saveCatalogSort(
      { sortField: nextField, sortDescending: nextDescending },
      generation.current,
    ).catch(() => undefined);
  }

  if (viewerSession !== null) {
    return (
      <Viewer
        session={viewerSession}
        generation={viewerGeneration.current}
        initialMode={viewMode}
        initialDirection={readingDirection}
        onSettingsChange={(mode, direction) => {
          setViewMode(mode);
          setReadingDirection(direction);
          void saveViewerSettings(
            { viewMode: mode, readingDirection: direction },
            generation.current,
          );
        }}
        onClose={() => setViewerSession(null)}
        onNextItem={() => {
          const next = nextComicEntry(sortedEntries, viewerSession.itemKey);
          if (next) {
            viewerGeneration.current += 1;
            void openComic(next.relativePath, viewerGeneration.current).then(
              (response) =>
                response.status === "ok" && setViewerSession(response.data),
            );
          }
        }}
      />
    );
  }

  return (
    <main className="app-shell">
      <nav className="menu-bar" aria-label="メニューバー">
        <button onClick={() => setLibraryRoot(null)}>ファイル</button>
        <button onClick={() => changeSort(sortField, !sortDescending)}>表示</button>
        <button ref={helpTriggerRef} onClick={() => setHelpOpen(true)}>ヘルプ</button>
      </nav>
      <div className="toolbar" aria-label="ナビゲーション">
        <button
          disabled={navigation.back.length === 0}
          onClick={() => {
            const target = navigation.back.at(-1);
            if (target !== undefined) navigate(target, "back");
          }}
          title="戻る"
        >
          ←
        </button>
        <button
          disabled={navigation.forward.length === 0}
          onClick={() => {
            const target = navigation.forward[0];
            if (target !== undefined) navigate(target, "forward");
          }}
          title="進む"
        >
          →
        </button>
        <button
          disabled={up === null}
          onClick={() => up !== null && navigate(up)}
          title="上へ"
        >
          ↑
        </button>
        <label>
          並べ替え
          <select
            aria-label="並べ替え条件"
            value={sortField}
            onChange={(event) =>
              changeSort(event.target.value as SortField, sortDescending)
            }
          >
            <option value="name">名前</option>
            <option value="modified">更新日時</option>
            <option value="size">サイズ</option>
            <option value="kind">種類</option>
          </select>
        </label>
        <button
          onClick={() => {
            changeSort(sortField, !sortDescending);
          }}
        >
          {sortDescending ? "降順 ▼" : "昇順 ▲"}
        </button>
      </div>
      <form
        className="address-bar"
        onSubmit={(event) => {
          event.preventDefault();
          const root = libraryRoot.replace(/[\\/]+$/, "");
          if (!addressInput.toLowerCase().startsWith(root.toLowerCase())) {
            setLoadState({
              status: "error",
              path: addressInput,
              message: "ライブラリルート外へは移動できません。",
            });
            return;
          }
          const relative = addressInput
            .slice(root.length)
            .replace(/^[\\/]+/, "")
            .replaceAll("\\", "/");
          navigate(relative);
        }}
      >
        <label htmlFor="address">アドレス</label>
        <input
          id="address"
          value={addressInput}
          onChange={(event) => setAddressInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setAddressInput(absoluteAddress);
          }}
        />
        <button type="submit">移動</button>
      </form>
      <div
        className="workspace"
        style={{ gridTemplateColumns: `${treeWidth}px 6px minmax(0, 1fr)` }}
      >
        <FolderTree
          libraryRoot={libraryRoot}
          currentPath={navigation.current}
          onNavigate={(path) => navigate(path)}
        />
        <div
          className="tree-splitter"
          role="separator"
          aria-label="フォルダツリーの幅"
          aria-orientation="vertical"
          aria-valuemin={180}
          aria-valuenow={treeWidth}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              setTreeWidth((width) =>
                Math.max(180, width + (event.key === "ArrowLeft" ? -10 : 10)),
              );
            }
          }}
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              setTreeWidth(Math.max(180, event.clientX));
            }
          }}
        />
        <section className="catalog-pane" aria-busy={loadState.status === "loading"}>
          {loadState.status === "loading" && (
            <p className="loading-state" role="status">
              読み込み中: {loadState.path || libraryRoot}
            </p>
          )}
          {loadState.status === "error" ? (
            <div className="error-panel" role="alert">
              <h2>読み込みに失敗しました</h2>
              <p>対象: {loadState.path}</p>
              <p>{loadState.message}</p>
              <button onClick={() => void load(navigation.current)}>再試行</button>
              {up !== null && <button onClick={() => navigate(up)}>親フォルダへ</button>}
              <button onClick={() => void chooseRootWithPicker()}>別のフォルダを選択</button>
            </div>
          ) : (
            <CatalogGrid
              entries={sortedEntries}
              selectedPath={selectedPath}
              onSelect={(entry) => setSelectedPath(entry.relativePath)}
              onNavigate={(entry) => navigate(entry.relativePath)}
              onRead={(entry) => {
                viewerGeneration.current += 1;
                const requestGeneration = viewerGeneration.current;
                setLoadState({ status: "loading", path: entry.relativePath });
                void openComic(entry.relativePath, requestGeneration).then(
                  (response) => {
                    if (response.status === "ok") {
                      setViewerSession(response.data);
                      setLoadState({ status: "ready" });
                    } else if (response.status === "error") {
                      setLoadState({
                        status: "error",
                        path: entry.relativePath,
                        message: response.error.message,
                      });
                    }
                  },
                );
              }}
              thumbnailFor={(entry) =>
                thumbnails[entry.relativePath] ?? { status: "loading" }
              }
              onThumbnailNeeded={(entry) => {
                if (thumbnails[entry.relativePath]?.status === "ready") return;
                queueThumbnail(entry, generation.current, "visible");
              }}
            />
          )}
        </section>
      </div>
      <footer className="status-bar" aria-live="polite">
        <span>{entries.length}項目</span>
        <span>{selected ? `選択: ${selected.relativePath}` : "選択なし"}</span>
        <span>{loadState.status === "loading" ? "読み込み中" : "準備完了"}</span>
      </footer>
      {helpOpen && (
        <div className="dialog-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            className="help-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeHelp();
            }}
          >
            <h2 id="help-title">キー操作</h2>
            <p>Enter: フォルダを開く / Ctrl+Enter: 漫画として読む</p>
            <p>Esc: アドレス編集を戻す / 矢印: 項目を移動</p>
            <button autoFocus onClick={closeHelp}>閉じる</button>
          </div>
        </div>
      )}
    </main>
  );
}
