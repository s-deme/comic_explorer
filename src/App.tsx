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
  saveSettingsProfile,
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
  getTrayStatus,
  storeMainWindowInTray,
  quitApplication,
  renameFileItem,
  createFileFolder,
  copyFileItemsToFolder,
  moveFileItemsToFolder,
  deleteFileItems,
  setFileClipboard,
  getFileClipboardStatus,
  pasteFileItems,
  revealFileItem,
  openFileItemDefault,
  openFileItemWith,
  type CatalogSettings,
  type DiagnosticReport,
  type FavoriteEntry,
  type FileClipboardStatus,
  type FileOperationResult,
  type ItemMetadata,
  type TagEntry,
  type ReadingHistoryEntry,
  type TrayStatus,
  type ViewerSession,
} from "./features/library/client";
import {
  CatalogContextMenu,
  type CatalogContextAction,
} from "./features/catalog/CatalogContextMenu";
import {
  previousComicEntry,
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
import { normalizeViewerLayoutMode } from "./features/viewer/model";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_COMMANDS,
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
import type { ApiResponse } from "./types/api";
import type { ThumbnailViewState } from "./features/catalog/CatalogGrid";
import {
  CATALOG_VIEW_MODE_LABELS,
  CATALOG_VIEW_MODES,
  DEFAULT_CATALOG_VIEW_MODE,
  normalizeCatalogViewMode,
  type CatalogViewMode,
} from "./features/catalog/view-mode";
import {
  formatThumbnailBytes,
  createManagedThumbnailMap,
  hasLegacyManagedThumbnails,
  loadManagedThumbnailsForLibrary,
  managedThumbnailFor,
  mergeImportedThumbnails,
  readJpegFile,
  resolveImportTargets,
  saveManagedThumbnailsForLibrary,
  saveThumbnailDataUrl,
  thumbnailDownloadName,
  thumbnailStats,
  type ImportedThumbnail,
  type ManagedThumbnailMap,
} from "./features/catalog/thumbnail-maintenance";
import { QuickAccess } from "./features/catalog/QuickAccess";
import {
  restoreWorkspaceDisplay,
  shellGridRows,
  trayStatusAvailable,
  workspaceGridColumns,
} from "./features/workspace/display";
import {
  APP_VERSION,
  CONFIGURABLE_MOUSE_GESTURE_NAMES,
  createDefaultSettingsProfile,
  DEFAULT_MOUSE_GESTURES,
  normalizeMouseGestures,
  normalizeSettingsProfile,
  type MouseGestureAction,
  type MouseGestureBindings,
  type MouseGestureName,
  type SettingsProfile,
} from "./features/settings/profile";
import { SettingsDialog } from "./features/settings/SettingsDialog";
import {
  addBookshelfItemResult,
  listBookmarks,
  listBookshelf,
  migrateLegacyCollections,
  nextBookmark,
  removeBookshelfItemResult,
  saveBookmarkResult,
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
import {
  defaultSearchOptions,
  toSearchRequestOptions,
  type SearchDateComparison,
  type SearchDateMode,
  type SearchOptions,
  type SearchSizeComparison,
} from "./features/catalog/search-options";
import { archiveKindFromPath, itemKindLabel } from "./features/catalog/kind-label";
import THIRD_PARTY_NOTICES from "../THIRD-PARTY-NOTICES.md?raw";

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

type MenuId = "file" | "edit" | "view" | "options" | "help";
type ToolbarMenuId = "sort" | "catalogView";
type ViewerLaunchMode = "normal" | "fullscreen" | "slideshow";

interface CatalogContextMenuState {
  entry: CatalogEntry | null;
  x: number;
  y: number;
}

interface FileNameDialogState {
  kind: "rename" | "create";
  entry: CatalogEntry | null;
  value: string;
}

interface FileDeleteDialogState {
  paths: string[];
  permanent: boolean;
  label: string;
}

const MENU_ORDER: MenuId[] = ["file", "edit", "view", "options", "help"];
const MENU_MNEMONICS: Record<string, MenuId> = {
  f: "file",
  e: "edit",
  v: "view",
  o: "options",
  h: "help",
};

function entryDisplayName(entry: CatalogEntry): string {
  return entry.relativePath.split("/").at(-1) ?? entry.relativePath;
}

function nonNegativeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function entryKindLabel(entry: CatalogEntry): string {
  return itemKindLabel(entry.kind, entry.relativePath, entry.archiveKind);
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
  const trayGeneration = useRef(0);
  const favoriteGeneration = useRef(0);
  const metadataGeneration = useRef(0);
  const ratingSaveGeneration = useRef(0);
  const ratingSaveInFlight = useRef(false);
  const historyGeneration = useRef(0);
  const tagGeneration = useRef(0);
  const itemTagGeneration = useRef(0);
  const diagnosticGeneration = useRef(0);
  const fileOperationGeneration = useRef(0);
  const thumbnailRequests = useRef(new Set<string>());
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuBarRef = useRef<HTMLElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const menuTriggerRefs = useRef<Record<MenuId, HTMLButtonElement | null>>({
    file: null,
    edit: null,
    view: null,
    options: null,
    help: null,
  });
  const menuPopupRefs = useRef<Record<MenuId, HTMLDivElement | null>>({
    file: null,
    edit: null,
    view: null,
    options: null,
    help: null,
  });
  const pendingMenuFocus = useRef<"first" | "last">("first");
  const pendingToolbarMenuFocus = useRef<"first" | "last">("first");
  const toolbarMenuTriggerRefs = useRef<Record<ToolbarMenuId, HTMLButtonElement | null>>({
    sort: null,
    catalogView: null,
  });
  const toolbarMenuPopupRefs = useRef<Record<ToolbarMenuId, HTMLDivElement | null>>({
    sort: null,
    catalogView: null,
  });
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
  const [managedThumbnails, setManagedThumbnails] = useState<ManagedThumbnailMap>(
    createManagedThumbnailMap,
  );
  const managedThumbnailsRef = useRef(managedThumbnails);
  const managedThumbnailRoot = useRef<string | null>(null);
  const [thumbnailManagerOpen, setThumbnailManagerOpen] = useState(false);
  const [thumbnailManagerNotice, setThumbnailManagerNotice] = useState<string | null>(null);
  const [legacyThumbnailDataPresent, setLegacyThumbnailDataPresent] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const selectionAnchor = useRef<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [fileMask, setFileMask] = useState("");
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [catalogContextMenu, setCatalogContextMenu] =
    useState<CatalogContextMenuState | null>(null);
  const [fileClipboard, setFileClipboardStatus] = useState<FileClipboardStatus>({
    available: false,
    cut: false,
    items: 0,
  });
  const [fileOperationBusy, setFileOperationBusy] = useState(false);
  const [fileNameDialog, setFileNameDialog] = useState<FileNameDialogState | null>(null);
  const [fileDeleteDialog, setFileDeleteDialog] = useState<FileDeleteDialogState | null>(null);
  const [recentEntries, setRecentEntries] = useState<CatalogEntry[]>([]);
  const [bookmarks, setBookmarks] = useState<PageBookmark[]>([]);
  const [bookmarkNotice, setBookmarkNotice] = useState<string | null>(null);
  const [bookshelfOpen, setBookshelfOpen] = useState(false);
  const [bookshelfPaths, setBookshelfPaths] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDescending, setSortDescending] = useState(false);
  const [catalogViewMode, setCatalogViewMode] = useState<CatalogViewMode>(
    DEFAULT_CATALOG_VIEW_MODE,
  );
  const persistedCatalogViewMode = useRef<CatalogViewMode>(DEFAULT_CATALOG_VIEW_MODE);
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsProfile | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [mouseGestures, setMouseGestures] = useState<MouseGestureBindings>(() => ({
    ...DEFAULT_MOUSE_GESTURES,
  }));
  const [activeMenu, setActiveMenu] = useState<MenuId | null>(null);
  const [activeToolbarMenu, setActiveToolbarMenu] = useState<ToolbarMenuId | null>(null);
  const [menuTabStop, setMenuTabStop] = useState<MenuId>("file");
  const [treeWidth, setTreeWidth] = useState(240);
  const [treeVisible, setTreeVisible] = useState(true);
  const [menuBarVisible, setMenuBarVisible] = useState(true);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [viewerDetached, setViewerDetached] = useState(false);
  const [trayStatus, setTrayStatus] = useState<TrayStatus | null>(null);
  const [trayNotice, setTrayNotice] = useState<string | null>(null);
  const [runtimeLabel, setRuntimeLabel] = useState("確認中");
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [viewerSession, setViewerSession] = useState<ViewerSession | null>(null);
  const [viewerLaunchMode, setViewerLaunchMode] = useState<ViewerLaunchMode>("normal");
  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPaneOpen, setSearchPaneOpen] = useState(false);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>(defaultSearchOptions);
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
  const trayApiAvailable = trayStatusAvailable(trayStatus);

  useEffect(() => {
    try {
      if (libraryRoot === null || managedThumbnailRoot.current !== libraryRoot) return;
      saveManagedThumbnailsForLibrary(
        typeof window === "undefined" ? undefined : window.localStorage,
        libraryRoot,
        managedThumbnails,
      );
    } catch {
      setThumbnailManagerNotice("app-local thumbnailを保存できませんでした。容量を減らして再試行してください。");
    }
  }, [libraryRoot, managedThumbnails]);

  useEffect(() => {
    const requestGeneration = ++trayGeneration.current;
    void Promise.resolve()
      .then(() => getTrayStatus(requestGeneration))
      .then((response) => {
        if (requestGeneration !== trayGeneration.current) return;
        setRuntimeLabel("Tauri WebView2");
        if (response.status === "ok") {
          setTrayStatus(response.data);
          if (!response.data.available && response.data.reason !== null) {
            setTrayNotice(response.data.reason);
          }
        } else if (response.status === "error") {
          const message = response.error.message.trim() || presentError(response.error);
          setTrayStatus({ available: false, stored: false, reason: message });
          setTrayNotice(message);
        }
      })
      .catch(() => {
        if (requestGeneration !== trayGeneration.current) return;
        setRuntimeLabel("ブラウザ");
        setTrayStatus({
          available: false,
          stored: false,
          reason: "この実行環境ではnative task trayを利用できません。",
        });
      });
  }, []);

  function browserStorage(): Storage | undefined {
    try {
      return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
      return undefined;
    }
  }

  function replaceManagedThumbnails(next: ManagedThumbnailMap) {
    managedThumbnailsRef.current = next;
    setManagedThumbnails(next);
  }

  function activateLibraryRoot(root: string) {
    viewerGeneration.current += 1;
    setViewerSession(null);
    setLibraryRoot(root);
    managedThumbnailRoot.current = root;
    const storage = browserStorage();
    replaceManagedThumbnails(loadManagedThumbnailsForLibrary(storage, root));
    setLegacyThumbnailDataPresent(hasLegacyManagedThumbnails(storage));
    setRecentEntries([]);
    setBookmarks([]);
    const migration = migrateLegacyCollections(root);
    setBookshelfPaths(migration.ok ? migration.value.bookshelf : listBookshelf(root));
    if (!migration.ok) {
      setSelectionNotice("app-local collectionをこのlibraryへ移行できませんでした。");
    }
  }

  function deactivateLibraryRoot() {
    viewerGeneration.current += 1;
    setViewerSession(null);
    managedThumbnailRoot.current = null;
    replaceManagedThumbnails(createManagedThumbnailMap());
    setLegacyThumbnailDataPresent(false);
    setBookshelfPaths([]);
    setBookmarks([]);
    setRecentEntries([]);
    setLibraryRoot(null);
  }

  function selectEntry(entry: CatalogEntry, action: SelectionAction = "replace") {
    const next = action === "toggle"
      ? toggleEntrySelection(selectedPaths, entry.relativePath)
      : action === "range"
        ? rangeSelection(
            visibleEntries,
            selectionAnchor.current ?? selectedPath,
            entry.relativePath,
          )
        : [entry.relativePath];
    const active = action === "range"
      ? entry.relativePath
      : action === "toggle" && !next.includes(entry.relativePath)
        ? next.at(-1) ?? null
        : entry.relativePath;
    if (action !== "range") selectionAnchor.current = active;
    setSelectedPaths(next);
    setSelectedPath(active);
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
    if (activeToolbarMenu === null) return;
    const frame = requestAnimationFrame(() => {
      const items = getToolbarMenuItems(activeToolbarMenu);
      focusToolbarMenuItem(
        activeToolbarMenu,
        pendingToolbarMenuFocus.current === "last" ? items.length - 1 : 0,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [activeToolbarMenu]);

  useEffect(() => {
    if (!searchPaneOpen) return;
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [searchPaneOpen]);

  useEffect(() => {
    function handleMnemonic(event: KeyboardEvent) {
      if (event.key === "F5" && libraryRoot !== null && viewerSession === null) {
        event.preventDefault();
        refreshCatalog();
        return;
      }
      const target = event.target;
      const editing = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable);
      if (!editing && libraryRoot !== null && viewerSession === null && !event.altKey) {
        const commandKey = event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && (commandKey === "x" || commandKey === "c")) {
          if (selectedPaths.length === 0) return;
          event.preventDefault();
          const cut = commandKey === "x";
          void runFileOperation(
            (requestGeneration) => setFileClipboard(selectedPaths, cut, requestGeneration),
            (result) => `${result.affected}件を${cut ? "切り取り" : "コピー"}ました。`,
            { refresh: false },
          ).then((succeeded) => {
            if (succeeded) {
              setFileClipboardStatus({ available: true, cut, items: selectedPaths.length });
            }
          });
          return;
        }
        if ((event.ctrlKey || event.metaKey) && commandKey === "v") {
          event.preventDefault();
          void runFileOperation(
            (requestGeneration) => pasteFileItems(navigation.current, requestGeneration),
            (result) => `${result.affected}件を貼り付けました。`,
          ).then(() => void refreshFileClipboardStatus());
          return;
        }
        if (event.key === "Delete" && selectedPaths.length > 0) {
          event.preventDefault();
          setFileDeleteDialog({
            paths: selectedPaths,
            permanent: false,
            label: selectedPaths.length === 1 ? selectedPaths[0] : `${selectedPaths.length}件の項目`,
          });
          return;
        }
      }
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (libraryRoot === null || viewerSession !== null) return;
      if (event.key === "ArrowLeft") {
        const target = navigation.back.at(-1);
        if (target !== undefined) {
          event.preventDefault();
          setActiveMenu(null);
          setActiveToolbarMenu(null);
          navigate(target, "back");
        }
        return;
      }
      if (event.key === "ArrowRight") {
        const target = navigation.forward[0];
        if (target !== undefined) {
          event.preventDefault();
          setActiveMenu(null);
          setActiveToolbarMenu(null);
          navigate(target, "forward");
        }
        return;
      }
      if (event.key === "ArrowUp") {
        const target = parentPath(navigation.current);
        if (target !== null) {
          event.preventDefault();
          setActiveMenu(null);
          setActiveToolbarMenu(null);
          navigate(target);
        }
        return;
      }
      const menuId = MENU_MNEMONICS[event.key.toLowerCase()];
      if (menuId === undefined) return;
      event.preventDefault();
      setActiveToolbarMenu(null);
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
      if (
        activeToolbarMenu !== null &&
        event.target instanceof Node &&
        !toolbarRef.current?.contains(event.target)
      ) {
        setActiveToolbarMenu(null);
      }
    }

    window.addEventListener("keydown", handleMnemonic);
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => {
      window.removeEventListener("keydown", handleMnemonic);
      document.removeEventListener("pointerdown", handleOutsidePointer);
    };
  }, [activeMenu, activeToolbarMenu, libraryRoot, navigation, selectedPath, selectedPaths, viewerSession]);

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
          const restoredCatalogViewMode = normalizeCatalogViewMode(response.data.catalogViewMode);
          persistedCatalogViewMode.current = restoredCatalogViewMode;
          setCatalogViewMode(restoredCatalogViewMode);
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
          setTreeVisible(response.data.treeVisible);
          setMenuBarVisible(response.data.menuBarVisible);
          setToolbarVisible(response.data.toolbarVisible);
          setShortcuts(normalizeShortcutBindings(response.data.shortcuts));
          setMouseGestures(normalizeMouseGestures(response.data.mouseGestures));
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
          activateLibraryRoot(response.data.absolutePath);
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
    const visible = new Set<string>(visibleEntries.map((entry) => entry.relativePath));
    const next = selectedPaths.filter((path) => visible.has(path));
    const nextActive = selectedPath !== null && visible.has(selectedPath)
      ? selectedPath
      : next.at(-1) ?? null;
    if (
      next.length !== selectedPaths.length
      || next.some((path, index) => path !== selectedPaths[index])
    ) {
      setSelectedPaths(next);
    }
    if (nextActive !== selectedPath) setSelectedPath(nextActive);
    if (selectionAnchor.current !== null && !visible.has(selectionAnchor.current)) {
      selectionAnchor.current = nextActive;
    }
  }, [selectedPath, selectedPaths, visibleEntries]);

  useEffect(() => {
    const requestGeneration = generation.current;
    sortedEntries.forEach((entry, index) => {
      if (
        entry.kind !== "archive"
        && entry.kind !== "comicFolder"
        && !(entry.kind === "folder" && entry.hasFolderArchiveCover === true)
      ) return;
      if (managedThumbnailFor(managedThumbnails, entry.relativePath) !== undefined) return;
      if (thumbnails[entry.relativePath] !== undefined) return;
      const priority =
        index < 15 ? "visible" : index < 40 ? "near" : "background";
      queueThumbnail(entry, requestGeneration, priority);
    });
  }, [managedThumbnails, sortedEntries, thumbnails]);

  async function load(relativePath: string, selectionPathsToRestore: readonly string[] = []) {
    generation.current += 1;
    const requestGeneration = generation.current;
    setLoadState({ status: "loading", path: relativePath });
    setThumbnails({});
    thumbnailRequests.current.clear();
    try {
      const response = await listFolder(relativePath, requestGeneration);
      if (requestGeneration !== generation.current) return;
      if (response.status === "ok") {
        setEntries(response.data);
        const available = new Set<string>(response.data.map((entry) => entry.relativePath));
        const nextSelection = selectionPathsToRestore.filter((path) => available.has(path));
        setSelectedPaths(nextSelection);
        const nextActive = nextSelection.at(-1) ?? null;
        selectionAnchor.current = nextActive;
        setSelectedPath(nextActive);
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
      activateLibraryRoot(response.data.absolutePath);
      dispatch({ type: "reset", path: "" });
      await load("");
    } else if (response.status === "error") {
      setLoadState({ status: "error", path: rootInput, message: presentError(response.error) });
    }
  }

  function refreshCatalog() {
    setSelectionNotice(null);
    const selection = selectedPaths.length > 0
      ? selectedPaths
      : selectedPath === null ? [] : [selectedPath];
    void load(navigation.current, selection);
  }

  function selectAll() {
    const next = visibleEntries.map((entry) => entry.relativePath);
    selectionAnchor.current = next.at(-1) ?? null;
    setSelectedPaths(next);
    setSelectedPath(selectionAnchor.current);
    setSelectionNotice(null);
  }

  function selectByKind(kind: CatalogEntry["kind"] | "image") {
    const next = selectEntriesByKind(visibleEntries, kind);
    selectionAnchor.current = next.at(-1) ?? null;
    setSelectedPaths(next);
    setSelectedPath(selectionAnchor.current);
    setSelectionNotice(null);
  }

  function selectFiles() {
    const next = selectEntriesByKind(visibleEntries, "file");
    selectionAnchor.current = next.at(-1) ?? null;
    setSelectedPaths(next);
    setSelectedPath(selectionAnchor.current);
    setSelectionNotice(null);
  }

  function invertSelection() {
    const selected = new Set(selectedPaths);
    const next = visibleEntries
      .filter((entry) => !selected.has(entry.relativePath))
      .map((entry) => entry.relativePath);
    selectionAnchor.current = next.at(-1) ?? null;
    setSelectedPaths(next);
    setSelectedPath(selectionAnchor.current);
    setSelectionNotice(null);
  }

  function clearSelection() {
    selectionAnchor.current = null;
    setSelectedPaths([]);
    setSelectedPath(null);
    setSelectionNotice(null);
  }

  function downloadCatalogCsv() {
    let url: string | null = null;
    try {
      if (typeof URL.createObjectURL !== "function") {
        throw new Error("download unavailable");
      }
      const blob = new Blob([catalogCsv(visibleEntries)], { type: "text/csv;charset=utf-8" });
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "comic-explorer-catalog.csv";
      link.click();
      setSelectionNotice("CSVのダウンロードを開始しました。保存完了はブラウザで確認してください。");
    } catch {
      setSelectionNotice("CSVを出力できませんでした。保存機能を確認してください。");
    } finally {
      if (url !== null) {
        const downloadUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      }
    }
  }

  async function saveDisplayedThumbnail() {
    if (selectedPath === null) {
      setThumbnailManagerNotice("一覧でthumbnail対象を選択してください。");
      return;
    }
    const selectedEntry = entries.find((entry) => entry.relativePath === selectedPath);
    if (selectedEntry?.kind !== "archive" && selectedEntry?.kind !== "comicFolder") {
      setThumbnailManagerNotice("選択項目には保存できるthumbnailがありません。");
      return;
    }
    const managed = managedThumbnailFor(managedThumbnails, selectedPath);
    let dataUrl = managed?.dataUrl;
    if (dataUrl === undefined) {
      try {
        const requestGeneration = generation.current;
        const response = await getThumbnail(selectedPath, requestGeneration, true, "visible");
        if (requestGeneration !== generation.current || response.status !== "ok") {
          setThumbnailManagerNotice("表示中thumbnailの保存用データを更新できませんでした。");
          return;
        }
        dataUrl = response.data.mediaUri;
        setThumbnails((current) => ({
          ...current,
          [selectedPath]: { status: "ready", mediaUri: dataUrl!, cacheHit: response.data.cacheHit },
        }));
      } catch {
        setThumbnailManagerNotice("表示中thumbnailの保存用データを更新できませんでした。");
        return;
      }
    }
    if (dataUrl === undefined) {
      setThumbnailManagerNotice("表示中thumbnailがまだ準備できていません。");
      return;
    }
    try {
      const result = await saveThumbnailDataUrl(dataUrl, thumbnailDownloadName(selectedPath));
      setThumbnailManagerNotice(
        result === "saved"
          ? "表示中thumbnailをJPEGとして保存しました。"
          : "thumbnailのダウンロードを開始しました。保存完了はブラウザで確認してください。",
      );
    } catch (error) {
      setThumbnailManagerNotice(
        error instanceof DOMException && error.name === "AbortError"
          ? "thumbnailの保存をキャンセルしました。"
          : "表示中thumbnailを保存できませんでした。",
      );
    }
  }

  async function importManagedThumbnails(event: React.ChangeEvent<HTMLInputElement>) {
    const rootAtStart = libraryRoot;
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    const targets = resolveImportTargets(files, entries);
    const imports: ImportedThumbnail[] = [];
    const rejected = [...targets.rejected];
    for (const target of targets.accepted) {
      try {
        const loaded = await readJpegFile(target.file);
        imports.push({ ...loaded, itemRelativePath: target.itemRelativePath });
      } catch (error) {
        rejected.push(`${target.file.name}: ${error instanceof Error ? error.message : "読込失敗"}`);
      }
    }
    if (rootAtStart === null || rootAtStart !== libraryRoot || managedThumbnailRoot.current !== rootAtStart) {
      setThumbnailManagerNotice("libraryが変更されたためthumbnail読込を破棄しました。");
      return;
    }
    const merged = mergeImportedThumbnails(managedThumbnailsRef.current, imports);
    replaceManagedThumbnails(merged.thumbnails);
    setThumbnailManagerNotice(
      `${merged.accepted}件を読み込みました。${rejected.length + merged.rejected.length > 0 ? ` ${rejected.concat(merged.rejected).join(" / ")}` : ""}`,
    );
  }

  function clearManagedThumbnails() {
    replaceManagedThumbnails(createManagedThumbnailMap());
    setThumbnailManagerNotice("利用者が読み込んだthumbnailを削除しました。原本は変更していません。");
  }

  async function storeInTray() {
    const requestGeneration = ++trayGeneration.current;
    setTrayNotice(null);
    try {
      const response = await storeMainWindowInTray(requestGeneration);
      if (requestGeneration !== trayGeneration.current) return;
      if (response.status === "ok") {
        setTrayStatus(response.data);
      } else if (response.status === "error") {
        const message = response.error.message.trim() || presentError(response.error);
        setTrayStatus((current) => ({
          available: current?.available ?? false,
          stored: false,
          reason: message,
        }));
        setTrayNotice(message);
      } else {
        setTrayNotice("タスクトレイへの収納をキャンセルしました。");
      }
    } catch {
      if (requestGeneration === trayGeneration.current) {
        setTrayNotice("タスクトレイへ収納できませんでした。ウィンドウは表示したままです。");
      }
    }
  }

  async function exitApplication() {
    const requestGeneration = ++trayGeneration.current;
    setTrayNotice(null);
    try {
      const response = await quitApplication(requestGeneration);
      if (response.status === "error") setTrayNotice(presentError(response.error));
      else if (response.status === "cancelled") setTrayNotice("終了をキャンセルしました。");
    } catch {
      setTrayNotice("アプリケーションを終了できませんでした。");
    }
  }

  function openSelectedEntry() {
    const entry = sortedEntries.find((candidate) => candidate.relativePath === selectedPath);
    if (entry === undefined) return;
    if (entry.kind === "folder") navigate(entry.relativePath);
    else if (
      entry.kind === "comicFolder" || entry.kind === "archive" || entry.kind === "pdf"
      || entry.kind === "page"
    ) {
      openComicEntry(entry);
    }
  }

  function rememberRecent(entry: CatalogEntry) {
    setRecentEntries((current) => [
      entry,
      ...current.filter((candidate) => candidate.relativePath !== entry.relativePath),
    ].slice(0, 12));
  }

  function refreshBookmarks(itemKey: string) {
    setBookmarks(libraryRoot === null ? [] : listBookmarks(itemKey, libraryRoot));
    setBookmarkNotice(null);
  }

  function saveCurrentBookmark(index: number) {
    if (viewerSession === null) return;
    const page = viewerSession.pages[index];
    if (page === undefined) return;
    if (libraryRoot === null) return;
    const result = saveBookmarkResult({
      itemKey: viewerSession.itemKey,
      pageIndex: index,
      pageKey: page.relativePath,
      createdAt: Date.now(),
    }, libraryRoot);
    setBookmarks(result.value);
    setBookmarkNotice(
      result.ok
        ? `しおりを保存しました: ${index + 1}ページ`
        : "しおりを永続化できませんでした。保存先の空き容量を確認してください。",
    );
  }

  function addSelectedToBookshelf() {
    if (selectedPath === null || libraryRoot === null) return;
    const result = addBookshelfItemResult(selectedPath, libraryRoot);
    setBookshelfPaths(result.value);
    if (!result.ok) {
      setSelectionNotice("本棚へ永続化できませんでした。保存先を確認してください。");
    }
  }

  function removeFromBookshelf(path: string) {
    if (libraryRoot === null) return;
    const result = removeBookshelfItemResult(path, libraryRoot);
    setBookshelfPaths(result.value);
    if (!result.ok) {
      setSelectionNotice("本棚からの削除を永続化できませんでした。");
    }
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

  function contextSelectionPaths(): string[] {
    const entry = catalogContextMenu?.entry;
    if (entry === null || entry === undefined) return [];
    return selectedPaths.includes(entry.relativePath)
      ? selectedPaths
      : [entry.relativePath];
  }

  function absoluteLibraryPath(relativePath: string): string | null {
    if (libraryRoot === null) return null;
    if (relativePath.length === 0) return libraryRoot;
    const separator = libraryRoot.includes("\\") ? "\\" : "/";
    return `${libraryRoot.replace(/[\\/]$/, "")}${separator}${relativePath.replaceAll("/", separator)}`;
  }

  async function copyAbsolutePaths(paths: readonly string[]) {
    const absolutePaths = paths
      .map(absoluteLibraryPath)
      .filter((path): path is string => path !== null);
    if (absolutePaths.length === 0 || navigator.clipboard?.writeText === undefined) {
      setSelectionNotice("パスをコピーできませんでした。");
      return;
    }
    try {
      await navigator.clipboard.writeText(absolutePaths.join("\n"));
      setSelectionNotice(`${absolutePaths.length}件の絶対パスをコピーしました。`);
    } catch {
      setSelectionNotice("パスをコピーできませんでした。");
    }
  }

  async function refreshFileClipboardStatus() {
    const requestGeneration = ++fileOperationGeneration.current;
    try {
      const response = await getFileClipboardStatus(requestGeneration);
      if (requestGeneration !== fileOperationGeneration.current) return;
      if (response.status === "ok") setFileClipboardStatus(response.data);
      else if (response.status === "error") {
        setFileClipboardStatus({ available: false, cut: false, items: 0 });
      }
    } catch {
      if (requestGeneration === fileOperationGeneration.current) {
        setFileClipboardStatus({ available: false, cut: false, items: 0 });
      }
    }
  }

  function openCatalogContextMenu(
    entry: CatalogEntry | null,
    position: { x: number; y: number },
  ) {
    if (entry !== null && !selectedPaths.includes(entry.relativePath)) selectEntry(entry);
    const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
    setCatalogContextMenu({
      entry,
      x: Math.max(4, Math.min(position.x, viewportWidth - 328)),
      y: Math.max(4, Math.min(position.y, viewportHeight - 610)),
    });
    void refreshFileClipboardStatus();
  }

  async function runFileOperation(
    request: (generation: number) => Promise<ApiResponse<FileOperationResult>>,
    successMessage: (result: FileOperationResult) => string,
    options: { refresh?: boolean; restore?: string[] } = {},
  ): Promise<boolean> {
    if (fileOperationBusy) return false;
    setFileOperationBusy(true);
    setCatalogContextMenu(null);
    const requestGeneration = ++fileOperationGeneration.current;
    try {
      const response = await request(requestGeneration);
      if (requestGeneration !== fileOperationGeneration.current) return false;
      if (response.status === "ok") {
        setSelectionNotice(successMessage(response.data));
        if (options.refresh !== false) {
          await load(navigation.current, options.restore ?? []);
        }
        return true;
      }
      if (response.status === "error") setSelectionNotice(presentError(response.error));
      else setSelectionNotice("ファイル操作をキャンセルしました。");
      if (options.refresh !== false) await load(navigation.current);
      return false;
    } catch {
      if (requestGeneration === fileOperationGeneration.current) {
        setSelectionNotice(presentUnexpectedError());
        if (options.refresh !== false) await load(navigation.current);
      }
      return false;
    } finally {
      if (requestGeneration === fileOperationGeneration.current) setFileOperationBusy(false);
    }
  }

  function addPathToBookshelf(path: string) {
    if (libraryRoot === null) return;
    const result = addBookshelfItemResult(path, libraryRoot);
    setBookshelfPaths(result.value);
    setSelectionNotice(
      result.ok ? "本棚に追加しました。" : "本棚へ永続化できませんでした。保存先を確認してください。",
    );
  }

  async function handleCatalogContextAction(action: CatalogContextAction) {
    const menu = catalogContextMenu;
    const entry = menu?.entry ?? null;
    const paths = contextSelectionPaths();
    setCatalogContextMenu(null);
    switch (action) {
      case "open":
        if (entry?.kind === "folder") navigate(entry.relativePath);
        else if (entry !== null) void openComicEntry(entry);
        return;
      case "openFullscreen":
        if (entry !== null) void openComicEntry(entry, "fullscreen");
        return;
      case "openSlideshow":
        if (entry !== null) void openComicEntry(entry, "slideshow");
        return;
      case "reveal":
        if (entry !== null) {
          await runFileOperation(
            (requestGeneration) => revealFileItem(entry.relativePath, requestGeneration),
            () => "エクスプローラーで表示しました。",
            { refresh: false },
          );
        }
        return;
      case "openWith":
        if (entry !== null) {
          await runFileOperation(
            (requestGeneration) => openFileItemWith(entry.relativePath, requestGeneration),
            () => "アプリケーションの選択画面を開きました。",
            { refresh: false },
          );
        }
        return;
      case "openDefault":
        if (entry !== null) {
          await runFileOperation(
            (requestGeneration) => openFileItemDefault(entry.relativePath, requestGeneration),
            () => "Windowsの既定アプリケーションで開きました。",
            { refresh: false },
          );
        }
        return;
      case "addBookshelf":
        if (entry !== null) addPathToBookshelf(entry.relativePath);
        return;
      case "cut":
      case "copy": {
        const cut = action === "cut";
        const succeeded = await runFileOperation(
          (requestGeneration) => setFileClipboard(paths, cut, requestGeneration),
          (result) => `${result.affected}件を${cut ? "切り取り" : "コピー"}ました。`,
          { refresh: false },
        );
        if (succeeded) setFileClipboardStatus({ available: true, cut, items: paths.length });
        return;
      }
      case "paste":
        await runFileOperation(
          (requestGeneration) => pasteFileItems(navigation.current, requestGeneration),
          (result) => `${result.affected}件を貼り付けました。`,
        );
        void refreshFileClipboardStatus();
        return;
      case "copyToFolder":
        await runFileOperation(
          (requestGeneration) => copyFileItemsToFolder(paths, requestGeneration),
          (result) => `${result.affected}件をコピーしました。`,
        );
        return;
      case "moveToFolder":
        await runFileOperation(
          (requestGeneration) => moveFileItemsToFolder(paths, requestGeneration),
          (result) => `${result.affected}件を移動しました。`,
        );
        return;
      case "copyPath":
        await copyAbsolutePaths(paths);
        return;
      case "copyParentPath": {
        if (entry === null) return;
        await copyAbsolutePaths([parentPath(entry.relativePath) ?? ""]);
        return;
      }
      case "createFolder":
        setFileNameDialog({ kind: "create", entry: null, value: "新しいフォルダ" });
        return;
      case "recycle":
        if (paths.length > 0) {
          setFileDeleteDialog({
            paths,
            permanent: false,
            label: paths.length === 1 ? paths[0] : `${paths.length}件の項目`,
          });
        }
        return;
      case "rename":
        if (entry !== null) {
          setFileNameDialog({ kind: "rename", entry, value: entryDisplayName(entry) });
        }
        return;
      case "properties":
        setPropertiesOpen(entry !== null);
        return;
      case "permanentDelete": {
        if (entry === null) return;
        const target = entry.kind === "page"
          ? parentPath(entry.relativePath)
          : entry.relativePath;
        if (target === null || target.length === 0) {
          setSelectionNotice("ライブラリルートは完全削除できません。");
          return;
        }
        setFileDeleteDialog({ paths: [target], permanent: true, label: target });
      }
    }
  }

  async function submitFileNameDialog(event: React.FormEvent) {
    event.preventDefault();
    const dialog = fileNameDialog;
    if (dialog === null) return;
    if (dialog.kind === "rename" && dialog.entry !== null) {
      const parent = parentPath(dialog.entry.relativePath);
      const restored = parent === null || parent.length === 0
        ? dialog.value
        : `${parent}/${dialog.value}`;
      const succeeded = await runFileOperation(
        (requestGeneration) => renameFileItem(
          dialog.entry!.relativePath,
          dialog.value,
          requestGeneration,
        ),
        () => `名前を「${dialog.value}」へ変更しました。`,
        { restore: [restored] },
      );
      if (succeeded) setFileNameDialog(null);
      return;
    }
    const restored = navigation.current.length === 0
      ? dialog.value
      : `${navigation.current}/${dialog.value}`;
    const succeeded = await runFileOperation(
      (requestGeneration) => createFileFolder(navigation.current, dialog.value, requestGeneration),
      () => `フォルダ「${dialog.value}」を作成しました。`,
      { restore: [restored] },
    );
    if (succeeded) setFileNameDialog(null);
  }

  async function confirmFileDelete() {
    const dialog = fileDeleteDialog;
    if (dialog === null) return;
    const succeeded = await runFileOperation(
      (requestGeneration) => deleteFileItems(dialog.paths, dialog.permanent, requestGeneration),
      (result) => dialog.permanent
        ? `${result.affected}件を完全に削除しました。`
        : `${result.affected}件をごみ箱へ移動しました。`,
    );
    if (succeeded) setFileDeleteDialog(null);
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
      activateLibraryRoot(response.data.absolutePath);
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
    history:
      | "push"
      | "back"
      | "forward"
      | { type: "jumpBack" | "jumpForward"; index: number } = "push",
    selectionPath: string | null = null,
  ) {
    addressInputDirty.current = false;
    if (!searchOptions.retainResults) setSearchState({ status: "idle" });
    if (history === "push") dispatch({ type: "navigate", path });
    else if (typeof history === "string") dispatch({ type: history });
    else dispatch(history);
    void load(path, selectionPath === null ? [] : [selectionPath]);
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
    if (
      favorite.kind === "comicFolder" || favorite.kind === "archive" || favorite.kind === "pdf"
    ) {
      openComicEntry({
        relativePath: favorite.resolvedPath,
        kind: favorite.kind,
        ...(favorite.kind === "archive"
          ? { archiveKind: archiveKindFromPath(favorite.resolvedPath) }
          : {}),
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
    selectionAnchor.current = null;
    setSelectedPaths([]);
    setSelectedPath(null);
    setThumbnails({});
    thumbnailRequests.current.clear();
    try {
      const response = await searchLibrary(
        query,
        requestGeneration,
        toSearchRequestOptions(searchOptions),
      );
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

  function closeVersion() {
    setVersionOpen(false);
    setLicenseOpen(false);
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
      treeVisible,
      menuBarVisible,
      toolbarVisible,
      shortcuts: { ...shortcuts },
      mouseGestures: { ...mouseGestures },
    };
  }

  function openSettingsDialog() {
    setProfileNotice(null);
    setSettingsDraft(currentSettingsProfile());
    setSettingsOpen(true);
  }

  async function applySettingsProfile(profile: SettingsProfile) {
    if (settingsSaving) return;
    const normalized = normalizeSettingsProfile(profile);
    if (normalized === null) {
      setProfileNotice("設定profileの形式が不正です。");
      return;
    }
    setSettingsSaving(true);
    setProfileNotice("設定を保存しています。");
    const requestGeneration = ++settingsGeneration.current;
    try {
      const response = await saveSettingsProfile(normalized, requestGeneration);
      if (requestGeneration !== settingsGeneration.current) return;
      if (response.status !== "ok") {
        setProfileNotice(
          response.status === "error"
            ? presentError(response.error)
            : "設定の保存をキャンセルしました。",
        );
        return;
      }
      setSortField(normalized.sortField);
      setSortDescending(normalized.sortDescending);
      endOfVolumePolicyUserChanged.current = true;
      endOfVolumePolicyRevision.current += 1;
      endOfVolumePolicyRef.current = normalized.endOfVolumePolicy;
      setEndOfVolumePolicy(normalized.endOfVolumePolicy);
      setCatalogViewMode(normalized.catalogViewMode);
      persistedCatalogViewMode.current = normalized.catalogViewMode;
      setViewMode(normalized.viewMode);
      setLayoutMode(normalized.layoutMode);
      setReadingDirection(normalized.readingDirection);
      setViewerScaleMode(normalized.scaleMode);
      setViewerScale(normalized.scale);
      setLoupeEnabled(normalized.loupeEnabled);
      setTreeVisible(normalized.treeVisible);
      setMenuBarVisible(normalized.menuBarVisible);
      setToolbarVisible(normalized.toolbarVisible);
      setShortcuts(normalizeShortcutBindings(response.data.shortcuts));
      setMouseGestures(normalized.mouseGestures);
      setSettingsOpen(false);
      setSettingsDraft(null);
      setSelectionNotice("設定profileを適用しました。");
    } catch {
      if (requestGeneration === settingsGeneration.current) {
        setProfileNotice("設定を保存できませんでした。変更は適用していません。");
      }
    } finally {
      if (requestGeneration === settingsGeneration.current) setSettingsSaving(false);
    }
  }

  function exportSettingsProfile() {
    let url: string | null = null;
    try {
      if (typeof URL.createObjectURL !== "function") throw new Error("download unavailable");
      const blob = new Blob([JSON.stringify(currentSettingsProfile(), null, 2)], {
        type: "application/json",
      });
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "comic-explorer-settings.json";
      link.click();
      setProfileNotice("設定profileのダウンロードを開始しました。保存完了はブラウザで確認してください。");
    } catch {
      setProfileNotice("設定profileを書き出せませんでした。保存機能を確認してください。");
    } finally {
      if (url !== null) {
        const downloadUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      }
    }
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

  function captureDraftShortcut(
    command: ShortcutCommand,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const pressed = eventShortcut(event.nativeEvent);
    if (pressed === null) {
      setProfileNotice("修飾キーだけでは割り当てできません。");
      return;
    }
    if (settingsDraft === null) return;
    const result = remapShortcut(settingsDraft.shortcuts, command, pressed);
    if (!result.ok) {
      setProfileNotice(
        result.reason === "conflict"
          ? `${SHORTCUT_LABELS[result.conflict ?? command]} と同じキーは割り当てできません。`
          : "このキーは割り当てできません。",
      );
      return;
    }
    setProfileNotice(null);
    setSettingsDraft({ ...settingsDraft, shortcuts: result.bindings });
  }

  function resetDraftShortcut(command: ShortcutCommand) {
    if (settingsDraft === null) return;
    const result = remapShortcut(
      settingsDraft.shortcuts,
      command,
      DEFAULT_SHORTCUTS[command],
    );
    if (!result.ok) {
      setProfileNotice(
        `${SHORTCUT_LABELS[result.conflict ?? command]} を先に変更してください。`,
      );
      return;
    }
    setProfileNotice(null);
    setSettingsDraft({ ...settingsDraft, shortcuts: result.bindings });
  }

  function resetAllDraftShortcuts() {
    if (settingsDraft === null) return;
    setProfileNotice(null);
    setSettingsDraft({ ...settingsDraft, shortcuts: resetShortcutBindings() });
  }

  function updateDraftMouseGesture(name: MouseGestureName, action: MouseGestureAction) {
    if (settingsDraft === null || name === "doubleClick") return;
    const current = settingsDraft.mouseGestures;
    const duplicate = action !== "none" && CONFIGURABLE_MOUSE_GESTURE_NAMES.some(
      (candidate) => candidate !== name && current[candidate] === action,
    );
    if (duplicate) {
      setProfileNotice("同じマウスジェスチャー動作は複数へ割り当てできません。");
      return;
    }
    setProfileNotice(null);
    setSettingsDraft({
      ...settingsDraft,
      mouseGestures: { ...current, [name]: action },
    });
  }

  function resetAllDraftSettings() {
    setSettingsDraft(createDefaultSettingsProfile());
    setProfileNotice("すべての設定を既定値へ戻しました。適用するまで現在の設定は変わりません。");
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
  const sidePaneVisible = treeVisible || searchPaneOpen;
  const selectedThumbnailDataUrl = selectedPath === null
    ? undefined
    : selected?.kind === "archive" || selected?.kind === "comicFolder" || selected?.kind === "pdf"
      ? managedThumbnailFor(managedThumbnails, selectedPath)?.dataUrl
        ?? (thumbnails[selectedPath]?.status === "ready" ? thumbnails[selectedPath].mediaUri : undefined)
      : undefined;
  const managedThumbnailStats = thumbnailStats(managedThumbnails);

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
    setActiveToolbarMenu(null);
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

  function getToolbarMenuItems(menuId: ToolbarMenuId): HTMLButtonElement[] {
    const menu = toolbarMenuPopupRefs.current[menuId];
    return menu === null
      ? []
      : Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
  }

  function focusToolbarMenuItem(menuId: ToolbarMenuId, index: number) {
    const items = getToolbarMenuItems(menuId);
    if (items.length === 0) return;
    const normalizedIndex = (index + items.length) % items.length;
    items[normalizedIndex].focus();
  }

  function toggleToolbarMenu(menuId: ToolbarMenuId) {
    setActiveMenu(null);
    pendingToolbarMenuFocus.current = "first";
    setActiveToolbarMenu((current) => (current === menuId ? null : menuId));
  }

  function runToolbarMenuAction(action: () => void) {
    setActiveToolbarMenu(null);
    action();
  }

  function handleToolbarMenuTriggerKeyDown(
    menuId: ToolbarMenuId,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveMenu(null);
      pendingToolbarMenuFocus.current = event.key === "ArrowUp" ? "last" : "first";
      setActiveToolbarMenu(menuId);
      return;
    }
    if (event.key === "Escape" && activeToolbarMenu !== null) {
      event.preventDefault();
      setActiveToolbarMenu(null);
    }
  }

  function handleToolbarMenuItemKeyDown(
    menuId: ToolbarMenuId,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) {
    const items = getToolbarMenuItems(menuId);
    const currentIndex = items.indexOf(event.currentTarget);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusToolbarMenuItem(menuId, currentIndex + (event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusToolbarMenuItem(menuId, event.key === "Home" ? 0 : items.length - 1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setActiveToolbarMenu(null);
      requestAnimationFrame(() => toolbarMenuTriggerRefs.current[menuId]?.focus());
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
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
    const requestGeneration = ++settingsGeneration.current;
    void saveCatalogViewMode(mode, requestGeneration)
      .then((response) => {
        if (requestGeneration !== settingsGeneration.current) return;
        if (response.status === "ok") {
          const persisted = normalizeCatalogViewMode(response.data.catalogViewMode);
          persistedCatalogViewMode.current = persisted;
          setCatalogViewMode(persisted);
        } else {
          setCatalogViewMode(persistedCatalogViewMode.current);
          setSelectionNotice(
            response.status === "error"
              ? presentError(response.error)
              : "一覧表示形式の保存をキャンセルしました。",
          );
        }
      })
      .catch(() => {
        if (requestGeneration !== settingsGeneration.current) return;
        setCatalogViewMode(persistedCatalogViewMode.current);
        setSelectionNotice("一覧表示形式を保存できませんでした。");
      });
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
    viewerGeneration.current += 1;
    setLoadState({ status: "ready" });
    setPendingEndOfVolume(null);
    setEndOfVolumeNotice(null);
    setViewerSession(null);
    setViewerLaunchMode("normal");
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
    setThumbnails({});
    thumbnailRequests.current.clear();
  }

  async function openComicEntry(
    entry: CatalogEntry,
    launchMode: ViewerLaunchMode = "normal",
    startAt: "restored" | "first" | "last" = "restored",
  ) {
    const resolvedLaunchMode = launchMode === "normal" && entry.kind === "archive"
      ? "fullscreen"
      : launchMode;
    setViewerLaunchMode(resolvedLaunchMode);
    setPendingEndOfVolume(null);
    setEndOfVolumeNotice(null);
    setLoadState({ status: "loading", path: entry.relativePath });
    viewerGeneration.current += 1;
    const requestGeneration = viewerGeneration.current;
    try {
      const response = await openComic(entry.relativePath, requestGeneration);
      if (requestGeneration !== viewerGeneration.current) return;
      if (response.status === "ok") {
        rememberRecent(entry);
        refreshBookmarks(response.data.itemKey);
        setViewerSession({
          ...response.data,
          startIndex: startAt === "first"
            ? 0
            : startAt === "last"
              ? Math.max(0, response.data.pages.length - 1)
              : response.data.startIndex,
        });
        setLoadState({ status: "ready" });
        void loadItemMetadata(response.data.itemKey);
      } else if (response.status === "error") {
        setLoadState({
          status: "error",
          path: entry.relativePath,
          message: presentError(response.error),
        });
      } else {
        setLoadState({ status: "ready" });
        setSelectionNotice("開く操作をキャンセルしました。");
      }
    } catch {
      if (requestGeneration === viewerGeneration.current) {
        setLoadState({
          status: "error",
          path: entry.relativePath,
          message: presentUnexpectedError(),
        });
      }
    }
  }

  function handleEndOfVolume() {
    if (pendingEndOfVolume !== null || viewerSession === null) return;
    const decision = resolveEndOfVolume(
      sortedEntries,
      viewerSession.itemKey,
      endOfVolumePolicyRef.current,
    );
    if (decision.kind === "open") {
      openComicEntry(decision.entry, "normal", "first");
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

  function handleStartOfVolume() {
    if (viewerSession === null) return;
    const previous = previousComicEntry(sortedEntries, viewerSession.itemKey);
    if (previous === undefined) {
      setEndOfVolumeNotice("巻頭です。前の漫画はありません。");
      return;
    }
    void openComicEntry(previous, "normal", "last");
  }

  if (viewerSession !== null) {
    return (
      <div
        className={viewerDetached ? "viewer-shell viewer-shell--detached" : "viewer-shell"}
        data-viewer-detached={viewerDetached}
      >
        <Viewer
          key={`${viewerSession.itemKey}:${viewerGeneration.current}`}
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
          initialFullscreen={viewerLaunchMode === "fullscreen"}
          slideshowIntervalMs={viewerLaunchMode === "slideshow" ? 3_000 : undefined}
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
          onPreviousItem={handleStartOfVolume}
          endOfVolumePolicy={endOfVolumePolicy}
          onEndOfVolumePolicyChange={changeEndOfVolumePolicy}
          bookmarks={bookmarks}
          onPageChange={() => undefined}
          mouseGestures={mouseGestures}
          detached={viewerDetached}
          onToggleDetached={() => setViewerDetached((current) => !current)}
          onSaveBookmark={saveCurrentBookmark}
          onNextBookmark={(index) => nextBookmark(
            bookmarks,
            viewerSession.pages.map((page) => page.relativePath),
            index,
          )?.pageIndex ?? null}
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
              <button onClick={() => openComicEntry(pendingEndOfVolume.entry, "normal", "first")}>
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
                onClick={() => runMenuAction(deactivateLibraryRoot)}
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
              <div className="menu-separator" role="separator" />
              <span className="menu-heading">履歴</span>
              {navigation.back.length === 0 && navigation.forward.length === 0 ? (
                <span className="menu-empty">移動履歴はありません</span>
              ) : (
                <>
                  {[...navigation.back].reverse().map((path, reverseIndex) => {
                    const index = navigation.back.length - 1 - reverseIndex;
                    return (
                      <button
                        key={`history-back-${path}-${index}`}
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        onFocus={(event) => markMenuItemActive(event.currentTarget)}
                        onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                        onClick={() => runMenuAction(() => navigate(
                          path,
                          { type: "jumpBack", index },
                        ))}
                      >
                        戻る: {path || "ライブラリ"}
                      </button>
                    );
                  })}
                  {navigation.forward.map((path, index) => (
                    <button
                      key={`history-forward-${path}-${index}`}
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      onFocus={(event) => markMenuItemActive(event.currentTarget)}
                      onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                      onClick={() => runMenuAction(() => navigate(
                        path,
                        { type: "jumpForward", index },
                      ))}
                    >
                      進む: {path || "ライブラリ"}
                    </button>
                  ))}
                </>
              )}
              <div className="menu-separator" role="separator" />
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
                data-product-id="task-tray-toggle"
                aria-disabled={!trayApiAvailable}
                title={trayApiAvailable
                  ? "アプリをタスクトレイへ収納"
                  : trayStatus?.reason ?? "task trayの状態を確認しています"}
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(() => void storeInTray(), !trayApiAvailable)}
              >
                タスクトレイへ収納
              </button>
              <div className="menu-separator" role="separator" />
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("file", event)}
                onClick={() => runMenuAction(() => void exitApplication())}
              >
                終了
                <span className="menu-shortcut">Alt+F4</span>
              </button>
            </div>
          )}
        </div>

        <div className="menu-group">
          <button
            ref={(node) => {
              menuTriggerRefs.current.edit = node;
            }}
            className="menu-trigger"
            type="button"
            role="menuitem"
            aria-label="編集"
            aria-haspopup="menu"
            aria-expanded={activeMenu === "edit"}
            aria-controls="edit-menu"
            aria-keyshortcuts="Alt+E"
            tabIndex={menuTabStop === "edit" ? 0 : -1}
            onFocus={() => setMenuTabStop("edit")}
            onClick={() => {
              setMenuTabStop("edit");
              toggleMenu("edit");
            }}
            onKeyDown={(event) => handleMenuTriggerKeyDown("edit", event)}
          >
            編集(E)
          </button>
          {activeMenu === "edit" && (
            <div
              ref={(node) => {
                menuPopupRefs.current.edit = node;
              }}
              id="edit-menu"
              className="menu-popup"
              role="menu"
              aria-label="編集"
            >
              <button
                type="button"
                role="menuitem"
                tabIndex={0}
                aria-disabled={selectedPaths.length === 0}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("edit", event)}
                onClick={() => runMenuAction(() => void copySelectedPaths(), selectedPaths.length === 0)}
              >
                パスをコピー
              </button>
              <div className="menu-separator" role="separator" />
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("edit", event)}
                onClick={() => runMenuAction(selectAll)}
              >
                すべて選択
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("edit", event)}
                onClick={() => runMenuAction(selectFiles)}
              >
                ファイルだけ選択
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("edit", event)}
                onClick={() => runMenuAction(() => selectByKind("page"))}
              >
                画像だけ選択
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("edit", event)}
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
                onKeyDown={(event) => handleMenuItemKeyDown("edit", event)}
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
              <span className="menu-heading">移動</span>
              <button
                type="button"
                role="menuitem"
                tabIndex={0}
                aria-disabled={navigation.back.length === 0}
                aria-keyshortcuts="Alt+ArrowLeft"
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("view", event)}
                onClick={() => runMenuAction(() => {
                  const target = navigation.back.at(-1);
                  if (target !== undefined) navigate(target, "back");
                }, navigation.back.length === 0)}
              >
                戻る <span className="menu-shortcut">Alt+←</span>
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={navigation.forward.length === 0}
                aria-keyshortcuts="Alt+ArrowRight"
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("view", event)}
                onClick={() => runMenuAction(() => {
                  const target = navigation.forward[0];
                  if (target !== undefined) navigate(target, "forward");
                }, navigation.forward.length === 0)}
              >
                進む <span className="menu-shortcut">Alt+→</span>
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={up === null}
                aria-keyshortcuts="Alt+ArrowUp"
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("view", event)}
                onClick={() => runMenuAction(() => {
                  if (up !== null) navigate(up);
                }, up === null)}
              >
                上のフォルダへ <span className="menu-shortcut">Alt+↑</span>
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-keyshortcuts="F5"
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("view", event)}
                onClick={() => runMenuAction(refreshCatalog)}
              >
                現在場所を更新 <span className="menu-shortcut">F5</span>
              </button>
              <div className="menu-separator" role="separator" />
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
                  tabIndex={-1}
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
                role="menuitem"
                data-product-id="workspace-restore-controls"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("view", event)}
                onClick={() => runMenuAction(() => {
                  const restored = restoreWorkspaceDisplay();
                  setTreeVisible(restored.treeVisible);
                  setToolbarVisible(restored.toolbarVisible);
                  setMenuBarVisible(restored.menuBarVisible);
                })}
              >
                UIを表示
              </button>
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
              {CATALOG_VIEW_MODES.map((mode) => (
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
              menuTriggerRefs.current.options = node;
            }}
            className="menu-trigger"
            type="button"
            role="menuitem"
            aria-label="オプション"
            aria-haspopup="menu"
            aria-expanded={activeMenu === "options"}
            aria-controls="options-menu"
            aria-keyshortcuts="Alt+O"
            tabIndex={menuTabStop === "options" ? 0 : -1}
            onFocus={() => setMenuTabStop("options")}
            onClick={() => {
              setMenuTabStop("options");
              toggleMenu("options");
            }}
            onKeyDown={(event) => handleMenuTriggerKeyDown("options", event)}
          >
            オプション(O)
          </button>
          {activeMenu === "options" && (
            <div
              ref={(node) => {
                menuPopupRefs.current.options = node;
              }}
              id="options-menu"
              className="menu-popup"
              role="menu"
              aria-label="オプション"
            >
              <button
                type="button"
                role="menuitem"
                data-product-id="settings-menu-item"
                tabIndex={0}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("options", event)}
                onClick={() => runMenuAction(openSettingsDialog)}
              >
                統合設定…
              </button>
              <div className="menu-separator" role="separator" />
              <button
                type="button"
                role="menuitem"
                data-product-id="favorites-menu-item"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("options", event)}
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
                onKeyDown={(event) => handleMenuItemKeyDown("options", event)}
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
                onKeyDown={(event) => handleMenuItemKeyDown("options", event)}
                onClick={() => runMenuAction(addSelectedToBookshelf, selectedPath === null)}
              >
                本棚に追加
              </button>
              <button
                type="button"
                role="menuitem"
                data-product-id="thumbnail-manager-menu-item"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("options", event)}
                onClick={() =>
                  runMenuAction(() => {
                    setThumbnailManagerNotice(null);
                    setThumbnailManagerOpen(true);
                  })
                }
              >
                サムネイル管理…
              </button>
              <button
                type="button"
                role="menuitem"
                data-product-id="history-menu-item"
                tabIndex={-1}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("options", event)}
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
                onKeyDown={(event) => handleMenuItemKeyDown("options", event)}
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
                onKeyDown={(event) => handleMenuItemKeyDown("options", event)}
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
                tabIndex={0}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("help", event)}
                onClick={() => runMenuAction(() => setHelpOpen(true))}
              >
                一般ヘルプ…
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={0}
                onFocus={(event) => markMenuItemActive(event.currentTarget)}
                onKeyDown={(event) => handleMenuItemKeyDown("help", event)}
                onClick={() => runMenuAction(() => setVersionOpen(true))}
              >
                バージョン情報…
              </button>
            </div>
          )}
        </div>
      </nav>}
      {toolbarVisible && <div ref={toolbarRef} className="toolbar" aria-label="ナビゲーション">
        <button
          type="button"
          aria-label="戻る"
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
          type="button"
          aria-label="進む"
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
          type="button"
          aria-label="上のフォルダへ"
          disabled={up === null}
          onClick={() => up !== null && navigate(up)}
          title="上へ"
        >
          ↑
        </button>
        <div className="icon-command-toolbar" aria-label="コマンドツールバー">
          <button
            type="button"
            aria-label={searchPaneOpen ? "検索ペインを閉じる" : "検索ペインを表示"}
            title={searchPaneOpen ? "検索ペインを閉じる" : "検索とフィルタを表示"}
            aria-pressed={searchPaneOpen}
            data-product-id="toolbar-search"
            onClick={() => {
              setActiveToolbarMenu(null);
              setSearchPaneOpen((current) => !current);
            }}
          >
            <span aria-hidden="true">⌕</span>
          </button>
          <button type="button" aria-label="現在場所を更新" title="現在のフォルダを再読み込み" data-product-id="toolbar-refresh" onClick={refreshCatalog}>⟳</button>
          <button type="button" aria-label="選択パスをコピー" title="選択した項目のパスをコピー" data-product-id="toolbar-copy-path" onClick={() => void copySelectedPaths()}>⧉</button>
          <button type="button" aria-label="選択項目のプロパティ" title="選択した項目のプロパティを表示" data-product-id="toolbar-properties" disabled={selectedPaths.length !== 1} onClick={() => setPropertiesOpen(true)}>ⓘ</button>
          <button type="button" aria-label="本棚を表示" title="本棚を表示" data-product-id="toolbar-bookshelf" onClick={() => setBookshelfOpen(true)}>▤</button>
          <button
            type="button"
            aria-label="参照型タイル"
            title="参照型タイル表示を切り替え"
            aria-pressed={catalogViewMode === "reference_tile"}
            data-product-id="toolbar-reference-tile"
            onClick={() => changeCatalogViewMode(catalogViewMode === "reference_tile" ? "cover_list" : "reference_tile")}
          >
            ▦
          </button>
        </div>
        <div className="toolbar-control-menu toolbar-control-menu--leading">
          <button
            ref={(node) => {
              toolbarMenuTriggerRefs.current.sort = node;
            }}
            type="button"
            aria-label="並べ替え条件"
            title="一覧の並べ替え条件を選択"
            data-sort-field={sortField}
            aria-haspopup="menu"
            aria-expanded={activeToolbarMenu === "sort"}
            aria-controls="toolbar-sort-menu"
            onClick={() => toggleToolbarMenu("sort")}
            onKeyDown={(event) => handleToolbarMenuTriggerKeyDown("sort", event)}
          >
            並べ替え: {({
              name: "名前",
              modified: "更新日時",
              size: "サイズ",
              kind: "種類",
            } satisfies Record<SortField, string>)[sortField]} <span aria-hidden="true">▾</span>
          </button>
          {activeToolbarMenu === "sort" && (
            <div
              ref={(node) => {
                toolbarMenuPopupRefs.current.sort = node;
              }}
              id="toolbar-sort-menu"
              className="menu-popup toolbar-popup"
              role="menu"
              aria-label="並べ替え候補"
            >
              {([
                ["name", "名前"],
                ["modified", "更新日時"],
                ["size", "サイズ"],
                ["kind", "種類"],
              ] as const).map(([field, label]) => (
                <button
                  key={field}
                  type="button"
                  role="menuitemradio"
                  tabIndex={-1}
                  aria-checked={sortField === field}
                  onFocus={(event) => markMenuItemActive(event.currentTarget)}
                  onKeyDown={(event) => handleToolbarMenuItemKeyDown("sort", event)}
                  onClick={() => runToolbarMenuAction(() => changeSort(field, sortDescending))}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={`並び順: ${sortDescending ? "降順" : "昇順"}`}
          title={sortDescending ? "降順を昇順へ変更" : "昇順を降順へ変更"}
          data-sort-descending={sortDescending}
          onClick={() => changeSort(sortField, !sortDescending)}
        >
          <span aria-hidden="true">{sortDescending ? "▼" : "▲"}</span>
        </button>
        <div className="toolbar-control-menu">
          <button
            ref={(node) => {
              toolbarMenuTriggerRefs.current.catalogView = node;
            }}
            type="button"
            aria-label="一覧表示形式"
            title="一覧の表示形式を選択"
            data-catalog-view-mode={catalogViewMode}
            aria-haspopup="menu"
            aria-expanded={activeToolbarMenu === "catalogView"}
            aria-controls="toolbar-catalog-view-menu"
            onClick={() => toggleToolbarMenu("catalogView")}
            onKeyDown={(event) => handleToolbarMenuTriggerKeyDown("catalogView", event)}
          >
            一覧形式: {CATALOG_VIEW_MODE_LABELS[catalogViewMode]} <span aria-hidden="true">▾</span>
          </button>
          {activeToolbarMenu === "catalogView" && (
            <div
              ref={(node) => {
                toolbarMenuPopupRefs.current.catalogView = node;
              }}
              id="toolbar-catalog-view-menu"
              className="menu-popup toolbar-popup"
              role="menu"
              aria-label="一覧表示形式候補"
            >
              {CATALOG_VIEW_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  tabIndex={-1}
                  aria-checked={catalogViewMode === mode}
                  onFocus={(event) => markMenuItemActive(event.currentTarget)}
                  onKeyDown={(event) => handleToolbarMenuItemKeyDown("catalogView", event)}
                  onClick={() => runToolbarMenuAction(() => changeCatalogViewMode(mode))}
                >
                  {CATALOG_VIEW_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>}
      {(diagnosticsOpen || diagnosticsLoading || diagnosticNotice !== null) && (
        <div className="dialog-backdrop">
          <section
            className="diagnostic-panel"
            role="dialog"
            aria-modal="true"
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
          <section className="diagnostic-explanation" aria-labelledby="diagnostic-purpose-title">
            <h3 id="diagnostic-purpose-title">何をする機能ですか？</h3>
            <p>
              ライブラリ内を読み取り専用で確認し、前回の診断結果からの追加・変更・欠落、重複した項目、
              開けない対応書庫を一覧します。
            </p>
            <p>
              作品ファイルは変更・削除せず、外部へ送信しません。初回は比較用の基準を作るため、項目が
              「追加」と表示されることがあります。
            </p>
          </section>
          {diagnosticsLoading && (
            <div
              className="diagnostic-progress"
              role="status"
              aria-live="polite"
              data-diagnostic-loading="true"
            >
              <span className="diagnostic-activity-indicator" data-diagnostic-activity="indeterminate" aria-hidden="true" />
              <div className="diagnostic-progress-copy">
                <strong>診断を実行中です</strong>
                <span>ライブラリの構成と対応書庫を確認しています。完了までこの表示が動き続けます。</span>
              </div>
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
        </div>
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
        <button
          type="submit"
          aria-label="アドレスへ移動"
          title="入力したアドレスへ移動"
        >
          <span aria-hidden="true">➜</span>
        </button>
      </form>
      <div
        className="workspace"
        style={{
          gridTemplateColumns: workspaceGridColumns(sidePaneVisible, treeWidth),
        }}
      >
        {sidePaneVisible && (
          <>
            {searchPaneOpen ? (
              <aside className="search-pane" aria-label="検索ペイン">
                <header className="search-pane-heading">
                  <h2>検索</h2>
                  <button
                    type="button"
                    aria-label="検索ペインを閉じる"
                    title="検索ペインを閉じる"
                    onClick={() => setSearchPaneOpen(false)}
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </header>
                <form
                  className="search-pane-form"
                  aria-label="名前検索フォーム"
                  onSubmit={submitSearch}
                >
                  <label htmlFor="catalog-search">ファイル名・フォルダ名</label>
                  <input
                    ref={searchInputRef}
                    id="catalog-search"
                    aria-label="名前検索"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="検索する名前"
                  />
                  <div className="search-pane-actions">
                    <button type="submit" aria-label="検索" title="名前で検索">
                      <span aria-hidden="true">⌕</span>
                    </button>
                    {searchState.status !== "idle" && (
                      <button
                        type="button"
                        aria-label="検索結果をクリア"
                        title="検索結果をクリア"
                        onClick={clearSearch}
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    )}
                  </div>
                </form>
                <form
                  className="search-pane-form"
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
                  <div className="search-pane-actions">
                    <button
                      type="button"
                      aria-label="全件"
                      title="ファイルマスクを解除して全件表示"
                      onClick={() => setFileMask("")}
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </div>
                </form>
                <section className="search-options" aria-label="検索オプション">
                  <h3>オプション</h3>
                  <label>
                    <input
                      type="checkbox"
                      checked={searchOptions.includeSubfolders}
                      onChange={(event) =>
                        setSearchOptions((current) => ({
                          ...current,
                          includeSubfolders: event.target.checked,
                        }))
                      }
                    />
                    サブフォルダも検索する
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={!searchOptions.includeFolders}
                      onChange={(event) =>
                        setSearchOptions((current) => ({
                          ...current,
                          includeFolders: !event.target.checked,
                        }))
                      }
                    />
                    フォルダは検索対象にしない
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={!searchOptions.includeFiles}
                      onChange={(event) =>
                        setSearchOptions((current) => ({
                          ...current,
                          includeFiles: !event.target.checked,
                        }))
                      }
                    />
                    ファイルは検索対象にしない
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={searchOptions.retainResults}
                      onChange={(event) =>
                        setSearchOptions((current) => ({
                          ...current,
                          retainResults: event.target.checked,
                        }))
                      }
                    />
                    検索結果を破棄しない
                  </label>

                  <fieldset className="search-options-group">
                    <legend>検索場所</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={searchOptions.fixedLocation !== null}
                        onChange={(event) =>
                          setSearchOptions((current) => ({
                            ...current,
                            fixedLocation: event.target.checked ? navigation.current : null,
                          }))
                        }
                      />
                      検索場所を固定する
                    </label>
                    {searchOptions.fixedLocation !== null && (
                      <p className="search-options-note">
                        {searchOptions.fixedLocation === ""
                          ? "ライブラリのルート"
                          : searchOptions.fixedLocation}
                      </p>
                    )}
                  </fieldset>

                  <fieldset className="search-options-group">
                    <legend>
                      <label>
                        <input
                          type="checkbox"
                          aria-label="サイズ指定を有効にする"
                          checked={searchOptions.sizeEnabled}
                          onChange={(event) =>
                            setSearchOptions((current) => ({
                              ...current,
                              sizeEnabled: event.target.checked,
                            }))
                          }
                        />
                        サイズ指定
                      </label>
                    </legend>
                    <div className="search-options-condition">
                      <input
                        type="number"
                        aria-label="サイズ (KB)"
                        min="0"
                        value={searchOptions.sizeKiB}
                        disabled={!searchOptions.sizeEnabled}
                        onChange={(event) =>
                          setSearchOptions((current) => ({
                            ...current,
                            sizeKiB: nonNegativeNumber(event.target.value),
                          }))
                        }
                      />
                      <span>KB</span>
                    </div>
                    <div className="search-options-radios">
                      <label>
                        <input
                          type="radio"
                          name="search-size-comparison"
                          checked={searchOptions.sizeComparison === "atLeast"}
                          disabled={!searchOptions.sizeEnabled}
                          onChange={() =>
                            setSearchOptions((current) => ({
                              ...current,
                              sizeComparison: "atLeast" satisfies SearchSizeComparison,
                            }))
                          }
                        />
                        以上
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="search-size-comparison"
                          checked={searchOptions.sizeComparison === "atMost"}
                          disabled={!searchOptions.sizeEnabled}
                          onChange={() =>
                            setSearchOptions((current) => ({
                              ...current,
                              sizeComparison: "atMost" satisfies SearchSizeComparison,
                            }))
                          }
                        />
                        以下
                      </label>
                    </div>
                  </fieldset>

                  <fieldset className="search-options-group">
                    <legend>
                      <label>
                        <input
                          type="checkbox"
                          aria-label="日付指定を有効にする"
                          checked={searchOptions.dateEnabled}
                          onChange={(event) =>
                            setSearchOptions((current) => ({
                              ...current,
                              dateEnabled: event.target.checked,
                            }))
                          }
                        />
                        日付指定
                      </label>
                    </legend>
                    <div className="search-options-date-row">
                      <label>
                        <input
                          type="radio"
                          name="search-date-mode"
                          checked={searchOptions.dateMode === "recentMonths"}
                          disabled={!searchOptions.dateEnabled}
                          onChange={() =>
                            setSearchOptions((current) => ({
                              ...current,
                              dateMode: "recentMonths" satisfies SearchDateMode,
                            }))
                          }
                        />
                        過去
                      </label>
                      <input
                        type="number"
                        aria-label="過去の月数"
                        min="1"
                        value={searchOptions.dateAmount}
                        disabled={!searchOptions.dateEnabled || searchOptions.dateMode !== "recentMonths"}
                        onChange={(event) =>
                          setSearchOptions((current) => ({
                            ...current,
                            dateAmount: Math.max(1, Math.floor(nonNegativeNumber(event.target.value))),
                          }))
                        }
                      />
                      <span>ヶ月間</span>
                    </div>
                    <div className="search-options-date-row">
                      <label>
                        <input
                          type="radio"
                          name="search-date-mode"
                          checked={searchOptions.dateMode === "recentDays"}
                          disabled={!searchOptions.dateEnabled}
                          onChange={() =>
                            setSearchOptions((current) => ({
                              ...current,
                              dateMode: "recentDays" satisfies SearchDateMode,
                            }))
                          }
                        />
                        過去
                      </label>
                      <input
                        type="number"
                        aria-label="過去の日数"
                        min="1"
                        value={searchOptions.dateAmount}
                        disabled={!searchOptions.dateEnabled || searchOptions.dateMode !== "recentDays"}
                        onChange={(event) =>
                          setSearchOptions((current) => ({
                            ...current,
                            dateAmount: Math.max(1, Math.floor(nonNegativeNumber(event.target.value))),
                          }))
                        }
                      />
                      <span>日間</span>
                    </div>
                    <div className="search-options-date-row search-options-date-row--calendar">
                      <label>
                        <input
                          type="radio"
                          name="search-date-mode"
                          checked={searchOptions.dateMode === "calendarDate"}
                          disabled={!searchOptions.dateEnabled}
                          onChange={() =>
                            setSearchOptions((current) => ({
                              ...current,
                              dateMode: "calendarDate" satisfies SearchDateMode,
                            }))
                          }
                        />
                        日付指定
                      </label>
                      <input
                        type="date"
                        aria-label="日付"
                        value={searchOptions.dateStart}
                        disabled={!searchOptions.dateEnabled || searchOptions.dateMode !== "calendarDate"}
                        onChange={(event) =>
                          setSearchOptions((current) => ({
                            ...current,
                            dateStart: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="search-options-radios">
                      <label>
                        <input
                          type="radio"
                          name="search-date-comparison"
                          checked={searchOptions.dateComparison === "before"}
                          disabled={!searchOptions.dateEnabled || searchOptions.dateMode !== "calendarDate"}
                          onChange={() =>
                            setSearchOptions((current) => ({
                              ...current,
                              dateComparison: "before" satisfies SearchDateComparison,
                            }))
                          }
                        />
                        以前
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="search-date-comparison"
                          checked={searchOptions.dateComparison === "after"}
                          disabled={!searchOptions.dateEnabled || searchOptions.dateMode !== "calendarDate"}
                          onChange={() =>
                            setSearchOptions((current) => ({
                              ...current,
                              dateComparison: "after" satisfies SearchDateComparison,
                            }))
                          }
                        />
                        以降
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="search-date-comparison"
                          checked={searchOptions.dateComparison === "between"}
                          disabled={!searchOptions.dateEnabled || searchOptions.dateMode !== "calendarDate"}
                          onChange={() =>
                            setSearchOptions((current) => ({
                              ...current,
                              dateComparison: "between" satisfies SearchDateComparison,
                            }))
                          }
                        />
                        期間
                      </label>
                    </div>
                    {searchOptions.dateComparison === "between" && (
                      <label className="search-options-date-end">
                        終了日
                        <input
                          type="date"
                          aria-label="終了日"
                          value={searchOptions.dateEnd}
                          disabled={!searchOptions.dateEnabled || searchOptions.dateMode !== "calendarDate"}
                          onChange={(event) =>
                            setSearchOptions((current) => ({
                              ...current,
                              dateEnd: event.target.value,
                            }))
                          }
                        />
                      </label>
                    )}
                  </fieldset>
                </section>
              </aside>
            ) : (
              <FolderTree
                libraryRoot={libraryRoot}
                currentPath={navigation.current}
                onNavigate={(path) => navigate(path)}
              />
            )}
            <div
              className="tree-splitter"
              role="separator"
              aria-label={searchPaneOpen ? "検索ペインの幅" : "フォルダツリーの幅"}
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
              onContextMenu={openCatalogContextMenu}
              thumbnailFor={(entry) => {
                const managed = entry.kind === "archive" || entry.kind === "comicFolder"
                  ? managedThumbnailFor(managedThumbnails, entry.relativePath)
                  : undefined;
                return managed !== undefined
                  ? { status: "ready", mediaUri: managed.dataUrl, cacheHit: false }
                  : thumbnails[entry.relativePath] ?? { status: "loading" };
              }}
              isFavorite={(entry) => favoriteForPath(entry.relativePath) !== undefined}
              onToggleFavorite={toggleFavorite}
              onThumbnailNeeded={(entry) => {
                if (managedThumbnailFor(managedThumbnails, entry.relativePath) !== undefined) return;
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
        {selectionNotice !== null && (
          <span
            role="status"
            data-shortcut-save-status={selectionNotice === "設定profileを適用しました。" ? "saved" : undefined}
          >
            {selectionNotice}
          </span>
        )}
        {trayNotice !== null && <span role="alert">{trayNotice}</span>}
      </footer>
      {catalogContextMenu !== null && (
        <CatalogContextMenu
          entry={catalogContextMenu.entry}
          x={catalogContextMenu.x}
          y={catalogContextMenu.y}
          selectionCount={contextSelectionPaths().length}
          clipboard={fileClipboard}
          busy={fileOperationBusy}
          onAction={(action) => void handleCatalogContextAction(action)}
          onClose={() => setCatalogContextMenu(null)}
        />
      )}
      {fileNameDialog !== null && (
        <div className="dialog-backdrop">
          <form
            className="file-operation-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={fileNameDialog.kind === "rename" ? "名前の変更" : "新しいフォルダ"}
            onSubmit={(event) => void submitFileNameDialog(event)}
          >
            <header className="dialog-heading">
              <p className="dialog-kicker">ファイル操作</p>
              <h2>{fileNameDialog.kind === "rename" ? "名前の変更" : "新しいフォルダ"}</h2>
              <p className="dialog-description">
                {fileNameDialog.kind === "rename"
                  ? fileNameDialog.entry?.relativePath
                  : `作成先: ${navigation.current || "ライブラリ"}`}
              </p>
            </header>
            <label>
              名前
              <input
                autoFocus
                required
                aria-label="ファイル名"
                value={fileNameDialog.value}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setFileNameDialog((current) => current === null
                  ? current
                  : { ...current, value: event.target.value })}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" disabled={fileOperationBusy} onClick={() => setFileNameDialog(null)}>
                キャンセル
              </button>
              <button type="submit" disabled={fileOperationBusy || fileNameDialog.value.length === 0}>
                {fileOperationBusy ? "処理中…" : "実行"}
              </button>
            </div>
          </form>
        </div>
      )}
      {fileDeleteDialog !== null && (
        <div className="dialog-backdrop">
          <section
            className="file-operation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={fileDeleteDialog.permanent ? "完全に削除" : "ごみ箱へ移動"}
          >
            <header className="dialog-heading">
              <p className="dialog-kicker">ファイル操作</p>
              <h2>{fileDeleteDialog.permanent ? "完全に削除" : "ごみ箱へ移動"}</h2>
              <p className="dialog-description">対象: {fileDeleteDialog.label}</p>
            </header>
            <p>
              {fileDeleteDialog.permanent
                ? "この操作は取り消せません。対象を完全に削除しますか？"
                : "選択した項目をごみ箱へ移動しますか？"}
            </p>
            <div className="dialog-actions">
              <button type="button" disabled={fileOperationBusy} onClick={() => setFileDeleteDialog(null)}>
                キャンセル
              </button>
              <button
                type="button"
                className={fileDeleteDialog.permanent ? "danger-button" : undefined}
                disabled={fileOperationBusy}
                onClick={() => void confirmFileDelete()}
              >
                {fileOperationBusy ? "処理中…" : fileDeleteDialog.permanent ? "完全に削除" : "ごみ箱へ移動"}
              </button>
            </div>
          </section>
        </div>
      )}
      {settingsOpen && settingsDraft !== null && (
        <SettingsDialog
          draft={settingsDraft}
          saving={settingsSaving}
          notice={profileNotice}
          onDraftChange={setSettingsDraft}
          onApply={() => void applySettingsProfile(settingsDraft)}
          onCancel={() => {
            setSettingsOpen(false);
            setSettingsDraft(null);
            setProfileNotice(null);
          }}
          onExport={exportSettingsProfile}
          onImport={importSettingsProfile}
          onShortcutKeyDown={captureDraftShortcut}
          onResetShortcut={resetDraftShortcut}
          onResetAllShortcuts={resetAllDraftShortcuts}
          onMouseGestureChange={updateDraftMouseGesture}
          onResetAllSettings={resetAllDraftSettings}
        />
      )}
      {thumbnailManagerOpen && (
        <div className="dialog-backdrop">
          <section
            className="thumbnail-manager-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="サムネイル管理"
          >
            <div className="quick-access-heading">
              <h2>サムネイル管理</h2>
              <button type="button" onClick={() => setThumbnailManagerOpen(false)}>閉じる</button>
            </div>
            <p>
              利用者が読み込んだJPEGだけをapp-localに管理します。内部生成cacheは自動管理され、
              library原本や書庫には書き戻しません。
            </p>
            {legacyThumbnailDataPresent && (
              <p role="status">
                旧形式のthumbnailはlibrary rootを識別できないため自動移行しません。
                現在のlibraryでJPEGを一括読込してください。
              </p>
            )}
            <dl className="thumbnail-manager-stats">
              <div><dt>管理件数</dt><dd>{managedThumbnailStats.count}件</dd></div>
              <div><dt>管理容量</dt><dd>{formatThumbnailBytes(managedThumbnailStats.bytes)}</dd></div>
            </dl>
            <p>表示中: {selectedPath ?? "—"}</p>
            <div className="thumbnail-manager-actions">
              <button
                type="button"
                disabled={selectedThumbnailDataUrl === undefined}
                onClick={() => void saveDisplayedThumbnail()}
              >
                表示中thumbnailをJPEG保存
              </button>
              <label className="file-button">
                JPEGを一括読込
                <input
                  type="file"
                  accept="image/jpeg,.jpg,.jpeg"
                  multiple
                  onChange={(event) => void importManagedThumbnails(event)}
                />
              </label>
              <button
                type="button"
                disabled={managedThumbnailStats.count === 0}
                onClick={clearManagedThumbnails}
              >
                読み込んだthumbnailを削除
              </button>
            </div>
            {thumbnailManagerNotice !== null && <p role="status">{thumbnailManagerNotice}</p>}
          </section>
        </div>
      )}
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
            <h2 id="help-title">キー操作とショートカット</h2>
            <section aria-label="一般ヘルプ">
              <h3>一般ヘルプ</h3>
              <p>フォルダを登録し、フォルダ・漫画・単独画像をEnterで開きます。漫画はCtrl+Enterまたはダブルクリックでも読み始めます。</p>
            </section>
            <p>Enter: 選択項目を開く / Ctrl+Enter: 漫画として読む</p>
            <p>Esc: アドレス編集を戻す / 矢印: 項目を移動</p>
            <section aria-label="現在のショートカット">
              <h3>現在のショートカット</h3>
              <dl>
                {SHORTCUT_COMMANDS.map((command) => (
                  <div key={command}>
                    <dt>{SHORTCUT_LABELS[command]}</dt>
                    <dd>{shortcuts[command]}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <button data-product-id="shortcut-dialog-close" autoFocus onClick={closeHelp}>閉じる</button>
          </div>
        </div>
      )}
      {versionOpen && (
        <div className="dialog-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="version-title"
            className="help-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeVersion();
            }}
          >
            <h2 id="version-title">バージョン情報</h2>
            <p data-product-id="version-info">バージョン {APP_VERSION} / runtime: {runtimeLabel}</p>
            <button type="button" onClick={() => setLicenseOpen(true)}>
              third-party license noticeを開く
            </button>
            <button autoFocus type="button" onClick={closeVersion}>閉じる</button>
          </div>
        </div>
      )}
      {licenseOpen && (
        <div className="dialog-backdrop">
          <section
            className="license-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="third-party license notice"
          >
            <h2>Third-Party Notices</h2>
            <pre tabIndex={0}>{THIRD_PARTY_NOTICES}</pre>
            <button type="button" onClick={() => setLicenseOpen(false)}>閉じる</button>
          </section>
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
                      onClick={() => removeFromBookshelf(path)}
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
