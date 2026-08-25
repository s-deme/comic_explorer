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
import type { AlwaysOnTopAdapter } from "./features/workspace/window";
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
  layoutMode: "paged",
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
  wheelScrollFactor: 1,
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
  navigationSelectionPolicy: "restore",
  thumbnailGenerationScope: "near",
  startupLocation: "last",
  showHiddenFiles: false,
  catalogPalette: "system",
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

function testEntry(relativePath: string): CatalogEntry {
  return {
    relativePath: relativePath as never,
    kind: "archive",
    archiveKind: "cbz",
  };
}

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
  render(<App fullscreenAdapter={fullscreenAdapter} alwaysOnTopAdapter={alwaysOnTopAdapter} />);
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

describe("application shell", () => {
  afterEach(cleanup);

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

  it("announces app-data recovery without exposing the isolated database", async () => {
    recoveryNoticeMock.mockResolvedValue({
      status: "ok",
      requestId: "recovery" as never,
      generation: 1 as never,
      data: true,
    });

    render(<App />);

    const notice = await screen.findByText(
      "アプリデータを再初期化しました。漫画ファイルは変更していません。",
    );
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).not.toHaveTextContent("recovery");
  });

  it("starts in the Explorer shell without a library-root registration form", async () => {
    render(<App />);

    expect(screen.queryByLabelText("ライブラリルート")).not.toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "PC" })).toBeInTheDocument();
    expect(screen.getByText("現在のフォルダー")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ツリーをすべて閉じる" }))
      .toBeInTheDocument();
    expect(await screen.findByRole("treeitem", { name: /ローカル ディスク \(C:\)/ }))
      .toBeInTheDocument();
  });

  it("REQ-LEY-P4-001 opens only the configured startup shelf without opening its target", async () => {
    listShelvesMock.mockResolvedValue({
      status: "ok",
      requestId: "startup-shelf" as never,
      generation: 1 as never,
      data: {
        shelves: [{ id: 7, name: "毎日読む", icon: "books", sortOrder: 0 }],
        nodes: [],
        startupShelfId: 7,
      },
    });

    render(<App />);

    expect(await screen.findByRole("dialog", { name: "本棚" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /毎日読む$/ })).toHaveAttribute("aria-pressed", "true");
    expect(registerMock).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
  });

  it("REQ-LEY-P4-002 opens a Rust-issued archive page key from the read-only tree browser", async () => {
    treeMock.mockResolvedValue({
      status: "ok",
      requestId: "tree-archive" as never,
      generation: 1 as never,
      data: [{ relativePath: "book.cbz" as never, hasChildren: true, entryKind: "archive" }],
    });
    listArchiveVirtualTreeMock.mockResolvedValue({
      status: "ok",
      requestId: "archive-tree" as never,
      generation: 1 as never,
      data: {
        archiveRelativePath: "book.cbz" as never,
        entries: [{
          id: "page-2",
          parentId: null,
          name: "2.png",
          kind: "image",
          hasChildren: false,
          pageKey: "page-2.png" as never,
          sortOrder: 0,
        }],
      },
    });
    openMock.mockResolvedValue({
      status: "ok",
      requestId: "open-archive-page" as never,
      generation: 1 as never,
      data: {
        itemKey: "book.cbz",
        displayName: "book.cbz",
        pages: [
          { id: "page-1" as never, relativePath: "page-1.png" as never, mediaUri: "data:image/png;base64,one" },
          { id: "page-2" as never, relativePath: "page-2.png" as never, mediaUri: "data:image/png;base64,two" },
        ],
        startIndex: 0,
      },
    });
    await registerTestLibrary([testEntry("book.cbz")]);

    fireEvent.click(await screen.findByRole("treeitem", { name: "book.cbz" }));
    const pane = await screen.findByRole("region", { name: "書庫の内容" });
    expect(screen.queryByRole("dialog", { name: "書庫エクスプローラー" })).not.toBeInTheDocument();
    const archivePage = await within(pane).findByRole("button", { name: /2\.png/ });
    fireEvent.click(archivePage);
    expect(screen.queryByText("2 / 2")).not.toBeInTheDocument();
    fireEvent.doubleClick(archivePage);

    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "書庫の内容" })).not.toBeInTheDocument();
    expect(openMock).toHaveBeenCalledWith("book.cbz", expect.any(Number));
  });

  it("REQ-LEY-P3-021 applies a Rust-validated startup file plan without archive auto-fullscreen", async () => {
    takeCliLaunchRequestMock
      .mockResolvedValueOnce({
        status: "ok",
        requestId: "cli-startup" as never,
        generation: 1 as never,
        data: {
          plan: {
            libraryRoot: "C:\\CLI Comics",
            itemRelativePath: "volume.cbz",
            itemKind: "archive",
            mode: "normal",
          },
          error: null,
        },
      })
      .mockResolvedValue({
        status: "ok", requestId: "cli-empty" as never, generation: 2 as never, data: null,
      });
    registerMock.mockResolvedValue({
      status: "ok", requestId: "cli-root" as never, generation: 1 as never,
      data: { absolutePath: "C:\\CLI Comics" },
    });
    listMock.mockResolvedValue({
      status: "ok", requestId: "cli-list" as never, generation: 1 as never,
      data: [],
    });
    openMock.mockResolvedValue(viewerResponse("volume.cbz"));

    render(<App />);

    const viewer = await screen.findByLabelText("volume.cbz ビューワ");
    expect(viewer).toHaveAttribute("data-fullscreen", "false");
    expect(registerMock).toHaveBeenCalledWith("C:\\CLI Comics", expect.any(Number));
    expect(openMock).toHaveBeenCalledWith("volume.cbz", expect.any(Number));
  });

  it("REQ-LEY-P3-021 drains a later single-instance slideshow request through existing viewer flow", async () => {
    render(<App />);
    await waitFor(() => expect(cliLaunchHarness.handler).toBeTypeOf("function"));
    takeCliLaunchRequestMock
      .mockResolvedValueOnce({
        status: "ok",
        requestId: "cli-secondary" as never,
        generation: 2 as never,
        data: {
          plan: {
            libraryRoot: "D:\\Series",
            itemRelativePath: "next.cbz",
            itemKind: "archive",
            mode: "slideshow",
          },
          error: null,
        },
      })
      .mockResolvedValue({
        status: "ok", requestId: "cli-empty" as never, generation: 3 as never, data: null,
      });
    registerMock.mockResolvedValue({
      status: "ok", requestId: "cli-root" as never, generation: 2 as never,
      data: { absolutePath: "D:\\Series" },
    });
    listMock.mockResolvedValue({
      status: "ok", requestId: "cli-list" as never, generation: 2 as never,
      data: [],
    });
    const session = testSession("next.cbz");
    session.pages.push({
      id: "next-page-2" as never,
      relativePath: "page-2.png" as never,
      mediaUri: "data:image/png;base64,fixture2",
    });
    openMock.mockResolvedValue({
      status: "ok", requestId: "cli-open" as never, generation: 2 as never, data: session,
    });

    cliLaunchHarness.handler?.();

    const viewer = await screen.findByLabelText("next.cbz ビューワ");
    await waitFor(() => expect(viewer).toHaveAttribute("data-slideshow", "true"));
    expect(registerMock).toHaveBeenCalledWith("D:\\Series", expect.any(Number));
  });

  it("keeps drive tree, address and catalog synchronized after sidebar selection", async () => {
    registerMock.mockResolvedValue({
      status: "ok",
      requestId: "request-1" as never,
      generation: 1 as never,
      data: { absolutePath: "C:\\" },
    });
    listMock.mockResolvedValue({
      status: "ok",
      requestId: "request-2" as never,
      generation: 2 as never,
      data: [],
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("treeitem", { name: /ローカル ディスク \(C:\)/ }));

    await waitFor(() =>
      expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\"),
    );
    expect(
      screen.getByRole("complementary", { name: "フォルダツリー" }),
    ).toHaveTextContent("ローカル ディスク (C:)");
    expect(
      screen.getByRole("grid", { name: "現在のフォルダの項目" }),
    ).toBeInTheDocument();
  });

  it("opens the folder returned by the Windows folder picker without a root form", async () => {
    registerMock.mockResolvedValue({
      status: "ok",
      requestId: "register-drive" as never,
      generation: 2 as never,
      data: { absolutePath: "C:\\" },
    });
    pickerMock.mockResolvedValue({
      status: "ok",
      requestId: "picker" as never,
      generation: 1 as never,
      data: { absolutePath: "C:\\Selected Comics" },
    });
    listMock.mockResolvedValue({
      status: "ok",
      requestId: "list" as never,
      generation: 2 as never,
      data: [],
    });
    render(<App />);

    chooseAppMenuItem("ファイル", "フォルダーを開く…");

    await waitFor(() =>
      expect(screen.getByLabelText("アドレス")).toHaveValue(
        "C:\\Selected Comics",
      ),
    );
    expect(registerMock).toHaveBeenCalledWith("C:\\", expect.any(Number));
  });

  it("REQ-LEY-P1-016 navigates to Windows known folders through the normal drive boundary", async () => {
    knownFoldersMock.mockResolvedValue({
      status: "ok",
      requestId: "known-folders" as never,
      generation: 1 as never,
      data: [{
        id: "desktop",
        name: "デスクトップ",
        absolutePath: "C:\\Users\\Test\\Desktop",
      }],
    });
    await registerTestLibrary([]);
    listMock.mockClear();

    chooseAppMenuItem("ファイル", "デスクトップへ移動");

    await waitFor(() => expect(listMock).toHaveBeenCalledWith(
      "Users/Test/Desktop",
      expect.any(Number),
    ));
    expect(registerMock).toHaveBeenLastCalledWith("C:\\", expect.any(Number));
    await waitFor(() => expect(screen.getByLabelText("アドレス"))
      .toHaveValue("C:\\Users\\Test\\Desktop"));
  });

  it("REQ-LEY-P1-012 opens a supported file returned by the native picker", async () => {
    await registerTestLibrary([]);
    filePickerMock.mockResolvedValue({
      status: "ok",
      requestId: "file-picker" as never,
      generation: 2 as never,
      data: { absolutePath: "C:\\Picked\\volume.cbz" },
    });
    openMock.mockResolvedValue(viewerResponse("Picked/volume.cbz"));

    chooseAppMenuItem("ファイル", "ファイルを開く…");

    await waitFor(() => expect(openMock).toHaveBeenCalledWith(
      "Picked/volume.cbz",
      expect.any(Number),
    ));
    expect(registerMock).toHaveBeenLastCalledWith("C:\\", expect.any(Number));
  });

  it("REQ-LEY-P1-010 applies the configured initial-selection policy after navigation", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "settings-selection" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS, navigationSelectionPolicy: "last" },
    });
    await registerTestLibrary([testEntry("a.cbz"), testEntry("z.cbz")]);

    expect(screen.getByRole("gridcell", { name: /z\.cbz/ }))
      .toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("gridcell", { name: /a\.cbz/ }))
      .toHaveAttribute("aria-selected", "false");
  });

  it("REQ-LEY-P1-011 limits automatic thumbnail work to the visible window", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "settings-thumbnails" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS, thumbnailGenerationScope: "visible" },
    });
    await registerTestLibrary(Array.from({ length: 50 }, (_, index) =>
      testEntry(`volume-${String(index).padStart(2, "0")}.cbz`)));

    await waitFor(() => expect(thumbnailMock).toHaveBeenCalledTimes(25));
  });

  it("REQ-LEY-P1-014 starts at the drive root when that startup policy is stored", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "settings-startup" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS, startupLocation: "driveRoot" },
    });
    restoreMock.mockResolvedValue({
      status: "ok",
      requestId: "restore-startup" as never,
      generation: 1 as never,
      data: { absolutePath: "C:\\Books\\Series" },
    });
    registerMock.mockResolvedValue({
      status: "ok",
      requestId: "register-startup" as never,
      generation: 1 as never,
      data: { absolutePath: "C:\\" },
    });
    listMock.mockResolvedValue({
      status: "ok",
      requestId: "list-startup" as never,
      generation: 2 as never,
      data: [],
    });

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\"));
    expect(listMock).toHaveBeenCalledWith("", expect.any(Number));
  });

  it("renders a sanitized, recoverable folder error without removing navigation", async () => {
    registerMock.mockResolvedValue({
      status: "ok",
      requestId: "request-1" as never,
      generation: 1 as never,
      data: { absolutePath: "C:\\" },
    });
    listMock.mockResolvedValue({
      status: "error",
      requestId: "request-2" as never,
      generation: 2 as never,
      error: {
        code: "ACCESS_DENIED",
        message: "secret stack at C:\\internal\\source.rs:42",
        target: "problem" as never,
        retryable: true,
      },
    });
    restoreMock.mockResolvedValue({
      status: "ok", requestId: "restore-root" as never, generation: 1 as never,
      data: { absolutePath: "C:\\Comics" },
    });
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "アクセスできません。権限または他のアプリによる使用状況を確認してください。",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("対象: C:\\Comics");
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret stack");
    expect(screen.getByTitle("戻る")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "別のフォルダーを開く" }),
    ).toBeInTheDocument();
  });

  it("resizes the tree by keyboard and restores help focus", async () => {
    await registerTestLibrary([]);

    const splitter = await screen.findByRole("separator", {
      name: "フォルダツリーの幅",
    });
    expect(splitter).toHaveAttribute("aria-valuenow", "240");
    fireEvent.keyDown(splitter, { key: "ArrowLeft" });
    expect(splitter).toHaveAttribute("aria-valuenow", "230");
    for (let index = 0; index < 20; index += 1) {
      fireEvent.keyDown(splitter, { key: "ArrowLeft" });
    }
    expect(splitter).toHaveAttribute("aria-valuenow", "180");
    Object.defineProperty(splitter, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(splitter, "hasPointerCapture", { value: () => true });
    fireEvent.pointerDown(splitter, { pointerId: 1 });
    fireEvent.pointerMove(splitter, { pointerId: 1, clientX: 999 });
    expect(splitter).toHaveAttribute("aria-valuenow", "480");

    const trigger = screen.getByRole("menuitem", { name: "ヘルプ" });
    chooseAppMenuItem("ヘルプ", "一般ヘルプ…");
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("REQ-LEY-P4-004 applies a Rust-backed bottom catalog layout without resetting catalog state", async () => {
    await registerTestLibrary([testEntry("book.cbz")]);
    const item = screen.getByRole("button", { name: /^book\.cbz/ });
    fireEvent.click(item);

    const workspace = document.querySelector<HTMLElement>(".workspace")!;
    expect(workspace).toHaveAttribute("data-catalog-pane-position", "right");
    expect(workspace.style.gridTemplateAreas).toContain("navigation separator catalog");

    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^画面/ }));
    fireEvent.change(within(dialog).getByLabelText("profile一覧ペインの位置"), {
      target: { value: "bottom" },
    });
    fireEvent.change(within(dialog).getByLabelText("profilenavigationペインの高さ"), {
      target: { value: "300" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(workspace).toHaveAttribute("data-catalog-pane-position", "bottom"));
    expect(workspace.style.gridTemplateAreas).toContain("navigation");
    expect(workspace.style.gridTemplateRows).toBe("300px 6px minmax(0, 1fr)");
    expect(screen.getByRole("gridcell", { name: /book\.cbz/ }))
      .toHaveAttribute("aria-selected", "true");
    const splitter = screen.getByRole("separator", { name: "フォルダツリーの高さ" });
    expect(splitter).toHaveAttribute("aria-orientation", "horizontal");
    expect(splitter).toHaveAttribute("aria-valuenow", "300");
    fireEvent.keyDown(splitter, { key: "ArrowDown" });
    expect(splitter).toHaveAttribute("aria-valuenow", "310");
    expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ catalogPanePosition: "bottom", treeHeight: 300 }),
      expect.any(Number),
    );
  });

  it("FT-B17-001 opens the required five top-level menus and runs File exactly once", async () => {
    await registerTestLibrary([]);

    const menubar = screen.getByRole("menubar", { name: "メニューバー" });
    expect(
      within(menubar).getAllByRole("menuitem").map((item) => item.getAttribute("aria-label")),
    ).toEqual(["ファイル", "編集", "表示", "オプション", "ヘルプ"]);
    const fileTrigger = within(menubar).getByRole("menuitem", { name: "ファイル" });
    expect(fileTrigger).toHaveAttribute("aria-keyshortcuts", "Alt+F");

    fireEvent.keyDown(fileTrigger, { key: "Enter" });
    expect(fileTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\");

    const openFolder = within(screen.getByRole("menu", { name: "ファイル" }))
      .getByRole("menuitem", { name: "フォルダーを開く…" });
    fireEvent.keyDown(openFolder, { key: "Enter" });
    expect(pickerMock).toHaveBeenCalledTimes(1);
  });

  it("moves navigation history from the toolbar into the File menu and supports history jumps", async () => {
    await registerTestLibrary([]);

    expect(screen.queryByLabelText("履歴ドロップダウン")).not.toBeInTheDocument();
    let fileMenu = openAppMenu("ファイル");
    expect(within(fileMenu).getByText("履歴")).toBeInTheDocument();
    expect(within(fileMenu).getByText("移動履歴はありません")).toBeInTheDocument();
    fireEvent.keyDown(
      within(fileMenu).getByRole("menuitem", { name: "フォルダーを開く…" }),
      { key: "Escape" },
    );

    fireEvent.change(screen.getByLabelText("アドレス"), {
      target: { value: '"C:\\Comics\\Series"' },
    });
    fireEvent.submit(screen.getByLabelText("アドレス").closest("form")!);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("アドレス"), {
      target: { value: "C:\\Comics\\Series\\Volume" },
    });
    fireEvent.submit(screen.getByLabelText("アドレス").closest("form")!);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(3));

    fileMenu = openAppMenu("ファイル");
    expect(within(fileMenu).getByRole("menuitem", { name: "戻る: Comics/Series" }))
      .toBeInTheDocument();
    fireEvent.click(
      within(fileMenu).getByRole("menuitem", { name: "戻る: ライブラリ" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\"),
    );

    fileMenu = openAppMenu("ファイル");
    fireEvent.click(
      within(fileMenu).getByRole("menuitem", { name: "進む: Comics/Series/Volume" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("アドレス"))
        .toHaveValue("C:\\Comics\\Series\\Volume"),
    );
  });

  it("starts a child catalog at the top and restores the parent catalog scroll", async () => {
    const folder: CatalogEntry = {
      relativePath: "0-series" as never,
      kind: "folder",
    };
    const rootEntries = [folder, ...Array.from({ length: 60 }, (_, index) =>
      testEntry(`book-${index}.cbz`))];
    const childEntries = Array.from({ length: 20 }, (_, index) =>
      testEntry(`0-series/volume-${index}.cbz`));
    await registerTestLibrary(rootEntries);
    listMock.mockImplementation(async (path) => ({
      status: "ok",
      requestId: `list-${path || "root"}` as never,
      generation: 2 as never,
      data: path === "0-series" ? childEntries : rootEntries,
    }));

    const grid = screen.getByRole("grid", { name: "現在のフォルダの項目" });
    grid.scrollTop = 480;
    fireEvent.doubleClick(within(grid).getByRole("button", { name: /^0-series、フォルダ/ }));

    await waitFor(() =>
      expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\0-series"),
    );
    expect(grid).toHaveProperty("scrollTop", 0);
    grid.scrollTop = 160;

    fireEvent.click(screen.getByRole("button", { name: "上のフォルダへ" }));
    await waitFor(() =>
      expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\"),
    );
    expect(grid).toHaveProperty("scrollTop", 480);
  });

  it("REQ-LEY-P3-007 honors none and discards stale or failed activation results", async () => {
    await registerTestLibrary([testEntry("book.cbz")]);
    const item = screen.getByRole("button", { name: /book\.cbz/ });

    resolveCatalogActivationMock.mockResolvedValueOnce({
      status: "ok", requestId: "none" as never, generation: 1 as never, data: "none",
    });
    fireEvent.doubleClick(item);
    await waitFor(() => expect(resolveCatalogActivationMock).toHaveBeenCalledTimes(1));
    expect(openMock).not.toHaveBeenCalled();

    let releaseStale!: (value: Awaited<ReturnType<typeof resolveCatalogActivation>>) => void;
    resolveCatalogActivationMock.mockImplementationOnce(() => new Promise((resolve) => {
      releaseStale = resolve;
    }));
    resolveCatalogActivationMock.mockResolvedValueOnce({
      status: "ok", requestId: "latest" as never, generation: 3 as never, data: "none",
    });
    fireEvent.doubleClick(item);
    fireEvent.keyDown(item, { key: "Enter" });
    await waitFor(() => expect(resolveCatalogActivationMock).toHaveBeenCalledTimes(3));
    releaseStale({
      status: "ok", requestId: "stale" as never, generation: 2 as never, data: "read",
    });
    await act(async () => undefined);
    expect(openMock).not.toHaveBeenCalled();

    resolveCatalogActivationMock.mockResolvedValueOnce({
      status: "error",
      requestId: "failed" as never,
      generation: 4 as never,
      error: { code: "INVALID_REQUEST", message: "open rule failed", retryable: false },
    });
    fireEvent.doubleClick(screen.getByRole("button", { name: /book\.cbz/ }));
    expect(await screen.findByText(/対応していません/)).toBeInTheDocument();
    expect(openMock).not.toHaveBeenCalled();
  });

  it("REQ-LEY-P3-013 routes configured catalog mouse actions through existing handlers", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "settings-mouse" as never,
      generation: 1 as never,
      data: {
        ...DEFAULT_CATALOG_SETTINGS,
        catalogMouseBindings: {
          primaryClick: "toggleSearch",
          doubleClick: "openSelected",
          middleClick: "refreshCatalog",
          backButton: "navigateBack",
          forwardButton: "navigateForward",
        },
      },
    });
    openMock.mockResolvedValue(viewerResponse("book.cbz"));
    await registerTestLibrary([testEntry("book.cbz")]);
    await waitFor(() => expect(settingsMock).toHaveBeenCalled());
    let item = screen.getByRole("button", { name: /book\.cbz/ });

    fireEvent.click(item, { detail: 1 });
    expect(await screen.findByRole("complementary", { name: "検索ペイン" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "検索ペインを閉じる" })[0]);

    const refreshBaseline = listMock.mock.calls.length;
    fireEvent(item, new MouseEvent("auxclick", {
      bubbles: true, cancelable: true, button: 1,
    }));
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(refreshBaseline + 1));

    fireEvent.change(screen.getByLabelText("アドレス"), { target: { value: "C:\\Series" } });
    fireEvent.submit(screen.getByLabelText("アドレス").closest("form")!);
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Series"));
    item = screen.getByRole("button", { name: /book\.cbz/ });
    fireEvent(item, new MouseEvent("auxclick", {
      bubbles: true, cancelable: true, button: 3,
    }));
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\"));
    item = screen.getByRole("button", { name: /book\.cbz/ });
    fireEvent(item, new MouseEvent("auxclick", {
      bubbles: true, cancelable: true, button: 4,
    }));
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Series"));

    item = screen.getByRole("button", { name: /book\.cbz/ });
    fireEvent.doubleClick(item);
    await waitFor(() => expect(resolveCatalogActivationMock).toHaveBeenLastCalledWith(
      "archive", "doubleClick", expect.any(Number),
    ));
    expect(await screen.findByLabelText("book.cbz ビューワ")).toBeInTheDocument();
  });

  it("REQ-LEY-P3-014 and P3-015 apply Rust-restored Viewer click bindings", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "settings-quadrants" as never,
      generation: 1 as never,
      data: {
        ...DEFAULT_CATALOG_SETTINGS,
        viewerQuadrantBindings: {
          topLeft: "zoomIn",
          topRight: "nextPage",
          bottomLeft: "previousPage",
          bottomRight: "nextPage",
        },
        viewerRightClickAction: "zoomIn",
      },
    });
    openMock.mockResolvedValue(viewerResponse("book.cbz"));
    await registerTestLibrary([testEntry("book.cbz")]);
    await waitFor(() => expect(settingsMock).toHaveBeenCalled());
    fireEvent.doubleClick(screen.getByRole("button", { name: /book\.cbz/ }));
    expect(await screen.findByLabelText("book.cbz ビューワ")).toBeInTheDocument();

    const stage = document.querySelector<HTMLElement>(".viewer-stage")!;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 100, height: 100,
      right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    });
    fireEvent.pointerDown(stage, {
      pointerId: 1, pointerType: "mouse", button: 0, clientX: 25, clientY: 25,
    });
    fireEvent.pointerUp(stage, {
      pointerId: 1, pointerType: "mouse", button: 0, clientX: 25, clientY: 25,
    });
    await waitFor(() => expect(document.querySelector(".page-spread"))
      .toHaveAttribute("data-scale", "1.1"));
    fireEvent.pointerDown(stage, {
      pointerId: 2, pointerType: "mouse", button: 2, clientX: 50, clientY: 50,
    });
    fireEvent.pointerUp(stage, {
      pointerId: 2, pointerType: "mouse", button: 2, clientX: 50, clientY: 50,
    });
    await waitFor(() => expect(document.querySelector(".page-spread"))
      .toHaveAttribute("data-scale", "1.2"));
  });

  it("keeps exactly one top-level menu trigger in the roving tab stop", async () => {
    await registerTestLibrary([]);

    const menubar = screen.getByRole("menubar", { name: "メニューバー" });
    const triggers = within(menubar).getAllByRole("menuitem");
    expect(triggers.map((trigger) => trigger.tabIndex)).toEqual([0, -1, -1, -1, -1]);

    const viewTrigger = within(menubar).getByRole("menuitem", { name: "表示" });
    fireEvent.focus(viewTrigger);
    await waitFor(() =>
      expect(triggers.map((trigger) => trigger.tabIndex)).toEqual([-1, -1, 0, -1, -1]),
    );

    fireEvent.keyDown(viewTrigger, { key: "ArrowRight" });
    const optionsTrigger = within(menubar).getByRole("menuitem", {
      name: "オプション",
    });
    await waitFor(() => {
      expect(optionsTrigger).toHaveFocus();
      expect(triggers.map((trigger) => trigger.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
    });

    fireEvent.keyDown(optionsTrigger, { key: "ArrowLeft" });
    await waitFor(() => {
      expect(viewTrigger).toHaveFocus();
      expect(triggers.map((trigger) => trigger.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
    });
  });

  it("leaves Viewer Alt handling to the Viewer without catalog or hidden menu actions", async () => {
    const entry = testEntry("Series/two-pages.cbz");
    openMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "open-two-pages" as never,
      generation: 1 as never,
      data: {
        itemKey: entry.relativePath,
        displayName: entry.relativePath,
        pages: [
          {
            id: "page-1" as never,
            relativePath: "1.png" as never,
            mediaUri: "data:image/png;base64,one",
          },
          {
            id: "page-2" as never,
            relativePath: "2.png" as never,
            mediaUri: "data:image/png;base64,two",
          },
        ],
        startIndex: 0,
      },
    });
    await registerTestLibrary([entry]);
    fireEvent.change(screen.getByLabelText("アドレス"), {
      target: { value: "C:\\Comics\\Series" },
    });
    fireEvent.submit(screen.getByLabelText("アドレス").closest("form")!);
    await waitFor(() =>
      expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics\\Series"),
    );
    await openTestComic(entry.relativePath);
    const catalogLoadsBeforeAlt = listMock.mock.calls.length;
    markViewerPrefetchReady();

    fireEvent.keyDown(window, { key: "f", altKey: true });
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });

    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledTimes(catalogLoadsBeforeAlt);
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    expect(await screen.findByLabelText("アドレス")).toHaveValue("C:\\Comics\\Series");
    expect(screen.queryByRole("menu", { name: "ファイル" })).not.toBeInTheDocument();
  });

  it("REQ-LEY-P2-015 synchronizes an image-folder page to catalog selection on return", async () => {
    const first: CatalogEntry = { relativePath: "01.png" as never, kind: "page" };
    const second: CatalogEntry = { relativePath: "02.png" as never, kind: "page" };
    openMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "open-image-folder" as never,
      generation: 1 as never,
      data: {
        itemKey: "",
        displayName: first.relativePath,
        pages: [first, second].map((entry, index) => ({
          id: `folder-page-${index}` as never,
          relativePath: entry.relativePath,
          mediaUri: `data:image/png;base64,page-${index}`,
        })),
        startIndex: 0,
      },
    });
    await registerTestLibrary([first, second]);
    await openTestComic(first.relativePath);
    markViewerPrefetchReady();

    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);
    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));

    const grid = await screen.findByRole("grid", { name: "現在のフォルダの項目" });
    await waitFor(() => {
      const secondButton = within(grid).getAllByRole("button")
        .find((button) => button.getAttribute("data-relative-path") === second.relativePath);
      expect(secondButton).toHaveAttribute("data-selected", "true");
    }, { timeout: 5_000 });
    expect(screen.getByText("現在位置: 2/2")).toBeInTheDocument();
  });

  it("REQ-LEY-P2-015 preserves the pre-view selection when synchronization is disabled", async () => {
    const first: CatalogEntry = { relativePath: "01.png" as never, kind: "page" };
    const second: CatalogEntry = { relativePath: "02.png" as never, kind: "page" };
    settingsMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "settings-no-sync" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS, viewerCatalogSelectionSync: false },
    });
    openMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "open-image-folder-no-sync" as never,
      generation: 1 as never,
      data: {
        itemKey: "",
        displayName: first.relativePath,
        pages: [first, second].map((entry, index) => ({
          id: `folder-no-sync-${index}` as never,
          relativePath: entry.relativePath,
          mediaUri: `data:image/png;base64,no-sync-${index}`,
        })),
        startIndex: 0,
      },
    });
    await registerTestLibrary([first, second]);
    await openTestComic(first.relativePath);
    markViewerPrefetchReady();

    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);
    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));

    const grid = await screen.findByRole("grid", { name: "現在のフォルダの項目" });
    const firstButton = within(grid).getAllByRole("button")
      .find((button) => button.getAttribute("data-relative-path") === first.relativePath);
    await waitFor(() => expect(firstButton).toHaveAttribute("data-selected", "true"));
    expect(screen.getByText("現在位置: 1/2")).toBeInTheDocument();
  });

  it("FT-B17-002 exposes accessible toolbar commands and invokes each callback once", async () => {
    await registerTestLibrary([]);

    let viewMenu = openAppMenu("表示");
    const nameSort = within(viewMenu).getByRole("menuitemradio", {
      name: "名前で並べ替え",
    });
    expect(nameSort).toHaveAttribute("aria-checked", "true");
    expect(within(viewMenu).getByRole("menuitemradio", { name: "昇順" }))
      .toHaveAttribute("aria-checked", "true");
    expect(within(viewMenu).getByRole("menuitemradio", { name: "表紙グリッド" }))
      .toHaveAttribute("aria-checked", "true");
    expect(within(viewMenu).getAllByRole("menuitemradio").slice(-5).map((item) => item.textContent))
      .toEqual(["詳細リスト", "小サムネイル", "表紙グリッド", "カードグリッド", "情報カード"]);
    expect(saveSortMock).not.toHaveBeenCalled();

    fireEvent.keyDown(
      within(viewMenu).getByRole("menuitemradio", {
        name: "更新日時で並べ替え",
      }),
      { key: " " },
    );
    expect(saveSortMock).toHaveBeenCalledTimes(1);
    expect(saveSortMock).toHaveBeenLastCalledWith(
      { sortField: "modified", sortDescending: false },
      expect.any(Number),
    );
    expect(screen.getByLabelText("並べ替え条件"))
      .toHaveAttribute("data-sort-field", "modified");

    viewMenu = openAppMenu("表示");
    fireEvent.click(within(viewMenu).getByRole("menuitemradio", { name: "降順" }));
    expect(saveSortMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "並び順: 降順" })).toHaveAttribute(
      "data-sort-descending",
      "true",
    );

    viewMenu = openAppMenu("表示");
    fireEvent.click(
      within(viewMenu).getByRole("menuitemradio", { name: "詳細リスト" }),
    );
    expect(saveCatalogViewModeMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("一覧表示形式"))
      .toHaveAttribute("data-catalog-view-mode", "detail_list");
  });

  it("opens toolbar choice menus and keeps icon-only commands explained", async () => {
    await registerTestLibrary([]);

    const sortButton = screen.getByRole("button", { name: "並べ替え条件" });
    expect(sortButton).toHaveAttribute("title", "一覧の並べ替え条件を選択");
    expect(screen.queryByRole("combobox", { name: "並べ替え条件" }))
      .not.toBeInTheDocument();
    chooseToolbarMenuItem("並べ替え条件", "並べ替え候補", "サイズ");
    expect(sortButton).toHaveAttribute("data-sort-field", "size");
    expect(sortButton).toHaveTextContent(/^サイズ ▾$/);
    expect(sortButton).not.toHaveTextContent("並べ替え");

    expect(screen.queryByRole("button", { name: "巻末動作" })).not.toBeInTheDocument();

    chooseToolbarMenuItem("一覧表示形式", "一覧表示形式候補", "小サムネイル");
    expect(screen.getByRole("button", { name: "一覧表示形式" }))
      .toHaveAttribute("data-catalog-view-mode", "small_thumbnail");
    expect(screen.getByRole("button", { name: "一覧表示形式" }))
      .toHaveTextContent(/^小サムネイル ▾$/);
    expect(screen.getByRole("button", { name: "一覧表示形式" }))
      .not.toHaveTextContent("一覧形式");
    expect(screen.queryByRole("button", { name: "カードグリッド" }))
      .not.toBeInTheDocument();

    const direction = screen.getByRole("button", { name: "並び順: 昇順" });
    expect(direction).toHaveTextContent("▲");
    expect(direction).not.toHaveTextContent("昇順");
    expect(direction).toHaveAttribute("title", "昇順を降順へ変更");

    const addressForm = screen.getByLabelText("アドレス").closest("form")!;
    const move = within(addressForm).getByRole("button", { name: "アドレスへ移動" });
    expect(move).toHaveTextContent("➜");
    expect(move).not.toHaveTextContent("移動");
    expect(move).toHaveAttribute("title", "入力したアドレスへ移動");
    expect(within(addressForm).queryByRole("button", { name: "UIを表示" }))
      .not.toBeInTheDocument();
    expect(within(addressForm).queryByRole("button", { name: "タスクトレイへ収納" }))
      .not.toBeInTheDocument();

    expect(screen.queryByLabelText("名前検索")).not.toBeInTheDocument();
    const searchToggle = screen.getByRole("button", { name: "検索ペインを表示" });
    expect(searchToggle).toHaveTextContent("⌕");
    expect(searchToggle).toHaveAttribute("title", "検索を表示");
    const searchPane = openSearchPane();
    const search = within(searchPane).getByRole("button", { name: "検索" });
    expect(search).toHaveTextContent("⌕");
    expect(search).not.toHaveTextContent("検索");
    expect(search).toHaveAttribute("title", "名前で検索");
    expect(within(searchPane).queryByLabelText("一覧の絞り込み")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "現在の一覧を絞り込む" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "フォルダツリー" }))
      .not.toBeInTheDocument();
    fireEvent.click(within(searchPane).getByRole("button", { name: "検索ペインを閉じる" }));
    expect(screen.getByRole("complementary", { name: "フォルダツリー" }))
      .toBeInTheDocument();

    const viewMenu = openAppMenu("表示");
    expect(within(viewMenu).getByRole("menuitem", { name: "UIを表示" }))
      .toBeInTheDocument();
  });

  it("supports mnemonic, item traversal, cross-menu arrows and Escape focus return", async () => {
    await registerTestLibrary([]);

    fireEvent.keyDown(window, { key: "v", altKey: true });
    const viewMenu = await screen.findByRole("menu", { name: "表示" }, { timeout: 10_000 });
    const back = within(viewMenu).getByRole("menuitem", { name: /戻る/ });
    const up = within(viewMenu).getByRole("menuitem", {
      name: /上のフォルダへ/,
    });
    await waitFor(() => expect(back).toHaveFocus());
    expect(back).toHaveAttribute("aria-disabled", "true");
    expect(back).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowLeft");
    fireEvent.keyDown(back, { key: "Enter" });
    expect(listMock).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(back, { key: "End" });
    const lastViewItem = within(viewMenu).getByRole("menuitemradio", { name: "情報カード" });
    expect(lastViewItem).toHaveFocus();
    fireEvent.keyDown(lastViewItem, { key: "Home" });
    expect(back).toHaveFocus();
    fireEvent.keyDown(up, { key: "ArrowRight" });
    const optionsMenu = await screen.findByRole("menu", { name: "オプション" });
    const settingsItem = within(optionsMenu).getByRole("menuitem", { name: "統合設定…" });
    await waitFor(() => expect(settingsItem).toHaveFocus());
    fireEvent.keyDown(settingsItem, { key: "Escape" });
    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "オプション" })).toHaveFocus(),
    );
    expect(screen.queryByRole("menu", { name: "オプション" })).not.toBeInTheDocument();
  }, 10_000);

  it("REQ-LEY-P3-009 previews recursive scope, reports progress, prevents re-entry, and cancels", async () => {
    let finish: ((value: Awaited<ReturnType<typeof generateRecursiveThumbnails>>) => void) | undefined;
    generateRecursiveThumbnailsMock.mockImplementation(() => new Promise((resolve) => {
      finish = resolve;
    }));
    await registerTestLibrary([]);

    chooseAppMenuItem("オプション", "サムネイル管理…");
    const dialog = screen.getByRole("dialog", { name: "サムネイル管理" });
    expect(within(dialog).getByText(/深さ64、走査50,000項目、候補10,000件/))
      .toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: "library全体" }));
    const start = within(dialog).getByRole("button", { name: "一括生成を開始" });
    fireEvent.click(start);
    expect(generateRecursiveThumbnailsMock).toHaveBeenCalledTimes(1);
    expect(generateRecursiveThumbnailsMock).toHaveBeenCalledWith("", expect.any(Number));
    expect(start).toBeDisabled();
    fireEvent.click(start);
    expect(generateRecursiveThumbnailsMock).toHaveBeenCalledTimes(1);

    const requestGeneration = generateRecursiveThumbnailsMock.mock.calls[0][1];
    act(() => recursiveThumbnailHarness.handler?.({
      generation: requestGeneration,
      phase: "generating",
      relativePath: "",
      processed: 25,
      total: 100,
      generated: 20,
      cacheHits: 4,
      failed: 1,
    }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("処理 25 / 100");
    expect(within(dialog).getByRole("progressbar", { name: "サムネイル一括生成の進捗" }))
      .toHaveAttribute("value", "25");
    act(() => recursiveThumbnailHarness.handler?.({
      generation: requestGeneration + 1,
      phase: "generating",
      relativePath: "",
      processed: 80,
      total: 100,
      generated: 70,
      cacheHits: 8,
      failed: 2,
    }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("処理 25 / 100");

    fireEvent.click(within(dialog).getByRole("button", { name: "一括生成をキャンセル" }));
    expect(cancelRecursiveThumbnailGenerationMock).toHaveBeenCalledWith(requestGeneration);
    await act(async () => finish?.({
      status: "cancelled",
      requestId: "recursive-thumbnails" as never,
      generation: requestGeneration as never,
    }));
    expect(await within(dialog).findByText(/一括生成をキャンセルしました/)).toBeInTheDocument();
    expect(start).not.toBeDisabled();
  });

  it("connects Navigation history and prevents diagnostics re-entry while busy", async () => {
    diagnoseMock.mockImplementation(() => new Promise<never>(() => undefined));
    await registerTestLibrary([]);

    fireEvent.change(screen.getByLabelText("アドレス"), {
      target: { value: "C:\\Comics\\Series" },
    });
    fireEvent.submit(screen.getByLabelText("アドレス").closest("form")!);
    await waitFor(() =>
      expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics\\Series"),
    );

    let navigationMenu = openAppMenu("表示");
    expect(within(navigationMenu).getByRole("menuitem", { name: /戻る/ }))
      .toHaveAttribute("aria-disabled", "false");
    expect(within(navigationMenu).getByRole("menuitem", { name: /進む/ }))
      .toHaveAttribute("aria-disabled", "true");
    expect(within(navigationMenu).getByRole("menuitem", { name: /上のフォルダへ/ }))
      .toHaveAttribute("aria-disabled", "false");
    fireEvent.click(within(navigationMenu).getByRole("menuitem", { name: /戻る/ }));
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\"));

    navigationMenu = openAppMenu("表示");
    expect(within(navigationMenu).getByRole("menuitem", { name: /進む/ }))
      .toHaveAttribute("aria-disabled", "false");
    fireEvent.keyDown(
      within(navigationMenu).getByRole("menuitem", { name: /進む/ }),
      { key: "Enter" },
    );
    await waitFor(() =>
      expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics\\Series"),
    );
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\"));
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    await waitFor(() =>
      expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics\\Series"),
    );
    fireEvent.keyDown(window, { key: "ArrowUp", altKey: true });
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics"));

    let libraryMenu = openAppMenu("オプション");
    const diagnostics = within(libraryMenu).getByRole("menuitem", {
      name: "ライブラリ診断…",
    });
    expect(diagnostics).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(diagnostics);
    expect(diagnoseMock).toHaveBeenCalledTimes(1);

    libraryMenu = openAppMenu("オプション");
    const busyDiagnostics = within(libraryMenu).getByRole("menuitem", {
      name: "ライブラリ診断…",
    });
    expect(busyDiagnostics).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(busyDiagnostics);
    fireEvent.keyDown(busyDiagnostics, { key: "Enter" });
    expect(diagnoseMock).toHaveBeenCalledTimes(1);
  });

  it("submits visible, near and background thumbnails with bounded-worker priorities", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "settings-all-thumbnails" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS, thumbnailGenerationScope: "all" },
    });
    const entries: CatalogEntry[] = Array.from({ length: 45 }, (_, index) => ({
      relativePath: `book-${index.toString().padStart(2, "0")}.cbz` as never,
      kind: "archive",
      archiveKind: "cbz",
    }));
    await registerTestLibrary(entries);

    await waitFor(() => expect(thumbnailMock).toHaveBeenCalledTimes(45));
    const priorities = thumbnailMock.mock.calls.map((call) => call[3]);
    expect(priorities.filter((value) => value === "visible")).toHaveLength(25);
    expect(priorities.filter((value) => value === "near")).toHaveLength(15);
    expect(priorities.filter((value) => value === "background")).toHaveLength(5);
  });

  it("requests cached thumbnails for images displayed directly in a folder", async () => {
    const entries: CatalogEntry[] = ["001.jpg", "002.jpg"].map((relativePath) => ({
      relativePath: relativePath as never,
      kind: "page",
    }));
    thumbnailMock.mockImplementation(() => new Promise(() => undefined));

    await registerTestLibrary(entries);

    await waitFor(() => expect(thumbnailMock).toHaveBeenCalledTimes(2));
    expect(thumbnailMock.mock.calls.map(([path]) => path)).toEqual(["001.jpg", "002.jpg"]);
  });

  it("persists the selected end-of-volume policy without changing the catalog sort", async () => {
    const entry = testEntry("policy.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(entry.relativePath));
    await registerTestLibrary([entry]);
    await openTestComic(entry.relativePath);

    const policy = await screen.findByRole("combobox", { name: "巻末動作" });
    fireEvent.change(policy, { target: { value: "loop" } });

    expect(policy).toHaveValue("loop");
    expect(saveEndPolicyMock).toHaveBeenCalledWith("loop", expect.any(Number));
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));

    expect(await screen.findByLabelText("並べ替え条件"))
      .toHaveAttribute("data-sort-field", "name");
  });

  it("shows confirm_next at the volume boundary and opens only after approval", async () => {
    const first = {
      relativePath: "01-first.cbz" as never,
      kind: "archive" as const,
      archiveKind: "cbz" as const,
    };
    const second = {
      relativePath: "02-second.cbz" as never,
      kind: "archive" as const,
      archiveKind: "cbz" as const,
    };
    const session = (itemKey: string) => ({
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
    });
    openMock
      .mockResolvedValueOnce({
        status: "ok",
        requestId: "open-1" as never,
        generation: 1 as never,
        data: session(first.relativePath),
      })
      .mockResolvedValueOnce({
        status: "ok",
        requestId: "open-2" as never,
        generation: 2 as never,
        data: session(second.relativePath),
      });
    await registerTestLibrary([first, second]);
    fireEvent.keyDown(
      await screen.findByRole("button", { name: /01-first/ }),
      { key: "Enter" },
    );
    expect(await screen.findByLabelText("01-first.cbz ビューワ")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "巻末動作" }), {
      target: { value: "confirm_next" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);

    expect(await screen.findByRole("dialog")).toHaveTextContent("02-second.cbz");
    expect(openMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "次の漫画を開く" }));
    expect(await screen.findByLabelText("02-second.cbz ビューワ")).toBeInTheDocument();
    expect(openMock).toHaveBeenCalledTimes(2);
  });

  it("opens the next comic automatically from the Viewer end callback", async () => {
    const first = testEntry("01-first.cbz");
    const second = testEntry("02-second.cbz");
    openMock
      .mockResolvedValueOnce(viewerResponse(first.relativePath))
      .mockResolvedValueOnce(viewerResponse(second.relativePath));
    await registerTestLibrary([first, second]);
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    try {
      await openTestComic(first.relativePath);
      await waitFor(() =>
        expect(
          addEventListenerSpy.mock.calls.some(([type]) => type === "keydown"),
        ).toBe(true),
      );
      fireEvent.keyDown(window, { key: "ArrowLeft" });

      expect(
        await screen.findByLabelText(`${second.relativePath} ビューワ`),
      ).toBeInTheDocument();
      expect(openMock).toHaveBeenNthCalledWith(
        2,
        second.relativePath,
        expect.any(Number),
      );
    } finally {
      addEventListenerSpy.mockRestore();
    }
  });

  it("opens the next image folder after reaching the end of loose folder images", async () => {
    const firstFolder: CatalogEntry = {
      relativePath: "01-images" as never,
      kind: "folder",
    };
    const nextFolder: CatalogEntry = {
      relativePath: "02-images" as never,
      kind: "folder",
    };
    const loosePage: CatalogEntry = {
      relativePath: "01-images/001.jpg" as never,
      kind: "page",
    };
    openMock
      .mockResolvedValueOnce(viewerResponse(firstFolder.relativePath))
      .mockResolvedValueOnce(viewerResponse(nextFolder.relativePath));
    await registerTestLibrary([firstFolder, nextFolder]);
    listMock.mockResolvedValue({
      status: "ok",
      requestId: "list-first-folder" as never,
      generation: 3 as never,
      data: [loosePage],
    });

    const rootGrid = screen.getByRole("grid", { name: "現在のフォルダの項目" });
    const firstFolderButton = within(rootGrid).getAllByRole("button")
      .find((button) => button.getAttribute("data-relative-path") === firstFolder.relativePath);
    expect(firstFolderButton).toBeDefined();
    fireEvent.keyDown(firstFolderButton!, { key: "Enter" });
    await waitFor(() => expect(listMock).toHaveBeenCalledWith(
      firstFolder.relativePath,
      expect.any(Number),
    ));

    const folderGrid = await screen.findByRole("grid", { name: "現在のフォルダの項目" });
    const pageButton = within(folderGrid).getAllByRole("button")
      .find((button) => button.getAttribute("data-relative-path") === loosePage.relativePath);
    expect(pageButton).toBeDefined();
    fireEvent.keyDown(pageButton!, { key: "Enter" });
    expect(await screen.findByLabelText(`${firstFolder.relativePath} ビューワ`))
      .toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);

    expect(await screen.findByLabelText(`${nextFolder.relativePath} ビューワ`))
      .toBeInTheDocument();
    expect(openMock).toHaveBeenNthCalledWith(
      2,
      nextFolder.relativePath,
      expect.any(Number),
    );
  });

  it("opens the next comic at its first page and the previous comic at its last page", async () => {
    const first = testEntry("01-first.cbz");
    const second = testEntry("02-second.cbz");
    const bookSession = (itemKey: string, pageCount: number, startIndex: number) => ({
      itemKey,
      displayName: itemKey,
      pages: Array.from({ length: pageCount }, (_, index) => ({
        id: `${itemKey}-${index}` as never,
        relativePath: `${index + 1}.png` as never,
        mediaUri: `data:image/png;base64,${itemKey}-${index}`,
      })),
      startIndex,
    });
    openMock
      .mockResolvedValueOnce({
        status: "ok",
        requestId: "open-first" as never,
        generation: 1 as never,
        data: bookSession(first.relativePath, 2, 1),
      })
      .mockResolvedValueOnce({
        status: "ok",
        requestId: "open-second" as never,
        generation: 2 as never,
        data: bookSession(second.relativePath, 3, 2),
      })
      .mockResolvedValueOnce({
        status: "ok",
        requestId: "reopen-first" as never,
        generation: 3 as never,
        data: bookSession(first.relativePath, 3, 0),
      });

    await registerTestLibrary([first, second]);
    await openTestComic(first.relativePath);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);
    expect(await screen.findByLabelText(`${second.relativePath} ビューワ`)).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "前ページ" }));
    expect(await screen.findByLabelText(`${first.relativePath} ビューワ`)).toBeInTheDocument();
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("keeps the first comic open when there is no previous comic", async () => {
    const only = testEntry("01-only.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(only.relativePath));
    await registerTestLibrary([only]);
    await openTestComic(only.relativePath);

    fireEvent.click(screen.getByRole("button", { name: "前ページ" }));
    expect(await screen.findByText("巻頭です。前の漫画はありません。"))
      .toHaveAttribute("role", "status");
    expect(screen.getByLabelText(`${only.relativePath} ビューワ`)).toBeInTheDocument();
    expect(openMock).toHaveBeenCalledTimes(1);
  });

  it("REQ-LEY-P2-015 synchronizes a next-volume Viewer session to its catalog item", async () => {
    const first = testEntry("01-first.cbz");
    const second = testEntry("02-second.cbz");
    openMock
      .mockResolvedValueOnce(viewerResponse(first.relativePath))
      .mockResolvedValueOnce(viewerResponse(second.relativePath));
    await registerTestLibrary([first, second]);
    await openTestComic(first.relativePath);

    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);
    expect(await screen.findByLabelText(`${second.relativePath} ビューワ`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));

    const grid = await screen.findByRole("grid", { name: "現在のフォルダの項目" });
    const secondButton = within(grid).getAllByRole("button")
      .find((button) => button.getAttribute("data-relative-path") === second.relativePath);
    await waitFor(() => expect(secondButton).toHaveAttribute("data-selected", "true"));
  });

  it("returns to the library from the Viewer end callback for return_library", async () => {
    const first = testEntry("01-first.cbz");
    const second = testEntry("02-second.cbz");
    type SettingsResponse = Awaited<ReturnType<typeof getCatalogSettings>>;
    let releaseSettings!: (response: SettingsResponse) => void;
    settingsMock.mockImplementation(
      () =>
        new Promise<SettingsResponse>((resolve) => {
          releaseSettings = resolve;
        }),
    );
    openMock.mockResolvedValueOnce(viewerResponse(first.relativePath));

    await registerTestLibrary([first, second]);
    await openTestComic(first.relativePath);
    const policy = await screen.findByRole("combobox", { name: "巻末動作" });
    fireEvent.change(policy, { target: { value: "return_library" } });
    await waitFor(() =>
      expect(policy).toHaveValue("return_library"),
    );
    releaseSettings({
      status: "ok",
      requestId: "stale-settings" as never,
      generation: 1 as never,
      data: {
        ...DEFAULT_CATALOG_SETTINGS,
        endOfVolumePolicy: "auto_next",
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "巻末動作" }))
        .toHaveValue("return_library"),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);

    await waitFor(() =>
      expect(
        screen.queryByLabelText(`${first.relativePath} ビューワ`),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("grid", { name: "現在のフォルダの項目" }),
    ).toBeInTheDocument();
    expect(openMock).toHaveBeenCalledTimes(1);
  });

  it("REQ-LEY-P2-002 returns to the library from the final volume", async () => {
    const only = testEntry("01-only.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(only.relativePath));
    await registerTestLibrary([only]);
    await openTestComic(only.relativePath);
    fireEvent.change(screen.getByRole("combobox", { name: "巻末動作" }), {
      target: { value: "return_library" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);

    await waitFor(() => expect(
      screen.queryByLabelText(`${only.relativePath} ビューワ`),
    ).not.toBeInTheDocument());
    expect(screen.getByRole("grid", { name: "現在のフォルダの項目" }))
      .toBeInTheDocument();
    expect(openMock).toHaveBeenCalledTimes(1);
  });

  it("REQ-LEY-P2-003 loads, saves, and deletes SQLite-backed bookmarks", async () => {
    const only = testEntry("bookmarked.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(only.relativePath));
    await registerTestLibrary([only]);
    await openTestComic(only.relativePath);
    await waitFor(() => expect(listPageBookmarksMock)
      .toHaveBeenCalledWith(only.relativePath, expect.any(Number)));

    fireEvent.click(screen.getByRole("button", { name: "しおりを保存" }));
    await screen.findByText("しおりを保存しました: 1ページ");
    expect(savePageBookmarkMock).toHaveBeenCalledWith({
      itemKey: only.relativePath,
      pageIndex: 0,
      pageKey: "page-1.png",
      createdAt: expect.any(Number),
    }, expect.any(Number));

    fireEvent.click(screen.getByRole("button", { name: "しおり一覧" }));
    fireEvent.click(screen.getByRole("button", { name: "しおりを削除: page-1.png" }));
    await screen.findByText("しおりを削除しました: page-1.png");
    expect(deletePageBookmarkMock).toHaveBeenCalledWith(
      only.relativePath,
      "page-1.png",
      expect.any(Number),
    );
  });

  it("REQ-LEY-P2-003 removes legacy bookmark rows only after native migration succeeds", async () => {
    localStorage.clear();
    localStorage.setItem("comic-explorer.bookmarks.v1", JSON.stringify([{
      itemKey: "legacy.cbz",
      pageIndex: 0,
      pageKey: "page-1.png",
      createdAt: 1,
    }]));
    const legacy = testEntry("legacy.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(legacy.relativePath));
    await registerTestLibrary([legacy]);
    await openTestComic(legacy.relativePath);

    await waitFor(() => expect(savePageBookmarkMock).toHaveBeenCalledWith({
      itemKey: legacy.relativePath,
      pageIndex: 0,
      pageKey: "page-1.png",
      createdAt: 1,
    }, expect.any(Number)));
    expect(listBookmarks(legacy.relativePath, "C:\\")).toEqual([]);
    localStorage.clear();
  });

  it("keeps the Viewer open and reports a stop policy at the boundary", async () => {
    const first = testEntry("01-first.cbz");
    const second = testEntry("02-second.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(first.relativePath));

    await registerTestLibrary([first, second]);
    await openTestComic(first.relativePath);
    fireEvent.change(screen.getByRole("combobox", { name: "巻末動作" }), {
      target: { value: "stop" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);

    const notice = await screen.findByText("巻末動作が停止に設定されています。");
    expect(notice).toHaveAttribute("role", "status");
    expect(
      screen.getByLabelText(`${first.relativePath} ビューワ`),
    ).toBeInTheDocument();
    expect(openMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the Viewer open and reports a safe stop when there is no next comic", async () => {
    const only = testEntry("01-only.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(only.relativePath));

    await registerTestLibrary([only]);
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    try {
      await openTestComic(only.relativePath);
      await waitFor(() =>
        expect(
          addEventListenerSpy.mock.calls.some(([type]) => type === "keydown"),
        ).toBe(true),
      );
      fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);

      const notice = await screen.findByText("巻末です。次の漫画はありません。");
      expect(notice).toHaveAttribute("role", "status");
      expect(
        screen.getByLabelText(`${only.relativePath} ビューワ`),
      ).toBeInTheDocument();
      expect(openMock).toHaveBeenCalledTimes(1);
    } finally {
      addEventListenerSpy.mockRestore();
    }
  });

  it("opens the sorted first comic when loop is selected at the final comic", async () => {
    const first = testEntry("01-first.cbz");
    const last = testEntry("02-last.cbz");
    openMock
      .mockResolvedValueOnce(viewerResponse(last.relativePath))
      .mockResolvedValueOnce(viewerResponse(first.relativePath));

    await registerTestLibrary([last, first]);
    await openTestComic(last.relativePath);
    fireEvent.change(screen.getByRole("combobox", { name: "巻末動作" }), {
      target: { value: "loop" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);

    expect(
      await screen.findByLabelText(`${first.relativePath} ビューワ`),
    ).toBeInTheDocument();
    expect(openMock).toHaveBeenNthCalledWith(
      2,
      first.relativePath,
      expect.any(Number),
    );
  });

  it("uses the policy restored from settings for connected end-of-volume behavior", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "restored-settings" as never,
      generation: 1 as never,
      data: {
        ...DEFAULT_CATALOG_SETTINGS,
        endOfVolumePolicy: "stop",
      },
    });
    const first = testEntry("01-first.cbz");
    const second = testEntry("02-second.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(first.relativePath));

    await registerTestLibrary([first, second]);
    await openTestComic(first.relativePath);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "巻末動作" }))
        .toHaveValue("stop"),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);

    expect(
      await screen.findByText("巻末動作が停止に設定されています。"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(`${first.relativePath} ビューワ`),
    ).toBeInTheDocument();
    expect(openMock).toHaveBeenCalledTimes(1);
  });
  it("FT-B04-001 keeps paged as the default and persists layout mode through the App", async () => {
    openMock.mockResolvedValueOnce(viewerResponse("layout.cbz"));
    await registerTestLibrary([testEntry("layout.cbz")]);

    fireEvent.keyDown(
      await screen.findByRole("button", { name: /layout\.cbz/ }),
      { key: "Enter" },
    );
    await screen.findByLabelText("layout.cbz ビューワ");
    const selector = screen.getByLabelText("閲覧レイアウト");
    expect(selector).toHaveValue("paged");
    expect(screen.getByRole("combobox", { name: "閲覧レイアウト" })).toHaveValue(
      "paged",
    );

    fireEvent.change(screen.getByLabelText("閲覧レイアウト"), {
      target: { value: "vertical_scroll" },
    });
    expect(screen.getByLabelText("閲覧レイアウト")).toHaveValue("vertical_scroll");
    expect(saveViewerMock).toHaveBeenCalledWith(
      expect.objectContaining({ layoutMode: "vertical_scroll" }),
      expect.any(Number),
    );
  });

  it("FT-B04-002 observes both connected scroll layouts without changing the page anchor", async () => {
    const entry = testEntry("scroll.cbz");
    openMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "scroll-open" as never,
      generation: 1 as never,
      data: {
        itemKey: entry.relativePath,
        displayName: entry.relativePath,
        pages: [
          { id: "page-1" as never, relativePath: "1.png" as never, mediaUri: "data:image/png;base64,one" },
          { id: "page-2" as never, relativePath: "2.png" as never, mediaUri: "data:image/png;base64,two" },
          { id: "page-3" as never, relativePath: "3.png" as never, mediaUri: "data:image/png;base64,three" },
        ],
        startIndex: 1,
      },
    });
    await registerTestLibrary([entry]);
    await openTestComic(entry.relativePath);

    const selector = screen.getByLabelText("閲覧レイアウト");
    fireEvent.change(selector, { target: { value: "vertical_scroll" } });
    await waitFor(() => {
      expect(screen.getByRole("region", { name: `${entry.relativePath} ビューワ` })).toHaveAttribute(
        "data-layout-mode",
        "vertical_scroll",
      );
      expect(document.querySelector(".page-spread")).toHaveAttribute(
        "data-page-anchor",
        "1",
      );
    });
    expect(screen.getByRole("article", { name: "ページ 2" })).toHaveFocus();

    fireEvent.change(selector, { target: { value: "horizontal_scroll" } });
    await waitFor(() =>
      expect(document.querySelector(".page-spread")).toHaveAttribute(
        "data-layout-mode",
        "horizontal_scroll",
      ),
    );
    expect(document.querySelector(".page-spread")).toHaveAttribute(
      "data-page-anchor",
      "1",
    );
  });

  it("FT-B04-004 starts archives fullscreen and exits with Esc", async () => {
    const adapter: FullscreenAdapter = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn().mockResolvedValue(undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
    };
    const entry = testEntry("fullscreen.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(entry.relativePath));
    await registerTestLibrary([entry], adapter);
    await openTestComic(entry.relativePath);

    await waitFor(() =>
      expect(screen.getByRole("region", { name: `${entry.relativePath} ビューワ` })).toHaveAttribute(
        "data-fullscreen",
        "true",
      ),
    );
    expect(adapter.enter).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "全画面表示" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
    expect(adapter.exit).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(`${entry.relativePath} ビューワ`)).toBeInTheDocument();
  });

  it("REQ-LEY-P2-011 connects persisted fullscreen close and display-awake settings", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "fullscreen-lifecycle" as never,
      generation: 1 as never,
      data: {
        ...DEFAULT_CATALOG_SETTINGS,
        fullscreenEscapeBehavior: "closeViewer",
        preventDisplaySleepFullscreen: true,
      },
    });
    const adapter: FullscreenAdapter = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn().mockResolvedValue(undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
      setDisplayAwake: vi.fn().mockResolvedValue(undefined),
    };
    const entry = testEntry("fullscreen-power.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(entry.relativePath));
    await registerTestLibrary([entry], adapter);
    await openTestComic(entry.relativePath);

    await waitFor(() => expect(adapter.setDisplayAwake).toHaveBeenCalledWith(true));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText(`${entry.relativePath} ビューワ`))
      .not.toBeInTheDocument());
    expect(adapter.setDisplayAwake).toHaveBeenLastCalledWith(false);
    expect(adapter.exit).toHaveBeenCalledTimes(1);
  });

  it("keeps directly opened images in windowed mode", async () => {
    const adapter: FullscreenAdapter = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn().mockResolvedValue(undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
    };
    const entry: CatalogEntry = {
      relativePath: "001.jpg" as never,
      kind: "page",
    };
    openMock.mockResolvedValueOnce(viewerResponse(entry.relativePath));
    await registerTestLibrary([entry], adapter);
    await openTestComic(entry.relativePath);

    expect(screen.getByRole("region", { name: `${entry.relativePath} ビューワ` }))
      .toHaveAttribute("data-fullscreen", "false");
    expect(adapter.enter).not.toHaveBeenCalled();
  });

  it("FT-B04-005 restores layout from App settings while leaving fullscreen as window state", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "restored-layout" as never,
      generation: 1 as never,
      data: {
        ...DEFAULT_CATALOG_SETTINGS,
        viewMode: "spread",
        layoutMode: "horizontal_scroll",
        readingDirection: "leftToRight",
        scaleMode: "custom",
        scale: 1.7,
        loupeEnabled: true,
      },
    });
    const entry = testEntry("restored-layout.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(entry.relativePath));
    await registerTestLibrary([entry]);
    await openTestComic(entry.relativePath);

    expect(screen.getByLabelText("閲覧レイアウト")).toHaveValue("horizontal_scroll");
    expect(document.querySelector(".page-spread")).toHaveAttribute(
      "data-scale-mode",
      "custom",
    );
    expect(document.querySelector(".page-spread")).toHaveAttribute(
      "data-scale",
      "1.7",
    );
    expect(screen.getByRole("button", { name: "ルーペ" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "全画面表示" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("FT-B03-001 switches all five catalog modes through the connected App", async () => {
    const entries = [
      testEntry("01-first.cbz"),
      testEntry("02-second.cbz"),
      testEntry("03-third.cbz"),
    ];

    await registerTestLibrary(entries);

    const selector = await screen.findByLabelText("一覧表示形式");
    const grid = screen.getByRole("grid", { name: "現在のフォルダの項目" });
    expect(selector).toHaveAttribute("data-catalog-view-mode", "cover_list");
    expect(grid).toHaveAttribute("data-catalog-view-mode", "cover_list");

    for (const [mode, label] of [
      ["small_thumbnail", "小サムネイル"],
      ["detail_list", "詳細リスト"],
      ["card_grid", "カードグリッド"],
      ["reference_tile", "情報カード"],
      ["cover_list", "表紙グリッド"],
    ] as const) {
      chooseToolbarMenuItem("一覧表示形式", "一覧表示形式候補", label);
      await waitFor(() => {
        expect(selector).toHaveAttribute("data-catalog-view-mode", mode);
        expect(grid).toHaveAttribute("data-catalog-view-mode", mode);
      });
    }

    expect(saveCatalogViewModeMock).toHaveBeenCalledWith(
      "small_thumbnail",
      expect.any(Number),
    );
    expect(saveCatalogViewModeMock).toHaveBeenCalledWith(
      "detail_list",
      expect.any(Number),
    );
    expect(saveCatalogViewModeMock).toHaveBeenCalledWith(
      "card_grid",
      expect.any(Number),
    );
    expect(saveCatalogViewModeMock).toHaveBeenCalledWith(
      "reference_tile",
      expect.any(Number),
    );
  });

  it("FT-B03-002 keeps long names and missing metadata available in every mode", async () => {
    const entries: CatalogEntry[] = [
      {
        relativePath:
          "A very long comic name that remains available to keyboard users.cbz" as never,
        kind: "archive",
        archiveKind: "cbz",
        byteSize: 1234,
        modifiedMs: 1_735_689_600_000,
      },
      {
        relativePath: "missing-metadata" as never,
        kind: "folder",
      },
      {
        relativePath: "comic-folder" as never,
        kind: "comicFolder",
      },
    ];

    await registerTestLibrary(entries);
    await screen.findByLabelText("一覧表示形式");
    const grid = screen.getByRole("grid", { name: "現在のフォルダの項目" });

    for (const [mode, label] of [
      ["cover_list", "表紙グリッド"],
      ["small_thumbnail", "小サムネイル"],
      ["card_grid", "カードグリッド"],
      ["reference_tile", "情報カード"],
      ["detail_list", "詳細リスト"],
    ] as const) {
      chooseToolbarMenuItem("一覧表示形式", "一覧表示形式候補", label);
      await waitFor(() =>
        expect(grid).toHaveAttribute("data-catalog-view-mode", mode),
      );
      expect(grid).toHaveAttribute("data-entry-count", "3");
      if (mode === "card_grid") {
        expect(screen.queryByText("A very long comic name that remains available to keyboard users.cbz"))
          .not.toBeInTheDocument();
      } else {
        expect(screen.getByText("A very long comic name that remains available to keyboard users.cbz"))
          .toBeInTheDocument();
      }
      const folderItem = screen.getByRole("button", { name: /^missing-metadata、フォルダ/ });
      if (mode === "detail_list" || mode === "reference_tile") {
        expect(within(folderItem).getByText("フォルダ")).toBeInTheDocument();
      } else {
        expect(within(folderItem).queryByText("フォルダ")).not.toBeInTheDocument();
      }
      expect(screen.getByText("3項目")).toBeInTheDocument();
    }

    expect(screen.getByText("1.2 KB")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("FT-B03-003 keeps selection, keyboard focus and sorted navigation connected", async () => {
    const entries: CatalogEntry[] = Array.from({ length: 20 }, (_, index) => ({
      relativePath: `book-${index.toString().padStart(2, "0")}.cbz` as never,
      kind: "archive",
      archiveKind: "cbz",
      byteSize: 20 - index,
    }));

    await registerTestLibrary(entries);
    await screen.findByLabelText("一覧表示形式");
    chooseToolbarMenuItem("一覧表示形式", "一覧表示形式候補", "詳細リスト");
    const first = await screen.findByRole("button", { name: /book-00/ });
    fireEvent.keyDown(first, { key: "ArrowDown" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /book-01/ })).toHaveFocus();
      expect(screen.getByText("選択: book-01.cbz")).toBeInTheDocument();
    });

    chooseToolbarMenuItem("並べ替え条件", "並べ替え候補", "サイズ");
    expect(screen.getByRole("grid")).toHaveAttribute(
      "data-catalog-view-mode",
      "detail_list",
    );
    expect(screen.getByText("選択: book-01.cbz")).toBeInTheDocument();
  });

  it("FT-B03-004 restores the catalog mode from settings and persists a new choice", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "restored-catalog-settings" as never,
      generation: 1 as never,
      data: {
        ...DEFAULT_CATALOG_SETTINGS,
        catalogViewMode: "detail_list",
      },
    });

    await registerTestLibrary([testEntry("restored.cbz")]);

    const selector = await screen.findByLabelText("一覧表示形式");
    expect(selector).toHaveAttribute("data-catalog-view-mode", "detail_list");
    expect(screen.getByRole("grid")).toHaveAttribute(
      "data-catalog-view-mode",
      "detail_list",
    );
    chooseToolbarMenuItem("一覧表示形式", "一覧表示形式候補", "小サムネイル");
    expect(saveCatalogViewModeMock).toHaveBeenCalledWith(
      "small_thumbnail",
      expect.any(Number),
    );
  });

  it("FT-B17-003 rolls back a catalog view mode that the backend cannot persist", async () => {
    saveCatalogViewModeMock.mockResolvedValueOnce({
      status: "error",
      requestId: "catalog-view-error" as never,
      generation: 1 as never,
      error: {
        code: "ACCESS_DENIED",
        message: "settings database unavailable",
        retryable: true,
      },
    });
    await registerTestLibrary([testEntry("book.cbz")]);
    const selector = screen.getByLabelText("一覧表示形式");

    chooseToolbarMenuItem("一覧表示形式", "一覧表示形式候補", "カードグリッド");

    await waitFor(() =>
      expect(selector).toHaveAttribute("data-catalog-view-mode", "cover_list"),
    );
    expect(screen.getByText(/アクセスできません/)).toBeInTheDocument();
    expect(screen.getByRole("grid")).toHaveAttribute(
      "data-catalog-view-mode",
      "cover_list",
    );
  });

  it("FT-B05-001 connects exact and partial normalized name queries", async () => {
    const results = [
      { ...testEntry("Series/Volume 01.cbz"), kind: "archive" as const },
      { ...testEntry("Series/Volume 02.cbz"), kind: "archive" as const },
    ];
    searchMock.mockResolvedValueOnce(searchResponse(results));
    await registerTestLibrary([testEntry("root.cbz")]);
    openSearchPane();

    const input = await screen.findByLabelText("名前検索");
    fireEvent.change(input, { target: { value: "  ＶＯＬＵＭＥ  " } });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));

    const region = await screen.findByRole("region", { name: "名前検索結果" });
    expect(region).toHaveAttribute("data-search-result-count", "2");
    expect(region).toHaveTextContent("Volume 01.cbz");
    expect(region).toHaveTextContent("Volume 02.cbz");
    expect(searchMock).toHaveBeenCalledWith(
      "  ＶＯＬＵＭＥ  ",
      expect.any(Number),
      expect.objectContaining({
        includeSubfolders: true,
        includeFolders: true,
        includeFiles: true,
        fixedLocation: "",
        sourceRoots: ["C:\\"],
      }),
    );
  });

  it("REQ-LEY-P3-001 explains logical wildcard syntax and presents parser errors as repairable", async () => {
    searchMock.mockResolvedValueOnce({
      status: "error",
      requestId: "invalid-search-expression" as never,
      generation: 1 as never,
      error: {
        code: "INVALID_REQUEST",
        message: "backend parser detail",
        retryable: false,
      },
    });
    await registerTestLibrary([testEntry("root.cbz")]);
    const pane = openSearchPane();
    const input = within(pane).getByLabelText("名前検索");
    expect(input).toHaveAccessibleDescription(/AND \/ OR \/ NOT/);

    fireEvent.change(input, { target: { value: "*.cbz AND" } });
    fireEvent.click(within(pane).getByRole("button", { name: "検索" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("検索式を確認してください");
    expect(alert).toHaveTextContent("(*.cbz OR *.pdf) AND NOT sample*");
    expect(alert).not.toHaveTextContent("backend parser detail");
  });

  it("REQ-LEY-P3-004 searches picker-approved sources and opens a result in its source", async () => {
    const currentResult = {
      ...testEntry("Series/Volume.cbz"),
      sourceRoot: "C:\\",
    };
    const otherResult = {
      ...testEntry("Series/Volume.cbz"),
      sourceRoot: "D:\\Comics",
    };
    searchSourcePickerMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "pick-search-source" as never,
      generation: 1 as never,
      data: { absolutePath: "D:\\Comics" },
    });
    searchMock.mockResolvedValueOnce(searchResponse([currentResult, otherResult]));
    await registerTestLibrary([testEntry("root.cbz")]);
    const pane = openSearchPane();

    fireEvent.click(within(pane).getByLabelText("指定した複数の場所"));
    fireEvent.click(within(pane).getByRole("button", { name: "検索場所を追加" }));
    await within(pane).findByText("D:\\Comics");
    fireEvent.change(within(pane).getByLabelText("名前検索"), {
      target: { value: "volume" },
    });
    fireEvent.click(within(pane).getByRole("button", { name: "検索" }));

    const region = await screen.findByRole("region", { name: "名前検索結果" });
    expect(region).toHaveAttribute("data-search-result-count", "2");
    expect(searchMock).toHaveBeenCalledWith(
      "volume",
      expect.any(Number),
      expect.objectContaining({
        fixedLocation: null,
        sourceRoots: ["C:\\", "D:\\Comics"],
      }),
    );
    const otherButton = region.querySelector<HTMLButtonElement>(
      '[data-search-result-source="D:\\\\Comics"]',
    );
    expect(otherButton).not.toBeNull();

    registerMock.mockImplementationOnce(async (absolutePath) => ({
      status: "ok",
      requestId: "register-search-source" as never,
      generation: 2 as never,
      data: { absolutePath },
    }));
    listMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "search-source-parent" as never,
      generation: 3 as never,
      data: [testEntry("Series/Volume.cbz")],
    });
    fireEvent.click(otherButton!);

    await waitFor(() => {
      expect(registerMock).toHaveBeenLastCalledWith("D:\\Comics", expect.any(Number));
      expect(listMock).toHaveBeenLastCalledWith("Series", expect.any(Number));
      expect(screen.getByLabelText("アドレス")).toHaveValue("D:\\Comics\\Series");
    });
  });

  it("passes active search options and retains results when requested", async () => {
    const result = testEntry("Series/large-volume.cbz");
    searchMock.mockResolvedValueOnce(searchResponse([result]));
    await registerTestLibrary([testEntry("root.cbz")]);
    const pane = openSearchPane();

    fireEvent.click(within(pane).getByLabelText("サブフォルダーの中も検索する"));
    fireEvent.click(within(pane).getByLabelText("結果にフォルダーを含める"));
    fireEvent.click(within(pane).getByText("詳細条件"));
    fireEvent.click(within(pane).getByLabelText("項目を開いた後も検索結果を表示する"));
    fireEvent.click(within(pane).getByLabelText("サイズ指定を有効にする"));
    fireEvent.change(within(pane).getByLabelText("サイズ (KB)"), {
      target: { value: "128" },
    });
    fireEvent.change(within(pane).getByLabelText("名前検索"), {
      target: { value: "large" },
    });
    fireEvent.click(within(pane).getByRole("button", { name: "検索" }));

    await screen.findByRole("region", { name: "名前検索結果" });
    expect(searchMock).toHaveBeenCalledWith(
      "large",
      expect.any(Number),
      expect.objectContaining({
        includeSubfolders: false,
        includeFolders: false,
        includeFiles: true,
        fixedLocation: "",
        minSizeBytes: 128 * 1024,
      }),
    );

    listMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "retained-search-result" as never,
      generation: 2 as never,
      data: [result],
    });
    fireEvent.click(screen.getByRole("button", { name: /Series\/large-volume\.cbz/ }));
    expect(await screen.findByRole("region", { name: "名前検索結果" })).toBeInTheDocument();
  });

  it("REQ-LEY-P3-002 keeps the catalog unfiltered and exposes filtering only in search", async () => {
    await registerTestLibrary([
      testEntry("book.cbz"),
      { relativePath: "cover.jpg" as never, kind: "page" },
    ]);

    expect(screen.getByRole("grid")).toHaveAttribute("data-entry-count", "2");
    expect(screen.queryByRole("region", { name: "現在の一覧を絞り込む" }))
      .not.toBeInTheDocument();
    expect(screen.queryByLabelText("一覧の絞り込み")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "検索ペインを表示" })).toBeInTheDocument();
  });

  it("FT-B05-002 keeps mixed file and folder result kinds visible", async () => {
    const results: CatalogEntry[] = [
      { relativePath: "Series" as never, kind: "folder" },
      { relativePath: "Series/Volume.cbz" as never, kind: "archive", archiveKind: "cbz" },
      { relativePath: "Series/cover.png" as never, kind: "page" },
    ];
    searchMock.mockResolvedValueOnce(searchResponse(results));
    await registerTestLibrary([testEntry("root.cbz")]);
    openSearchPane();

    fireEvent.change(await screen.findByLabelText("名前検索"), {
      target: { value: "series" },
    });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));

    const region = await screen.findByRole("region", { name: "名前検索結果" });
    expect(region).toHaveAttribute("data-search-result-count", "3");
    expect(region).toHaveTextContent("フォルダ");
    expect(region).toHaveTextContent("CBZ");
    expect(region).toHaveTextContent("画像");
    expect(region.querySelector('[data-search-result-kind="folder"]')).toBeInTheDocument();
    expect(region.querySelector('[data-search-result-kind="archive"]')).toBeInTheDocument();
  });

  it("FT-B05-003 returns a result to its parent path and restores selection", async () => {
    const result: CatalogEntry = {
      relativePath: "Series/Volume.cbz" as never,
      kind: "archive",
      archiveKind: "cbz",
    };
    searchMock.mockResolvedValueOnce(searchResponse([result]));
    await registerTestLibrary([testEntry("root.cbz")]);
    openSearchPane();
    listMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "parent-list" as never,
      generation: 2 as never,
      data: [result],
    });

    fireEvent.change(await screen.findByLabelText("名前検索"), {
      target: { value: "volume" },
    });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Series\/Volume\.cbz/ }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Series");
      expect(screen.getByText("選択: Series/Volume.cbz")).toBeInTheDocument();
    });
    expect(listMock).toHaveBeenLastCalledWith("Series", expect.any(Number));
    expect(screen.getByRole("grid")).toHaveAttribute("data-entry-count", "1");
  });

  it("FT-B05-004 exposes empty and error states and clears back to the catalog", async () => {
    let resolveStaleSearch:
      | ((value: Awaited<ReturnType<typeof searchLibrary>>) => void)
      | undefined;
    searchMock
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValueOnce({
        status: "error",
        requestId: "search-error" as never,
        generation: 2 as never,
        error: {
          code: "ACCESS_DENIED",
          message: "internal detail must stay hidden",
          retryable: true,
        },
      })
      .mockImplementationOnce(
        () =>
          new Promise<Awaited<ReturnType<typeof searchLibrary>>>((resolve) => {
            resolveStaleSearch = resolve;
          }),
      );
    await registerTestLibrary([testEntry("root.cbz")]);
    openSearchPane();

    const input = await screen.findByLabelText("名前検索");
    fireEvent.change(input, { target: { value: "missing" } });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));
    expect(await screen.findByText("検索結果はありません。"))
      .toHaveAttribute("role", "status");

    fireEvent.change(input, { target: { value: "denied" } });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("アクセスできません");
    expect(alert).not.toHaveTextContent("internal detail");

    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    expect(screen.getByRole("grid", { name: "現在のフォルダの項目" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "名前検索結果" })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "stale" } });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));
    await waitFor(() => expect(searchMock).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: "検索結果をクリア" }));
    expect(input).toHaveValue("");
    expect(screen.getByRole("grid", { name: "現在のフォルダの項目" })).toBeInTheDocument();
    expect(resolveStaleSearch).toBeDefined();
    await act(async () => {
      resolveStaleSearch!(searchResponse([testEntry("stale-result.cbz")]));
    });
    expect(screen.queryByText("stale-result.cbz")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "名前検索結果" })).not.toBeInTheDocument();
  });

  it("FT-B05-005 replaces results on a fresh search request after a rescan", async () => {
    const oldResult: CatalogEntry = {
      relativePath: "Old/Volume.cbz" as never,
      kind: "archive",
      archiveKind: "cbz",
    };
    const newResult: CatalogEntry = {
      relativePath: "New/Volume.cbz" as never,
      kind: "archive",
      archiveKind: "cbz",
    };
    searchMock
      .mockResolvedValueOnce(searchResponse([oldResult]))
      .mockResolvedValueOnce(searchResponse([newResult]));
    await registerTestLibrary([testEntry("root.cbz")]);
    openSearchPane();

    const input = await screen.findByLabelText("名前検索");
    fireEvent.change(input, { target: { value: "volume" } });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));
    expect(await screen.findByText("Old/Volume.cbz")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "検索" }));
    expect(await screen.findByText("New/Volume.cbz")).toBeInTheDocument();
    expect(screen.queryByText("Old/Volume.cbz")).not.toBeInTheDocument();
    expect(searchMock).toHaveBeenCalledTimes(2);
    expect(searchMock.mock.calls[1][1]).toBeGreaterThan(searchMock.mock.calls[0][1]);
  });

  it("FT-B08-001 connects static WebP folder/archive viewer media and recovers past a corrupt page", async () => {
    const webpFormat: ImageFormat = "webp";
    const folder: CatalogEntry = { relativePath: "webp-folder" as never, kind: "comicFolder" };
    const archive = testEntry("webp-book.cbz");
    const session = (itemKey: string, pages: string[]) => ({
      status: "ok" as const,
      requestId: `open-${itemKey}` as never,
      generation: 1 as never,
      data: {
        itemKey,
        displayName: itemKey,
        pages: pages.map((relativePath, index) => ({
          id: `${itemKey}-${index}` as never,
          relativePath: relativePath as never,
          mediaUri: "",
          format: webpFormat,
        })),
        startIndex: 0,
      },
    });
    openMock
      .mockResolvedValueOnce(session("webp-folder", [
        "webp-folder/1-lossy.webp",
        "webp-folder/2-corrupt.webp",
        "webp-folder/3-alpha.webp",
      ]))
      .mockResolvedValueOnce(session("webp-book.cbz", ["1-lossless.webp"]));
    loadPageMock.mockImplementation(async (viewer, index, generation) => {
      const page = viewer.pages[index];
      if (page.relativePath === "webp-folder/2-corrupt.webp") {
        return {
          status: "error" as const,
          requestId: "webp-corrupt" as never,
          generation: generation as never,
          error: { code: "CORRUPT_IMAGE", message: "corrupt WebP", retryable: false },
        };
      }
      return {
        status: "ok" as const,
        requestId: `webp-${page.relativePath}` as never,
        generation: generation as never,
        data: { pageId: page.id, mediaUri: `comic://localhost/${page.id}` },
      };
    });

    await registerTestLibrary([folder, archive]);
    const grid = await screen.findByRole("grid", { name: "現在のフォルダの項目" });
    const folderButton = within(grid)
      .getAllByRole("button")
      .find((button) => button.getAttribute("data-relative-path") === "webp-folder");
    expect(folderButton).toBeDefined();
    listMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "list-webp-folder" as never,
      generation: 3 as never,
      data: [{
        relativePath: "webp-folder/1-lossy.webp" as never,
        kind: "page",
      }],
    });
    fireEvent.keyDown(folderButton!, { key: "Enter" });
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith(
      "webp-folder",
      expect.any(Number),
    ));
    const folderGrid = await screen.findByRole("grid", { name: "現在のフォルダの項目" });
    const imageButton = within(folderGrid)
      .getAllByRole("button")
      .find((button) =>
        button.getAttribute("data-relative-path") === "webp-folder/1-lossy.webp"
      );
    expect(imageButton).toBeDefined();
    fireEvent.keyDown(imageButton!, { key: "Enter" });
    await screen.findByLabelText("webp-folder ビューワ");
    expect(await screen.findByAltText("webp-folder 1ページ"))
      .toHaveAttribute("src", "comic://localhost/webp-folder-0");

    fireEvent.keyDown(window, { key: "PageDown" });
    const corrupt = await screen.findByRole("alert");
    expect(corrupt).toHaveTextContent("webp-folder/2-corrupt.webp");
    markViewerPrefetchReady();
    fireEvent.click(within(corrupt).getByRole("button", { name: "次ページ" }));
    expect(await screen.findByAltText("webp-folder 3ページ"))
      .toHaveAttribute("src", "comic://localhost/webp-folder-2");

    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    listMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "list-root-after-webp" as never,
      generation: 4 as never,
      data: [folder, archive],
    });
    await screen.findByRole("grid", { name: "現在のフォルダの項目" });
    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    await openTestComic("webp-book.cbz");
    expect(await screen.findByAltText("webp-book.cbz 1ページ"))
      .toHaveAttribute("src", "comic://localhost/webp-book.cbz-0");
    expect(openMock).toHaveBeenNthCalledWith(
      1,
      "webp-folder/1-lossy.webp",
      expect.any(Number),
    );
    expect(openMock).toHaveBeenNthCalledWith(2, "webp-book.cbz", expect.any(Number));
  });

  it("FT-B06-001 adds and removes one favorite idempotently without duplicate UI rows", async () => {
    const folder: CatalogEntry = { relativePath: "Series" as never, kind: "folder" };
    const comic = testEntry("Series/01.cbz");
    const added = favoriteEntry("Series", { kind: "folder" });
    addFavoriteMock.mockResolvedValue(favoritesResponse([added]));
    removeFavoriteMock.mockResolvedValue(favoritesResponse([]));
    await registerTestLibrary([folder, comic]);

    const item = screen.getByRole("button", { name: /^Series、フォルダ/ });
    const cell = item.closest('[role="gridcell"]') as HTMLElement;
    fireEvent.click(within(cell).getByRole("button", { name: "お気に入りに追加" }));
    expect(addFavoriteMock).toHaveBeenCalledWith("Series", expect.any(Number));
    await waitFor(() =>
      expect(within(cell).getByRole("button", { name: "お気に入りから解除" })).toBeInTheDocument(),
    );

    fireEvent.click(within(cell).getByRole("button", { name: "お気に入りから解除" }));
    expect(removeFavoriteMock).toHaveBeenCalledWith(added.favoriteId, expect.any(Number));
    await waitFor(() =>
      expect(within(cell).getByRole("button", { name: "お気に入りに追加" })).toBeInTheDocument(),
    );

    addFavoriteMock.mockResolvedValue(favoritesResponse([added]));
    fireEvent.click(within(cell).getByRole("button", { name: "お気に入りに追加" }));
    await waitFor(() =>
      expect(within(cell).getAllByRole("button", { name: "お気に入りから解除" })).toHaveLength(1),
    );
    expect(addFavoriteMock).toHaveBeenCalledTimes(2);

    let resolveStaleFavorites:
      | ((value: Awaited<ReturnType<typeof listFavorites>>) => void)
      | undefined;
    listFavoritesMock.mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<typeof listFavorites>>>((resolve) => {
          resolveStaleFavorites = resolve;
        }),
    );
    chooseAppMenuItem("オプション", "お気に入り");
    const dialog = await screen.findByRole("dialog", { name: "お気に入り" });
    expect(within(dialog).getByRole("button", { name: "確認中…" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "解除" }));
    expect(await within(dialog).findByText("お気に入りはありません。")).toBeInTheDocument();
    await act(async () => {
      resolveStaleFavorites!(favoritesResponse([added]));
    });
    expect(within(dialog).getByText("お気に入りはありません。")).toBeInTheDocument();
  });

  it("FT-B06-002 opens quick-access folders and comics through their connected boundaries", async () => {
    const folder: CatalogEntry = { relativePath: "Series" as never, kind: "folder" };
    const comic = testEntry("Series/01.cbz");
    const quickFavorites = [
      favoriteEntry("Series", { kind: "folder" }),
      favoriteEntry("Series/01.cbz", { kind: "archive" }),
    ];
    listFavoritesMock.mockResolvedValue(favoritesResponse(quickFavorites));
    openMock.mockResolvedValueOnce(viewerResponse(comic.relativePath));
    await registerTestLibrary([folder, comic]);

    chooseAppMenuItem("オプション", "お気に入り");
    let dialog = await screen.findByRole("dialog", { name: "お気に入り" });
    fireEvent.click(within(dialog).getAllByRole("button", { name: "開く" })[0]);
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Series"));
    expect(listMock).toHaveBeenLastCalledWith("Series", expect.any(Number));

    chooseAppMenuItem("オプション", "お気に入り");
    dialog = await screen.findByRole("dialog", { name: "お気に入り" });
    fireEvent.click(within(dialog).getAllByRole("button", { name: "開く" })[1]);
    expect(await screen.findByLabelText("Series/01.cbz ビューワ")).toBeInTheDocument();
    expect(openMock).toHaveBeenCalledWith("Series/01.cbz", expect.any(Number));
  });

  it("FT-B06-003 restores favorites from the local API each time quick access is reopened", async () => {
    const favorite = favoriteEntry("Series", { kind: "folder" });
    listFavoritesMock.mockResolvedValue(favoritesResponse([favorite]));
    await registerTestLibrary([{ relativePath: "Series" as never, kind: "folder" }]);

    chooseAppMenuItem("オプション", "お気に入り");
    const firstDialog = await screen.findByRole("dialog", { name: "お気に入り" });
    expect(within(firstDialog).getByText("Series")).toBeInTheDocument();
    fireEvent.click(within(firstDialog).getByRole("button", { name: "閉じる" }));
    chooseAppMenuItem("オプション", "お気に入り");
    const secondDialog = await screen.findByRole("dialog", { name: "お気に入り" });
    expect(within(secondDialog).getByText("Series")).toBeInTheDocument();
    expect(listFavoritesMock).toHaveBeenCalledTimes(2);
  });

  it("FT-B06-004 displays missing and moved favorites safely and supports explicit re-resolution/removal", async () => {
    const moved = favoriteEntry("Old/01.cbz", {
      favoriteId: "favorite-moved",
      kind: "archive",
      resolvedPath: "New/01.cbz" as never,
      status: "moved",
    });
    const missing = favoriteEntry("Gone/01.cbz", {
      favoriteId: "favorite-missing",
      kind: "archive",
      resolvedPath: null,
      status: "missing",
    });
    listFavoritesMock.mockResolvedValue(favoritesResponse([moved, missing]));
    resolveFavoriteMock.mockResolvedValue(
      favoritesResponse([
        favoriteEntry("Old/01.cbz", {
          favoriteId: moved.favoriteId,
          kind: "archive",
          resolvedPath: "New/01.cbz" as never,
          status: "available",
        }),
        missing,
      ]),
    );
    removeFavoriteMock.mockResolvedValue(favoritesResponse([missing]));
    await registerTestLibrary([testEntry("root.cbz")]);

    chooseAppMenuItem("オプション", "お気に入り");
    const dialog = await screen.findByRole("dialog", { name: "お気に入り" });
    const movedRow = dialog.querySelector('[data-favorite-id="favorite-moved"]') as HTMLElement;
    const missingRow = dialog.querySelector('[data-favorite-id="favorite-missing"]') as HTMLElement;
    expect(within(movedRow).getByText("移動を検出")).toBeInTheDocument();
    expect(within(movedRow).getByText("現在: New/01.cbz")).toBeInTheDocument();
    expect(within(missingRow).getByText("見つかりません")).toBeInTheDocument();
    expect(within(missingRow).getByRole("button", { name: "開く" })).toBeDisabled();
    fireEvent.click(within(movedRow).getByRole("button", { name: "再解決" }));
    expect(resolveFavoriteMock).toHaveBeenCalledWith(
      moved.favoriteId,
      "New/01.cbz",
      expect.any(Number),
    );
    await waitFor(() => expect(within(movedRow).getByText("利用可能")).toBeInTheDocument());
    fireEvent.click(within(movedRow).getByRole("button", { name: "解除" }));
    expect(removeFavoriteMock).toHaveBeenCalledWith(moved.favoriteId, expect.any(Number));
    await waitFor(() => expect(dialog.querySelector('[data-favorite-id="favorite-moved"]')).toBeNull());
    expect(openMock).not.toHaveBeenCalled();
  });

  it("FT-B06-005 exposes favorite controls only for local folder/comic targets", async () => {
    const entries: CatalogEntry[] = [
      { relativePath: "folder" as never, kind: "folder" },
      testEntry("book.cbz"),
      { relativePath: "cover.png" as never, kind: "page" },
    ];
    await registerTestLibrary(entries);

    expect(screen.getAllByRole("button", { name: "お気に入りに追加" })).toHaveLength(2);
    expect(addFavoriteMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "お気に入りに追加" })[0]);
    expect(addFavoriteMock).toHaveBeenCalledWith("book.cbz", expect.any(Number));
    expect(addFavoriteMock.mock.calls[0][0]).not.toMatch(/^[A-Za-z]:[\\/]/);
  });

  it("FT-B14-001 opens a catalog image as a one-page viewer item", async () => {
    const image: CatalogEntry = { relativePath: "cover.jpg" as never, kind: "page" };
    openMock.mockResolvedValueOnce(viewerResponse(image.relativePath));
    await registerTestLibrary([image]);

    const imageButton = screen.getByRole("button", { name: /^cover\.jpg、画像/ });
    fireEvent.keyDown(imageButton, { key: "Enter" });

    await waitFor(
      () => expect(screen.getByLabelText("cover.jpg ビューワ")).toBeInTheDocument(),
      { timeout: 10_000 },
    );
    expect(openMock).toHaveBeenCalledWith("cover.jpg", expect.any(Number));
  }, 15_000);

  it("FT-B13-001 restores every surviving selection after F5 and drops only missing entries", async () => {
    const first = testEntry("01.cbz");
    const second = testEntry("02.cbz");
    const third = testEntry("03.cbz");
    await registerTestLibrary([first, second, third]);
    const firstButton = screen.getByRole("button", { name: /^01\.cbz/ });
    const secondButton = screen.getByRole("button", { name: /^02\.cbz/ });
    fireEvent.click(firstButton);
    fireEvent.click(secondButton, { ctrlKey: true });
    expect(screen.getByText("2件選択")).toBeInTheDocument();

    listMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "refresh" as never,
      generation: 3 as never,
      data: [second, third],
    });
    fireEvent.keyDown(window, { key: "F5" });

    await waitFor(() => expect(screen.getByText("1件選択")).toBeInTheDocument());
    expect(screen.getByRole("gridcell", { name: /02\.cbz/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: /^01\.cbz/ })).not.toBeInTheDocument();
  });

  it("REQ-LEY-P3-005 refreshes only current Rust watch events and preserves surviving selection", async () => {
    const first = testEntry("01.cbz");
    const second = testEntry("02.cbz");
    const added = testEntry("03.cbz");
    await registerTestLibrary([first, second]);
    await waitFor(() => expect(watchLibraryFolderMock).toHaveBeenCalledWith("", expect.any(Number)));
    await waitFor(() => expect(folderWatchHarness.handler).toBeDefined());
    const watchGeneration = watchLibraryFolderMock.mock.calls.at(-1)![1];
    fireEvent.click(screen.getByRole("button", { name: /^02\.cbz/ }));
    listMock.mockClear();

    act(() => folderWatchHarness.handler!({
      generation: watchGeneration - 1,
      libraryRoot: "C:\\",
      relativePath: "",
      status: "changed",
    }));
    act(() => folderWatchHarness.handler!({
      generation: watchGeneration,
      libraryRoot: "C:\\",
      relativePath: "Other",
      status: "changed",
    }));
    expect(listMock).not.toHaveBeenCalled();

    listMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "automatic-refresh" as never,
      generation: (watchGeneration + 1) as never,
      data: [second, added],
    });
    act(() => folderWatchHarness.handler!({
      generation: watchGeneration,
      libraryRoot: "C:\\",
      relativePath: "",
      status: "changed",
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^03\.cbz/ })).toBeInTheDocument());
    expect(screen.getByRole("gridcell", { name: /02\.cbz/ })).toHaveAttribute("aria-selected", "true");

    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByLabelText("profile現在フォルダーを自動更新"));
    const listenerCount = listenCatalogFolderChangesMock.mock.calls.length;
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));
    await waitFor(() => expect(stopLibraryFolderWatchMock).toHaveBeenCalled());
    await waitFor(() => expect(listenCatalogFolderChangesMock.mock.calls.length).toBeGreaterThan(listenerCount));
    listMock.mockClear();
    const latestGeneration = watchLibraryFolderMock.mock.calls.at(-1)![1];
    act(() => folderWatchHarness.handler!({
      generation: latestGeneration,
      libraryRoot: "C:\\",
      relativePath: "",
      status: "changed",
    }));
    expect(listMock).not.toHaveBeenCalled();
  });

  it("FT-B13-002 extends a keyboard range from the original anchor", async () => {
    await registerTestLibrary([
      testEntry("01.cbz"),
      testEntry("02.cbz"),
      testEntry("03.cbz"),
      testEntry("04.cbz"),
    ]);
    const first = screen.getByRole("button", { name: /^01\.cbz/ });
    fireEvent.click(first);
    fireEvent.keyDown(first, { key: "ArrowRight", shiftKey: true });
    const second = screen.getByRole("button", { name: /^02\.cbz/ });
    fireEvent.keyDown(second, { key: "ArrowRight", shiftKey: true });

    expect(screen.getByText("3件選択")).toBeInTheDocument();
    for (const name of ["01.cbz", "02.cbz", "03.cbz"]) {
      expect(screen.getByRole("gridcell", { name: new RegExp(name.replace(".", "\\.")) }))
        .toHaveAttribute("aria-selected", "true");
    }
  });

  it("FT-B16-002 reports CSV download setup failure without claiming success", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => {
        throw new Error("download blocked");
      },
    });
    try {
      await registerTestLibrary([testEntry("book.cbz")]);
      chooseAppMenuItem("ファイル", "CSVで出力");
      const dialog = await screen.findByRole("dialog", { name: "CSV出力設定" });
      fireEvent.click(within(dialog).getByRole("button", { name: "CSVを出力" }));

      expect(await within(dialog).findByText("CSVを出力できませんでした。保存機能を確認してください。"))
        .toBeInTheDocument();
      expect(screen.queryByText(/件をCSVへ出力しました/)).not.toBeInTheDocument();
    } finally {
      if (descriptor === undefined) delete (URL as { createObjectURL?: unknown }).createObjectURL;
      else Object.defineProperty(URL, "createObjectURL", descriptor);
    }
  });

  it("FT-B14-002 discards an in-flight open when the selected drive changes", async () => {
    let resolveOpen!: (value: ReturnType<typeof viewerResponse>) => void;
    openMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOpen = resolve;
    }));
    await registerTestLibrary([testEntry("old.cbz")]);
    fireEvent.keyDown(screen.getByRole("button", { name: /^old\.cbz/ }), { key: "Enter" });

    registerMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "register-new-root" as never,
      generation: 4 as never,
      data: { absolutePath: "D:\\" },
    });
    listMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "list-new-root" as never,
      generation: 5 as never,
      data: [testEntry("new.cbz")],
    });
    fireEvent.change(screen.getByLabelText("アドレス"), {
      target: { value: "D:\\New Comics" },
    });
    fireEvent.submit(screen.getByLabelText("アドレス").closest("form")!);
    await screen.findByRole("button", { name: /^new\.cbz/ });

    await act(async () => resolveOpen(viewerResponse("old.cbz")));
    expect(screen.queryByLabelText("old.cbz ビューワ")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^new\.cbz/ })).toBeInTheDocument();
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

  it("FT-B19-001 keeps integrated settings as a draft until one atomic Apply", async () => {
    await registerTestLibrary([testEntry("book.cbz")]);
    chooseAppMenuItem("オプション", "統合設定…");
    let dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    expect(within(categories).getByRole("button", { name: /^一覧表示/ }))
      .toHaveAttribute("aria-current", "page");
    fireEvent.click(within(categories).getByRole("button", { name: /^操作/ }));
    expect(within(dialog).queryByLabelText("doubleClickジェスチャー"))
      .not.toBeInTheDocument();
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
    fireEvent.keyDown(within(dialog).getByLabelText("次ページショートカット"), {
      key: "j",
      ctrlKey: true,
    });
    fireEvent.change(within(dialog).getByLabelText("middleClickジェスチャー"), {
      target: { value: "toggleDirection" },
    });
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

    chooseAppMenuItem("オプション", "統合設定…");
    dialog = screen.getByRole("dialog", { name: "統合設定" });
    const reopenedCategories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    fireEvent.change(within(dialog).getByLabelText("profile一覧形式"), {
      target: { value: "reference_tile" },
    });
    fireEvent.change(within(dialog).getByRole("spinbutton", {
      name: "profile情報カードのサイズ（px）",
    }), { target: { value: "176" } });
    fireEvent.change(within(dialog).getByRole("spinbutton", {
      name: "profileカードグリッドのサイズ（px）",
    }), { target: { value: "224" } });
    fireEvent.change(within(dialog).getByLabelText("profileフォルダーを開く規則"), {
      target: { value: "read" },
    });
    fireEvent.change(within(dialog).getByLabelText("profile画像を開く規則"), {
      target: { value: "none" },
    });
    fireEvent.change(within(dialog).getByLabelText("profile書庫・PDFを開く規則"), {
      target: { value: "none" },
    });
    fireEvent.change(within(dialog).getByLabelText("profile詳細リストの罫線"), {
      target: { value: "both" },
    });
    fireEvent.change(within(dialog).getByLabelText("profile詳細リストの行密度"), {
      target: { value: "compact" },
    });
    fireEvent.click(within(dialog).getByLabelText("profile詳細リストに種別を表示"));
    fireEvent.click(within(dialog).getByLabelText("profile詳細リストにサイズを表示"));
    fireEvent.click(within(dialog).getByLabelText("profile詳細リストに更新日時を表示"));
    fireEvent.click(within(reopenedCategories).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profileフォルダツリー"));
    fireEvent.click(within(reopenedCategories).getByRole("button", { name: /^ビューワ/ }));
    fireEvent.change(within(dialog).getByLabelText("profile閲覧モード"), {
      target: { value: "auto" },
    });
    fireEvent.change(within(dialog).getByLabelText("profile見開き縦長判定（%）"), {
      target: { value: "80" },
    });
    fireEvent.change(within(dialog).getByLabelText("profile自動見開き画面幅判定（%）"), {
      target: { value: "160" },
    });
    fireEvent.click(within(dialog).getByLabelText("profile先頭ページを単独表示"));
    fireEvent.change(within(dialog).getByLabelText("profile見開き組合せ開始"), {
      target: { value: "even" },
    });
    fireEvent.click(within(dialog).getByLabelText("profile小画像のフィット拡大"));
    fireEvent.change(within(dialog).getByLabelText("profile見開きフィット基準"), {
      target: { value: "page" },
    });
    fireEvent.click(within(dialog).getByLabelText("profile余白をフィット計算に含める"));
    fireEvent.change(within(dialog).getByLabelText("profileルーペサイズ（px）"), {
      target: { value: "240" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileルーペ倍率（%）"), {
      target: { value: "350" },
    });
    fireEvent.change(within(dialog).getByLabelText("profile進行方向先読みページ数"), {
      target: { value: "3" },
    });
    fireEvent.change(within(dialog).getByLabelText("profile戻り方向先読みページ数"), {
      target: { value: "2" },
    });
    fireEvent.change(within(dialog).getByLabelText("profile先読みメモリ上限（MiB）"), {
      target: { value: "192" },
    });
    fireEvent.change(
      within(dialog).getByRole("spinbutton", { name: "profile任意倍率（%）" }),
      { target: { value: "175" } },
    );
    fireEvent.click(within(reopenedCategories).getByRole("button", { name: /^操作/ }));
    fireEvent.change(within(dialog).getByLabelText("profileページ内スクロール量（%）"), {
      target: { value: "75" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileキーリピート加速（%）"), {
      target: { value: "220" },
    });
    fireEvent.click(within(dialog).getByLabelText("profileキーの連続動作"));
    fireEvent.change(within(dialog).getByLabelText("profile連続スクロールのホイール速度（%）"), {
      target: { value: "140" },
    });
    fireEvent.click(within(dialog).getByLabelText("profileページ内スクロールアニメーション"));
    fireEvent.change(within(dialog).getByLabelText("profileページ内の走査順"), {
      target: { value: "z" },
    });
    fireEvent.change(within(dialog).getByLabelText("middleClickジェスチャー"), {
      target: { value: "toggleDirection" },
    });
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
          cardGrid: 224,
          referenceTile: 176,
        },
        treeVisible: false,
        folderOpenRule: "read",
        imageOpenRule: "none",
        archiveOpenRule: "none",
        detailGridLines: "both",
        detailRowDensity: "compact",
        detailShowKind: false,
        detailShowSize: false,
        detailShowModified: false,
        viewMode: "auto",
        spreadPortraitMaxAspectPercent: 80,
        autoSpreadMinViewportAspectPercent: 160,
        spreadFirstPageSingle: true,
        spreadPairing: "even",
        fitAllowUpscale: true,
        fitBasis: "page",
        fitIncludePageMargin: false,
        loupeSize: 240,
        loupeZoom: 3.5,
        prefetchAhead: 3,
        prefetchBehind: 2,
        prefetchMemoryMiB: 192,
        scale: 1.75,
        scrollStepPercent: 75,
        keyScrollAccelerationPercent: 220,
        keyScrollContinuous: false,
        wheelScrollFactor: 1.4,
        smoothScroll: false,
        pageScanMode: "z",
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
  }, 60_000);

  it("REQ-LEY-P1-017 and P1-019 persist hidden visibility and a safe catalog palette", async () => {
    await registerTestLibrary([testEntry("book.cbz")]);
    listMock.mockClear();
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByLabelText("profile隠し項目を表示"));
    fireEvent.change(within(dialog).getByLabelText("profile一覧配色"), {
      target: { value: "midnight" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ showHiddenFiles: true, catalogPalette: "midnight" }),
      expect.any(Number),
    );
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(screen.getByRole("grid")).toHaveAttribute("data-catalog-palette", "midnight");
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

  it("FR-B22 connects context-menu rename and recycle operations to the backend", async () => {
    const original = testEntry("books/old.cbz");
    const renamed = testEntry("books/new.cbz");
    await registerTestLibrary([original]);
    const item = screen.getByRole("button", { name: /old\.cbz/ });

    fireEvent.contextMenu(item, { clientX: 100, clientY: 80 });
    const menu = await screen.findByRole("menu", { name: "項目の操作" });
    await waitFor(() => expect(getFileClipboardStatusMock).toHaveBeenCalled());
    fireEvent.click(within(menu).getByRole("menuitem", { name: "名前の変更" }));

    const renameDialog = screen.getByRole("dialog", { name: "名前の変更" });
    let renameInput = within(renameDialog).getByLabelText("ファイル名") as HTMLInputElement;
    expect(renameInput.selectionStart).toBe(0);
    expect(renameInput.selectionEnd).toBe(3);
    fireEvent.click(within(renameDialog).getByRole("checkbox", { name: "拡張子も選択" }));
    await waitFor(() => expect(saveRenamePreferencesMock).toHaveBeenCalledWith(
      expect.objectContaining({ selectExtension: true }), expect.any(Number),
    ));
    renameInput = within(renameDialog).getByLabelText("ファイル名") as HTMLInputElement;
    expect(renameInput.selectionEnd).toBe("old.cbz".length);
    fireEvent.change(renameInput, {
      target: { value: "new.cbz" },
    });
    listMock.mockResolvedValue({
      status: "ok",
      requestId: "list-renamed" as never,
      generation: 2 as never,
      data: [renamed],
    });
    fireEvent.click(within(renameDialog).getByRole("button", { name: "実行" }));
    await waitFor(() => expect(renameFileItemMock).toHaveBeenCalledWith(
      "books/old.cbz",
      "new.cbz",
      expect.any(Number),
    ));
    expect(await screen.findByRole("button", { name: /new\.cbz/ })).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole("button", { name: /new\.cbz/ }), {
      clientX: 100,
      clientY: 80,
    });
    fireEvent.click(within(screen.getByRole("menu", { name: "項目の操作" }))
      .getByRole("menuitem", { name: /削除.*Del/ }));
    const deleteDialog = screen.getByRole("alertdialog", { name: "ごみ箱へ移動" });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "ごみ箱へ移動" }));
    await waitFor(() => expect(deleteFileItemsMock).toHaveBeenCalledWith(
      ["books/new.cbz"],
      false,
      expect.any(Number),
    ));
  });

  it("REQ-LEY-P4-003 exposes the Rust-owned latest operation in the Edit menu", async () => {
    getFileUndoStatusMock.mockResolvedValue({
      status: "ok",
      requestId: "file-undo-available" as never,
      generation: 1 as never,
      data: { available: true, operation: "rename", affected: 2 },
    });
    await registerTestLibrary([testEntry("books/renamed.cbz")]);
    await waitFor(() => expect(getFileUndoStatusMock).toHaveBeenCalled());

    const editMenu = openAppMenu("編集");
    const undo = within(editMenu).getByRole("menuitem", {
      name: "元に戻す: 名前変更 (2件)",
    });
    expect(undo).toHaveAttribute("aria-disabled", "false");
    expect(undo).toHaveAttribute("aria-keyshortcuts", "Control+Z");
    fireEvent.click(undo);

    await waitFor(() => expect(undoLastFileOperationMock).toHaveBeenCalledOnce());
    expect(await screen.findByText("1件のファイル操作を元に戻しました。")).toBeInTheDocument();
    await waitFor(() => expect(getFileUndoStatusMock.mock.calls.length).toBeGreaterThan(1));
  });

  it("REQ-LEY-P4-003 limits Ctrl+Z to catalog focus and protects editing, tree, and Viewer", async () => {
    getFileUndoStatusMock.mockResolvedValue({
      status: "ok",
      requestId: "file-undo-available" as never,
      generation: 1 as never,
      data: { available: true, operation: "copy", affected: 1 },
    });
    const entry = testEntry("books/copy.cbz");
    await registerTestLibrary([entry]);
    await waitFor(() => expect(getFileUndoStatusMock).toHaveBeenCalled());
    const editMenu = openAppMenu("編集");
    await waitFor(() => expect(within(editMenu).getByRole("menuitem", {
      name: "元に戻す: コピー (1件)",
    })).toHaveAttribute("aria-disabled", "false"));
    fireEvent.click(screen.getByRole("menuitem", { name: "編集" }));

    fireEvent.keyDown(screen.getByLabelText("アドレス"), { key: "z", ctrlKey: true });
    fireEvent.keyDown(screen.getByRole("tree"), { key: "z", ctrlKey: true });
    expect(undoLastFileOperationMock).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => expect(undoLastFileOperationMock).toHaveBeenCalledOnce());

    openMock.mockResolvedValue(viewerResponse(entry.relativePath));
    fireEvent.doubleClick(screen.getByRole("button", { name: /copy\.cbz/ }));
    await waitFor(() => expect(openMock).toHaveBeenCalled());
    expect(await screen.findByLabelText("books/copy.cbz ビューワ")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(undoLastFileOperationMock).toHaveBeenCalledOnce();
  });

  it("pastes into the catalog folder that was right-clicked", async () => {
    const target: CatalogEntry = {
      relativePath: "Target" as never,
      kind: "folder",
    };
    await registerTestLibrary([target]);

    fireEvent.contextMenu(screen.getByRole("button", { name: /^Target、フォルダ/ }), {
      clientX: 100,
      clientY: 80,
    });
    const paste = within(screen.getByRole("menu", { name: "項目の操作" }))
      .getByRole("menuitem", { name: /貼り付け/ });
    await waitFor(() => expect(paste).toHaveAttribute("aria-disabled", "false"));
    fireEvent.click(paste);

    await waitFor(() => expect(pasteFileItemsMock).toHaveBeenCalledWith(
      "Target",
      expect.any(Number),
    ));
  });

  it("REQ-LEY-P3-010 moves by default, copies with Ctrl, and starts Alt native drag", async () => {
    const source = testEntry("book.cbz");
    const target: CatalogEntry = {
      relativePath: "Target" as never,
      kind: "folder",
    };
    await registerTestLibrary([source, target]);
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
    };

    fireEvent.dragStart(screen.getByRole("button", { name: /^book\.cbz/ }), { dataTransfer });
    const targetButton = screen.getByRole("button", { name: /^Target、フォルダ/ });
    fireEvent.dragOver(targetButton, { dataTransfer });
    fireEvent.drop(targetButton, { dataTransfer });

    await waitFor(() => expect(moveFileItemsToDestinationMock).toHaveBeenCalledWith(
      ["book.cbz"],
      "Target",
      expect.any(Number),
    ));
    await screen.findByText(/1件を「Target」へ移動しました/);

    fireEvent.dragStart(screen.getByRole("button", { name: /^book\.cbz/ }), { dataTransfer });
    dataTransfer.dropEffect = "copy";
    fireEvent.drop(targetButton, { dataTransfer, ctrlKey: true });
    await waitFor(() => expect(copyFileItemsToDestinationMock).toHaveBeenCalledWith(
      ["book.cbz"],
      "Target",
      expect.any(Number),
    ));
    await screen.findByText(/1件を「Target」へコピーしました/);

    const altDrag = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperties(altDrag, {
      dataTransfer: { value: dataTransfer },
      altKey: { value: true },
    });
    fireEvent(screen.getByRole("button", { name: /^book\.cbz/ }), altDrag);
    await waitFor(() => expect(startNativeFileDragMock).toHaveBeenCalledWith(
      ["book.cbz"],
      expect.any(Number),
    ));
  });

  it("REQ-LEY-P3-010 previews and confirms an Explorer drop before Rust copies it", async () => {
    await registerTestLibrary([{ relativePath: "Target" as never, kind: "folder" }]);
    await waitFor(() => expect(nativeFileDropHarness.handler).toBeDefined());

    await act(async () => nativeFileDropHarness.handler?.({
      type: "drop",
      paths: ["D:\\Incoming\\outside.cbz"],
      position: { x: 120, y: 80 },
    }));

    await waitFor(() => expect(previewNativeFileDropMock).toHaveBeenCalledWith(
      ["D:\\Incoming\\outside.cbz"],
      "Target",
      expect.any(Number),
    ));
    const dialog = await screen.findByRole("alertdialog", { name: "外部ファイルをコピー" });
    expect(within(dialog).getByText("outside.cbz")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "コピー" }));
    await waitFor(() => expect(copyNativeFileDropMock).toHaveBeenCalledWith(
      ["D:\\Incoming\\outside.cbz"],
      "Target",
      expect.any(Number),
    ));
  });

  it("REQ-LEY-P3-010 cancels or invalidates an Explorer drop without copying", async () => {
    await registerTestLibrary([{ relativePath: "Target" as never, kind: "folder" }]);
    await waitFor(() => expect(nativeFileDropHarness.handler).toBeDefined());
    await act(async () => nativeFileDropHarness.handler?.({
      type: "drop",
      paths: ["D:\\Incoming\\outside.cbz"],
      position: { x: 120, y: 80 },
    }));
    let dialog = await screen.findByRole("alertdialog", { name: "外部ファイルをコピー" });
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(copyNativeFileDropMock).not.toHaveBeenCalled();

    await act(async () => nativeFileDropHarness.handler?.({
      type: "drop",
      paths: ["D:\\Incoming\\outside.cbz"],
      position: { x: 120, y: 80 },
    }));
    dialog = await screen.findByRole("alertdialog", { name: "外部ファイルをコピー" });
    pickerMock.mockResolvedValue({
      status: "ok",
      requestId: "picker-new-root" as never,
      generation: 2 as never,
      data: { absolutePath: "E:\\Incoming" },
    });
    registerMock.mockResolvedValue({
      status: "ok",
      requestId: "register-new-root" as never,
      generation: 2 as never,
      data: { absolutePath: "E:\\" },
    });
    chooseAppMenuItem("ファイル", "フォルダーを開く…");
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("E:\\Incoming"));
    fireEvent.click(within(dialog).getByRole("button", { name: "コピー" }));
    await waitFor(() => expect(screen.getByText(/ライブラリが変わったため/)).toBeInTheDocument());
    expect(copyNativeFileDropMock).not.toHaveBeenCalled();
  });

  it("moves a dragged tree folder into another tree folder", async () => {
    treeMock.mockImplementation(async (path) => ({
      status: "ok",
      requestId: `tree-${path || "root"}` as never,
      generation: 1 as never,
      data: path === ""
        ? [
            { relativePath: "Source" as never, kind: "folder" as const },
            { relativePath: "Target" as never, kind: "folder" as const },
          ]
        : [],
    }));
    await registerTestLibrary([]);
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
    };

    fireEvent.dragStart(await screen.findByRole("treeitem", { name: "Source" }), { dataTransfer });
    const target = screen.getByRole("treeitem", { name: "Target" });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(moveFileItemsToDestinationMock).toHaveBeenCalledWith(
      ["Source"],
      "Target",
      expect.any(Number),
    ));
  });

  it("deletes a tree folder through confirmation and returns from a deleted current folder", async () => {
    treeMock.mockImplementation(async (path) => ({
      status: "ok",
      requestId: `tree-${path || "root"}` as never,
      generation: 1 as never,
      data: path === ""
        ? [{ relativePath: "Target" as never, kind: "folder" as const }]
        : [],
    }));
    await registerTestLibrary([]);
    const target = await screen.findByRole("treeitem", { name: "Target" });
    fireEvent.click(target);
    await waitFor(() => expect(listMock).toHaveBeenCalledWith("Target", expect.any(Number)));

    fireEvent.contextMenu(target, { clientX: 80, clientY: 60 });
    fireEvent.click(within(screen.getByRole("menu", { name: "フォルダツリーの操作" }))
      .getByRole("menuitem", { name: /削除.*Del/ }));
    const dialog = screen.getByRole("alertdialog", { name: "ごみ箱へ移動" });
    fireEvent.click(within(dialog).getByRole("button", { name: "ごみ箱へ移動" }));

    await waitFor(() => expect(deleteFileItemsMock).toHaveBeenCalledWith(
      ["Target"],
      false,
      expect.any(Number),
    ));
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith("", expect.any(Number)));
  });

  it("connects folder-tree copy and paste to the Windows file clipboard", async () => {
    treeMock.mockImplementation(async (path) => ({
      status: "ok",
      requestId: `tree-${path || "root"}` as never,
      generation: 1 as never,
      data: path === ""
        ? [{ relativePath: "Target" as never, kind: "folder" as const }]
        : [],
    }));
    await registerTestLibrary([]);
    const target = await screen.findByRole("treeitem", { name: "Target" });

    fireEvent.contextMenu(target, { clientX: 80, clientY: 60 });
    fireEvent.click(within(screen.getByRole("menu", { name: "フォルダツリーの操作" }))
      .getByRole("menuitem", { name: /コピー.*Ctrl\+C/ }));
    await waitFor(() => expect(setFileClipboardMock).toHaveBeenCalledWith(
      ["Target"],
      false,
      expect.any(Number),
    ));
    expect(await screen.findByText(/Windows Explorerにも貼り付けできます/))
      .toBeInTheDocument();

    fireEvent.contextMenu(target, { clientX: 80, clientY: 60 });
    fireEvent.click(within(screen.getByRole("menu", { name: "フォルダツリーの操作" }))
      .getByRole("menuitem", { name: /貼り付け/ }));
    await waitFor(() => expect(pasteFileItemsMock).toHaveBeenCalledWith(
      "Target",
      expect.any(Number),
    ));
  });

  it("switches the safe drive boundary before pasting at a tree drive root", async () => {
    await registerTestLibrary([]);
    registerMock.mockImplementation(async (absolutePath) => ({
      status: "ok",
      requestId: `register-${absolutePath}` as never,
      generation: 1 as never,
      data: { absolutePath },
    }));

    const drive = await screen.findByRole("treeitem", { name: /ボリューム \(E:\)/ });
    fireEvent.contextMenu(drive, { clientX: 80, clientY: 60 });
    const menu = screen.getByRole("menu", { name: "フォルダツリーの操作" });
    expect(within(menu).getByRole("menuitem", { name: /切り取り/ }))
      .toHaveAttribute("aria-disabled", "true");
    const paste = within(menu).getByRole("menuitem", { name: /貼り付け/ });
    await waitFor(() => expect(paste).toHaveAttribute("aria-disabled", "false"));
    fireEvent.click(paste);

    await waitFor(() => expect(registerMock).toHaveBeenLastCalledWith(
      "E:\\",
      expect.any(Number),
    ));
    await waitFor(() => expect(pasteFileItemsMock).toHaveBeenCalledWith(
      "",
      expect.any(Number),
    ));
  });

});
