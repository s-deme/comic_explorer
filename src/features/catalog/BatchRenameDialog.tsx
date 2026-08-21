import { useEffect, useState } from "react";
import {
  executeBatchRename,
  getRenamePreferences,
  previewBatchRename,
  saveRenamePreferences,
  type BatchRenamePreview,
  type RenamePreferences,
} from "../library/client";

const DEFAULT_PREFERENCES: RenamePreferences = {
  selectExtension: false,
  sequenceStart: 1,
  sequenceDigits: 3,
  separator: "_",
  preserveExtension: true,
};

export function renameSelectionEnd(value: string, selectExtension: boolean): number {
  if (selectExtension) return value.length;
  const dot = value.lastIndexOf(".");
  return dot > 0 ? dot : value.length;
}

interface BatchRenameDialogProps {
  generation: number;
  paths: string[];
  onClose: () => void;
  onComplete: (targetPaths: string[], affected: number) => void;
}

export function BatchRenameDialog({ generation, paths, onClose, onComplete }: BatchRenameDialogProps) {
  const [baseName, setBaseName] = useState("Page");
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [preview, setPreview] = useState<BatchRenamePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void getRenamePreferences(generation).then((response) => {
      if (!current) return;
      if (response.status === "ok") setPreferences(response.data);
      else if (response.status === "error") setError(response.error.message);
    });
    return () => { current = false; };
  }, [generation]);

  function update(change: Partial<RenamePreferences>) {
    setPreferences((current) => ({ ...current, ...change }));
    setPreview(null);
  }

  async function prepare() {
    setBusy(true);
    setError(null);
    const saved = await saveRenamePreferences(preferences, generation);
    if (saved.status !== "ok") {
      setBusy(false);
      if (saved.status === "error") setError(saved.error.message);
      return;
    }
    const response = await previewBatchRename(paths, baseName, saved.data, generation);
    setBusy(false);
    if (response.status === "error") setError(response.error.message);
    else if (response.status === "ok") setPreview(response.data);
  }

  async function execute() {
    if (preview === null) return;
    setBusy(true);
    setError(null);
    const response = await executeBatchRename(paths, baseName, preferences, preview.previewKey, generation);
    setBusy(false);
    if (response.status === "error") { setError(response.error.message); setPreview(null); return; }
    if (response.status === "ok") {
      onComplete(preview.items.map((item) => item.targetRelativePath), response.data.affected);
    }
  }

  return (
    <div className="dialog-backdrop">
      <section className="batch-rename-dialog" role="dialog" aria-modal="true" aria-label="連番で名前を変更">
        <h2>連番で名前を変更</h2>
        <p>{paths.length}件をcatalogの順序でpreviewしてから変更します。</p>
        {error !== null && <p role="alert">{error}</p>}
        <label>基底名<input autoFocus value={baseName} onChange={(event) => { setBaseName(event.target.value); setPreview(null); }} /></label>
        <label>区切り<select value={preferences.separator} onChange={(event) => update({ separator: event.target.value as RenamePreferences["separator"] })}>
          <option value="">なし</option><option value=" ">空白</option><option value="-">-</option><option value="_">_</option>
        </select></label>
        <label>開始番号<input type="number" min={0} max={999999} value={preferences.sequenceStart} onChange={(event) => update({ sequenceStart: Number(event.target.value) })} /></label>
        <label>桁数<input type="number" min={1} max={6} value={preferences.sequenceDigits} onChange={(event) => update({ sequenceDigits: Number(event.target.value) })} /></label>
        <label><input type="checkbox" checked={preferences.preserveExtension} onChange={(event) => update({ preserveExtension: event.target.checked })} />元の拡張子を保持</label>
        <label><input type="checkbox" checked={preferences.selectExtension} onChange={(event) => update({ selectExtension: event.target.checked })} />1件変更では拡張子も選択</label>
        <div className="dialog-actions">
          <button type="button" disabled={busy || baseName.trim().length === 0} onClick={() => void prepare()}>変更後を確認</button>
          <button type="button" disabled={busy} onClick={onClose}>キャンセル</button>
        </div>
        {preview !== null && (
          <section className="batch-rename-preview" role="alertdialog" aria-label="名前変更の確認">
            <h3>変更内容</h3>
            <ol>{preview.items.map((item) => <li key={item.sourceRelativePath}>
              <span>{item.sourceRelativePath}</span><span aria-hidden="true"> → </span><strong>{item.targetRelativePath}</strong>
            </li>)}</ol>
            {preview.unchanged > 0 && <p>{preview.unchanged}件は同名のため変更しません。</p>}
            <button type="button" disabled={busy || preview.items.length === 0} onClick={() => void execute()}>確認して実行</button>
            <button type="button" disabled={busy} onClick={() => setPreview(null)}>戻る</button>
          </section>
        )}
      </section>
    </div>
  );
}
