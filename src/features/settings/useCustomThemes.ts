import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { presentError } from "../errors/presentation";
import {
  deleteCustomTheme,
  executeCustomThemeImport,
  exportCustomTheme,
  listCustomThemes,
  previewCustomThemeImport,
  saveCustomTheme,
  type CustomThemeCatalog
} from "../library/client";
import { normalizeThemeDefinitionV1, type ThemeDefinitionV1, type ThemeSelection } from "./theme";
import type { InvalidThemeRecordView, ThemeImportPreviewView, ThemeRecordView } from "./ThemeManager";

export function themeRecordViews(catalog: CustomThemeCatalog): ThemeRecordView[] {
  return catalog.themes.flatMap((theme) => {
    const definition = normalizeThemeDefinitionV1(theme.definition);
    return definition === null
      || !Number.isSafeInteger(theme.themeId)
      || theme.themeId <= 0
      || !Number.isSafeInteger(theme.revision)
      || theme.revision <= 0
      ? []
      : [{
        id: theme.themeId,
        revision: theme.revision,
        definition,
        updatedAtMs: theme.updatedAtMs,
      }];
  });
}

export function useCustomThemes(
  themeSelection: ThemeSelection,
  settingsSaving: boolean,
  setSettingsSaving: Dispatch<SetStateAction<boolean>>,
  setProfileNotice: Dispatch<SetStateAction<string | null>>,
) {
  const themeGeneration = useRef(0);
  const [customThemeCatalog, setCustomThemeCatalog] = useState<CustomThemeCatalog>({
    themes: [],
    invalidThemes: [],
    maximumThemes: 32,
  });
  function acceptCustomThemeCatalog(catalog: CustomThemeCatalog): ThemeRecordView[] {
    setCustomThemeCatalog(catalog);
    const themes = themeRecordViews(catalog);
    const invalidCount = catalog.invalidThemes.length + catalog.themes.length - themes.length;
    if (invalidCount > 0) {
      setProfileNotice(
        `読み込めないカスタムテーマが${invalidCount}件あります。記録は削除していません。`,
      );
    }
    return themes;
  }

  function markCustomThemeCatalogActive(selection: ThemeSelection): void {
    setCustomThemeCatalog((catalog) => ({
      ...catalog,
      themes: catalog.themes.map((theme) => ({
        ...theme,
        active: selection.kind === "custom" && selection.themeId === theme.themeId,
      })),
      invalidThemes: catalog.invalidThemes.map((theme) => ({
        ...theme,
        active: selection.kind === "custom" && selection.themeId === theme.themeId,
      })),
    }));
  }

  async function refreshCustomThemes(): Promise<void> {
    const requestGeneration = ++themeGeneration.current;
    try {
      const response = await listCustomThemes(requestGeneration);
      if (requestGeneration !== themeGeneration.current) return;
      if (response.status === "ok") acceptCustomThemeCatalog(response.data);
      else if (response.status === "error") setProfileNotice(presentError(response.error));
    } catch {
      if (requestGeneration === themeGeneration.current) {
        setProfileNotice("カスタムテーマの一覧を読み込めませんでした。");
      }
    }
  }

  async function saveThemeDefinition(
    definition: ThemeDefinitionV1,
    themeId: number | null,
    expectedRevision: number | null,
  ): Promise<ThemeRecordView | null> {
    if (settingsSaving) return null;
    if (themeId !== null && themeSelection.kind === "custom" && themeSelection.themeId === themeId) {
      setProfileNotice("現在適用中のテーマは直接編集できません。複製して編集してください。");
      return null;
    }
    const validated = normalizeThemeDefinitionV1(definition);
    if (validated === null) {
      setProfileNotice("テーマの名前、色、コントラストを確認してください。");
      return null;
    }
    const previousIds = new Set(customThemeCatalog.themes.map((theme) => theme.themeId));
    setSettingsSaving(true);
    setProfileNotice("カスタムテーマを検証して保存しています。");
    const requestGeneration = ++themeGeneration.current;
    try {
      const response = await saveCustomTheme({
        themeId,
        expectedRevision,
        definition: validated,
      }, requestGeneration);
      if (requestGeneration !== themeGeneration.current) return null;
      if (response.status !== "ok") {
        setProfileNotice(response.status === "error"
          ? presentError(response.error)
          : "テーマの保存をキャンセルしました。");
        return null;
      }
      const themes = acceptCustomThemeCatalog(response.data);
      const saved = themeId === null
        ? themes.find((theme) => !previousIds.has(theme.id))
          ?? themes.find((theme) => theme.definition.name === validated.name)
        : themes.find((theme) => theme.id === themeId);
      if (saved === undefined) {
        setProfileNotice("テーマは保存されましたが、保存結果を確認できませんでした。");
        return null;
      }
      setProfileNotice(`カスタムテーマ「${saved.definition.name}」を保存しました。適用を押すと画面へ反映します。`);
      return saved;
    } catch {
      if (requestGeneration === themeGeneration.current) {
        setProfileNotice("カスタムテーマを保存できませんでした。");
      }
      return null;
    } finally {
      if (requestGeneration === themeGeneration.current) setSettingsSaving(false);
    }
  }

  async function deleteThemeRecord(theme: ThemeRecordView | InvalidThemeRecordView): Promise<boolean> {
    const invalid = "active" in theme;
    const name = invalid ? theme.name : theme.definition.name;
    const label = invalid ? "読み込めないカスタムテーマ" : "カスタムテーマ";
    if (settingsSaving) return false;
    if ((invalid && theme.active) || (themeSelection.kind === "custom" && themeSelection.themeId === theme.id)) {
      setProfileNotice(invalid ? "適用中の破損テーマは、別のテーマを適用してから削除してください。" : "現在適用中のテーマは、別のテーマを適用してから削除してください。");
      return false;
    }
    setSettingsSaving(true);
    setProfileNotice(`${label}「${name}」を削除しています。`);
    const requestGeneration = ++themeGeneration.current;
    try {
      const response = await deleteCustomTheme(theme.id, true, requestGeneration);
      if (requestGeneration !== themeGeneration.current) return false;
      if (response.status !== "ok") {
        setProfileNotice(response.status === "error"
          ? presentError(response.error)
          : "テーマの削除をキャンセルしました。");
        return false;
      }
      acceptCustomThemeCatalog(response.data);
      setProfileNotice(`${label}「${name}」を削除しました。`);
      return true;
    } catch {
      if (requestGeneration === themeGeneration.current) {
        setProfileNotice(`${label}を削除できませんでした。`);
      }
      return false;
    } finally {
      if (requestGeneration === themeGeneration.current) setSettingsSaving(false);
    }
  }

  async function previewThemeImport(file: File): Promise<ThemeImportPreviewView | null> {
    if (settingsSaving) return null;
    if (file.size === 0 || file.size > 65_536) {
      setProfileNotice("テーマJSONは1 byte以上64 KiB以下にしてください。");
      return null;
    }
    setSettingsSaving(true);
    setProfileNotice("テーマJSONを検証しています。");
    const requestGeneration = ++themeGeneration.current;
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const response = await previewCustomThemeImport(bytes, requestGeneration);
      if (requestGeneration !== themeGeneration.current) return null;
      if (response.status !== "ok") {
        setProfileNotice(response.status === "error"
          ? presentError(response.error)
          : "テーマの読み込みをキャンセルしました。");
        return null;
      }
      const definition = normalizeThemeDefinitionV1(response.data.definition);
      if (definition === null || response.data.byteLength !== bytes.length) {
        setProfileNotice("テーマJSONの検証結果が不正です。保存していません。");
        return null;
      }
      setProfileNotice("検証に成功しました。内容を確認して保存してください。");
      return {
        confirmationKey: response.data.confirmationKey,
        definition,
        existingThemeId: response.data.conflict?.themeId ?? null,
        bytes,
      };
    } catch {
      if (requestGeneration === themeGeneration.current) {
        setProfileNotice("テーマJSONを読み込めませんでした。");
      }
      return null;
    } finally {
      if (requestGeneration === themeGeneration.current) setSettingsSaving(false);
    }
  }

  async function confirmThemeImport(
    preview: ThemeImportPreviewView,
    replace: boolean,
  ): Promise<ThemeRecordView | null> {
    if (settingsSaving) return null;
    if (
      replace
      && preview.existingThemeId !== null
      && themeSelection.kind === "custom"
      && themeSelection.themeId === preview.existingThemeId
    ) {
      setProfileNotice("現在適用中のテーマは置き換えられません。別のテーマを適用してください。");
      return null;
    }
    const previousIds = new Set(customThemeCatalog.themes.map((theme) => theme.themeId));
    setSettingsSaving(true);
    setProfileNotice("カスタムテーマを保存しています。");
    const requestGeneration = ++themeGeneration.current;
    try {
      const response = await executeCustomThemeImport(
        preview.bytes,
        preview.confirmationKey,
        replace,
        requestGeneration,
      );
      if (requestGeneration !== themeGeneration.current) return null;
      if (response.status !== "ok") {
        setProfileNotice(response.status === "error"
          ? presentError(response.error)
          : "テーマの読み込みをキャンセルしました。");
        return null;
      }
      const themes = acceptCustomThemeCatalog(response.data);
      const saved = preview.existingThemeId === null
        ? themes.find((theme) => !previousIds.has(theme.id))
          ?? themes.find((theme) => theme.definition.name === preview.definition.name)
        : themes.find((theme) => theme.id === preview.existingThemeId);
      if (saved === undefined) {
        setProfileNotice("テーマは保存されましたが、保存結果を確認できませんでした。");
        return null;
      }
      setProfileNotice(`カスタムテーマ「${saved.definition.name}」を読み込みました。適用を押すと画面へ反映します。`);
      return saved;
    } catch {
      if (requestGeneration === themeGeneration.current) {
        setProfileNotice("カスタムテーマを保存できませんでした。");
      }
      return null;
    } finally {
      if (requestGeneration === themeGeneration.current) setSettingsSaving(false);
    }
  }

  async function downloadCustomTheme(theme: ThemeRecordView): Promise<void> {
    const requestGeneration = ++themeGeneration.current;
    let url: string | null = null;
    try {
      const response = await exportCustomTheme(theme.id, requestGeneration);
      if (requestGeneration !== themeGeneration.current) return;
      if (response.status !== "ok") {
        setProfileNotice(response.status === "error"
          ? presentError(response.error)
          : "テーマの書き出しをキャンセルしました。");
        return;
      }
      if (typeof URL.createObjectURL !== "function") throw new Error("download unavailable");
      if (
        response.data.bytes.length === 0
        || response.data.bytes.length > 65_536
        || response.data.bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
      ) throw new Error("invalid export bytes");
      url = URL.createObjectURL(new Blob([new Uint8Array(response.data.bytes)], {
        type: "application/json",
      }));
      const link = document.createElement("a");
      link.href = url;
      link.download = /^[^\u0000-\u001F/\\]{1,128}\.json$/i.test(response.data.fileName)
        ? response.data.fileName
        : `comic-explorer-theme-${theme.id}.json`;
      link.click();
      setProfileNotice("テーマJSONのダウンロードを開始しました。");
    } catch {
      if (requestGeneration === themeGeneration.current) {
        setProfileNotice("カスタムテーマを書き出せませんでした。");
      }
    } finally {
      if (url !== null) {
        const downloadUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      }
    }
  }

  return {
    customThemeCatalog,
    markCustomThemeCatalogActive,
    refreshCustomThemes,
    saveThemeDefinition,
    deleteThemeRecord,
    deleteInvalidThemeRecord: deleteThemeRecord,
    previewThemeImport,
    confirmThemeImport,
    downloadCustomTheme,
  };
}
