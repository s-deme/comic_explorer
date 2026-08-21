import { useEffect, useMemo, useState } from "react";
import {
  deleteCsvExportPreset,
  exportCatalogCsv,
  listCsvExportPresets,
  saveCsvExportPreset,
  type CsvColumn,
  type CsvExportConfig,
  type CsvExportPreset,
  type CsvExportScope,
  type CsvSizeUnit,
} from "../library/client";

const COLUMN_OPTIONS: ReadonlyArray<{ value: CsvColumn; label: string }> = [
  { value: "name", label: "名前" },
  { value: "stem", label: "拡張子なし名前" },
  { value: "extension", label: "拡張子" },
  { value: "kind", label: "種類" },
  { value: "relativePath", label: "相対パス" },
  { value: "size", label: "サイズ" },
  { value: "modifiedMs", label: "更新日時 (ms)" },
  { value: "namePart1", label: "名前部分 1" },
  { value: "namePart2", label: "名前部分 2" },
  { value: "namePart3", label: "名前部分 3" },
  { value: "namePart4", label: "名前部分 4" },
];

const DEFAULT_CONFIG: CsvExportConfig = {
  columns: ["name", "kind", "relativePath", "size", "modifiedMs"],
  includeHeader: true,
  sizeUnit: "bytes",
};

interface CsvExportDialogProps {
  generation: number;
  currentPath: string;
  selectedPaths: string[];
  onClose: () => void;
  onNotice: (message: string) => void;
}

export function CsvExportDialog({
  generation,
  currentPath,
  selectedPaths,
  onClose,
  onNotice,
}: CsvExportDialogProps) {
  const [config, setConfig] = useState<CsvExportConfig>(DEFAULT_CONFIG);
  const [scope, setScope] = useState<CsvExportScope>(selectedPaths.length > 0 ? "selected" : "current");
  const [presets, setPresets] = useState<CsvExportPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(config.columns), [config.columns]);

  useEffect(() => {
    let active = true;
    void listCsvExportPresets(generation).then((response) => {
      if (!active) return;
      if (response.status === "ok") setPresets(response.data);
      else if (response.status === "error") setMessage(response.error.message);
    }).catch(() => {
      if (active) setMessage("CSV presetを読み込めませんでした。");
    });
    return () => { active = false; };
  }, [generation]);

  function toggleColumn(column: CsvColumn) {
    setConfig((current) => ({
      ...current,
      columns: current.columns.includes(column)
        ? current.columns.filter((value) => value !== column)
        : [...current.columns, column],
    }));
  }

  function moveColumn(index: number, offset: -1 | 1) {
    setConfig((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.columns.length) return current;
      const columns = [...current.columns];
      [columns[index], columns[target]] = [columns[target], columns[index]];
      return { ...current, columns };
    });
  }

  function loadPreset(name: string) {
    setSelectedPreset(name);
    const preset = presets.find((value) => value.name === name);
    if (preset !== undefined) {
      setPresetName(preset.name);
      setConfig({ ...preset.config, columns: [...preset.config.columns] });
      setMessage(`「${preset.name}」を読み込みました。`);
    }
  }

  async function savePreset() {
    const exists = presets.some((preset) => preset.name.toLocaleLowerCase() === presetName.trim().toLocaleLowerCase());
    if (exists && !window.confirm(`CSV preset「${presetName.trim()}」を上書きしますか？`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await saveCsvExportPreset(presetName, config, exists, generation);
      if (response.status === "ok") {
        const listed = await listCsvExportPresets(generation);
        if (listed.status === "ok") setPresets(listed.data);
        setSelectedPreset(response.data.name);
        setPresetName(response.data.name);
        setMessage("CSV presetを保存しました。");
      } else if (response.status === "error") {
        setMessage(response.error.message);
      }
    } catch {
      setMessage("CSV presetを保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function deletePreset() {
    if (selectedPreset === "" || !window.confirm(`CSV preset「${selectedPreset}」を削除しますか？`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await deleteCsvExportPreset(selectedPreset, generation);
      if (response.status === "ok") {
        setPresets((current) => current.filter((preset) => preset.name !== selectedPreset));
        setSelectedPreset("");
        setMessage("CSV presetを削除しました。");
      } else if (response.status === "error") {
        setMessage(response.error.message);
      }
    } catch {
      setMessage("CSV presetを削除できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await exportCatalogCsv({
        config,
        scope,
        currentPath,
        selectedPaths,
      }, generation);
      if (response.status !== "ok") {
        if (response.status === "error") setMessage(response.error.message);
        return;
      }
      const bytes = new Uint8Array(response.data.bytes);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.data.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      onNotice(`CSV ${response.data.rowCount.toLocaleString("ja-JP")}件のダウンロードを開始しました。`);
      onClose();
    } catch {
      setMessage("CSVを出力できませんでした。保存機能を確認してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <section className="csv-export-dialog" role="dialog" aria-modal="true" aria-label="CSV出力設定">
        <div className="quick-access-heading">
          <h2>CSV出力設定</h2>
          <button type="button" onClick={onClose} disabled={busy}>閉じる</button>
        </div>

        <fieldset>
          <legend>出力対象</legend>
          <label><input type="radio" name="csv-scope" checked={scope === "selected"} disabled={selectedPaths.length === 0} onChange={() => setScope("selected")} /> 選択項目 ({selectedPaths.length}件)</label>
          <label><input type="radio" name="csv-scope" checked={scope === "current"} onChange={() => setScope("current")} /> 現在のfolder直下</label>
          <label><input type="radio" name="csv-scope" checked={scope === "recursive"} onChange={() => setScope("recursive")} /> 現在のfolder以下</label>
        </fieldset>

        <fieldset>
          <legend>列と順序</legend>
          <div className="csv-column-picker">
            {COLUMN_OPTIONS.map((column) => (
              <label key={column.value}>
                <input type="checkbox" checked={selectedSet.has(column.value)} onChange={() => toggleColumn(column.value)} /> {column.label}
              </label>
            ))}
          </div>
          <ol className="csv-column-order">
            {config.columns.map((column, index) => (
              <li key={column}>
                {COLUMN_OPTIONS.find((option) => option.value === column)?.label ?? column}
                <button type="button" aria-label={`${column}を上へ`} disabled={index === 0} onClick={() => moveColumn(index, -1)}>↑</button>
                <button type="button" aria-label={`${column}を下へ`} disabled={index === config.columns.length - 1} onClick={() => moveColumn(index, 1)}>↓</button>
              </li>
            ))}
          </ol>
        </fieldset>

        <div className="csv-options-grid">
          <label><input type="checkbox" checked={config.includeHeader} onChange={(event) => setConfig((current) => ({ ...current, includeHeader: event.target.checked }))} /> headerを含める</label>
          <label>サイズ単位
            <select value={config.sizeUnit} onChange={(event) => setConfig((current) => ({ ...current, sizeUnit: event.target.value as CsvSizeUnit }))}>
              <option value="bytes">bytes</option><option value="kib">KiB</option><option value="mib">MiB</option>
            </select>
          </label>
          <label>名前分割文字
            <input value={config.splitDelimiter ?? ""} maxLength={8} placeholder="例: _" onChange={(event) => setConfig((current) => ({ ...current, splitDelimiter: event.target.value === "" ? undefined : event.target.value }))} />
          </label>
        </div>

        <fieldset>
          <legend>preset</legend>
          <select aria-label="CSV preset" value={selectedPreset} onChange={(event) => loadPreset(event.target.value)}>
            <option value="">選択してください</option>
            {presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
          </select>
          <input aria-label="CSV preset名" value={presetName} maxLength={64} onChange={(event) => setPresetName(event.target.value)} />
          <button type="button" disabled={busy || presetName.trim() === "" || config.columns.length === 0} onClick={() => void savePreset()}>保存</button>
          <button type="button" disabled={busy || selectedPreset === ""} onClick={() => void deletePreset()}>削除</button>
        </fieldset>

        {message !== null && <p role="status">{message}</p>}
        <div className="dialog-actions">
          <button type="button" disabled={busy || config.columns.length === 0 || (scope === "selected" && selectedPaths.length === 0)} onClick={() => void download()}>
            {busy ? "処理中…" : "CSVを出力"}
          </button>
          <button type="button" disabled={busy} onClick={onClose}>キャンセル</button>
        </div>
      </section>
    </div>
  );
}
