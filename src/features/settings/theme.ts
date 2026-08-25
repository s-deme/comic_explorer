export const THEME_DEFINITION_SCHEMA_VERSION = 1 as const;

export const BUILTIN_THEME_IDS = [
  "light",
  "dark",
  "paper",
  "midnight",
  "oled",
  "forest",
  "highContrast",
] as const;

export type BuiltinThemeId = (typeof BUILTIN_THEME_IDS)[number];

export const THEME_BASE_SCHEMES = ["light", "dark"] as const;
export type ThemeBaseScheme = (typeof THEME_BASE_SCHEMES)[number];

export const THEME_COLOR_KEYS = [
  "canvas",
  "surface",
  "surfaceMuted",
  "surfaceRaised",
  "text",
  "textMuted",
  "border",
  "accent",
  "onAccent",
  "selection",
  "onSelection",
  "focus",
  "danger",
  "onDanger",
  "warning",
  "success",
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
export type ThemeColors = Record<ThemeColorKey, string>;

export interface ThemeDefinitionV1 {
  schemaVersion: typeof THEME_DEFINITION_SCHEMA_VERSION;
  name: string;
  baseScheme: ThemeBaseScheme;
  colors: ThemeColors;
}

export type ThemeSelection =
  | { kind: "system" }
  | { kind: "builtin"; themeId: BuiltinThemeId }
  | { kind: "custom"; themeId: number; revision: number };

export interface CustomThemeSnapshot {
  themeId: number;
  revision: number;
  definition: ThemeDefinitionV1;
}

export const DEFAULT_THEME_SELECTION: ThemeSelection = Object.freeze({ kind: "system" });
export const LEGACY_THEME_SELECTION: ThemeSelection = Object.freeze({
  kind: "builtin",
  themeId: "light",
});

export const BUILTIN_THEME_LABELS: Readonly<Record<BuiltinThemeId, string>> = Object.freeze({
  light: "ライト",
  dark: "ダーク",
  paper: "ペーパー",
  midnight: "ミッドナイト",
  oled: "OLEDブラック",
  forest: "フォレスト",
  highContrast: "高コントラスト",
});

function builtinTheme(
  id: BuiltinThemeId,
  baseScheme: ThemeBaseScheme,
  colors: ThemeColors,
): ThemeDefinitionV1 {
  return Object.freeze({
    schemaVersion: THEME_DEFINITION_SCHEMA_VERSION,
    name: BUILTIN_THEME_LABELS[id],
    baseScheme,
    colors: Object.freeze(colors),
  });
}

export const BUILTIN_THEMES: Readonly<Record<BuiltinThemeId, ThemeDefinitionV1>> = Object.freeze({
  light: builtinTheme("light", "light", {
    canvas: "#F5F6F8",
    surface: "#FFFFFF",
    surfaceMuted: "#EEF1F4",
    surfaceRaised: "#FFFFFF",
    text: "#1F2328",
    textMuted: "#59636F",
    border: "#727D89",
    accent: "#075FC8",
    onAccent: "#FFFFFF",
    selection: "#CDE4FF",
    onSelection: "#102A43",
    focus: "#075FC8",
    danger: "#B42318",
    onDanger: "#FFFFFF",
    warning: "#754A00",
    success: "#176B3A",
  }),
  dark: builtinTheme("dark", "dark", {
    canvas: "#101318",
    surface: "#181C22",
    surfaceMuted: "#222831",
    surfaceRaised: "#292F38",
    text: "#F2F5F8",
    textMuted: "#AEB8C4",
    border: "#8491A1",
    accent: "#68A9FF",
    onAccent: "#07182E",
    selection: "#244E7A",
    onSelection: "#FFFFFF",
    focus: "#86BFFF",
    danger: "#FF8B82",
    onDanger: "#230300",
    warning: "#F5C451",
    success: "#72D39A",
  }),
  paper: builtinTheme("paper", "light", {
    canvas: "#F1E8D3",
    surface: "#FFF9E9",
    surfaceMuted: "#E7DBC1",
    surfaceRaised: "#FFFDF5",
    text: "#352F24",
    textMuted: "#5D503C",
    border: "#82715A",
    accent: "#285E91",
    onAccent: "#FFFFFF",
    selection: "#B7D3ED",
    onSelection: "#1D344B",
    focus: "#285E91",
    danger: "#A1281C",
    onDanger: "#FFFFFF",
    warning: "#6B4A00",
    success: "#2D653D",
  }),
  midnight: builtinTheme("midnight", "dark", {
    canvas: "#0E1723",
    surface: "#17202B",
    surfaceMuted: "#202C3A",
    surfaceRaised: "#283545",
    text: "#EDF2F8",
    textMuted: "#AFC0D2",
    border: "#8CA0B6",
    accent: "#78B7FF",
    onAccent: "#06172B",
    selection: "#315D88",
    onSelection: "#FFFFFF",
    focus: "#8DC4FF",
    danger: "#FF918A",
    onDanger: "#270300",
    warning: "#F2C45E",
    success: "#76D59C",
  }),
  oled: builtinTheme("oled", "dark", {
    canvas: "#000000",
    surface: "#050505",
    surfaceMuted: "#111111",
    surfaceRaised: "#1A1A1A",
    text: "#FFFFFF",
    textMuted: "#B8B8B8",
    border: "#8A8A8A",
    accent: "#46A6FF",
    onAccent: "#00182C",
    selection: "#0A4775",
    onSelection: "#FFFFFF",
    focus: "#79C0FF",
    danger: "#FF8A80",
    onDanger: "#250200",
    warning: "#FFD166",
    success: "#74D99F",
  }),
  forest: builtinTheme("forest", "light", {
    canvas: "#EDF3EA",
    surface: "#FAFCF7",
    surfaceMuted: "#E1EBDD",
    surfaceRaised: "#FFFFFF",
    text: "#1D2B20",
    textMuted: "#4E6252",
    border: "#718276",
    accent: "#246B45",
    onAccent: "#FFFFFF",
    selection: "#C4E4CF",
    onSelection: "#173D27",
    focus: "#246B45",
    danger: "#A1281C",
    onDanger: "#FFFFFF",
    warning: "#6A4A00",
    success: "#1F6A3A",
  }),
  highContrast: builtinTheme("highContrast", "dark", {
    canvas: "#000000",
    surface: "#000000",
    surfaceMuted: "#101010",
    surfaceRaised: "#000000",
    text: "#FFFFFF",
    textMuted: "#FFFFFF",
    border: "#FFFFFF",
    accent: "#00A6FF",
    onAccent: "#000000",
    selection: "#FFFF00",
    onSelection: "#000000",
    focus: "#FFFF00",
    danger: "#FF6B6B",
    onDanger: "#000000",
    warning: "#FFFF00",
    success: "#00FF84",
  }),
});

const HEX_COLOR = /^#[0-9A-F]{6}$/i;
const FORBIDDEN_THEME_NAME_CHARACTERS = /[\u0000-\u001F\u007F-\u009F/\\]/;

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}

function normalizeThemeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 1
    && normalized.length <= 64
    && !FORBIDDEN_THEME_NAME_CHARACTERS.test(normalized)
    ? normalized
    : null;
}

function positiveSafeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function normalizeThemeColors(value: unknown): ThemeColors | null {
  if (!isExactRecord(value, THEME_COLOR_KEYS)) return null;
  const colors = {} as ThemeColors;
  for (const key of THEME_COLOR_KEYS) {
    const color = value[key];
    if (typeof color !== "string" || !HEX_COLOR.test(color)) return null;
    colors[key] = color.toUpperCase();
  }
  return colors;
}

export interface ThemeContrastIssue {
  foreground: ThemeColorKey;
  background: ThemeColorKey;
  ratio: number;
  minimum: 3 | 4.5;
}

const SURFACE_COLOR_KEYS = [
  "canvas",
  "surface",
  "surfaceMuted",
  "surfaceRaised",
] as const satisfies readonly ThemeColorKey[];

const SURFACE_TEXT_COLOR_KEYS = [
  "text",
  "textMuted",
  "accent",
  "danger",
  "warning",
  "success",
] as const satisfies readonly ThemeColorKey[];

function relativeLuminance(color: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: string, second: string): number {
  if (!HEX_COLOR.test(first) || !HEX_COLOR.test(second)) return 0;
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

export function validateThemeContrast(colors: ThemeColors): ThemeContrastIssue[] {
  const issues: ThemeContrastIssue[] = [];
  const check = (
    foreground: ThemeColorKey,
    background: ThemeColorKey,
    minimum: 3 | 4.5,
  ) => {
    const ratio = contrastRatio(colors[foreground], colors[background]);
    if (ratio < minimum) issues.push({ foreground, background, ratio, minimum });
  };

  for (const foreground of SURFACE_TEXT_COLOR_KEYS) {
    for (const background of SURFACE_COLOR_KEYS) check(foreground, background, 4.5);
  }
  check("onAccent", "accent", 4.5);
  check("onSelection", "selection", 4.5);
  check("onDanger", "danger", 4.5);
  for (const foreground of ["border", "focus"] as const) {
    for (const background of SURFACE_COLOR_KEYS) check(foreground, background, 3);
  }
  return issues;
}

export function normalizeThemeDefinitionV1(value: unknown): ThemeDefinitionV1 | null {
  if (!isExactRecord(value, ["schemaVersion", "name", "baseScheme", "colors"])) return null;
  const name = normalizeThemeName(value.name);
  const colors = normalizeThemeColors(value.colors);
  if (
    value.schemaVersion !== THEME_DEFINITION_SCHEMA_VERSION
    || name === null
    || !THEME_BASE_SCHEMES.includes(value.baseScheme as ThemeBaseScheme)
    || colors === null
    || validateThemeContrast(colors).length > 0
  ) return null;
  return {
    schemaVersion: THEME_DEFINITION_SCHEMA_VERSION,
    name,
    baseScheme: value.baseScheme as ThemeBaseScheme,
    colors,
  };
}

export function normalizeThemeSelection(value: unknown): ThemeSelection | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "system" && isExactRecord(candidate, ["kind"])) {
    return { kind: "system" };
  }
  if (
    candidate.kind === "builtin"
    && isExactRecord(candidate, ["kind", "themeId"])
    && BUILTIN_THEME_IDS.includes(candidate.themeId as BuiltinThemeId)
  ) {
    return { kind: "builtin", themeId: candidate.themeId as BuiltinThemeId };
  }
  if (candidate.kind === "custom" && isExactRecord(candidate, ["kind", "themeId", "revision"])) {
    const themeId = positiveSafeInteger(candidate.themeId);
    const revision = positiveSafeInteger(candidate.revision);
    if (themeId !== null && revision !== null) return { kind: "custom", themeId, revision };
  }
  return null;
}

export function normalizeCustomThemeSnapshot(value: unknown): CustomThemeSnapshot | null {
  if (!isExactRecord(value, ["themeId", "revision", "definition"])) return null;
  const themeId = positiveSafeInteger(value.themeId);
  const revision = positiveSafeInteger(value.revision);
  const definition = normalizeThemeDefinitionV1(value.definition);
  return themeId !== null && revision !== null && definition !== null
    ? { themeId, revision, definition }
    : null;
}

export function themeSelectionMatchesSnapshot(
  selection: ThemeSelection,
  snapshot: CustomThemeSnapshot | null,
): boolean {
  return selection.kind === "custom"
    ? snapshot !== null
      && snapshot.themeId === selection.themeId
      && snapshot.revision === selection.revision
    : snapshot === null;
}

export type ThemeFallbackReason = "customSnapshotMissingOrStale";

export interface ResolvedTheme {
  source: "system" | "builtin" | "custom" | "fallback";
  themeId: "system" | BuiltinThemeId | number;
  baseScheme: ThemeBaseScheme;
  colors: ThemeColors;
  fallbackReason: ThemeFallbackReason | null;
}

function resolvedBuiltin(
  source: "system" | "builtin" | "fallback",
  id: BuiltinThemeId,
  themeId: "system" | BuiltinThemeId,
  fallbackReason: ThemeFallbackReason | null = null,
): ResolvedTheme {
  const definition = BUILTIN_THEMES[id];
  return {
    source,
    themeId,
    baseScheme: definition.baseScheme,
    colors: { ...definition.colors },
    fallbackReason,
  };
}

export function resolveTheme(
  selection: ThemeSelection,
  customSnapshot: CustomThemeSnapshot | null,
  systemScheme: ThemeBaseScheme,
): ResolvedTheme {
  if (selection.kind === "system") {
    return resolvedBuiltin("system", systemScheme === "dark" ? "dark" : "light", "system");
  }
  if (selection.kind === "builtin") {
    return resolvedBuiltin("builtin", selection.themeId, selection.themeId);
  }
  if (customSnapshot !== null && themeSelectionMatchesSnapshot(selection, customSnapshot)) {
    return {
      source: "custom",
      themeId: selection.themeId,
      baseScheme: customSnapshot.definition.baseScheme,
      colors: { ...customSnapshot.definition.colors },
      fallbackReason: null,
    };
  }
  return resolvedBuiltin(
    "fallback",
    "light",
    "light",
    "customSnapshotMissingOrStale",
  );
}

export const THEME_CSS_PROPERTIES: Readonly<Record<ThemeColorKey, string>> = Object.freeze({
  canvas: "--theme-canvas",
  surface: "--theme-surface",
  surfaceMuted: "--theme-surface-muted",
  surfaceRaised: "--theme-surface-raised",
  text: "--theme-text",
  textMuted: "--theme-text-muted",
  border: "--theme-border",
  accent: "--theme-accent",
  onAccent: "--theme-on-accent",
  selection: "--theme-selection",
  onSelection: "--theme-on-selection",
  focus: "--theme-focus",
  danger: "--theme-danger",
  onDanger: "--theme-on-danger",
  warning: "--theme-warning",
  success: "--theme-success",
});

export function applyResolvedTheme(root: HTMLElement, theme: ResolvedTheme): void {
  for (const key of THEME_COLOR_KEYS) {
    root.style.setProperty(THEME_CSS_PROPERTIES[key], theme.colors[key]);
  }
  root.style.colorScheme = theme.baseScheme;
  root.dataset.themeKind = theme.source;
  root.dataset.themeId = String(theme.themeId);
  root.dataset.themeScheme = theme.baseScheme;
  if (theme.fallbackReason === null) delete root.dataset.themeFallback;
  else root.dataset.themeFallback = theme.fallbackReason;
}

export function applyThemeSelection(
  root: HTMLElement,
  selection: ThemeSelection,
  customSnapshot: CustomThemeSnapshot | null,
  systemScheme: ThemeBaseScheme,
): ResolvedTheme {
  const resolved = resolveTheme(selection, customSnapshot, systemScheme);
  applyResolvedTheme(root, resolved);
  return resolved;
}
