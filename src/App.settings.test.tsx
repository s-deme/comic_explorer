import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { FullscreenAdapter } from "./features/viewer/fullscreen";
import type { AlwaysOnTopAdapter, WindowThemeAdapter } from "./features/workspace/window";
import {
  getCatalogSettings,
  getItemMetadata,
  getThumbnail,
  addFavorite,
  listFavorites,
  loadPage,
  listTreeChildren,
  listFolder,
  listenCatalogFolderChanges,
  listReadingHistory,
  listPageBookmarks,
  clearReadingHistory,
  openComic,
  resolveCatalogActivation,
  pickLibraryFile,
  pickLibraryRoot,
  pickSearchSource,
  registerLibraryRoot,
  watchLibraryFolder,
  stopLibraryFolderWatch,
  removeFavorite,
  restoreLibraryRoot,
  takeCliLaunchRequest,
  listenCliLaunchPending,
  listShelves,
  listArchiveVirtualTree,
  saveCatalogSort,
  saveCatalogViewMode,
  saveEndOfVolumePolicy,
  saveItemMemo,
  saveReadingPosition,
  savePageBookmark,
  saveSettingsProfile,
  listNamedSettingsProfiles,
  saveNamedSettingsProfile,
  previewNamedSettingsProfileSwitch,
  executeNamedSettingsProfileSwitch,
  deleteNamedSettingsProfile,
  saveViewerSettings,
  getTrayStatus,
  storeMainWindowInTray,
  quitApplication,
  setItemRating,
  searchLibrary,
  listCsvExportPresets,
  saveCsvExportPreset,
  deleteCsvExportPreset,
  exportCatalogCsv,
  takeRecoveryNotice,
  resolveFavorite,
  diagnoseLibrary,
  listenRecursiveThumbnailProgress,
  generateRecursiveThumbnails,
  cancelRecursiveThumbnailGeneration,
  renameFileItem,
  getRenamePreferences,
  saveRenamePreferences,
  createFileFolder,
  copyFileItemsToFolder,
  moveFileItemsToFolder,
  moveFileItemsToDestination,
  copyFileItemsToDestination,
  previewNativeFileDrop,
  copyNativeFileDrop,
  startNativeFileDrag,
  deleteFileItems,
  deletePageBookmark,
  setFileClipboard,
  getFileClipboardStatus,
  getFileUndoStatus,
  undoLastFileOperation,
  pasteFileItems,
  revealFileItem,
  openFileItemDefault,
  openFileItemWith,
  listWindowsKnownFolders,
  type CatalogSettings,
  type FavoriteEntry,
  type ItemMetadata,
  type ReadingHistoryEntry,
} from "./features/library/client";
import type { CatalogEntry, ImageFormat } from "./types/domain";
import { DEFAULT_SHORTCUTS } from "./features/input/shortcuts";
import { DEFAULT_VIEWER_QUADRANT_BINDINGS } from "./features/input/viewer-quadrants";
import {
  APP_VERSION,
  DEFAULT_MOUSE_GESTURES,
  SETTINGS_PROFILE_VERSION,
} from "./features/settings/profile";
import { listBookmarks } from "./features/reading/collections";
import { testArchiveEntry as testEntry } from "./test/catalog-fixtures";

const folderWatchHarness = vi.hoisted(() => ({
  handler: undefined as undefined | ((change: {
    generation: number;
    libraryRoot: string;
    relativePath: string;
    status: "changed" | "error";
    message?: string | null;
  }) => void),
}));

const recursiveThumbnailHarness = vi.hoisted(() => ({
  handler: undefined as undefined | ((progress: {
    generation: number;
    phase: "enumerating" | "generating" | "completed" | "cancelled";
    relativePath: string;
    processed: number;
    total: number;
    generated: number;
    cacheHits: number;
    failed: number;
  }) => void),
}));

const nativeFileDropHarness = vi.hoisted(() => ({
  handler: undefined as undefined | ((event: {
    type: "drop";
    paths: string[];
    position: { x: number; y: number };
  }) => void),
  target: { relativePath: "Target" } as { relativePath: string } | null,
}));

const cliLaunchHarness = vi.hoisted(() => ({
  handler: undefined as undefined | (() => void),
}));

vi.mock("./features/library/native-file-drop", () => ({
  listenNativeFileDrops: vi.fn(async (handler) => {
    nativeFileDropHarness.handler = handler;
    return vi.fn();
  }),
  nativeDropTargetAt: vi.fn(() => nativeFileDropHarness.target),
}));

vi.mock("./features/library/client", () => ({
  registerLibraryRoot: vi.fn(),
  pickLibraryFile: vi.fn(),
  pickLibraryRoot: vi.fn(),
  pickSearchSource: vi.fn(),
  listFolder: vi.fn(),
  listenCatalogFolderChanges: vi.fn(),
  watchLibraryFolder: vi.fn(),
  stopLibraryFolderWatch: vi.fn(),
  listTreeChildren: vi.fn(),
  listWindowsDrives: vi.fn(async () => ({
    status: "ok", requestId: "drives", generation: 1,
    data: [
      { absolutePath: "C:\\", name: "ローカル ディスク (C:)" },
      { absolutePath: "E:\\", name: "ボリューム (E:)" },
    ],
  })),
  listWindowsKnownFolders: vi.fn(async () => ({
    status: "ok", requestId: "known-folders", generation: 1, data: [],
  })),
  restoreLibraryRoot: vi.fn(),
  takeCliLaunchRequest: vi.fn(),
  listenCliLaunchPending: vi.fn(async () => () => undefined),
  listShelves: vi.fn(async () => ({ status: "ok", data: { shelves: [], nodes: [], startupShelfId: null } })),
  listArchiveVirtualTree: vi.fn(async () => ({ status: "ok", data: { archiveRelativePath: "book.cbz", entries: [] } })),
  getArchiveThumbnail: vi.fn(async () => ({ status: "cancelled" })),
  copyArchivePageToClipboard: vi.fn(async () => ({ status: "cancelled" })),
  openComic: vi.fn(),
  resolveCatalogActivation: vi.fn(async (kind: string) => ({ status: "ok", data: kind === "folder" || kind === "comicFolder" ? "navigate" : "read" })),
  resolveViewerRectangleZoom: vi.fn(),
  addFavorite: vi.fn(),
  listFavorites: vi.fn(),
  removeFavorite: vi.fn(),
  resolveFavorite: vi.fn(),
  getCatalogSettings: vi.fn(),
  getItemMetadata: vi.fn(),
  getThumbnail: vi.fn(),
  loadPage: vi.fn(),
  copyViewerPageToClipboard: vi.fn(),
  saveCatalogSort: vi.fn(),
  saveCatalogViewMode: vi.fn(),
  saveEndOfVolumePolicy: vi.fn(),
  saveItemMemo: vi.fn(),
  saveReadingPosition: vi.fn(),
  saveSettingsProfile: vi.fn(),
  listNamedSettingsProfiles: vi.fn(),
  listCustomThemes: vi.fn(async () => ({
    status: "ok", data: { themes: [], invalidThemes: [], maximumThemes: 32 },
  })),
  saveCustomTheme: vi.fn(),
  deleteCustomTheme: vi.fn(),
  exportCustomTheme: vi.fn(),
  previewCustomThemeImport: vi.fn(),
  executeCustomThemeImport: vi.fn(),
  saveNamedSettingsProfile: vi.fn(),
  previewNamedSettingsProfileSwitch: vi.fn(),
  executeNamedSettingsProfileSwitch: vi.fn(),
  deleteNamedSettingsProfile: vi.fn(),
  saveViewerSettings: vi.fn(),
  getTrayStatus: vi.fn(),
  storeMainWindowInTray: vi.fn(),
  quitApplication: vi.fn(),
  setItemRating: vi.fn(),
  searchLibrary: vi.fn(),
  listCsvExportPresets: vi.fn(),
  saveCsvExportPreset: vi.fn(),
  deleteCsvExportPreset: vi.fn(),
  exportCatalogCsv: vi.fn(),
  diagnoseLibrary: vi.fn(),
  cancelLibraryDiagnostics: vi.fn(),
  listenRecursiveThumbnailProgress: vi.fn(),
  generateRecursiveThumbnails: vi.fn(),
  cancelRecursiveThumbnailGeneration: vi.fn(),
  takeRecoveryNotice: vi.fn(),
  listReadingHistory: vi.fn(),
  listPageBookmarks: vi.fn(),
  clearReadingHistory: vi.fn(),
  savePageBookmark: vi.fn(),
  deletePageBookmark: vi.fn(),
  renameFileItem: vi.fn(),
  getRenamePreferences: vi.fn(),
  saveRenamePreferences: vi.fn(),
  previewBatchRename: vi.fn(),
  executeBatchRename: vi.fn(),
  createFileFolder: vi.fn(),
  copyFileItemsToFolder: vi.fn(),
  moveFileItemsToFolder: vi.fn(),
  moveFileItemsToDestination: vi.fn(),
  copyFileItemsToDestination: vi.fn(),
  previewNativeFileDrop: vi.fn(),
  copyNativeFileDrop: vi.fn(),
  startNativeFileDrag: vi.fn(),
  deleteFileItems: vi.fn(),
  setFileClipboard: vi.fn(),
  getFileClipboardStatus: vi.fn(),
  getFileUndoStatus: vi.fn(),
  undoLastFileOperation: vi.fn(),
  pasteFileItems: vi.fn(),
  revealFileItem: vi.fn(),
  openFileItemDefault: vi.fn(),
  openFileItemWith: vi.fn(),
}));

function markViewerPrefetchReady(): void {
  document.querySelectorAll<HTMLImageElement>(".prefetch-page")
    .forEach((image) => fireEvent.load(image));
}

const registerMock = vi.mocked(registerLibraryRoot);
const pickerMock = vi.mocked(pickLibraryRoot);
const searchSourcePickerMock = vi.mocked(pickSearchSource);
const filePickerMock = vi.mocked(pickLibraryFile);
const listMock = vi.mocked(listFolder);
const listenCatalogFolderChangesMock = vi.mocked(listenCatalogFolderChanges);
const watchLibraryFolderMock = vi.mocked(watchLibraryFolder);
const stopLibraryFolderWatchMock = vi.mocked(stopLibraryFolderWatch);
const treeMock = vi.mocked(listTreeChildren);
const restoreMock = vi.mocked(restoreLibraryRoot);
const takeCliLaunchRequestMock = vi.mocked(takeCliLaunchRequest);
const listenCliLaunchPendingMock = vi.mocked(listenCliLaunchPending);
const listShelvesMock = vi.mocked(listShelves);
const listArchiveVirtualTreeMock = vi.mocked(listArchiveVirtualTree);
const openMock = vi.mocked(openComic);
const resolveCatalogActivationMock = vi.mocked(resolveCatalogActivation);
const settingsMock = vi.mocked(getCatalogSettings);
const metadataMock = vi.mocked(getItemMetadata);
const thumbnailMock = vi.mocked(getThumbnail);
const addFavoriteMock = vi.mocked(addFavorite);
const listFavoritesMock = vi.mocked(listFavorites);
const removeFavoriteMock = vi.mocked(removeFavorite);
const resolveFavoriteMock = vi.mocked(resolveFavorite);
const loadPageMock = vi.mocked(loadPage);
const saveSortMock = vi.mocked(saveCatalogSort);
const saveCatalogViewModeMock = vi.mocked(saveCatalogViewMode);
const saveEndPolicyMock = vi.mocked(saveEndOfVolumePolicy);
const saveMemoMock = vi.mocked(saveItemMemo);
const saveReadingMock = vi.mocked(saveReadingPosition);
const saveSettingsProfileMock = vi.mocked(saveSettingsProfile);
const listNamedSettingsProfilesMock = vi.mocked(listNamedSettingsProfiles);
const saveNamedSettingsProfileMock = vi.mocked(saveNamedSettingsProfile);
const previewNamedSettingsProfileSwitchMock = vi.mocked(previewNamedSettingsProfileSwitch);
const executeNamedSettingsProfileSwitchMock = vi.mocked(executeNamedSettingsProfileSwitch);
const deleteNamedSettingsProfileMock = vi.mocked(deleteNamedSettingsProfile);
const saveViewerMock = vi.mocked(saveViewerSettings);
const getTrayStatusMock = vi.mocked(getTrayStatus);
const storeMainWindowInTrayMock = vi.mocked(storeMainWindowInTray);
const quitApplicationMock = vi.mocked(quitApplication);
const setRatingMock = vi.mocked(setItemRating);
const searchMock = vi.mocked(searchLibrary);
const listCsvExportPresetsMock = vi.mocked(listCsvExportPresets);
const saveCsvExportPresetMock = vi.mocked(saveCsvExportPreset);
const deleteCsvExportPresetMock = vi.mocked(deleteCsvExportPreset);
const exportCatalogCsvMock = vi.mocked(exportCatalogCsv);
const recoveryNoticeMock = vi.mocked(takeRecoveryNotice);
const historyMock = vi.mocked(listReadingHistory);
const listPageBookmarksMock = vi.mocked(listPageBookmarks);
const clearHistoryMock = vi.mocked(clearReadingHistory);
const savePageBookmarkMock = vi.mocked(savePageBookmark);
const deletePageBookmarkMock = vi.mocked(deletePageBookmark);
const diagnoseMock = vi.mocked(diagnoseLibrary);
const listenRecursiveThumbnailProgressMock = vi.mocked(listenRecursiveThumbnailProgress);
const generateRecursiveThumbnailsMock = vi.mocked(generateRecursiveThumbnails);
const cancelRecursiveThumbnailGenerationMock = vi.mocked(cancelRecursiveThumbnailGeneration);
const renameFileItemMock = vi.mocked(renameFileItem);
const getRenamePreferencesMock = vi.mocked(getRenamePreferences);
const saveRenamePreferencesMock = vi.mocked(saveRenamePreferences);
const createFileFolderMock = vi.mocked(createFileFolder);
const copyFileItemsToFolderMock = vi.mocked(copyFileItemsToFolder);
const moveFileItemsToFolderMock = vi.mocked(moveFileItemsToFolder);
const moveFileItemsToDestinationMock = vi.mocked(moveFileItemsToDestination);
const copyFileItemsToDestinationMock = vi.mocked(copyFileItemsToDestination);
const previewNativeFileDropMock = vi.mocked(previewNativeFileDrop);
const copyNativeFileDropMock = vi.mocked(copyNativeFileDrop);
const startNativeFileDragMock = vi.mocked(startNativeFileDrag);
const deleteFileItemsMock = vi.mocked(deleteFileItems);
const setFileClipboardMock = vi.mocked(setFileClipboard);
const getFileClipboardStatusMock = vi.mocked(getFileClipboardStatus);
const getFileUndoStatusMock = vi.mocked(getFileUndoStatus);
const undoLastFileOperationMock = vi.mocked(undoLastFileOperation);
const pasteFileItemsMock = vi.mocked(pasteFileItems);
const revealFileItemMock = vi.mocked(revealFileItem);
const openFileItemDefaultMock = vi.mocked(openFileItemDefault);
const openFileItemWithMock = vi.mocked(openFileItemWith);
const knownFoldersMock = vi.mocked(listWindowsKnownFolders);

const DEFAULT_CATALOG_SETTINGS: CatalogSettings = {
  sortField: "name",
  sortDescending: false,
  endOfVolumePolicy: "auto_next",
  catalogViewMode: "cover_list",
  catalogThumbnailSizes: { smallThumbnail: 104, coverList: 144, cardGrid: 216, referenceTile: 128 },
  viewMode: "single",
  spreadPortraitMaxAspectPercent: 100,
  autoSpreadMinViewportAspectPercent: 125,
  spreadFirstPageSingle: false,
  spreadPairing: "continuous",
  fitAllowUpscale: false,
  fitBasis: "spread",
  fitIncludePageMargin: true,
  readingDirection: "rightToLeft",
  scaleMode: "fit",
  scale: 1,
  loupeEnabled: false,
  loupeSize: 180,
  loupeZoom: 2,
  prefetchAhead: 4,
  prefetchBehind: 0,
  prefetchMemoryMiB: 256,
  fullscreenEscapeBehavior: "exitFullscreen",
  preventDisplaySleepFullscreen: false,
  trayStoreOnMinimize: false,
  trayCloseBehavior: "quit",
  trayRestoreGesture: "singleClick",
  slideshowIntervalMs: 3_000,
  slideshowOrder: "forward",
  slideshowRepeatCurrentItem: false,
  viewerCatalogSelectionSync: true,
  viewerBackground: "checker",
  viewerPageMargin: 0,
  viewerSpreadGap: 8,
  cursorAutoHideMs: 0,
  zoomRetention: "global",
  viewerGridEnabled: false,
  viewerGridSize: 32,
  viewerGridColor: "light",
  panFactor: 1,
  wheelDeadZone: 0,
  scrollStepPercent: 90,
  keyScrollAccelerationPercent: 150,
  keyScrollContinuous: true,
  smoothScroll: true,
  pageScanMode: "vertical",
  treeVisible: true,
  treeAutoCollapse: false,
  treeConfirmChildren: true,
  treeWidth: 240,
  treeHeight: 240,
  catalogPanePosition: "right",
  menuBarVisible: true,
  toolbarVisible: true,
  addressBarVisible: true,
  statusBarVisible: true,
  alwaysOnTop: false,
  themeSelection: { kind: "system" },
  customThemeSnapshot: null,
  themeFallbackReason: null,
  navigationSelectionPolicy: "restore",
  thumbnailGenerationScope: "near",
  startupLocation: "last",
  showHiddenFiles: false,
  restoreLastViewer: false,
    autoRefreshCurrentFolder: true,
    folderOpenRule: "navigate",
    imageOpenRule: "read",
    archiveOpenRule: "read",
    detailGridLines: "none",
    detailRowDensity: "standard",
    detailShowKind: true,
    detailShowSize: true,
    detailShowModified: true,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  catalogMouseBindings: {
    primaryClick: "selectOnly",
    doubleClick: "openSelected",
    middleClick: "none",
    backButton: "navigateBack",
    forwardButton: "navigateForward",
  },
  viewerQuadrantBindings: { ...DEFAULT_VIEWER_QUADRANT_BINDINGS },
  viewerRightClickAction: "none",
  mouseGestures: { ...DEFAULT_MOUSE_GESTURES },
};

function testSession(itemKey: string) {
  return {
    itemKey,
    displayName: itemKey,
    pages: [
      {
        id: `${itemKey}-page` as never,
        relativePath: "page-1.png" as never,
        mediaUri: "data:image/png;base64,fixture",
      },
    ],
    startIndex: 0,
  };
}

function viewerResponse(itemKey: string) {
  return {
    status: "ok" as const,
    requestId: `open-${itemKey}` as never,
    generation: 1 as never,
    data: testSession(itemKey),
  };
}

function fileOperationResponse(operation: string, affected = 1) {
  return {
    status: "ok" as const,
    requestId: `file-${operation}` as never,
    generation: 1 as never,
    data: { operation: operation as never, affected },
  };
}

function searchResponse(results: CatalogEntry[]) {
  return {
    status: "ok" as const,
    requestId: "search" as never,
    generation: 1 as never,
    data: results,
  };
}

function favoriteEntry(
  relativePath: string,
  overrides: Partial<FavoriteEntry> = {},
): FavoriteEntry {
  return {
    favoriteId: `favorite-${relativePath.replaceAll("/", "-")}`,
    itemIdentity: `item-${relativePath.replaceAll("/", "-")}`,
    relativePath: relativePath as never,
    resolvedPath: relativePath as never,
    kind: "folder",
    status: "available",
    ...overrides,
  };
}

function favoritesResponse(data: FavoriteEntry[]) {
  return {
    status: "ok" as const,
    requestId: "favorites" as never,
    generation: 1 as never,
    data,
  };
}

function metadataResponse(
  itemIdentity: string,
  overrides: Partial<ItemMetadata> = {},
) {
  return {
    status: "ok" as const,
    requestId: `metadata-${itemIdentity}` as never,
    generation: 1 as never,
    data: {
      itemIdentity: itemIdentity as never,
      memo: null,
      rating: null,
      ...overrides,
    },
  };
}

function historyResponse(data: ReadingHistoryEntry[]) {
  return {
    status: "ok" as const,
    requestId: "history" as never,
    generation: 1 as never,
    data,
  };
}

async function registerTestLibrary(
  entries: CatalogEntry[],
  fullscreenAdapter?: FullscreenAdapter,
  alwaysOnTopAdapter?: AlwaysOnTopAdapter,
  windowThemeAdapter: WindowThemeAdapter = { setTheme: async () => undefined },
) {
  restoreMock.mockResolvedValue({
    status: "ok",
    requestId: "restore" as never,
    generation: 1 as never,
    data: { absolutePath: "C:\\" },
  });
  registerMock.mockResolvedValue({
    status: "ok",
    requestId: "register" as never,
    generation: 1 as never,
    data: { absolutePath: "C:\\" },
  });
  listMock.mockResolvedValue({
    status: "ok",
    requestId: "list" as never,
    generation: 2 as never,
    data: entries,
  });
  thumbnailMock.mockResolvedValue({
    status: "error",
    requestId: "thumbnail" as never,
    generation: 1 as never,
    error: {
      code: "NOT_FOUND",
      message: "missing",
      retryable: true,
    },
  });
  render(
    <App
      fullscreenAdapter={fullscreenAdapter}
      alwaysOnTopAdapter={alwaysOnTopAdapter}
      windowThemeAdapter={windowThemeAdapter}
    />,
  );
  await screen.findByRole("grid", { name: "現在のフォルダの項目" });
}

async function openTestComic(relativePath: string) {
  const grid = await screen.findByRole("grid", { name: "現在のフォルダの項目" });
  const comicButton = within(grid)
    .getAllByRole("button")
    .find((button) => button.getAttribute("data-relative-path") === relativePath);
  expect(comicButton).toBeDefined();
  expect(comicButton).toHaveAttribute("data-relative-path", relativePath);
  const basename = relativePath.split("/").at(-1) ?? relativePath;
  expect(comicButton).toHaveAccessibleName(expect.stringContaining(basename));
  fireEvent.keyDown(comicButton!, { key: "Enter" });
  await screen.findByLabelText(`${relativePath} ビューワ`);
}

function openAppMenu(name: "ファイル" | "編集" | "表示" | "オプション" | "ヘルプ") {
  fireEvent.click(screen.getByRole("menuitem", { name }));
  return screen.getByRole("menu", { name });
}

function chooseAppMenuItem(
  menuName: "ファイル" | "編集" | "表示" | "オプション" | "ヘルプ",
  itemName: string | RegExp,
) {
  const menu = openAppMenu(menuName);
  fireEvent.click(within(menu).getByRole("menuitem", { name: itemName }));
}

function chooseToolbarMenuItem(
  triggerName: "並べ替え条件" | "一覧表示形式",
  menuName: "並べ替え候補" | "一覧表示形式候補",
  itemName: string,
) {
  fireEvent.click(screen.getByRole("button", { name: triggerName }));
  const menu = screen.getByRole("menu", { name: menuName });
  fireEvent.click(within(menu).getByRole("menuitemradio", { name: itemName }));
}

function openSearchPane() {
  fireEvent.click(screen.getByRole("button", { name: "検索ペインを表示" }));
  return screen.getByRole("complementary", { name: "検索ペイン" });
}

describe("application settings", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    folderWatchHarness.handler = undefined;
    cliLaunchHarness.handler = undefined;
    recursiveThumbnailHarness.handler = undefined;
    nativeFileDropHarness.handler = undefined;
  });

  beforeEach(() => {
    registerMock.mockReset();
    pickerMock.mockReset();
    searchSourcePickerMock.mockReset();
    filePickerMock.mockReset();
    listMock.mockReset();
    listenCatalogFolderChangesMock.mockReset();
    watchLibraryFolderMock.mockReset();
    stopLibraryFolderWatchMock.mockReset();
    folderWatchHarness.handler = undefined;
    treeMock.mockReset();
    restoreMock.mockReset();
    takeCliLaunchRequestMock.mockReset();
    listenCliLaunchPendingMock.mockReset();
    listShelvesMock.mockReset();
    listShelvesMock.mockResolvedValue({
      status: "ok",
      requestId: "shelves" as never,
      generation: 1 as never,
      data: { shelves: [], nodes: [], startupShelfId: null },
    });
    listArchiveVirtualTreeMock.mockReset();
    listArchiveVirtualTreeMock.mockResolvedValue({
      status: "ok",
      requestId: "archive-tree" as never,
      generation: 1 as never,
      data: { archiveRelativePath: "book.cbz" as never, entries: [] },
    });
    cliLaunchHarness.handler = undefined;
    takeCliLaunchRequestMock.mockResolvedValue({
      status: "ok",
      requestId: "cli-empty" as never,
      generation: 1 as never,
      data: null,
    });
    listenCliLaunchPendingMock.mockImplementation(async (handler) => {
      cliLaunchHarness.handler = handler;
      return vi.fn();
    });
    openMock.mockReset();
    resolveCatalogActivationMock.mockReset();
    resolveCatalogActivationMock.mockImplementation(async (kind, _trigger, generation) => ({
      status: "ok",
      requestId: "activation" as never,
      generation: generation as never,
      data: kind === "folder" || kind === "comicFolder" ? "navigate" : "read",
    }));
    settingsMock.mockReset();
    metadataMock.mockReset();
    thumbnailMock.mockReset();
    addFavoriteMock.mockReset();
    listFavoritesMock.mockReset();
    removeFavoriteMock.mockReset();
    resolveFavoriteMock.mockReset();
    loadPageMock.mockReset();
    saveSortMock.mockReset();
    saveCatalogViewModeMock.mockReset();
    saveEndPolicyMock.mockReset();
    saveMemoMock.mockReset();
    saveReadingMock.mockReset();
    saveSettingsProfileMock.mockReset();
    listNamedSettingsProfilesMock.mockReset();
    saveNamedSettingsProfileMock.mockReset();
    previewNamedSettingsProfileSwitchMock.mockReset();
    executeNamedSettingsProfileSwitchMock.mockReset();
    deleteNamedSettingsProfileMock.mockReset();
    saveViewerMock.mockReset();
    getTrayStatusMock.mockReset();
    storeMainWindowInTrayMock.mockReset();
    quitApplicationMock.mockReset();
    setRatingMock.mockReset();
    searchMock.mockReset();
    listCsvExportPresetsMock.mockReset();
    saveCsvExportPresetMock.mockReset();
    deleteCsvExportPresetMock.mockReset();
    exportCatalogCsvMock.mockReset();
    recoveryNoticeMock.mockReset();
    historyMock.mockReset();
    listPageBookmarksMock.mockReset();
    clearHistoryMock.mockReset();
    savePageBookmarkMock.mockReset();
    deletePageBookmarkMock.mockReset();
    diagnoseMock.mockReset();
    listenRecursiveThumbnailProgressMock.mockReset();
    generateRecursiveThumbnailsMock.mockReset();
    cancelRecursiveThumbnailGenerationMock.mockReset();
    recursiveThumbnailHarness.handler = undefined;
    renameFileItemMock.mockReset();
    getRenamePreferencesMock.mockReset();
    saveRenamePreferencesMock.mockReset();
    createFileFolderMock.mockReset();
    copyFileItemsToFolderMock.mockReset();
    moveFileItemsToFolderMock.mockReset();
    moveFileItemsToDestinationMock.mockReset();
    copyFileItemsToDestinationMock.mockReset();
    previewNativeFileDropMock.mockReset();
    copyNativeFileDropMock.mockReset();
    startNativeFileDragMock.mockReset();
    nativeFileDropHarness.handler = undefined;
    nativeFileDropHarness.target = { relativePath: "Target" };
    deleteFileItemsMock.mockReset();
    setFileClipboardMock.mockReset();
    getFileClipboardStatusMock.mockReset();
    getFileUndoStatusMock.mockReset();
    undoLastFileOperationMock.mockReset();
    pasteFileItemsMock.mockReset();
    revealFileItemMock.mockReset();
    openFileItemDefaultMock.mockReset();
    openFileItemWithMock.mockReset();
    knownFoldersMock.mockReset();
    knownFoldersMock.mockResolvedValue({
      status: "ok", requestId: "known-folders" as never, generation: 1 as never, data: [],
    });
    listenCatalogFolderChangesMock.mockImplementation(async (handler) => {
      folderWatchHarness.handler = handler;
      return vi.fn();
    });
    listenRecursiveThumbnailProgressMock.mockImplementation(async (handler) => {
      recursiveThumbnailHarness.handler = handler;
      return vi.fn();
    });
    cancelRecursiveThumbnailGenerationMock.mockResolvedValue({
      status: "cancelled",
      requestId: "cancel-recursive-thumbnails" as never,
      generation: 1 as never,
    });
    watchLibraryFolderMock.mockImplementation(async (_path, generation) => ({
      status: "ok",
      requestId: "watch-folder" as never,
      generation: generation as never,
      data: true,
    }));
    stopLibraryFolderWatchMock.mockImplementation(async (generation) => ({
      status: "ok",
      requestId: "stop-watch-folder" as never,
      generation: generation as never,
      data: true,
    }));
    listCsvExportPresetsMock.mockResolvedValue({
      status: "ok", requestId: "csv-presets" as never, generation: 1 as never, data: [],
    });
    exportCatalogCsvMock.mockResolvedValue({
      status: "ok",
      requestId: "csv-export" as never,
      generation: 1 as never,
      data: { fileName: "catalog.csv", bytes: [0xef, 0xbb, 0xbf], rowCount: 1 },
    });
    renameFileItemMock.mockResolvedValue(fileOperationResponse("rename"));
    getRenamePreferencesMock.mockResolvedValue({
      status: "ok", requestId: "rename-preferences" as never, generation: 1 as never,
      data: { selectExtension: false, sequenceStart: 1, sequenceDigits: 3, separator: "_", preserveExtension: true },
    });
    saveRenamePreferencesMock.mockResolvedValue({
      status: "ok", requestId: "save-rename-preferences" as never, generation: 1 as never,
      data: { selectExtension: false, sequenceStart: 1, sequenceDigits: 3, separator: "_", preserveExtension: true },
    });
    createFileFolderMock.mockResolvedValue(fileOperationResponse("createFolder"));
    copyFileItemsToFolderMock.mockResolvedValue(fileOperationResponse("copy"));
    moveFileItemsToFolderMock.mockResolvedValue(fileOperationResponse("move"));
    moveFileItemsToDestinationMock.mockResolvedValue(fileOperationResponse("move"));
    copyFileItemsToDestinationMock.mockResolvedValue(fileOperationResponse("copy"));
    previewNativeFileDropMock.mockResolvedValue({
      status: "ok",
      requestId: "native-file-drop-preview" as never,
      generation: 1 as never,
      data: {
        destinationRelativePath: "Target",
        items: [{ name: "outside.cbz", kind: "file" }],
        fileCount: 1,
        folderCount: 0,
      },
    });
    copyNativeFileDropMock.mockResolvedValue(fileOperationResponse("copy"));
    startNativeFileDragMock.mockResolvedValue(fileOperationResponse("dragCopy"));
    deleteFileItemsMock.mockResolvedValue(fileOperationResponse("recycle"));
    setFileClipboardMock.mockResolvedValue(fileOperationResponse("clipboardCopy"));
    pasteFileItemsMock.mockResolvedValue(fileOperationResponse("pasteCopy"));
    revealFileItemMock.mockResolvedValue(fileOperationResponse("reveal"));
    openFileItemDefaultMock.mockResolvedValue(fileOperationResponse("openDefault"));
    openFileItemWithMock.mockResolvedValue(fileOperationResponse("openWith"));
    getFileClipboardStatusMock.mockResolvedValue({
      status: "ok",
      requestId: "file-clipboard-status" as never,
      generation: 1 as never,
      data: { available: true, cut: false, items: 2 },
    });
    getFileUndoStatusMock.mockResolvedValue({
      status: "ok",
      requestId: "file-undo-status" as never,
      generation: 1 as never,
      data: { available: false, operation: null, affected: 0 },
    });
    undoLastFileOperationMock.mockResolvedValue(fileOperationResponse("undo"));
    recoveryNoticeMock.mockResolvedValue({
      status: "ok",
      requestId: "recovery" as never,
      generation: 1 as never,
      data: false,
    });
    metadataMock.mockImplementation(async (itemIdentity) => metadataResponse(itemIdentity));
    saveMemoMock.mockImplementation(async (itemIdentity, body) =>
      metadataResponse(itemIdentity, { memo: body.trim() === "" ? null : body }),
    );
    setRatingMock.mockImplementation(async (itemIdentity, rating) =>
      metadataResponse(itemIdentity, { rating }),
    );
    historyMock.mockResolvedValue(historyResponse([]));
    listPageBookmarksMock.mockResolvedValue({
      status: "ok", requestId: "bookmarks" as never, generation: 1 as never, data: [],
    });
    savePageBookmarkMock.mockImplementation(async (bookmark) => ({
      status: "ok", requestId: "save-bookmark" as never, generation: 1 as never,
      data: [bookmark],
    }));
    deletePageBookmarkMock.mockResolvedValue({
      status: "ok", requestId: "delete-bookmark" as never, generation: 1 as never, data: [],
    });
    clearHistoryMock.mockResolvedValue({
      status: "ok",
      requestId: "clear-history" as never,
      generation: 1 as never,
      data: undefined,
    });
    listFavoritesMock.mockResolvedValue(favoritesResponse([]));
    addFavoriteMock.mockResolvedValue(favoritesResponse([]));
    removeFavoriteMock.mockResolvedValue(favoritesResponse([]));
    resolveFavoriteMock.mockResolvedValue(favoritesResponse([]));
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "settings" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS },
    });
    getTrayStatusMock.mockResolvedValue({
      status: "ok",
      requestId: "tray-status" as never,
      generation: 1 as never,
      data: { available: true, stored: false, reason: null },
    });
    storeMainWindowInTrayMock.mockResolvedValue({
      status: "ok",
      requestId: "tray-store" as never,
      generation: 1 as never,
      data: { available: true, stored: true, reason: null },
    });
    quitApplicationMock.mockResolvedValue({
      status: "ok",
      requestId: "quit" as never,
      generation: 1 as never,
      data: undefined,
    });
    saveSettingsProfileMock.mockImplementation(async (profile) => ({
      status: "ok",
      requestId: "save-profile" as never,
      generation: 1 as never,
      data: {
        ...profile,
        themeFallbackReason: null,
      },
    }));
    listNamedSettingsProfilesMock.mockResolvedValue({
      status: "ok",
      requestId: "named-profiles" as never,
      generation: 1 as never,
      data: [],
    });
    saveNamedSettingsProfileMock.mockImplementation(async (name) => ({
      status: "ok",
      requestId: "save-named-profile" as never,
      generation: 1 as never,
      data: { name, updatedAtMs: 1, active: false },
    }));
    deleteNamedSettingsProfileMock.mockResolvedValue({
      status: "ok",
      requestId: "delete-named-profile" as never,
      generation: 1 as never,
      data: true,
    });
    saveSortMock.mockResolvedValue({
      status: "ok",
      requestId: "save-sort" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS },
    });
    saveEndPolicyMock.mockResolvedValue({
      status: "ok",
      requestId: "save-end-policy" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS },
    });
    saveReadingMock.mockResolvedValue({
      status: "ok",
      requestId: "save-reading" as never,
      generation: 1 as never,
      data: undefined,
    });
    saveCatalogViewModeMock.mockImplementation(async (mode) => ({
      status: "ok",
      requestId: "save-catalog-view-mode" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS, catalogViewMode: mode },
    }));
    saveViewerMock.mockResolvedValue({
      status: "ok",
      requestId: "save-viewer" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS },
    });
    restoreMock.mockResolvedValue({
      status: "ok",
      requestId: "restore" as never,
      generation: 1 as never,
      data: null,
    });
    pickerMock.mockResolvedValue({
      status: "ok",
      requestId: "picker" as never,
      generation: 1 as never,
      data: null,
    });
    searchSourcePickerMock.mockResolvedValue({
      status: "ok",
      requestId: "search-source-picker" as never,
      generation: 1 as never,
      data: null,
    });
    filePickerMock.mockResolvedValue({
      status: "ok",
      requestId: "file-picker" as never,
      generation: 1 as never,
      data: null,
    });
    treeMock.mockResolvedValue({
      status: "ok",
      requestId: "tree" as never,
      generation: 1 as never,
      data: [],
    });
  });


  it("REQ-LEY-P3-019 saves with overwrite confirmation and switches an atomic Rust profile", async () => {
    const switchedProfile = {
      profileVersion: SETTINGS_PROFILE_VERSION,
      ...DEFAULT_CATALOG_SETTINGS,
      sortField: "size" as const,
    };
    listNamedSettingsProfilesMock.mockResolvedValue({
      status: "ok",
      requestId: "named-profiles" as never,
      generation: 1 as never,
      data: [{ name: "Work", updatedAtMs: 1, active: false }],
    });
    previewNamedSettingsProfileSwitchMock.mockResolvedValue({
      status: "ok",
      requestId: "profile-preview" as never,
      generation: 2 as never,
      data: {
        name: "Work",
        changedFieldCount: 1,
        profile: switchedProfile,
        confirmationKey: "opaque-profile-key",
      },
    });
    executeNamedSettingsProfileSwitchMock.mockResolvedValue({
      status: "ok",
      requestId: "profile-switch" as never,
      generation: 3 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS, sortField: "size" },
    });
    await registerTestLibrary([testEntry("book.cbz")]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^プロファイル/ }));
    await within(dialog).findByText("Work");

    fireEvent.change(within(dialog).getByLabelText("保存するprofile名"), {
      target: { value: " Work " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "現在の下書きを保存" }));
    expect(within(dialog).getByRole("group", { name: "profile上書き確認" }))
      .toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "上書きを確認" }));
    await waitFor(() => expect(saveNamedSettingsProfileMock).toHaveBeenCalledWith(
      "Work",
      expect.objectContaining({ profileVersion: SETTINGS_PROFILE_VERSION }),
      true,
      expect.any(Number),
    ));

    fireEvent.click(within(dialog).getByRole("button", { name: "切り替える" }));
    const confirmation = await within(dialog).findByRole("group", { name: "profile切替確認" });
    expect(within(confirmation).getByText(/1項目が変わります/)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "切替を確認" }));
    await waitFor(() => expect(executeNamedSettingsProfileSwitchMock).toHaveBeenCalledWith(
      "Work",
      "opaque-profile-key",
      true,
      expect.any(Number),
    ));
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();
    expect(await screen.findByText("設定profile「Work」へ切り替えました。"))
      .toBeInTheDocument();
  });

  it("FT-B19-001 keeps integrated settings as a draft until Cancel", async () => {
    await registerTestLibrary([testEntry("book.cbz")]);
    chooseAppMenuItem("オプション", "統合設定…");
    let dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    expect(within(categories).getByRole("button", { name: /^一覧表示/ }))
      .toHaveAttribute("aria-current", "page");
    fireEvent.click(within(categories).getByRole("button", { name: /^操作/ }));
    const inputGroups = within(dialog).getByRole("navigation", { name: "操作と入力の分類" });
    expect(within(inputGroups).getAllByRole("button").map((button) => button.textContent)).toEqual([
      expect.stringContaining("キー設定"),
      expect.stringContaining("マウス設定"),
      expect.stringContaining("ジェスチャー設定"),
    ]);
    expect(within(dialog).queryByLabelText("doubleClickジェスチャー"))
      .not.toBeInTheDocument();
    fireEvent.click(within(inputGroups).getByRole("button", { name: /^ジェスチャー設定/ }));
    expect(within(dialog).getByText("doubleClick: 全画面表示／解除（固定）"))
      .toBeInTheDocument();
    fireEvent.click(within(categories).getByRole("button", { name: /^一覧表示/ }));
    fireEvent.change(within(dialog).getByLabelText("profile一覧形式"), {
      target: { value: "reference_tile" },
    });
    const draftInformationCardSize = within(dialog).getByRole("spinbutton", {
      name: "profile情報カードのサイズ（px）",
    });
    const draftCardGridSize = within(dialog).getByRole("spinbutton", {
      name: "profileカードグリッドのサイズ（px）",
    });
    expect(draftInformationCardSize).toHaveValue(128);
    expect(draftCardGridSize).toHaveValue(216);
    expect(draftCardGridSize).toHaveAttribute("min", "64");
    expect(draftCardGridSize).toHaveAttribute("max", "320");
    fireEvent.change(draftInformationCardSize, { target: { value: "176" } });
    fireEvent.change(draftCardGridSize, { target: { value: "224" } });
    fireEvent.click(within(categories).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profileフォルダツリー"));
    fireEvent.click(within(categories).getByRole("button", { name: /^ビューワ/ }));
    const draftScale = within(dialog).getByRole("spinbutton", {
      name: "profile任意倍率（%）",
    });
    expect(draftScale).toHaveValue(100);
    expect(draftScale).toHaveAttribute("min", "1");
    expect(draftScale).toHaveAttribute("max", "800");
    expect(draftScale).toHaveAttribute("step", "1");
    fireEvent.change(draftScale, { target: { value: "175" } });
    fireEvent.click(within(categories).getByRole("button", { name: /^操作/ }));
    fireEvent.click(within(inputGroups).getByRole("button", { name: /^キー設定/ }));
    fireEvent.keyDown(within(dialog).getByLabelText("次ページショートカット"), {
      key: "j",
      ctrlKey: true,
    });
    fireEvent.click(within(inputGroups).getByRole("button", { name: /^ジェスチャー設定/ }));
    fireEvent.change(within(dialog).getByLabelText("middleClickジェスチャー"), {
      target: { value: "toggleDirection" },
    });
    fireEvent.click(within(inputGroups).getByRole("button", { name: /^マウス設定/ }));
    fireEvent.change(within(dialog).getByLabelText("profile一覧中央ボタン割当"), {
      target: { value: "toggleSearch" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileViewer左上クリック割当"), {
      target: { value: "zoomIn" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileViewer右クリック割当"), {
      target: { value: "zoomIn" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));

    expect(screen.getByLabelText("一覧表示形式"))
      .toHaveAttribute("data-catalog-view-mode", "cover_list");
    expect(screen.getByRole("complementary", { name: "フォルダツリー" })).toBeInTheDocument();
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();
  }, 30_000);

  it("FT-B19-001 applies representative settings from each category atomically", async () => {
    await registerTestLibrary([testEntry("book.cbz")]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    fireEvent.change(within(dialog).getByLabelText("profile一覧形式"), {
      target: { value: "reference_tile" },
    });
    fireEvent.change(within(dialog).getByRole("spinbutton", {
      name: "profile情報カードのサイズ（px）",
    }), { target: { value: "176" } });
    fireEvent.click(within(categories).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profileフォルダツリー"));
    fireEvent.click(within(categories).getByRole("button", { name: /^ビューワ/ }));
    fireEvent.change(
      within(dialog).getByRole("spinbutton", { name: "profile任意倍率（%）" }),
      { target: { value: "175" } },
    );
    fireEvent.click(within(categories).getByRole("button", { name: /^操作/ }));
    const inputGroups = within(dialog).getByRole("navigation", { name: "操作と入力の分類" });
    fireEvent.click(within(inputGroups).getByRole("button", { name: /^ジェスチャー設定/ }));
    fireEvent.change(within(dialog).getByLabelText("middleClickジェスチャー"), {
      target: { value: "toggleDirection" },
    });
    fireEvent.click(within(inputGroups).getByRole("button", { name: /^マウス設定/ }));
    fireEvent.change(within(dialog).getByLabelText("profile一覧中央ボタン割当"), {
      target: { value: "toggleSearch" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileViewer左上クリック割当"), {
      target: { value: "zoomIn" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileViewer右クリック割当"), {
      target: { value: "zoomIn" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "統合設定" })).not.toBeInTheDocument());
    expect(saveSettingsProfileMock).toHaveBeenCalledTimes(1);
    expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogViewMode: "reference_tile",
        catalogThumbnailSizes: {
          smallThumbnail: 104,
          coverList: 144,
          cardGrid: 216,
          referenceTile: 176,
        },
        treeVisible: false,
        scale: 1.75,
        catalogMouseBindings: expect.objectContaining({
          primaryClick: "selectOnly",
          doubleClick: "openSelected",
          middleClick: "toggleSearch",
          backButton: "navigateBack",
          forwardButton: "navigateForward",
        }),
        viewerQuadrantBindings: expect.objectContaining({
          topLeft: "zoomIn",
          topRight: "nextPage",
          bottomLeft: "previousPage",
          bottomRight: "nextPage",
        }),
        viewerRightClickAction: "zoomIn",
        mouseGestures: expect.objectContaining({
          middleClick: "toggleDirection",
          doubleClick: "toggleFullscreen",
        }),
      }),
      expect.any(Number),
    );
    expect(screen.getByLabelText("一覧表示形式"))
      .toHaveAttribute("data-catalog-view-mode", "reference_tile");
    expect(screen.getByRole("grid", { name: "現在のフォルダの項目" }))
      .toHaveStyle({ "--catalog-thumbnail-width": "176px" });
    expect(screen.queryByRole("complementary", { name: "フォルダツリー" })).not.toBeInTheDocument();
  }, 30_000);

  it("REQ-MVP-022 orders settings by task and removes retired duplicate controls", async () => {
    await registerTestLibrary([testEntry("book.cbz")]);
    listMock.mockClear();
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    expect(within(categories).getAllByRole("button").map((button) => button.textContent))
      .toEqual([
        expect.stringContaining("一覧"),
        expect.stringContaining("ビューワ"),
        expect.stringContaining("画面とテーマ"),
        expect.stringContaining("操作と入力"),
        expect.stringContaining("プロファイル"),
      ]);
    expect(within(dialog).queryByText("一覧配色")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("レイアウト")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText("profile隠し項目を表示"));
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ showHiddenFiles: true }),
      expect.any(Number),
    );
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(screen.getByRole("grid")).not.toHaveAttribute("data-catalog-palette");
  });

  it("REQ-LEY-P1-001, P1-002, and P1-005 connect keyboard settings, shell surfaces, and topmost atomically", async () => {
    const alwaysOnTopAdapter = { setAlwaysOnTop: vi.fn().mockResolvedValue(undefined) };
    await registerTestLibrary([], undefined, alwaysOnTopAdapter);
    expect(alwaysOnTopAdapter.setAlwaysOnTop).toHaveBeenCalledWith(false);

    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    fireEvent.click(within(categories).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profileアドレスバー"));
    fireEvent.click(within(dialog).getByLabelText("profileステータスバー"));
    fireEvent.click(within(dialog).getByLabelText("profile常に手前"));
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(alwaysOnTopAdapter.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
    expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        addressBarVisible: false,
        statusBarVisible: false,
        alwaysOnTop: true,
      }),
      expect.any(Number),
    );
    expect(screen.queryByLabelText("アドレス")).not.toBeInTheDocument();
    expect(document.querySelector(".status-bar")).not.toBeInTheDocument();
  });

  it("REQ-LEY-P1-002 keeps settings unchanged when native topmost apply fails", async () => {
    const alwaysOnTopAdapter = { setAlwaysOnTop: vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("window unavailable")) };
    await registerTestLibrary([], undefined, alwaysOnTopAdapter);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profile常に手前"));
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    expect(await within(dialog).findByText(/常に手前を切り替えられません/)).toBeInTheDocument();
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "統合設定" })).toBeInTheDocument();
  });

  it("REQ-FR-B24-001 and 006 keep theme selection as a draft and apply native before persistence", async () => {
    const calls: string[] = [];
    const windowThemeAdapter = {
      setTheme: vi.fn(async (theme) => {
        calls.push(`native:${theme ?? "system"}`);
      }),
    };
    saveSettingsProfileMock.mockImplementationOnce(async (profile) => {
      calls.push("persist");
      return {
        status: "ok",
        requestId: "save-theme-profile" as never,
        generation: 1 as never,
        data: { ...profile, themeFallbackReason: null },
      };
    });
    await registerTestLibrary([], undefined, undefined, windowThemeAdapter);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^画面/ }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "アプリテーマ" }), {
      target: { value: "builtin:dark" },
    });

    expect(document.documentElement).toHaveAttribute("data-theme-id", "system");
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(calls).toEqual(["native:system", "native:dark", "persist"]);
    expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        themeSelection: { kind: "builtin", themeId: "dark" },
        customThemeSnapshot: null,
      }),
      expect.any(Number),
    );
    expect(document.documentElement).toHaveAttribute("data-theme-id", "dark");
    expect(document.documentElement).toHaveAttribute("data-theme-scheme", "dark");
  });

  it("REQ-FR-B24-001 follows live system color-scheme changes only for system selection", async () => {
    const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
    let dark = false;
    const listeners = new Set<() => void>();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        get matches() { return dark; },
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
        addListener: (listener: () => void) => listeners.add(listener),
        removeListener: (listener: () => void) => listeners.delete(listener),
        dispatchEvent: () => true,
      })),
    });
    try {
      await registerTestLibrary([]);
      expect(document.documentElement).toHaveAttribute("data-theme-id", "system");
      expect(document.documentElement).toHaveAttribute("data-theme-scheme", "light");

      dark = true;
      act(() => listeners.forEach((listener) => listener()));
      await waitFor(() => expect(document.documentElement)
        .toHaveAttribute("data-theme-scheme", "dark"));
    } finally {
      if (originalMatchMediaDescriptor === undefined) Reflect.deleteProperty(window, "matchMedia");
      else Object.defineProperty(window, "matchMedia", originalMatchMediaDescriptor);
    }
    expect(Object.getOwnPropertyDescriptor(window, "matchMedia"))
      .toEqual(originalMatchMediaDescriptor);
  });

  it("REQ-FR-B24-006 rolls native theme back when profile persistence fails", async () => {
    const windowThemeAdapter = {
      setTheme: vi.fn().mockResolvedValue(undefined),
    };
    saveSettingsProfileMock.mockRejectedValueOnce(new Error("database unavailable"));
    await registerTestLibrary([], undefined, undefined, windowThemeAdapter);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^画面/ }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "アプリテーマ" }), {
      target: { value: "builtin:dark" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    expect(await within(dialog).findByText(/設定を保存できませんでした/)).toBeInTheDocument();
    expect(windowThemeAdapter.setTheme.mock.calls).toEqual([[null], ["dark"], [null]]);
    expect(document.documentElement).toHaveAttribute("data-theme-id", "system");
    expect(dialog).toBeInTheDocument();
  });

  it("REQ-FR-B24-006 reports a native theme rollback failure explicitly", async () => {
    const windowThemeAdapter = {
      setTheme: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("native rollback unavailable")),
    };
    saveSettingsProfileMock.mockRejectedValueOnce(new Error("database unavailable"));
    await registerTestLibrary([], undefined, undefined, windowThemeAdapter);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^画面/ }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "アプリテーマ" }), {
      target: { value: "builtin:dark" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    expect(await within(dialog).findByText(/ウィンドウ外観も元に戻せませんでした/))
      .toBeInTheDocument();
    expect(windowThemeAdapter.setTheme.mock.calls).toEqual([[null], ["dark"], [null]]);
    expect(document.documentElement).toHaveAttribute("data-theme-id", "system");
    expect(dialog).toBeInTheDocument();
  });

  it("FT-B19-006 searches categorized settings and resets the whole draft", async () => {
    await registerTestLibrary([]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });

    fireEvent.change(within(dialog).getByRole("searchbox", { name: "設定を検索" }), {
      target: { value: "次ページ" },
    });
    expect(within(dialog).getByRole("textbox", { name: "次ページショートカット" }))
      .toBeVisible();
    expect(within(dialog).getByLabelText("profile一覧形式")).not.toBeVisible();
    expect(within(dialog).getByText(/件の設定/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "設定検索をクリア" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profileフォルダツリー"));
    expect(within(dialog).getByLabelText("profileフォルダツリー")).not.toBeChecked();

    fireEvent.click(within(dialog).getByRole("button", { name: "すべて既定に戻す" }));
    expect(within(dialog).getByLabelText("profileフォルダツリー")).toBeChecked();
    expect(within(dialog).getByRole("status")).toHaveTextContent("適用するまで現在の設定は変わりません");
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(screen.getByRole("complementary", { name: "フォルダツリー" })).toBeInTheDocument();
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();
  });

  it("FT-B23-002 and FT-B23-004 persist viewer appearance settings and apply them to the viewer", async () => {
    const entry = testEntry("appearance.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(entry.relativePath));
    await registerTestLibrary([entry]);

    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^ビューワ/ }));
    fireEvent.change(within(dialog).getByLabelText("profileビューワ背景"), {
      target: { value: "black" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileページ周囲の余白（px）"), {
      target: { value: "24" },
    });
    fireEvent.change(within(dialog).getByLabelText("profile見開き間隔（px）"), {
      target: { value: "18" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileカーソル自動非表示"), {
      target: { value: "2000" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileVersion: SETTINGS_PROFILE_VERSION,
        viewerBackground: "black",
        viewerPageMargin: 24,
        viewerSpreadGap: 18,
        cursorAutoHideMs: 2_000,
      }),
      expect.any(Number),
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /^appearance\.cbz/ }), {
      key: "Enter",
    });
    await screen.findByLabelText("appearance.cbz ビューワ");
    const stage = document.querySelector<HTMLElement>(".viewer-stage");
    expect(stage).toHaveAttribute("data-background", "black");
    expect(stage?.style.getPropertyValue("--viewer-page-margin")).toBe("24px");
    expect(stage?.style.getPropertyValue("--viewer-spread-gap")).toBe("18px");
  });

  it("FT-B19-002 exports a safe profile and imports it only into the settings draft", async () => {
    const createDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:settings-profile"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    try {
      await registerTestLibrary([]);
      chooseAppMenuItem("オプション", "統合設定…");
      const dialog = screen.getByRole("dialog", { name: "統合設定" });
      fireEvent.click(within(dialog).getByRole("button", { name: /^プロファイル/ }));
      fireEvent.click(within(dialog).getByRole("button", { name: "profileを書き出す" }));
      expect(click).toHaveBeenCalledOnce();
      expect(within(dialog).getByText(/設定profileのダウンロードを開始しました/))
        .toBeInTheDocument();

      const importedProfile = {
        profileVersion: 1,
        ...DEFAULT_CATALOG_SETTINGS,
        catalogViewMode: "reference_tile",
        sortField: "size",
      };
      const file = { text: vi.fn(async () => JSON.stringify(importedProfile)) };
      fireEvent.change(within(dialog).getByLabelText("profileを読み込む"), {
        target: { files: [file] },
      });

      expect(await within(dialog).findByText(/設定profileを読み込みました/)).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: /^一覧表示/ }));
      expect(within(dialog).getByLabelText("profile一覧形式")).toHaveValue("reference_tile");
      expect(within(dialog).getByLabelText("profile並べ替え")).toHaveValue("size");
      expect(screen.getByLabelText("一覧表示形式"))
        .toHaveAttribute("data-catalog-view-mode", "cover_list");
      expect(saveSettingsProfileMock).not.toHaveBeenCalled();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    } finally {
      click.mockRestore();
      if (createDescriptor === undefined) delete (URL as { createObjectURL?: unknown }).createObjectURL;
      else Object.defineProperty(URL, "createObjectURL", createDescriptor);
      if (revokeDescriptor === undefined) delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
      else Object.defineProperty(URL, "revokeObjectURL", revokeDescriptor);
    }
  });

  it("leaves active settings unchanged when atomic persistence fails", async () => {
    saveSettingsProfileMock.mockResolvedValueOnce({
      status: "error",
      requestId: "save-profile-error" as never,
      generation: 1 as never,
      error: {
        code: "ACCESS_DENIED",
        message: "database unavailable",
        retryable: true,
      },
    });
    await registerTestLibrary([]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.change(within(dialog).getByLabelText("profile一覧形式"), {
      target: { value: "reference_tile" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    expect(await within(dialog).findByText(/アクセスできません/)).toBeInTheDocument();
    expect(screen.getByLabelText("一覧表示形式"))
      .toHaveAttribute("data-catalog-view-mode", "cover_list");
    expect(screen.getByRole("dialog", { name: "統合設定" })).toBeInTheDocument();
  });

  it("FT-B18-004 calls native tray storage without replacing the React shell and keeps Quit separate", async () => {
    await registerTestLibrary([]);
    const fileMenu = openAppMenu("ファイル");
    const trayButton = within(fileMenu).getByRole("menuitem", {
      name: "タスクトレイへ収納",
    });
    await waitFor(() => expect(trayButton).toHaveAttribute("aria-disabled", "false"));
    fireEvent.click(trayButton);
    await waitFor(() => expect(storeMainWindowInTrayMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("main")).toHaveClass("app-shell");
    expect(screen.queryByLabelText("タスクトレイ収納")).not.toBeInTheDocument();

    chooseAppMenuItem("ファイル", /終了/);
    expect(quitApplicationMock).toHaveBeenCalledTimes(1);
  });

  it("REQ-LEY-P2-012 persists tray minimize, close, and restore behavior atomically", async () => {
    await registerTestLibrary([]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    fireEvent.click(within(categories).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profile最小化時にタスクトレイへ格納"));
    fireEvent.change(within(dialog).getByLabelText("profile閉じる操作"), {
      target: { value: "store" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileタスクトレイ復帰操作"), {
      target: { value: "doubleClick" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileVersion: SETTINGS_PROFILE_VERSION,
        trayStoreOnMinimize: true,
        trayCloseBehavior: "store",
        trayRestoreGesture: "doubleClick",
      }),
      expect.any(Number),
    ));
  });

  it("REQ-LEY-P2-013 persists slideshow interval, order, and repeat atomically", async () => {
    await registerTestLibrary([]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    fireEvent.click(within(categories).getByRole("button", { name: /^ビューワ/ }));
    fireEvent.change(within(dialog).getByLabelText("profileスライドショー間隔（秒）"), {
      target: { value: "7.5" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileスライドショー順序"), {
      target: { value: "random" },
    });
    fireEvent.click(within(dialog).getByLabelText("profile現在の作品を繰り返す"));
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileVersion: SETTINGS_PROFILE_VERSION,
        slideshowIntervalMs: 7_500,
        slideshowOrder: "random",
        slideshowRepeatCurrentItem: true,
      }),
      expect.any(Number),
    ));
  });

  it("REQ-LEY-P2-015 persists Viewer catalog selection synchronization atomically", async () => {
    await registerTestLibrary([]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    fireEvent.click(within(categories).getByRole("button", { name: /^ビューワ/ }));
    fireEvent.click(within(dialog).getByLabelText("profile Viewerと一覧の選択を同期"));
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileVersion: SETTINGS_PROFILE_VERSION,
        viewerCatalogSelectionSync: false,
      }),
      expect.any(Number),
    ));
  });

  it("FT-B19-004 exposes offline general help from the Help menu", async () => {
    await registerTestLibrary([]);
    chooseAppMenuItem("ヘルプ", "一般ヘルプ…");

    const help = screen.getByRole("dialog", { name: "Comic Explorer ヘルプ" });
    expect(within(help).getByRole("article", { name: "はじめに" })).toHaveTextContent(
      "Enterキーを押すか、項目をダブルクリックして開きます",
    );
    fireEvent.click(within(help).getByRole("button", { name: /フォルダーと作品一覧/ }));
    expect(within(help).getByRole("article", { name: "フォルダーと作品一覧" }))
      .toHaveTextContent("アドレスの編集中にEscキーを押す");
    expect(within(help).queryByText(new RegExp(`バージョン ${APP_VERSION}`))).not.toBeInTheDocument();
  });

  it("REQ-LEY-P1-013 restores recent files across startup and opens them from the File menu", async () => {
    historyMock.mockResolvedValue(historyResponse([{
      itemIdentity: "Books/volume.cbz" as never,
      lastViewedAtMs: 1_700_000_000_000,
    }]));
    openMock.mockResolvedValue(viewerResponse("Books/volume.cbz"));
    await registerTestLibrary([]);

    const fileMenu = openAppMenu("ファイル");
    const recent = await within(fileMenu).findByRole("menuitem", { name: "volume.cbz" });
    fireEvent.click(recent);

    await waitFor(() => expect(openMock).toHaveBeenCalledWith(
      "Books/volume.cbz",
      expect.any(Number),
    ));
  });

  it("REQ-LEY-P1-021 reopens the latest successful item only when startup restore is enabled", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "settings-restore-viewer" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS, restoreLastViewer: true },
    });
    historyMock.mockResolvedValue(historyResponse([{
      itemIdentity: "Books/latest.cbz" as never,
      lastViewedAtMs: 1_700_000_000_000,
    }]));
    openMock.mockResolvedValue(viewerResponse("Books/latest.cbz"));

    restoreMock.mockResolvedValue({
      status: "ok", requestId: "restore" as never, generation: 1 as never,
      data: { absolutePath: "C:\\" },
    });
    registerMock.mockResolvedValue({
      status: "ok", requestId: "register" as never, generation: 1 as never,
      data: { absolutePath: "C:\\" },
    });
    listMock.mockResolvedValue({
      status: "ok", requestId: "list" as never, generation: 2 as never, data: [],
    });
    thumbnailMock.mockResolvedValue({
      status: "error", requestId: "thumbnail" as never, generation: 1 as never,
      error: { code: "NOT_FOUND", message: "missing", retryable: true },
    });
    render(<App />);

    await waitFor(() => expect(openMock).toHaveBeenCalledWith(
      "Books/latest.cbz",
      expect.any(Number),
    ));
    expect(await screen.findByLabelText("Books/latest.cbz ビューワ")).toBeInTheDocument();
  });

  it("REQ-LEY-P1-013 clears persistent reading history through the history dialog", async () => {
    historyMock.mockResolvedValue(historyResponse([{
      itemIdentity: "Books/volume.cbz" as never,
      lastViewedAtMs: 1_700_000_000_000,
    }]));
    await registerTestLibrary([]);

    chooseAppMenuItem("オプション", "閲覧履歴");
    const dialog = await screen.findByRole("dialog", { name: "閲覧履歴" });
    expect(within(dialog).getByText("Books/volume.cbz")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "履歴を消去" }));

    await waitFor(() => expect(clearHistoryMock).toHaveBeenCalledOnce());
    expect(within(dialog).queryByText("Books/volume.cbz")).not.toBeInTheDocument();
  });

  it("FT-B19-005 exposes version information and an offline license notice separately from help", async () => {
    await registerTestLibrary([]);
    const helpMenu = openAppMenu("ヘルプ");
    expect(within(helpMenu).getByRole("menuitem", { name: "一般ヘルプ…" })).toBeInTheDocument();
    fireEvent.click(within(helpMenu).getByRole("menuitem", { name: "バージョン情報…" }));

    const version = await screen.findByRole("dialog", { name: "バージョン情報" });
    expect(version).toHaveClass("version-dialog");
    expect(version).not.toHaveClass("help-dialog");
    await waitFor(() => expect(within(version).getByText(
      `バージョン ${APP_VERSION} / runtime: Tauri WebView2`,
    )).toBeInTheDocument());
    fireEvent.click(within(version).getByRole("button", { name: "third-party license noticeを開く" }));
    const notice = screen.getByRole("dialog", { name: "third-party license notice" });
    expect(notice.querySelector("pre")?.textContent.length).toBeGreaterThan(100);
  });

});
