import { useEffect, useRef, useState } from "react";

import { presentError } from "../errors/presentation";
import {
  cancelOfflineMediaRegistration,
  deleteOfflineMedia,
  getOfflineMedia,
  getOfflineMediaThumbnail,
  listOfflineMedia,
  openOfflineMediaEntry,
  registerOfflineMedia,
  setOfflineMediaIcon,
  type CliLaunchPlan,
  type OfflineMediaCatalog,
  type OfflineMediaDetail,
  type OfflineMediaEntry,
  type OfflineMediaIcon,
} from "../library/client";

const ICONS: { value: OfflineMediaIcon; label: string; glyph: string }[] = [
  { value: "disc", label: "ディスク", glyph: "◉" },
  { value: "removable", label: "リムーバブル", glyph: "▣" },
  { value: "archive", label: "保管", glyph: "▤" },
  { value: "star", label: "重要", glyph: "★" },
];

interface Props {
  defaultName: string;
  onOpenPlan: (plan: CliLaunchPlan) => Promise<void> | void;
  onClose: () => void;
}

function noticeOf(response: { status: "cancelled" } | { status: "error"; error: Parameters<typeof presentError>[0] }): string {
  return response.status === "cancelled" ? "媒体登録をキャンセルしました。部分的な台帳は保存していません。" : presentError(response.error);
}

function glyph(icon: OfflineMediaIcon): string {
  return ICONS.find((item) => item.value === icon)?.glyph ?? "◉";
}

function openable(entry: OfflineMediaEntry): boolean {
  return entry.kind !== "other";
}

export function MediaCatalogDialog({ defaultName, onOpenPlan, onClose }: Props) {
  const generation = useRef(0);
  const activeRegistration = useRef<number | null>(null);
  const thumbnailUrl = useRef<string | null>(null);
  const [catalog, setCatalog] = useState<OfflineMediaCatalog>({ media: [] });
  const [detail, setDetail] = useState<OfflineMediaDetail | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [name, setName] = useState(defaultName || "オフライン媒体");
  const [icon, setIcon] = useState<OfflineMediaIcon>("disc");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function replaceThumbnail(next: string | null) {
    if (thumbnailUrl.current !== null) URL.revokeObjectURL(thumbnailUrl.current);
    thumbnailUrl.current = next;
    setThumbnail(next);
  }

  async function refresh() {
    const request = ++generation.current;
    setBusy(true);
    try {
      const response = await listOfflineMedia(request);
      if (request !== generation.current) return;
      if (response.status === "ok") {
        setCatalog(response.data);
        const selected = detail?.media.id;
        if (selected !== undefined && response.data.media.some((media) => media.id === selected)) await selectMedia(selected, request);
        else setDetail(null);
      } else setNotice(noticeOf(response));
    } catch { if (request === generation.current) setNotice("媒体台帳を読み込めませんでした。"); }
    finally { if (request === generation.current) setBusy(false); }
  }

  async function selectMedia(mediaId: number, request = ++generation.current) {
    const response = await getOfflineMedia(mediaId, request);
    if (request !== generation.current) return;
    if (response.status === "ok") { setDetail(response.data); setSelectedPath(null); replaceThumbnail(null); }
    else setNotice(noticeOf(response));
  }

  useEffect(() => {
    void refresh();
    return () => { generation.current += 1; if (thumbnailUrl.current !== null) URL.revokeObjectURL(thumbnailUrl.current); };
  }, []);

  async function register() {
    const request = ++generation.current;
    activeRegistration.current = request;
    setBusy(true); setNotice("Rustで媒体snapshotを走査しています…");
    try {
      const response = await registerOfflineMedia(name, icon, request);
      if (request !== generation.current) return;
      if (response.status === "ok") { setCatalog(response.data); setNotice("媒体snapshotを原子的に保存しました。"); }
      else setNotice(noticeOf(response));
    } catch { if (request === generation.current) setNotice("媒体登録を完了できませんでした。部分的な台帳は保存していません。"); }
    finally { if (activeRegistration.current === request) activeRegistration.current = null; if (request === generation.current) setBusy(false); }
  }

  async function cancel() {
    const request = activeRegistration.current;
    if (request === null) return;
    await cancelOfflineMediaRegistration(request);
    setNotice("キャンセルを要求しました。Rust transaction確定前に一括破棄します。");
  }

  async function selectEntry(entry: OfflineMediaEntry) {
    setSelectedPath(entry.relativePath); replaceThumbnail(null);
    if (detail === null) return;
    const request = ++generation.current;
    const response = await getOfflineMediaThumbnail(detail.media.id, entry.relativePath, request);
    if (request !== generation.current || response.status !== "ok" || response.data === null) return;
    const url = URL.createObjectURL(new Blob([new Uint8Array(response.data.jpeg)], { type: "image/jpeg" }));
    replaceThumbnail(url);
  }

  const selectedEntry = detail?.entries.find((entry) => entry.relativePath === selectedPath) ?? null;

  return (
    <div className="dialog-backdrop">
      <section role="dialog" aria-modal="true" aria-label="オフライン媒体台帳" className="media-catalog-dialog">
        <header className="quick-access-heading"><div><h2>オフライン媒体台帳</h2><p>構造と表紙だけをapp-localに保存します。原本は変更しません。</p></div><button type="button" onClick={onClose}>閉じる</button></header>
        <div className="media-register-row">
          <label>媒体名<input aria-label="媒体名" value={name} maxLength={128} onChange={(event) => setName(event.target.value)} /></label>
          <label>icon<select aria-label="媒体icon" value={icon} onChange={(event) => setIcon(event.target.value as OfflineMediaIcon)}>{ICONS.map((item) => <option key={item.value} value={item.value}>{item.glyph} {item.label}</option>)}</select></label>
          <button type="button" disabled={busy || name.trim() === ""} onClick={() => void register()}>現在のlibraryを登録</button>
          <button type="button" disabled={activeRegistration.current === null} onClick={() => void cancel()}>登録をキャンセル</button>
          <button type="button" disabled={busy} onClick={() => void refresh()}>接続状態を更新</button>
        </div>
        {notice !== null && <p role="status">{notice}</p>}
        <div className="media-catalog-layout">
          <nav aria-label="登録媒体"><ul>{catalog.media.map((media) => <li key={media.id} aria-current={detail?.media.id === media.id}><button type="button" onClick={() => void selectMedia(media.id)}><span>{glyph(media.icon)}</span><span>{media.name}<small>{media.available ? `接続中 ${media.connectedRoot ?? ""}` : "オフライン"}・{media.entryCount}件・表紙{media.thumbnailCount}件</small></span></button></li>)}</ul>{catalog.media.length === 0 && <p>登録媒体はありません。</p>}</nav>
          <section aria-label="保存済み媒体構造" className="media-entry-pane">
            {detail !== null && <>
              <header><h3>{detail.media.name}</h3><select aria-label="保存済み媒体icon" value={detail.media.icon} disabled={busy} onChange={async (event) => { const next = event.target.value as OfflineMediaIcon; const request = ++generation.current; const response = await setOfflineMediaIcon(detail.media.id, next, request); if (response.status === "ok") { setCatalog(response.data); await selectMedia(detail.media.id, request); } else setNotice(noticeOf(response)); }}>{ICONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button type="button" disabled={busy} onClick={async () => { if (!window.confirm("保存済み台帳だけを削除しますか？媒体上のfileは変更しません。")) return; const request = ++generation.current; const response = await deleteOfflineMedia(detail.media.id, request); if (response.status === "ok") { setCatalog(response.data); setDetail(null); } else setNotice(noticeOf(response)); }}>台帳を削除</button></header>
              <div className="media-entry-content"><ul aria-label="媒体entry一覧">{detail.entries.map((entry) => <li key={entry.relativePath} aria-selected={selectedPath === entry.relativePath}><button type="button" onClick={() => void selectEntry(entry)}><span>{entry.kind === "folder" ? "▱" : entry.kind === "image" ? "▧" : entry.kind === "other" ? "·" : "▤"}</span><span>{entry.relativePath}</span></button></li>)}</ul><aside>{thumbnail !== null ? <img src={thumbnail} alt="保存済み表紙" /> : <p>保存済み表紙はありません。</p>}{selectedEntry !== null && <><p>{selectedEntry.kind}・{selectedEntry.sizeBytes.toLocaleString()} bytes</p><button type="button" disabled={!detail.media.available || !openable(selectedEntry)} onClick={async () => { const request = ++generation.current; const response = await openOfflineMediaEntry(detail.media.id, selectedEntry.relativePath, request); if (response.status === "ok") await onOpenPlan(response.data); else setNotice(noticeOf(response)); }}>接続媒体から開く</button></>}</aside></div>
            </>}
            {detail === null && <p>媒体を選択すると、オフラインでも保存済み構造を表示します。</p>}
          </section>
        </div>
      </section>
    </div>
  );
}
