import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

function openDiagnosticsMenuItem() {
  fireEvent.click(screen.getByRole("menuitem", { name: "オプション" }));
  fireEvent.click(
    within(screen.getByRole("menu", { name: "オプション" })).getByRole("menuitem", {
      name: "ライブラリ診断…",
    }),
  );
}
import {
  cancelLibraryDiagnostics,
  diagnoseLibrary,
  getCatalogSettings,
  getItemMetadata,
  getThumbnail,
  listFavorites,
  listFolder,
  listReadingHistory,
  listTreeChildren,
  pickLibraryRoot,
  registerLibraryRoot,
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
} from "./features/library/client";

vi.mock("./features/library/client", () => ({
  cancelLibraryDiagnostics: vi.fn(),
  diagnoseLibrary: vi.fn(),
  getCatalogSettings: vi.fn(),
  getItemMetadata: vi.fn(),
  getThumbnail: vi.fn(),
  listFavorites: vi.fn(),
  listFolder: vi.fn(),
  listReadingHistory: vi.fn(),
  listTreeChildren: vi.fn(),
  listWindowsDrives: vi.fn(async () => ({
    status: "ok", requestId: "drives", generation: 1,
    data: [{ absolutePath: "C:\\", name: "ローカル ディスク (C:)" }],
  })),
  loadPage: vi.fn(),
  openComic: vi.fn(),
  pickLibraryRoot: vi.fn(),
  registerLibraryRoot: vi.fn(),
  removeFavorite: vi.fn(),
  resolveFavorite: vi.fn(),
  restoreLibraryRoot: vi.fn(),
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
  searchLibrary: vi.fn(),
  setItemRating: vi.fn(),
  takeRecoveryNotice: vi.fn(),
}));

const diagnoseMock = vi.mocked(diagnoseLibrary);
const cancelMock = vi.mocked(cancelLibraryDiagnostics);
const registerMock = vi.mocked(registerLibraryRoot);
const listFolderMock = vi.mocked(listFolder);

afterEach(cleanup);

function response(data: unknown, requestId = "fr-b09") {
  return {
    status: "ok" as const,
    requestId: requestId as never,
    generation: 1 as never,
    data,
  };
}

function cancelledResponse(requestId = "fr-b09-cancelled", generation = 1) {
  return {
    status: "cancelled" as const,
    requestId: requestId as never,
    generation: generation as never,
  };
}

function report(findings: unknown[] = [], retryRequested = false) {
  return {
    schema: "fr-b09/v1",
    snapshot: [],
    findings,
    summary: {
      scanned: 4,
      findings: findings.length,
      added: findings.filter((finding) => (finding as { status: string }).status === "added").length,
      changed: findings.filter((finding) => (finding as { status: string }).status === "changed").length,
      missing: findings.filter((finding) => (finding as { status: string }).status === "missing").length,
      duplicates: findings.filter((finding) => (finding as { status: string }).status === "duplicate").length,
      corrupt: findings.filter((finding) => (finding as { status: string }).status === "corrupt").length,
      errors: findings.filter((finding) => (finding as { severity: string }).severity === "error").length,
    },
    retryRequested,
  };
}

function finding(status: string, severity: string, path: string) {
  return {
    status,
    severity,
    itemIdentity: `item-${path}`,
    relativePath: path,
    kind: "archive",
    contentHash: "hash",
    message: `${status}:${path}`,
    retryable: true,
  };
}

async function registerLibrary() {
  vi.mocked(restoreLibraryRoot).mockResolvedValue(
    response({ absolutePath: "C:\\" }, "restore") as never,
  );
  registerMock.mockResolvedValue(response({ absolutePath: "C:\\" }, "register") as never);
  listFolderMock.mockResolvedValue(response([], "list") as never);
  render(<App />);
  await screen.findByRole("grid", { name: "現在のフォルダの項目" });
}

describe("FR-B09 connected library diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const settings = response({
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
      menuBarVisible: true,
      toolbarVisible: true,
      shortcuts: {},
      mouseGestures: {},
    }, "settings");
    vi.mocked(getCatalogSettings).mockResolvedValue(settings as never);
    vi.mocked(takeRecoveryNotice).mockResolvedValue(response(false, "recovery") as never);
    vi.mocked(restoreLibraryRoot).mockResolvedValue(response(null, "restore") as never);
    vi.mocked(pickLibraryRoot).mockResolvedValue(response(null, "picker") as never);
    vi.mocked(listTreeChildren).mockResolvedValue(response([], "tree") as never);
    vi.mocked(listFavorites).mockResolvedValue(response([], "favorites") as never);
    vi.mocked(listReadingHistory).mockResolvedValue(response([], "history") as never);
    vi.mocked(getItemMetadata).mockResolvedValue(response(null, "metadata") as never);
    vi.mocked(getThumbnail).mockResolvedValue(response(null, "thumbnail") as never);
    vi.mocked(saveCatalogSort).mockResolvedValue(settings as never);
    vi.mocked(saveCatalogViewMode).mockResolvedValue(settings as never);
    vi.mocked(saveEndOfVolumePolicy).mockResolvedValue(settings as never);
    vi.mocked(saveViewerSettings).mockResolvedValue(settings as never);
    vi.mocked(saveItemMemo).mockResolvedValue(response(null, "memo") as never);
    vi.mocked(setItemRating).mockResolvedValue(response(null, "rating") as never);
    vi.mocked(saveReadingPosition).mockResolvedValue(response(undefined, "position") as never);
    vi.mocked(searchLibrary).mockResolvedValue(response([], "search") as never);
    cancelMock.mockResolvedValue(response(undefined, "cancel") as never);
    diagnoseMock.mockResolvedValue(response(report([])) as never);
  });

  it("FT-B09-001 renders added, changed, and missing results from the production report", async () => {
    diagnoseMock.mockResolvedValue(
      response(
        report([
          finding("added", "info", "new.cbz"),
          finding("changed", "warning", "changed.cbz"),
          finding("missing", "warning", "missing.cbz"),
        ]),
      ) as never,
    );
    await registerLibrary();
    openDiagnosticsMenuItem();
    const results = await screen.findByRole("list", { name: "診断結果" });
    expect(results.querySelectorAll('[data-diagnostic-status="added"]')).toHaveLength(1);
    expect(results.querySelectorAll('[data-diagnostic-status="changed"]')).toHaveLength(1);
    expect(results.querySelectorAll('[data-diagnostic-status="missing"]')).toHaveLength(1);
  });

  it("FT-B09-002 exposes duplicate identity findings without hiding the path", async () => {
    diagnoseMock.mockResolvedValue(
      response(report([finding("duplicate", "warning", "copy/book.cbz")])) as never,
    );
    await registerLibrary();
    openDiagnosticsMenuItem();
    expect(await screen.findByText("copy/book.cbz")).toBeInTheDocument();
    expect(screen.getByText("重複")).toBeInTheDocument();
  });

  it("FT-B09-003 renders corrupt archive findings as errors", async () => {
    diagnoseMock.mockResolvedValue(
      response(report([finding("corrupt", "error", "broken.cbz")])) as never,
    );
    await registerLibrary();
    openDiagnosticsMenuItem();
    const corrupt = await screen.findByText("broken.cbz");
    expect(corrupt.closest("li")).toHaveAttribute("data-diagnostic-severity", "error");
    expect(screen.getByText("破損書庫")).toBeInTheDocument();
  });

  it("FT-B09-004 keeps mixed status and severity visible in one connected panel", async () => {
    diagnoseMock.mockResolvedValue(
      response(
        report([
          finding("added", "info", "new.cbz"),
          finding("duplicate", "warning", "copy.cbz"),
          finding("corrupt", "error", "broken.cbz"),
        ]),
      ) as never,
    );
    await registerLibrary();
    openDiagnosticsMenuItem();
    const panel = await screen.findByRole("dialog", { name: "ライブラリ診断" });
    expect(panel.querySelectorAll('[data-diagnostic-severity="info"]')).toHaveLength(1);
    expect(panel.querySelectorAll('[data-diagnostic-severity="warning"]')).toHaveLength(1);
    expect(panel.querySelectorAll('[data-diagnostic-severity="error"]')).toHaveLength(1);
  });

  it("explains the read-only check and shows an active indicator while diagnostics run", async () => {
    diagnoseMock.mockImplementationOnce(() => new Promise<never>(() => undefined));
    await registerLibrary();
    openDiagnosticsMenuItem();

    const panel = await screen.findByRole("dialog", { name: "ライブラリ診断" });
    expect(within(panel).getByRole("heading", { name: "何をする機能ですか？" })).toBeInTheDocument();
    expect(within(panel).getByText(/作品ファイルは変更・削除せず、外部へ送信しません/)).toBeInTheDocument();
    const progress = within(panel).getByRole("status");
    expect(progress).toHaveTextContent("診断を実行中です");
    expect(progress).toHaveTextContent("ライブラリの構成と対応書庫を確認しています");
    expect(progress.querySelector('[data-diagnostic-activity="indeterminate"]')).toBeInTheDocument();
  });

  it("FT-B09-005 renders production cancellation and suppresses late stale retry results", async () => {
    diagnoseMock.mockResolvedValueOnce(response(report([]), "initial") as never);
    await registerLibrary();
    openDiagnosticsMenuItem();
    await screen.findByText("問題は見つかりませんでした。");

    let releaseLateOld: () => void = () => undefined;
    diagnoseMock.mockImplementationOnce(
      (_baseline, generation) =>
        new Promise((resolve) => {
          releaseLateOld = () =>
            resolve(
              response(
                report([finding("changed", "warning", "late-old.cbz")]),
                "late-old",
              ) as never,
            );
          void generation;
        }) as never,
    );
    fireEvent.click(screen.getByRole("button", { name: "診断を再実行" }));
    await waitFor(() => expect(diagnoseMock).toHaveBeenCalledTimes(2));
    expect(diagnoseMock.mock.calls[1]?.[2]).toBe(true);

    let releaseCancelled: () => void = () => undefined;
    let cancelledResponseGeneration: number | undefined;
    diagnoseMock.mockImplementationOnce(
      (_baseline, generation) =>
        new Promise((resolve) => {
          releaseCancelled = () => {
            cancelledResponseGeneration = generation;
            resolve(cancelledResponse("diagnostic-cancelled", generation) as never);
          };
        }) as never,
    );
    fireEvent.click(screen.getByRole("button", { name: "診断を再実行" }));
    await waitFor(() => expect(diagnoseMock).toHaveBeenCalledTimes(3));

    let cancelAdapterGeneration: number | undefined;
    cancelMock.mockImplementationOnce(async (generation) => {
      cancelAdapterGeneration = generation;
      releaseCancelled();
      return response(undefined, "cancel-adapter") as never;
    });
    await screen.findByRole("button", { name: "診断をキャンセル" });
    fireEvent.click(screen.getByRole("button", { name: "診断をキャンセル" }));
    expect(cancelMock).toHaveBeenCalledTimes(1);
    await screen.findByText("ライブラリ診断をキャンセルしました。");
    expect(cancelledResponseGeneration).toBe(cancelAdapterGeneration);
    expect(screen.getByRole("dialog", { name: "ライブラリ診断" })).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(screen.queryByRole("button", { name: "診断をキャンセル" })).not.toBeInTheDocument();

    diagnoseMock.mockResolvedValueOnce(
      response(
        report([finding("added", "info", "fresh-after-cancel.cbz")], true),
        "fresh-after-cancel",
      ) as never,
    );
    fireEvent.click(screen.getByRole("button", { name: "診断を再実行" }));
    await screen.findByText("fresh-after-cancel.cbz");
    expect(diagnoseMock.mock.calls[3]?.[2]).toBe(true);

    releaseLateOld();
    await waitFor(() => {
      expect(screen.getByText("fresh-after-cancel.cbz")).toBeInTheDocument();
      expect(screen.queryByText("late-old.cbz")).not.toBeInTheDocument();
    });
    expect(
      screen
        .getByRole("list", { name: "診断結果" })
        .querySelectorAll('[data-diagnostic-path="late-old.cbz"]'),
    ).toHaveLength(0);
  });
});
