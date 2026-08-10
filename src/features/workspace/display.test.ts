import { describe, expect, it } from "vitest";
import {
  restoreWorkspaceDisplay,
  shellGridRows,
  trayStatusAvailable,
  workspaceGridColumns,
} from "./display";

describe("workspace display", () => {
  it("keeps all seven visible shell surfaces in their declared order", () => {
    expect(shellGridRows({ menuBarVisible: true, toolbarVisible: true })).toBe(
      "34px 42px 40px 40px 40px minmax(0, 1fr) 28px",
    );
  });

  it("FT-B18-002 removes hidden menu and toolbar tracks so remaining surfaces compact", () => {
    expect(shellGridRows({ menuBarVisible: false, toolbarVisible: true })).toBe(
      "42px 40px 40px 40px minmax(0, 1fr) 28px",
    );
    expect(shellGridRows({ menuBarVisible: true, toolbarVisible: false })).toBe(
      "34px 40px 40px 40px minmax(0, 1fr) 28px",
    );
    expect(shellGridRows({ menuBarVisible: false, toolbarVisible: false })).toBe(
      "40px 40px 40px minmax(0, 1fr) 28px",
    );
  });

  it("FT-B18-001 removes the tree columns while preserving a full-width catalog", () => {
    expect(workspaceGridColumns(false, 240)).toBe("minmax(0, 1fr)");
    expect(workspaceGridColumns(true, 120)).toBe("180px 6px minmax(0, 1fr)");
  });

  it("restores all current-session display surfaces", () => {
    expect(restoreWorkspaceDisplay()).toEqual({
      treeVisible: true,
      menuBarVisible: true,
      toolbarVisible: true,
    });
  });

  it("uses the native tray initialization status instead of a runtime marker", () => {
    expect(trayStatusAvailable(undefined)).toBe(false);
    expect(trayStatusAvailable(null)).toBe(false);
    expect(trayStatusAvailable({ available: false })).toBe(false);
    expect(trayStatusAvailable({ available: true })).toBe(true);
  });
});
