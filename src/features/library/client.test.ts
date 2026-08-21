import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createDefaultSettingsProfile } from "../settings/profile";
import { evaluateCatalogMask, saveSettingsProfile } from "./client";

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
    await evaluateCatalogMask("*.cbz;*.pdf", ["one.cbz", "two.jpg"], 23);

    expect(invokeMock).toHaveBeenCalledWith(
      "evaluate_catalog_mask",
      expect.objectContaining({
        context: expect.objectContaining({ generation: 23 }),
        mask: "*.cbz;*.pdf",
        basenames: ["one.cbz", "two.jpg"],
      }),
    );
  });
});
