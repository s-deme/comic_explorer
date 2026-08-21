import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createDefaultSettingsProfile } from "../settings/profile";
import {
  deleteCatalogMask,
  evaluateCatalogMask,
  listCatalogMasks,
  saveCatalogMask,
  saveSettingsProfile,
} from "./client";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

describe("library client settings contract", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ status: "cancelled" });
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
});
