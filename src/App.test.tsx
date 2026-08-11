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
import {
  getCatalogSettings,
  getItemMetadata,
  getThumbnail,
  addFavorite,
  listFavorites,
  loadPage,
  listTreeChildren,
  listFolder,
  listReadingHistory,
  openComic,
  pickLibraryRoot,
  registerLibraryRoot,
  removeFavorite,
  restoreLibraryRoot,
  saveCatalogSort,
  saveCatalogViewMode,
  saveEndOfVolumePolicy,
  saveItemMemo,
  saveReadingPosition,
  saveSettingsProfile,
  saveViewerSettings,
  getTrayStatus,
  storeMainWindowInTray,
  quitApplication,
  setItemRating,
  searchLibrary,
  takeRecoveryNotice,
  resolveFavorite,
  diagnoseLibrary,
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
  type FavoriteEntry,
  type ItemMetadata,
  type ReadingHistoryEntry,
} from "./features/library/client";
import type { CatalogEntry, ImageFormat } from "./types/domain";
import { DEFAULT_SHORTCUTS } from "./features/input/shortcuts";
import { APP_VERSION, DEFAULT_MOUSE_GESTURES } from "./features/settings/profile";

vi.mock("./features/library/client", () => ({
  registerLibraryRoot: vi.fn(),
  pickLibraryRoot: vi.fn(),
  listFolder: vi.fn(),
  listTreeChildren: vi.fn(),
  restoreLibraryRoot: vi.fn(),
  openComic: vi.fn(),
  addFavorite: vi.fn(),
  listFavorites: vi.fn(),
  removeFavorite: vi.fn(),
  resolveFavorite: vi.fn(),
  getCatalogSettings: vi.fn(),
  getItemMetadata: vi.fn(),
  getThumbnail: vi.fn(),
  loadPage: vi.fn(),
  saveCatalogSort: vi.fn(),
  saveCatalogViewMode: vi.fn(),
  saveEndOfVolumePolicy: vi.fn(),
  saveItemMemo: vi.fn(),
  saveReadingPosition: vi.fn(),
  saveSettingsProfile: vi.fn(),
  saveViewerSettings: vi.fn(),
  getTrayStatus: vi.fn(),
  storeMainWindowInTray: vi.fn(),
  quitApplication: vi.fn(),
  setItemRating: vi.fn(),
  searchLibrary: vi.fn(),
  diagnoseLibrary: vi.fn(),
  cancelLibraryDiagnostics: vi.fn(),
  takeRecoveryNotice: vi.fn(),
  listReadingHistory: vi.fn(),
  renameFileItem: vi.fn(),
  createFileFolder: vi.fn(),
  copyFileItemsToFolder: vi.fn(),
  moveFileItemsToFolder: vi.fn(),
  deleteFileItems: vi.fn(),
  setFileClipboard: vi.fn(),
  getFileClipboardStatus: vi.fn(),
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
const listMock = vi.mocked(listFolder);
const treeMock = vi.mocked(listTreeChildren);
const restoreMock = vi.mocked(restoreLibraryRoot);
const openMock = vi.mocked(openComic);
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
const saveViewerMock = vi.mocked(saveViewerSettings);
const getTrayStatusMock = vi.mocked(getTrayStatus);
const storeMainWindowInTrayMock = vi.mocked(storeMainWindowInTray);
const quitApplicationMock = vi.mocked(quitApplication);
const setRatingMock = vi.mocked(setItemRating);
const searchMock = vi.mocked(searchLibrary);
const recoveryNoticeMock = vi.mocked(takeRecoveryNotice);
const historyMock = vi.mocked(listReadingHistory);
const diagnoseMock = vi.mocked(diagnoseLibrary);
const renameFileItemMock = vi.mocked(renameFileItem);
const createFileFolderMock = vi.mocked(createFileFolder);
const copyFileItemsToFolderMock = vi.mocked(copyFileItemsToFolder);
const moveFileItemsToFolderMock = vi.mocked(moveFileItemsToFolder);
const deleteFileItemsMock = vi.mocked(deleteFileItems);
const setFileClipboardMock = vi.mocked(setFileClipboard);
const getFileClipboardStatusMock = vi.mocked(getFileClipboardStatus);
const pasteFileItemsMock = vi.mocked(pasteFileItems);
const revealFileItemMock = vi.mocked(revealFileItem);
const openFileItemDefaultMock = vi.mocked(openFileItemDefault);
const openFileItemWithMock = vi.mocked(openFileItemWith);

const DEFAULT_CATALOG_SETTINGS: CatalogSettings = {
  sortField: "name",
  sortDescending: false,
  endOfVolumePolicy: "auto_next",
  catalogViewMode: "cover_list",
  viewMode: "single",
  layoutMode: "paged",
  readingDirection: "rightToLeft",
  scaleMode: "fit",
  scale: 1,
  loupeEnabled: false,
  treeVisible: true,
  menuBarVisible: true,
  toolbarVisible: true,
  shortcuts: { ...DEFAULT_SHORTCUTS },
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
) {
  registerMock.mockResolvedValue({
    status: "ok",
    requestId: "register" as never,
    generation: 1 as never,
    data: { absolutePath: "C:\\Comics" },
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
  render(<App fullscreenAdapter={fullscreenAdapter} />);
  fireEvent.change(screen.getByLabelText("ライブラリルート"), {
    target: { value: "C:\\Comics" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登録" }));
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
    listMock.mockReset();
    treeMock.mockReset();
    restoreMock.mockReset();
    openMock.mockReset();
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
    saveViewerMock.mockReset();
    getTrayStatusMock.mockReset();
    storeMainWindowInTrayMock.mockReset();
    quitApplicationMock.mockReset();
    setRatingMock.mockReset();
    searchMock.mockReset();
    recoveryNoticeMock.mockReset();
    historyMock.mockReset();
    diagnoseMock.mockReset();
    renameFileItemMock.mockReset();
    createFileFolderMock.mockReset();
    copyFileItemsToFolderMock.mockReset();
    moveFileItemsToFolderMock.mockReset();
    deleteFileItemsMock.mockReset();
    setFileClipboardMock.mockReset();
    getFileClipboardStatusMock.mockReset();
    pasteFileItemsMock.mockReset();
    revealFileItemMock.mockReset();
    openFileItemDefaultMock.mockReset();
    openFileItemWithMock.mockReset();
    renameFileItemMock.mockResolvedValue(fileOperationResponse("rename"));
    createFileFolderMock.mockResolvedValue(fileOperationResponse("createFolder"));
    copyFileItemsToFolderMock.mockResolvedValue(fileOperationResponse("copy"));
    moveFileItemsToFolderMock.mockResolvedValue(fileOperationResponse("move"));
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

  it("starts with an accessible library-root registration form", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Comic Explorer" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("ライブラリルート")).toHaveAttribute(
      "required",
    );
  });

  it("keeps tree, address and catalog synchronized after registration", async () => {
    registerMock.mockResolvedValue({
      status: "ok",
      requestId: "request-1" as never,
      generation: 1 as never,
      data: { absolutePath: "C:\\Comics" },
    });
    listMock.mockResolvedValue({
      status: "ok",
      requestId: "request-2" as never,
      generation: 2 as never,
      data: [],
    });
    render(<App />);

    fireEvent.change(screen.getByLabelText("ライブラリルート"), {
      target: { value: "C:\\Comics" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));

    await waitFor(() =>
      expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics"),
    );
    expect(
      screen.getByRole("complementary", { name: "フォルダツリー" }),
    ).toHaveTextContent("Comics");
    expect(
      screen.getByRole("grid", { name: "現在のフォルダの項目" }),
    ).toBeInTheDocument();
  });

  it("registers the folder returned by the Windows folder picker", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "フォルダを選択" }));

    await waitFor(() =>
      expect(screen.getByLabelText("アドレス")).toHaveValue(
        "C:\\Selected Comics",
      ),
    );
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("renders a sanitized, recoverable folder error without removing navigation", async () => {
    registerMock.mockResolvedValue({
      status: "ok",
      requestId: "request-1" as never,
      generation: 1 as never,
      data: { absolutePath: "C:\\Comics" },
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
    render(<App />);
    fireEvent.change(screen.getByLabelText("ライブラリルート"), {
      target: { value: "C:\\Comics" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "アクセスできません。権限または他のアプリによる使用状況を確認してください。",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("対象: C:\\Comics");
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret stack");
    expect(screen.getByTitle("戻る")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "別のフォルダを選択" }),
    ).toBeInTheDocument();
  });

  it("resizes the tree by keyboard and restores help focus", async () => {
    registerMock.mockResolvedValue({
      status: "ok",
      requestId: "request-1" as never,
      generation: 1 as never,
      data: { absolutePath: "C:\\Comics" },
    });
    listMock.mockResolvedValue({
      status: "ok",
      requestId: "request-2" as never,
      generation: 2 as never,
      data: [],
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText("ライブラリルート"), {
      target: { value: "C:\\Comics" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));

    const splitter = await screen.findByRole("separator", {
      name: "フォルダツリーの幅",
    });
    expect(splitter).toHaveAttribute("aria-valuenow", "240");
    fireEvent.keyDown(splitter, { key: "ArrowLeft" });
    expect(splitter).toHaveAttribute("aria-valuenow", "230");

    const trigger = screen.getByRole("menuitem", { name: "ヘルプ" });
    chooseAppMenuItem("ヘルプ", "一般ヘルプ…");
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(trigger).toHaveFocus());
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
    expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics");

    const changeRoot = within(screen.getByRole("menu", { name: "ファイル" }))
      .getByRole("menuitem", { name: "ライブラリを変更…" });
    fireEvent.keyDown(changeRoot, { key: "Enter" });
    expect(
      screen.getByRole("heading", { level: 1, name: "Comic Explorer" }),
    ).toBeInTheDocument();
  });

  it("moves navigation history from the toolbar into the File menu and supports history jumps", async () => {
    await registerTestLibrary([]);

    expect(screen.queryByLabelText("履歴ドロップダウン")).not.toBeInTheDocument();
    let fileMenu = openAppMenu("ファイル");
    expect(within(fileMenu).getByText("履歴")).toBeInTheDocument();
    expect(within(fileMenu).getByText("移動履歴はありません")).toBeInTheDocument();
    fireEvent.keyDown(
      within(fileMenu).getByRole("menuitem", { name: "ライブラリを変更…" }),
      { key: "Escape" },
    );

    fireEvent.change(screen.getByLabelText("アドレス"), {
      target: { value: "C:\\Comics\\Series" },
    });
    fireEvent.submit(screen.getByLabelText("アドレス").closest("form")!);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("アドレス"), {
      target: { value: "C:\\Comics\\Series\\Volume" },
    });
    fireEvent.submit(screen.getByLabelText("アドレス").closest("form")!);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(3));

    fileMenu = openAppMenu("ファイル");
    expect(within(fileMenu).getByRole("menuitem", { name: "戻る: Series" }))
      .toBeInTheDocument();
    fireEvent.click(
      within(fileMenu).getByRole("menuitem", { name: "戻る: ライブラリ" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics"),
    );

    fileMenu = openAppMenu("ファイル");
    fireEvent.click(
      within(fileMenu).getByRole("menuitem", { name: "進む: Series/Volume" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("アドレス"))
        .toHaveValue("C:\\Comics\\Series\\Volume"),
    );
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

  it("FT-B17-002 exposes accessible toolbar commands and invokes each callback once", async () => {
    await registerTestLibrary([]);

    let viewMenu = openAppMenu("表示");
    const nameSort = within(viewMenu).getByRole("menuitemradio", {
      name: "名前で並べ替え",
    });
    expect(nameSort).toHaveAttribute("aria-checked", "true");
    expect(within(viewMenu).getByRole("menuitemradio", { name: "昇順" }))
      .toHaveAttribute("aria-checked", "true");
    expect(within(viewMenu).getByRole("menuitemradio", { name: "表紙付きリスト" }))
      .toHaveAttribute("aria-checked", "true");
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

    expect(screen.queryByRole("button", { name: "巻末動作" })).not.toBeInTheDocument();

    chooseToolbarMenuItem("一覧表示形式", "一覧表示形式候補", "小サムネイル");
    expect(screen.getByRole("button", { name: "一覧表示形式" }))
      .toHaveAttribute("data-catalog-view-mode", "small_thumbnail");

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
    expect(searchToggle).toHaveAttribute("title", "検索とフィルタを表示");
    const searchPane = openSearchPane();
    const search = within(searchPane).getByRole("button", { name: "検索" });
    expect(search).toHaveTextContent("⌕");
    expect(search).not.toHaveTextContent("検索");
    expect(search).toHaveAttribute("title", "名前で検索");
    const showAll = within(searchPane).getByRole("button", { name: "全件" });
    expect(showAll).toHaveTextContent("✕");
    expect(showAll).not.toHaveTextContent("全件");
    expect(showAll).toHaveAttribute("title", "ファイルマスクを解除して全件表示");
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
    const viewMenu = await screen.findByRole("menu", { name: "表示" });
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
    const lastViewItem = within(viewMenu).getByRole("menuitemradio", { name: "参照型タイル" });
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
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics"));

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
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics"));
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
    const entries: CatalogEntry[] = Array.from({ length: 45 }, (_, index) => ({
      relativePath: `book-${index.toString().padStart(2, "0")}.cbz` as never,
      kind: "archive",
      archiveKind: "cbz",
    }));
    registerMock.mockResolvedValue({
      status: "ok",
      requestId: "request-1" as never,
      generation: 1 as never,
      data: { absolutePath: "C:\\Comics" },
    });
    listMock.mockResolvedValue({
      status: "ok",
      requestId: "request-2" as never,
      generation: 2 as never,
      data: entries,
    });
    thumbnailMock.mockImplementation(() => new Promise(() => undefined));
    render(<App />);
    fireEvent.change(screen.getByLabelText("ライブラリルート"), {
      target: { value: "C:\\Comics" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));

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
    registerMock.mockResolvedValue({
      status: "ok",
      requestId: "request-1" as never,
      generation: 1 as never,
      data: { absolutePath: "C:\\Comics" },
    });
    listMock.mockResolvedValue({
      status: "ok",
      requestId: "request-2" as never,
      generation: 2 as never,
      data: [first, second],
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
    render(<App />);
    fireEvent.change(screen.getByLabelText("ライブラリルート"), {
      target: { value: "C:\\Comics" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));
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

  it("FT-B03-001 switches all three catalog modes through the connected App", async () => {
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
      ["cover_list", "表紙付きリスト"],
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
      ["cover_list", "表紙付きリスト"],
      ["small_thumbnail", "小サムネイル"],
      ["detail_list", "詳細リスト"],
    ] as const) {
      chooseToolbarMenuItem("一覧表示形式", "一覧表示形式候補", label);
      await waitFor(() =>
        expect(grid).toHaveAttribute("data-catalog-view-mode", mode),
      );
      expect(grid).toHaveAttribute("data-entry-count", "3");
      expect(screen.getByText("A very long comic name that remains available to keyboard users.cbz"))
        .toBeInTheDocument();
      const folderItem = screen.getByRole("button", { name: /^missing-metadata、フォルダ/ });
      if (mode === "detail_list") {
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

    chooseToolbarMenuItem("一覧表示形式", "一覧表示形式候補", "参照型タイル");

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
        fixedLocation: null,
      }),
    );
  });

  it("passes active search options and retains results when requested", async () => {
    const result = testEntry("Series/large-volume.cbz");
    searchMock.mockResolvedValueOnce(searchResponse([result]));
    await registerTestLibrary([testEntry("root.cbz")]);
    const pane = openSearchPane();

    fireEvent.click(within(pane).getByLabelText("サブフォルダも検索する"));
    fireEvent.click(within(pane).getByLabelText("フォルダは検索対象にしない"));
    fireEvent.click(within(pane).getByLabelText("検索結果を破棄しない"));
    fireEvent.click(within(pane).getByLabelText("検索場所を固定する"));
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

  it("filters the catalog from the search side pane and restores all items", async () => {
    await registerTestLibrary([
      testEntry("book.cbz"),
      { relativePath: "cover.jpg" as never, kind: "page" },
    ]);
    const pane = openSearchPane();
    expect(screen.getByRole("grid")).toHaveAttribute("data-entry-count", "2");

    fireEvent.change(within(pane).getByLabelText("ファイルマスク"), {
      target: { value: "*.cbz" },
    });
    expect(screen.getByRole("grid")).toHaveAttribute("data-entry-count", "1");
    expect(screen.getByRole("button", { name: /book\.cbz/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cover\.jpg/ })).not.toBeInTheDocument();

    fireEvent.click(within(pane).getByRole("button", { name: "全件" }));
    expect(screen.getByRole("grid")).toHaveAttribute("data-entry-count", "2");
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
      expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics\\Series");
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
    fireEvent.keyDown(folderButton!, { key: "Enter", ctrlKey: true });
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
    await openTestComic("webp-book.cbz");
    expect(await screen.findByAltText("webp-book.cbz 1ページ"))
      .toHaveAttribute("src", "comic://localhost/webp-book.cbz-0");
    expect(openMock).toHaveBeenNthCalledWith(1, "webp-folder", expect.any(Number));
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
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics\\Series"));
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

    expect(await screen.findByLabelText("cover.jpg ビューワ")).toBeInTheDocument();
    expect(openMock).toHaveBeenCalledWith("cover.jpg", expect.any(Number));
  });

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

      expect(screen.getByText("CSVを出力できませんでした。保存機能を確認してください。"))
        .toBeInTheDocument();
      expect(screen.queryByText(/件をCSVへ出力しました/)).not.toBeInTheDocument();
    } finally {
      if (descriptor === undefined) delete (URL as { createObjectURL?: unknown }).createObjectURL;
      else Object.defineProperty(URL, "createObjectURL", descriptor);
    }
  });

  it("FT-B14-002 discards an in-flight open when the library root changes", async () => {
    let resolveOpen!: (value: ReturnType<typeof viewerResponse>) => void;
    openMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOpen = resolve;
    }));
    await registerTestLibrary([testEntry("old.cbz")]);
    fireEvent.keyDown(screen.getByRole("button", { name: /^old\.cbz/ }), { key: "Enter" });

    chooseAppMenuItem("ファイル", "ライブラリを変更…");
    registerMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "register-new-root" as never,
      generation: 4 as never,
      data: { absolutePath: "D:\\New Comics" },
    });
    listMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "list-new-root" as never,
      generation: 5 as never,
      data: [testEntry("new.cbz")],
    });
    fireEvent.change(screen.getByLabelText("ライブラリルート"), {
      target: { value: "D:\\New Comics" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));
    await screen.findByRole("button", { name: /^new\.cbz/ });

    await act(async () => resolveOpen(viewerResponse("old.cbz")));
    expect(screen.queryByLabelText("old.cbz ビューワ")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^new\.cbz/ })).toBeInTheDocument();
  });

  it("FT-B19-001 keeps integrated settings as a draft until one atomic Apply", async () => {
    await registerTestLibrary([testEntry("book.cbz")]);
    chooseAppMenuItem("オプション", "統合設定…");
    let dialog = screen.getByRole("dialog", { name: "統合設定" });
    expect(within(dialog).queryByLabelText("doubleClickジェスチャー"))
      .not.toBeInTheDocument();
    expect(within(dialog).getByText("doubleClick: 全画面表示／解除（固定）"))
      .toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("profile一覧形式"), {
      target: { value: "reference_tile" },
    });
    fireEvent.click(within(dialog).getByLabelText("profileフォルダツリー"));
    fireEvent.keyDown(within(dialog).getByLabelText("次ページショートカット"), {
      key: "j",
      ctrlKey: true,
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));

    expect(screen.getByLabelText("一覧表示形式"))
      .toHaveAttribute("data-catalog-view-mode", "cover_list");
    expect(screen.getByRole("complementary", { name: "フォルダツリー" })).toBeInTheDocument();
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();

    chooseAppMenuItem("オプション", "統合設定…");
    dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.change(within(dialog).getByLabelText("profile一覧形式"), {
      target: { value: "reference_tile" },
    });
    fireEvent.click(within(dialog).getByLabelText("profileフォルダツリー"));
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "統合設定" })).not.toBeInTheDocument());
    expect(saveSettingsProfileMock).toHaveBeenCalledTimes(1);
    expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ catalogViewMode: "reference_tile", treeVisible: false }),
      expect.any(Number),
    );
    expect(screen.getByLabelText("一覧表示形式"))
      .toHaveAttribute("data-catalog-view-mode", "reference_tile");
    expect(screen.queryByRole("complementary", { name: "フォルダツリー" })).not.toBeInTheDocument();
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

  it("FT-B19-004 exposes offline general help from the Help menu", async () => {
    await registerTestLibrary([]);
    chooseAppMenuItem("ヘルプ", "一般ヘルプ…");

    const help = screen.getByRole("dialog", { name: "キー操作とショートカット" });
    expect(within(help).getByRole("region", { name: "一般ヘルプ" })).toHaveTextContent(
      "フォルダ・漫画・単独画像をEnterで開きます",
    );
    expect(within(help).getByText(/Esc: アドレス編集を戻す/)).toBeInTheDocument();
    expect(within(help).queryByText(new RegExp(`バージョン ${APP_VERSION}`))).not.toBeInTheDocument();
  });

  it("FT-B19-005 exposes version information and an offline license notice separately from help", async () => {
    await registerTestLibrary([]);
    const helpMenu = openAppMenu("ヘルプ");
    expect(within(helpMenu).getByRole("menuitem", { name: "一般ヘルプ…" })).toBeInTheDocument();
    fireEvent.click(within(helpMenu).getByRole("menuitem", { name: "バージョン情報…" }));

    const version = await screen.findByRole("dialog", { name: "バージョン情報" });
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
    fireEvent.change(within(renameDialog).getByLabelText("ファイル名"), {
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

});
