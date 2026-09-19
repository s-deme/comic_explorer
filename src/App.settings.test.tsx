import "./test/app-harness";
import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  SETTINGS_PROFILE_VERSION
} from "./features/settings/profile";
import { testArchiveEntry as testEntry } from "./test/catalog-fixtures";

import {
  chooseAppMenuItem,
  clearHistoryMock,
  DEFAULT_CATALOG_SETTINGS,
  executeNamedSettingsProfileSwitchMock,
  historyMock,
  historyResponse,
  installAppTestHooks,
  listMock,
  listNamedSettingsProfilesMock,
  openAppMenu,
  openMock,
  previewNamedSettingsProfileSwitchMock,
  quitApplicationMock,
  registerMock,
  registerTestLibrary,
  restoreMock,
  saveNamedSettingsProfileMock,
  saveSettingsProfileMock,
  settingsMock,
  storeMainWindowInTrayMock,
  thumbnailMock,
  viewerResponse
} from "./test/app-harness";

describe("application settings", () => {
  installAppTestHooks({ viewerSpreadGap: 0 });
  it("REQ-LEY-P3-019 saves with overwrite confirmation and switches an atomic Rust profile", async () => {
    const switchedProfile = {
      profileVersion: SETTINGS_PROFILE_VERSION,
      ...DEFAULT_CATALOG_SETTINGS,
      sortField: "size" as const,
    };
    listNamedSettingsProfilesMock.mockResolvedValue({
      status: "ok",
      requestId: "named-profiles" as never,
      generation: 1 as never,
      data: [{ name: "Work", updatedAtMs: 1, active: false }],
    });
    previewNamedSettingsProfileSwitchMock.mockResolvedValue({
      status: "ok",
      requestId: "profile-preview" as never,
      generation: 2 as never,
      data: {
        name: "Work",
        changedFieldCount: 1,
        profile: switchedProfile,
        confirmationKey: "opaque-profile-key",
      },
    });
    executeNamedSettingsProfileSwitchMock.mockResolvedValue({
      status: "ok",
      requestId: "profile-switch" as never,
      generation: 3 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS, sortField: "size" },
    });
    await registerTestLibrary([testEntry("book.cbz")]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^プロファイル/ }));
    await within(dialog).findByText("Work");

    fireEvent.change(within(dialog).getByLabelText("保存するprofile名"), {
      target: { value: " Work " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "現在の下書きを保存" }));
    expect(within(dialog).getByRole("group", { name: "profile上書き確認" }))
      .toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "上書きを確認" }));
    await waitFor(() => expect(saveNamedSettingsProfileMock).toHaveBeenCalledWith(
      "Work",
      expect.objectContaining({ profileVersion: SETTINGS_PROFILE_VERSION }),
      true,
      expect.any(Number),
    ));

    fireEvent.click(within(dialog).getByRole("button", { name: "切り替える" }));
    const confirmation = await within(dialog).findByRole("group", { name: "profile切替確認" });
    expect(within(confirmation).getByText(/1項目が変わります/)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "切替を確認" }));
    await waitFor(() => expect(executeNamedSettingsProfileSwitchMock).toHaveBeenCalledWith(
      "Work",
      "opaque-profile-key",
      true,
      expect.any(Number),
    ));
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();
    expect(await screen.findByText("設定profile「Work」へ切り替えました。"))
      .toBeInTheDocument();
  });

  it("FT-B19-001 keeps integrated settings as a draft until Cancel", async () => {
    await registerTestLibrary([testEntry("book.cbz")]);
    chooseAppMenuItem("オプション", "統合設定…");
    let dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    expect(within(categories).getByRole("button", { name: /^一覧表示/ }))
      .toHaveAttribute("aria-current", "page");
    fireEvent.click(within(categories).getByRole("button", { name: /^操作/ }));
    const inputGroups = within(dialog).getByRole("navigation", { name: "操作と入力の分類" });
    expect(within(inputGroups).getAllByRole("button").map((button) => button.textContent)).toEqual([
      expect.stringContaining("キー設定"),
      expect.stringContaining("マウス設定"),
      expect.stringContaining("ジェスチャー設定"),
    ]);
    expect(within(dialog).queryByLabelText("doubleClickジェスチャー"))
      .not.toBeInTheDocument();
    fireEvent.click(within(inputGroups).getByRole("button", { name: /^ジェスチャー設定/ }));
    expect(within(dialog).getByText("doubleClick: 全画面表示／解除（固定）"))
      .toBeInTheDocument();
    fireEvent.click(within(categories).getByRole("button", { name: /^一覧表示/ }));
    fireEvent.change(within(dialog).getByLabelText("profile一覧形式"), {
      target: { value: "reference_tile" },
    });
    const draftInformationCardSize = within(dialog).getByRole("spinbutton", {
      name: "profile情報カードのサイズ（px）",
    });
    const draftCardGridSize = within(dialog).getByRole("spinbutton", {
      name: "profileカードグリッドのサイズ（px）",
    });
    expect(draftInformationCardSize).toHaveValue(128);
    expect(draftCardGridSize).toHaveValue(216);
    expect(draftCardGridSize).toHaveAttribute("min", "64");
    expect(draftCardGridSize).toHaveAttribute("max", "320");
    fireEvent.change(draftInformationCardSize, { target: { value: "176" } });
    fireEvent.change(draftCardGridSize, { target: { value: "224" } });
    fireEvent.click(within(categories).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profileフォルダツリー"));
    fireEvent.click(within(categories).getByRole("button", { name: /^ビューワ/ }));
    const draftScale = within(dialog).getByRole("spinbutton", {
      name: "profile任意倍率（%）",
    });
    expect(draftScale).toHaveValue(100);
    expect(draftScale).toHaveAttribute("min", "1");
    expect(draftScale).toHaveAttribute("max", "800");
    expect(draftScale).toHaveAttribute("step", "1");
    fireEvent.change(draftScale, { target: { value: "175" } });
    fireEvent.click(within(categories).getByRole("button", { name: /^操作/ }));
    fireEvent.click(within(inputGroups).getByRole("button", { name: /^キー設定/ }));
    fireEvent.keyDown(within(dialog).getByLabelText("次ページショートカット"), {
      key: "j",
      ctrlKey: true,
    });
    fireEvent.click(within(inputGroups).getByRole("button", { name: /^ジェスチャー設定/ }));
    fireEvent.change(within(dialog).getByLabelText("middleClickジェスチャー"), {
      target: { value: "toggleDirection" },
    });
    fireEvent.click(within(inputGroups).getByRole("button", { name: /^マウス設定/ }));
    fireEvent.change(within(dialog).getByLabelText("profile一覧中央ボタン割当"), {
      target: { value: "toggleSearch" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileViewer左上クリック割当"), {
      target: { value: "zoomIn" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileViewer右クリック割当"), {
      target: { value: "zoomIn" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));

    expect(screen.getByLabelText("一覧表示形式"))
      .toHaveAttribute("data-catalog-view-mode", "cover_list");
    expect(screen.getByRole("complementary", { name: "フォルダツリー" })).toBeInTheDocument();
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();
  }, 30_000);

  it("FT-B19-001 applies representative settings from each category atomically", async () => {
    await registerTestLibrary([testEntry("book.cbz")]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    fireEvent.change(within(dialog).getByLabelText("profile一覧形式"), {
      target: { value: "reference_tile" },
    });
    fireEvent.change(within(dialog).getByRole("spinbutton", {
      name: "profile情報カードのサイズ（px）",
    }), { target: { value: "176" } });
    fireEvent.click(within(categories).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profileフォルダツリー"));
    fireEvent.click(within(categories).getByRole("button", { name: /^ビューワ/ }));
    fireEvent.change(
      within(dialog).getByRole("spinbutton", { name: "profile任意倍率（%）" }),
      { target: { value: "175" } },
    );
    fireEvent.click(within(categories).getByRole("button", { name: /^操作/ }));
    const inputGroups = within(dialog).getByRole("navigation", { name: "操作と入力の分類" });
    fireEvent.click(within(inputGroups).getByRole("button", { name: /^ジェスチャー設定/ }));
    fireEvent.change(within(dialog).getByLabelText("middleClickジェスチャー"), {
      target: { value: "toggleDirection" },
    });
    fireEvent.click(within(inputGroups).getByRole("button", { name: /^マウス設定/ }));
    fireEvent.change(within(dialog).getByLabelText("profile一覧中央ボタン割当"), {
      target: { value: "toggleSearch" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileViewer左上クリック割当"), {
      target: { value: "zoomIn" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileViewer右クリック割当"), {
      target: { value: "zoomIn" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "統合設定" })).not.toBeInTheDocument());
    expect(saveSettingsProfileMock).toHaveBeenCalledTimes(1);
    expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogViewMode: "reference_tile",
        catalogThumbnailSizes: {
          smallThumbnail: 104,
          coverList: 144,
          cardGrid: 216,
          referenceTile: 176,
        },
        treeVisible: false,
        scale: 1.75,
        catalogMouseBindings: expect.objectContaining({
          primaryClick: "selectOnly",
          doubleClick: "openSelected",
          middleClick: "toggleSearch",
          backButton: "navigateBack",
          forwardButton: "navigateForward",
        }),
        viewerQuadrantBindings: expect.objectContaining({
          topLeft: "zoomIn",
          topRight: "nextPage",
          bottomLeft: "previousPage",
          bottomRight: "nextPage",
        }),
        viewerRightClickAction: "zoomIn",
        mouseGestures: expect.objectContaining({
          middleClick: "toggleDirection",
          doubleClick: "toggleFullscreen",
        }),
      }),
      expect.any(Number),
    );
    expect(screen.getByLabelText("一覧表示形式"))
      .toHaveAttribute("data-catalog-view-mode", "reference_tile");
    expect(screen.getByRole("grid", { name: "現在のフォルダの項目" }))
      .toHaveStyle({ "--catalog-thumbnail-width": "176px" });
    expect(screen.queryByRole("complementary", { name: "フォルダツリー" })).not.toBeInTheDocument();
  }, 30_000);

  it("REQ-LEY-P1-001, P1-002, and P1-005 connect keyboard settings, shell surfaces, and topmost atomically", async () => {
    const alwaysOnTopAdapter = { setAlwaysOnTop: vi.fn().mockResolvedValue(undefined) };
    await registerTestLibrary([], undefined, alwaysOnTopAdapter);
    expect(alwaysOnTopAdapter.setAlwaysOnTop).toHaveBeenCalledWith(false);

    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    fireEvent.click(within(categories).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profileアドレスバー"));
    fireEvent.click(within(dialog).getByLabelText("profileステータスバー"));
    fireEvent.click(within(dialog).getByLabelText("profile常に手前"));
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(alwaysOnTopAdapter.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
    expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        addressBarVisible: false,
        statusBarVisible: false,
        alwaysOnTop: true,
      }),
      expect.any(Number),
    );
    expect(screen.queryByLabelText("アドレス")).not.toBeInTheDocument();
    expect(document.querySelector(".status-bar")).not.toBeInTheDocument();
  });

  it("REQ-LEY-P1-002 keeps settings unchanged when native topmost apply fails", async () => {
    const alwaysOnTopAdapter = { setAlwaysOnTop: vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("window unavailable")) };
    await registerTestLibrary([], undefined, alwaysOnTopAdapter);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profile常に手前"));
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    expect(await within(dialog).findByText(/常に手前を切り替えられません/)).toBeInTheDocument();
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "統合設定" })).toBeInTheDocument();
  });

  it("REQ-FR-B24-001 and 006 keep theme selection as a draft and apply native before persistence", async () => {
    const calls: string[] = [];
    const windowThemeAdapter = {
      setTheme: vi.fn(async (theme) => {
        calls.push(`native:${theme ?? "system"}`);
      }),
    };
    saveSettingsProfileMock.mockImplementationOnce(async (profile) => {
      calls.push("persist");
      return {
        status: "ok",
        requestId: "save-theme-profile" as never,
        generation: 1 as never,
        data: { ...profile, themeFallbackReason: null },
      };
    });
    await registerTestLibrary([], undefined, undefined, windowThemeAdapter);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^画面/ }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "アプリテーマ" }), {
      target: { value: "builtin:dark" },
    });

    expect(document.documentElement).toHaveAttribute("data-theme-id", "system");
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(calls).toEqual(["native:system", "native:dark", "persist"]);
    expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        themeSelection: { kind: "builtin", themeId: "dark" },
        customThemeSnapshot: null,
      }),
      expect.any(Number),
    );
    expect(document.documentElement).toHaveAttribute("data-theme-id", "dark");
    expect(document.documentElement).toHaveAttribute("data-theme-scheme", "dark");
  });

  it("REQ-FR-B24-001 follows live system color-scheme changes only for system selection", async () => {
    const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
    let dark = false;
    const listeners = new Set<() => void>();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        get matches() { return dark; },
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
        addListener: (listener: () => void) => listeners.add(listener),
        removeListener: (listener: () => void) => listeners.delete(listener),
        dispatchEvent: () => true,
      })),
    });
    try {
      await registerTestLibrary([]);
      expect(document.documentElement).toHaveAttribute("data-theme-id", "system");
      expect(document.documentElement).toHaveAttribute("data-theme-scheme", "light");

      dark = true;
      act(() => listeners.forEach((listener) => listener()));
      await waitFor(() => expect(document.documentElement)
        .toHaveAttribute("data-theme-scheme", "dark"));
    } finally {
      if (originalMatchMediaDescriptor === undefined) Reflect.deleteProperty(window, "matchMedia");
      else Object.defineProperty(window, "matchMedia", originalMatchMediaDescriptor);
    }
    expect(Object.getOwnPropertyDescriptor(window, "matchMedia"))
      .toEqual(originalMatchMediaDescriptor);
  });

  it("REQ-FR-B24-006 rolls native theme back when profile persistence fails", async () => {
    const windowThemeAdapter = {
      setTheme: vi.fn().mockResolvedValue(undefined),
    };
    saveSettingsProfileMock.mockRejectedValueOnce(new Error("database unavailable"));
    await registerTestLibrary([], undefined, undefined, windowThemeAdapter);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^画面/ }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "アプリテーマ" }), {
      target: { value: "builtin:dark" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    expect(await within(dialog).findByText(/設定を保存できませんでした/)).toBeInTheDocument();
    expect(windowThemeAdapter.setTheme.mock.calls).toEqual([[null], ["dark"], [null]]);
    expect(document.documentElement).toHaveAttribute("data-theme-id", "system");
    expect(dialog).toBeInTheDocument();
  });

  it("REQ-FR-B24-006 reports a native theme rollback failure explicitly", async () => {
    const windowThemeAdapter = {
      setTheme: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("native rollback unavailable")),
    };
    saveSettingsProfileMock.mockRejectedValueOnce(new Error("database unavailable"));
    await registerTestLibrary([], undefined, undefined, windowThemeAdapter);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^画面/ }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "アプリテーマ" }), {
      target: { value: "builtin:dark" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    expect(await within(dialog).findByText(/ウィンドウ外観も元に戻せませんでした/))
      .toBeInTheDocument();
    expect(windowThemeAdapter.setTheme.mock.calls).toEqual([[null], ["dark"], [null]]);
    expect(document.documentElement).toHaveAttribute("data-theme-id", "system");
    expect(dialog).toBeInTheDocument();
  });

  it("expands matching advanced settings during search and hides unrelated groups", async () => {
    await registerTestLibrary([]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^ビューワ/ }));
    const summary = within(dialog).getByText("見開きの詳細設定");
    const details = summary.closest("details")!;
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
    fireEvent.click(summary);
    expect(details).not.toHaveAttribute("open");
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "設定を検索" }), {
      target: { value: "縦長" },
    });
    expect(details).toHaveAttribute("open");
    expect(within(dialog).getByLabelText("profile見開き縦長判定（%）")).toBeVisible();
    expect(within(dialog).getByText("性能の詳細設定")).not.toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "設定検索をクリア" }));
    expect(details).not.toHaveAttribute("open");
  });

  it("FT-B19-006 searches categorized settings and resets the whole draft", async () => {
    await registerTestLibrary([]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });

    fireEvent.change(within(dialog).getByRole("searchbox", { name: "設定を検索" }), {
      target: { value: "次ページ" },
    });
    expect(within(dialog).getByRole("textbox", { name: "次ページショートカット" }))
      .toBeVisible();
    expect(within(dialog).getByLabelText("profile一覧形式")).not.toBeVisible();
    expect(within(dialog).getByText(/件の設定/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "設定検索をクリア" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profileフォルダツリー"));
    expect(within(dialog).getByLabelText("profileフォルダツリー")).not.toBeChecked();

    fireEvent.click(within(dialog).getByRole("button", { name: "すべて既定に戻す" }));
    expect(within(dialog).getByLabelText("profileフォルダツリー")).toBeChecked();
    expect(within(dialog).getByRole("status")).toHaveTextContent("適用するまで現在の設定は変わりません");
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(screen.getByRole("complementary", { name: "フォルダツリー" })).toBeInTheDocument();
    expect(saveSettingsProfileMock).not.toHaveBeenCalled();
  });

  it("FT-B23-002 and FT-B23-004 persist viewer appearance settings and apply them to the viewer", async () => {
    const entry = testEntry("appearance.cbz");
    openMock.mockResolvedValueOnce(viewerResponse(entry.relativePath));
    await registerTestLibrary([entry]);

    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^ビューワ/ }));
    fireEvent.change(within(dialog).getByLabelText("profileビューワ背景"), {
      target: { value: "black" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileページ周囲の余白（px）"), {
      target: { value: "24" },
    });
    fireEvent.change(within(dialog).getByLabelText("profile見開き間隔（px）"), {
      target: { value: "18" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileカーソル自動非表示"), {
      target: { value: "2000" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileVersion: SETTINGS_PROFILE_VERSION,
        viewerBackground: "black",
        viewerPageMargin: 24,
        viewerSpreadGap: 18,
        cursorAutoHideMs: 2_000,
      }),
      expect.any(Number),
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /^appearance\.cbz/ }), {
      key: "Enter",
    });
    await screen.findByLabelText("appearance.cbz ビューワ");
    const stage = document.querySelector<HTMLElement>(".viewer-stage");
    expect(stage).toHaveAttribute("data-background", "black");
    expect(stage?.style.getPropertyValue("--viewer-page-margin")).toBe("24px");
    expect(stage?.style.getPropertyValue("--viewer-spread-gap")).toBe("18px");
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
      fireEvent.click(within(dialog).getByRole("button", { name: /^プロファイル/ }));
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
      fireEvent.click(within(dialog).getByRole("button", { name: /^一覧表示/ }));
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

  it("REQ-LEY-P2-012 persists tray minimize, close, and restore behavior atomically", async () => {
    await registerTestLibrary([]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    fireEvent.click(within(categories).getByRole("button", { name: /^画面/ }));
    fireEvent.click(within(dialog).getByLabelText("profile最小化時にタスクトレイへ格納"));
    fireEvent.change(within(dialog).getByLabelText("profile閉じる操作"), {
      target: { value: "store" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileタスクトレイ復帰操作"), {
      target: { value: "doubleClick" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileVersion: SETTINGS_PROFILE_VERSION,
        trayStoreOnMinimize: true,
        trayCloseBehavior: "store",
        trayRestoreGesture: "doubleClick",
      }),
      expect.any(Number),
    ));
  });

  it("REQ-LEY-P2-013 persists slideshow interval, order, and repeat atomically", async () => {
    await registerTestLibrary([]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    fireEvent.click(within(categories).getByRole("button", { name: /^ビューワ/ }));
    fireEvent.change(within(dialog).getByLabelText("profileスライドショー間隔（秒）"), {
      target: { value: "7.5" },
    });
    fireEvent.change(within(dialog).getByLabelText("profileスライドショー順序"), {
      target: { value: "random" },
    });
    fireEvent.click(within(dialog).getByLabelText("profile現在の作品を繰り返す"));
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileVersion: SETTINGS_PROFILE_VERSION,
        slideshowIntervalMs: 7_500,
        slideshowOrder: "random",
        slideshowRepeatCurrentItem: true,
      }),
      expect.any(Number),
    ));
  });

  it("REQ-LEY-P2-015 persists Viewer catalog selection synchronization atomically", async () => {
    await registerTestLibrary([]);
    chooseAppMenuItem("オプション", "統合設定…");
    const dialog = screen.getByRole("dialog", { name: "統合設定" });
    const categories = within(dialog).getByRole("navigation", { name: "設定カテゴリ" });
    fireEvent.click(within(categories).getByRole("button", { name: /^ビューワ/ }));
    fireEvent.click(within(dialog).getByLabelText("profile Viewerと一覧の選択を同期"));
    fireEvent.click(within(dialog).getByRole("button", { name: "適用" }));

    await waitFor(() => expect(saveSettingsProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileVersion: SETTINGS_PROFILE_VERSION,
        viewerCatalogSelectionSync: false,
      }),
      expect.any(Number),
    ));
  });

  it("REQ-LEY-P1-013 restores recent files across startup and opens them from the File menu", async () => {
    historyMock.mockResolvedValue(historyResponse([{
      itemIdentity: "Books/volume.cbz" as never,
      lastViewedAtMs: 1_700_000_000_000,
    }]));
    openMock.mockResolvedValue(viewerResponse("Books/volume.cbz"));
    await registerTestLibrary([]);

    const fileMenu = openAppMenu("ファイル");
    const recent = await within(fileMenu).findByRole("menuitem", { name: "volume.cbz" });
    fireEvent.click(recent);

    await waitFor(() => expect(openMock).toHaveBeenCalledWith(
      "Books/volume.cbz",
      expect.any(Number),
    ));
  });

  it("REQ-LEY-P1-021 reopens the latest successful item only when startup restore is enabled", async () => {
    settingsMock.mockResolvedValue({
      status: "ok",
      requestId: "settings-restore-viewer" as never,
      generation: 1 as never,
      data: { ...DEFAULT_CATALOG_SETTINGS, restoreLastViewer: true },
    });
    historyMock.mockResolvedValue(historyResponse([{
      itemIdentity: "Books/latest.cbz" as never,
      lastViewedAtMs: 1_700_000_000_000,
    }]));
    openMock.mockResolvedValue(viewerResponse("Books/latest.cbz"));

    restoreMock.mockResolvedValue({
      status: "ok", requestId: "restore" as never, generation: 1 as never,
      data: { absolutePath: "C:\\" },
    });
    registerMock.mockResolvedValue({
      status: "ok", requestId: "register" as never, generation: 1 as never,
      data: { absolutePath: "C:\\" },
    });
    listMock.mockResolvedValue({
      status: "ok", requestId: "list" as never, generation: 2 as never, data: [],
    });
    thumbnailMock.mockResolvedValue({
      status: "error", requestId: "thumbnail" as never, generation: 1 as never,
      error: { code: "NOT_FOUND", message: "missing", retryable: true },
    });
    render(<App />);

    await waitFor(() => expect(openMock).toHaveBeenCalledWith(
      "Books/latest.cbz",
      expect.any(Number),
    ));
    expect(await screen.findByLabelText("Books/latest.cbz ビューワ")).toBeInTheDocument();
  });

  it("REQ-LEY-P1-013 clears persistent reading history through the history dialog", async () => {
    historyMock.mockResolvedValue(historyResponse([{
      itemIdentity: "Books/volume.cbz" as never,
      lastViewedAtMs: 1_700_000_000_000,
    }]));
    await registerTestLibrary([]);

    chooseAppMenuItem("オプション", "閲覧履歴");
    const dialog = await screen.findByRole("dialog", { name: "閲覧履歴" });
    expect(within(dialog).getByText("Books/volume.cbz")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "履歴を消去" }));

    await waitFor(() => expect(clearHistoryMock).toHaveBeenCalledOnce());
    expect(within(dialog).queryByText("Books/volume.cbz")).not.toBeInTheDocument();
  });

});
