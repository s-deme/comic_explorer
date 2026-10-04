import { SHORTCUT_LABELS, VIEWER_SHORTCUT_COMMANDS } from "./shortcuts";

export const STROKE_ACTION_LABELS = {
  none: "割り当てなし",
  ...Object.fromEntries(VIEWER_SHORTCUT_COMMANDS.map((key) => [key, SHORTCUT_LABELS[key]])) as Record<typeof VIEWER_SHORTCUT_COMMANDS[number], string>,
  firstPage: "先頭ページ", lastPage: "末尾ページ",
  nextItem: "次の作品", previousItem: "前の作品",
  fit: "画面に合わせる", width: "幅に合わせる", original: "原寸表示",
  autoSpread: "自動見開き", pageList: "ページ一覧",
  addBookmark: "しおり追加", bookmarkList: "しおり一覧", nextBookmark: "次のしおり",
  toggleSlideshow: "スライドショー開始／停止",
};
export type StrokeAction = keyof typeof STROKE_ACTION_LABELS;
export interface StrokeBinding { pattern: string; action: StrokeAction; enabled: boolean }
export interface StrokeGestures { enabled: boolean; threshold: number; showTrail: boolean; bindings: StrokeBinding[] }
export function defaultStrokeGestures(): StrokeGestures {
  return { enabled: true, threshold: 24, showTrail: true, bindings: [
    ["L", "nextPage"], ["R", "previousPage"], ["UR", "firstPage"], ["UL", "lastPage"],
    ["LD", "nextItem"], ["RD", "previousItem"], ["LR", "singlePage"], ["RL", "spreadPage"],
    ["DR", "closeViewer"], ["U", "zoomIn"], ["D", "zoomOut"], ["UD", "fit"], ["DU", "toggleFullscreen"],
  ].map(([pattern, action]) => ({ pattern, action: action as StrokeAction, enabled: true })) };
}
export const strokeArrows = (pattern: string) => [...pattern].map((d) => ({ U: "↑", D: "↓", L: "←", R: "→" })[d]).join("");
export function validStrokePattern(value: string): boolean {
  return /^[UDLR]{1,8}$/.test(value) && !/(.)\1/.test(value);
}
export function parseStrokeGestures(value: unknown): StrokeGestures | null {
  if (value === undefined) return defaultStrokeGestures();
  if (!value || typeof value !== "object") return null;
  const c = value as StrokeGestures;
  if (typeof c.enabled !== "boolean" || typeof c.showTrail !== "boolean"
    || !Number.isInteger(c.threshold) || c.threshold < 8 || c.threshold > 96
    || !Array.isArray(c.bindings) || c.bindings.length > 64) return null;
  const seen = new Set<string>();
  for (const b of c.bindings) {
    if (!b || typeof b.pattern !== "string" || !validStrokePattern(b.pattern)
      || seen.has(b.pattern) || typeof b.enabled !== "boolean"
      || typeof b.action !== "string" || !Object.prototype.hasOwnProperty.call(STROKE_ACTION_LABELS, b.action)) return null;
    seen.add(b.pattern);
  }
  return { enabled: c.enabled, threshold: c.threshold, showTrail: c.showTrail,
    bindings: c.bindings.map(({ pattern, action, enabled }) => ({ pattern, action, enabled })) };
}
export interface StrokeTrace { x: number; y: number; pattern: string; overflow: boolean }
export function traceStroke(trace: StrokeTrace, x: number, y: number, threshold: number): StrokeTrace {
  const dx = x - trace.x, dy = y - trace.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return trace;
  const direction = Math.abs(dx) > Math.abs(dy) ? dx < 0 ? "L" : "R" : dy < 0 ? "U" : "D";
  const pattern = trace.pattern.endsWith(direction) ? trace.pattern : trace.pattern + direction;
  return { x, y, pattern: pattern.slice(0, 9), overflow: trace.overflow || pattern.length > 8 };
}
