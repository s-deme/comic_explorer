import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { CatalogGrid } from "./features/catalog/CatalogGrid";
import {
  navigationReducer,
  parentPath,
} from "./features/navigation/navigation";
import {
  listFolder,
  getCatalogSettings,
  getItemMetadata,
  getItemTags,
  getThumbnail,
  listTags,
  listReadingHistory,
  openComic,
  pickLibraryRoot,
  registerLibraryRoot,
  restoreLibraryRoot,
  saveCatalogSort,
  saveCatalogViewMode,
  saveEndOfVolumePolicy,
  saveItemMemo,
  saveShortcutBindings,
  saveViewerSettings,
  assignTag,
  removeTag,
  renameTag,
  queryTags,
  setItemRating,
  searchLibrary,
  diagnoseLibrary,
  cancelLibraryDiagnostics,
  takeRecoveryNotice,
  addFavorite,
  listFavorites,
  removeFavorite,
  resolveFavorite,
  type CatalogSettings,
  type DiagnosticReport,
  type FavoriteEntry,
  type ItemMetadata,
  type TagEntry,
  type ReadingHistoryEntry,
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
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_COMMANDS,
  SHORTCUT_FALLBACKS,
  SHORTCUT_LABELS,
  eventShortcut,
  normalizeShortcutBindings,
  remapShortcut,
  resetShortcutBindings,
  type ShortcutBindings,
  type ShortcutCommand,
} from "./features/input/shortcuts";
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
  restoreWorkspaceDisplay,
  shellGridRows,
  trayRuntimeAvailable,
  workspaceGridColumns,
} from "./features/workspace/display";
import {
  APP_VERSION,
  MOUSE_GESTURE_ACTIONS,
  MOUSE_GESTURE_NAMES,
  loadMouseGestures,
  normalizeSettingsProfile,
  saveMouseGestures,
  type MouseGestureBindings,
  type SettingsProfile,
} from "./features/settings/profile";
import {
  addBookshelfItem,
  listBookmarks,
  listBookshelf,
  nextBookmark,
  removeBookshelfItem,
  saveBookmark,
  type PageBookmark,
} from "./features/reading/collections";
import {
  catalogCsv,
  matchesMask,
  rangeSelection,
  selectEntriesByKind,
  toggleEntrySelection,
  type SelectionAction,
} from "./features/catalog/commands";
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

type MenuId = "file" | "navigation" | "view" | "library" | "help";

const MENU_ORDER: MenuId[] = ["file", "navigation", "view", "library", "help"];
const MENU_MNEMONICS: Record<string, MenuId> = {
  f: "file",
  n: "navigation",
  v: "view",
  l: "library",
  h: "help",
};

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

function diagnosticStatusLabel(status: DiagnosticReport["findings"][number]["status"]): string {
  switch (status) {
    case "added":
      return "追加";
    case "changed":
      return "変更";
    case "missing":
      return "欠落";
    case "duplicate":
      return "重複";
    case "corrupt":
      return "破損書庫";
  }
}

function diagnosticSeverityLabel(
  severity: DiagnosticReport["findings"][number]["severity"],
): string {
  switch (severity) {
    case "info":
      return "情報";
    case "warning":
      return "警告";
    case "error":
      return "エラー";
  }
}

export function App({ fullscreenAdapter }: AppProps = {}) {
  const generation = useRef(0);
  const viewerGeneration = useRef(0);
  const settingsGeneration = useRef(0);
  const favoriteGeneration = useRef(0);
  const metadataGeneration = useRef(0);
  const ratingSaveGeneration = useRef(0);
  const ratingSaveInFlight = useRef(false);
  const historyGeneration = useRef(0);
  const tagGeneration = useRef(0);
  const itemTagGeneration = useRef(0);
  const diagnosticGeneration = useRef(0);
  const thumbnailRequests = useRef(new Set<string>());
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const menuBarRef = useRef<HTMLElement>(null);
  const menuTriggerRefs = useRef<Record<MenuId, HTMLButtonElement | null>>({
    file: null,
    navigation: null,
    view: null,
    library: null,
    help: null,
  });
  const menuPopupRefs = useRef<Record<MenuId, HTMLDivElement | null>>({
    file: null,
    navigation: null,
    view: null,
    library: null,
    help: null,
  });
  const pendingMenuFocus = useRef<"first" | "last">("first");
  const [rootInput, setRootInput] = useState("");
  const [libraryRoot, setLibraryRoot] = useState<string | null>(null);
  const [navigation, dispatch] = useReducer(navigationReducer, {
    current: "",
    back: [],
    forward: [],
  });
  const [addressInput, setAddressInput] = useState("");
  const addressInputDirty = useRef(false);
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, ThumbnailViewState>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [fileMask, setFileMask] = useState("");
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [recentEntries, setRecentEntries] = useState<CatalogEntry[]>([]);
  const [bookmarks, setBookmarks] = useState<PageBookmark[]>([]);
  const [bookmarkNotice, setBookmarkNotice] = useState<string | null>(null);
  const [bookshelfOpen, setBookshelfOpen] = useState(false);
  const [bookshelfPaths, setBookshelfPaths] = useState<string[]>(() => listBookshelf());
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDescending, setSortDescending] = useState(false);
  const [catalogViewMode, setCatalogViewMode] = useState<CatalogViewMode>(
    DEFAULT_CATALOG_VIEW_MODE,
  );
  const [endOfVolumePolicy, setEndOfVolumePolicy] =
    useState<EndOfVolumePolicy>("auto_next");
  const endOfVolumePolicyRef = useRef<EndOfVolumePolicy>("auto_next");
  const endOfVolumePolicyRevision = useRef(0);
  const endOfVolumePolicyUserChanged = useRef(false);
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
  const [shortcuts, setShortcuts] = useState<ShortcutBindings>(() => ({
    ...DEFAULT_SHORTCUTS,
  }));
  const [shortcutNotice, setShortcutNotice] = useState<string | null>(null);
  const [shortcutSaveState, setShortcutSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const shortcutSaveRequest = useRef(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsProfile | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [mouseGestures, setMouseGestures] = useState<MouseGestureBindings>(() =>
    loadMouseGestures(typeof window === "undefined" ? undefined : window.localStorage),
  );
  const [activeMenu, setActiveMenu] = useState<MenuId | null>(null);
  const [menuTabStop, setMenuTabStop] = useState<MenuId>("file");
  const [treeWidth, setTreeWidth] = useState(240);
  const [treeVisible, setTreeVisible] = useState(true);
  const [menuBarVisible, setMenuBarVisible] = useState(true);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [viewerDetached, setViewerDetached] = useState(false);
  const [trayStored, setTrayStored] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [viewerSession, setViewerSession] = useState<ViewerSession | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle" });
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoriteRefreshRevision, setFavoriteRefreshRevision] = useState(0);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null);
  const [itemMetadata, setItemMetadata] = useState<ItemMetadata | null>(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoSaveState, setMemoSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [ratingSaveState, setRatingSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataNotice, setMetadataNotice] = useState<string | null>(null);
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [tagResults, setTagResults] = useState<TagEntry[]>([]);
  const [selectedTags, setSelectedTags] = useState<TagEntry[]>([]);
  const [tagNameDraft, setTagNameDraft] = useState("");
  const [tagRenameDrafts, setTagRenameDrafts] = useState<Record<string, string>>({});
  const [tagNotice, setTagNotice] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticReport | null>(null);
  const [diagnosticNotice, setDiagnosticNotice] = useState<string | null>(null);
  const trayApiAvailable =
    trayRuntimeAvailable(typeof window === "undefined" ? undefined : window);

  function selectEntry(entry: CatalogEntry, action: SelectionAction = "replace") {
    const next = action === "toggle"
      ? toggleEntrySelection(selectedPaths, entry.relativePath)
      : action === "range"
        ? rangeSelection(sortedEntries, selectedPath, entry.relativePath)
        : [entry.relativePath];
    setSelectedPaths(next);
    setSelectedPath(next.at(-1) ?? null);
    setSelectionNotice(null);
  }

  useEffect(() => {
    if (activeMenu === null) return;
    const frame = requestAnimationFrame(() => {
      const items = getMenuItems(activeMenu);
      focusMenuItem(
        activeMenu,
        pendingMenuFocus.current === "last" ? items.length - 1 : 0,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [activeMenu]);

  useEffect(() => {
    function handleMnemonic(event: KeyboardEvent) {
      if (event.key === "F5" && libraryRoot !== null && viewerSession === null) {
        event.preventDefault();
        refreshCatalog();
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (libraryRoot === null || viewerSession !== null) return;
      if (event.key === "ArrowLeft") {
        const target = navigation.back.at(-1);
        if (target !== undefined) {
          event.preventDefault();
          setActiveMenu(null);
          navigate(target, "back");
        }
        return;
      }
      if (event.key === "ArrowRight") {
        const target = navigation.forward[0];
        if (target !== undefined) {
          event.preventDefault();
          setActiveMenu(null);
          navigate(target, "forward");
        }
        return;
      }
      if (event.key === "ArrowUp") {
        const target = parentPath(navigation.current);
        if (target !== null) {
          event.preventDefault();
          setActiveMenu(null);
          navigate(target);
        }
        return;
      }
      const menuId = MENU_MNEMONICS[event.key.toLowerCase()];
      if (menuId === undefined) return;
      event.preventDefault();
      pendingMenuFocus.current = "first";
      setMenuTabStop(menuId);
      setActiveMenu(menuId);
      requestAnimationFrame(() => focusMenuItem(menuId, 0));
    }

    function handleOutsidePointer(event: PointerEvent) {
      if (
        activeMenu !== null &&
        event.target instanceof Node &&
        !menuBarRef.current?.contains(event.target)
      ) {
        setActiveMenu(null);
      }
    }

    window.addEventListener("keydown", handleMnemonic);
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => {
      window.removeEventListener("keydown", handleMnemonic);
      document.removeEventListener("pointerdown", handleOutsidePointer);
    };
  }, [activeMenu, libraryRoot, navigation, selectedPath, viewerSession]);

  useEffect(() => {
    settingsGeneration.current += 1;
    const settingsRequestGeneration = settingsGeneration.current;
    const policyRevisionAtRequest = endOfVolumePolicyRevision.current;
    void getCatalogSettings(settingsRequestGeneration)
      .then((response) => {
        if (settingsRequestGeneration !== settingsGeneration.current) return;
        if (response.status === "ok") {
          setSortField(response.data.sortField);
          setSortDescending(response.data.sortDescending);
          setCatalogViewMode(
            normalizeCatalogViewMode(response.data.catalogViewMode),
          );
          if (
            !endOfVolumePolicyUserChanged.current &&
            policyRevisionAtRequest === endOfVolumePolicyRevision.current
          ) {
            const restoredEndOfVolumePolicy = normalizeEndOfVolumePolicy(
              response.data.endOfVolumePolicy,
            );
            endOfVolumePolicyRef.current = restoredEndOfVolumePolicy;
            setEndOfVolumePolicy(restoredEndOfVolumePolicy);
          }
          setViewMode(response.data.viewMode);
          setLayoutMode(normalizeViewerLayoutMode(response.data.layoutMode));
          setReadingDirection(response.data.readingDirection);
          setViewerScaleMode(response.data.scaleMode);
          setViewerScale(response.data.scale);
          setLoupeEnabled(response.data.loupeEnabled);
          setShortcuts(normalizeShortcutBindings(response.data.shortcuts));
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

  useEffect(() => {
    if (!addressInputDirty.current) setAddressInput(absoluteAddress);
  }, [absoluteAddress]);

  const sortedEntries = useMemo(
    () =>
      sortCatalogEntries(
        entries,
        sortField,
        sortDescending ? "descending" : "ascending",
      ),
    [entries, sortDescending, sortField],
  );
  const visibleEntries = useMemo(
    () => sortedEntries.filter((entry) => matchesMask(entry, fileMask)),
    [fileMask, sortedEntries],
  );

  useEffect(() => {
    if (selectedPath !== null && !visibleEntries.some((entry) => entry.relativePath === selectedPath)) {
      clearSelection();
    }
  }, [selectedPath, visibleEntries]);

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
        const nextSelection = selectionPath !== null && response.data.some(
          (entry) => entry.relativePath === selectionPath,
        ) ? [selectionPath] : [];
        setSelectedPaths(nextSelection);
        setSelectedPath(nextSelection.at(-1) ?? null);
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
    setDiagnosticReport(null);
    setDiagnosticNotice(null);
    generation.current += 1;
    const response = await registerLibraryRoot(rootInput, generation.current);
    if (response.status === "ok") {
      addressInputDirty.current = false;
      setLibraryRoot(response.data.absolutePath);
      dispatch({ type: "reset", path: "" });
      await load("");
    } else if (response.status === "error") {
      setLoadState({ status: "error", path: rootInput, message: presentError(response.error) });
    }
  }

  function refreshCatalog() {
    setSelectionNotice(null);
    void load(navigation.current, selectedPath);
  }

  function selectAll() {
    const next = visibleEntries.map((entry) => entry.relativePath);
    setSelectedPaths(next);
    setSelectedPath(next.at(-1) ?? null);
    setSelectionNotice(null);
  }

  function selectByKind(kind: CatalogEntry["kind"] | "image") {
    const next = selectEntriesByKind(visibleEntries, kind);
    setSelectedPaths(next);
    setSelectedPath(next.at(-1) ?? null);
    setSelectionNotice(null);
  }

  function invertSelection() {
    const selected = new Set(selectedPaths);
    const next = visibleEntries
      .filter((entry) => !selected.has(entry.relativePath))
      .map((entry) => entry.relativePath);
    setSelectedPaths(next);
    setSelectedPath(next.at(-1) ?? null);
    setSelectionNotice(null);
  }

  function clearSelection() {
    setSelectedPaths([]);
    setSelectedPath(null);
    setSelectionNotice(null);
  }

  function downloadCatalogCsv() {
    const blob = new Blob([catalogCsv(visibleEntries)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "comic-explorer-catalog.csv";
    link.click();
    URL.revokeObjectURL(url);
    setSelectionNotice(`${visibleEntries.length}件をCSVへ出力しました。`);
  }

  function openSelectedEntry() {
    const entry = sortedEntries.find((candidate) => candidate.relativePath === selectedPath);
    if (entry === undefined) return;
    if (entry.kind === "folder") navigate(entry.relativePath);
    else if (entry.kind === "comicFolder" || entry.kind === "archive") openComicEntry(entry);
  }

  function rememberRecent(entry: CatalogEntry) {
    setRecentEntries((current) => [
      entry,
      ...current.filter((candidate) => candidate.relativePath !== entry.relativePath),
    ].slice(0, 12));
  }

  function refreshBookmarks(itemKey: string) {
    setBookmarks(listBookmarks(itemKey));
    setBookmarkNotice(null);
  }

  function saveCurrentBookmark(index: number) {
    if (viewerSession === null) return;
    const page = viewerSession.pages[index];
    if (page === undefined) return;
    setBookmarks(saveBookmark({
      itemKey: viewerSession.itemKey,
      pageIndex: index,
      pageKey: page.relativePath,
      createdAt: Date.now(),
    }));
    setBookmarkNotice(`しおりを保存しました: ${index + 1}ページ`);
  }

  function addSelectedToBookshelf() {
    if (selectedPath === null) return;
    setBookshelfPaths(addBookshelfItem(selectedPath));
  }

  async function copySelectedPaths() {
    const paths = selectedPaths.length > 0 ? selectedPaths : selectedPath === null ? [] : [selectedPath];
    if (paths.length === 0) {
      setSelectionNotice("コピーする項目を選択してください。");
      return;
    }
    if (navigator.clipboard?.writeText === undefined) {
      setSelectionNotice("クリップボードを利用できません。");
      return;
    }
    try {
      await navigator.clipboard.writeText(paths.join("\n"));
      setSelectionNotice(`${paths.length}件の相対パスをコピーしました。`);
    } catch {
      setSelectionNotice("パスをコピーできませんでした。");
    }
  }

  async function chooseRootWithPicker() {
    clearSearch();
    setDiagnosticReport(null);
    setDiagnosticNotice(null);
    generation.current += 1;
    const response = await pickLibraryRoot(generation.current);
    if (response.status === "ok" && response.data) {
      addressInputDirty.current = false;
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
    addressInputDirty.current = false;
    setSearchState({ status: "idle" });
    if (history === "push") dispatch({ type: "navigate", path });
    else dispatch({ type: history });
    void load(path, selectionPath);
  }

  function clearSearch() {
    generation.current += 1;
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
        setFavoriteRefreshRevision((current) => current + 1);
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
    setFavoritesLoading(true);
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
    } finally {
      if (requestGeneration === favoriteGeneration.current) {
        setFavoritesLoading(false);
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

  async function loadItemMetadata(itemIdentity: string) {
    const requestGeneration = ++metadataGeneration.current;
    ratingSaveGeneration.current += 1;
    ratingSaveInFlight.current = false;
    setItemMetadata(null);
    setMemoDraft("");
    setMemoSaveState("idle");
    setRatingSaveState("idle");
    setMetadataLoading(true);
    setMetadataNotice(null);
    try {
      const response = await getItemMetadata(itemIdentity, requestGeneration);
      if (requestGeneration !== metadataGeneration.current) return;
      if (response.status === "ok") {
        setItemMetadata(response.data);
        setMemoDraft(response.data.memo ?? "");
      } else if (response.status === "error") {
        setMetadataNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === metadataGeneration.current) {
        setMetadataNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === metadataGeneration.current) {
        setMetadataLoading(false);
      }
    }
  }

  async function persistMemo(body: string) {
    if (itemMetadata === null) return;
    const requestGeneration = metadataGeneration.current;
    setMetadataLoading(true);
    setMetadataNotice(null);
    setMemoSaveState("saving");
    try {
      const response = await saveItemMemo(
        itemMetadata.itemIdentity,
        body,
        requestGeneration,
      );
      if (requestGeneration !== metadataGeneration.current) return;
      if (response.status === "ok") {
        setItemMetadata(response.data);
        setMemoDraft(response.data.memo ?? "");
        setMemoSaveState("saved");
      } else if (response.status === "error") {
        setMetadataNotice(presentError(response.error));
        setMemoSaveState("error");
      }
    } catch {
      if (requestGeneration === metadataGeneration.current) {
        setMetadataNotice(presentUnexpectedError());
        setMemoSaveState("error");
      }
    } finally {
      if (requestGeneration === metadataGeneration.current) {
        setMetadataLoading(false);
      }
    }
  }

  async function persistRating(rating: number | null) {
    if (itemMetadata === null || ratingSaveInFlight.current) return;
    const metadataRequestGeneration = metadataGeneration.current;
    const requestGeneration = ++ratingSaveGeneration.current;
    ratingSaveInFlight.current = true;
    setMetadataLoading(true);
    setMetadataNotice(null);
    setRatingSaveState("saving");
    try {
      const response = await setItemRating(
        itemMetadata.itemIdentity,
        rating,
        metadataRequestGeneration,
      );
      if (
        metadataRequestGeneration !== metadataGeneration.current ||
        requestGeneration !== ratingSaveGeneration.current
      ) {
        return;
      }
      if (response.status === "ok") {
        setItemMetadata(response.data);
        setRatingSaveState("saved");
      } else if (response.status === "error") {
        setMetadataNotice(presentError(response.error));
        setRatingSaveState("error");
      } else {
        setRatingSaveState("idle");
      }
    } catch {
      if (
        metadataRequestGeneration === metadataGeneration.current &&
        requestGeneration === ratingSaveGeneration.current
      ) {
        setMetadataNotice(presentUnexpectedError());
        setRatingSaveState("error");
      }
    } finally {
      if (
        metadataRequestGeneration === metadataGeneration.current &&
        requestGeneration === ratingSaveGeneration.current
      ) {
        ratingSaveInFlight.current = false;
        setMetadataLoading(false);
      }
    }
  }

  async function refreshHistory() {
    const requestGeneration = ++historyGeneration.current;
    setHistoryLoading(true);
    setHistoryNotice(null);
    try {
      const response = await listReadingHistory(requestGeneration);
      if (requestGeneration !== historyGeneration.current) return;
      if (response.status === "ok") {
        setReadingHistory(response.data);
      } else if (response.status === "error") {
        setHistoryNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === historyGeneration.current) {
        setHistoryNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === historyGeneration.current) {
        setHistoryLoading(false);
      }
    }
  }

  async function refreshItemTags(itemIdentity: string) {
    const requestGeneration = ++itemTagGeneration.current;
    setTagNotice(null);
    try {
      const response = await getItemTags(itemIdentity, requestGeneration);
      if (requestGeneration !== itemTagGeneration.current) return;
      if (response.status === "ok") {
        setSelectedTags(response.data.tags);
      } else if (response.status === "error") {
        setTagNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === itemTagGeneration.current) {
        setTagNotice(presentUnexpectedError());
      }
    }
  }

  async function refreshTags(query = tagQuery) {
    const requestGeneration = ++tagGeneration.current;
    setTagsLoading(true);
    setTagNotice(null);
    try {
      const response =
        query.trim() === ""
          ? await listTags(requestGeneration)
          : await queryTags(query, requestGeneration);
      if (requestGeneration !== tagGeneration.current) return;
      if (response.status === "ok") {
        setTagResults(response.data);
        setTagRenameDrafts((current) => {
          const next = { ...current };
          for (const tag of response.data) {
            if (next[tag.tagId] === undefined) next[tag.tagId] = tag.name;
          }
          return next;
        });
      } else if (response.status === "error") {
        setTagNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === tagGeneration.current) {
        setTagNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === tagGeneration.current) {
        setTagsLoading(false);
      }
    }
  }

  function openTagsPanel() {
    setTagsOpen(true);
    setTagNotice(null);
    void refreshTags("");
    if (selectedPath !== null) void refreshItemTags(selectedPath);
  }

  function closeTagsPanel() {
    setTagsOpen(false);
    setTagNotice(null);
  }

  async function assignTagToSelected() {
    if (selectedPath === null) return;
    const requestGeneration = ++itemTagGeneration.current;
    setTagsLoading(true);
    setTagNotice(null);
    try {
      const response = await assignTag(
        selectedPath,
        tagNameDraft,
        requestGeneration,
      );
      if (requestGeneration !== itemTagGeneration.current) return;
      if (response.status === "ok") {
        setSelectedTags(response.data.tags);
        setTagNameDraft("");
        await refreshTags(tagQuery);
      } else if (response.status === "error") {
        setTagNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === itemTagGeneration.current) {
        setTagNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === itemTagGeneration.current) {
        setTagsLoading(false);
      }
    }
  }

  async function removeTagFromSelected(tag: TagEntry) {
    if (selectedPath === null) return;
    const requestGeneration = ++itemTagGeneration.current;
    setTagsLoading(true);
    setTagNotice(null);
    try {
      const response = await removeTag(
        selectedPath,
        tag.tagId,
        requestGeneration,
      );
      if (requestGeneration !== itemTagGeneration.current) return;
      if (response.status === "ok") {
        setSelectedTags(response.data.tags);
        await refreshTags(tagQuery);
      } else if (response.status === "error") {
        setTagNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === itemTagGeneration.current) {
        setTagNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === itemTagGeneration.current) {
        setTagsLoading(false);
      }
    }
  }

  async function renameTagEntry(tag: TagEntry) {
    const newName = tagRenameDrafts[tag.tagId] ?? tag.name;
    const requestGeneration = ++tagGeneration.current;
    setTagsLoading(true);
    setTagNotice(null);
    try {
      const response = await renameTag(tag.tagId, newName, requestGeneration);
      if (requestGeneration !== tagGeneration.current) return;
      if (response.status === "ok") {
        setTagRenameDrafts((current) => ({
          ...current,
          [response.data.tagId]: response.data.name,
        }));
        await refreshTags(tagQuery);
        if (selectedPath !== null) await refreshItemTags(selectedPath);
      } else if (response.status === "error") {
        setTagNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === tagGeneration.current) {
        setTagNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === tagGeneration.current) {
        setTagsLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!tagsOpen) return;
    if (selectedPath === null) {
      setSelectedTags([]);
      return;
    }
    void refreshItemTags(selectedPath);
  }, [selectedPath, tagsOpen]);

  async function runDiagnostics(retry = false) {
    const requestGeneration = ++diagnosticGeneration.current;
    const baseline = diagnosticReport?.snapshot ?? null;
    setDiagnosticsOpen(true);
    setDiagnosticsLoading(true);
    setDiagnosticNotice(null);
    try {
      const response = await diagnoseLibrary(baseline, requestGeneration, retry);
      if (requestGeneration !== diagnosticGeneration.current) return;
      if (response.status === "ok") {
        setDiagnosticReport(response.data);
      } else if (response.status === "cancelled") {
        setDiagnosticNotice("ライブラリ診断をキャンセルしました。");
      } else {
        setDiagnosticNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === diagnosticGeneration.current) {
        setDiagnosticNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === diagnosticGeneration.current) {
        setDiagnosticsLoading(false);
      }
    }
  }

  function cancelDiagnostics() {
    void cancelLibraryDiagnostics(diagnosticGeneration.current).catch(() => undefined);
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
    setShortcutNotice(null);
    setShortcutSaveState("idle");
    requestAnimationFrame(() => helpTriggerRef.current?.focus());
  }

  function currentSettingsProfile(): SettingsProfile {
    return {
      profileVersion: 1,
      sortField,
      sortDescending,
      endOfVolumePolicy,
      catalogViewMode,
      viewMode,
      layoutMode,
      readingDirection,
      scaleMode: viewerScaleMode,
      scale: viewerScale,
      loupeEnabled,
      shortcuts: { ...shortcuts },
      mouseGestures: { ...mouseGestures },
    };
  }

  function openSettingsDialog() {
    setProfileNotice(null);
    setSettingsDraft(currentSettingsProfile());
    setSettingsOpen(true);
  }

  function applySettingsProfile(profile: SettingsProfile) {
    changeSort(profile.sortField, profile.sortDescending);
    changeEndOfVolumePolicy(profile.endOfVolumePolicy);
    changeCatalogViewMode(profile.catalogViewMode);
    setViewMode(profile.viewMode);
    setLayoutMode(profile.layoutMode);
    setReadingDirection(profile.readingDirection);
    setViewerScaleMode(profile.scaleMode);
    setViewerScale(profile.scale);
    setLoupeEnabled(profile.loupeEnabled);
    void saveViewerSettings(
      {
        viewMode: profile.viewMode,
        layoutMode: profile.layoutMode,
        readingDirection: profile.readingDirection,
        scaleMode: profile.scaleMode,
        scale: profile.scale,
        loupeEnabled: profile.loupeEnabled,
      },
      ++settingsGeneration.current,
    ).catch(() => undefined);
    persistShortcutBindings(profile.shortcuts);
    setMouseGestures(profile.mouseGestures);
    saveMouseGestures(
      typeof window === "undefined" ? undefined : window.localStorage,
      profile.mouseGestures,
    );
    setSettingsOpen(false);
    setProfileNotice("設定profileを適用しました。");
  }

  function exportSettingsProfile() {
    const blob = new Blob([JSON.stringify(currentSettingsProfile(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "comic-explorer-settings.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setProfileNotice("設定profileを書き出しました。");
  }

  function importSettingsProfile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    void file
      .text()
      .then((text) => {
        const profile = normalizeSettingsProfile(JSON.parse(text));
        if (profile === null) {
          setProfileNotice("設定profileの形式が不正です。");
          return;
        }
        setSettingsDraft(profile);
        setProfileNotice("設定profileを読み込みました。適用を押すと反映します。");
      })
      .catch(() => setProfileNotice("設定profileを読み込めませんでした。"));
  }

  function persistShortcutBindings(next: ShortcutBindings) {
    setShortcuts(next);
    setShortcutNotice(null);
    setShortcutSaveState("saving");
    const saveRequest = shortcutSaveRequest.current + 1;
    shortcutSaveRequest.current = saveRequest;
    settingsGeneration.current += 1;
    void saveShortcutBindings(next, settingsGeneration.current)
      .then((response) => {
        if (saveRequest !== shortcutSaveRequest.current) return;
        if (response.status === "ok") {
          setShortcuts(normalizeShortcutBindings(response.data));
          setShortcutSaveState("saved");
        } else {
          setShortcutSaveState("error");
          setShortcutNotice("ショートカットを保存できませんでした。");
        }
      })
      .catch(() => {
        if (saveRequest !== shortcutSaveRequest.current) return;
        setShortcutSaveState("error");
        setShortcutNotice("ショートカットを保存できませんでした。");
      });
  }

  function captureShortcut(
    command: ShortcutCommand,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const pressed = eventShortcut(event.nativeEvent);
    if (pressed === null) {
      setShortcutNotice("修飾キーだけでは割り当てできません。");
      return;
    }
    const result = remapShortcut(shortcuts, command, pressed);
    if (!result.ok) {
      setShortcutNotice(
        result.reason === "conflict"
          ? `${SHORTCUT_LABELS[result.conflict ?? command]} と同じキーは割り当てできません。`
          : "このキーは割り当てできません。",
      );
      return;
    }
    persistShortcutBindings(result.bindings);
  }

  function resetShortcut(command: ShortcutCommand) {
    const result = remapShortcut(
      shortcuts,
      command,
      DEFAULT_SHORTCUTS[command],
    );
    if (!result.ok) {
      setShortcutNotice(
        `${SHORTCUT_LABELS[result.conflict ?? command]} を先に変更してください。`,
      );
      return;
    }
    persistShortcutBindings(result.bindings);
  }

  function resetAllShortcuts() {
    persistShortcutBindings(resetShortcutBindings());
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

  function getMenuItems(menuId: MenuId): HTMLButtonElement[] {
    const menu = menuPopupRefs.current[menuId];
    return menu === null
      ? []
      : Array.from(
          menu.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]',
          ),
        );
  }

  function focusMenuItem(menuId: MenuId, index: number) {
    const items = getMenuItems(menuId);
    if (items.length === 0) return;
    const normalizedIndex = (index + items.length) % items.length;
    items.forEach((item, itemIndex) => {
      item.tabIndex = itemIndex === normalizedIndex ? 0 : -1;
    });
    items[normalizedIndex].focus();
  }

  function markMenuItemActive(item: HTMLButtonElement) {
    const menu = item.closest('[role="menu"]');
    if (menu === null) return;
    menu
      .querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]',
      )
      .forEach((candidate) => {
        candidate.tabIndex = candidate === item ? 0 : -1;
      });
  }

  function toggleMenu(menuId: MenuId, focus: "first" | "last" = "first") {
    pendingMenuFocus.current = focus;
    setActiveMenu((current) => (current === menuId ? null : menuId));
  }

  function closeMenu(restoreFocus: boolean) {
    const menuId = activeMenu;
    setActiveMenu(null);
    if (restoreFocus && menuId !== null) {
      requestAnimationFrame(() => menuTriggerRefs.current[menuId]?.focus());
    }
  }

  function runMenuAction(action: () => void, disabled = false) {
    if (disabled) return;
    setActiveMenu(null);
    action();
  }

  function handleMenuTriggerKeyDown(
    menuId: MenuId,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) {
    const menuIndex = MENU_ORDER.indexOf(menuId);
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      const nextMenu = MENU_ORDER[(menuIndex + offset + MENU_ORDER.length) % MENU_ORDER.length];
      setMenuTabStop(nextMenu);
      if (activeMenu !== null) {
        pendingMenuFocus.current = "first";
        setActiveMenu(nextMenu);
      } else {
        menuTriggerRefs.current[nextMenu]?.focus();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      pendingMenuFocus.current = event.key === "ArrowUp" ? "last" : "first";
      setActiveMenu(menuId);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleMenu(menuId);
      return;
    }
    if (event.key === "Escape" && activeMenu !== null) {
      event.preventDefault();
      closeMenu(true);
    }
  }

  function handleMenuItemKeyDown(
    menuId: MenuId,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) {
    const items = getMenuItems(menuId);
    const currentIndex = items.indexOf(event.currentTarget);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuItem(menuId, currentIndex + (event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusMenuItem(menuId, event.key === "Home" ? 0 : items.length - 1);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const menuIndex = MENU_ORDER.indexOf(menuId);
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      const nextMenu = MENU_ORDER[(menuIndex + offset + MENU_ORDER.length) % MENU_ORDER.length];
      pendingMenuFocus.current = "first";
      setMenuTabStop(nextMenu);
      setActiveMenu(nextMenu);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (event.currentTarget.getAttribute("aria-disabled") !== "true") {
        event.currentTarget.click();
      }
    }
  }

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
    endOfVolumePolicyUserChanged.current = true;
    endOfVolumePolicyRevision.current += 1;
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
    metadataGeneration.current += 1;
    ratingSaveGeneration.current += 1;
    ratingSaveInFlight.current = false;
    setItemMetadata(null);
    setMemoDraft("");
    setMemoSaveState("idle");
    setRatingSaveState("idle");
    setMetadataNotice(null);
    setBookmarks([]);
    setBookmarkNotice(null);
    setViewerDetached(false);
  }

  function openComicEntry(entry: CatalogEntry) {
    setPendingEndOfVolume(null);
    setEndOfVolumeNotice(null);
    setLoadState({ status: "loading", path: entry.relativePath });
    viewerGeneration.current += 1;
    const requestGeneration = viewerGeneration.current;
    void openComic(entry.relativePath, requestGeneration).then((response) => {
      if (response.status === "ok") {
        rememberRecent(entry);
        refreshBookmarks(response.data.itemKey);
        setViewerSession(response.data);
        setLoadState({ status: "ready" });
        void loadItemMetadata(response.data.itemKey);
      } else if (response.status === "error") {
        setLoadState({
          status: "error",
          path: entry.relativePath,
          message: presentError(response.error),
        });
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
      <div
        className={viewerDetached ? "viewer-shell viewer-shell--detached" : "viewer-shell"}
        data-viewer-detached={viewerDetached}
      >
        <Viewer
          key={viewerSession.itemKey}
          session={viewerSession}
          generation={viewerGeneration.current}
          initialMode={viewMode}
          initialDirection={readingDirection}
          initialScaleMode={viewerScaleMode}
          initialScale={viewerScale}
          initialLoupeEnabled={loupeEnabled}
          shortcuts={shortcuts}
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
          bookmarks={bookmarks}
          onPageChange={() => undefined}
          mouseGestures={mouseGestures}
          detached={viewerDetached}
          onToggleDetached={() => setViewerDetached((current) => !current)}
          onSaveBookmark={saveCurrentBookmark}
          onNextBookmark={(index) => nextBookmark(bookmarks, index)?.pageIndex ?? null}
        />
        <section
          aria-label="作品メタデータ"
          data-product-id="item-metadata-panel"
          data-memo-save-state={memoSaveState}
          data-rating-save-state={ratingSaveState}
          data-rating-persisted-value={
            itemMetadata?.rating?.toString() ?? "unset"
          }
        >
          <h2>作品メタデータ</h2>
          {metadataLoading && <p role="status">メタデータを読み込み中です。</p>}
          {itemMetadata !== null && (
            <>
              <p>{itemMetadata.itemIdentity}</p>
              <label>
                作品メモ
                <textarea
                  aria-label="作品メモ"
                  data-product-id="item-memo-input"
                  value={memoDraft}
                  disabled={metadataLoading}
                  onChange={(event) => {
                    setMemoDraft(event.target.value);
                    setMemoSaveState("idle");
                  }}
                  rows={4}
                />
              </label>
              <div>
                <button
                  type="button"
                  data-product-id="item-memo-save"
                  disabled={metadataLoading}
                  onClick={() => void persistMemo(memoDraft)}
                >
                  メモを保存
                </button>
                <button
                  type="button"
                  data-product-id="item-memo-clear"
                  disabled={metadataLoading}
                  onClick={() => void persistMemo("")}
                >
                  メモを消去
                </button>
              </div>
              <label>
                作品評価
                <select
                  aria-label="作品評価"
                  data-product-id="item-rating-select"
                  value={itemMetadata.rating?.toString() ?? ""}
                  disabled={metadataLoading}
                  onChange={(event) => {
                    const value = event.target.value;
                    void persistRating(value === "" ? null : Number(value));
                  }}
                >
                  <option value="">未設定</option>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <option key={rating} value={rating}>
                      {rating}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        {metadataNotice !== null && <p role="alert">{metadataNotice}</p>}
        {bookmarkNotice !== null && <p className="bookmark-notice" role="status">{bookmarkNotice}</p>}
        </section>
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

  if (trayStored) {
    return (
      <main className="tray-shell" aria-label="タスクトレイ収納">
        <h1>Comic Explorer</h1>
        <p>アプリケーションをタスクトレイへ収納しました。</p>
        <button type="button" onClick={() => setTrayStored(false)}>
          アプリを復帰
        </button>
      </main>
    );
  }

  return (
    <main
      className="app-shell"
      style={{
        gridTemplateRows: shellGridRows({ menuBarVisible, toolbarVisible }),
      }}
      data-menu-visible={menuBarVisible}
      data-toolbar-visible={toolbarVisible}
      data-tree-visible={treeVisible}
    >
      {recoveryNotice && (
        <p className="recovery-notice" role="status">
          アプリデータを再初期化しました。漫画ファイルは変更していません。
        </p>
      )}
      {menuBarVisible && <nav
        ref={menuBarRef}
        className="menu-bar"
        aria-label="メニューバー"
        role="menubar"
      >
        <div className="menu-group">
          <button
            ref={(node) => {
              menuTriggerRefs.current.file = node;
            }}
            className="menu-trigger"
            type="button"
            role="menuitem"
            aria-label="ファイル"
            aria-haspopup="menu"
            aria-expanded={activeMenu === "file"}
            aria-controls="file-menu"
            aria-keyshortcuts="Alt+F"
            tabIndex={menuTabStop === "file" ? 0 : -1}
            onFocus={() => setMenuTabStop("file")}
            onClick={() => {
              setMenuTabStop("file");
              toggleMenu("file");
            }}
            onKeyDown={(event) => handleMenuTriggerKeyDown("file", event)}
          >
            ファイル(F)
          </button>
          {activeMenu === "file" && (
            <div
              ref={(node) => {
                menuPopupRefs.current.file = node;
              }}
              id="file-menu"
              className="menu-popup"
              role="menu"
              aria-label="ファイル"
            >
              <button
                type="button"
                role="menuitem"
                tabIndex={0}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(() => setLibraryRoot(null))}
              >
                ライブラリを変更…
              </button>
              <button
                type="button"
                role="menuitem"
                aria-disabled={selectedPath === null}
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(openSelectedEntry, selectedPath === null)}
              >
                選択項目を開く
                <span className="menu-shortcut">Enter</span>
              </button>
              <span className="menu-heading">最近開いた項目</span>
              {recentEntries.length === 0 ? (
                <span className="menu-empty">履歴はありません</span>
              ) : recentEntries.map((entry) => (
                <button
                  key={entry.relativePath}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onFocus={(event) => markMenuItemActive(event.currentTarget)}
                  onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                  onClick={() => runMenuAction(() => openComicEntry(entry))}
                >
                  {entryDisplayName(entry)}
                </button>
              ))}
              <div className="menu-separator" role="separator" />
              <button
                type="button"
                role="menuitem"
                aria-keyshortcuts="F5"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(refreshCatalog)}
              >
                現在場所を更新
                <span className="menu-shortcut">F5</span>
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={selectedPaths.length === 0}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(() => void copySelectedPaths(), selectedPaths.length === 0)}
              >
                パスをコピー
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(downloadCatalogCsv)}
              >
                CSVで出力
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={selectedPaths.length !== 1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(() => setPropertiesOpen(true), selectedPaths.length !== 1)}
              >
                プロパティ
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(() => window.close())}
              >
                終了
                <span className="menu-shortcut">Alt+F4</span>
              </button>
              <div className="menu-separator" role="separator" />
              <span className="menu-heading">選択</span>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(selectAll)}
              >
                すべて選択
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(() => selectByKind("page"))}
              >
                画像だけ選択
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(invertSelection)}
              >
                選択を反転
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={selectedPaths.length === 0}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(clearSelection, selectedPaths.length === 0)}
              >
                選択を解除
              </button>
            </div>
          )}
        </div>

        <div className="menu-group">
          <button
            ref={(node) => {
              menuTriggerRefs.current.navigation = node;
            }}
            className="menu-trigger"
            type="button"
            role="menuitem"
            aria-label="移動"
            aria-haspopup="menu"
            aria-expanded={activeMenu === "navigation"}
            aria-controls="navigation-menu"
            aria-keyshortcuts="Alt+N"
            tabIndex={menuTabStop === "navigation" ? 0 : -1}
            onFocus={() => setMenuTabStop("navigation")}
            onClick={() => {
              setMenuTabStop("navigation");
              toggleMenu("navigation");
            }}
            onKeyDown={(event) => handleMenuTriggerKeyDown("navigation", event)}
          >
            移動(N)
          </button>
          {activeMenu === "navigation" && (
            <div
              ref={(node) => {
                menuPopupRefs.current.navigation = node;
              }}
              id="navigation-menu"
              className="menu-popup"
              role="menu"
              aria-label="移動"
            >
              <button
                type="button"
                role="menuitem"
                tabIndex={0}
                aria-disabled={navigation.back.length === 0}
                aria-keyshortcuts="Alt+ArrowLeft"
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("navigation", event)}
                onClick={() =>
                  runMenuAction(() => {
                    const target = navigation.back.at(-1);
                    if (target !== undefined) navigate(target, "back");
                  }, navigation.back.length === 0)
                }
              >
                戻る
                <span className="menu-shortcut">Alt+←</span>
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={navigation.forward.length === 0}
                aria-keyshortcuts="Alt+ArrowRight"
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("navigation", event)}
                onClick={() =>
                  runMenuAction(() => {
                    const target = navigation.forward[0];
                    if (target !== undefined) navigate(target, "forward");
                  }, navigation.forward.length === 0)
                }
              >
                進む
                <span className="menu-shortcut">Alt+→</span>
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={up === null}
                aria-keyshortcuts="Alt+ArrowUp"
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("navigation", event)}
                onClick={() =>
                  runMenuAction(() => {
                    if (up !== null) navigate(up);
                  }, up === null)
                }
              >
                上のフォルダへ
                <span className="menu-shortcut">Alt+↑</span>
              </button>
            </div>
          )}
        </div>

        <div className="menu-group">
          <button
            ref={(node) => {
              menuTriggerRefs.current.view = node;
            }}
            className="menu-trigger"
            type="button"
            role="menuitem"
            aria-label="表示"
            aria-haspopup="menu"
            aria-expanded={activeMenu === "view"}
            aria-controls="view-menu"
            aria-keyshortcuts="Alt+V"
            tabIndex={menuTabStop === "view" ? 0 : -1}
            onFocus={() => setMenuTabStop("view")}
            onClick={() => {
              setMenuTabStop("view");
              toggleMenu("view");
            }}
            onKeyDown={(event) => handleMenuTriggerKeyDown("view", event)}
          >
            表示(V)
          </button>
          {activeMenu === "view" && (
            <div
              ref={(node) => {
                menuPopupRefs.current.view = node;
              }}
              id="view-menu"
              className="menu-popup menu-popup--view"
              role="menu"
              aria-label="表示"
            >
              <span className="menu-heading">並べ替え条件</span>
              {([
                ["name", "名前"],
                ["modified", "更新日時"],
                ["size", "サイズ"],
                ["kind", "種類"],
              ] as const).map(([field, label], index) => (
                <button
                  key={field}
                  type="button"
                  role="menuitemradio"
                  tabIndex={index === 0 ? 0 : -1}
                  aria-checked={sortField === field}
                  onFocus={(event) => markMenuItemActive(event.currentTarget)}
                  onKeyDown={(event) => handleMenuItemKeyDown("view", event)}
                  onClick={() =>
                    runMenuAction(() => changeSort(field, sortDescending))
                  }
                >
                  {label}で並べ替え
                </button>
              ))}
              <div className="menu-separator" role="separator" />
              <span className="menu-heading">順序</span>
              <button
                type="button"
                role="menuitemradio"
                tabIndex={-1}
                aria-checked={!sortDescending}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("view", event)}
                onClick={() => runMenuAction(() => changeSort(sortField, false))}
              >
                昇順
              </button>
              <button
                type="button"
                role="menuitemradio"
                tabIndex={-1}
                aria-checked={sortDescending}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("view", event)}
                onClick={() => runMenuAction(() => changeSort(sortField, true))}
              >
                降順
              </button>
              <div className="menu-separator" role="separator" />
              <span className="menu-heading">ワークスペース</span>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={treeVisible}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("view", event)}
                onClick={() => runMenuAction(() => setTreeVisible((current) => !current))}
              >
                フォルダツリー {treeVisible ? "を隠す" : "を表示"}
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={toolbarVisible}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("view", event)}
                onClick={() => runMenuAction(() => setToolbarVisible((current) => !current))}
              >
                ツールバー {toolbarVisible ? "を隠す" : "を表示"}
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={menuBarVisible}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("view", event)}
                onClick={() => runMenuAction(() => setMenuBarVisible((current) => !current))}
              >
                メニューバー {menuBarVisible ? "を隠す" : "を表示"}
              </button>
              <div className="menu-separator" role="separator" />
              <span className="menu-heading">一覧形式</span>
              {CATALOG_VIEW_MODES.filter((mode) => mode !== "reference_tile").map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  tabIndex={-1}
                  aria-checked={catalogViewMode === mode}
                  onFocus={(event) => markMenuItemActive(event.currentTarget)}
                  onKeyDown={(event) => handleMenuItemKeyDown("view", event)}
                  onClick={() =>
                    runMenuAction(() => changeCatalogViewMode(mode))
                  }
                >
                  {CATALOG_VIEW_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="menu-group">
          <button
            ref={(node) => {
              menuTriggerRefs.current.library = node;
            }}
            className="menu-trigger"
            type="button"
            role="menuitem"
            aria-label="ライブラリ"
            aria-haspopup="menu"
            aria-expanded={activeMenu === "library"}
            aria-controls="library-menu"
            aria-keyshortcuts="Alt+L"
            tabIndex={menuTabStop === "library" ? 0 : -1}
            onFocus={() => setMenuTabStop("library")}
            onClick={() => {
              setMenuTabStop("library");
              toggleMenu("library");
            }}
            onKeyDown={(event) => handleMenuTriggerKeyDown("library", event)}
          >
            ライブラリ(L)
          </button>
          {activeMenu === "library" && (
            <div
              ref={(node) => {
                menuPopupRefs.current.library = node;
              }}
              id="library-menu"
              className="menu-popup"
              role="menu"
              aria-label="ライブラリ"
            >
              <button
                type="button"
                role="menuitem"
                data-product-id="favorites-menu-item"
                tabIndex={0}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("library", event)}
                onClick={() =>
                  runMenuAction(() => {
                    setFavoritesOpen(true);
                    void refreshFavorites();
                  })
                }
              >
                お気に入り
              </button>
              <button
                type="button"
                role="menuitem"
                data-product-id="bookshelf-menu-item"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("library", event)}
                onClick={() => runMenuAction(() => setBookshelfOpen(true))}
              >
                本棚
              </button>
              <button
                type="button"
                role="menuitem"
                aria-disabled={selectedPath === null}
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("library", event)}
                onClick={() => runMenuAction(addSelectedToBookshelf, selectedPath === null)}
              >
                本棚に追加
              </button>
              <button
                type="button"
                role="menuitem"
                data-product-id="history-menu-item"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("library", event)}
                onClick={() =>
                  runMenuAction(() => {
                    setHistoryOpen(true);
                    void refreshHistory();
                  })
                }
              >
                閲覧履歴
              </button>
              <button
                type="button"
                role="menuitem"
                data-product-id="tag-manager-menu-item"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("library", event)}
                onClick={() => runMenuAction(openTagsPanel)}
              >
                タグ管理
              </button>
              <div className="menu-separator" role="separator" />
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={diagnosticsLoading}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("library", event)}
                onClick={() =>
                  runMenuAction(
                    () => void runDiagnostics(false),
                    diagnosticsLoading,
                  )
                }
              >
                ライブラリ診断…
              </button>
            </div>
          )}
        </div>

        <div className="menu-group">
          <button
            ref={(node) => {
              menuTriggerRefs.current.help = node;
              helpTriggerRef.current = node;
            }}
            className="menu-trigger"
            type="button"
            role="menuitem"
            aria-label="ヘルプ"
            data-product-id="help-menu-trigger"
            aria-haspopup="menu"
            aria-expanded={activeMenu === "help"}
            aria-controls="help-menu"
            aria-keyshortcuts="Alt+H"
            tabIndex={menuTabStop === "help" ? 0 : -1}
            onFocus={() => setMenuTabStop("help")}
            onClick={() => {
              setMenuTabStop("help");
              toggleMenu("help");
            }}
            onKeyDown={(event) => handleMenuTriggerKeyDown("help", event)}
          >
            ヘルプ(H)
          </button>
          {activeMenu === "help" && (
            <div
              ref={(node) => {
                menuPopupRefs.current.help = node;
              }}
              id="help-menu"
              className="menu-popup"
              role="menu"
              aria-label="ヘルプ"
            >
              <button
                type="button"
                role="menuitem"
                data-product-id="settings-menu-item"
                tabIndex={0}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("help", event)}
                onClick={() => runMenuAction(openSettingsDialog)}
              >
                統合設定…
              </button>
              <button
                type="button"
                role="menuitem"
                data-product-id="shortcut-help-menu-item"
                tabIndex={0}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("help", event)}
                onClick={() => runMenuAction(() => setHelpOpen(true))}
              >
                キー操作とショートカット…
              </button>
            </div>
          )}
        </div>
      </nav>}
      {toolbarVisible && <div className="toolbar" aria-label="ナビゲーション">
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
        <label>
          履歴
          <select
            aria-label="履歴ドロップダウン"
            value=""
            onChange={(event) => {
              if (event.target.value !== "") navigate(event.target.value);
            }}
          >
            <option value="">移動履歴</option>
            {[...navigation.back].reverse().map((path, index) => (
              <option key={`back-${path}-${index}`} value={path}>
                戻る: {path || "ライブラリ"}
              </option>
            ))}
            {navigation.forward.map((path, index) => (
              <option key={`forward-${path}-${index}`} value={path}>
                進む: {path || "ライブラリ"}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={up === null}
          onClick={() => up !== null && navigate(up)}
          title="上へ"
        >
          ↑
        </button>
        <div className="icon-command-toolbar" aria-label="コマンドツールバー">
          <button type="button" aria-label="現在場所を更新" data-product-id="toolbar-refresh" onClick={refreshCatalog}>⟳</button>
          <button type="button" aria-label="選択パスをコピー" data-product-id="toolbar-copy-path" onClick={() => void copySelectedPaths()}>⧉</button>
          <button type="button" aria-label="選択項目のプロパティ" data-product-id="toolbar-properties" disabled={selectedPaths.length !== 1} onClick={() => setPropertiesOpen(true)}>ⓘ</button>
          <button type="button" aria-label="本棚を表示" data-product-id="toolbar-bookshelf" onClick={() => setBookshelfOpen(true)}>▤</button>
          <button
            type="button"
            aria-label="参照型タイル"
            aria-pressed={catalogViewMode === "reference_tile"}
            data-product-id="toolbar-reference-tile"
            onClick={() => changeCatalogViewMode(catalogViewMode === "reference_tile" ? "cover_list" : "reference_tile")}
          >
            ▦
          </button>
        </div>
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
      </div>}
      {(diagnosticsOpen || diagnosticsLoading || diagnosticNotice !== null) && (
        <section
          className="diagnostic-panel"
          aria-label="ライブラリ診断"
          aria-busy={diagnosticsLoading}
        >
          <div className="diagnostic-panel-heading">
            <h2>ライブラリ診断</h2>
            <button
              type="button"
              onClick={() => {
                setDiagnosticsOpen(false);
                setDiagnosticNotice(null);
              }}
            >
              閉じる
            </button>
          </div>
          {diagnosticsLoading && (
            <div role="status" data-diagnostic-loading="true">
              ライブラリを読み取り中です。
              <button type="button" onClick={cancelDiagnostics}>
                診断をキャンセル
              </button>
            </div>
          )}
          {diagnosticNotice !== null && (
            <p role="alert" data-diagnostic-notice="true">
              {diagnosticNotice}
            </p>
          )}
          {diagnosticReport !== null && (
            <>
              <p
                data-diagnostic-summary
                data-scanned-count={diagnosticReport.summary.scanned}
                data-finding-count={diagnosticReport.summary.findings}
              >
                検査 {diagnosticReport.summary.scanned}項目、問題 {diagnosticReport.summary.findings}件
                （追加 {diagnosticReport.summary.added} / 変更 {diagnosticReport.summary.changed} /
                欠落 {diagnosticReport.summary.missing} / 重複 {diagnosticReport.summary.duplicates} /
                破損 {diagnosticReport.summary.corrupt}）
              </p>
              {diagnosticReport.findings.length === 0 ? (
                <p role="status">問題は見つかりませんでした。</p>
              ) : (
                <ul aria-label="診断結果">
                  {diagnosticReport.findings.map((finding, index) => (
                    <li
                      key={`${finding.itemIdentity}-${finding.status}-${index}`}
                      data-diagnostic-status={finding.status}
                      data-diagnostic-severity={finding.severity}
                      data-diagnostic-path={finding.relativePath ?? finding.itemIdentity}
                    >
                      <span>{finding.relativePath ?? finding.itemIdentity}</span>
                      <span>{diagnosticStatusLabel(finding.status)}</span>
                      <span>{diagnosticSeverityLabel(finding.severity)}</span>
                      <span>{finding.message}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={() => void runDiagnostics(true)}>
                診断を再実行
              </button>
            </>
          )}
          {diagnosticReport === null && !diagnosticsLoading && diagnosticNotice === null && (
            <p role="status">診断結果はまだありません。</p>
          )}
        </section>
      )}
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
          addressInputDirty.current = false;
          navigate(relative);
        }}
      >
        <label htmlFor="address">アドレス</label>
        <input
          id="address"
          value={addressInput}
          onChange={(event) => {
            addressInputDirty.current = true;
            setAddressInput(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setAddressInput(absoluteAddress);
          }}
        />
        <button type="submit">移動</button>
        <button
          type="button"
          data-product-id="workspace-restore-controls"
          onClick={() => {
            const restored = restoreWorkspaceDisplay();
            setTreeVisible(restored.treeVisible);
            setToolbarVisible(restored.toolbarVisible);
            setMenuBarVisible(restored.menuBarVisible);
          }}
        >
          UIを表示
        </button>
        <button
          type="button"
          data-product-id="task-tray-toggle"
          disabled={!trayApiAvailable}
          title={trayApiAvailable ? "タスクトレイへ収納" : "この実行環境ではタスクトレイAPIを利用できません"}
          onClick={() => {
            if (trayApiAvailable) setTrayStored(true);
          }}
        >
          タスクトレイへ収納
        </button>
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
      <form
        className="filter-bar"
        aria-label="ファイルマスクフォーム"
        onSubmit={(event) => event.preventDefault()}
      >
        <label htmlFor="file-mask">ファイルマスク</label>
        <input
          id="file-mask"
          aria-label="ファイルマスク"
          value={fileMask}
          onChange={(event) => setFileMask(event.target.value)}
          placeholder="*.jpg;*.cbz"
        />
        <button type="button" onClick={() => setFileMask("")}>全件</button>
      </form>
      <div
        className="workspace"
        style={{
          gridTemplateColumns: workspaceGridColumns(treeVisible, treeWidth),
        }}
      >
        {treeVisible && (
          <>
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
          </>
        )}
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
                <button
                  data-product-id="catalog-error-return"
                  onClick={() => setLoadState({ status: "ready" })}
                >
                  一覧へ戻る
                </button>
              )}
              {up !== null && <button onClick={() => navigate(up)}>親フォルダへ</button>}
              <button onClick={() => void chooseRootWithPicker()}>別のフォルダを選択</button>
            </div>
          ) : searchState.status === "idle" && loadState.status !== "error" ? (
            <CatalogGrid
              entries={visibleEntries}
              selectedPath={selectedPath}
              selectedPaths={selectedPaths}
              viewMode={catalogViewMode}
              onSelect={selectEntry}
              onNavigate={(entry) => navigate(entry.relativePath)}
              onRead={openComicEntry}
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
        <span>
          現在位置: {selectedPath === null ? "—" : `${Math.max(1, visibleEntries.findIndex((entry) => entry.relativePath === selectedPath) + 1)}/${visibleEntries.length}`}
        </span>
        <span>{visibleEntries.length}項目</span>
        <span>{selectedPaths.length}件選択</span>
        <span>{selected ? `選択: ${selected.relativePath}` : "選択なし"}</span>
        <span>{loadState.status === "loading" ? "読み込み中" : "準備完了"}</span>
        {selectionNotice !== null && <span role="status">{selectionNotice}</span>}
      </footer>
      {settingsOpen && settingsDraft !== null && (
        <div className="dialog-backdrop">
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="統合設定"
          >
            <h2>統合設定</h2>
            <p>表示・操作設定だけを扱います。library path、秘密情報、machine固有値はprofileに含めません。</p>
            <div className="settings-grid">
              <label>
                一覧形式
                <select
                  aria-label="profile一覧形式"
                  value={settingsDraft.catalogViewMode}
                  onChange={(event) => setSettingsDraft((current) => current === null ? current : {
                    ...current,
                    catalogViewMode: normalizeCatalogViewMode(event.target.value),
                  })}
                >
                  {CATALOG_VIEW_MODES.map((mode) => <option key={mode} value={mode}>{CATALOG_VIEW_MODE_LABELS[mode]}</option>)}
                </select>
              </label>
              <label>
                閲覧モード
                <select
                  aria-label="profile閲覧モード"
                  value={settingsDraft.viewMode}
                  onChange={(event) => setSettingsDraft((current) => current === null ? current : {
                    ...current,
                    viewMode: event.target.value as SettingsProfile["viewMode"],
                  })}
                >
                  <option value="single">単ページ</option>
                  <option value="spread">見開き</option>
                </select>
              </label>
              <label>
                閲覧レイアウト
                <select
                  aria-label="profile閲覧レイアウト"
                  value={settingsDraft.layoutMode}
                  onChange={(event) => setSettingsDraft((current) => current === null ? current : {
                    ...current,
                    layoutMode: normalizeViewerLayoutMode(event.target.value),
                  })}
                >
                  {VIEWER_LAYOUT_MODES.map((mode) => <option key={mode} value={mode}>{VIEWER_LAYOUT_MODE_LABELS[mode]}</option>)}
                </select>
              </label>
              <label>
                巻末動作
                <select
                  aria-label="profile巻末動作"
                  value={settingsDraft.endOfVolumePolicy}
                  onChange={(event) => setSettingsDraft((current) => current === null ? current : {
                    ...current,
                    endOfVolumePolicy: normalizeEndOfVolumePolicy(event.target.value),
                  })}
                >
                  {Object.entries(END_OF_VOLUME_POLICY_LABELS).map(([policy, label]) => <option key={policy} value={policy}>{label}</option>)}
                </select>
              </label>
              <label>
                読み方向
                <select
                  aria-label="profile読み方向"
                  value={settingsDraft.readingDirection}
                  onChange={(event) => setSettingsDraft((current) => current === null ? current : {
                    ...current,
                    readingDirection: event.target.value as SettingsProfile["readingDirection"],
                  })}
                >
                  <option value="rightToLeft">右開き</option>
                  <option value="leftToRight">左開き</option>
                </select>
              </label>
              <label>
                ルーペ
                <input
                  type="checkbox"
                  aria-label="profileルーペ"
                  checked={settingsDraft.loupeEnabled}
                  onChange={(event) => setSettingsDraft((current) => current === null ? current : {
                    ...current,
                    loupeEnabled: event.target.checked,
                  })}
                />
              </label>
            </div>
            <section aria-label="マウスジェスチャー設定">
              <h3>マウスジェスチャー</h3>
              {MOUSE_GESTURE_NAMES.map((name) => (
                <label key={name}>
                  {name}
                  <select
                    aria-label={`${name}ジェスチャー`}
                    value={settingsDraft.mouseGestures[name]}
                    onChange={(event) => {
                      const action = event.target.value as MouseGestureBindings[typeof name];
                      const current = settingsDraft.mouseGestures;
                      const next = { ...current, [name]: action };
                      const duplicate = action !== "none" && MOUSE_GESTURE_NAMES.some((candidate) => candidate !== name && current[candidate] === action);
                      if (duplicate) {
                        setProfileNotice("同じマウスジェスチャー動作は複数へ割り当てできません。");
                        return;
                      }
                      setProfileNotice(null);
                      setSettingsDraft({ ...settingsDraft, mouseGestures: next });
                    }}
                  >
                    {MOUSE_GESTURE_ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}
                  </select>
                </label>
              ))}
            </section>
            {profileNotice !== null && <p role="status">{profileNotice}</p>}
            <div className="settings-actions">
              <button type="button" onClick={exportSettingsProfile}>profileを書き出す</button>
              <label className="file-button">
                profileを読み込む
                <input type="file" accept="application/json,.json" onChange={importSettingsProfile} />
              </label>
              <button type="button" onClick={() => applySettingsProfile(settingsDraft)}>適用</button>
              <button type="button" onClick={() => setSettingsOpen(false)}>キャンセル</button>
            </div>
          </section>
        </div>
      )}
      {helpOpen && (
        <div className="dialog-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            data-product-id="shortcut-dialog"
            className="help-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeHelp();
            }}
          >
            <h2 id="help-title">キー操作とショートカット</h2>
            <section aria-label="一般ヘルプ">
              <h3>一般ヘルプ</h3>
              <p>フォルダを登録し、項目をEnterで開きます。漫画はCtrl+Enterまたはダブルクリックで読み始めます。</p>
              <p data-product-id="version-info">バージョン {APP_VERSION} / runtime: Tauri WebView2またはブラウザ / license: THIRD-PARTY-NOTICES.md</p>
            </section>
            <p>Enter: フォルダを開く / Ctrl+Enter: 漫画として読む</p>
            <p>Esc: アドレス編集を戻す / 矢印: 項目を移動</p>
            <section aria-label="ショートカット設定">
              <h3>ショートカット設定</h3>
              <p>変更はこの端末のアプリデータだけに保存され、漫画ファイルや外部通信には影響しません。</p>
              {SHORTCUT_COMMANDS.map((command) => (
                <div key={command} data-shortcut-command={command}>
                  <label htmlFor={`shortcut-${command}`}>
                    {SHORTCUT_LABELS[command]}
                  </label>
                  <input
                    id={`shortcut-${command}`}
                    aria-label={`${SHORTCUT_LABELS[command]}ショートカット`}
                    value={shortcuts[command]}
                    readOnly
                    onKeyDown={(event) => captureShortcut(command, event)}
                  />
                  <span>
                    既定: {DEFAULT_SHORTCUTS[command]} / フォールバック:{" "}
                    {SHORTCUT_FALLBACKS[command]}
                  </span>
                  <button
                    type="button"
                    aria-label={`${SHORTCUT_LABELS[command]}を既定に戻す`}
                    onClick={() => resetShortcut(command)}
                  >
                    既定に戻す
                  </button>
                </div>
              ))}
              <button type="button" onClick={resetAllShortcuts}>
                すべて既定に戻す
              </button>
              <p
                role="status"
                aria-live="polite"
                data-shortcut-save-status={shortcutSaveState}
              >
                {shortcutSaveState === "saving"
                  ? "ショートカットを保存中です。"
                  : shortcutSaveState === "saved"
                    ? "ショートカットを保存しました。"
                    : shortcutSaveState === "error"
                      ? "ショートカットの保存に失敗しました。"
                      : "ショートカットの変更はありません。"}
              </p>
              {shortcutNotice !== null && <p role="alert">{shortcutNotice}</p>}
            </section>
            <button data-product-id="shortcut-dialog-close" autoFocus onClick={closeHelp}>閉じる</button>
          </div>
        </div>
      )}
      {propertiesOpen && selected !== undefined && (
        <div className="dialog-backdrop">
          <section
            className="properties-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="項目プロパティ"
          >
            <h2>項目プロパティ</h2>
            <dl>
              <div><dt>名前</dt><dd>{entryDisplayName(selected)}</dd></div>
              <div><dt>種別</dt><dd>{entryKindLabel(selected)}</dd></div>
              <div><dt>相対パス</dt><dd>{selected.relativePath}</dd></div>
              <div><dt>サイズ</dt><dd>{selected.byteSize?.toLocaleString("ja-JP") ?? "—"} bytes</dd></div>
              <div><dt>更新日時</dt><dd>{selected.modifiedMs === undefined ? "—" : new Date(selected.modifiedMs).toLocaleString("ja-JP")}</dd></div>
            </dl>
            <button type="button" onClick={() => setPropertiesOpen(false)}>閉じる</button>
          </section>
        </div>
      )}
      {tagsOpen && (
        <div className="dialog-backdrop">
          <section
            className="tag-manager-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="タグ管理"
          >
            <div className="quick-access-heading">
              <h2>タグ管理</h2>
              <button type="button" onClick={closeTagsPanel}>
                閉じる
              </button>
            </div>
            <p>
              選択中: {selectedPath ?? "項目を選択するとタグを付与できます。"}
            </p>
            {selectedPath !== null && (
              <>
                <form
                  aria-label="タグ付与フォーム"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void assignTagToSelected();
                  }}
                >
                  <label htmlFor="tag-name">タグ名</label>
                  <input
                    id="tag-name"
                    aria-label="タグ名"
                    value={tagNameDraft}
                    onChange={(event) => setTagNameDraft(event.target.value)}
                  />
                  <button type="submit" disabled={tagsLoading}>
                    タグを付与
                  </button>
                </form>
                <div aria-label="選択項目のタグ">
                  {selectedTags.length === 0 ? (
                    <p role="status">タグはありません。</p>
                  ) : (
                    <ul>
                      {selectedTags.map((tag) => (
                        <li key={tag.tagId} data-item-tag-id={tag.tagId}>
                          <span>{tag.name}</span>
                          <button
                            type="button"
                            aria-label={`${tag.name}を除去`}
                            onClick={() => void removeTagFromSelected(tag)}
                            disabled={tagsLoading}
                          >
                            除去
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
            <form
              aria-label="タグ検索フォーム"
              onSubmit={(event) => {
                event.preventDefault();
                void refreshTags(tagQuery);
              }}
            >
              <label htmlFor="tag-query">タグ検索</label>
              <input
                id="tag-query"
                aria-label="タグ検索"
                value={tagQuery}
                onChange={(event) => {
                  const query = event.target.value;
                  setTagQuery(query);
                  void refreshTags(query);
                }}
              />
              <button type="submit" disabled={tagsLoading}>
                検索
              </button>
            </form>
            {tagNotice !== null && <p role="alert">{tagNotice}</p>}
            {tagsLoading && <p role="status">タグを読み込み中です。</p>}
            {!tagsLoading && tagResults.length === 0 && (
              <p role="status">タグはありません。</p>
            )}
            {tagResults.length > 0 && (
              <ul aria-label="タグ一覧">
                {tagResults.map((tag) => (
                  <li key={tag.tagId} data-tag-id={tag.tagId}>
                    <span>{tag.name}</span>
                    <span>{tag.itemCount}件</span>
                    <input
                      aria-label={`${tag.name}の新名称`}
                      value={tagRenameDrafts[tag.tagId] ?? tag.name}
                      onChange={(event) =>
                        setTagRenameDrafts((current) => ({
                          ...current,
                          [tag.tagId]: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      aria-label={`${tag.name}をrename`}
                      onClick={() => void renameTagEntry(tag)}
                      disabled={tagsLoading}
                    >
                      名前変更
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {favoritesOpen && (
        <QuickAccess
          favorites={favorites}
          loading={favoritesLoading}
          refreshRevision={favoriteRefreshRevision}
          notice={favoriteNotice}
          onClose={() => setFavoritesOpen(false)}
          onRefresh={() => void refreshFavorites()}
          onOpen={openFavorite}
          onResolve={reResolveFavorite}
          onRemove={removeFavoriteEntry}
        />
      )}
      {bookshelfOpen && (
        <div className="dialog-backdrop">
          <section className="bookshelf-dialog" role="dialog" aria-modal="true" aria-label="本棚">
            <div className="quick-access-heading">
              <h2>本棚</h2>
              <button type="button" onClick={() => setBookshelfOpen(false)}>閉じる</button>
            </div>
            {bookshelfPaths.length === 0 ? (
              <p role="status">本棚に登録された項目はありません。</p>
            ) : (
              <ul aria-label="本棚の項目">
                {bookshelfPaths.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => {
                        setBookshelfOpen(false);
                        navigate(parentPath(path) ?? "", "push", path);
                      }}
                    >
                      {path}
                    </button>
                    <button
                      type="button"
                      aria-label={`${path}を本棚から除去`}
                      onClick={() => setBookshelfPaths(removeBookshelfItem(path))}
                    >
                      除去
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {historyOpen && (
        <div className="dialog-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="閲覧履歴"
            className="history-dialog"
            data-product-id="history-dialog"
          >
            <h2>閲覧履歴</h2>
            {historyLoading && <p role="status">履歴を読み込み中です。</p>}
            {historyNotice !== null && <p role="alert">{historyNotice}</p>}
            {!historyLoading && historyNotice === null && (
              <ol>
                {readingHistory.map((entry) => (
                  <li
                    key={entry.itemIdentity}
                    data-product-id="history-row"
                    data-history-item={entry.itemIdentity}
                  >
                    <span>{entry.itemIdentity}</span>
                    <span>{entry.lastViewedAtMs}</span>
                  </li>
                ))}
              </ol>
            )}
            <button
              type="button"
              data-product-id="history-refresh"
              onClick={() => void refreshHistory()}
            >
              更新
            </button>
            <button
              type="button"
              data-product-id="history-close"
              onClick={() => setHistoryOpen(false)}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
