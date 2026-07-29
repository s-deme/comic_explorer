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
  listFolder,
  openComic,
  registerLibraryRoot,
  restoreLibraryRoot,
  saveCatalogSort,
} from "./features/library/client";

vi.mock("./features/library/client", () => ({
  registerLibraryRoot: vi.fn(),
  listFolder: vi.fn(),
  restoreLibraryRoot: vi.fn(),
  openComic: vi.fn(),
  getCatalogSettings: vi.fn(),
  saveCatalogSort: vi.fn(),
}));

const registerMock = vi.mocked(registerLibraryRoot);
const listMock = vi.mocked(listFolder);
const restoreMock = vi.mocked(restoreLibraryRoot);
const openMock = vi.mocked(openComic);
const settingsMock = vi.mocked(getCatalogSettings);
const saveSortMock = vi.mocked(saveCatalogSort);

describe("application shell", () => {
  afterEach(cleanup);

  beforeEach(() => {
    registerMock.mockReset();
    listMock.mockReset();
    restoreMock.mockReset();
    openMock.mockReset();
    settingsMock.mockReset();
    saveSortMock.mockReset();
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "settings" as never,
      generation: 1 as never,
      data: { sortField: "name", sortDescending: false },
    });
    saveSortMock.mockResolvedValue({
      status: "ok",
      requestId: "save-sort" as never,
      generation: 1 as never,
      data: { sortField: "name", sortDescending: false },
    });
    restoreMock.mockResolvedValue({
      status: "ok",
      requestId: "restore" as never,
      generation: 1 as never,
      data: null,
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
});
