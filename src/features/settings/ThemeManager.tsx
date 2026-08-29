import {
  useId,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import {
  BUILTIN_THEME_IDS,
  BUILTIN_THEME_LABELS,
  BUILTIN_THEMES,
  THEME_COLOR_KEYS,
  normalizeThemeDefinitionV1,
  validateThemeContrast,
  type CustomThemeSnapshot,
  type ThemeColorKey,
  type ThemeBaseScheme,
  type ThemeDefinitionV1,
  type ThemeSelection,
} from "./theme";

export interface ThemeRecordView {
  id: number;
  revision: number;
  definition: ThemeDefinitionV1;
  updatedAtMs: number;
}

export interface InvalidThemeRecordView {
  id: number;
  name: string;
  reason: string;
  active: boolean;
}

export interface ThemeImportPreviewView {
  confirmationKey: string;
  definition: ThemeDefinitionV1;
  existingThemeId: number | null;
  bytes: number[];
}

export interface ThemeManagerProps {
  selection: ThemeSelection;
  snapshot: CustomThemeSnapshot | null;
  appliedSelection: ThemeSelection;
  customThemes: ThemeRecordView[];
  invalidThemes: InvalidThemeRecordView[];
  maximumThemes: number;
  busy: boolean;
  onSelectionChange: (
    selection: ThemeSelection,
    snapshot: CustomThemeSnapshot | null,
  ) => void;
  onSave: (
    definition: ThemeDefinitionV1,
    themeId: number | null,
    expectedRevision: number | null,
  ) => Promise<ThemeRecordView | null>;
  onDelete: (theme: ThemeRecordView) => Promise<boolean>;
  onDeleteInvalid: (theme: InvalidThemeRecordView) => Promise<boolean>;
  onPreviewImport: (file: File) => Promise<ThemeImportPreviewView | null>;
  onConfirmImport: (
    preview: ThemeImportPreviewView,
    replace: boolean,
  ) => Promise<ThemeRecordView | null>;
  onExport: (theme: ThemeRecordView) => void;
}

const THEME_COLOR_LABELS: Readonly<Record<ThemeColorKey, string>> = {
  canvas: "アプリ背景",
  surface: "基本面",
  surfaceMuted: "控えめな面",
  surfaceRaised: "浮き上がる面",
  text: "本文",
  textMuted: "補助文字",
  border: "境界線",
  accent: "アクセント",
  onAccent: "アクセント上の文字",
  selection: "選択面",
  onSelection: "選択面上の文字",
  focus: "フォーカス",
  danger: "危険操作",
  onDanger: "危険操作上の文字",
  warning: "警告",
  success: "成功",
};

const FORBIDDEN_THEME_NAME_CHARACTERS = /[\u0000-\u001F\u007F-\u009F/\\]/;

function themeNameValidationError(name: string): string | null {
  const normalized = name.trim();
  if (normalized.length === 0) return "テーマ名を入力してください。";
  if (normalized.length > 64) return "テーマ名は64文字以内にしてください。";
  if (FORBIDDEN_THEME_NAME_CHARACTERS.test(normalized)) {
    return "テーマ名に /、\\、制御文字は使用できません。";
  }
  return null;
}

function copyDefinition(definition: ThemeDefinitionV1, name = definition.name): ThemeDefinitionV1 {
  return {
    schemaVersion: 1,
    name,
    baseScheme: definition.baseScheme,
    colors: { ...definition.colors },
  };
}

function snapshotFor(theme: ThemeRecordView): CustomThemeSnapshot {
  return {
    themeId: theme.id,
    revision: theme.revision,
    definition: copyDefinition(theme.definition),
  };
}

function definitionsMatch(first: ThemeDefinitionV1, second: ThemeDefinitionV1): boolean {
  const normalizedFirst = normalizeThemeDefinitionV1(first);
  const normalizedSecond = normalizeThemeDefinitionV1(second);
  return normalizedFirst !== null
    && normalizedSecond !== null
    && normalizedFirst.name === normalizedSecond.name
    && normalizedFirst.baseScheme === normalizedSecond.baseScheme
    && THEME_COLOR_KEYS.every(
      (key) => normalizedFirst.colors[key] === normalizedSecond.colors[key],
    );
}

function recordMatchesSnapshot(
  theme: ThemeRecordView,
  portableSnapshot: CustomThemeSnapshot,
): boolean {
  return theme.id === portableSnapshot.themeId
    && theme.revision === portableSnapshot.revision
    && definitionsMatch(theme.definition, portableSnapshot.definition);
}

function localChoiceValue(theme: Pick<ThemeRecordView, "id" | "revision">): string {
  return `custom:${theme.id}:${theme.revision}`;
}

function portableChoiceValue(portableSnapshot: CustomThemeSnapshot): string {
  return `portable:${portableSnapshot.themeId}:${portableSnapshot.revision}`;
}

function invalidThemeDisplayName(theme: InvalidThemeRecordView): string {
  return theme.name.trim().length > 0 ? theme.name : `破損テーマ #${theme.id}`;
}

function ThemeSwatch({ definition }: { definition: ThemeDefinitionV1 }) {
  return (
    <span className="theme-swatch" aria-hidden="true">
      <span style={{ backgroundColor: definition.colors.canvas }} />
      <span style={{ backgroundColor: definition.colors.surface }} />
      <span style={{ backgroundColor: definition.colors.accent }} />
      <span style={{ backgroundColor: definition.colors.selection }} />
      <span style={{ backgroundColor: definition.colors.text }} />
    </span>
  );
}

function previewStyle(definition: ThemeDefinitionV1): CSSProperties {
  return {
    "--preview-canvas": definition.colors.canvas,
    "--preview-surface": definition.colors.surface,
    "--preview-surface-muted": definition.colors.surfaceMuted,
    "--preview-surface-raised": definition.colors.surfaceRaised,
    "--preview-text": definition.colors.text,
    "--preview-text-muted": definition.colors.textMuted,
    "--preview-border": definition.colors.border,
    "--preview-accent": definition.colors.accent,
    "--preview-on-accent": definition.colors.onAccent,
    "--preview-selection": definition.colors.selection,
    "--preview-on-selection": definition.colors.onSelection,
    "--preview-focus": definition.colors.focus,
    "--preview-danger": definition.colors.danger,
    "--preview-on-danger": definition.colors.onDanger,
    "--preview-warning": definition.colors.warning,
    "--preview-success": definition.colors.success,
    colorScheme: definition.baseScheme,
  } as CSSProperties;
}

function ThemePreview({
  definition,
  title,
}: {
  definition: ThemeDefinitionV1;
  title: string;
}) {
  return (
    <div className="theme-preview" style={previewStyle(definition)}>
      <div className="theme-preview-toolbar">
        <strong>{title}</strong>
        <span className="theme-preview-accent-control">操作</span>
      </div>
      <div className="theme-preview-body">
        <div className="theme-preview-raised">
          <p>本文と <span className="theme-preview-muted">補助文字</span></p>
          <p className="theme-preview-selection">選択中の項目</p>
          <div className="theme-preview-states">
            <span className="theme-preview-focus-control">フォーカス</span>
            <span className="theme-preview-success">成功</span>
            <span className="theme-preview-warning">警告</span>
            <span className="theme-preview-danger">危険操作</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function systemThemeScheme(): ThemeBaseScheme {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function baseSchemeLabel(scheme: ThemeBaseScheme): string {
  return scheme === "dark" ? "ダーク" : "ライト";
}

export function ThemeManager({
  selection,
  snapshot,
  appliedSelection,
  customThemes,
  invalidThemes,
  maximumThemes,
  busy,
  onSelectionChange,
  onSave,
  onDelete,
  onDeleteInvalid,
  onPreviewImport,
  onConfirmImport,
  onExport,
}: ThemeManagerProps) {
  const controlId = useId();
  const [editor, setEditor] = useState<ThemeDefinitionV1 | null>(null);
  const [editingThemeId, setEditingThemeId] = useState<number | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const [pendingDeleteThemeId, setPendingDeleteThemeId] = useState<number | null>(null);
  const [pendingDeleteInvalidThemeId, setPendingDeleteInvalidThemeId] = useState<number | null>(null);
  const [importPreview, setImportPreview] = useState<ThemeImportPreviewView | null>(null);
  const [systemScheme, setSystemScheme] = useState<ThemeBaseScheme>(systemThemeScheme);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemScheme(media.matches ? "dark" : "light");
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener?.(update);
    return () => media.removeListener?.(update);
  }, []);
  const selectedLocalTheme = useMemo(() => {
    if (
      selection.kind !== "custom"
      || snapshot === null
      || snapshot.themeId !== selection.themeId
      || snapshot.revision !== selection.revision
    ) return null;
    return customThemes.find((theme) => recordMatchesSnapshot(theme, snapshot)) ?? null;
  }, [customThemes, selection, snapshot]);
  const portableSnapshot = selection.kind === "custom"
    && snapshot !== null
    && snapshot.themeId === selection.themeId
    && snapshot.revision === selection.revision
    && selectedLocalTheme === null
    ? snapshot
    : null;
  const selectedValue = selection.kind === "system"
    ? "system"
    : selection.kind === "builtin"
      ? `builtin:${selection.themeId}`
      : selectedLocalTheme !== null
        ? localChoiceValue(selectedLocalTheme)
          : portableSnapshot !== null
          ? portableChoiceValue(portableSnapshot)
          : "";
  const selectedDefinition = selection.kind === "system"
    ? BUILTIN_THEMES[systemScheme]
    : selection.kind === "builtin"
      ? BUILTIN_THEMES[selection.themeId]
      : snapshot !== null
        && snapshot.themeId === selection.themeId
        && snapshot.revision === selection.revision
        ? snapshot.definition
        : BUILTIN_THEMES.light;
  const selectedThemeLabel = selection.kind === "system"
    ? `システム（${systemScheme === "dark" ? "ダーク" : "ライト"}）`
    : selection.kind === "builtin"
      ? BUILTIN_THEME_LABELS[selection.themeId]
      : selectedDefinition.name;
  const contrastIssues = useMemo(
    () => editor === null ? [] : validateThemeContrast(editor.colors),
    [editor],
  );
  const normalizedEditor = useMemo(
    () => editor === null ? null : normalizeThemeDefinitionV1(editor),
    [editor],
  );
  const nameError = editor === null ? null : themeNameValidationError(editor.name);
  const nameErrorId = `${controlId}-theme-name-error`;
  const themeCount = customThemes.length + invalidThemes.length;
  const importReplacesAppliedTheme = importPreview !== null
    && importPreview.existingThemeId !== null
    && appliedSelection.kind === "custom"
    && appliedSelection.themeId === importPreview.existingThemeId;
  const importExceedsMaximum = importPreview !== null
    && importPreview.existingThemeId === null
    && themeCount >= maximumThemes;

  function beginCreate(definition: ThemeDefinitionV1, name: string) {
    setEditingThemeId(null);
    setEditingRevision(null);
    setEditor(copyDefinition(definition, name));
  }

  function beginEdit(theme: ThemeRecordView) {
    if (appliedSelection.kind === "custom" && appliedSelection.themeId === theme.id) return;
    setEditingThemeId(theme.id);
    setEditingRevision(theme.revision);
    setEditor(copyDefinition(theme.definition));
  }

  function chooseTheme(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    if (value === "system") {
      onSelectionChange({ kind: "system" }, null);
      return;
    }
    if (value.startsWith("builtin:")) {
      const themeId = value.slice("builtin:".length);
      if (BUILTIN_THEME_IDS.includes(themeId as (typeof BUILTIN_THEME_IDS)[number])) {
        onSelectionChange({ kind: "builtin", themeId: themeId as (typeof BUILTIN_THEME_IDS)[number] }, null);
      }
      return;
    }
    if (portableSnapshot !== null && value === portableChoiceValue(portableSnapshot)) {
      onSelectionChange(
        {
          kind: "custom",
          themeId: portableSnapshot.themeId,
          revision: portableSnapshot.revision,
        },
        {
          ...portableSnapshot,
          definition: copyDefinition(portableSnapshot.definition),
        },
      );
      return;
    }
    const customMatch = /^custom:(\d+):(\d+)$/.exec(value);
    if (customMatch === null) return;
    const themeId = Number(customMatch[1]);
    const revision = Number(customMatch[2]);
    const theme = customThemes.find(
      (candidate) => candidate.id === themeId && candidate.revision === revision,
    );
    if (theme !== undefined) {
      onSelectionChange(
        { kind: "custom", themeId: theme.id, revision: theme.revision },
        snapshotFor(theme),
      );
    }
  }

  async function saveEditor() {
    if (normalizedEditor === null) return;
    const saved = await onSave(normalizedEditor, editingThemeId, editingRevision);
    if (saved === null) return;
    setEditingThemeId(saved.id);
    setEditingRevision(saved.revision);
    setEditor(copyDefinition(saved.definition));
    onSelectionChange(
      { kind: "custom", themeId: saved.id, revision: saved.revision },
      snapshotFor(saved),
    );
  }

  async function deleteTheme(theme: ThemeRecordView) {
    if (!(await onDelete(theme))) return;
    setPendingDeleteThemeId(null);
    if (selection.kind === "custom" && selection.themeId === theme.id) {
      onSelectionChange({ kind: "system" }, null);
    }
    if (editingThemeId === theme.id) {
      setEditor(null);
      setEditingThemeId(null);
      setEditingRevision(null);
    }
  }

  async function deleteInvalidTheme(theme: InvalidThemeRecordView) {
    if (
      theme.active
      || (appliedSelection.kind === "custom" && appliedSelection.themeId === theme.id)
      || !(await onDeleteInvalid(theme))
    ) return;
    setPendingDeleteInvalidThemeId(null);
  }

  async function selectImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setImportPreview(await onPreviewImport(file));
  }

  async function confirmImport(replace: boolean) {
    if (importPreview === null || importReplacesAppliedTheme || importExceedsMaximum) return;
    const saved = await onConfirmImport(importPreview, replace);
    if (saved === null) return;
    setImportPreview(null);
    onSelectionChange(
      { kind: "custom", themeId: saved.id, revision: saved.revision },
      snapshotFor(saved),
    );
  }

  return (
    <div className="theme-manager">
      <fieldset className="theme-selection" disabled={busy}>
        <legend>アプリテーマ</legend>
        <label className="theme-selection-control" htmlFor={`${controlId}-app-theme`}>
          <span>テーマ</span>
          <select
            id={`${controlId}-app-theme`}
            aria-label="アプリテーマ"
            value={selectedValue}
            onChange={chooseTheme}
          >
            {selectedValue === "" && <option value="" disabled>読み込みできないテーマ</option>}
            <option value="system">システム（Windowsのライト／ダーク設定へ追従）</option>
            <optgroup label="組み込みテーマ">
              {BUILTIN_THEME_IDS.map((themeId) => (
                <option key={themeId} value={`builtin:${themeId}`}>
                  {BUILTIN_THEME_LABELS[themeId]}（{baseSchemeLabel(BUILTIN_THEMES[themeId].baseScheme)}）
                </option>
              ))}
            </optgroup>
            {customThemes.length > 0 && (
              <optgroup label="カスタムテーマ">
                {customThemes.map((theme) => (
                  <option key={`${theme.id}-${theme.revision}`} value={localChoiceValue(theme)}>
                    {theme.definition.name}（rev.{theme.revision}）
                  </option>
                ))}
              </optgroup>
            )}
            {portableSnapshot !== null && (
              <optgroup label="移植テーマ">
                <option value={portableChoiceValue(portableSnapshot)}>
                  {portableSnapshot.definition.name}（{customThemes.some((theme) => theme.id === portableSnapshot.themeId)
                    ? "ローカル版と異なるスナップショット"
                    : "ローカル未登録"}）
                </option>
              </optgroup>
            )}
          </select>
        </label>
        <p className="theme-selection-description">
          {selectedThemeLabel} の配色です。適用を押すまで、アプリ全体の配色は変わりません。
        </p>
        <ThemePreview definition={selectedDefinition} title="選択中のテーマをプレビュー" />
        <div className="settings-inline-actions">
          <button
            type="button"
            aria-label={`選択中のテーマ「${selectedThemeLabel}」を複製`}
            onClick={() => beginCreate(selectedDefinition, `${selectedDefinition.name} のコピー`)}
          >
            選択中のテーマを複製
          </button>
        </div>
      </fieldset>

      <fieldset className="theme-record-list" disabled={busy}>
        <legend>カスタムテーマを管理</legend>
        {customThemes.map((theme) => (
          <section
            className="theme-record"
            data-selected={selectedValue === localChoiceValue(theme)}
            aria-label={`${theme.definition.name}カスタムテーマ`}
            key={`${theme.id}-${theme.revision}`}
          >
            <div className="theme-record-summary">
              <ThemeSwatch definition={theme.definition} />
              <span>
                <strong>{theme.definition.name}</strong>
                <small>
                  カスタム・rev.{theme.revision}
                  {appliedSelection.kind === "custom" && appliedSelection.themeId === theme.id
                    ? "・適用中（複製して編集）"
                    : ""}
                </small>
              </span>
            </div>
            <div className="theme-record-actions settings-inline-actions">
              <button
                type="button"
                aria-label={appliedSelection.kind === "custom" && appliedSelection.themeId === theme.id
                  ? `${theme.definition.name}カスタムテーマは現在適用中です。複製して編集してください`
                  : `${theme.definition.name}カスタムテーマを編集`}
                disabled={appliedSelection.kind === "custom" && appliedSelection.themeId === theme.id}
                title={appliedSelection.kind === "custom" && appliedSelection.themeId === theme.id
                  ? "現在適用中のテーマは直接編集できません。複製して編集してください。"
                  : undefined}
                onClick={() => beginEdit(theme)}
              >
                編集
              </button>
              <button
                type="button"
                aria-label={`${theme.definition.name}カスタムテーマを複製`}
                onClick={() => beginCreate(theme.definition, `${theme.definition.name} のコピー`)}
              >
                複製
              </button>
              <button
                type="button"
                aria-label={`${theme.definition.name}カスタムテーマを書き出す`}
                onClick={() => onExport(theme)}
              >
                書出
              </button>
              <button
                type="button"
                className="danger-button"
                aria-label={pendingDeleteThemeId === theme.id
                  ? `${theme.definition.name}カスタムテーマの削除を確認`
                  : `${theme.definition.name}カスタムテーマを削除`}
                disabled={appliedSelection.kind === "custom" && appliedSelection.themeId === theme.id}
                title={appliedSelection.kind === "custom" && appliedSelection.themeId === theme.id
                  ? "現在適用中のテーマは、別のテーマを適用してから削除できます。"
                  : undefined}
                onClick={() => {
                  if (pendingDeleteThemeId === theme.id) void deleteTheme(theme);
                  else setPendingDeleteThemeId(theme.id);
                }}
              >
                {pendingDeleteThemeId === theme.id ? "削除を確認" : "削除"}
              </button>
              {pendingDeleteThemeId === theme.id && (
                <button
                  type="button"
                  aria-label={`${theme.definition.name}カスタムテーマの削除を取り消す`}
                  onClick={() => setPendingDeleteThemeId(null)}
                >
                  取消
                </button>
              )}
            </div>
          </section>
        ))}
        {invalidThemes.map((theme) => {
          const displayName = invalidThemeDisplayName(theme);
          const active = theme.active
            || (appliedSelection.kind === "custom" && appliedSelection.themeId === theme.id);
          return (
            <section
              className="theme-record theme-record--invalid"
              role="group"
              aria-label={`${displayName}破損テーマ`}
              key={`invalid-${theme.id}`}
            >
              <div className="theme-record-summary">
                <span className="theme-invalid-badge">読み込み不可</span>
                <span>
                  <strong>{displayName}</strong>
                  <small>{theme.reason}</small>
                  {active && <small>適用中のため、別テーマを適用してから削除できます。</small>}
                </span>
              </div>
              <div className="theme-record-actions settings-inline-actions">
                <button
                  type="button"
                  className="danger-button"
                  aria-label={pendingDeleteInvalidThemeId === theme.id
                    ? `${displayName}破損テーマの削除を確認`
                    : `${displayName}破損テーマを削除`}
                  disabled={active}
                  title={active
                    ? "適用中の破損テーマは、別のテーマを適用してから削除してください。"
                    : undefined}
                  onClick={() => {
                    if (pendingDeleteInvalidThemeId === theme.id) void deleteInvalidTheme(theme);
                    else setPendingDeleteInvalidThemeId(theme.id);
                  }}
                >
                  {pendingDeleteInvalidThemeId === theme.id ? "削除を確認" : "削除"}
                </button>
                {pendingDeleteInvalidThemeId === theme.id && (
                  <button
                    type="button"
                    aria-label={`${displayName}破損テーマの削除を取り消す`}
                    onClick={() => setPendingDeleteInvalidThemeId(null)}
                  >
                    取消
                  </button>
                )}
              </div>
            </section>
          );
        })}
        {customThemes.length === 0 && invalidThemes.length === 0 && (
          <p className="theme-record-empty">保存済みのカスタムテーマはありません。</p>
        )}
      </fieldset>

      <div className="settings-inline-actions">
        <button
          type="button"
          disabled={busy || themeCount >= maximumThemes}
          onClick={() => beginCreate(BUILTIN_THEMES.light, "新しいテーマ")}
        >
          新規作成
        </button>
        <label className="file-button" aria-disabled={busy}>
          JSONを読み込む
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(event) => void selectImportFile(event)}
          />
        </label>
        <span>{themeCount} / {maximumThemes}件</span>
      </div>

      {importPreview !== null && (
        <section className="theme-import-preview" aria-label="テーマ読み込み確認">
          <h4>「{importPreview.definition.name}」を読み込みますか？</h4>
          <ThemeSwatch definition={importPreview.definition} />
          <p>
            {importReplacesAppliedTheme
              ? "現在適用中のカスタムテーマは置き換えられません。別のテーマを適用してから置き換えてください。"
              : importExceedsMaximum
                ? `カスタムテーマは最大${maximumThemes}件です。不要なテーマを削除してから保存してください。`
              : importPreview.existingThemeId === null
                ? "検証済みの新しいカスタムテーマとして保存します。"
                : "同名テーマがあります。明示的に置き換えるか、読み込みを取り消してください。"}
          </p>
          <div className="settings-inline-actions">
            <button
              type="button"
              disabled={busy || importReplacesAppliedTheme || importExceedsMaximum}
              title={importReplacesAppliedTheme
                ? "別のテーマを適用してから置き換えてください。"
                : importExceedsMaximum
                  ? `カスタムテーマは最大${maximumThemes}件です。`
                : undefined}
              onClick={() => void confirmImport(importPreview.existingThemeId !== null)}
            >
              {importPreview.existingThemeId === null ? "保存" : "置き換える"}
            </button>
            <button type="button" disabled={busy} onClick={() => setImportPreview(null)}>取り消す</button>
          </div>
        </section>
      )}

      {editor !== null && (
        <section className="theme-editor" aria-label="カスタムテーマ編集">
          <div className="settings-section-heading">
            <div>
              <h4>{editingThemeId === null ? "カスタムテーマを作成" : "カスタムテーマを編集"}</h4>
              <p>配色だけを編集します。画像、フォント、レイアウト、外部リソースはテーマへ含まれません。</p>
            </div>
            <button type="button" onClick={() => setEditor(null)}>閉じる</button>
          </div>
          <div className="theme-editor-grid">
            <div className="theme-name-field">
              <label htmlFor={`${controlId}-theme-name`}>テーマ名</label>
              <input
                id={`${controlId}-theme-name`}
                type="text"
                maxLength={64}
                aria-invalid={nameError !== null}
                aria-describedby={nameError === null ? undefined : nameErrorId}
                value={editor.name}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              />
              {nameError !== null && (
                <small className="theme-name-error" id={nameErrorId} role="alert">
                  {nameError}
                </small>
              )}
            </div>
            <label>
              基本配色
              <select
                value={editor.baseScheme}
                onChange={(event) => setEditor({
                  ...editor,
                  baseScheme: event.target.value === "dark" ? "dark" : "light",
                })}
              >
                <option value="light">ライト</option>
                <option value="dark">ダーク</option>
              </select>
            </label>
            {THEME_COLOR_KEYS.map((key) => (
              <label className="theme-color-row" key={key}>
                <span>{THEME_COLOR_LABELS[key]}</span>
                <input
                  type="color"
                  aria-label={`${THEME_COLOR_LABELS[key]}の色`}
                  value={editor.colors[key]}
                  onChange={(event) => setEditor({
                    ...editor,
                    colors: { ...editor.colors, [key]: event.target.value.toUpperCase() },
                  })}
                />
                <code>{editor.colors[key]}</code>
              </label>
            ))}
          </div>
          <ThemePreview definition={editor} title="編集内容のプレビュー" />
          {contrastIssues.length > 0 && (
            <div className="theme-validation" role="alert">
              <strong>コントラストを調整してください（{contrastIssues.length}件）</strong>
              <ul>
                {contrastIssues.slice(0, 6).map((issue) => (
                  <li key={`${issue.foreground}-${issue.background}`}>
                    {THEME_COLOR_LABELS[issue.foreground]} / {THEME_COLOR_LABELS[issue.background]}: {issue.ratio.toFixed(2)}（必要 {issue.minimum}:1）
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="settings-inline-actions">
            <button type="button" disabled={busy || normalizedEditor === null} onClick={() => void saveEditor()}>
              {busy ? "検証中…" : editingThemeId === null ? "テーマを保存" : "変更を保存"}
            </button>
            <button type="button" disabled={busy} onClick={() => setEditor(null)}>取り消す</button>
          </div>
        </section>
      )}
    </div>
  );
}
