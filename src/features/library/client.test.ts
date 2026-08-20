import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createDefaultSettingsProfile } from "../settings/profile";
import { saveSettingsProfile } from "./client";

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
});
