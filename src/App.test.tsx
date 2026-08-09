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
  saveViewerSettings,
  setItemRating,
  searchLibrary,
  takeRecoveryNotice,
  resolveFavorite,
  diagnoseLibrary,
  type FavoriteEntry,
  type ItemMetadata,
  type ReadingHistoryEntry,
} from "./features/library/client";
import type { CatalogEntry } from "./types/domain";

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
  saveViewerSettings: vi.fn(),
  setItemRating: vi.fn(),
  searchLibrary: vi.fn(),
  diagnoseLibrary: vi.fn(),
  cancelLibraryDiagnostics: vi.fn(),
  takeRecoveryNotice: vi.fn(),
  listReadingHistory: vi.fn(),
}));

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
const saveViewerMock = vi.mocked(saveViewerSettings);
const setRatingMock = vi.mocked(setItemRating);
const searchMock = vi.mocked(searchLibrary);
const recoveryNoticeMock = vi.mocked(takeRecoveryNotice);
const historyMock = vi.mocked(listReadingHistory);
const diagnoseMock = vi.mocked(diagnoseLibrary);

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

function openAppMenu(name: "ファイル" | "移動" | "表示" | "ライブラリ" | "ヘルプ") {
  fireEvent.click(screen.getByRole("menuitem", { name }));
  return screen.getByRole("menu", { name });
}

function chooseAppMenuItem(
  menuName: "ファイル" | "移動" | "表示" | "ライブラリ" | "ヘルプ",
  itemName: string | RegExp,
) {
  const menu = openAppMenu(menuName);
  fireEvent.click(within(menu).getByRole("menuitem", { name: itemName }));
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
    saveViewerMock.mockReset();
    setRatingMock.mockReset();
    searchMock.mockReset();
    recoveryNoticeMock.mockReset();
    historyMock.mockReset();
    diagnoseMock.mockReset();
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
      data: {
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
      },
    });
    saveSortMock.mockResolvedValue({
      status: "ok",
      requestId: "save-sort" as never,
      generation: 1 as never,
      data: {
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
      },
    });
    saveEndPolicyMock.mockResolvedValue({
      status: "ok",
      requestId: "save-end-policy" as never,
      generation: 1 as never,
      data: {
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
      },
    });
    saveReadingMock.mockResolvedValue({
      status: "ok",
      requestId: "save-reading" as never,
      generation: 1 as never,
      data: undefined,
    });
    saveCatalogViewModeMock.mockResolvedValue({
      status: "ok",
      requestId: "save-catalog-view-mode" as never,
      generation: 1 as never,
      data: {
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
      },
    });
    saveViewerMock.mockResolvedValue({
      status: "ok",
      requestId: "save-viewer" as never,
      generation: 1 as never,
      data: {
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
      },
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
    chooseAppMenuItem("ヘルプ", "キー操作とショートカット…");
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("opens five top-level menus without firing their actions and runs File exactly once", async () => {
    await registerTestLibrary([]);

    const menubar = screen.getByRole("menubar", { name: "メニューバー" });
    expect(
      within(menubar).getAllByRole("menuitem").map((item) => item.getAttribute("aria-label")),
    ).toEqual(["ファイル", "移動", "表示", "ライブラリ", "ヘルプ"]);
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
    const libraryTrigger = within(menubar).getByRole("menuitem", {
      name: "ライブラリ",
    });
    await waitFor(() => {
      expect(libraryTrigger).toHaveFocus();
      expect(triggers.map((trigger) => trigger.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
    });

    fireEvent.keyDown(libraryTrigger, { key: "ArrowLeft" });
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

    fireEvent.keyDown(window, { key: "f", altKey: true });
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });

    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledTimes(catalogLoadsBeforeAlt);
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    expect(await screen.findByLabelText("アドレス")).toHaveValue("C:\\Comics\\Series");
    expect(screen.queryByRole("menu", { name: "ファイル" })).not.toBeInTheDocument();
  });

  it("shares View radio state with the toolbar and invokes each existing callback once", async () => {
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
    expect(screen.getByLabelText("並べ替え条件")).toHaveValue("modified");

    viewMenu = openAppMenu("表示");
    fireEvent.click(within(viewMenu).getByRole("menuitemradio", { name: "降順" }));
    expect(saveSortMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("降順 ▼")).toHaveAttribute(
      "data-sort-descending",
      "true",
    );

    viewMenu = openAppMenu("表示");
    fireEvent.click(
      within(viewMenu).getByRole("menuitemradio", { name: "詳細リスト" }),
    );
    expect(saveCatalogViewModeMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("一覧表示形式")).toHaveValue("detail_list");
  });

  it("supports mnemonic, item traversal, cross-menu arrows and Escape focus return", async () => {
    await registerTestLibrary([]);

    fireEvent.keyDown(window, { key: "n", altKey: true });
    const navigationMenu = await screen.findByRole("menu", { name: "移動" });
    const back = within(navigationMenu).getByRole("menuitem", { name: /戻る/ });
    const up = within(navigationMenu).getByRole("menuitem", {
      name: /上のフォルダへ/,
    });
    await waitFor(() => expect(back).toHaveFocus());
    expect(back).toHaveAttribute("aria-disabled", "true");
    expect(back).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowLeft");
    fireEvent.keyDown(back, { key: "Enter" });
    expect(listMock).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(back, { key: "End" });
    expect(up).toHaveFocus();
    fireEvent.keyDown(up, { key: "ArrowRight" });
    const viewMenu = await screen.findByRole("menu", { name: "表示" });
    const firstViewItem = within(viewMenu).getByRole("menuitemradio", {
      name: "名前で並べ替え",
    });
    await waitFor(() => expect(firstViewItem).toHaveFocus());
    fireEvent.keyDown(firstViewItem, { key: "End" });
    expect(within(viewMenu).getByRole("menuitemradio", { name: "表紙付きリスト" }))
      .toHaveFocus();
    fireEvent.keyDown(
      within(viewMenu).getByRole("menuitemradio", { name: "表紙付きリスト" }),
      { key: "Home" },
    );
    expect(firstViewItem).toHaveFocus();
    fireEvent.keyDown(firstViewItem, { key: "Escape" });
    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "表示" })).toHaveFocus(),
    );
    expect(screen.queryByRole("menu", { name: "表示" })).not.toBeInTheDocument();
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

    let navigationMenu = openAppMenu("移動");
    expect(within(navigationMenu).getByRole("menuitem", { name: /戻る/ }))
      .toHaveAttribute("aria-disabled", "false");
    expect(within(navigationMenu).getByRole("menuitem", { name: /進む/ }))
      .toHaveAttribute("aria-disabled", "true");
    expect(within(navigationMenu).getByRole("menuitem", { name: /上のフォルダへ/ }))
      .toHaveAttribute("aria-disabled", "false");
    fireEvent.click(within(navigationMenu).getByRole("menuitem", { name: /戻る/ }));
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics"));

    navigationMenu = openAppMenu("移動");
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

    let libraryMenu = openAppMenu("ライブラリ");
    const diagnostics = within(libraryMenu).getByRole("menuitem", {
      name: "ライブラリ診断…",
    });
    expect(diagnostics).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(diagnostics);
    expect(diagnoseMock).toHaveBeenCalledTimes(1);

    libraryMenu = openAppMenu("ライブラリ");
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

  it("persists the selected end-of-volume policy without changing the catalog sort", async () => {
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

    const policy = await screen.findByLabelText("巻末動作");
    fireEvent.change(policy, { target: { value: "loop" } });

    expect(policy).toHaveValue("loop");
    expect(saveEndPolicyMock).toHaveBeenCalledWith("loop", expect.any(Number));
    expect(screen.getByLabelText("並べ替え条件")).toHaveValue("name");
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
    const policy = await screen.findByLabelText("巻末動作");
    fireEvent.change(policy, { target: { value: "confirm_next" } });

    fireEvent.keyDown(
      await screen.findByRole("button", { name: /01-first/ }),
      { key: "Enter" },
    );
    expect(await screen.findByLabelText("01-first.cbz ビューワ")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });

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
    fireEvent.change(await screen.findByLabelText("巻末動作"), {
      target: { value: "return_library" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("巻末動作")).toHaveValue("return_library"),
    );
    releaseSettings({
      status: "ok",
      requestId: "stale-settings" as never,
      generation: 1 as never,
      data: {
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
      },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("巻末動作")).toHaveValue("return_library"),
    );
    await openTestComic(first.relativePath);
    fireEvent.keyDown(window, { key: "ArrowLeft" });

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
    fireEvent.change(await screen.findByLabelText("巻末動作"), {
      target: { value: "stop" },
    });
    await openTestComic(first.relativePath);
    fireEvent.keyDown(window, { key: "ArrowLeft" });

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
      fireEvent.keyDown(window, { key: "ArrowLeft" });

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
    fireEvent.change(await screen.findByLabelText("巻末動作"), {
      target: { value: "loop" },
    });
    await openTestComic(last.relativePath);
    fireEvent.keyDown(window, { key: "ArrowLeft" });

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
        sortField: "name",
        sortDescending: false,
        endOfVolumePolicy: "stop",
        catalogViewMode: "cover_list",
        viewMode: "single",
        layoutMode: "paged",
        readingDirection: "rightToLeft",
        scaleMode: "fit",
        scale: 1,
        loupeEnabled: false,
      },
    });
    const first = testEntry("01-first.cbz");
    const second = testEntry("02-second.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(first.relativePath));

    await registerTestLibrary([first, second]);
    await waitFor(() =>
      expect(screen.getByLabelText("巻末動作")).toHaveValue("stop"),
    );
    await openTestComic(first.relativePath);
    fireEvent.keyDown(window, { key: "ArrowLeft" });

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

  it("FT-B04-004 observes the App-to-window adapter fullscreen lifecycle and Esc exit", async () => {
    const adapter: FullscreenAdapter = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn().mockResolvedValue(undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
    };
    const entry = testEntry("fullscreen.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(entry.relativePath));
    await registerTestLibrary([entry], adapter);
    await openTestComic(entry.relativePath);

    fireEvent.click(screen.getByRole("button", { name: "全画面表示" }));
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

  it("FT-B04-005 restores layout from App settings while leaving fullscreen as window state", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "restored-layout" as never,
      generation: 1 as never,
      data: {
        sortField: "name",
        sortDescending: false,
        endOfVolumePolicy: "auto_next",
        catalogViewMode: "cover_list",
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
    expect(selector).toHaveValue("cover_list");
    expect(grid).toHaveAttribute("data-catalog-view-mode", "cover_list");

    for (const mode of ["small_thumbnail", "detail_list", "cover_list"] as const) {
      fireEvent.change(selector, { target: { value: mode } });
      await waitFor(() => {
        expect(selector).toHaveValue(mode);
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

  it("FT-B03-002 exposes long names, kinds, counts and missing metadata in every mode", async () => {
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
    const selector = await screen.findByLabelText("一覧表示形式");
    const grid = screen.getByRole("grid", { name: "現在のフォルダの項目" });

    for (const mode of ["cover_list", "small_thumbnail", "detail_list"] as const) {
      fireEvent.change(selector, { target: { value: mode } });
      await waitFor(() =>
        expect(grid).toHaveAttribute("data-catalog-view-mode", mode),
      );
      expect(grid).toHaveAttribute("data-entry-count", "3");
      expect(screen.getByText("A very long comic name that remains available to keyboard users.cbz"))
        .toBeInTheDocument();
      expect(screen.getByText("フォルダ")).toBeInTheDocument();
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
    const selector = await screen.findByLabelText("一覧表示形式");
    fireEvent.change(selector, { target: { value: "detail_list" } });
    const first = await screen.findByRole("button", { name: /book-00/ });
    fireEvent.keyDown(first, { key: "ArrowDown" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /book-01/ })).toHaveFocus();
      expect(screen.getByText("選択: book-01.cbz")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("並べ替え条件"), {
      target: { value: "size" },
    });
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
        sortField: "name",
        sortDescending: false,
        endOfVolumePolicy: "auto_next",
        catalogViewMode: "detail_list",
        viewMode: "single",
        layoutMode: "paged",
        readingDirection: "rightToLeft",
        scaleMode: "fit",
        scale: 1,
        loupeEnabled: false,
      },
    });

    await registerTestLibrary([testEntry("restored.cbz")]);

    const selector = await screen.findByLabelText("一覧表示形式");
    expect(selector).toHaveValue("detail_list");
    expect(screen.getByRole("grid")).toHaveAttribute(
      "data-catalog-view-mode",
      "detail_list",
    );
    fireEvent.change(selector, { target: { value: "small_thumbnail" } });
    expect(saveCatalogViewModeMock).toHaveBeenCalledWith(
      "small_thumbnail",
      expect.any(Number),
    );
  });

  it("FT-B05-001 connects exact and partial normalized name queries", async () => {
    const results = [
      { ...testEntry("Series/Volume 01.cbz"), kind: "archive" as const },
      { ...testEntry("Series/Volume 02.cbz"), kind: "archive" as const },
    ];
    searchMock.mockResolvedValueOnce(searchResponse(results));
    await registerTestLibrary([testEntry("root.cbz")]);

    const input = await screen.findByLabelText("名前検索");
    fireEvent.change(input, { target: { value: "  ＶＯＬＵＭＥ  " } });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));

    const region = await screen.findByRole("region", { name: "名前検索結果" });
    expect(region).toHaveAttribute("data-search-result-count", "2");
    expect(region).toHaveTextContent("Volume 01.cbz");
    expect(region).toHaveTextContent("Volume 02.cbz");
    expect(searchMock).toHaveBeenCalledWith("  ＶＯＬＵＭＥ  ", expect.any(Number));
  });

  it("FT-B05-002 keeps mixed file and folder result kinds visible", async () => {
    const results: CatalogEntry[] = [
      { relativePath: "Series" as never, kind: "folder" },
      { relativePath: "Series/Volume.cbz" as never, kind: "archive", archiveKind: "cbz" },
      { relativePath: "Series/cover.png" as never, kind: "page" },
    ];
    searchMock.mockResolvedValueOnce(searchResponse(results));
    await registerTestLibrary([testEntry("root.cbz")]);

    fireEvent.change(await screen.findByLabelText("名前検索"), {
      target: { value: "series" },
    });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));

    const region = await screen.findByRole("region", { name: "名前検索結果" });
    expect(region).toHaveAttribute("data-search-result-count", "3");
    expect(region).toHaveTextContent("フォルダ");
    expect(region).toHaveTextContent("ZIP / CBZ");
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
      });
    await registerTestLibrary([testEntry("root.cbz")]);

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

    chooseAppMenuItem("ライブラリ", "お気に入り");
    let dialog = await screen.findByRole("dialog", { name: "お気に入り" });
    fireEvent.click(within(dialog).getAllByRole("button", { name: "開く" })[0]);
    await waitFor(() => expect(screen.getByLabelText("アドレス")).toHaveValue("C:\\Comics\\Series"));
    expect(listMock).toHaveBeenLastCalledWith("Series", expect.any(Number));

    chooseAppMenuItem("ライブラリ", "お気に入り");
    dialog = await screen.findByRole("dialog", { name: "お気に入り" });
    fireEvent.click(within(dialog).getAllByRole("button", { name: "開く" })[1]);
    expect(await screen.findByLabelText("Series/01.cbz ビューワ")).toBeInTheDocument();
    expect(openMock).toHaveBeenCalledWith("Series/01.cbz", expect.any(Number));
  });

  it("FT-B06-003 restores favorites from the local API each time quick access is reopened", async () => {
    const favorite = favoriteEntry("Series", { kind: "folder" });
    listFavoritesMock.mockResolvedValue(favoritesResponse([favorite]));
    await registerTestLibrary([{ relativePath: "Series" as never, kind: "folder" }]);

    chooseAppMenuItem("ライブラリ", "お気に入り");
    const firstDialog = await screen.findByRole("dialog", { name: "お気に入り" });
    expect(within(firstDialog).getByText("Series")).toBeInTheDocument();
    fireEvent.click(within(firstDialog).getByRole("button", { name: "閉じる" }));
    chooseAppMenuItem("ライブラリ", "お気に入り");
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

    chooseAppMenuItem("ライブラリ", "お気に入り");
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

});
