import {
  SHORTCUT_LABELS,
  VIEWER_SHORTCUT_COMMANDS,
  type ViewerShortcutCommand,
} from "./shortcuts";

export const VIEWER_QUADRANT_NAMES = [
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
] as const;

export type ViewerQuadrant = (typeof VIEWER_QUADRANT_NAMES)[number];
export const VIEWER_QUADRANT_ACTIONS = ["none", ...VIEWER_SHORTCUT_COMMANDS] as const;
export type ViewerQuadrantAction = (typeof VIEWER_QUADRANT_ACTIONS)[number];
export type ViewerQuadrantBindings = Record<ViewerQuadrant, ViewerQuadrantAction>;

export const DEFAULT_VIEWER_QUADRANT_BINDINGS: ViewerQuadrantBindings = {
  topLeft: "previousPage",
  topRight: "nextPage",
  bottomLeft: "previousPage",
  bottomRight: "nextPage",
};

export const VIEWER_QUADRANT_LABELS: Record<ViewerQuadrant, string> = {
  topLeft: "左上",
  topRight: "右上",
  bottomLeft: "左下",
  bottomRight: "右下",
};

export function viewerQuadrantActionLabel(action: ViewerQuadrantAction): string {
  return action === "none" ? "何もしない" : SHORTCUT_LABELS[action as ViewerShortcutCommand];
}

export function strictViewerQuadrantBindings(value: unknown): ViewerQuadrantBindings | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (
    keys.length !== VIEWER_QUADRANT_NAMES.length
    || !keys.every((name) => VIEWER_QUADRANT_NAMES.includes(name as ViewerQuadrant))
  ) return null;
  const bindings = {} as ViewerQuadrantBindings;
  for (const quadrant of VIEWER_QUADRANT_NAMES) {
    const action = candidate[quadrant];
    if (!VIEWER_QUADRANT_ACTIONS.includes(action as ViewerQuadrantAction)) return null;
    bindings[quadrant] = action as ViewerQuadrantAction;
  }
  return bindings;
}

export function viewerQuadrantAt(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
): ViewerQuadrant | null {
  if (
    !Number.isFinite(clientX)
    || !Number.isFinite(clientY)
    || !Number.isFinite(bounds.left)
    || !Number.isFinite(bounds.top)
    || !Number.isFinite(bounds.width)
    || !Number.isFinite(bounds.height)
    || bounds.width <= 0
    || bounds.height <= 0
  ) return null;
  const horizontal = clientX < bounds.left + bounds.width / 2 ? "Left" : "Right";
  const vertical = clientY < bounds.top + bounds.height / 2 ? "top" : "bottom";
  return `${vertical}${horizontal}` as ViewerQuadrant;
}
