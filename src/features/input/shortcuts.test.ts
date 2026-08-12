import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  LEGACY_SHORTCUT_COMMANDS,
  SHORTCUT_COMMANDS,
  SHORTCUT_DESCRIPTIONS,
  SHORTCUT_GROUPS,
  fallbackCatalogShortcutCommand,
  isCatalogShortcutCommand,
  isViewerShortcutCommand,
  normalizeShortcutBindings,
  remapShortcut,
} from "./shortcuts";

function keyEvent(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, ...options });
}

describe("configurable shortcuts", () => {
  it("defines a group, description, and unique default for every command", () => {
    expect(Object.keys(DEFAULT_SHORTCUTS)).toEqual([...SHORTCUT_COMMANDS]);
    expect(new Set(Object.values(DEFAULT_SHORTCUTS)).size).toBe(SHORTCUT_COMMANDS.length);
    for (const command of SHORTCUT_COMMANDS) {
      expect(SHORTCUT_GROUPS[command]).toMatch(/^(catalog|viewer)$/);
      expect(SHORTCUT_DESCRIPTIONS[command]).not.toBe("");
    }
  });

  it("migrates the exact legacy command map by merging new defaults", () => {
    const legacy = Object.fromEntries(
      LEGACY_SHORTCUT_COMMANDS.map((command) => [
        command,
        command === "nextPage" ? "N" : DEFAULT_SHORTCUTS[command],
      ]),
    );
    expect(normalizeShortcutBindings(legacy)).toEqual({
      ...DEFAULT_SHORTCUTS,
      nextPage: "N",
    });
  });

  it("preserves legacy assignments when they collide with a new command default", () => {
    const legacy = Object.fromEntries(
      LEGACY_SHORTCUT_COMMANDS.map((command) => [command, DEFAULT_SHORTCUTS[command]]),
    );
    legacy.nextPage = "F11";
    legacy.previousPage = "Ctrl+F";
    const migrated = normalizeShortcutBindings(legacy);

    expect(migrated.nextPage).toBe("F11");
    expect(migrated.previousPage).toBe("Ctrl+F");
    expect(migrated.toggleFullscreen).not.toBe("F11");
    expect(migrated.toggleSearch).not.toBe("Ctrl+F");
    expect(new Set(Object.values(migrated)).size).toBe(SHORTCUT_COMMANDS.length);
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
      bindings: { ...DEFAULT_SHORTCUTS, nextPage: "Ctrl+N" },
    });
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
