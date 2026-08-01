import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  getCatalogSettings,
  getThumbnail,
  loadPage,
  listTreeChildren,
  listFolder,
  openComic,
  pickLibraryRoot,
  registerLibraryRoot,
  restoreLibraryRoot,
  saveCatalogSort,
  saveCatalogViewMode,
  saveEndOfVolumePolicy,
  saveReadingPosition,
  saveViewerSettings,
  takeRecoveryNotice,
} from "./features/library/client";
import type { CatalogEntry, ErrorCode } from "./types/domain";

vi.mock("./features/library/client", () => ({
  registerLibraryRoot: vi.fn(),
  pickLibraryRoot: vi.fn(),
  listFolder: vi.fn(),
  listTreeChildren: vi.fn(),
  restoreLibraryRoot: vi.fn(),
  openComic: vi.fn(),
  getCatalogSettings: vi.fn(),
  getThumbnail: vi.fn(),
  loadPage: vi.fn(),
  saveCatalogSort: vi.fn(),
  saveCatalogViewMode: vi.fn(),
  saveEndOfVolumePolicy: vi.fn(),
  saveReadingPosition: vi.fn(),
  saveViewerSettings: vi.fn(),
  takeRecoveryNotice: vi.fn(),
}));

const registerMock = vi.mocked(registerLibraryRoot);
const pickerMock = vi.mocked(pickLibraryRoot);
const listMock = vi.mocked(listFolder);
const treeMock = vi.mocked(listTreeChildren);
const restoreMock = vi.mocked(restoreLibraryRoot);
const openMock = vi.mocked(openComic);
const settingsMock = vi.mocked(getCatalogSettings);
const thumbnailMock = vi.mocked(getThumbnail);
const loadPageMock = vi.mocked(loadPage);
const saveSortMock = vi.mocked(saveCatalogSort);
const saveCatalogViewModeMock = vi.mocked(saveCatalogViewMode);
const saveEndPolicyMock = vi.mocked(saveEndOfVolumePolicy);
const saveReadingMock = vi.mocked(saveReadingPosition);
const saveViewerMock = vi.mocked(saveViewerSettings);
const recoveryNoticeMock = vi.mocked(takeRecoveryNotice);

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

async function registerTestLibrary(entries: CatalogEntry[]) {
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
  render(<App />);
  fireEvent.change(screen.getByLabelText("ライブラリルート"), {
    target: { value: "C:\\Comics" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登録" }));
  await screen.findByRole("grid", { name: "現在のフォルダの項目" });
}

async function openTestComic(relativePath: string) {
  fireEvent.keyDown(
    await screen.findByRole("button", { name: new RegExp(relativePath) }),
    { key: "Enter" },
  );
  await screen.findByLabelText(`${relativePath} ビューワ`);
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
    thumbnailMock.mockReset();
    loadPageMock.mockReset();
    saveSortMock.mockReset();
    saveCatalogViewModeMock.mockReset();
    saveEndPolicyMock.mockReset();
    saveReadingMock.mockReset();
    saveViewerMock.mockReset();
    recoveryNoticeMock.mockReset();
    recoveryNoticeMock.mockResolvedValue({
      status: "ok",
      requestId: "recovery" as never,
      generation: 1 as never,
      data: false,
    });
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

  it("shows a recoverable folder error without removing navigation", async () => {
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
        message: "アクセスできません。",
        retryable: true,
      },
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText("ライブラリルート"), {
      target: { value: "C:\\Comics" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "アクセスできません。",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("対象: C:\\Comics");
    expect(screen.getByTitle("戻る")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });

  it.each([
    ["ACCESS_DENIED", "アクセスできません"],
    ["NOT_FOUND", "見つかりません"],
    ["UNSUPPORTED_FORMAT", "対応していません"],
    ["CORRUPT_ARCHIVE", "データが破損しています"],
    ["ENCRYPTED_ARCHIVE", "暗号化されています"],
    ["RESOURCE_LIMIT", "一時的に使用できません"],
  ] satisfies [ErrorCode, string][])(
    "renders %s as fixed copy with target and recovery actions",
    async (code, expected) => {
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
          code,
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

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(expected);
      expect(alert).toHaveTextContent("対象: C:\\Comics");
      expect(alert).not.toHaveTextContent("secret stack");
      expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "別のフォルダを選択" }),
      ).toBeInTheDocument();
    },
  );

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

    const trigger = screen.getByRole("button", { name: "ヘルプ" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(trigger).toHaveFocus());
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
    await openTestComic(first.relativePath);
    fireEvent.keyDown(window, { key: "ArrowLeft" });

    expect(
      await screen.findByLabelText(`${second.relativePath} ビューワ`),
    ).toBeInTheDocument();
    expect(openMock).toHaveBeenNthCalledWith(
      2,
      second.relativePath,
      expect.any(Number),
    );
  });

  it("returns to the library from the Viewer end callback for return_library", async () => {
    const first = testEntry("01-first.cbz");
    const second = testEntry("02-second.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(first.relativePath));

    await registerTestLibrary([first, second]);
    fireEvent.change(await screen.findByLabelText("巻末動作"), {
      target: { value: "return_library" },
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
    await openTestComic(only.relativePath);
    fireEvent.keyDown(window, { key: "ArrowLeft" });

    const notice = await screen.findByText("巻末です。次の漫画はありません。");
    expect(notice).toHaveAttribute("role", "status");
    expect(
      screen.getByLabelText(`${only.relativePath} ビューワ`),
    ).toBeInTheDocument();
    expect(openMock).toHaveBeenCalledTimes(1);
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
});
