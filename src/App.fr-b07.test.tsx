import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  getCatalogSettings,
  getItemMetadata,
  getThumbnail,
  loadPage,
  listTreeChildren,
  listFolder,
  listReadingHistory,
  openComic,
  registerLibraryRoot,
  restoreLibraryRoot,
  saveItemMemo,
  saveReadingPosition,
  setItemRating,
  takeRecoveryNotice,
  type CatalogSettings,
  type ItemMetadata,
  type ReadingHistoryEntry,
} from "./features/library/client";
import type { CatalogEntry } from "./types/domain";
import { DEFAULT_SHORTCUTS } from "./features/input/shortcuts";
import { DEFAULT_VIEWER_QUADRANT_BINDINGS } from "./features/input/viewer-quadrants";
import { DEFAULT_MOUSE_GESTURES } from "./features/settings/profile";
import { testArchiveEntry as testEntry } from "./test/catalog-fixtures";

function openLibraryMenuItem(name: "閲覧履歴") {
  fireEvent.click(screen.getByRole("menuitem", { name: "オプション" }));
  fireEvent.click(
    within(screen.getByRole("menu", { name: "オプション" })).getByRole("menuitem", {
      name,
    }),
  );
}

vi.mock("./features/library/client", () => ({
  // Keep every App/Viewer client binding mocked; only exercised bindings get handles below.
  registerLibraryRoot: vi.fn(),
  pickLibraryRoot: vi.fn(),
  listFolder: vi.fn(),
  listenCatalogFolderChanges: vi.fn(async () => () => undefined),
  listenRecursiveThumbnailProgress: vi.fn(async () => () => undefined),
  generateRecursiveThumbnails: vi.fn(async () => ({ status: "cancelled" })),
  cancelRecursiveThumbnailGeneration: vi.fn(async () => ({ status: "cancelled" })),
  watchLibraryFolder: vi.fn(async () => ({ status: "cancelled" })),
  stopLibraryFolderWatch: vi.fn(async () => ({ status: "cancelled" })),
  listTreeChildren: vi.fn(),
  listWindowsDrives: vi.fn(async () => ({
    status: "ok", requestId: "drives", generation: 1,
    data: [{ absolutePath: "C:\\", name: "ローカル ディスク (C:)" }],
  })),
  listWindowsKnownFolders: vi.fn(async () => ({
    status: "ok", requestId: "known-folders", generation: 1, data: [],
  })),
  restoreLibraryRoot: vi.fn(),
  takeCliLaunchRequest: vi.fn(async () => ({ status: "ok", data: null })),
  listenCliLaunchPending: vi.fn(async () => () => undefined),
  listShelves: vi.fn(async () => ({ status: "ok", data: { shelves: [], nodes: [], startupShelfId: null } })),
  listArchiveVirtualTree: vi.fn(async () => ({ status: "ok", data: { archiveRelativePath: "book.cbz", entries: [] } })),
  getArchiveThumbnail: vi.fn(async () => ({ status: "cancelled" })),
  copyArchivePageToClipboard: vi.fn(async () => ({ status: "cancelled" })),
  getFileUndoStatus: vi.fn(async () => ({ status: "ok", data: { available: false, operation: null, affected: 0 } })),
  undoLastFileOperation: vi.fn(),
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
  listNamedSettingsProfiles: vi.fn(async () => ({ status: "ok", data: [] })),
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
  diagnoseLibrary: vi.fn(async () => ({ status: "cancelled" })),
  cancelLibraryDiagnostics: vi.fn(async () => ({ status: "cancelled" })),
  getTrayStatus: vi.fn(),
  storeMainWindowInTray: vi.fn(),
  quitApplication: vi.fn(),
  setItemRating: vi.fn(),
  searchLibrary: vi.fn(),
  takeRecoveryNotice: vi.fn(),
  listReadingHistory: vi.fn(),
  listCsvExportPresets: vi.fn(async () => ({ status: "ok", data: [] })),
  saveCsvExportPreset: vi.fn(),
  deleteCsvExportPreset: vi.fn(),
  exportCatalogCsv: vi.fn(),
}));

const registerMock = vi.mocked(registerLibraryRoot);
const listMock = vi.mocked(listFolder);
const treeMock = vi.mocked(listTreeChildren);
const restoreMock = vi.mocked(restoreLibraryRoot);
const openMock = vi.mocked(openComic);
const settingsMock = vi.mocked(getCatalogSettings);
const metadataMock = vi.mocked(getItemMetadata);
const thumbnailMock = vi.mocked(getThumbnail);
const loadPageMock = vi.mocked(loadPage);
const saveMemoMock = vi.mocked(saveItemMemo);
const saveReadingMock = vi.mocked(saveReadingPosition);
const setRatingMock = vi.mocked(setItemRating);
const recoveryNoticeMock = vi.mocked(takeRecoveryNotice);
const historyMock = vi.mocked(listReadingHistory);

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const defaultSettings: CatalogSettings = {
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

function settingsResponse(requestId: string) {
  return {
    status: "ok" as const,
    requestId: requestId as never,
    generation: 1 as never,
    data: defaultSettings,
  };
}

async function registerTestLibrary(entries: CatalogEntry[]) {
  const absolutePath = "C:\\";
  restoreMock.mockResolvedValue({
    status: "ok", requestId: "restore" as never, generation: 1 as never,
    data: { absolutePath },
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
  render(<App />);
  await screen.findByRole("grid", { name: "現在のフォルダの項目" });
}

async function requestOpenTestComic(relativePath: string) {
  const grid = await screen.findByRole("grid", { name: "現在のフォルダの項目" });
  const comicButton = within(grid)
    .getAllByRole("button")
    .find((button) => button.getAttribute("data-relative-path") === relativePath);
  expect(comicButton).toBeDefined();
  expect(comicButton).toHaveAttribute("data-relative-path", relativePath);
  const basename = relativePath.split("/").at(-1) ?? relativePath;
  expect(comicButton).toHaveAccessibleName(expect.stringContaining(basename));
  fireEvent.keyDown(comicButton!, { key: "Enter" });
}

async function openTestComic(relativePath: string) {
  await requestOpenTestComic(relativePath);
  await screen.findByLabelText(`${relativePath} ビューワ`);
}

describe("FR-B07 connected App boundary", () => {
  afterEach(cleanup);

  beforeEach(() => {
    registerMock.mockReset();
    listMock.mockReset();
    treeMock.mockReset();
    restoreMock.mockReset();
    openMock.mockReset();
    settingsMock.mockReset();
    metadataMock.mockReset();
    thumbnailMock.mockReset();
    loadPageMock.mockReset();
    saveMemoMock.mockReset();
    saveReadingMock.mockReset();
    setRatingMock.mockReset();
    recoveryNoticeMock.mockReset();
    historyMock.mockReset();
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
    settingsMock.mockResolvedValue(settingsResponse("settings"));
    restoreMock.mockResolvedValue({
      status: "ok",
      requestId: "restore" as never,
      generation: 1 as never,
      data: null,
    });
    treeMock.mockResolvedValue({
      status: "ok",
      requestId: "tree" as never,
      generation: 1 as never,
      data: [],
    });
    loadPageMock.mockResolvedValue({
      status: "ok",
      requestId: "load-page" as never,
      generation: 1 as never,
      data: { pageId: "page-1" as never, mediaUri: "data:image/png;base64,fixture" },
    });
    saveReadingMock.mockResolvedValue({
      status: "ok",
      requestId: "save-reading" as never,
      generation: 1 as never,
      data: undefined,
    });
  });

  it("FT-B07-001 connects memo edit, save, and clear controls to the client", async () => {
    const comic = testEntry("Series/01.cbz");
    openMock.mockResolvedValue(viewerResponse(comic.relativePath));
    await registerTestLibrary([comic]);
    await openTestComic(comic.relativePath);

    const memo = await screen.findByLabelText("作品メモ");
    fireEvent.change(memo, { target: { value: "first memo" } });
    fireEvent.click(screen.getByRole("button", { name: "メモを保存" }));
    await waitFor(() =>
      expect(saveMemoMock).toHaveBeenCalledWith(
        comic.relativePath,
        "first memo",
        expect.any(Number),
      ),
    );
    await waitFor(() => expect(memo).toHaveValue("first memo"));

    const pendingSave = deferred<ReturnType<typeof metadataResponse>>();
    saveMemoMock.mockReturnValueOnce(pendingSave.promise);
    fireEvent.change(memo, { target: { value: "edited memo" } });
    fireEvent.click(screen.getByRole("button", { name: "メモを保存" }));
    await waitFor(() => expect(memo).toBeDisabled());
    expect(screen.getByRole("button", { name: "メモを保存" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "メモを消去" })).toBeDisabled();
    pendingSave.resolve(
      metadataResponse(comic.relativePath, { memo: "edited memo" }),
    );
    await waitFor(() => {
      expect(memo).toBeEnabled();
      expect(memo).toHaveValue("edited memo");
    });
    fireEvent.click(screen.getByRole("button", { name: "メモを消去" }));
    await waitFor(() => expect(memo).toHaveValue(""));
    expect(saveMemoMock).toHaveBeenLastCalledWith(
      comic.relativePath,
      "",
      expect.any(Number),
    );
  });

  it("FT-B07-002 renders history returned after successful, failed, and cancelled opens", async () => {
    const success = testEntry("Series/A.cbz");
    const failed = testEntry("Series/failed.cbz");
    const cancelled = testEntry("Series/cancelled.cbz");
    const recordedHistory = new Map<string, number>();
    let nextViewedAtMs = 300;
    const failedBackendMessage = "failed comic open";
    const failedMessage = "見つかりません。対象が移動または削除された可能性があります。";

    historyMock.mockImplementation(async () =>
      historyResponse(
        [...recordedHistory.entries()]
          .sort(([, left], [, right]) => right - left)
          .map(([itemIdentity, lastViewedAtMs]) => ({
            itemIdentity: itemIdentity as never,
            lastViewedAtMs,
          })),
      ),
    );
    openMock.mockImplementation(async (itemRelativePath, generation) => {
      if (itemRelativePath === failed.relativePath) {
        return {
          status: "error",
          requestId: "failed-open" as never,
          generation: generation as never,
          error: {
            code: "NOT_FOUND",
            message: failedBackendMessage,
            retryable: false,
          },
        };
      }
      if (itemRelativePath === cancelled.relativePath) {
        return {
          status: "cancelled",
          requestId: "cancelled-open" as never,
          generation: generation as never,
        };
      }
      recordedHistory.set(itemRelativePath, nextViewedAtMs);
      nextViewedAtMs -= 1;
      return viewerResponse(itemRelativePath);
    });
    await registerTestLibrary([
      success,
      failed,
      cancelled,
    ]);

    await openTestComic(success.relativePath);
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    await screen.findByRole("grid", { name: "現在のフォルダの項目" });

    // A repeated successful open must upsert the same history row, not add one.
    await openTestComic(success.relativePath);
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    await screen.findByRole("grid", { name: "現在のフォルダの項目" });

    await requestOpenTestComic(failed.relativePath);
    await screen.findByText(failedMessage);
    expect(screen.queryByLabelText(`${failed.relativePath} ビューワ`)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    await screen.findByRole("grid", { name: "現在のフォルダの項目" });

    await requestOpenTestComic(cancelled.relativePath);
    await waitFor(() =>
      expect(openMock).toHaveBeenLastCalledWith(cancelled.relativePath, expect.any(Number)),
    );
    expect(screen.queryByLabelText(`${cancelled.relativePath} ビューワ`)).toBeNull();

    openLibraryMenuItem("閲覧履歴");
    const dialog = await screen.findByRole("dialog", { name: "閲覧履歴" });
    const rows = await within(dialog).findAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(success.relativePath);
    expect(within(dialog).getAllByText(success.relativePath)).toHaveLength(1);
    expect(historyMock).toHaveBeenCalledWith(expect.any(Number));
    expect(recordedHistory).toEqual(new Map([[success.relativePath, 299]]));
  });

  it("FT-B07-003 connects rating boundaries and unset state to the client", async () => {
    const comic = testEntry("Series/01.cbz");
    openMock.mockResolvedValue(viewerResponse(comic.relativePath));
    let resolveFirstSave:
      | ((value: Awaited<ReturnType<typeof setItemRating>>) => void)
      | undefined;
    setRatingMock.mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<typeof setItemRating>>>((resolve) => {
          resolveFirstSave = resolve;
        }),
    );
    await registerTestLibrary([comic]);
    await openTestComic(comic.relativePath);

    const rating = await screen.findByLabelText("作品評価");
    const panel = screen.getByLabelText("作品メタデータ");
    fireEvent.change(rating, { target: { value: "1" } });
    await waitFor(() =>
      expect(setRatingMock).toHaveBeenNthCalledWith(
        1,
        comic.relativePath,
        1,
        expect.any(Number),
      ),
    );
    await waitFor(() => {
      expect(panel).toHaveAttribute("data-rating-save-state", "saving");
      expect(rating).toBeDisabled();
    });
    fireEvent.change(rating, { target: { value: "5" } });
    expect(setRatingMock).toHaveBeenCalledTimes(1);
    expect(resolveFirstSave).toBeDefined();
    resolveFirstSave!(metadataResponse(comic.relativePath, { rating: 1 }));
    await waitFor(() => {
      expect(panel).toHaveAttribute("data-rating-save-state", "saved");
      expect(panel).toHaveAttribute("data-rating-persisted-value", "1");
      expect(rating).toBeEnabled();
      expect(rating).toHaveValue("1");
    });
    fireEvent.change(rating, { target: { value: "5" } });
    await waitFor(() =>
      expect(setRatingMock).toHaveBeenNthCalledWith(
        2,
        comic.relativePath,
        5,
        expect.any(Number),
      ),
    );
    await waitFor(() => {
      expect(panel).toHaveAttribute("data-rating-persisted-value", "5");
      expect(rating).toHaveValue("5");
    });
    fireEvent.change(rating, { target: { value: "" } });
    await waitFor(() =>
      expect(setRatingMock).toHaveBeenNthCalledWith(
        3,
        comic.relativePath,
        null,
        expect.any(Number),
      ),
    );
    await waitFor(() => {
      expect(panel).toHaveAttribute("data-rating-persisted-value", "unset");
      expect(rating).toHaveValue("");
    });
  });

  it("FT-B07-004 restores metadata returned when the viewer reopens", async () => {
    const comic = testEntry("Series/01.cbz");
    openMock.mockResolvedValue(viewerResponse(comic.relativePath));
    metadataMock.mockResolvedValue(
      metadataResponse(comic.relativePath, { memo: "restored memo", rating: 4 }),
    );
    await registerTestLibrary([comic]);
    await openTestComic(comic.relativePath);
    expect(await screen.findByLabelText("作品メモ")).toHaveValue("restored memo");
    expect(screen.getByLabelText("作品評価")).toHaveValue("4");

    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    await screen.findByRole("grid", { name: "現在のフォルダの項目" });
    await openTestComic(comic.relativePath);
    expect(await screen.findByLabelText("作品メモ")).toHaveValue("restored memo");
    expect(screen.getByLabelText("作品評価")).toHaveValue("4");
    expect(metadataMock).toHaveBeenCalledTimes(2);
  });

});
