import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  listArchiveVirtualTree,
  type ArchiveVirtualEntry,
  type ArchiveVirtualTreeSnapshot,
} from "../library/client";
import { presentError } from "../errors/presentation";

interface ArchiveExplorerDialogProps {
  archiveRelativePath: string;
  onOpenPage: (pageKey: string) => void | Promise<void>;
  onClose: () => void;
}

interface ContainerRow {
  id: string | null;
  parentId: string | null;
  name: string;
  kind: "root" | "folder" | "archive";
  depth: number;
  hasChildren: boolean;
}

const ROOT_KEY = "archive-root";
const ROW_HEIGHT = 28;

function leafName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

function entryGlyph(entry: ArchiveVirtualEntry): string {
  if (entry.kind === "folder") return "▱";
  if (entry.kind === "archive") return "▤";
  return "▧";
}

export function ArchiveExplorerDialog({
  archiveRelativePath,
  onOpenPage,
  onClose,
}: ArchiveExplorerDialogProps) {
  const generation = useRef(0);
  const treeScroll = useRef<HTMLDivElement>(null);
  const listScroll = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<ArchiveVirtualTreeSnapshot | null>(null);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => new Set([ROOT_KEY]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestGeneration = ++generation.current;
    setSnapshot(null);
    setSelectedContainerId(null);
    setExpanded(new Set([ROOT_KEY]));
    setLoading(true);
    setError(null);
    void listArchiveVirtualTree(archiveRelativePath, requestGeneration)
      .then((response) => {
        if (requestGeneration !== generation.current) return;
        if (response.status === "ok") setSnapshot(response.data);
        else if (response.status === "error") setError(presentError(response.error));
      })
      .catch(() => {
        if (requestGeneration === generation.current) setError("書庫階層を読み込めませんでした。");
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
    for (const siblings of result.values()) {
      siblings.sort((left, right) => left.sortOrder - right.sortOrder);
    }
    return result;
  }, [snapshot]);

  const containers = useMemo(() => {
    const rows: ContainerRow[] = [{
      id: null,
      parentId: null,
      name: leafName(archiveRelativePath),
      kind: "root",
      depth: 0,
      hasChildren: (children.get(null)?.length ?? 0) > 0,
    }];
    const append = (parentId: string | null, depth: number) => {
      for (const entry of children.get(parentId) ?? []) {
        if (entry.kind === "image") continue;
        rows.push({
          id: entry.id,
          parentId: entry.parentId,
          name: entry.name,
          kind: entry.kind,
          depth,
          hasChildren: entry.hasChildren,
        });
        if (expanded.has(entry.id)) append(entry.id, depth + 1);
      }
    };
    if (expanded.has(ROOT_KEY)) append(null, 1);
    return rows;
  }, [archiveRelativePath, children, expanded]);

  const directChildren = children.get(selectedContainerId) ?? [];
  const selectedContainer = selectedContainerId === null
    ? null
    : snapshot?.entries.find((entry) => entry.id === selectedContainerId) ?? null;
  const parentId = selectedContainer?.parentId ?? null;

  const treeVirtualizer = useVirtualizer({
    count: containers.length,
    getScrollElement: () => treeScroll.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    initialRect: { width: 280, height: 520 },
    observeElementRect: (instance, callback) => {
      const element = instance.scrollElement;
      if (!element) return undefined;
      const report = () => callback({
        width: element.clientWidth || 280,
        height: element.clientHeight || 520,
      });
      report();
      if (typeof ResizeObserver === "undefined") return undefined;
      const observer = new ResizeObserver(report);
      observer.observe(element);
      return () => observer.disconnect();
    },
  });
  const listVirtualizer = useVirtualizer({
    count: directChildren.length,
    getScrollElement: () => listScroll.current,
    estimateSize: () => 34,
    overscan: 12,
    initialRect: { width: 520, height: 520 },
    observeElementRect: (instance, callback) => {
      const element = instance.scrollElement;
      if (!element) return undefined;
      const report = () => callback({
        width: element.clientWidth || 520,
        height: element.clientHeight || 520,
      });
      report();
      if (typeof ResizeObserver === "undefined") return undefined;
      const observer = new ResizeObserver(report);
      observer.observe(element);
      return () => observer.disconnect();
    },
  });

  function selectContainer(id: string | null, hasChildren: boolean) {
    setSelectedContainerId(id);
    const key = id ?? ROOT_KEY;
    if (hasChildren) setExpanded((current) => new Set(current).add(key));
  }

  return (
    <div className="dialog-backdrop">
      <section className="archive-explorer-dialog" role="dialog" aria-modal="true" aria-label="書庫エクスプローラー">
        <header className="quick-access-heading">
          <div>
            <h2>書庫エクスプローラー</h2>
            <p title={archiveRelativePath}>{archiveRelativePath}</p>
          </div>
          <button type="button" onClick={onClose}>閉じる</button>
        </header>
        {loading && <p role="status">書庫階層を検査しています…</p>}
        {error !== null && <p role="alert">{error}</p>}
        {!loading && error === null && snapshot !== null && (
          <div className="archive-explorer-layout">
            <section aria-label="書庫ツリー" className="archive-tree-pane">
              <h3>階層</h3>
              <div className="archive-virtual-scroll" ref={treeScroll}>
                <div role="tree" style={{ height: treeVirtualizer.getTotalSize(), position: "relative" }}>
                  {treeVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = containers[virtualRow.index];
                    const key = row.id ?? ROOT_KEY;
                    const isExpanded = expanded.has(key) && row.hasChildren;
                    return (
                      <div className="archive-tree-row" key={key} style={{
                        transform: `translateY(${virtualRow.start}px)`,
                        paddingInlineStart: `${row.depth * 16}px`,
                      }}>
                        <button
                          type="button"
                          className="tree-expander"
                          aria-label={`${row.name}を${isExpanded ? "折りたたむ" : "展開する"}`}
                          aria-expanded={isExpanded}
                          disabled={!row.hasChildren}
                          onClick={() => setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(key)) next.delete(key); else next.add(key);
                            return next;
                          })}
                        >{isExpanded ? "▾" : "▸"}</button>
                        <button
                          type="button"
                          role="treeitem"
                          aria-level={row.depth + 1}
                          aria-selected={selectedContainerId === row.id}
                          onClick={() => selectContainer(row.id, row.hasChildren)}
                        >
                          <span aria-hidden="true">{row.kind === "folder" ? "▱" : "▤"}</span> {row.name}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
            <section aria-label="書庫内一覧" className="archive-list-pane">
              <header>
                <button
                  type="button"
                  disabled={selectedContainerId === null}
                  onClick={() => setSelectedContainerId(parentId)}
                >親へ</button>
                <h3>{selectedContainer?.name ?? leafName(archiveRelativePath)}</h3>
                <span>{directChildren.length}項目</span>
              </header>
              <div className="archive-virtual-scroll" ref={listScroll}>
                <div role="list" style={{ height: listVirtualizer.getTotalSize(), position: "relative" }}>
                  {listVirtualizer.getVirtualItems().map((virtualRow) => {
                    const entry = directChildren[virtualRow.index];
                    return (
                      <div className="archive-list-row" role="listitem" key={entry.id} style={{
                        transform: `translateY(${virtualRow.start}px)`,
                      }}>
                        <button type="button" onClick={() => {
                          if (entry.kind === "image") return;
                          selectContainer(entry.id, entry.hasChildren);
                        }}>
                          <span aria-hidden="true">{entryGlyph(entry)}</span> {entry.name}
                        </button>
                        {entry.kind === "image" && entry.pageKey !== null && (
                          <button type="button" aria-label={`${entry.name}を開く`} onClick={() => void onOpenPage(entry.pageKey!)}>開く</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
