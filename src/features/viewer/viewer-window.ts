import { isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const VIEWER_WINDOW_LABEL = "viewer";
export const VIEWER_OPEN_EVENT = "viewer:open";

export type ViewerWindowLaunchMode = "normal" | "fullscreen" | "slideshow";
export type ViewerWindowStartAt = "restored" | "first" | "last";

export interface ViewerWindowLaunch {
  itemRelativePath: string;
  launchMode: ViewerWindowLaunchMode;
  startAt: ViewerWindowStartAt;
  requestedPageKey: string | null;
}

function isLaunchMode(value: string | null): value is ViewerWindowLaunchMode {
  return value === "normal" || value === "fullscreen" || value === "slideshow";
}

function isStartAt(value: string | null): value is ViewerWindowStartAt {
  return value === "restored" || value === "first" || value === "last";
}

export function viewerWindowHash(launch: ViewerWindowLaunch): string {
  const parameters = new URLSearchParams({
    path: launch.itemRelativePath,
    mode: launch.launchMode,
    start: launch.startAt,
  });
  if (launch.requestedPageKey !== null) parameters.set("page", launch.requestedPageKey);
  return `#viewer?${parameters.toString()}`;
}

export function parseViewerWindowHash(hash: string): ViewerWindowLaunch | null {
  if (!hash.startsWith("#viewer?")) return null;
  const parameters = new URLSearchParams(hash.slice("#viewer?".length));
  const itemRelativePath = parameters.get("path");
  const launchMode = parameters.get("mode");
  const startAt = parameters.get("start");
  if (
    itemRelativePath === null
    || itemRelativePath.length === 0
    || !isLaunchMode(launchMode)
    || !isStartAt(startAt)
  ) return null;
  return {
    itemRelativePath,
    launchMode,
    startAt,
    requestedPageKey: parameters.get("page"),
  };
}

export function isViewerWindowLocation(hash = globalThis.location?.hash ?? ""): boolean {
  return parseViewerWindowHash(hash) !== null;
}

function waitForCreation(viewerWindow: WebviewWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    void viewerWindow.once("tauri://created", () => resolve());
    void viewerWindow.once("tauri://error", (event) => reject(new Error(String(event.payload))));
  });
}

/** Opens one reusable Viewer webview window. Returns false outside the Tauri runtime. */
export async function openViewerWindow(launch: ViewerWindowLaunch): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const existing = await WebviewWindow.getByLabel(VIEWER_WINDOW_LABEL);
    if (existing !== null) {
      await emitTo(VIEWER_WINDOW_LABEL, VIEWER_OPEN_EVENT, launch);
      await existing.show();
      await existing.setFocus();
      return true;
    }

    const viewerWindow = new WebviewWindow(VIEWER_WINDOW_LABEL, {
      url: `/${viewerWindowHash(launch)}`,
      title: "Comic Explorer",
      width: 1150,
      height: 800,
      minWidth: 740,
      minHeight: 540,
      center: true,
    });
    await waitForCreation(viewerWindow);
    return true;
  } catch {
    return false;
  }
}
