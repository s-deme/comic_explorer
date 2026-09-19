import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { App } from "../App";
import {
  addFavorite,
  cancelRecursiveThumbnailGeneration,
  clearReadingHistory,
  copyFileItemsToDestination,
  copyFileItemsToFolder,
  copyNativeFileDrop,
  createFileFolder,
  deleteCsvExportPreset,
  deleteFileItems,
  deleteNamedSettingsProfile,
  deletePageBookmark,
  diagnoseLibrary,
  executeNamedSettingsProfileSwitch,
  exportCatalogCsv,
  generateRecursiveThumbnails,
  getCatalogSettings,
  getFileClipboardStatus,
  getFileUndoStatus,
  getItemMetadata,
  getRenamePreferences,
  getThumbnail,
  getTrayStatus,
  listArchiveVirtualTree,
  listCsvExportPresets,
  listenCatalogFolderChanges,
  listenCliLaunchPending,
  listenRecursiveThumbnailProgress,
  listFavorites,
  listFolder,
  listNamedSettingsProfiles,
  listPageBookmarks,
  listReadingHistory,
  listShelves,
  listTreeChildren,
  listWindowsKnownFolders,
  loadPage,
  moveFileItemsToDestination,
  moveFileItemsToFolder,
  openComic,
  openFileItemDefault,
  openFileItemWith,
  pasteFileItems,
  pickLibraryFile,
  pickLibraryRoot,
  pickSearchSource,
  previewNamedSettingsProfileSwitch,
  previewNativeFileDrop,
  quitApplication,
  registerLibraryRoot,
  removeFavorite,
  renameFileItem,
  resolveCatalogActivation,
  resolveFavorite,
  restoreLibraryRoot,
  revealFileItem,
  saveCatalogSort,
  saveCatalogViewMode,
  saveCsvExportPreset,
  saveEndOfVolumePolicy,
  saveItemMemo,
  saveNamedSettingsProfile,
  savePageBookmark,
  saveReadingPosition,
  saveRenamePreferences,
  saveSettingsProfile,
  saveViewerSettings,
  searchLibrary,
  setFileClipboard,
  setItemRating,
  startNativeFileDrag,
  stopLibraryFolderWatch,
  storeMainWindowInTray,
  takeCliLaunchRequest,
  takeRecoveryNotice,
  undoLastFileOperation,
  watchLibraryFolder,
  type CatalogSettings,
  type FavoriteEntry,
  type ItemMetadata,
  type ReadingHistoryEntry,
} from "../features/library/client";
import type { FullscreenAdapter } from "../features/viewer/fullscreen";
import type { AlwaysOnTopAdapter, WindowThemeAdapter } from "../features/workspace/window";
import type { CatalogEntry } from "../types/domain";
import { DEFAULT_CATALOG_SETTINGS } from "./catalog-fixtures";
export { DEFAULT_CATALOG_SETTINGS } from "./catalog-fixtures";

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

vi.mock("../features/library/native-file-drop", () => ({
  listenNativeFileDrops: vi.fn(async (handler) => {
    nativeFileDropHarness.handler = handler;
    return vi.fn();
  }),
  nativeDropTargetAt: vi.fn(() => nativeFileDropHarness.target),
}));

vi.mock("../features/library/client", () => ({
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
  restoreLastFolder: vi.fn(async () => ({ status: "ok", data: null })),
  saveLastFolder: vi.fn(async () => ({ status: "ok", data: null })),
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

export function markViewerPrefetchReady(): void {
  document.querySelectorAll<HTMLImageElement>(".prefetch-page")
    .forEach((image) => fireEvent.load(image));
}

export const registerMock = vi.mocked(registerLibraryRoot);
export const pickerMock = vi.mocked(pickLibraryRoot);
export const searchSourcePickerMock = vi.mocked(pickSearchSource);
export const filePickerMock = vi.mocked(pickLibraryFile);
export const listMock = vi.mocked(listFolder);
export const listenCatalogFolderChangesMock = vi.mocked(listenCatalogFolderChanges);
export const watchLibraryFolderMock = vi.mocked(watchLibraryFolder);
export const stopLibraryFolderWatchMock = vi.mocked(stopLibraryFolderWatch);
export const treeMock = vi.mocked(listTreeChildren);
export const restoreMock = vi.mocked(restoreLibraryRoot);
export const takeCliLaunchRequestMock = vi.mocked(takeCliLaunchRequest);
export const listenCliLaunchPendingMock = vi.mocked(listenCliLaunchPending);
export const listShelvesMock = vi.mocked(listShelves);
export const listArchiveVirtualTreeMock = vi.mocked(listArchiveVirtualTree);
export const openMock = vi.mocked(openComic);
export const resolveCatalogActivationMock = vi.mocked(resolveCatalogActivation);
export const settingsMock = vi.mocked(getCatalogSettings);
export const metadataMock = vi.mocked(getItemMetadata);
export const thumbnailMock = vi.mocked(getThumbnail);
export const addFavoriteMock = vi.mocked(addFavorite);
export const listFavoritesMock = vi.mocked(listFavorites);
export const removeFavoriteMock = vi.mocked(removeFavorite);
export const resolveFavoriteMock = vi.mocked(resolveFavorite);
export const loadPageMock = vi.mocked(loadPage);
export const saveSortMock = vi.mocked(saveCatalogSort);
export const saveCatalogViewModeMock = vi.mocked(saveCatalogViewMode);
export const saveEndPolicyMock = vi.mocked(saveEndOfVolumePolicy);
export const saveMemoMock = vi.mocked(saveItemMemo);
export const saveReadingMock = vi.mocked(saveReadingPosition);
export const saveSettingsProfileMock = vi.mocked(saveSettingsProfile);
export const listNamedSettingsProfilesMock = vi.mocked(listNamedSettingsProfiles);
export const saveNamedSettingsProfileMock = vi.mocked(saveNamedSettingsProfile);
export const previewNamedSettingsProfileSwitchMock = vi.mocked(previewNamedSettingsProfileSwitch);
export const executeNamedSettingsProfileSwitchMock = vi.mocked(executeNamedSettingsProfileSwitch);
export const deleteNamedSettingsProfileMock = vi.mocked(deleteNamedSettingsProfile);
export const saveViewerMock = vi.mocked(saveViewerSettings);
export const getTrayStatusMock = vi.mocked(getTrayStatus);
export const storeMainWindowInTrayMock = vi.mocked(storeMainWindowInTray);
export const quitApplicationMock = vi.mocked(quitApplication);
export const setRatingMock = vi.mocked(setItemRating);
export const searchMock = vi.mocked(searchLibrary);
export const listCsvExportPresetsMock = vi.mocked(listCsvExportPresets);
export const saveCsvExportPresetMock = vi.mocked(saveCsvExportPreset);
export const deleteCsvExportPresetMock = vi.mocked(deleteCsvExportPreset);
export const exportCatalogCsvMock = vi.mocked(exportCatalogCsv);
export const recoveryNoticeMock = vi.mocked(takeRecoveryNotice);
export const historyMock = vi.mocked(listReadingHistory);
export const listPageBookmarksMock = vi.mocked(listPageBookmarks);
export const clearHistoryMock = vi.mocked(clearReadingHistory);
export const savePageBookmarkMock = vi.mocked(savePageBookmark);
export const deletePageBookmarkMock = vi.mocked(deletePageBookmark);
export const diagnoseMock = vi.mocked(diagnoseLibrary);
export const listenRecursiveThumbnailProgressMock = vi.mocked(listenRecursiveThumbnailProgress);
export const generateRecursiveThumbnailsMock = vi.mocked(generateRecursiveThumbnails);
export const cancelRecursiveThumbnailGenerationMock = vi.mocked(cancelRecursiveThumbnailGeneration);
export const renameFileItemMock = vi.mocked(renameFileItem);
export const getRenamePreferencesMock = vi.mocked(getRenamePreferences);
export const saveRenamePreferencesMock = vi.mocked(saveRenamePreferences);
export const createFileFolderMock = vi.mocked(createFileFolder);
export const copyFileItemsToFolderMock = vi.mocked(copyFileItemsToFolder);
export const moveFileItemsToFolderMock = vi.mocked(moveFileItemsToFolder);
export const moveFileItemsToDestinationMock = vi.mocked(moveFileItemsToDestination);
export const copyFileItemsToDestinationMock = vi.mocked(copyFileItemsToDestination);
export const previewNativeFileDropMock = vi.mocked(previewNativeFileDrop);
export const copyNativeFileDropMock = vi.mocked(copyNativeFileDrop);
export const startNativeFileDragMock = vi.mocked(startNativeFileDrag);
export const deleteFileItemsMock = vi.mocked(deleteFileItems);
export const setFileClipboardMock = vi.mocked(setFileClipboard);
export const getFileClipboardStatusMock = vi.mocked(getFileClipboardStatus);
export const getFileUndoStatusMock = vi.mocked(getFileUndoStatus);
export const undoLastFileOperationMock = vi.mocked(undoLastFileOperation);
export const pasteFileItemsMock = vi.mocked(pasteFileItems);
export const revealFileItemMock = vi.mocked(revealFileItem);
export const openFileItemDefaultMock = vi.mocked(openFileItemDefault);
export const openFileItemWithMock = vi.mocked(openFileItemWith);
export const knownFoldersMock = vi.mocked(listWindowsKnownFolders);

export function testSession(itemKey: string) {
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

export function viewerResponse(itemKey: string) {
  return {
    status: "ok" as const,
    requestId: `open-${itemKey}` as never,
    generation: 1 as never,
    data: testSession(itemKey),
  };
}

export function fileOperationResponse(operation: string, affected = 1) {
  return {
    status: "ok" as const,
    requestId: `file-${operation}` as never,
    generation: 1 as never,
    data: { operation: operation as never, affected },
  };
}

export function searchResponse(results: CatalogEntry[]) {
  return {
    status: "ok" as const,
    requestId: "search" as never,
    generation: 1 as never,
    data: results,
  };
}

export function favoriteEntry(
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

export function favoritesResponse(data: FavoriteEntry[]) {
  return {
    status: "ok" as const,
    requestId: "favorites" as never,
    generation: 1 as never,
    data,
  };
}

export function metadataResponse(
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

export function historyResponse(data: ReadingHistoryEntry[]) {
  return {
    status: "ok" as const,
    requestId: "history" as never,
    generation: 1 as never,
    data,
  };
}

export async function registerTestLibrary(
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
  const grid = await screen.findByRole("grid", { name: "現在のフォルダの項目" });
  await waitFor(() => expect(grid).toHaveAttribute("data-entry-count", String(entries.length)));
}

export async function openTestComic(relativePath: string) {
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

export function openAppMenu(name: "ファイル" | "編集" | "表示" | "オプション" | "ヘルプ") {
  fireEvent.click(screen.getByRole("menuitem", { name }));
  return screen.getByRole("menu", { name });
}

export function chooseAppMenuItem(
  menuName: "ファイル" | "編集" | "表示" | "オプション" | "ヘルプ",
  itemName: string | RegExp,
) {
  const menu = openAppMenu(menuName);
  fireEvent.click(within(menu).getByRole("menuitem", { name: itemName }));
}

export function chooseToolbarMenuItem(
  triggerName: "並べ替え条件" | "一覧表示形式",
  menuName: "並べ替え候補" | "一覧表示形式候補",
  itemName: string,
) {
  fireEvent.click(screen.getByRole("button", { name: triggerName }));
  const menu = screen.getByRole("menu", { name: menuName });
  fireEvent.click(within(menu).getByRole("menuitemradio", { name: itemName }));
}

export function openSearchPane() {
  fireEvent.click(screen.getByRole("button", { name: "検索ペインを表示" }));
  return screen.getByRole("complementary", { name: "検索ペイン" });
}

export function installAppTestHooks(settings: Partial<CatalogSettings> = {}) {
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
    Object.keys(localStorage)
      .filter((key) => key.startsWith("comic-explorer:last-folder:"))
      .forEach((key) => localStorage.removeItem(key));
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
      data: { ...DEFAULT_CATALOG_SETTINGS, ...settings },
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
      data: { ...DEFAULT_CATALOG_SETTINGS, ...settings },
    });
    saveEndPolicyMock.mockResolvedValue({
      status: "ok",
      requestId: "save-end-policy" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS, ...settings },
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
      data: { ...DEFAULT_CATALOG_SETTINGS, ...settings },
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

}

export { folderWatchHarness, recursiveThumbnailHarness, nativeFileDropHarness, cliLaunchHarness };
