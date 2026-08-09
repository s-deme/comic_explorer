export interface WorkspaceDisplayState {
  treeVisible: boolean;
  menuBarVisible: boolean;
  toolbarVisible: boolean;
}

export function shellGridRows(state: Pick<WorkspaceDisplayState, "menuBarVisible" | "toolbarVisible">): string {
  return `${state.menuBarVisible ? "34px" : "0px"} ${state.toolbarVisible ? "42px" : "0px"} 40px 40px minmax(0, 1fr) 28px`;
}

export function workspaceGridColumns(treeVisible: boolean, treeWidth: number): string {
  return treeVisible ? `${Math.max(180, treeWidth)}px 6px minmax(0, 1fr)` : "minmax(0, 1fr)";
}

export function restoreWorkspaceDisplay(): WorkspaceDisplayState {
  return { treeVisible: true, menuBarVisible: true, toolbarVisible: true };
}

export function trayRuntimeAvailable(runtime: unknown): boolean {
  return typeof runtime === "object" && runtime !== null && "__TAURI_INTERNALS__" in runtime;
}
