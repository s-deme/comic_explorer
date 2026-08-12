import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

function markViewerPrefetchReady(): void {
  document.querySelectorAll<HTMLImageElement>(".prefetch-page")
    .forEach((image) => fireEvent.load(image));
}

function openSettingsMenuItem() {
  fireEvent.click(screen.getByRole("menuitem", { name: "オプション" }));
  fireEvent.click(
    within(screen.getByRole("menu", { name: "オプション" })).getByRole("menuitem", {
      name: "統合設定…",
    }),
  );
  const dialog = screen.getByRole("dialog", { name: "統合設定" });
  fireEvent.click(within(dialog).getByRole("button", { name: /^操作/ }));
}

function openGeneralHelp() {
  fireEvent.click(screen.getByRole("menuitem", { name: "ヘルプ" }));
  const menu = screen.getByRole("menu", { name: "ヘルプ" });
  expect(
    within(menu).queryByRole("menuitem", { name: "ショートカット設定…" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    within(menu).getByRole("menuitem", { name: "一般ヘルプ…" }),
  );
}
import {
  DEFAULT_SHORTCUTS,
  type ShortcutBindings,
} from "./features/input/shortcuts";
import { DEFAULT_MOUSE_GESTURES } from "./features/settings/profile";
import {
  getCatalogSettings,
  getItemMetadata,
  getThumbnail,
  listFolder,
  listReadingHistory,
  listTreeChildren,
  loadPage,
  openComic,
  registerLibraryRoot,
  restoreLibraryRoot,
  saveSettingsProfile,
  saveReadingPosition,
  takeRecoveryNotice,
  type CatalogSettings,
  type ItemMetadata,
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
  saveSettingsProfile: vi.fn(),
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
const listMock = vi.mocked(listFolder);
const treeMock = vi.mocked(listTreeChildren);
const restoreMock = vi.mocked(restoreLibraryRoot);
const openMock = vi.mocked(openComic);
const settingsMock = vi.mocked(getCatalogSettings);
const metadataMock = vi.mocked(getItemMetadata);
const thumbnailMock = vi.mocked(getThumbnail);
const saveSettingsMock = vi.mocked(saveSettingsProfile);
const saveReadingMock = vi.mocked(saveReadingPosition);
const recoveryNoticeMock = vi.mocked(takeRecoveryNotice);

function settingsResponse(shortcuts: Partial<ShortcutBindings> = {}) {
  return {
    status: "ok" as const,
    requestId: "settings" as never,
    generation: 1 as never,
    data: {
      sortField: "name" as const,
      sortDescending: false,
      endOfVolumePolicy: "auto_next" as const,
      catalogViewMode: "cover_list" as const,
      viewMode: "single" as const,
      layoutMode: "paged" as const,
      readingDirection: "rightToLeft" as const,
      scaleMode: "fit" as const,
      scale: 1,
      loupeEnabled: false,
      treeVisible: true,
      menuBarVisible: true,
      toolbarVisible: true,
      shortcuts: { ...DEFAULT_SHORTCUTS, ...shortcuts },
      mouseGestures: { ...DEFAULT_MOUSE_GESTURES },
    } satisfies CatalogSettings,
  };
}

function testEntry(relativePath: string): CatalogEntry {
  return {
    relativePath: relativePath as never,
    kind: "archive",
    archiveKind: "cbz",
  };
}

function testSession(itemKey: string, pageCount = 1) {
  return {
    itemKey,
    displayName: itemKey,
    pages: Array.from({ length: pageCount }, (_, index) => ({
      id: `${itemKey}-page-${index + 1}` as never,
      relativePath: `page-${index + 1}.png` as never,
      mediaUri: `data:image/png;base64,${index + 1}`,
    })),
    startIndex: 0,
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
  fireEvent.change(screen.getByLabelText("ライブラリルート"), {
    target: { value: "C:\\Comics" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登録" }));
  await screen.findByRole("grid", { name: "現在のフォルダの項目" });
}

async function openTestComic(relativePath: string) {
  const entryButton = screen
    .getByRole("grid", { name: "現在のフォルダの項目" })
    .querySelector<HTMLButtonElement>(
      `button[data-relative-path="${relativePath}"]`,
    );
  expect(entryButton).not.toBeNull();
  fireEvent.keyDown(entryButton as HTMLButtonElement, { key: "Enter" });
  await screen.findByLabelText(`${relativePath} ビューワ`);
}

describe("FR-B11 keyboard shortcut partial batch", () => {
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
    saveSettingsMock.mockReset();
    saveReadingMock.mockReset();
    recoveryNoticeMock.mockReset();

    settingsMock.mockResolvedValue(settingsResponse());
    recoveryNoticeMock.mockResolvedValue({
      status: "ok",
      requestId: "recovery" as never,
      generation: 1 as never,
      data: false,
    });
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
    metadataMock.mockImplementation(async (itemIdentity) => ({
      status: "ok",
      requestId: "metadata" as never,
      generation: 1 as never,
      data: {
        itemIdentity: itemIdentity as ItemMetadata["itemIdentity"],
        memo: null,
        rating: null,
      },
    }));
    saveReadingMock.mockResolvedValue({
      status: "ok",
      requestId: "reading" as never,
      generation: 1 as never,
      data: undefined,
    });
    saveSettingsMock.mockImplementation(async (profile) => ({
      status: "ok",
      requestId: "settings-save" as never,
      generation: 1 as never,
      data: {
        ...profile,
      },
    }));
  });

  it("FT-B11-001 remaps, rejects conflicts, and resets the production command mapping", async () => {
    render(<App />);
    await registerTestLibrary([]);
    openSettingsMenuItem();

    const dialog = screen.getByRole("dialog", {
      name: "統合設定",
    });
    const nextInput = screen.getByRole("textbox", {
      name: "次ページショートカット",
    });
    expect(nextInput).toHaveValue("PageDown");
    fireEvent.keyDown(nextInput, { key: "N" });
    await waitFor(() => expect(nextInput).toHaveValue("N"));
    expect(saveSettingsMock).not.toHaveBeenCalled();

    const previousInput = screen.getByRole("textbox", {
      name: "前ページショートカット",
    });
    fireEvent.keyDown(previousInput, { key: "N" });
    expect(await within(dialog).findByRole("status")).toHaveTextContent("次ページ");
    expect(previousInput).toHaveValue("PageUp");

    const apply = dialog.querySelector<HTMLButtonElement>(
      '[data-product-id="shortcut-apply"]',
    );
    expect(apply).not.toBeNull();
    fireEvent.click(apply as HTMLButtonElement);
    await waitFor(() =>
      expect(saveSettingsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          shortcuts: expect.objectContaining({ nextPage: "N" }),
        }),
        expect.any(Number),
      ),
    );
    expect(await screen.findByText("設定profileを適用しました。")).toHaveAttribute(
      "role",
      "status",
    );
    expect(dialog).not.toBeInTheDocument();

    openSettingsMenuItem();
    const resetDialog = screen.getByRole("dialog", {
      name: "統合設定",
    });
    const resetNextInput = screen.getByRole("textbox", {
      name: "次ページショートカット",
    });
    expect(resetNextInput).toHaveValue("N");
    fireEvent.click(
      within(resetDialog).getByRole("button", { name: "すべて既定に戻す" }),
    );
    await waitFor(() => expect(resetNextInput).toHaveValue("PageDown"));
    expect(saveSettingsMock).toHaveBeenCalledTimes(1);
    expect(resetDialog).toHaveTextContent("表示と操作を、使い方に合わせて調整します");

    const resetApply = resetDialog.querySelector<HTMLButtonElement>(
      '[data-product-id="shortcut-apply"]',
    );
    expect(resetApply).not.toBeNull();
    fireEvent.click(resetApply as HTMLButtonElement);
    await waitFor(() => expect(saveSettingsMock).toHaveBeenCalledTimes(2));
    expect(saveSettingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ shortcuts: DEFAULT_SHORTCUTS }),
      expect.any(Number),
    );
    await waitFor(() => expect(resetDialog).not.toBeInTheDocument());
  });

  it("FT-B11-004 keeps keyboard fallback, suppresses focused input, and stops at the Viewer/navigation boundary", async () => {
    const entry = testEntry("book.cbz");
    settingsMock.mockResolvedValue(settingsResponse({ nextPage: "N" }));
    openMock.mockResolvedValue({
      status: "ok",
      requestId: "open" as never,
      generation: 1 as never,
      data: testSession("book.cbz", 2),
    });
    render(<App />);
    await registerTestLibrary([entry]);
    await openTestComic("book.cbz");
    markViewerPrefetchReady();

    fireEvent.keyDown(window, { key: "N" });
    await waitFor(() => expect(screen.getByText("2 / 2")).toBeInTheDocument());

    const scaleInput = screen.getByRole("spinbutton", { name: "任意倍率（%）" });
    fireEvent.keyDown(scaleInput, { key: "N" });
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "PageUp" });
    await waitFor(() => expect(screen.getByText("1 / 2")).toBeInTheDocument());
    fireEvent.keyDown(window, { key: "PageDown" });
    await waitFor(() => expect(screen.getByText("2 / 2")).toBeInTheDocument());

    fireEvent.keyDown(window, { key: "N" });
    expect(
      await screen.findByText("巻末です。次の漫画はありません。"),
    ).toHaveAttribute("role", "status");
    expect(openMock).toHaveBeenCalledTimes(1);
  });

  it("FT-B11-005 persists across restart and keeps help read-only with safe default recovery", async () => {
    settingsMock.mockResolvedValue(
      settingsResponse({ nextPage: "N", previousPage: "N" }),
    );
    render(<App />);
    await registerTestLibrary([]);
    openSettingsMenuItem();
    expect(
      await screen.findByRole("dialog", { name: "統合設定" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "次ページショートカット" }),
    ).toHaveValue("PageDown");
    expect(
      screen.getByRole("textbox", { name: "前ページショートカット" }),
    ).toHaveValue("PageUp");

    cleanup();
    settingsMock.mockResolvedValue(settingsResponse({ nextPage: "N" }));
    render(<App />);
    await registerTestLibrary([]);
    openSettingsMenuItem();
    expect(
      await screen.findByRole("textbox", { name: "次ページショートカット" }),
    ).toHaveValue("N");
    expect(
      screen.getByRole("textbox", { name: "次ページショートカット" }),
    ).toHaveAccessibleName("次ページショートカット");

    fireEvent.click(
      within(screen.getByRole("dialog", { name: "統合設定" })).getByRole(
        "button",
        { name: "キャンセル" },
      ),
    );
    openGeneralHelp();
    const help = screen.getByRole("dialog", { name: "キー操作とショートカット" });
    expect(within(help).getByRole("heading", { name: "現在のショートカット" }))
      .toBeInTheDocument();
    expect(
      within(help).queryByRole("button", { name: "ショートカット設定を開く" }),
    ).not.toBeInTheDocument();
  });
});
