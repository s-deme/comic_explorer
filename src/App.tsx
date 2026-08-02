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
  saveCatalogViewMode,
  saveEndOfVolumePolicy,
  saveViewerSettings,
  searchLibrary,
  takeRecoveryNotice,
  addFavorite,
  listFavorites,
  removeFavorite,
  resolveFavorite,
  type CatalogSettings,
  type FavoriteEntry,
  type ViewerSession,
} from "./features/library/client";
import {
  sortCatalogEntries,
  type SortField,
} from "./features/catalog/sort";
import {
  END_OF_VOLUME_POLICY_LABELS,
  normalizeEndOfVolumePolicy,
  resolveEndOfVolume,
  type EndOfVolumeDecision,
  type EndOfVolumePolicy,
} from "./features/catalog/end-of-volume";
import { Viewer } from "./features/viewer/Viewer";
import type { FullscreenAdapter } from "./features/viewer/fullscreen";
import type {
  ReadingDirection,
  ScaleMode,
  ViewMode,
  ViewerScaleState,
  ViewerLayoutMode,
} from "./features/viewer/model";
import {
  normalizeViewerLayoutMode,
  VIEWER_LAYOUT_MODE_LABELS,
  VIEWER_LAYOUT_MODES,
} from "./features/viewer/model";
import { FolderTree } from "./features/navigation/FolderTree";
import type { CatalogEntry } from "./types/domain";
import type { ThumbnailViewState } from "./features/catalog/CatalogGrid";
import {
  CATALOG_VIEW_MODE_LABELS,
  CATALOG_VIEW_MODES,
  DEFAULT_CATALOG_VIEW_MODE,
  normalizeCatalogViewMode,
  type CatalogViewMode,
} from "./features/catalog/view-mode";
import { QuickAccess } from "./features/catalog/QuickAccess";
import {
  presentError,
  presentUnexpectedError,
} from "./features/errors/presentation";

type LoadState =
  | { status: "idle" }
  | { status: "loading"; path: string }
  | { status: "error"; path: string; message: string }
  | { status: "ready" };

type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "ready"; query: string; results: CatalogEntry[] }
  | { status: "error"; query: string; message: string };

interface AppProps {
  fullscreenAdapter?: FullscreenAdapter;
}

function entryDisplayName(entry: CatalogEntry): string {
  return entry.relativePath.split("/").at(-1) ?? entry.relativePath;
}

function entryKindLabel(entry: CatalogEntry): string {
  switch (entry.kind) {
    case "folder":
      return "フォルダ";
    case "comicFolder":
      return "漫画フォルダ";
    case "archive":
      return "ZIP / CBZ";
    case "page":
      return "画像";
    default:
      return "未対応";
  }
}

export function App({ fullscreenAdapter }: AppProps = {}) {
  const generation = useRef(0);
  const viewerGeneration = useRef(0);
  const settingsGeneration = useRef(0);
  const favoriteGeneration = useRef(0);
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
  const [catalogViewMode, setCatalogViewMode] = useState<CatalogViewMode>(
    DEFAULT_CATALOG_VIEW_MODE,
  );
  const [endOfVolumePolicy, setEndOfVolumePolicy] =
    useState<EndOfVolumePolicy>("auto_next");
  const endOfVolumePolicyRef = useRef<EndOfVolumePolicy>("auto_next");
  const [endOfVolumeNotice, setEndOfVolumeNotice] = useState<string | null>(null);
  const [pendingEndOfVolume, setPendingEndOfVolume] =
    useState<Extract<EndOfVolumeDecision, { kind: "confirm" }> | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [layoutMode, setLayoutMode] = useState<ViewerLayoutMode>("paged");
  const [readingDirection, setReadingDirection] =
    useState<ReadingDirection>("rightToLeft");
  const [viewerScaleMode, setViewerScaleMode] = useState<ScaleMode>("fit");
  const [viewerScale, setViewerScale] = useState(1);
  const [loupeEnabled, setLoupeEnabled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [treeWidth, setTreeWidth] = useState(240);
  const [restoring, setRestoring] = useState(true);
  const [viewerSession, setViewerSession] = useState<ViewerSession | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle" });
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null);

  useEffect(() => {
    settingsGeneration.current += 1;
    const settingsRequestGeneration = settingsGeneration.current;
    void getCatalogSettings(settingsRequestGeneration)
      .then((response) => {
        if (settingsRequestGeneration !== settingsGeneration.current) return;
        if (response.status === "ok") {
          setSortField(response.data.sortField);
          setSortDescending(response.data.sortDescending);
          setCatalogViewMode(
            normalizeCatalogViewMode(response.data.catalogViewMode),
          );
          const restoredEndOfVolumePolicy = normalizeEndOfVolumePolicy(
            response.data.endOfVolumePolicy,
          );
          endOfVolumePolicyRef.current = restoredEndOfVolumePolicy;
          setEndOfVolumePolicy(restoredEndOfVolumePolicy);
          setViewMode(response.data.viewMode);
          setLayoutMode(normalizeViewerLayoutMode(response.data.layoutMode));
          setReadingDirection(response.data.readingDirection);
          setViewerScaleMode(response.data.scaleMode);
          setViewerScale(response.data.scale);
          setLoupeEnabled(response.data.loupeEnabled);
        }
      })
      .catch(() => undefined);
    void takeRecoveryNotice(settingsGeneration.current)
      .then((response) => {
        if (response.status === "ok") setRecoveryNotice(response.data);
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
      if (thumbnails[entry.relativePath] !== undefined) return;
      const priority =
        index < 15 ? "visible" : index < 40 ? "near" : "background";
      queueThumbnail(entry, requestGeneration, priority);
    });
  }, [sortedEntries, thumbnails]);

  async function load(relativePath: string, selectionPath: string | null = null) {
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
        setSelectedPath(selectionPath);
        setLoadState({ status: "ready" });
      } else if (response.status === "error") {
        setLoadState({
          status: "error",
          path: relativePath,
          message: presentError(response.error),
        });
      }
    } catch {
      if (requestGeneration === generation.current) {
        setLoadState({
          status: "error",
          path: relativePath,
          message: presentUnexpectedError(),
        });
      }
    }
  }

  async function chooseRoot(event: React.FormEvent) {
    event.preventDefault();
    clearSearch();
    generation.current += 1;
    const response = await registerLibraryRoot(rootInput, generation.current);
    if (response.status === "ok") {
      setLibraryRoot(response.data.absolutePath);
      dispatch({ type: "reset", path: "" });
      await load("");
    } else if (response.status === "error") {
      setLoadState({ status: "error", path: rootInput, message: presentError(response.error) });
    }
  }

  async function chooseRootWithPicker() {
    clearSearch();
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
        message: presentError(response.error),
      });
    }
  }

  function navigate(
    path: string,
    history: "push" | "back" | "forward" = "push",
    selectionPath: string | null = null,
  ) {
    setSearchState({ status: "idle" });
    if (history === "push") dispatch({ type: "navigate", path });
    else dispatch({ type: history });
    void load(path, selectionPath);
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchState({ status: "idle" });
  }

  async function refreshFavorites() {
    const requestGeneration = ++favoriteGeneration.current;
    setFavoritesLoading(true);
    setFavoriteNotice(null);
    try {
      const response = await listFavorites(requestGeneration);
      if (requestGeneration !== favoriteGeneration.current) return;
      if (response.status === "ok") {
        setFavorites(response.data);
      } else if (response.status === "error") {
        setFavoriteNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === favoriteGeneration.current) {
        setFavoriteNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === favoriteGeneration.current) {
        setFavoritesLoading(false);
      }
    }
  }

  async function applyFavoriteOperation(
    operation: Promise<Awaited<ReturnType<typeof listFavorites>>>,
  ) {
    const requestGeneration = favoriteGeneration.current;
    setFavoriteNotice(null);
    try {
      const response = await operation;
      if (requestGeneration !== favoriteGeneration.current) return;
      if (response.status === "ok") {
        setFavorites(response.data);
      } else if (response.status === "error") {
        setFavoriteNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === favoriteGeneration.current) {
        setFavoriteNotice(presentUnexpectedError());
      }
    }
  }

  function favoriteForPath(path: string): FavoriteEntry | undefined {
    return favorites.find(
      (favorite) =>
        favorite.status === "available" && favorite.resolvedPath === path,
    );
  }

  function toggleFavorite(entry: CatalogEntry) {
    const existing = favoriteForPath(entry.relativePath);
    const requestGeneration = ++favoriteGeneration.current;
    if (existing !== undefined) {
      void applyFavoriteOperation(removeFavorite(existing.favoriteId, requestGeneration));
    } else {
      void applyFavoriteOperation(addFavorite(entry.relativePath, requestGeneration));
    }
  }

  function openFavorite(favorite: FavoriteEntry) {
    if (favorite.status !== "available" || favorite.resolvedPath === null) return;
    setFavoritesOpen(false);
    if (favorite.kind === "folder") {
      navigate(favorite.resolvedPath);
      return;
    }
    if (favorite.kind === "comicFolder" || favorite.kind === "archive") {
      openComicEntry({
        relativePath: favorite.resolvedPath,
        kind: favorite.kind,
        ...(favorite.kind === "archive" ? { archiveKind: "cbz" } : {}),
      });
    }
  }

  function reResolveFavorite(favorite: FavoriteEntry) {
    if (favorite.resolvedPath === null) return;
    const requestGeneration = ++favoriteGeneration.current;
    void applyFavoriteOperation(
      resolveFavorite(
        favorite.favoriteId,
        favorite.resolvedPath,
        requestGeneration,
      ),
    );
  }

  function removeFavoriteEntry(favorite: FavoriteEntry) {
    const requestGeneration = ++favoriteGeneration.current;
    void applyFavoriteOperation(removeFavorite(favorite.favoriteId, requestGeneration));
  }

  async function runSearch() {
    const query = searchQuery;
    if (query.trim() === "") {
      clearSearch();
      return;
    }
    generation.current += 1;
    const requestGeneration = generation.current;
    setSearchState({ status: "loading", query });
    setSelectedPath(null);
    setThumbnails({});
    thumbnailRequests.current.clear();
    try {
      const response = await searchLibrary(query, requestGeneration);
      if (requestGeneration !== generation.current) return;
      if (response.status === "ok") {
        setSearchState({ status: "ready", query, results: response.data });
      } else if (response.status === "error") {
        setSearchState({
          status: "error",
          query,
          message: presentError(response.error),
        });
      }
    } catch {
      if (requestGeneration === generation.current) {
        setSearchState({
          status: "error",
          query,
          message: presentUnexpectedError(),
        });
      }
    }
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    void runSearch();
  }

  function navigateToSearchResult(entry: CatalogEntry) {
    const resultParent = parentPath(entry.relativePath);
    navigate(resultParent ?? "", "push", entry.relativePath);
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
          {recoveryNotice && (
            <p role="status">
              アプリデータを再初期化しました。漫画ファイルは変更していません。
            </p>
          )}
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
    settingsGeneration.current += 1;
    void saveCatalogSort(
      { sortField: nextField, sortDescending: nextDescending },
      settingsGeneration.current,
    ).catch(() => undefined);
  }

  function changeEndOfVolumePolicy(policy: EndOfVolumePolicy) {
    endOfVolumePolicyRef.current = policy;
    setEndOfVolumePolicy(policy);
    settingsGeneration.current += 1;
    void saveEndOfVolumePolicy(policy, settingsGeneration.current).catch(
      () => undefined,
    );
  }

  function changeCatalogViewMode(mode: CatalogViewMode) {
    setCatalogViewMode(mode);
    settingsGeneration.current += 1;
    void saveCatalogViewMode(mode, settingsGeneration.current).catch(
      () => undefined,
    );
  }

  function persistViewerSettings(
    next: Partial<
      Pick<
        CatalogSettings,
        "viewMode" | "readingDirection" | "scaleMode" | "scale" | "loupeEnabled"
        | "layoutMode"
      >
    >,
  ) {
    settingsGeneration.current += 1;
    void saveViewerSettings(
      {
        viewMode,
        layoutMode,
        readingDirection,
        scaleMode: viewerScaleMode,
        scale: viewerScale,
        loupeEnabled,
        ...next,
      },
      settingsGeneration.current,
    ).catch(() => undefined);
  }

  function closeViewer() {
    setPendingEndOfVolume(null);
    setEndOfVolumeNotice(null);
    setViewerSession(null);
  }

  function openComicEntry(entry: CatalogEntry) {
    setPendingEndOfVolume(null);
    setEndOfVolumeNotice(null);
    viewerGeneration.current += 1;
    const requestGeneration = viewerGeneration.current;
    void openComic(entry.relativePath, requestGeneration).then((response) => {
      if (response.status === "ok") {
        setViewerSession(response.data);
        setLoadState({ status: "ready" });
      } else if (response.status === "error") {
        setEndOfVolumeNotice(presentError(response.error));
      }
    });
  }

  function handleEndOfVolume() {
    if (pendingEndOfVolume !== null || viewerSession === null) return;
    const decision = resolveEndOfVolume(
      sortedEntries,
      viewerSession.itemKey,
      endOfVolumePolicyRef.current,
    );
    if (decision.kind === "open") {
      openComicEntry(decision.entry);
    } else if (decision.kind === "confirm") {
      setEndOfVolumeNotice(null);
      setPendingEndOfVolume(decision);
    } else if (decision.kind === "return_library") {
      closeViewer();
    } else {
      setEndOfVolumeNotice(
        decision.reason === "policy"
          ? "巻末動作が停止に設定されています。"
          : "巻末です。次の漫画はありません。",
      );
    }
  }

  if (viewerSession !== null) {
    return (
      <div className="viewer-shell">
        <Viewer
          key={viewerSession.itemKey}
          session={viewerSession}
          generation={viewerGeneration.current}
          initialMode={viewMode}
          initialDirection={readingDirection}
          initialScaleMode={viewerScaleMode}
          initialScale={viewerScale}
          initialLoupeEnabled={loupeEnabled}
          onSettingsChange={(mode, direction) => {
            setViewMode(mode);
            setReadingDirection(direction);
            persistViewerSettings({ viewMode: mode, readingDirection: direction });
          }}
          initialLayoutMode={layoutMode}
          onLayoutChange={(next: ViewerLayoutMode) => {
            setLayoutMode(next);
            persistViewerSettings({ layoutMode: next });
          }}
          fullscreenAdapter={fullscreenAdapter}
          onScaleChange={(next: ViewerScaleState) => {
            setViewerScaleMode(next.mode);
            setViewerScale(next.scale);
            setLoupeEnabled(next.loupeEnabled);
            persistViewerSettings({
              scaleMode: next.mode,
              scale: next.scale,
              loupeEnabled: next.loupeEnabled,
            });
          }}
          onClose={closeViewer}
          onNextItem={handleEndOfVolume}
        />
        {endOfVolumeNotice !== null && (
          <p className="end-of-volume-notice" role="status">
            {endOfVolumeNotice}
          </p>
        )}
        {pendingEndOfVolume !== null && (
          <div className="dialog-backdrop">
            <div
              className="end-of-volume-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="end-of-volume-title"
            >
              <h2 id="end-of-volume-title">次の漫画を開きますか？</h2>
              <p>{pendingEndOfVolume.entry.relativePath}</p>
              <button onClick={() => openComicEntry(pendingEndOfVolume.entry)}>
                次の漫画を開く
              </button>
              <button onClick={() => setPendingEndOfVolume(null)}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="app-shell">
      {recoveryNotice && (
        <p className="recovery-notice" role="status">
          アプリデータを再初期化しました。漫画ファイルは変更していません。
        </p>
      )}
      <nav className="menu-bar" aria-label="メニューバー">
        <button onClick={() => setLibraryRoot(null)}>ファイル</button>
        <button onClick={() => changeSort(sortField, !sortDescending)}>表示</button>
        <button
          onClick={() => {
            setFavoritesOpen(true);
            void refreshFavorites();
          }}
        >
          お気に入り
        </button>
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
            data-sort-field={sortField}
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
        <label>
          巻末動作
          <select
            aria-label="巻末動作"
            value={endOfVolumePolicy}
            onChange={(event) =>
              changeEndOfVolumePolicy(
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
        <label>
          一覧形式
          <select
            aria-label="一覧表示形式"
            data-catalog-view-mode={catalogViewMode}
            value={catalogViewMode}
            onChange={(event) =>
              changeCatalogViewMode(
                normalizeCatalogViewMode(event.target.value),
              )
            }
          >
            {CATALOG_VIEW_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {CATALOG_VIEW_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <button
          data-sort-descending={sortDescending}
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
      <form className="search-bar" aria-label="名前検索フォーム" onSubmit={submitSearch}>
        <label htmlFor="catalog-search">名前検索</label>
        <input
          id="catalog-search"
          aria-label="名前検索"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="ファイル名・フォルダ名"
        />
        <button type="submit">検索</button>
        {searchState.status !== "idle" && (
          <button type="button" onClick={clearSearch}>
            クリア
          </button>
        )}
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
          {searchState.status === "loading" && (
            <p className="loading-state" role="status">
              検索中: {searchState.query}
            </p>
          )}
          {searchState.status === "error" && (
            <div className="error-panel" role="alert">
              <h2>検索に失敗しました</h2>
              <p>対象: {searchState.query}</p>
              <p>{searchState.message}</p>
              <button onClick={() => void runSearch()}>再検索</button>
              <button onClick={clearSearch}>一覧へ戻る</button>
            </div>
          )}
          {searchState.status === "ready" && (
            <section
              className="search-results"
              aria-label="名前検索結果"
              data-search-result-count={searchState.results.length}
            >
              {searchState.results.length === 0 ? (
                <p className="empty-state" role="status">
                  検索結果はありません。
                </p>
              ) : (
                <ul>
                  {searchState.results.map((entry) => (
                    <li key={entry.relativePath}>
                      <button
                        type="button"
                        data-search-result-path={entry.relativePath}
                        data-search-result-kind={entry.kind}
                        aria-label={`${entry.relativePath}、${entryKindLabel(entry)}、元階層へ移動`}
                        onClick={() => navigateToSearchResult(entry)}
                      >
                        <span>{entryDisplayName(entry)}</span>
                        <span>{entryKindLabel(entry)}</span>
                        <span>{entry.relativePath}</span>
                        <span>元階層へ移動</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {searchState.status === "idle" && loadState.status === "loading" && (
            <p className="loading-state" role="status">
              読み込み中: {loadState.path || libraryRoot}
            </p>
          )}
          {searchState.status === "idle" && loadState.status === "error" ? (
            <div className="error-panel" role="alert">
              <h2>読み込みに失敗しました</h2>
              <p>対象: {loadState.path || libraryRoot}</p>
              <p>{loadState.message}</p>
              <button onClick={() => void load(navigation.current)}>再試行</button>
              {entries.length > 0 && (
                <button onClick={() => setLoadState({ status: "ready" })}>
                  一覧へ戻る
                </button>
              )}
              {up !== null && <button onClick={() => navigate(up)}>親フォルダへ</button>}
              <button onClick={() => void chooseRootWithPicker()}>別のフォルダを選択</button>
            </div>
          ) : searchState.status === "idle" && loadState.status !== "error" ? (
            <CatalogGrid
              entries={sortedEntries}
              selectedPath={selectedPath}
              viewMode={catalogViewMode}
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
                        message: presentError(response.error),
                      });
                    }
                  },
                );
              }}
              thumbnailFor={(entry) =>
                thumbnails[entry.relativePath] ?? { status: "loading" }
              }
              isFavorite={(entry) => favoriteForPath(entry.relativePath) !== undefined}
              onToggleFavorite={toggleFavorite}
              onThumbnailNeeded={(entry) => {
                if (thumbnails[entry.relativePath]?.status === "ready") return;
                queueThumbnail(entry, generation.current, "visible");
              }}
            />
          ) : null}
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
      {favoritesOpen && (
        <QuickAccess
          favorites={favorites}
          loading={favoritesLoading}
          notice={favoriteNotice}
          onClose={() => setFavoritesOpen(false)}
          onRefresh={() => void refreshFavorites()}
          onOpen={openFavorite}
          onResolve={reResolveFavorite}
          onRemove={removeFavoriteEntry}
        />
      )}
    </main>
  );
}
