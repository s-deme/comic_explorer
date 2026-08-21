import type { CatalogPanePosition } from "../settings/profile";

export interface WorkspaceDisplayState {
  treeVisible: boolean;
  menuBarVisible: boolean;
  toolbarVisible: boolean;
  addressBarVisible: boolean;
  statusBarVisible: boolean;
}

export interface WorkspaceGridLayout {
  gridTemplateAreas: string;
  gridTemplateColumns: string;
  gridTemplateRows: string;
  separatorOrientation: "vertical" | "horizontal";
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

export function workspaceGridLayout(
  navigationVisible: boolean,
  catalogPosition: CatalogPanePosition,
  treeWidth: number,
  treeHeight: number,
): WorkspaceGridLayout {
  if (!navigationVisible) {
    return {
      gridTemplateAreas: '"catalog"',
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateRows: "minmax(0, 1fr)",
      separatorOrientation: "vertical",
    };
  }
  const width = Math.max(180, Math.min(480, treeWidth));
  const height = Math.max(120, Math.min(480, treeHeight));
  switch (catalogPosition) {
    case "left":
      return {
        gridTemplateAreas: '"catalog separator navigation"',
        gridTemplateColumns: `minmax(0, 1fr) 6px ${width}px`,
        gridTemplateRows: "minmax(0, 1fr)",
        separatorOrientation: "vertical",
      };
    case "top":
      return {
        gridTemplateAreas: '"catalog" "separator" "navigation"',
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: `minmax(0, 1fr) 6px ${height}px`,
        separatorOrientation: "horizontal",
      };
    case "bottom":
      return {
        gridTemplateAreas: '"navigation" "separator" "catalog"',
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: `${height}px 6px minmax(0, 1fr)`,
        separatorOrientation: "horizontal",
      };
    default:
      return {
        gridTemplateAreas: '"navigation separator catalog"',
        gridTemplateColumns: `${width}px 6px minmax(0, 1fr)`,
        gridTemplateRows: "minmax(0, 1fr)",
        separatorOrientation: "vertical",
      };
  }
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
