import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import type { CatalogEntry } from "../../types/domain";

interface CatalogGridProps {
  entries: CatalogEntry[];
  selectedPath: string | null;
  onSelect: (entry: CatalogEntry) => void;
  onNavigate: (entry: CatalogEntry) => void;
  onRead: (entry: CatalogEntry) => void;
}

const COLUMN_COUNT = 5;

function displayName(entry: CatalogEntry): string {
  return entry.relativePath.split("/").at(-1) ?? entry.relativePath;
}

function kindLabel(entry: CatalogEntry): string {
  switch (entry.kind) {
    case "folder":
      return "フォルダ";
    case "comicFolder":
      return "漫画フォルダ";
    case "archive":
      return "ZIP / CBZ";
    case "page":
      return "画像";
    default:
      return "未対応";
  }
}

export function CatalogGrid({
  entries,
  selectedPath,
  onSelect,
  onNavigate,
  onRead,
}: CatalogGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const output: CatalogEntry[][] = [];
    for (let index = 0; index < entries.length; index += COLUMN_COUNT) {
      output.push(entries.slice(index, index + COLUMN_COUNT));
    }
    return output;
  }, [entries]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 268,
    overscan: 2,
  });

  useEffect(() => {
    if (selectedPath === null) return;
    const index = entries.findIndex(
      (entry) => entry.relativePath === selectedPath,
    );
    if (index >= 0) virtualizer.scrollToIndex(Math.floor(index / COLUMN_COUNT));
  }, [entries, selectedPath, virtualizer]);

  return (
    <div
      ref={scrollRef}
      className="catalog-scroll"
      role="grid"
      aria-label="現在のフォルダの項目"
      aria-rowcount={rows.length}
    >
      {entries.length === 0 ? (
        <p className="empty-state">表示できる項目はありません。</p>
      ) : (
        <div
          className="virtual-canvas"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              className="catalog-row"
              role="row"
              aria-rowindex={virtualRow.index + 1}
              key={virtualRow.key}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {rows[virtualRow.index].map((entry) => {
                const name = displayName(entry);
                const canNavigate =
                  entry.kind === "folder" || entry.kind === "comicFolder";
                const canRead =
                  entry.kind === "comicFolder" || entry.kind === "archive";
                return (
                  <div
                    role="gridcell"
                    aria-selected={selectedPath === entry.relativePath}
                    className="catalog-cell"
                    key={entry.relativePath}
                  >
                    <button
                      className="catalog-item"
                      data-selected={selectedPath === entry.relativePath}
                      title={`${name} — ${kindLabel(entry)}`}
                      onClick={() => onSelect(entry)}
                      onDoubleClick={() =>
                        canNavigate ? onNavigate(entry) : canRead && onRead(entry)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (event.ctrlKey && canRead) onRead(entry);
                          else if (canNavigate) onNavigate(entry);
                          else if (canRead) onRead(entry);
                        }
                      }}
                    >
                      <span className="thumbnail" aria-hidden="true">
                        {entry.kind === "archive" ? "▣" : "▤"}
                      </span>
                      <span className="item-name">{name}</span>
                      <span className="item-kind">{kindLabel(entry)}</span>
                    </button>
                    {entry.kind === "comicFolder" && (
                      <button
                        className="read-action"
                        onClick={() => onRead(entry)}
                        aria-label={`${name}を読む`}
                      >
                        読む
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
