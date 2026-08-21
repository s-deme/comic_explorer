import { useEffect, useState } from "react";
import {
  deleteExternalApp,
  launchExternalApp,
  listExternalAppHistory,
  listExternalApps,
  previewExternalAppLaunch,
  registerExternalApp,
  updateExternalApp,
  type ExternalAppEntry,
  type ExternalAppHistoryEntry,
  type ExternalAppLaunchPreview,
  type ExternalAppTargetMode,
} from "../library/client";

const TARGET_LABELS: Record<ExternalAppTargetMode, string> = {
  firstItem: "先頭の項目",
  allSelected: "選択項目すべて",
  parentFolder: "先頭項目の親フォルダー",
};

interface ExternalAppDialogProps {
  generation: number;
  paths: string[];
  onClose: () => void;
  onNotice: (message: string) => void;
}

export function ExternalAppDialog({ generation, paths, onClose, onNotice }: ExternalAppDialogProps) {
  const [apps, setApps] = useState<ExternalAppEntry[]>([]);
  const [history, setHistory] = useState<ExternalAppHistoryEntry[]>([]);
  const [name, setName] = useState("");
  const [argsText, setArgsText] = useState("");
  const [targetMode, setTargetMode] = useState<ExternalAppTargetMode>("firstItem");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<ExternalAppLaunchPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void Promise.all([listExternalApps(generation), listExternalAppHistory(generation)]).then(([appResponse, historyResponse]) => {
      if (!current) return;
      if (appResponse.status === "ok") setApps(appResponse.data);
      else if (appResponse.status === "error") setError(appResponse.error.message);
      if (historyResponse.status === "ok") setHistory(historyResponse.data);
    });
    return () => { current = false; };
  }, [generation]);

  function fixedArgs(): string[] {
    return argsText.split(/\r?\n/).filter((value) => value.length > 0);
  }

  function resetDraft() {
    setEditingId(null);
    setName("");
    setArgsText("");
    setTargetMode("firstItem");
  }

  async function save() {
    setBusy(true);
    setError(null);
    const response = editingId === null
      ? await registerExternalApp(name, fixedArgs(), targetMode, generation)
      : await updateExternalApp(editingId, name, fixedArgs(), targetMode, generation);
    setBusy(false);
    if (response.status === "cancelled") return;
    if (response.status === "error") { setError(response.error.message); return; }
    setApps((current) => [...current.filter((app) => app.id !== response.data.id), response.data]
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "ja")));
    onNotice(editingId === null ? "外部アプリを登録しました。" : "外部アプリ設定を更新しました。");
    resetDraft();
  }

  async function remove(app: ExternalAppEntry) {
    if (!window.confirm(`「${app.displayName}」の登録を削除しますか？`)) return;
    setBusy(true);
    const response = await deleteExternalApp(app.id, generation);
    setBusy(false);
    if (response.status === "error") { setError(response.error.message); return; }
    if (response.status === "ok" && response.data) {
      setApps((current) => current.filter((entry) => entry.id !== app.id));
      if (editingId === app.id) resetDraft();
      setPreview(null);
      onNotice("外部アプリの登録を削除しました。");
    }
  }

  async function prepare(app: ExternalAppEntry) {
    setBusy(true);
    setError(null);
    const response = await previewExternalAppLaunch(app.id, paths, generation);
    setBusy(false);
    if (response.status === "error") setError(response.error.message);
    else if (response.status === "ok") setPreview(response.data);
  }

  async function launch() {
    if (preview === null) return;
    setBusy(true);
    const response = await launchExternalApp(preview.appId, paths, preview.previewKey, generation);
    setBusy(false);
    if (response.status === "error") { setError(response.error.message); setPreview(null); return; }
    if (response.status === "ok") {
      onNotice(`${preview.displayName}で${response.data.affected}件を開きました。`);
      onClose();
    }
  }

  return (
    <div className="dialog-backdrop">
      <section className="external-app-dialog" role="dialog" aria-modal="true" aria-label="登録アプリで開く">
        <h2>登録アプリで開く</h2>
        <p>実行ファイルはWindowsの選択画面から登録し、引数と対象はRust側で個別に検証します。</p>
        {error !== null && <p role="alert">{error}</p>}
        <div className="external-app-layout">
          <section>
            <h3>登録済みアプリ</h3>
            {apps.length === 0 && <p>登録はありません。</p>}
            <ul className="external-app-list">
              {apps.map((app) => (
                <li key={app.id}>
                  <span><strong>{app.displayName}</strong> ({app.executableName}) — {TARGET_LABELS[app.targetMode]}</span>
                  <span>
                    <button type="button" disabled={busy || paths.length === 0} onClick={() => void prepare(app)}>起動内容を確認</button>
                    <button type="button" disabled={busy} onClick={() => {
                      setEditingId(app.id); setName(app.displayName); setArgsText(app.fixedArgs.join("\n"));
                      setTargetMode(app.targetMode); setPreview(null);
                    }}>編集</button>
                    <button type="button" className="danger-button" disabled={busy} onClick={() => void remove(app)}>削除</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>{editingId === null ? "アプリを登録" : "登録内容を編集"}</h3>
            <label>表示名<input value={name} maxLength={64} onChange={(event) => setName(event.target.value)} /></label>
            <label>固定引数（1行に1引数）<textarea value={argsText} rows={3} onChange={(event) => setArgsText(event.target.value)} /></label>
            <label>渡す対象<select value={targetMode} onChange={(event) => setTargetMode(event.target.value as ExternalAppTargetMode)}>
              {Object.entries(TARGET_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <div className="dialog-actions">
              <button type="button" disabled={busy || name.trim().length === 0} onClick={() => void save()}>
                {editingId === null ? "実行ファイルを選んで登録" : "更新"}
              </button>
              {editingId !== null && <button type="button" disabled={busy} onClick={resetDraft}>編集をやめる</button>}
            </div>
          </section>
        </div>
        {preview !== null && (
          <section className="external-app-preview" role="alertdialog" aria-label="外部アプリ起動の確認">
            <h3>起動内容の確認</h3>
            <p>{preview.displayName} ({preview.executableName})へ{preview.targetCount}件を渡します。固定引数は{preview.fixedArgCount}件です。</p>
            <button type="button" disabled={busy} onClick={() => void launch()}>確認して起動</button>
            <button type="button" disabled={busy} onClick={() => setPreview(null)}>キャンセル</button>
          </section>
        )}
        <section>
          <h3>最近の起動</h3>
          {history.length === 0 ? <p>履歴はありません。ファイル名と引数は履歴へ保存しません。</p> : (
            <ol className="external-app-history">{history.map((item, index) => (
              <li key={`${item.launchedAtMs}:${index}`}>{item.displayName} — {TARGET_LABELS[item.targetMode]} / {item.targetCount}件</li>
            ))}</ol>
          )}
        </section>
        <div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>閉じる</button></div>
      </section>
    </div>
  );
}
