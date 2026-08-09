import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOUSE_GESTURES,
  normalizeSettingsProfile,
  remapMouseGesture,
} from "./profile";

describe("settings profile", () => {
  it("normalizes a profile without importing machine or secret fields", () => {
    const profile = normalizeSettingsProfile({
      profileVersion: 99,
      catalogViewMode: "reference_tile",
      scale: 9,
      secretToken: "must-not-be-retained",
    });
    expect(profile?.profileVersion).toBe(1);
    expect(profile?.catalogViewMode).toBe("reference_tile");
    expect(profile?.scale).toBe(4);
    expect(profile).not.toHaveProperty("secretToken");
  });

  it("rejects duplicate mouse gesture actions", () => {
    expect(remapMouseGesture(DEFAULT_MOUSE_GESTURES, "doubleClick", "nextPage")).toEqual({
      ok: false,
      reason: "conflict",
    });
  });

  it("accepts a safe gesture update", () => {
    expect(remapMouseGesture(DEFAULT_MOUSE_GESTURES, "doubleClick", "closeViewer")).toEqual({
      ok: true,
      bindings: { ...DEFAULT_MOUSE_GESTURES, doubleClick: "closeViewer" },
    });
  });
});
