import {
  CATALOG_SHORTCUT_COMMANDS,
  SHORTCUT_LABELS,
  type CatalogShortcutCommand,
} from "./shortcuts";

export const CATALOG_MOUSE_GESTURE_NAMES = [
  "primaryClick",
  "doubleClick",
  "middleClick",
  "backButton",
  "forwardButton",
] as const;

export type CatalogMouseGesture = (typeof CATALOG_MOUSE_GESTURE_NAMES)[number];
export const CATALOG_MOUSE_ACTIONS = [
  "none",
  "selectOnly",
  ...CATALOG_SHORTCUT_COMMANDS,
] as const;
export type CatalogMouseAction = (typeof CATALOG_MOUSE_ACTIONS)[number];
export type CatalogMouseBindings = Record<CatalogMouseGesture, CatalogMouseAction>;

export const DEFAULT_CATALOG_MOUSE_BINDINGS: CatalogMouseBindings = {
  primaryClick: "selectOnly",
  doubleClick: "openSelected",
  middleClick: "none",
  backButton: "navigateBack",
  forwardButton: "navigateForward",
};

export const CATALOG_MOUSE_GESTURE_LABELS: Record<CatalogMouseGesture, string> = {
  primaryClick: "左クリック",
  doubleClick: "左ダブルクリック",
  middleClick: "中央ボタン",
  backButton: "戻るボタン",
  forwardButton: "進むボタン",
};

export const CATALOG_MOUSE_GESTURE_DESCRIPTIONS: Record<CatalogMouseGesture, string> = {
  primaryClick: "修飾キーなしの左クリックです。選択は割当にかかわらず即時反映します。",
  doubleClick: "左ダブルクリックです。待機中の左クリック追加操作を取り消して1回だけ実行します。",
  middleClick: "中央ボタンです。ブラウザーの自動スクロールを抑止します。",
  backButton: "5ボタンマウスの戻るボタンです。",
  forwardButton: "5ボタンマウスの進むボタンです。",
};

export function catalogMouseActionLabel(action: CatalogMouseAction): string {
  if (action === "none") return "追加操作なし";
  if (action === "selectOnly") return "選択のみ";
  return SHORTCUT_LABELS[action as CatalogShortcutCommand];
}

export function strictCatalogMouseBindings(value: unknown): CatalogMouseBindings | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== CATALOG_MOUSE_GESTURE_NAMES.length
    || !Object.keys(candidate).every((name) =>
      CATALOG_MOUSE_GESTURE_NAMES.includes(name as CatalogMouseGesture))
  ) return null;
  const bindings = {} as CatalogMouseBindings;
  for (const gesture of CATALOG_MOUSE_GESTURE_NAMES) {
    const action = candidate[gesture];
    if (!CATALOG_MOUSE_ACTIONS.includes(action as CatalogMouseAction)) return null;
    bindings[gesture] = action as CatalogMouseAction;
  }
  return bindings;
}

export function cloneCatalogMouseBindings(
  bindings: CatalogMouseBindings,
): CatalogMouseBindings {
  return { ...bindings };
}
