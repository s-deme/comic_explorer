import { describe, expect, it } from "vitest";
import {
  restoreWorkspaceDisplay,
  shellGridRows,
  trayStatusAvailable,
  workspaceGridLayout,
} from "./display";

describe("workspace display", () => {
  it("keeps the five visible shell surfaces in their declared order", () => {
    expect(shellGridRows({ menuBarVisible: true, toolbarVisible: true, addressBarVisible: true, statusBarVisible: true })).toBe(
      "28px minmax(42px, auto) 32px minmax(0, 1fr) 28px",
    );
  });

  it("FT-B18-002 removes hidden menu and toolbar tracks so remaining surfaces compact", () => {
    expect(shellGridRows({ menuBarVisible: false, toolbarVisible: true, addressBarVisible: true, statusBarVisible: true })).toBe(
      "minmax(42px, auto) 32px minmax(0, 1fr) 28px",
    );
    expect(shellGridRows({ menuBarVisible: true, toolbarVisible: false, addressBarVisible: true, statusBarVisible: true })).toBe(
      "28px 32px minmax(0, 1fr) 28px",
    );
    expect(shellGridRows({ menuBarVisible: false, toolbarVisible: false, addressBarVisible: true, statusBarVisible: true })).toBe(
      "32px minmax(0, 1fr) 28px",
    );
  });

  it("FT-B18-001 removes the tree columns while preserving a full-width catalog", () => {
    expect(workspaceGridLayout(false, "left", 240, 240)).toEqual({
      gridTemplateAreas: '"catalog"',
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateRows: "minmax(0, 1fr)",
      separatorOrientation: "vertical",
    });
  });

  it("REQ-LEY-P4-004 maps all four catalog positions to bounded grid tracks", () => {
    expect(workspaceGridLayout(true, "right", 120, 999)).toEqual({
      gridTemplateAreas: '"navigation separator catalog"',
      gridTemplateColumns: "180px 6px minmax(0, 1fr)",
      gridTemplateRows: "minmax(0, 1fr)",
      separatorOrientation: "vertical",
    });
    expect(workspaceGridLayout(true, "left", 999, 240).gridTemplateAreas)
      .toBe('"catalog separator navigation"');
    expect(workspaceGridLayout(true, "top", 240, 80)).toEqual({
      gridTemplateAreas: '"catalog" "separator" "navigation"',
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateRows: "minmax(0, 1fr) 6px 120px",
      separatorOrientation: "horizontal",
    });
    expect(workspaceGridLayout(true, "bottom", 240, 999).gridTemplateRows)
      .toBe("480px 6px minmax(0, 1fr)");
  });

  it("REQ-LEY-P4-004 resolves 10,000 catalog layouts per position within one second", () => {
    const started = performance.now();
    for (const position of ["right", "left", "top", "bottom"] as const) {
      for (let index = 0; index < 10_000; index += 1) {
        workspaceGridLayout(true, position, 180 + (index % 301), 120 + (index % 361));
      }
    }
    const elapsedMs = performance.now() - started;
    console.info(`REQ-LEY-P4-004 4 x 10,000 layout helper calls: ${elapsedMs.toFixed(3)}ms`);
    expect(elapsedMs).toBeLessThan(1_000);
  });

  it("restores all current-session display surfaces", () => {
    expect(restoreWorkspaceDisplay()).toEqual({
      treeVisible: true,
      menuBarVisible: true,
      toolbarVisible: true,
      addressBarVisible: true,
      statusBarVisible: true,
    });
  });

  it("uses the native tray initialization status instead of a runtime marker", () => {
    expect(trayStatusAvailable(undefined)).toBe(false);
    expect(trayStatusAvailable(null)).toBe(false);
    expect(trayStatusAvailable({ available: false })).toBe(false);
    expect(trayStatusAvailable({ available: true })).toBe(true);
  });
});
