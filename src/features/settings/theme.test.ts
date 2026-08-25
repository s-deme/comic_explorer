import { describe, expect, it } from "vitest";
import {
  applyResolvedTheme,
  BUILTIN_THEME_IDS,
  BUILTIN_THEMES,
  contrastRatio,
  normalizeCustomThemeSnapshot,
  normalizeThemeDefinitionV1,
  normalizeThemeSelection,
  resolveTheme,
  THEME_COLOR_KEYS,
  THEME_CSS_PROPERTIES,
  themeSelectionMatchesSnapshot,
  validateThemeContrast,
  type CustomThemeSnapshot,
  type ThemeDefinitionV1,
} from "./theme";

function customDefinition(): ThemeDefinitionV1 {
  return {
    schemaVersion: 1,
    name: "My Midnight",
    baseScheme: "dark",
    colors: { ...BUILTIN_THEMES.midnight.colors },
  };
}

function customSnapshot(): CustomThemeSnapshot {
  return {
    themeId: 17,
    revision: 3,
    definition: customDefinition(),
  };
}

describe("application theme model", () => {
  it("defines seven complete built-in palettes that pass the shared contrast boundary", () => {
    expect(BUILTIN_THEME_IDS).toEqual([
      "light", "dark", "paper", "midnight", "oled", "forest", "highContrast",
    ]);
    for (const id of BUILTIN_THEME_IDS) {
      const definition = BUILTIN_THEMES[id];
      expect(definition.schemaVersion).toBe(1);
      expect(Object.keys(definition.colors)).toEqual(THEME_COLOR_KEYS);
      expect(validateThemeContrast(definition.colors)).toEqual([]);
      expect(normalizeThemeDefinitionV1(definition)).toEqual(definition);
    }
  });

  it("computes WCAG contrast and reports the exact failing semantic pair", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 6);
    expect(contrastRatio("invalid", "#FFFFFF")).toBe(0);
    const colors = { ...BUILTIN_THEMES.light.colors, textMuted: "#FFFFFF" };
    expect(validateThemeContrast(colors)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        foreground: "textMuted",
        background: "surface",
        ratio: 1,
        minimum: 4.5,
      }),
    ]));
  });

  it("normalizes a strict v1 definition, including its name and hex casing", () => {
    const definition = customDefinition();
    const normalized = normalizeThemeDefinitionV1({
      ...definition,
      name: "  My Midnight  ",
      colors: Object.fromEntries(
        Object.entries(definition.colors).map(([key, color]) => [key, color.toLowerCase()]),
      ),
    });
    expect(normalized).toEqual(definition);
    expect(normalized).not.toBe(definition);
    expect(normalized?.colors).not.toBe(definition.colors);
  });

  it.each([
    { ...customDefinition(), schemaVersion: 2 },
    { ...customDefinition(), baseScheme: "sepia" },
    { ...customDefinition(), name: "" },
    { ...customDefinition(), name: "A".repeat(65) },
    { ...customDefinition(), name: "folder/theme" },
    { ...customDefinition(), name: "unsafe\u0085name" },
    { ...customDefinition(), executable: "alert(1)" },
    { ...customDefinition(), colors: { ...customDefinition().colors, text: "white" } },
    { ...customDefinition(), colors: { ...customDefinition().colors, script: "#000000" } },
    { ...customDefinition(), colors: { ...customDefinition().colors, text: "#17202B" } },
  ])("rejects malformed, executable, unknown, or low-contrast definitions", (definition) => {
    expect(normalizeThemeDefinitionV1(definition)).toBeNull();
  });

  it("normalizes only exact selection variants with positive safe numeric custom identities", () => {
    expect(normalizeThemeSelection({ kind: "system" })).toEqual({ kind: "system" });
    expect(normalizeThemeSelection({ kind: "builtin", themeId: "forest" })).toEqual({
      kind: "builtin",
      themeId: "forest",
    });
    expect(normalizeThemeSelection({ kind: "custom", themeId: 17, revision: 3 })).toEqual({
      kind: "custom",
      themeId: 17,
      revision: 3,
    });
    for (const invalid of [
      { kind: "system", themeId: "light" },
      { kind: "builtin", themeId: "system" },
      { kind: "custom", themeId: 0, revision: 3 },
      { kind: "custom", themeId: 17, revision: -1 },
      { kind: "custom", themeId: 17.5, revision: 3 },
      { kind: "custom", themeId: "17", revision: 3 },
      { kind: "custom", themeId: 17, revision: 3, snapshot: customDefinition() },
    ]) expect(normalizeThemeSelection(invalid)).toBeNull();
  });

  it("normalizes a snapshot independently and enforces its selection identity", () => {
    const snapshot = customSnapshot();
    const normalized = normalizeCustomThemeSnapshot(snapshot);
    expect(normalized).toEqual(snapshot);
    expect(normalized).not.toBe(snapshot);
    expect(normalized?.definition).not.toBe(snapshot.definition);
    expect(themeSelectionMatchesSnapshot(
      { kind: "custom", themeId: 17, revision: 3 },
      normalized,
    )).toBe(true);
    expect(themeSelectionMatchesSnapshot(
      { kind: "custom", themeId: 17, revision: 4 },
      normalized,
    )).toBe(false);
    expect(themeSelectionMatchesSnapshot({ kind: "system" }, null)).toBe(true);
    expect(themeSelectionMatchesSnapshot({ kind: "builtin", themeId: "dark" }, normalized)).toBe(false);
    expect(normalizeCustomThemeSnapshot({ ...snapshot, revision: 0 })).toBeNull();
    expect(normalizeCustomThemeSnapshot({ ...snapshot, unknown: true })).toBeNull();
  });

  it("resolves system dynamically, fixed built-ins stably, and matching custom snapshots", () => {
    expect(resolveTheme({ kind: "system" }, null, "dark")).toMatchObject({
      source: "system",
      themeId: "system",
      baseScheme: "dark",
      colors: BUILTIN_THEMES.dark.colors,
      fallbackReason: null,
    });
    expect(resolveTheme({ kind: "builtin", themeId: "paper" }, null, "dark")).toMatchObject({
      source: "builtin",
      themeId: "paper",
      baseScheme: "light",
      colors: BUILTIN_THEMES.paper.colors,
      fallbackReason: null,
    });
    const snapshot = customSnapshot();
    expect(resolveTheme(
      { kind: "custom", themeId: 17, revision: 3 },
      snapshot,
      "light",
    )).toMatchObject({
      source: "custom",
      themeId: 17,
      baseScheme: "dark",
      colors: snapshot.definition.colors,
      fallbackReason: null,
    });
  });

  it("falls back to light without consuming a missing or stale custom snapshot", () => {
    for (const snapshot of [null, { ...customSnapshot(), revision: 4 }]) {
      expect(resolveTheme(
        { kind: "custom", themeId: 17, revision: 3 },
        snapshot,
        "dark",
      )).toMatchObject({
        source: "fallback",
        themeId: "light",
        baseScheme: "light",
        colors: BUILTIN_THEMES.light.colors,
        fallbackReason: "customSnapshotMissingOrStale",
      });
    }
  });

  it("applies every semantic variable and replaces stale DOM theme metadata", () => {
    const root = document.createElement("div");
    const fallback = resolveTheme(
      { kind: "custom", themeId: 17, revision: 3 },
      null,
      "dark",
    );
    applyResolvedTheme(root, fallback);
    expect(root.dataset.themeFallback).toBe("customSnapshotMissingOrStale");

    const resolved = resolveTheme({ kind: "builtin", themeId: "oled" }, null, "light");
    applyResolvedTheme(root, resolved);
    for (const key of THEME_COLOR_KEYS) {
      expect(root.style.getPropertyValue(THEME_CSS_PROPERTIES[key])).toBe(resolved.colors[key]);
    }
    expect(root.style.colorScheme).toBe("dark");
    expect(root.dataset).toMatchObject({
      themeKind: "builtin",
      themeId: "oled",
      themeScheme: "dark",
    });
    expect(root.hasAttribute("data-theme-fallback")).toBe(false);
  });
});
