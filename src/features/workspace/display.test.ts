import { describe, expect, it } from "vitest";
import {
  restoreWorkspaceDisplay,
  shellGridRows,
  trayRuntimeAvailable,
  workspaceGridColumns,
} from "./display";

describe("workspace display", () => {
  it("collapses hidden menu and toolbar rows without changing catalog rows", () => {
    expect(shellGridRows({ menuBarVisible: false, toolbarVisible: false })).toBe(
      "0px 0px 40px 40px minmax(0, 1fr) 28px",
    );
  });

  it("removes the tree columns while preserving a full-width catalog", () => {
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

  it("keeps tray storage disabled unless the Tauri runtime is present", () => {
    expect(trayRuntimeAvailable({})).toBe(false);
    expect(trayRuntimeAvailable({ __TAURI_INTERNALS__: {} })).toBe(true);
  });
});
