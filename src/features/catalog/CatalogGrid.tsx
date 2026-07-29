import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import type { CatalogEntry } from "../../types/domain";

interface CatalogGridProps {
  entries: CatalogEntry[];
  selectedPath: string | null;
  onSelect: (entry: CatalogEntry) => void;
  onNavigate: (entry: CatalogEntry) => void;
  onRead: (entry: CatalogEntry) => void;
  thumbnailFor?: (entry: CatalogEntry) => ThumbnailViewState;
  onThumbnailNeeded?: (entry: CatalogEntry) => void;
}

export type ThumbnailViewState =
  | { status: "loading" }
  | { status: "ready"; mediaUri: string; cacheHit: boolean }
  | { status: "error" };

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
  thumbnailFor = () => ({ status: "loading" }),
  onThumbnailNeeded = () => undefined,
}: CatalogGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
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
    initialRect: { width: 900, height: 720 },
    observeElementRect: (instance, callback) => {
      const element = instance.scrollElement;
      if (!element) return undefined;
      const report = () =>
        callback({
          width: element.clientWidth || 900,
          height: element.clientHeight || 720,
        });
      report();
      if (typeof ResizeObserver === "undefined") return undefined;
      const observer = new ResizeObserver(report);
      observer.observe(element);
      return () => observer.disconnect();
    },
  });

  function moveFocus(currentIndex: number, offset: number) {
    const nextIndex = Math.max(
      0,
      Math.min(entries.length - 1, currentIndex + offset),
    );
    const next = entries[nextIndex];
    if (!next) return;
    onSelect(next);
    virtualizer.scrollToIndex(Math.floor(nextIndex / COLUMN_COUNT));
    requestAnimationFrame(() => itemRefs.current.get(next.relativePath)?.focus());
  }

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
              {rows[virtualRow.index].map((entry, columnIndex) => {
                const itemIndex = virtualRow.index * COLUMN_COUNT + columnIndex;
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
                      ref={(element) => {
                        if (element) itemRefs.current.set(entry.relativePath, element);
                        else itemRefs.current.delete(entry.relativePath);
                      }}
                      className="catalog-item"
                      data-selected={selectedPath === entry.relativePath}
                      title={`${name} — ${kindLabel(entry)}`}
                      tabIndex={
                        selectedPath === entry.relativePath ||
                        (selectedPath === null && itemIndex === 0)
                          ? 0
                          : -1
                      }
                      onClick={() => onSelect(entry)}
                      onDoubleClick={() =>
                        canNavigate ? onNavigate(entry) : canRead && onRead(entry)
                      }
                      onKeyDown={(event) => {
                        const offsets: Partial<Record<string, number>> = {
                          ArrowLeft: -1,
                          ArrowRight: 1,
                          ArrowUp: -COLUMN_COUNT,
                          ArrowDown: COLUMN_COUNT,
                          Home: -itemIndex,
                          End: entries.length - 1 - itemIndex,
                        };
                        const offset = offsets[event.key];
                        if (offset !== undefined) {
                          event.preventDefault();
                          moveFocus(itemIndex, offset);
                          return;
                        }
                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (event.ctrlKey && canRead) onRead(entry);
                          else if (canNavigate) onNavigate(entry);
                          else if (canRead) onRead(entry);
                        }
                      }}
                    >
                      <Thumbnail
                        entry={entry}
                        state={thumbnailFor(entry)}
                        onNeeded={onThumbnailNeeded}
                      />
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

function Thumbnail({
  entry,
  state,
  onNeeded,
}: {
  entry: CatalogEntry;
  state: ThumbnailViewState;
  onNeeded: (entry: CatalogEntry) => void;
}) {
  const eligible = entry.kind === "archive" || entry.kind === "comicFolder";
  useEffect(() => {
    if (eligible && state.status === "loading") onNeeded(entry);
  }, [eligible, entry, onNeeded, state.status]);

  if (state.status === "ready") {
    return (
      <span className="thumbnail" aria-hidden="true" data-cache-hit={state.cacheHit}>
        <img src={state.mediaUri} alt="" />
      </span>
    );
  }
  return (
    <span
      className="thumbnail"
      aria-hidden="true"
      data-thumbnail-state={eligible ? state.status : "placeholder"}
    >
      {entry.kind === "archive" ? "▣" : "▤"}
    </span>
  );
}
