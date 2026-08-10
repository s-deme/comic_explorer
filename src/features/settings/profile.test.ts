import { describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS } from "../input/shortcuts";
import packageMetadata from "../../../package.json";
import {
  APP_VERSION,
  DEFAULT_MOUSE_GESTURES,
  normalizeSettingsProfile,
  remapMouseGesture,
  type SettingsProfile,
} from "./profile";

function validProfile(): SettingsProfile {
  return {
    profileVersion: 1,
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
    treeVisible: true,
    menuBarVisible: true,
    toolbarVisible: true,
    shortcuts: { ...DEFAULT_SHORTCUTS },
    mouseGestures: { ...DEFAULT_MOUSE_GESTURES },
  };
}

function withField(field: string, value: unknown): Record<string, unknown> {
  const profile = validProfile() as unknown as Record<string, unknown>;
  profile[field] = value;
  return profile;
}

describe("settings profile", () => {
  it("uses package metadata as the application version source of truth", () => {
    expect(APP_VERSION).toBe(packageMetadata.version);
  });

  it("imports a strict known-version profile and excludes unknown fields", () => {
    const candidate = {
      ...validProfile(),
      catalogViewMode: "reference_tile",
      scale: 4,
      secretToken: "must-not-be-retained",
    };
    const profile = normalizeSettingsProfile(candidate);
    expect(profile).toEqual({
      ...validProfile(),
      catalogViewMode: "reference_tile",
      scale: 4,
    });
    expect(profile).not.toHaveProperty("secretToken");
  });

  it.each([0, 2, 99, "1", undefined])(
    "rejects an unknown or malformed profile version (%s)",
    (profileVersion) => {
      expect(normalizeSettingsProfile(withField("profileVersion", profileVersion))).toBeNull();
    },
  );

  it.each([
    ["sortField", "created"],
    ["endOfVolumePolicy", "next"],
    ["catalogViewMode", "tiles"],
    ["viewMode", "continuous"],
    ["layoutMode", "grid"],
    ["readingDirection", "topToBottom"],
    ["scaleMode", "automatic"],
  ])("rejects an invalid %s enum", (field, value) => {
    expect(normalizeSettingsProfile(withField(field, value))).toBeNull();
  });

  it.each([
    "sortDescending",
    "loupeEnabled",
    "treeVisible",
    "menuBarVisible",
    "toolbarVisible",
  ])("requires %s to be a boolean", (field) => {
    expect(normalizeSettingsProfile(withField(field, "false"))).toBeNull();
    expect(normalizeSettingsProfile(withField(field, undefined))).toBeNull();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.24, 4.01, "1"])(
    "rejects a non-finite, non-numeric, or out-of-range scale (%s)",
    (scale) => {
      expect(normalizeSettingsProfile(withField("scale", scale))).toBeNull();
    },
  );

  it("requires every profile field instead of silently defaulting it", () => {
    const candidate = validProfile() as unknown as Record<string, unknown>;
    delete candidate.layoutMode;
    expect(normalizeSettingsProfile(candidate)).toBeNull();
  });

  it("normalizes valid shortcuts but rejects missing, invalid, and conflicting bindings", () => {
    const alias = validProfile();
    alias.shortcuts.nextPage = "ctrl+pgdn";
    expect(normalizeSettingsProfile(alias)?.shortcuts.nextPage).toBe("Ctrl+PageDown");

    const missing = validProfile();
    delete (missing.shortcuts as Partial<typeof missing.shortcuts>).zoomOut;
    expect(normalizeSettingsProfile(missing)).toBeNull();

    const invalid = validProfile();
    invalid.shortcuts.zoomOut = "Ctrl+";
    expect(normalizeSettingsProfile(invalid)).toBeNull();

    const conflict = validProfile();
    conflict.shortcuts.nextPage = conflict.shortcuts.previousPage;
    expect(normalizeSettingsProfile(conflict)).toBeNull();
  });

  it("rejects missing, invalid, and conflicting mouse gesture bindings", () => {
    const missing = validProfile();
    delete (missing.mouseGestures as Partial<typeof missing.mouseGestures>).doubleClick;
    expect(normalizeSettingsProfile(missing)).toBeNull();

    const invalid = validProfile();
    (invalid.mouseGestures as Record<string, string>).doubleClick = "openMenu";
    expect(normalizeSettingsProfile(invalid)).toBeNull();

    const conflict = validProfile();
    conflict.mouseGestures.doubleClick = "nextPage";
    expect(normalizeSettingsProfile(conflict)).toBeNull();
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
