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
  listTreeChildren,
  listFolder,
  openComic,
  pickLibraryRoot,
  registerLibraryRoot,
  restoreLibraryRoot,
  saveCatalogSort,
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
  saveCatalogSort: vi.fn(),
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
const saveSortMock = vi.mocked(saveCatalogSort);
const saveViewerMock = vi.mocked(saveViewerSettings);
const recoveryNoticeMock = vi.mocked(takeRecoveryNotice);

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
    saveSortMock.mockReset();
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
        viewMode: "single",
        readingDirection: "rightToLeft",
      },
    });
    saveSortMock.mockResolvedValue({
      status: "ok",
      requestId: "save-sort" as never,
      generation: 1 as never,
      data: {
        sortField: "name",
        sortDescending: false,
        viewMode: "single",
        readingDirection: "rightToLeft",
      },
    });
    saveViewerMock.mockResolvedValue({
      status: "ok",
      requestId: "save-viewer" as never,
      generation: 1 as never,
      data: {
        sortField: "name",
        sortDescending: false,
        viewMode: "single",
        readingDirection: "rightToLeft",
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
});
