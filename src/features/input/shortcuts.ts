export const CATALOG_SHORTCUT_COMMANDS = [
  "openSelected",
  "navigateBack",
  "navigateForward",
  "navigateUp",
  "refreshCatalog",
  "toggleSearch",
] as const;

export const LEGACY_SHORTCUT_COMMANDS = [
  "nextPage",
  "previousPage",
  "closeViewer",
  "singlePage",
  "spreadPage",
  "toggleDirection",
  "zoomIn",
  "zoomOut",
] as const;

export const VIEWER_SHORTCUT_COMMANDS = [
  ...LEGACY_SHORTCUT_COMMANDS,
  "toggleLoupe",
  "toggleFullscreen",
] as const;

export const SHORTCUT_COMMANDS = [
  ...CATALOG_SHORTCUT_COMMANDS,
  ...VIEWER_SHORTCUT_COMMANDS,
] as const;

const MIGRATED_SHORTCUT_COMMANDS = [
  ...CATALOG_SHORTCUT_COMMANDS,
  "toggleLoupe",
  "toggleFullscreen",
] as const;

const MIGRATION_SHORTCUT_FALLBACKS = [
  ...Array.from({ length: 12 }, (_, index) => `Ctrl+Alt+F${index + 1}`),
  ...Array.from({ length: 12 }, (_, index) => `Ctrl+Alt+Shift+F${index + 1}`),
];

export type ShortcutCommand = (typeof SHORTCUT_COMMANDS)[number];
export type CatalogShortcutCommand = (typeof CATALOG_SHORTCUT_COMMANDS)[number];
export type ViewerShortcutCommand = (typeof VIEWER_SHORTCUT_COMMANDS)[number];
export type ShortcutBindings = Record<ShortcutCommand, string[]>;
export type ShortcutGroup = "catalog" | "viewer";

export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  openSelected: ["Enter"],
  navigateBack: ["Alt+ArrowLeft"],
  navigateForward: ["Alt+ArrowRight"],
  navigateUp: ["Alt+ArrowUp"],
  refreshCatalog: ["F5"],
  toggleSearch: ["Ctrl+F"],
  nextPage: ["PageDown"],
  previousPage: ["PageUp"],
  closeViewer: ["Escape"],
  singlePage: ["1"],
  spreadPage: ["2"],
  toggleDirection: ["R"],
  zoomIn: ["+"],
  zoomOut: ["-"],
  toggleLoupe: ["L"],
  toggleFullscreen: ["F11"],
};

export const MAX_SHORTCUTS_PER_COMMAND = 4;

function cloneShortcutBindings(bindings: ShortcutBindings): ShortcutBindings {
  return Object.fromEntries(
    SHORTCUT_COMMANDS.map((command) => [command, [...bindings[command]]]),
  ) as ShortcutBindings;
}

export const SHORTCUT_LABELS: Record<ShortcutCommand, string> = {
  openSelected: "選択項目を開く",
  navigateBack: "前の場所へ戻る",
  navigateForward: "次の場所へ進む",
  navigateUp: "上のフォルダへ",
  refreshCatalog: "現在場所を更新",
  toggleSearch: "検索ペインを切り替える",
  nextPage: "次ページ",
  previousPage: "前ページ",
  closeViewer: "ビューワを閉じる",
  singlePage: "単ページ",
  spreadPage: "見開き",
  toggleDirection: "読み方向",
  zoomIn: "倍率を上げる",
  zoomOut: "倍率を下げる",
  toggleLoupe: "ルーペを切り替える",
  toggleFullscreen: "全画面表示を切り替える",
};

export const SHORTCUT_FALLBACKS: Record<ShortcutCommand, string> = {
  openSelected: "Enter（項目上）",
  navigateBack: "Alt+←",
  navigateForward: "Alt+→",
  navigateUp: "Alt+↑",
  refreshCatalog: "F5",
  toggleSearch: "Ctrl+F",
  nextPage: "Space / 方向キー",
  previousPage: "方向キー",
  closeViewer: "Escape",
  singlePage: "1",
  spreadPage: "2",
  toggleDirection: "R",
  zoomIn: "+ / =",
  zoomOut: "- / _",
  toggleLoupe: "L",
  toggleFullscreen: "F11 / ダブルクリック",
};

export const SHORTCUT_GROUPS: Record<ShortcutCommand, ShortcutGroup> = {
  openSelected: "catalog",
  navigateBack: "catalog",
  navigateForward: "catalog",
  navigateUp: "catalog",
  refreshCatalog: "catalog",
  toggleSearch: "catalog",
  nextPage: "viewer",
  previousPage: "viewer",
  closeViewer: "viewer",
  singlePage: "viewer",
  spreadPage: "viewer",
  toggleDirection: "viewer",
  zoomIn: "viewer",
  zoomOut: "viewer",
  toggleLoupe: "viewer",
  toggleFullscreen: "viewer",
};

export const SHORTCUT_GROUP_LABELS: Record<ShortcutGroup, string> = {
  catalog: "一覧操作",
  viewer: "ビューワ",
};

export const SHORTCUT_DESCRIPTIONS: Record<ShortcutCommand, string> = {
  openSelected: "一覧で選択しているフォルダまたは作品を開きます。",
  navigateBack: "フォルダ移動履歴の前の場所へ戻ります。",
  navigateForward: "戻る前に表示していた場所へ進みます。",
  navigateUp: "現在位置の1つ上のフォルダへ移動します。",
  refreshCatalog: "現在のフォルダを再読み込みします。",
  toggleSearch: "フォルダツリーと検索ペインを切り替えます。",
  nextPage: "次の表示ページへ進みます。縦長ページでは未表示部分を先に送ります。",
  previousPage: "前の表示ページへ戻ります。",
  closeViewer: "全画面を解除するか、ビューワを閉じて一覧へ戻ります。",
  singlePage: "1ページ表示へ切り替えます。",
  spreadPage: "見開き表示へ切り替えます。",
  toggleDirection: "右開きと左開きを切り替えます。",
  zoomIn: "現在の表示倍率を基準に画像を拡大します。",
  zoomOut: "現在の表示倍率を基準に画像を縮小します。",
  toggleLoupe: "ポインター位置を拡大するルーペを表示または非表示にします。",
  toggleFullscreen: "ビューワの全画面表示と解除を切り替えます。",
};

export const RESERVED_SHORTCUTS: Readonly<Record<string, string>> = {
  "Alt+F": "ファイルメニュー",
  "Alt+E": "編集メニュー",
  "Alt+V": "表示メニュー",
  "Alt+O": "オプションメニュー",
  "Alt+H": "ヘルプメニュー",
  "Alt+F4": "アプリの終了",
  "Ctrl+X": "ファイルの切り取り",
  "Ctrl+C": "ファイルのコピー",
  "Ctrl+V": "ファイルの貼り付け",
  Delete: "ごみ箱へ移動",
};

const MODIFIERS = ["Ctrl", "Alt", "Shift", "Meta"] as const;
const MODIFIER_ALIASES: Record<string, (typeof MODIFIERS)[number]> = {
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "Meta",
  win: "Meta",
  windows: "Meta",
  cmd: "Meta",
  command: "Meta",
};

const KEY_ALIASES: Record<string, string> = {
  esc: "Escape",
  escape: "Escape",
  space: "Space",
  spacebar: "Space",
  pgup: "PageUp",
  pageup: "PageUp",
  pgdn: "PageDown",
  pagedown: "PageDown",
  left: "ArrowLeft",
  arrowleft: "ArrowLeft",
  right: "ArrowRight",
  arrowright: "ArrowRight",
  up: "ArrowUp",
  arrowup: "ArrowUp",
  down: "ArrowDown",
  arrowdown: "ArrowDown",
  return: "Enter",
  enter: "Enter",
};

function normalizeKey(value: string): string | null {
  const key = value.trim();
  if (key === "") return null;
  if (key === " ") return "Space";
  if (key.length === 1) {
    if (/^[a-z]$/i.test(key)) return key.toUpperCase();
    if (/^[0-9]$/.test(key) || /^[+\-_=]$/.test(key)) return key;
    return null;
  }
  const alias = KEY_ALIASES[key.toLowerCase()];
  if (alias !== undefined) return alias;
  if (/^f(?:[1-9]|1[0-2])$/i.test(key)) return key.toUpperCase();
  if (/^[a-z][a-z0-9]*$/i.test(key)) {
    return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
  }
  return null;
}

export function normalizeShortcut(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (input === "") return null;
  const modifiers: string[] = [];
  let remainder = input;
  while (true) {
    const separator = remainder.indexOf("+");
    if (separator <= 0) break;
    const modifier = MODIFIER_ALIASES[remainder.slice(0, separator).toLowerCase()];
    if (modifier === undefined || modifiers.includes(modifier)) break;
    modifiers.push(modifier);
    remainder = remainder.slice(separator + 1);
  }
  const key = normalizeKey(remainder);
  if (key === null || MODIFIERS.includes(key as (typeof MODIFIERS)[number])) {
    return null;
  }
  const orderedModifiers = MODIFIERS.filter((modifier) =>
    modifiers.includes(modifier),
  );
  return orderedModifiers.length > 0
    ? `${orderedModifiers.join("+")}+${key}`
    : key;
}

export function eventShortcut(event: Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
>): string | null {
  const key = normalizeKey(event.key);
  if (key === null) return null;
  const modifiers = MODIFIERS.filter((modifier) => {
    switch (modifier) {
      case "Ctrl":
        return event.ctrlKey;
      case "Alt":
        return event.altKey;
      case "Shift":
        return event.shiftKey;
      case "Meta":
        return event.metaKey;
    }
  });
  return modifiers.length > 0
    ? `${modifiers.join("+")}+${key}`
    : key;
}

export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "OPTION"].includes(target.tagName)
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT", "OPTION"].includes(target.tagName)
  );
}

function isCatalogCommandTarget(target: EventTarget | null): boolean {
  if (isEditableTarget(target)) return false;
  if (!(target instanceof Element)) return true;
  const button = target.closest("button");
  return button === null || button.classList.contains("catalog-item");
}

export function validateShortcutBindings(
  value: unknown,
  allowLegacySingles = false,
): ShortcutBindings | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const fullShape = keys.length === SHORTCUT_COMMANDS.length
    && keys.every((command) => SHORTCUT_COMMANDS.includes(command as ShortcutCommand));
  const legacyShape = keys.length === LEGACY_SHORTCUT_COMMANDS.length
    && keys.every((command) => LEGACY_SHORTCUT_COMMANDS.includes(
      command as typeof LEGACY_SHORTCUT_COMMANDS[number],
    ));
  if (!fullShape && !legacyShape) return null;
  const normalized = {} as ShortcutBindings;
  const seen = new Set<string>();
  const sourceCommands = legacyShape ? LEGACY_SHORTCUT_COMMANDS : SHORTCUT_COMMANDS;
  for (const command of sourceCommands) {
    const raw = candidate[command];
    const rawBindings = Array.isArray(raw)
      ? raw
      : allowLegacySingles && typeof raw === "string" ? [raw] : null;
    if (
      rawBindings === null
      || rawBindings.length < 1
      || rawBindings.length > MAX_SHORTCUTS_PER_COMMAND
    ) return null;
    const bindings: string[] = [];
    for (const rawBinding of rawBindings) {
      const shortcut = normalizeShortcut(rawBinding);
      if (
        shortcut === null
        || RESERVED_SHORTCUTS[shortcut] !== undefined
        || seen.has(shortcut)
      ) return null;
      bindings.push(shortcut);
      seen.add(shortcut);
    }
    normalized[command] = bindings;
  }
  if (legacyShape) {
    let fallbackIndex = 0;
    for (const command of MIGRATED_SHORTCUT_COMMANDS) {
      let shortcut = DEFAULT_SHORTCUTS[command][0];
      while (seen.has(shortcut)) {
        shortcut = MIGRATION_SHORTCUT_FALLBACKS[fallbackIndex] ?? "";
        fallbackIndex += 1;
        if (shortcut === "") return null;
      }
      normalized[command] = [shortcut];
      seen.add(shortcut);
    }
  }
  return normalized;
}

export function normalizeShortcutBindings(value: unknown): ShortcutBindings {
  return validateShortcutBindings(value, true) ?? cloneShortcutBindings(DEFAULT_SHORTCUTS);
}

export function resetShortcutBindings(): ShortcutBindings {
  return cloneShortcutBindings(DEFAULT_SHORTCUTS);
}

export type RemapShortcutResult =
  | { ok: true; bindings: ShortcutBindings }
  | {
      ok: false;
      reason: "invalid" | "conflict" | "reserved";
      conflict?: ShortcutCommand;
      reservedLabel?: string;
    };

export function remapShortcut(
  bindings: ShortcutBindings,
  command: ShortcutCommand,
  value: unknown,
  index = 0,
): RemapShortcutResult {
  const shortcut = normalizeShortcut(value);
  if (shortcut === null) return { ok: false, reason: "invalid" };
  const reservedLabel = RESERVED_SHORTCUTS[shortcut];
  if (reservedLabel !== undefined) {
    return { ok: false, reason: "reserved", reservedLabel };
  }
  const conflict = SHORTCUT_COMMANDS.find(
    (candidate) => bindings[candidate].some(
      (binding, bindingIndex) => binding === shortcut
        && (candidate !== command || bindingIndex !== index),
    ),
  );
  if (conflict !== undefined) {
    return { ok: false, reason: "conflict", conflict };
  }
  const current = bindings[command];
  if (index < 0 || index > current.length || index >= MAX_SHORTCUTS_PER_COMMAND) {
    return { ok: false, reason: "invalid" };
  }
  const next = [...current];
  if (index === current.length) next.push(shortcut);
  else next[index] = shortcut;
  return {
    ok: true,
    bindings: { ...bindings, [command]: next },
  };
}

export function removeShortcut(
  bindings: ShortcutBindings,
  command: ShortcutCommand,
  index: number,
): ShortcutBindings | null {
  const current = bindings[command];
  if (current.length <= 1 || index < 0 || index >= current.length) return null;
  return {
    ...bindings,
    [command]: current.filter((_, bindingIndex) => bindingIndex !== index),
  };
}

export function customShortcutCommand(
  event: KeyboardEvent,
  bindings: ShortcutBindings,
): ShortcutCommand | undefined {
  if (isTextInputTarget(event.target)) return undefined;
  const pressed = eventShortcut(event);
  if (pressed === null) return undefined;
  return SHORTCUT_COMMANDS.find((command) => bindings[command].includes(pressed));
}

export function customCatalogShortcutCommand(
  event: KeyboardEvent,
  bindings: ShortcutBindings,
): CatalogShortcutCommand | undefined {
  if (!isCatalogCommandTarget(event.target)) return undefined;
  const pressed = eventShortcut(event);
  if (pressed === null) return undefined;
  return CATALOG_SHORTCUT_COMMANDS.find(
    (command) => bindings[command].includes(pressed),
  );
}

export function isCatalogShortcutCommand(
  command: ShortcutCommand | undefined,
): command is CatalogShortcutCommand {
  return command !== undefined && CATALOG_SHORTCUT_COMMANDS.includes(
    command as CatalogShortcutCommand,
  );
}

export function isViewerShortcutCommand(
  command: ShortcutCommand | undefined,
): command is ViewerShortcutCommand {
  return command !== undefined && VIEWER_SHORTCUT_COMMANDS.includes(
    command as ViewerShortcutCommand,
  );
}

export function fallbackCatalogShortcutCommand(
  event: KeyboardEvent,
): CatalogShortcutCommand | undefined {
  if (!isCatalogCommandTarget(event.target)) return undefined;
  const pressed = eventShortcut(event);
  switch (pressed) {
    case "Enter":
      return "openSelected";
    case "Alt+ArrowLeft":
      return "navigateBack";
    case "Alt+ArrowRight":
      return "navigateForward";
    case "Alt+ArrowUp":
      return "navigateUp";
    case "F5":
      return "refreshCatalog";
    case "Ctrl+F":
      return "toggleSearch";
    default:
      return undefined;
  }
}

export function fallbackShortcutCommand(
  event: KeyboardEvent,
  direction: "rightToLeft" | "leftToRight",
): ShortcutCommand | undefined {
  if (isTextInputTarget(event.target)) return undefined;
  switch (event.key) {
    case "PageDown":
    case " ":
      return "nextPage";
    case "PageUp":
      return "previousPage";
    case "Escape":
      return "closeViewer";
    case "1":
      return "singlePage";
    case "2":
      return "spreadPage";
    case "r":
    case "R":
      return "toggleDirection";
    case "+":
    case "=":
      return "zoomIn";
    case "-":
    case "_":
      return "zoomOut";
    case "l":
    case "L":
      return "toggleLoupe";
    case "F11":
      return "toggleFullscreen";
    case "ArrowLeft":
      return direction === "rightToLeft" ? "nextPage" : "previousPage";
    case "ArrowRight":
      return direction === "rightToLeft" ? "previousPage" : "nextPage";
    default:
      return undefined;
  }
}
