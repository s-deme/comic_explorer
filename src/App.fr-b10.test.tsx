import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

function openTagsMenuItem() {
  fireEvent.click(screen.getByRole("menuitem", { name: "オプション" }));
  fireEvent.click(
    within(screen.getByRole("menu", { name: "オプション" })).getByRole("menuitem", {
      name: "タグ管理",
    }),
  );
}
import {
  addFavorite,
  assignTag,
  cancelLibraryDiagnostics,
  diagnoseLibrary,
  getCatalogSettings,
  getItemMetadata,
  getItemTags,
  getThumbnail,
  listFavorites,
  listFolder,
  listReadingHistory,
  listTags,
  listTreeChildren,
  loadPage,
  openComic,
  pickLibraryRoot,
  queryTags,
  registerLibraryRoot,
  removeFavorite,
  removeTag,
  renameTag,
  resolveFavorite,
  restoreLibraryRoot,
  saveCatalogSort,
  saveCatalogViewMode,
  saveEndOfVolumePolicy,
  saveItemMemo,
  saveReadingPosition,
  saveViewerSettings,
  searchLibrary,
  setItemRating,
  takeRecoveryNotice,
  type TagEntry,
} from "./features/library/client";
import type { CatalogEntry } from "./types/domain";

vi.mock("./features/library/client", () => ({
  addFavorite: vi.fn(),
  assignTag: vi.fn(),
  cancelLibraryDiagnostics: vi.fn(),
  diagnoseLibrary: vi.fn(),
  getCatalogSettings: vi.fn(),
  getItemMetadata: vi.fn(),
  getItemTags: vi.fn(),
  getThumbnail: vi.fn(),
  listFavorites: vi.fn(),
  listFolder: vi.fn(),
  listenCatalogFolderChanges: vi.fn(async () => () => undefined),
  listenRecursiveThumbnailProgress: vi.fn(async () => () => undefined),
  generateRecursiveThumbnails: vi.fn(async () => ({ status: "cancelled" })),
  cancelRecursiveThumbnailGeneration: vi.fn(async () => ({ status: "cancelled" })),
  watchLibraryFolder: vi.fn(async () => ({ status: "cancelled" })),
  stopLibraryFolderWatch: vi.fn(async () => ({ status: "cancelled" })),
  listReadingHistory: vi.fn(),
  listTags: vi.fn(),
  listTreeChildren: vi.fn(),
  listWindowsDrives: vi.fn(async () => ({
    status: "ok", requestId: "drives", generation: 1,
    data: [{ absolutePath: "C:\\", name: "ローカル ディスク (C:)" }],
  })),
  listWindowsKnownFolders: vi.fn(async () => ({
    status: "ok", requestId: "known-folders", generation: 1, data: [],
  })),
  loadPage: vi.fn(),
  copyViewerPageToClipboard: vi.fn(),
  openComic: vi.fn(),
  resolveCatalogActivation: vi.fn(async (kind: string) => ({ status: "ok", data: kind === "folder" || kind === "comicFolder" ? "navigate" : "read" })),
  resolveViewerRectangleZoom: vi.fn(),
  pickLibraryRoot: vi.fn(),
  queryTags: vi.fn(),
  registerLibraryRoot: vi.fn(),
  removeFavorite: vi.fn(),
  removeTag: vi.fn(),
  renameTag: vi.fn(),
  resolveFavorite: vi.fn(),
  restoreLibraryRoot: vi.fn(),
  takeCliLaunchRequest: vi.fn(async () => ({ status: "ok", data: null })),
  listenCliLaunchPending: vi.fn(async () => () => undefined),
  saveCatalogSort: vi.fn(),
  saveCatalogViewMode: vi.fn(),
  saveEndOfVolumePolicy: vi.fn(),
  saveItemMemo: vi.fn(),
  saveReadingPosition: vi.fn(),
  saveSettingsProfile: vi.fn(),
  listNamedSettingsProfiles: vi.fn(async () => ({ status: "ok", data: [] })),
  saveNamedSettingsProfile: vi.fn(),
  previewNamedSettingsProfileSwitch: vi.fn(),
  executeNamedSettingsProfileSwitch: vi.fn(),
  deleteNamedSettingsProfile: vi.fn(),
  saveViewerSettings: vi.fn(),
  getTrayStatus: vi.fn(),
  storeMainWindowInTray: vi.fn(),
  quitApplication: vi.fn(),
  searchLibrary: vi.fn(),
  setItemRating: vi.fn(),
  takeRecoveryNotice: vi.fn(),
  listCsvExportPresets: vi.fn(async () => ({ status: "ok", data: [] })),
  saveCsvExportPreset: vi.fn(),
  deleteCsvExportPreset: vi.fn(),
  exportCatalogCsv: vi.fn(),
}));

const registerMock = vi.mocked(registerLibraryRoot);
const listFolderMock = vi.mocked(listFolder);
const getCatalogSettingsMock = vi.mocked(getCatalogSettings);
const getItemTagsMock = vi.mocked(getItemTags);
const getThumbnailMock = vi.mocked(getThumbnail);
const listTagsMock = vi.mocked(listTags);
const queryTagsMock = vi.mocked(queryTags);
const assignTagMock = vi.mocked(assignTag);
const removeTagMock = vi.mocked(removeTag);
const renameTagMock = vi.mocked(renameTag);
const restoreMock = vi.mocked(restoreLibraryRoot);
const takeRecoveryNoticeMock = vi.mocked(takeRecoveryNotice);

function response<T>(data: T, requestId = "fr-b10") {
  return {
    status: "ok" as const,
    requestId: requestId as never,
    generation: 1 as never,
    data,
  };
}

function tag(tagId: string, name: string, itemCount = 1): TagEntry {
  return { tagId, name, itemCount };
}

function itemTags(tags: TagEntry[]) {
  return {
    itemIdentity: "Series/01.cbz" as never,
    tags,
  };
}

function testEntry(relativePath: string): CatalogEntry {
  return {
    relativePath: relativePath as never,
    kind: "archive",
    archiveKind: "cbz",
  };
}

async function registerTestLibrary(entries: CatalogEntry[]) {
  restoreMock.mockResolvedValue(response({ absolutePath: "C:\\" }, "restore") as never);
  registerMock.mockResolvedValue(response({ absolutePath: "C:\\" }) as never);
  listFolderMock.mockResolvedValue(response(entries, "list") as never);
  await Promise.resolve();
  render(<App />);
  await screen.findByRole("grid", { name: "現在のフォルダの項目" });
}

async function openTagsForSelectedItem() {
  const grid = await screen.findByRole("grid", { name: "現在のフォルダの項目" });
  const item = within(grid).getByRole("button", { name: /01\.cbz/ });
  fireEvent.click(item);
  openTagsMenuItem();
  return screen.findByRole("dialog", { name: "タグ管理" });
}

describe("FR-B10 connected tag management", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    getCatalogSettingsMock.mockResolvedValue(
      response({
        sortField: "name",
        sortDescending: false,
        endOfVolumePolicy: "auto_next",
        catalogViewMode: "cover_list",
        catalogThumbnailSizes: { smallThumbnail: 104, coverList: 144, cardGrid: 216, referenceTile: 128 },
        viewMode: "single",
        layoutMode: "paged",
        readingDirection: "rightToLeft",
        scaleMode: "fit",
        scale: 1,
        loupeEnabled: false,
        viewerBackground: "checker",
        viewerPageMargin: 0,
        viewerSpreadGap: 8,
        cursorAutoHideMs: 0,
        treeVisible: true,
        treeAutoCollapse: false,
        treeConfirmChildren: true,
        treeWidth: 240,
        menuBarVisible: true,
        toolbarVisible: true,
        shortcuts: {},
        mouseGestures: {},
      }, "settings") as never,
    );
    takeRecoveryNoticeMock.mockResolvedValue(response(false, "recovery") as never);
    restoreMock.mockResolvedValue(response(null, "restore") as never);
    vi.mocked(pickLibraryRoot).mockResolvedValue(response(null, "picker") as never);
    vi.mocked(listTreeChildren).mockResolvedValue(response([], "tree") as never);
    getThumbnailMock.mockResolvedValue({
      status: "error",
      requestId: "thumbnail" as never,
      generation: 1 as never,
      error: {
        code: "NOT_FOUND",
        message: "thumbnail fixture intentionally unavailable",
        retryable: true,
      },
    } as never);
    vi.mocked(listFavorites).mockResolvedValue(response([], "favorites") as never);
    vi.mocked(listReadingHistory).mockResolvedValue(response([], "history") as never);
    vi.mocked(getItemMetadata).mockResolvedValue(response(null, "metadata") as never);
    vi.mocked(openComic).mockResolvedValue(response(null, "open") as never);
    vi.mocked(loadPage).mockResolvedValue(response(null, "page") as never);
    vi.mocked(saveCatalogSort).mockResolvedValue(response(null, "sort") as never);
    vi.mocked(saveCatalogViewMode).mockResolvedValue(response(null, "view") as never);
    vi.mocked(saveEndOfVolumePolicy).mockResolvedValue(response(null, "policy") as never);
    vi.mocked(saveItemMemo).mockResolvedValue(response(null, "memo") as never);
    vi.mocked(saveReadingPosition).mockResolvedValue(response(undefined, "position") as never);
    vi.mocked(saveViewerSettings).mockResolvedValue(response(null, "viewer") as never);
    vi.mocked(setItemRating).mockResolvedValue(response(null, "rating") as never);
    vi.mocked(searchLibrary).mockResolvedValue(response([], "search") as never);
    vi.mocked(addFavorite).mockResolvedValue(response([], "add-favorite") as never);
    vi.mocked(removeFavorite).mockResolvedValue(response([], "remove-favorite") as never);
    vi.mocked(resolveFavorite).mockResolvedValue(response([], "resolve-favorite") as never);
    vi.mocked(diagnoseLibrary).mockResolvedValue(response(null, "diagnose") as never);
    vi.mocked(cancelLibraryDiagnostics).mockResolvedValue(response(undefined, "cancel") as never);
    getItemTagsMock.mockResolvedValue(response(itemTags([]), "item-tags") as never);
    listTagsMock.mockResolvedValue(response([], "tags") as never);
    queryTagsMock.mockResolvedValue(response([], "tag-query") as never);
    assignTagMock.mockResolvedValue(response(itemTags([]), "assign") as never);
    removeTagMock.mockResolvedValue(response(itemTags([]), "remove") as never);
    renameTagMock.mockResolvedValue(response(tag("tag-renamed", "renamed"), "rename") as never);
  });

  it("FT-B10-001 assigns and removes tags through the connected client", async () => {
    const favorite = tag("tag-favorite", "favorite");
    listTagsMock.mockResolvedValue(response([favorite], "tags") as never);
    assignTagMock.mockResolvedValue(response(itemTags([favorite]), "assign") as never);
    removeTagMock.mockResolvedValue(response(itemTags([]), "remove") as never);
    await registerTestLibrary([testEntry("Series/01.cbz")]);
    const tagDialog = await openTagsForSelectedItem();

    fireEvent.change(screen.getByLabelText("タグ名"), {
      target: { value: " Ｆａｖｏｒｉｔｅ " },
    });
    fireEvent.click(screen.getByRole("button", { name: "タグを付与" }));
    await waitFor(() =>
      expect(assignTagMock).toHaveBeenCalledWith(
        "Series/01.cbz",
        " Ｆａｖｏｒｉｔｅ ",
        expect.any(Number),
      ),
    );
    const selectedTags = within(tagDialog).getByLabelText("選択項目のタグ");
    const tagList = within(tagDialog).getByRole("list", { name: "タグ一覧" });
    expect(
      await within(selectedTags).findByRole("button", {
        name: "favoriteを除去",
      }),
    ).toBeInTheDocument();
    expect(
      await within(tagList).findByRole("textbox", {
        name: "favoriteの新名称",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(selectedTags).getByRole("button", { name: "favoriteを除去" }),
    );
    await waitFor(() =>
      expect(removeTagMock).toHaveBeenCalledWith(
        "Series/01.cbz",
        "tag-favorite",
        expect.any(Number),
      ),
    );
  });

  it("FT-B10-002 searches Unicode tags and treats empty query as local listing", async () => {
    const allTags = [tag("tag-favorite", "favorite"), tag("tag-reading", "読書")];
    listTagsMock.mockResolvedValue(response(allTags, "tags") as never);
    queryTagsMock.mockResolvedValue(
      response([allTags[0]!], "tag-query") as never,
    );
    await registerTestLibrary([testEntry("Series/01.cbz")]);
    const tagDialog = await openTagsForSelectedItem();

    const queryInput = screen.getByLabelText("タグ検索");
    fireEvent.change(queryInput, { target: { value: "ＦＡＶ" } });
    await waitFor(() =>
      expect(queryTagsMock).toHaveBeenCalledWith("ＦＡＶ", expect.any(Number)),
    );
    const tagList = within(tagDialog).getByRole("list", { name: "タグ一覧" });
    expect(
      await within(tagList).findByRole("textbox", {
        name: "favoriteの新名称",
      }),
    ).toBeInTheDocument();

    fireEvent.change(queryInput, { target: { value: "" } });
    await waitFor(() => expect(listTagsMock).toHaveBeenCalled());
    expect(queryTagsMock).toHaveBeenCalledTimes(1);
  });

  it("FT-B10-003 exposes rename and duplicate-merge results from the backend", async () => {
    const red = tag("tag-red", "red");
    const blue = tag("tag-blue", "blue", 2);
    listTagsMock
      .mockResolvedValueOnce(response([red], "tags-initial") as never)
      .mockResolvedValue(response([blue], "tags-renamed") as never);
    renameTagMock.mockResolvedValue(response(blue, "rename") as never);
    await registerTestLibrary([testEntry("Series/01.cbz")]);
    const tagDialog = await openTagsForSelectedItem();

    fireEvent.change(screen.getByLabelText("redの新名称"), {
      target: { value: " Ｂｌｕｅ " },
    });
    fireEvent.click(screen.getByRole("button", { name: "redをrename" }));
    await waitFor(() =>
      expect(renameTagMock).toHaveBeenCalledWith(
        "tag-red",
        " Ｂｌｕｅ ",
        expect.any(Number),
      ),
    );
    const tagList = within(tagDialog).getByRole("list", { name: "タグ一覧" });
    expect(
      await within(tagList).findByRole("textbox", {
        name: "blueの新名称",
      }),
    ).toBeInTheDocument();
    expect(
      within(tagList).getByRole("button", {
        name: "blueをrename",
      }),
    ).toBeInTheDocument();
    expect(within(tagList).getByText("2件", { exact: true })).toBeInTheDocument();
  });

  it("FT-B10-004 restores persisted tags when the connected panel is reopened", async () => {
    const persisted = tag("tag-persisted", "persisted");
    listTagsMock.mockResolvedValue(response([persisted], "tags") as never);
    getItemTagsMock.mockResolvedValue(response(itemTags([persisted]), "item-tags") as never);
    await registerTestLibrary([testEntry("Series/01.cbz")]);
    const tagDialog = await openTagsForSelectedItem();
    const selectedTags = within(tagDialog).getByLabelText("選択項目のタグ");
    const tagList = within(tagDialog).getByRole("list", { name: "タグ一覧" });
    expect(
      await within(selectedTags).findByRole("button", {
        name: "persistedを除去",
      }),
    ).toBeInTheDocument();
    expect(
      await within(tagList).findByRole("textbox", {
        name: "persistedの新名称",
      }),
    ).toBeInTheDocument();
    expect(
      within(tagDialog).getByText("選択中: Series/01.cbz", { exact: true }),
    ).toBeInTheDocument();
    expect(getItemTagsMock).toHaveBeenCalledWith("Series/01.cbz", expect.any(Number));
    getItemTagsMock.mockClear();

    fireEvent.click(within(tagDialog).getByRole("button", { name: "閉じる" }));
    openTagsMenuItem();
    await waitFor(() =>
      expect(getItemTagsMock).toHaveBeenCalledWith(
        "Series/01.cbz",
        expect.any(Number),
      ),
    );
    const reopenedDialog = screen.getByRole("dialog", { name: "タグ管理" });
    const reopenedSelectedTags = within(reopenedDialog).getByLabelText(
      "選択項目のタグ",
    );
    const reopenedTagList = within(reopenedDialog).getByRole("list", {
      name: "タグ一覧",
    });
    expect(
      within(reopenedSelectedTags).getByRole("button", {
        name: "persistedを除去",
      }),
    ).toBeInTheDocument();
    expect(
      within(reopenedTagList).getByRole("textbox", {
        name: "persistedの新名称",
      }),
    ).toBeInTheDocument();
  });
});
