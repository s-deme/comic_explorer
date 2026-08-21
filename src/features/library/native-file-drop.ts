import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import type { UnlistenFn } from "@tauri-apps/api/event";

export interface NativeDropTarget {
  relativePath: string;
}

export function nativeDropTargetAt(
  position: { x: number; y: number },
  documentValue: Pick<Document, "elementFromPoint"> = document,
  scaleFactor = window.devicePixelRatio || 1,
): NativeDropTarget | null {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return null;
  const element = documentValue.elementFromPoint(
    position.x / scaleFactor,
    position.y / scaleFactor,
  );
  const target = element?.closest<HTMLElement>("[data-native-drop-path]") ?? null;
  if (target === null || !target.hasAttribute("data-native-drop-path")) return null;
  return { relativePath: target.dataset.nativeDropPath ?? "" };
}

export async function listenNativeFileDrops(
  handler: (event: DragDropEvent) => void,
): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent((event) => handler(event.payload));
}
