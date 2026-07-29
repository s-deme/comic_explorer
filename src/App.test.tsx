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
  listTreeChildren,
  listFolder,
  openComic,
  pickLibraryRoot,
  registerLibraryRoot,
  restoreLibraryRoot,
  saveCatalogSort,
  saveViewerSettings,
} from "./features/library/client";

vi.mock("./features/library/client", () => ({
  registerLibraryRoot: vi.fn(),
  pickLibraryRoot: vi.fn(),
  listFolder: vi.fn(),
  listTreeChildren: vi.fn(),
  restoreLibraryRoot: vi.fn(),
  openComic: vi.fn(),
  getCatalogSettings: vi.fn(),
  saveCatalogSort: vi.fn(),
  saveViewerSettings: vi.fn(),
}));

const registerMock = vi.mocked(registerLibraryRoot);
const pickerMock = vi.mocked(pickLibraryRoot);
const listMock = vi.mocked(listFolder);
const treeMock = vi.mocked(listTreeChildren);
const restoreMock = vi.mocked(restoreLibraryRoot);
const openMock = vi.mocked(openComic);
const settingsMock = vi.mocked(getCatalogSettings);
const saveSortMock = vi.mocked(saveCatalogSort);
const saveViewerMock = vi.mocked(saveViewerSettings);

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
    saveSortMock.mockReset();
    saveViewerMock.mockReset();
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
    expect(screen.getByTitle("戻る")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
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

    const trigger = screen.getByRole("button", { name: "ヘルプ" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
