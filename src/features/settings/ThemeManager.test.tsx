import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ThemeManager,
  type ThemeImportPreviewView,
  type ThemeManagerProps,
  type ThemeRecordView,
} from "./ThemeManager";
import {
  BUILTIN_THEMES,
  THEME_COLOR_KEYS,
  type CustomThemeSnapshot,
  type ThemeColorKey,
  type ThemeDefinitionV1,
} from "./theme";

const PREVIEW_CSS_PROPERTIES: Readonly<Record<ThemeColorKey, string>> = {
  canvas: "--preview-canvas",
  surface: "--preview-surface",
  surfaceMuted: "--preview-surface-muted",
  surfaceRaised: "--preview-surface-raised",
  text: "--preview-text",
  textMuted: "--preview-text-muted",
  border: "--preview-border",
  accent: "--preview-accent",
  onAccent: "--preview-on-accent",
  selection: "--preview-selection",
  onSelection: "--preview-on-selection",
  focus: "--preview-focus",
  danger: "--preview-danger",
  onDanger: "--preview-on-danger",
  warning: "--preview-warning",
  success: "--preview-success",
};

function definition(
  name: string,
  source: ThemeDefinitionV1 = BUILTIN_THEMES.midnight,
): ThemeDefinitionV1 {
  return {
    schemaVersion: 1,
    name,
    baseScheme: source.baseScheme,
    colors: { ...source.colors },
  };
}

const customTheme: ThemeRecordView = {
  id: 7,
  revision: 3,
  definition: definition("My Midnight"),
  updatedAtMs: 123,
};

function snapshot(theme: ThemeRecordView = customTheme): CustomThemeSnapshot {
  return {
    themeId: theme.id,
    revision: theme.revision,
    definition: definition(theme.definition.name, theme.definition),
  };
}

function props(overrides: Partial<ThemeManagerProps> = {}): ThemeManagerProps {
  return {
    selection: { kind: "system" },
    snapshot: null,
    appliedSelection: { kind: "system" },
    customThemes: [customTheme],
    invalidThemes: [],
    maximumThemes: 32,
    busy: false,
    onSelectionChange: vi.fn(),
    onSave: vi.fn(async () => null),
    onDelete: vi.fn(async () => false),
    onDeleteInvalid: vi.fn(async () => false),
    onPreviewImport: vi.fn(async () => null),
    onConfirmImport: vi.fn(async () => null),
    onExport: vi.fn(),
    ...overrides,
  };
}

function themeCard(name: string): HTMLElement {
  const card = screen.getByText(name, { selector: "strong" }).closest(".theme-choice");
  if (!(card instanceof HTMLElement)) throw new Error(`theme card not found: ${name}`);
  return card;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ThemeManager", () => {
  it("REQ-FR-B24-001 selects system, a fixed built-in, and a custom snapshot", () => {
    const onSelectionChange = vi.fn();
    const initial = props({ onSelectionChange });
    const { rerender } = render(<ThemeManager {...initial} />);

    const systemRadio = screen.getByRole("radio", { name: "システムテーマ" });
    const forestRadio = screen.getByRole("radio", { name: "フォレストテーマ" });
    expect(systemRadio).toBeChecked();
    expect(systemRadio).toHaveAccessibleName("システムテーマ");
    expect(forestRadio).toHaveAccessibleName("フォレストテーマ");
    const forestCard = themeCard("フォレスト");
    const forestLabel = forestCard.querySelector(".theme-choice-label");
    const duplicate = within(forestCard).getByRole("button", {
      name: "フォレスト組み込みテーマを複製",
    });
    expect(forestLabel).toHaveAttribute("for", forestRadio.id);
    expect(forestLabel).not.toContainElement(duplicate);
    const customCard = themeCard("My Midnight");
    expect(within(customCard).getByRole("button", { name: "My Midnightカスタムテーマを編集" }))
      .toBeInTheDocument();
    expect(within(customCard).getByRole("button", { name: "My Midnightカスタムテーマを複製" }))
      .toBeInTheDocument();
    expect(within(customCard).getByRole("button", { name: "My Midnightカスタムテーマを書き出す" }))
      .toBeInTheDocument();
    expect(within(customCard).getByRole("button", { name: "My Midnightカスタムテーマを削除" }))
      .toBeInTheDocument();
    forestRadio.focus();
    expect(forestRadio).toHaveFocus();

    fireEvent.click(forestRadio);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      { kind: "builtin", themeId: "forest" },
      null,
    );

    rerender(<ThemeManager {...initial} selection={{
      kind: "custom",
      themeId: customTheme.id,
      revision: customTheme.revision,
    }} snapshot={snapshot()} />);
    expect(screen.getByRole("radio", { name: /My Midnight/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /システム/ }));
    expect(onSelectionChange).toHaveBeenLastCalledWith({ kind: "system" }, null);

    rerender(<ThemeManager {...initial} selection={{ kind: "system" }} snapshot={null} />);
    fireEvent.click(screen.getByRole("radio", { name: /My Midnight/ }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      { kind: "custom", themeId: 7, revision: 3 },
      snapshot(),
    );
  });

  it("REQ-FR-B24-005 treats normalized-equivalent local content as the same custom theme", () => {
    const onSelectionChange = vi.fn();
    const equivalentSnapshot: CustomThemeSnapshot = {
      themeId: 7,
      revision: 3,
      definition: {
        ...customTheme.definition,
        name: `  ${customTheme.definition.name}  `,
        colors: Object.fromEntries(Object.entries(customTheme.definition.colors).map(
          ([key, color]) => [key, color.toLowerCase()],
        )) as ThemeDefinitionV1["colors"],
      },
    };
    render(<ThemeManager {...props({
      selection: { kind: "custom", themeId: 7, revision: 3 },
      snapshot: equivalentSnapshot,
      onSelectionChange,
    })} />);

    expect(screen.getByRole("radio", { name: "My Midnightカスタムテーマ" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /移植テーマ/ })).not.toBeInTheDocument();
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("REQ-FR-B24-005 keeps a portable snapshot visible when its local ID is missing", () => {
    const onSelectionChange = vi.fn();
    const portableSnapshot: CustomThemeSnapshot = {
      themeId: 99,
      revision: 8,
      definition: definition("Portable Paper", BUILTIN_THEMES.paper),
    };
    render(<ThemeManager {...props({
      selection: { kind: "custom", themeId: 99, revision: 8 },
      snapshot: portableSnapshot,
      customThemes: [],
      onSelectionChange,
    })} />);

    const portableRadio = screen.getByRole("radio", { name: "Portable Paper移植テーマ" });
    expect(portableRadio).toBeChecked();
    expect(themeCard("Portable Paper")).toHaveAttribute("data-selected", "true");
    expect(screen.getByText("移植テーマ・ローカル未登録")).toBeInTheDocument();
    expect(within(themeCard("Portable Paper")).getByRole("button", {
      name: "Portable Paper移植テーマをローカルへ複製",
    }))
      .toBeInTheDocument();
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("REQ-FR-B24-005 does not replace a portable snapshot with a same-ID newer revision", () => {
    const localTheme: ThemeRecordView = {
      ...customTheme,
      revision: 4,
      definition: definition("Local Revision Four"),
    };
    const portableSnapshot: CustomThemeSnapshot = {
      themeId: 7,
      revision: 3,
      definition: definition("Portable Revision Three", BUILTIN_THEMES.paper),
    };
    const onSelectionChange = vi.fn();
    render(<ThemeManager {...props({
      selection: { kind: "custom", themeId: 7, revision: 3 },
      snapshot: portableSnapshot,
      customThemes: [localTheme],
      onSelectionChange,
    })} />);

    expect(screen.getByRole("radio", { name: "Portable Revision Three移植テーマ" }))
      .toBeChecked();
    const localRadio = screen.getByRole("radio", { name: "Local Revision Fourカスタムテーマ" });
    expect(localRadio).not.toBeChecked();
    expect(screen.getByText("移植テーマ・ローカル版とは異なるスナップショット"))
      .toBeInTheDocument();
    expect(onSelectionChange).not.toHaveBeenCalled();

    fireEvent.click(localRadio);
    expect(onSelectionChange).toHaveBeenCalledWith(
      { kind: "custom", themeId: 7, revision: 4 },
      snapshot(localTheme),
    );
  });

  it("REQ-FR-B24-005 preserves snapshot content on an ID/revision definition collision", () => {
    const localTheme: ThemeRecordView = {
      ...customTheme,
      definition: definition("Local Forest", BUILTIN_THEMES.forest),
    };
    const portableSnapshot: CustomThemeSnapshot = {
      themeId: 7,
      revision: 3,
      definition: definition("Portable OLED", BUILTIN_THEMES.oled),
    };
    const onSelectionChange = vi.fn();
    render(<ThemeManager {...props({
      selection: { kind: "custom", themeId: 7, revision: 3 },
      snapshot: portableSnapshot,
      customThemes: [localTheme],
      onSelectionChange,
    })} />);

    expect(screen.getByRole("radio", { name: "Portable OLED移植テーマ" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Local Forestカスタムテーマ" }))
      .not.toBeChecked();
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("REQ-FR-B24-003 duplicates a built-in into the complete 16-color editor and blocks low contrast", () => {
    render(<ThemeManager {...props()} />);
    fireEvent.click(within(themeCard("ミッドナイト")).getByRole("button", {
      name: "ミッドナイト組み込みテーマを複製",
    }));

    const editor = screen.getByRole("region", { name: "カスタムテーマ編集" });
    expect(within(editor).getByRole("textbox", { name: "テーマ名" }))
      .toHaveValue("ミッドナイト のコピー");
    expect(editor.querySelectorAll('input[type="color"]')).toHaveLength(16);
    const save = within(editor).getByRole("button", { name: "テーマを保存" });
    expect(save).toBeEnabled();

    fireEvent.change(within(editor).getByLabelText("本文の色"), {
      target: { value: BUILTIN_THEMES.midnight.colors.surface.toLowerCase() },
    });
    expect(within(editor).getByRole("alert")).toHaveTextContent("コントラストを調整してください");
    expect(save).toBeDisabled();

    fireEvent.change(within(editor).getByLabelText("本文の色"), {
      target: { value: BUILTIN_THEMES.midnight.colors.text.toLowerCase() },
    });
    expect(within(editor).queryByRole("alert")).not.toBeInTheDocument();
    expect(save).toBeEnabled();
  });

  it.each([
    { label: "空白のみ", value: "   ", error: "テーマ名を入力してください。" },
    { label: "slash", value: "/", error: "テーマ名に /、\\、制御文字は使用できません。" },
    { label: "backslash", value: "\\", error: "テーマ名に /、\\、制御文字は使用できません。" },
    { label: "control", value: "bad\u0001name", error: "テーマ名に /、\\、制御文字は使用できません。" },
  ])("REQ-FR-B24-003 explains an invalid $label theme name", ({ value, error }) => {
    render(<ThemeManager {...props()} />);
    fireEvent.click(within(themeCard("ミッドナイト")).getByRole("button", {
      name: "ミッドナイト組み込みテーマを複製",
    }));

    const editor = screen.getByRole("region", { name: "カスタムテーマ編集" });
    const name = within(editor).getByRole("textbox", { name: "テーマ名" });
    fireEvent.change(name, { target: { value } });

    expect(name).toHaveAttribute("aria-invalid", "true");
    const descriptionId = name.getAttribute("aria-describedby");
    expect(descriptionId).not.toBeNull();
    expect(document.getElementById(descriptionId ?? "")).toHaveTextContent(error);
    expect(within(editor).getByRole("alert")).toHaveTextContent(error);
    expect(within(editor).getByRole("button", { name: "テーマを保存" })).toBeDisabled();
  });

  it("REQ-FR-B24-003 scopes all 16 draft colors to a non-interactive preview mock", () => {
    render(<ThemeManager {...props()} />);
    fireEvent.click(within(themeCard("OLEDブラック")).getByRole("button", {
      name: "OLEDブラック組み込みテーマを複製",
    }));

    const heading = screen.getByText("テーマのプレビュー");
    const preview = heading.closest(".theme-preview");
    expect(preview).toBeInstanceOf(HTMLElement);
    if (!(preview instanceof HTMLElement)) throw new Error("theme preview not found");

    for (const key of THEME_COLOR_KEYS) {
      expect(preview.style.getPropertyValue(PREVIEW_CSS_PROPERTIES[key]))
        .toBe(BUILTIN_THEMES.oled.colors[key]);
    }
    expect(preview.style.getPropertyValue("--theme-canvas")).toBe("");
    expect(preview.querySelector(".theme-preview-toolbar")).toBeInTheDocument();
    expect(preview.querySelector(".theme-preview-raised")).toBeInTheDocument();
    expect(preview.querySelector(".theme-preview-focus-control")).toHaveTextContent("フォーカス");
    expect(preview.querySelector(".theme-preview-danger")).toHaveTextContent("危険操作");
    expect(within(preview).getByText("操作").tagName).toBe("SPAN");
    expect(within(preview).queryByRole("button")).not.toBeInTheDocument();
  });

  it("REQ-FR-B24-003 selects the revisioned custom snapshot returned after save", async () => {
    const saved: ThemeRecordView = {
      id: 21,
      revision: 1,
      definition: definition("ペーパー のコピー", BUILTIN_THEMES.paper),
      updatedAtMs: 456,
    };
    const onSave = vi.fn(async () => saved);
    const onSelectionChange = vi.fn();
    render(<ThemeManager {...props({ onSave, onSelectionChange })} />);
    fireEvent.click(within(themeCard("ペーパー")).getByRole("button", {
      name: "ペーパー組み込みテーマを複製",
    }));
    fireEvent.click(screen.getByRole("button", { name: "テーマを保存" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      saved.definition,
      null,
      null,
    ));
    expect(onSelectionChange).toHaveBeenCalledWith(
      { kind: "custom", themeId: 21, revision: 1 },
      snapshot(saved),
    );
    expect(screen.getByRole("heading", { name: "カスタムテーマを編集" }))
      .toBeInTheDocument();
  });

  it("REQ-FR-B24-004 prevents deletion of the currently applied custom theme", () => {
    const onDelete = vi.fn(async () => true);
    render(<ThemeManager {...props({
      selection: { kind: "custom", themeId: 7, revision: 3 },
      snapshot: snapshot(),
      appliedSelection: { kind: "custom", themeId: 7, revision: 3 },
      onDelete,
    })} />);

    const activeCard = themeCard("My Midnight");
    const edit = within(activeCard).getByRole("button", {
      name: "My Midnightカスタムテーマは現在適用中です。複製して編集してください",
    });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAttribute(
      "title",
      "現在適用中のテーマは直接編集できません。複製して編集してください。",
    );
    expect(within(activeCard).getByText(/適用中（複製して編集）/)).toBeInTheDocument();
    expect(within(activeCard).getByRole("button", {
      name: "My Midnightカスタムテーマを複製",
    })).toBeEnabled();

    const remove = within(activeCard).getByRole("button", {
      name: "My Midnightカスタムテーマを削除",
    });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute(
      "title",
      "現在適用中のテーマは、別のテーマを適用してから削除できます。",
    );
    fireEvent.click(remove);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("REQ-FR-B24-004 requires an explicit second action before deletion", async () => {
    const onDelete = vi.fn(async () => true);
    render(<ThemeManager {...props({ onDelete })} />);

    fireEvent.click(within(themeCard("My Midnight")).getByRole("button", {
      name: "My Midnightカスタムテーマを削除",
    }));
    expect(onDelete).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", {
      name: "My Midnightカスタムテーマの削除を確認",
    });
    const cancel = screen.getByRole("button", {
      name: "My Midnightカスタムテーマの削除を取り消す",
    });
    expect(confirm).toBeInTheDocument();
    fireEvent.click(cancel);
    expect(screen.queryByRole("button", {
      name: "My Midnightカスタムテーマの削除を確認",
    }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "My Midnightカスタムテーマを削除" }));
    fireEvent.click(screen.getByRole("button", {
      name: "My Midnightカスタムテーマの削除を確認",
    }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(customTheme));
  });

  it("REQ-FR-B24-004 counts invalid themes toward the limit and protects an active invalid record", () => {
    const validThemes = Array.from({ length: 31 }, (_, index): ThemeRecordView => ({
      id: index + 1,
      revision: 1,
      definition: definition(`Valid ${index + 1}`),
      updatedAtMs: index,
    }));
    const invalidTheme = {
      id: 99,
      name: "Broken Active",
      reason: "definition JSON is malformed",
      active: true,
    };
    const onDeleteInvalid = vi.fn(async () => true);
    render(<ThemeManager {...props({
      customThemes: validThemes,
      invalidThemes: [invalidTheme],
      maximumThemes: 32,
      onDeleteInvalid,
    })} />);

    expect(screen.getByText("32 / 32件")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新規作成" })).toBeDisabled();
    const invalidRow = screen.getByRole("group", { name: "Broken Active破損テーマ" });
    expect(within(invalidRow).getByText("definition JSON is malformed")).toBeInTheDocument();
    expect(within(invalidRow).getByText(/別テーマを適用してから削除/)).toBeInTheDocument();
    const remove = within(invalidRow).getByRole("button", {
      name: "Broken Active破損テーマを削除",
    });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute(
      "title",
      "適用中の破損テーマは、別のテーマを適用してから削除してください。",
    );
    fireEvent.click(remove);
    expect(onDeleteInvalid).not.toHaveBeenCalled();
  });

  it("REQ-FR-B24-004 requires an explicit second action to delete an invalid record", async () => {
    const invalidTheme = {
      id: 44,
      name: "Broken Forest",
      reason: "missing color: focus",
      active: false,
    };
    const onDeleteInvalid = vi.fn(async () => true);
    render(<ThemeManager {...props({
      customThemes: [],
      invalidThemes: [invalidTheme],
      onDeleteInvalid,
    })} />);

    const invalidRow = screen.getByRole("group", { name: "Broken Forest破損テーマ" });
    fireEvent.click(within(invalidRow).getByRole("button", {
      name: "Broken Forest破損テーマを削除",
    }));
    expect(onDeleteInvalid).not.toHaveBeenCalled();
    expect(within(invalidRow).getByRole("button", {
      name: "Broken Forest破損テーマの削除を取り消す",
    })).toBeInTheDocument();
    fireEvent.click(within(invalidRow).getByRole("button", {
      name: "Broken Forest破損テーマの削除を確認",
    }));
    await waitFor(() => expect(onDeleteInvalid).toHaveBeenCalledWith(invalidTheme));
  });

  it("REQ-FR-B24-004 blocks replacement of the currently applied custom theme", async () => {
    const preview: ThemeImportPreviewView = {
      confirmationKey: "active-conflict",
      definition: definition("My Midnight"),
      existingThemeId: 7,
      bytes: [123, 125],
    };
    const onPreviewImport = vi.fn(async () => preview);
    const onConfirmImport = vi.fn(async () => customTheme);
    render(<ThemeManager {...props({
      appliedSelection: { kind: "custom", themeId: 7, revision: 3 },
      onPreviewImport,
      onConfirmImport,
    })} />);

    const file = new File(["{}"], "active.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("JSONを読み込む"), { target: { files: [file] } });
    const confirmation = await screen.findByRole("region", { name: "テーマ読み込み確認" });
    expect(within(confirmation).getByText(/別のテーマを適用してから置き換えてください/))
      .toBeInTheDocument();
    const replace = within(confirmation).getByRole("button", { name: "置き換える" });
    expect(replace).toBeDisabled();
    expect(replace).toHaveAttribute("title", "別のテーマを適用してから置き換えてください。");
    fireEvent.click(replace);
    expect(onConfirmImport).not.toHaveBeenCalled();
  });

  it("REQ-FR-B24-004 allows import preview at the limit but blocks saving a new record", async () => {
    const validThemes = Array.from({ length: 31 }, (_, index): ThemeRecordView => ({
      id: index + 1,
      revision: 1,
      definition: definition(`Full ${index + 1}`),
      updatedAtMs: index,
    }));
    const preview: ThemeImportPreviewView = {
      confirmationKey: "new-at-limit",
      definition: definition("Imported New"),
      existingThemeId: null,
      bytes: [123, 125],
    };
    const onPreviewImport = vi.fn(async () => preview);
    const onConfirmImport = vi.fn(async () => null);
    render(<ThemeManager {...props({
      customThemes: validThemes,
      invalidThemes: [{ id: 88, name: "Broken", reason: "bad JSON", active: false }],
      maximumThemes: 32,
      onPreviewImport,
      onConfirmImport,
    })} />);

    const input = screen.getByLabelText("JSONを読み込む");
    expect(input).toBeEnabled();
    fireEvent.change(input, {
      target: { files: [new File(["{}"], "new.json", { type: "application/json" })] },
    });
    const confirmation = await screen.findByRole("region", { name: "テーマ読み込み確認" });
    expect(within(confirmation).getByText("カスタムテーマは最大32件です。不要なテーマを削除してから保存してください。"))
      .toBeInTheDocument();
    const save = within(confirmation).getByRole("button", { name: "保存" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(onConfirmImport).not.toHaveBeenCalled();
  });

  it("REQ-FR-B24-004 previews an import and explicitly confirms replacement", async () => {
    const preview: ThemeImportPreviewView = {
      confirmationKey: "opaque-confirmation",
      definition: definition("My Midnight"),
      existingThemeId: 7,
      bytes: [123, 125],
    };
    const imported: ThemeRecordView = {
      id: 7,
      revision: 4,
      definition: preview.definition,
      updatedAtMs: 789,
    };
    const onPreviewImport = vi.fn(async () => preview);
    const onConfirmImport = vi.fn(async () => imported);
    const onSelectionChange = vi.fn();
    render(<ThemeManager {...props({
      onPreviewImport,
      onConfirmImport,
      onSelectionChange,
    })} />);

    const file = new File(["{}"], "theme.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("JSONを読み込む"), { target: { files: [file] } });
    const confirmation = await screen.findByRole("region", { name: "テーマ読み込み確認" });
    expect(onPreviewImport).toHaveBeenCalledWith(file);
    expect(within(confirmation).getByText("同名テーマがあります。明示的に置き換えるか、読み込みを取り消してください。"))
      .toBeInTheDocument();
    expect(onConfirmImport).not.toHaveBeenCalled();

    fireEvent.click(within(confirmation).getByRole("button", { name: "置き換える" }));
    await waitFor(() => expect(onConfirmImport).toHaveBeenCalledWith(preview, true));
    expect(onSelectionChange).toHaveBeenCalledWith(
      { kind: "custom", themeId: 7, revision: 4 },
      snapshot(imported),
    );
    expect(screen.queryByRole("region", { name: "テーマ読み込み確認" }))
      .not.toBeInTheDocument();
  });
});
