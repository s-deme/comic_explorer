import { useEffect, useRef, useState } from "react";
import { loadPage, type ViewerSession } from "../library/client";
import { presentError } from "../errors/presentation";
import { PageCollection } from "./PageCollection";

export function PagePreviewDialog({ session, generation, initialIndex, onSelect, onClose }: {
  session: ViewerSession;
  generation: number;
  initialIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(Promise.resolve());
  const [index, setIndex] = useState(initialIndex);
  const [retry, setRetry] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const [notice, setNotice] = useState("読み込み中…");
  const [failed, setFailed] = useState(false);
  const [grid, setGrid] = useState(false);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  useEffect(() => {
    if (grid) return;
    let cancelled = false;
    setUri(null);
    setFailed(false);
    setNotice("読み込み中…");
    const timer = window.setTimeout(() => {
      // One request at a time; superseded queued selections never load.
      pending.current = pending.current.then(async () => {
        if (cancelled) return;
        try {
          const response = await loadPage(session, index, generation, "near");
          if (cancelled) return;
          if (response.status === "ok" && response.generation === generation) {
            setUri(response.data.mediaUri);
          } else {
            setFailed(true);
            setNotice(response.status === "error" ? presentError(response.error) : "プレビューを読み込めませんでした。");
          }
        } catch {
          if (!cancelled) {
            setFailed(true);
            setNotice("プレビューを読み込めませんでした。");
          }
        }
      });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [session, generation, index, retry, grid]);

  function select(value: string) {
    const next = Number(value) - 1;
    if (Number.isInteger(next) && next >= 0 && next < session.pages.length) setIndex(next);
  }

  return <dialog ref={dialog} className="page-preview-dialog" aria-label="ページプレビュー" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2>ページプレビュー</h2><button type="button" onClick={onClose}>閉じる</button></header>
    <button type="button" aria-pressed={grid} onClick={() => setGrid(!grid)}>全ページ一覧</button>
    {grid ? <PageCollection session={session} generation={generation} index={index} grid onIndex={setIndex} /> : <div className="page-preview-image">
      {uri && !failed && <img src={uri} alt={`${index + 1}ページのプレビュー`} onLoad={() => setNotice("")} onError={() => { setFailed(true); setNotice("画像を表示できませんでした。"); }} />}
      {notice && <p role="status">{notice}</p>}
      {failed && <button type="button" onClick={() => setRetry((value) => value + 1)}>再試行</button>}
    </div>}
    <p className="page-preview-name" title={session.pages[index].relativePath}>{session.pages[index].relativePath}</p>
    <label>プレビューページ<input aria-label="プレビューページ" type="range" min={1} max={session.pages.length} value={index + 1} onChange={(event) => select(event.target.value)} /></label>
    <footer>
      <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>前</button>
      <label>ページ番号<input type="number" min={1} max={session.pages.length} value={index + 1} onChange={(event) => select(event.target.value)} /></label>
      <span>/ {session.pages.length}</span>
      <button type="button" disabled={index + 1 === session.pages.length} onClick={() => setIndex(index + 1)}>次</button>
      <button type="button" onClick={() => onSelect(index)}>このページへ移動</button>
    </footer>
  </dialog>;
}
