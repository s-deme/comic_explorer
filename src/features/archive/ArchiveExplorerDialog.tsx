import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";

import { listArchiveVirtualTree, type ArchiveVirtualEntry, type ArchiveVirtualTreeSnapshot } from "../library/client";
import { presentError } from "../errors/presentation";

interface ArchiveExplorerPaneProps {
  archiveRelativePath: string;
  onOpenPage: (pageKey: string) => void | Promise<void>;
  onClose: () => void;
}

function leafName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

function entryGlyph(entry: ArchiveVirtualEntry): string {
  if (entry.kind === "folder") return "▱";
  if (entry.kind === "archive") return "▤";
  return "▧";
}

export function ArchiveExplorerPane({ archiveRelativePath, onOpenPage, onClose }: ArchiveExplorerPaneProps) {
  const generation = useRef(0);
  const listScroll = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<ArchiveVirtualTreeSnapshot | null>(null);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestGeneration = ++generation.current;
    setSnapshot(null);
    setSelectedContainerId(null);
    setLoading(true);
    setError(null);
    void listArchiveVirtualTree(archiveRelativePath, requestGeneration)
      .then((response) => {
        if (requestGeneration !== generation.current) return;
        if (response.status === "ok") setSnapshot(response.data);
        else if (response.status === "error") setError(presentError(response.error));
      })
      .catch(() => {
        if (requestGeneration === generation.current) setError("書庫の内容を読み込めませんでした。");
      })
      .finally(() => {
        if (requestGeneration === generation.current) setLoading(false);
      });
    return () => { generation.current += 1; };
  }, [archiveRelativePath]);

  const children = useMemo(() => {
    const result = new Map<string | null, ArchiveVirtualEntry[]>();
    for (const entry of snapshot?.entries ?? []) {
      const siblings = result.get(entry.parentId) ?? [];
      siblings.push(entry);
      result.set(entry.parentId, siblings);
    }
    for (const siblings of result.values()) siblings.sort((left, right) => left.sortOrder - right.sortOrder);
    return result;
  }, [snapshot]);
  const selectedContainer = selectedContainerId === null
    ? null
    : snapshot?.entries.find((entry) => entry.id === selectedContainerId) ?? null;
  const directChildren = children.get(selectedContainerId) ?? [];
  const virtualizer = useVirtualizer({
    count: directChildren.length,
    getScrollElement: () => listScroll.current,
    estimateSize: () => 36,
    overscan: 12,
    initialRect: { width: 720, height: 520 },
    observeElementRect: (instance, callback) => {
      const element = instance.scrollElement;
      if (!element) return undefined;
      const report = () => callback({
        width: element.clientWidth || 720,
        height: element.clientHeight || 520,
      });
      report();
      if (typeof ResizeObserver === "undefined") return undefined;
      const observer = new ResizeObserver(report);
      observer.observe(element);
      return () => observer.disconnect();
    },
  });

  return (
    <section className="archive-explorer-pane" aria-label="書庫の内容">
      <header className="archive-pane-header">
        <div>
          <h2>書庫の内容</h2>
          <p title={archiveRelativePath}>
            {[leafName(archiveRelativePath), selectedContainer?.name].filter(Boolean).join(" › ")}
          </p>
        </div>
        <div className="archive-pane-actions">
          <button type="button" disabled={selectedContainerId === null} onClick={() => setSelectedContainerId(selectedContainer?.parentId ?? null)}>親へ</button>
          <button type="button" onClick={onClose}>フォルダー一覧へ戻る</button>
        </div>
      </header>
      {loading && <p className="catalog-state" role="status">書庫の内容を読み込んでいます…</p>}
      {error !== null && <div className="catalog-state" role="alert"><p>{error}</p></div>}
      {!loading && error === null && snapshot !== null && (
        <div className="archive-pane-body">
          <p className="archive-pane-summary">{directChildren.length}項目</p>
          <div className="archive-virtual-scroll" ref={listScroll}>
            <div role="list" style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const entry = directChildren[virtualRow.index];
                return (
                  <div className="archive-list-row" role="listitem" key={entry.id} style={{ transform: `translateY(${virtualRow.start}px)` }}>
                    <button type="button" onClick={() => {
                      if (entry.kind === "image" && entry.pageKey !== null) void onOpenPage(entry.pageKey);
                      else if (entry.kind !== "image") setSelectedContainerId(entry.id);
                    }}>
                      <span aria-hidden="true">{entryGlyph(entry)}</span><span>{entry.name}</span><span>{entry.kind === "image" ? "開く" : "›"}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
