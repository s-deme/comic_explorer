import "@testing-library/jest-dom/vitest";
// @ts-ignore Vitest executes this focused suite in its Node-backed jsdom runtime.
import { createHash } from "node:crypto";
// @ts-ignore Vitest executes this focused suite in its Node-backed jsdom runtime.
import * as nodeFs from "node:fs";
const {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = nodeFs;
// @ts-ignore Vitest executes this focused suite in its Node-backed jsdom runtime.
import { tmpdir } from "node:os";
// @ts-ignore Vitest executes this focused suite in its Node-backed jsdom runtime.
import { join } from "node:path";
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
import {
  getCatalogSettings,
  getItemMetadata,
  getThumbnail,
  loadPage,
  listTreeChildren,
  listFolder,
  listReadingHistory,
  openComic,
  registerLibraryRoot,
  restoreLibraryRoot,
  saveItemMemo,
  saveReadingPosition,
  setItemRating,
  takeRecoveryNotice,
  type CatalogSettings,
  type ItemMetadata,
  type ReadingHistoryEntry,
} from "./features/library/client";
import type { CatalogEntry } from "./types/domain";

vi.mock("./features/library/client", () => ({
  // Keep every App/Viewer client binding mocked; only exercised bindings get handles below.
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
const loadPageMock = vi.mocked(loadPage);
const saveMemoMock = vi.mocked(saveItemMemo);
const saveReadingMock = vi.mocked(saveReadingPosition);
const setRatingMock = vi.mocked(setItemRating);
const recoveryNoticeMock = vi.mocked(takeRecoveryNotice);
const historyMock = vi.mocked(listReadingHistory);

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

const defaultSettings: CatalogSettings = {
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
};

function settingsResponse(requestId: string) {
  return {
    status: "ok" as const,
    requestId: requestId as never,
    generation: 1 as never,
    data: defaultSettings,
  };
}

async function registerTestLibrary(
  entries: CatalogEntry[],
  absolutePath = "C:\\Comics",
) {
  registerMock.mockResolvedValue({
    status: "ok",
    requestId: "register" as never,
    generation: 1 as never,
    data: { absolutePath },
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
    target: { value: absolutePath },
  });
  fireEvent.click(screen.getByRole("button", { name: "登録" }));
  await screen.findByRole("grid", { name: "現在のフォルダの項目" });
}

async function requestOpenTestComic(relativePath: string) {
  const grid = await screen.findByRole("grid", { name: "現在のフォルダの項目" });
  const comicButton = within(grid)
    .getAllByRole("button")
    .find((button) => button.getAttribute("data-relative-path") === relativePath);
  expect(comicButton).toBeDefined();
  expect(comicButton).toHaveAttribute("data-relative-path", relativePath);
  const basename = relativePath.split("/").at(-1) ?? relativePath;
  expect(comicButton).toHaveAccessibleName(expect.stringContaining(basename));
  fireEvent.keyDown(comicButton!, { key: "Enter" });
}

async function openTestComic(relativePath: string) {
  await requestOpenTestComic(relativePath);
  await screen.findByLabelText(`${relativePath} ビューワ`);
}

type FileSnapshot = {
  bytes: string;
  sha256: string;
};

type FixtureSnapshot = {
  original: Record<string, FileSnapshot>;
  library: Record<string, FileSnapshot>;
};

function snapshotFile(path: string): FileSnapshot {
  const bytes = readFileSync(path);
  return {
    bytes: bytes.toString("base64"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function snapshotTree(root: string): Record<string, FileSnapshot> {
  const snapshot: Record<string, FileSnapshot> = {};

  function visit(current: string, relativePath: string) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      const childPath = relativePath === "" ? entry.name : join(relativePath, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, childPath);
      } else if (entry.isFile()) {
        snapshot[childPath] = snapshotFile(fullPath);
      } else {
        throw new Error(`Unexpected fixture entry: ${fullPath}`);
      }
    }
  }

  visit(root, "");
  return snapshot;
}

function snapshotFixture(originalRoot: string, libraryRoot: string): FixtureSnapshot {
  return {
    original: snapshotTree(originalRoot),
    library: snapshotTree(libraryRoot),
  };
}

type DirectWebAdapterGuard = {
  name: string;
  failure: string;
  callCount: () => number;
  restore: () => void;
};

function installDirectWebAdapterGuard(
  target: object,
  property: PropertyKey,
  name: string,
  failure: string,
): DirectWebAdapterGuard {
  let calls = 0;
  const previous = Object.getOwnPropertyDescriptor(target, property);
  const throwingAdapter = (..._args: unknown[]): never => {
    calls += 1;
    throw new Error(failure);
  };

  Object.defineProperty(target, property, {
    configurable: true,
    enumerable: previous?.enumerable ?? true,
    writable: true,
    value: throwingAdapter,
  });

  return {
    name,
    failure,
    callCount: () => calls,
    restore: () => {
      if (previous) {
        Object.defineProperty(target, property, previous);
      } else {
        Reflect.deleteProperty(target, property);
      }
    },
  };
}

describe("FR-B07 connected App boundary", () => {
  let directWebAdapterGuards: DirectWebAdapterGuard[] = [];

  afterEach(() => {
    try {
      cleanup();
      for (const guard of directWebAdapterGuards) {
        expect(guard.callCount(), guard.failure).toBe(0);
      }
      console.log("afterEach direct_web_adapter_calls=0");
    } finally {
      for (const guard of directWebAdapterGuards) {
        guard.restore();
      }
      directWebAdapterGuards = [];
    }
  });

  beforeEach(() => {
    directWebAdapterGuards = [
      installDirectWebAdapterGuard(
        globalThis,
        "fetch",
        "fetch",
        "DIRECT_WEB_ADAPTER_CALLED_fetch",
      ),
      installDirectWebAdapterGuard(
        globalThis,
        "XMLHttpRequest",
        "XMLHttpRequest",
        "DIRECT_WEB_ADAPTER_CALLED_XMLHttpRequest",
      ),
      installDirectWebAdapterGuard(
        globalThis,
        "WebSocket",
        "WebSocket",
        "DIRECT_WEB_ADAPTER_CALLED_WebSocket",
      ),
      installDirectWebAdapterGuard(
        globalThis,
        "EventSource",
        "EventSource",
        "DIRECT_WEB_ADAPTER_CALLED_EventSource",
      ),
      installDirectWebAdapterGuard(
        globalThis.navigator,
        "sendBeacon",
        "navigator.sendBeacon",
        "DIRECT_WEB_ADAPTER_CALLED_sendBeacon",
      ),
    ];

    registerMock.mockReset();
    listMock.mockReset();
    treeMock.mockReset();
    restoreMock.mockReset();
    openMock.mockReset();
    settingsMock.mockReset();
    metadataMock.mockReset();
    thumbnailMock.mockReset();
    loadPageMock.mockReset();
    saveMemoMock.mockReset();
    saveReadingMock.mockReset();
    setRatingMock.mockReset();
    recoveryNoticeMock.mockReset();
    historyMock.mockReset();
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
    settingsMock.mockResolvedValue(settingsResponse("settings"));
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
    loadPageMock.mockResolvedValue({
      status: "ok",
      requestId: "load-page" as never,
      generation: 1 as never,
      data: { pageId: "page-1" as never, mediaUri: "data:image/png;base64,fixture" },
    });
    saveReadingMock.mockResolvedValue({
      status: "ok",
      requestId: "save-reading" as never,
      generation: 1 as never,
      data: undefined,
    });
  });

  it("FT-B07-001 persists_edits_clears_and_restores_memo_through_connected_app_boundary", async () => {
    const comic = testEntry("Series/01.cbz");
    openMock.mockResolvedValue(viewerResponse(comic.relativePath));
    await registerTestLibrary([comic]);
    await openTestComic(comic.relativePath);

    const memo = await screen.findByLabelText("作品メモ");
    fireEvent.change(memo, { target: { value: "first memo" } });
    fireEvent.click(screen.getByRole("button", { name: "メモを保存" }));
    await waitFor(() =>
      expect(saveMemoMock).toHaveBeenCalledWith(
        comic.relativePath,
        "first memo",
        expect.any(Number),
      ),
    );
    await waitFor(() => expect(memo).toHaveValue("first memo"));

    fireEvent.change(memo, { target: { value: "edited memo" } });
    fireEvent.click(screen.getByRole("button", { name: "メモを保存" }));
    await waitFor(() => expect(memo).toHaveValue("edited memo"));
    fireEvent.click(screen.getByRole("button", { name: "メモを消去" }));
    await waitFor(() => expect(memo).toHaveValue(""));
    expect(saveMemoMock).toHaveBeenLastCalledWith(
      comic.relativePath,
      "",
      expect.any(Number),
    );
  });

  it("FT-B07-002 records_history_only_after_successful_comic_open", async () => {
    const success = testEntry("Series/A.cbz");
    const failed = testEntry("Series/failed.cbz");
    const cancelled = testEntry("Series/cancelled.cbz");
    const recordedHistory = new Map<string, number>();
    let nextViewedAtMs = 300;
    const failedBackendMessage = "failed comic open";
    const failedMessage = "見つかりません。対象が移動または削除された可能性があります。";

    historyMock.mockImplementation(async () =>
      historyResponse(
        [...recordedHistory.entries()]
          .sort(([, left], [, right]) => right - left)
          .map(([itemIdentity, lastViewedAtMs]) => ({
            itemIdentity: itemIdentity as never,
            lastViewedAtMs,
          })),
      ),
    );
    openMock.mockImplementation(async (itemRelativePath, generation) => {
      if (itemRelativePath === failed.relativePath) {
        return {
          status: "error",
          requestId: "failed-open" as never,
          generation: generation as never,
          error: {
            code: "NOT_FOUND",
            message: failedBackendMessage,
            retryable: false,
          },
        };
      }
      if (itemRelativePath === cancelled.relativePath) {
        return {
          status: "cancelled",
          requestId: "cancelled-open" as never,
          generation: generation as never,
        };
      }
      recordedHistory.set(itemRelativePath, nextViewedAtMs);
      nextViewedAtMs -= 1;
      return viewerResponse(itemRelativePath);
    });
    await registerTestLibrary([
      success,
      failed,
      cancelled,
    ]);

    await openTestComic(success.relativePath);
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    await screen.findByRole("grid", { name: "現在のフォルダの項目" });

    // A repeated successful open must upsert the same history row, not add one.
    await openTestComic(success.relativePath);
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    await screen.findByRole("grid", { name: "現在のフォルダの項目" });

    await requestOpenTestComic(failed.relativePath);
    await screen.findByText(failedMessage);
    expect(screen.queryByLabelText(`${failed.relativePath} ビューワ`)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    await screen.findByRole("grid", { name: "現在のフォルダの項目" });

    await requestOpenTestComic(cancelled.relativePath);
    await waitFor(() =>
      expect(openMock).toHaveBeenLastCalledWith(cancelled.relativePath, expect.any(Number)),
    );
    expect(screen.queryByLabelText(`${cancelled.relativePath} ビューワ`)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "閲覧履歴" }));
    const dialog = await screen.findByRole("dialog", { name: "閲覧履歴" });
    const rows = await within(dialog).findAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(success.relativePath);
    expect(within(dialog).getAllByText(success.relativePath)).toHaveLength(1);
    expect(historyMock).toHaveBeenCalledWith(expect.any(Number));
    expect(recordedHistory).toEqual(new Map([[success.relativePath, 299]]));
  });

  it("FT-B07-003 accepts_rating_boundaries_and_round_trips_unset_state", async () => {
    const comic = testEntry("Series/01.cbz");
    openMock.mockResolvedValue(viewerResponse(comic.relativePath));
    await registerTestLibrary([comic]);
    await openTestComic(comic.relativePath);

    const rating = await screen.findByLabelText("作品評価");
    fireEvent.change(rating, { target: { value: "1" } });
    await waitFor(() =>
      expect(setRatingMock).toHaveBeenNthCalledWith(
        1,
        comic.relativePath,
        1,
        expect.any(Number),
      ),
    );
    fireEvent.change(rating, { target: { value: "5" } });
    await waitFor(() =>
      expect(setRatingMock).toHaveBeenNthCalledWith(
        2,
        comic.relativePath,
        5,
        expect.any(Number),
      ),
    );
    fireEvent.change(rating, { target: { value: "" } });
    await waitFor(() =>
      expect(setRatingMock).toHaveBeenNthCalledWith(
        3,
        comic.relativePath,
        null,
        expect.any(Number),
      ),
    );
    expect(rating).toHaveValue("");
  });

  it("FT-B07-004 migrates_v2_metadata_and_restores_all_values_after_reopen", async () => {
    const comic = testEntry("Series/01.cbz");
    openMock.mockResolvedValue(viewerResponse(comic.relativePath));
    metadataMock.mockResolvedValue(
      metadataResponse(comic.relativePath, { memo: "restored memo", rating: 4 }),
    );
    await registerTestLibrary([comic]);
    await openTestComic(comic.relativePath);
    expect(await screen.findByLabelText("作品メモ")).toHaveValue("restored memo");
    expect(screen.getByLabelText("作品評価")).toHaveValue("4");

    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    await screen.findByRole("grid", { name: "現在のフォルダの項目" });
    await openTestComic(comic.relativePath);
    expect(await screen.findByLabelText("作品メモ")).toHaveValue("restored memo");
    expect(screen.getByLabelText("作品評価")).toHaveValue("4");
    expect(metadataMock).toHaveBeenCalledTimes(2);
  });

  it("FT-B07-005 keeps_metadata_operations_separate_from_original_and_library_files", async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "comic-explorer-fr-b07-"));
    const originalRoot = join(fixtureRoot, "original");
    const libraryRoot = join(fixtureRoot, "library");
    const originalFile = join(originalRoot, "Series", "01.cbz");
    const libraryFile = join(libraryRoot, "Series", "01.cbz");
    const libraryManagementFile = join(libraryRoot, "library.index");
    mkdirSync(join(originalRoot, "Series"), { recursive: true });
    mkdirSync(join(libraryRoot, "Series"), { recursive: true });
    writeFileSync(originalFile, "fixture-original-bytes");
    writeFileSync(libraryFile, "fixture-original-bytes");
    writeFileSync(libraryManagementFile, "fixture-library-management");

    const comic = testEntry("Series/01.cbz");
    openMock.mockResolvedValue(viewerResponse(comic.relativePath));
    let memo: string | null = null;
    let rating: number | null = null;
    metadataMock.mockImplementation(async (itemIdentity) =>
      metadataResponse(itemIdentity, { memo, rating }),
    );
    saveMemoMock.mockImplementation(async (itemIdentity, body) => {
      memo = body.trim() === "" ? null : body;
      return metadataResponse(itemIdentity, { memo, rating });
    });
    setRatingMock.mockImplementation(async (itemIdentity, nextRating) => {
      rating = nextRating;
      return metadataResponse(itemIdentity, { memo, rating });
    });
    historyMock.mockResolvedValue(
      historyResponse([
        { itemIdentity: comic.relativePath, lastViewedAtMs: 250 },
      ]),
    );

    try {
      const before = snapshotFixture(originalRoot, libraryRoot);
      expect(before.original["Series/01.cbz"].sha256).toBe(
        before.library["Series/01.cbz"].sha256,
      );

      await registerTestLibrary([comic], libraryRoot);
      await openTestComic(comic.relativePath);

      const memoInput = await screen.findByLabelText("作品メモ");
      fireEvent.change(memoInput, { target: { value: "fixture memo" } });
      fireEvent.click(screen.getByRole("button", { name: "メモを保存" }));
      await waitFor(() =>
        expect(saveMemoMock).toHaveBeenCalledWith(
          comic.relativePath,
          "fixture memo",
          expect.any(Number),
        ),
      );

      const ratingInput = screen.getByLabelText("作品評価");
      fireEvent.change(ratingInput, { target: { value: "4" } });
      await waitFor(() =>
        expect(setRatingMock).toHaveBeenCalledWith(
          comic.relativePath,
          4,
          expect.any(Number),
        ),
      );

      fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
      await screen.findByRole("grid", { name: "現在のフォルダの項目" });
      await waitFor(() =>
        expect(saveReadingMock).toHaveBeenCalledWith(
          expect.objectContaining({ itemKey: comic.relativePath }),
          0,
          expect.any(Number),
        ),
      );

      fireEvent.click(screen.getByRole("button", { name: "閲覧履歴" }));
      const dialog = await screen.findByRole("dialog", { name: "閲覧履歴" });
      expect(within(dialog).getByText(comic.relativePath)).toBeInTheDocument();
      expect(historyMock).toHaveBeenCalledWith(expect.any(Number));
      fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));

      const after = snapshotFixture(originalRoot, libraryRoot);
      expect(after).toEqual(before);
      expect(after.original["Series/01.cbz"].sha256).toBe(
        before.original["Series/01.cbz"].sha256,
      );
      expect(after.library["Series/01.cbz"].sha256).toBe(
        before.library["Series/01.cbz"].sha256,
      );
      expect(after.library["library.index"].sha256).toBe(
        before.library["library.index"].sha256,
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
