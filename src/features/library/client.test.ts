import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createDefaultSettingsProfile } from "../settings/profile";
import {
  deleteCatalogMask,
  evaluateCatalogMask,
  listCatalogMasks,
  pickSearchSource,
  listenCatalogFolderChanges,
  saveCatalogMask,
  searchLibrary,
  stopLibraryFolderWatch,
  watchLibraryFolder,
  saveSettingsProfile,
} from "./client";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

describe("library client settings contract", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ status: "cancelled" });
    listenMock.mockReset();
    listenMock.mockResolvedValue(vi.fn());
  });

  it("REQ-LEY-P2-015 sends the required Viewer catalog sync field to Rust", async () => {
    const profile = createDefaultSettingsProfile();
    profile.viewerCatalogSelectionSync = false;
    await saveSettingsProfile(profile, 17);

    expect(invokeMock).toHaveBeenCalledWith(
      "set_settings_profile",
      expect.objectContaining({
        profile: expect.objectContaining({ viewerCatalogSelectionSync: false }),
      }),
    );
  });

  it("REQ-LEY-P3-002 sends the mask and basename batch to the Rust matcher", async () => {
    const candidates = [
      { basename: "one.cbz", kind: "archive" as const, byteSize: 10 },
      { basename: "two.jpg", kind: "page" as const, modifiedMs: 20 },
    ];
    const options = { includeFolders: false, includeFiles: true };
    await evaluateCatalogMask("*.cbz;*.pdf", candidates, options, 23);

    expect(invokeMock).toHaveBeenCalledWith(
      "evaluate_catalog_mask",
      expect.objectContaining({
        context: expect.objectContaining({ generation: 23 }),
        mask: "*.cbz;*.pdf",
        candidates,
        options,
      }),
    );
  });

  it("REQ-LEY-P3-003 uses dedicated SQLite-backed saved-mask commands", async () => {
    const options = {
      includeFolders: false,
      includeFiles: true,
      minSizeBytes: 1024,
      modifiedAfterMs: 10,
      modifiedBeforeMs: 20,
    };
    await listCatalogMasks(1);
    await saveCatalogMask("large recent", "*.cbz", options, 2);
    await deleteCatalogMask("large recent", 3);

    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "list_catalog_masks",
      expect.objectContaining({ context: expect.objectContaining({ generation: 1 }) }),
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "save_catalog_mask",
      expect.objectContaining({ name: "large recent", expression: "*.cbz", options }),
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      3,
      "delete_catalog_mask",
      expect.objectContaining({ name: "large recent" }),
    );
  });

  it("REQ-LEY-P3-004 sends picker-approved sources to the Rust search boundary", async () => {
    await pickSearchSource(31);
    await searchLibrary("volume", 32, {
      includeSubfolders: true,
      includeFolders: true,
      includeFiles: true,
      fixedLocation: null,
      sourceRoots: ["C:\\Library", "D:\\Comics"],
    });

    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "pick_search_source",
      expect.objectContaining({ context: expect.objectContaining({ generation: 31 }) }),
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "search_library",
      expect.objectContaining({
        query: "volume",
        options: expect.objectContaining({
          sourceRoots: ["C:\\Library", "D:\\Comics"],
        }),
      }),
    );
  });

  it("REQ-LEY-P3-005 connects watch lifecycle and typed Rust events", async () => {
    const handler = vi.fn();
    await listenCatalogFolderChanges(handler);
    await watchLibraryFolder("Series", 41);
    await stopLibraryFolderWatch(42);

    expect(listenMock).toHaveBeenCalledWith("catalog-folder-changed", expect.any(Function));
    const eventCallback = listenMock.mock.calls[0][1] as (event: { payload: unknown }) => void;
    const payload = {
      generation: 41,
      libraryRoot: "C:\\",
      relativePath: "Series",
      status: "changed" as const,
    };
    eventCallback({ payload });
    expect(handler).toHaveBeenCalledWith(payload);
    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "watch_library_folder",
      expect.objectContaining({ relativePath: "Series" }),
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "stop_library_folder_watch",
      expect.objectContaining({ context: expect.objectContaining({ generation: 42 }) }),
    );
  });
});
