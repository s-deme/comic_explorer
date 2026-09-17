import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import { loadPage, type ViewerSession } from "../library/client";

// Shared by the page index and continuous reader; only mounted rows retain images.
export function PageCollection({ session, generation, index, grid = false, onIndex }: {
  session: ViewerSession; generation: number; index: number; grid?: boolean;
  onIndex: (index: number) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const lastIndex = useRef(index);
  const queue = useRef(Promise.resolve());
  const columns = grid ? 3 : 1;
  const virtual = useVirtualizer({
    count: Math.ceil(session.pages.length / columns),
    getScrollElement: () => scroll.current,
    estimateSize: () => grid ? 220 : 900,
    measureElement: (element) => element.getBoundingClientRect().height || 900,
    overscan: 1,
    initialRect: { width: 720, height: 600 },
    initialOffset: Math.floor(index / columns) * (grid ? 220 : 900),
    observeElementRect: (instance, callback) => {
      const element = instance.scrollElement;
      if (!element) return;
      const report = () => callback({ width: element.clientWidth || 720, height: element.clientHeight || 600 });
      report();
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(report);
      observer.observe(element);
      return () => observer.disconnect();
    },
    onChange: (instance, scrolling) => {
      if (grid || !scrolling) return;
      const offset = instance.scrollOffset ?? 0;
      const row = instance.getVirtualItems().find((item) => item.end > offset + 1);
      if (row && row.index !== lastIndex.current) {
        lastIndex.current = row.index;
        onIndex(row.index);
      }
    },
  });
  useEffect(() => {
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      virtual.scrollToIndex(Math.floor(index / columns), { align: "start" });
    }
  }, [index, columns, virtual]);
  useEffect(() => { if (!grid) scroll.current?.focus(); }, [grid]);
  return <div ref={scroll} className={`page-collection ${grid ? "page-collection-grid" : "page-collection-reader"}`}
    tabIndex={0} role="region" aria-label={grid ? "全ページ一覧" : "連続縦読み"}>
    <div style={{ height: virtual.getTotalSize(), position: "relative", width: "100%" }}>
      {virtual.getVirtualItems().map((row) => <div key={row.key} data-index={row.index}
        ref={grid ? undefined : virtual.measureElement}
        className="page-collection-row" style={{ position: "absolute", top: 0, width: "100%", transform: `translateY(${row.start}px)`, height: grid ? 220 : undefined }}>
        {Array.from({ length: columns }, (_, column) => row.index * columns + column)
          .filter((page) => page < session.pages.length).map((page) => <CollectionPage key={session.pages[page].id}
            session={session} generation={generation} index={page} grid={grid} selected={page === index}
            enqueue={(task) => { queue.current = queue.current.then(task, task); }}
            onSelect={() => onIndex(page)} />)}
      </div>)}
    </div>
  </div>;
}

function CollectionPage({ session, generation, index, grid, selected, enqueue, onSelect }: {
  session: ViewerSession; generation: number; index: number; grid: boolean; selected: boolean;
  enqueue: (task: () => Promise<void>) => void; onSelect: () => void;
}) {
  const [uri, setUri] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const enqueueRef = useRef(enqueue);
  enqueueRef.current = enqueue;
  useEffect(() => {
    let cancelled = false;
    setUri(undefined);
    setFailed(false);
    enqueueRef.current(async () => {
      if (cancelled) return;
      try {
        const result = await loadPage(session, index, generation, "near");
        if (cancelled) return;
        if (result.status === "ok" && result.generation === generation) setUri(result.data.mediaUri);
        else setFailed(true);
      } catch { if (!cancelled) setFailed(true); }
    });
    return () => { cancelled = true; };
  }, [session, generation, index, retry]);
  const content = <>{uri && !failed ? <img src={uri} alt={`${index + 1}ページ`} onError={() => setFailed(true)} />
    : <span role="status">{failed ? "読み込み失敗" : "読み込み中…"}</span>}
    <span className="page-collection-caption" title={session.pages[index].relativePath}>{index + 1}: {session.pages[index].relativePath.split(/[\\/]/).pop()}</span></>;
  return <div className="page-collection-page">
    {grid ? <button type="button" aria-pressed={selected} onClick={onSelect}>{content}</button> : content}
    {failed && <button type="button" onClick={() => setRetry((value) => value + 1)} aria-label={`${index + 1}ページを再試行`}>再試行</button>}
  </div>;
}
