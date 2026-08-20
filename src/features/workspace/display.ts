export interface WorkspaceDisplayState {
  treeVisible: boolean;
  menuBarVisible: boolean;
  toolbarVisible: boolean;
  addressBarVisible: boolean;
  statusBarVisible: boolean;
}

export function shellGridRows(state: Omit<WorkspaceDisplayState, "treeVisible">): string {
  return [
    ...(state.menuBarVisible ? ["28px"] : []),
    ...(state.toolbarVisible ? ["minmax(42px, auto)"] : []),
    ...(state.addressBarVisible ? ["32px"] : []),
    "minmax(0, 1fr)",
    ...(state.statusBarVisible ? ["28px"] : []),
  ].join(" ");
}

export function workspaceGridColumns(treeVisible: boolean, treeWidth: number): string {
  return treeVisible ? `${Math.max(180, treeWidth)}px 6px minmax(0, 1fr)` : "minmax(0, 1fr)";
}

export function restoreWorkspaceDisplay(): WorkspaceDisplayState {
  return {
    treeVisible: true,
    menuBarVisible: true,
    toolbarVisible: true,
    addressBarVisible: true,
    statusBarVisible: true,
  };
}

export function trayStatusAvailable(status: { available: boolean } | null | undefined): boolean {
  return status?.available === true;
}
