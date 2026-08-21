import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  LEGACY_SHORTCUT_COMMANDS,
  SHORTCUT_COMMANDS,
  SHORTCUT_DESCRIPTIONS,
  SHORTCUT_GROUPS,
  fallbackCatalogShortcutCommand,
  customShortcutCommand,
  isCatalogShortcutCommand,
  isViewerShortcutCommand,
  normalizeShortcutBindings,
  removeShortcut,
  remapShortcut,
} from "./shortcuts";

function keyEvent(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, ...options });
}

describe("configurable shortcuts", () => {
  it("defines a group, description, and unique default for every command", () => {
    expect(Object.keys(DEFAULT_SHORTCUTS)).toEqual([...SHORTCUT_COMMANDS]);
    expect(new Set(Object.values(DEFAULT_SHORTCUTS).flat()).size).toBe(SHORTCUT_COMMANDS.length);
    for (const command of SHORTCUT_COMMANDS) {
      expect(SHORTCUT_GROUPS[command]).toMatch(/^(catalog|viewer)$/);
      expect(SHORTCUT_DESCRIPTIONS[command]).not.toBe("");
    }
  });

  it("migrates the exact legacy command map by merging new defaults", () => {
    const legacy = Object.fromEntries(
      LEGACY_SHORTCUT_COMMANDS.map((command) => [
        command,
        command === "nextPage" ? "N" : DEFAULT_SHORTCUTS[command][0],
      ]),
    );
    expect(normalizeShortcutBindings(legacy)).toEqual({
      ...DEFAULT_SHORTCUTS,
      nextPage: ["N"],
    });
  });

  it("preserves legacy assignments when they collide with a new command default", () => {
    const legacy = Object.fromEntries(
      LEGACY_SHORTCUT_COMMANDS.map((command) => [command, DEFAULT_SHORTCUTS[command][0]]),
    );
    legacy.nextPage = "F11";
    legacy.previousPage = "Ctrl+F";
    const migrated = normalizeShortcutBindings(legacy);

    expect(migrated.nextPage).toEqual(["F11"]);
    expect(migrated.previousPage).toEqual(["Ctrl+F"]);
    expect(migrated.toggleFullscreen).not.toEqual(["F11"]);
    expect(migrated.toggleSearch).not.toEqual(["Ctrl+F"]);
    expect(new Set(Object.values(migrated).flat()).size).toBe(SHORTCUT_COMMANDS.length);
  });

  it("rejects command conflicts and app-reserved operations", () => {
    expect(remapShortcut(DEFAULT_SHORTCUTS, "nextPage", "PageUp")).toEqual({
      ok: false,
      reason: "conflict",
      conflict: "previousPage",
    });
    expect(remapShortcut(DEFAULT_SHORTCUTS, "nextPage", "Ctrl+C")).toEqual({
      ok: false,
      reason: "reserved",
      reservedLabel: "ファイルのコピー",
    });
    expect(remapShortcut(DEFAULT_SHORTCUTS, "nextPage", "Ctrl+N")).toEqual({
      ok: true,
      bindings: { ...DEFAULT_SHORTCUTS, nextPage: ["Ctrl+N"] },
    });
  });

  it("REQ-LEY-P3-011 adds, resolves, edits, and removes ordered alternate bindings", () => {
    const added = remapShortcut(DEFAULT_SHORTCUTS, "nextPage", "N", 1);
    expect(added).toMatchObject({ ok: true });
    if (!added.ok) throw new Error("alternate binding was rejected");
    expect(added.bindings.nextPage).toEqual(["PageDown", "N"]);
    expect(customShortcutCommand(keyEvent("N"), added.bindings)).toBe("nextPage");

    const edited = remapShortcut(added.bindings, "nextPage", "Ctrl+N", 1);
    expect(edited).toMatchObject({ ok: true });
    if (!edited.ok) throw new Error("alternate edit was rejected");
    expect(edited.bindings.nextPage).toEqual(["PageDown", "Ctrl+N"]);
    expect(removeShortcut(edited.bindings, "nextPage", 0)?.nextPage).toEqual(["Ctrl+N"]);
    expect(removeShortcut(DEFAULT_SHORTCUTS, "nextPage", 0)).toBeNull();
  });

  it("resolves catalog fallback commands without leaking them into the viewer scope", () => {
    const refresh = fallbackCatalogShortcutCommand(keyEvent("F5"));
    const search = fallbackCatalogShortcutCommand(keyEvent("f", { ctrlKey: true }));
    expect(refresh).toBe("refreshCatalog");
    expect(search).toBe("toggleSearch");
    expect(isCatalogShortcutCommand(refresh)).toBe(true);
    expect(isViewerShortcutCommand(refresh)).toBe(false);
    expect(isViewerShortcutCommand("toggleFullscreen")).toBe(true);
  });
});
