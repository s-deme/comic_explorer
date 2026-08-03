export const SHORTCUT_COMMANDS = [
  "nextPage",
  "previousPage",
  "closeViewer",
  "singlePage",
  "spreadPage",
  "toggleDirection",
  "zoomIn",
  "zoomOut",
] as const;

export type ShortcutCommand = (typeof SHORTCUT_COMMANDS)[number];
export type ShortcutBindings = Record<ShortcutCommand, string>;

export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  nextPage: "PageDown",
  previousPage: "PageUp",
  closeViewer: "Escape",
  singlePage: "1",
  spreadPage: "2",
  toggleDirection: "R",
  zoomIn: "+",
  zoomOut: "-",
};

export const SHORTCUT_LABELS: Record<ShortcutCommand, string> = {
  nextPage: "次ページ",
  previousPage: "前ページ",
  closeViewer: "ビューワを閉じる",
  singlePage: "単ページ",
  spreadPage: "見開き",
  toggleDirection: "読み方向",
  zoomIn: "倍率を上げる",
  zoomOut: "倍率を下げる",
};

export const SHORTCUT_FALLBACKS: Record<ShortcutCommand, string> = {
  nextPage: "Space / 方向キー",
  previousPage: "方向キー",
  closeViewer: "Escape",
  singlePage: "1",
  spreadPage: "2",
  toggleDirection: "R",
  zoomIn: "+ / =",
  zoomOut: "- / _",
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

export function normalizeShortcutBindings(value: unknown): ShortcutBindings {
  const fallback = { ...DEFAULT_SHORTCUTS };
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const candidate = value as Record<string, unknown>;
  const normalized = { ...fallback };
  const seen = new Map<string, ShortcutCommand>();
  for (const command of SHORTCUT_COMMANDS) {
    const raw = candidate[command];
    if (raw === undefined) continue;
    const shortcut = normalizeShortcut(raw);
    if (shortcut === null) return fallback;
    normalized[command] = shortcut;
  }
  for (const command of SHORTCUT_COMMANDS) {
    const shortcut = normalized[command];
    if (seen.has(shortcut)) return fallback;
    seen.set(shortcut, command);
  }
  return normalized;
}

export function resetShortcutBindings(): ShortcutBindings {
  return { ...DEFAULT_SHORTCUTS };
}

export type RemapShortcutResult =
  | { ok: true; bindings: ShortcutBindings }
  | { ok: false; reason: "invalid" | "conflict"; conflict?: ShortcutCommand };

export function remapShortcut(
  bindings: ShortcutBindings,
  command: ShortcutCommand,
  value: unknown,
): RemapShortcutResult {
  const shortcut = normalizeShortcut(value);
  if (shortcut === null) return { ok: false, reason: "invalid" };
  const conflict = SHORTCUT_COMMANDS.find(
    (candidate) => candidate !== command && bindings[candidate] === shortcut,
  );
  if (conflict !== undefined) {
    return { ok: false, reason: "conflict", conflict };
  }
  return {
    ok: true,
    bindings: { ...bindings, [command]: shortcut },
  };
}

export function customShortcutCommand(
  event: KeyboardEvent,
  bindings: ShortcutBindings,
): ShortcutCommand | undefined {
  if (isTextInputTarget(event.target)) return undefined;
  const pressed = eventShortcut(event);
  if (pressed === null) return undefined;
  return SHORTCUT_COMMANDS.find((command) => bindings[command] === pressed);
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
    case "ArrowLeft":
      return direction === "rightToLeft" ? "nextPage" : "previousPage";
    case "ArrowRight":
      return direction === "rightToLeft" ? "previousPage" : "nextPage";
    default:
      return undefined;
  }
}
