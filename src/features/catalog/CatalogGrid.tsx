import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CatalogEntry } from "../../types/domain";
import { itemKindLabel } from "./kind-label";
import type { CatalogViewMode } from "./view-mode";

interface CatalogGridProps {
  entries: CatalogEntry[];
  selectedPath: string | null;
  selectedPaths?: string[];
  onSelect: (entry: CatalogEntry, action?: "toggle" | "range") => void;
  onNavigate: (entry: CatalogEntry) => void;
  onRead: (entry: CatalogEntry) => void;
  viewMode?: CatalogViewMode;
  thumbnailFor?: (entry: CatalogEntry) => ThumbnailViewState;
  onThumbnailNeeded?: (entry: CatalogEntry) => void;
  isFavorite?: (entry: CatalogEntry) => boolean;
  onToggleFavorite?: (entry: CatalogEntry) => void;
  onContextMenu?: (
    entry: CatalogEntry | null,
    position: { x: number; y: number },
  ) => void;
}

export type ThumbnailViewState =
  | { status: "loading" }
  | { status: "ready"; mediaUri: string; cacheHit: boolean }
  | { status: "error" };

const VIEW_MODE_CONFIG: Record<
  CatalogViewMode,
  { maxColumnCount: number; minColumnWidth: number; rowHeight: number }
> = {
  small_thumbnail: { maxColumnCount: 8, minColumnWidth: 104, rowHeight: 142 },
  detail_list: { maxColumnCount: 1, minColumnWidth: 0, rowHeight: 62 },
  cover_list: { maxColumnCount: 5, minColumnWidth: 150, rowHeight: 288 },
  reference_tile: { maxColumnCount: 6, minColumnWidth: 132, rowHeight: 248 },
};

const CATALOG_HORIZONTAL_PADDING = 24;
const CATALOG_COLUMN_GAP = 10;

export function catalogColumnCountFor(
  viewMode: CatalogViewMode,
  scrollWidth: number | null,
): number {
  const { maxColumnCount, minColumnWidth } = VIEW_MODE_CONFIG[viewMode];
  if (scrollWidth === null || scrollWidth <= 0) return maxColumnCount;
  if (maxColumnCount === 1) return 1;

  const availableWidth = Math.max(0, scrollWidth - CATALOG_HORIZONTAL_PADDING);
  const fittingColumns = Math.floor(
    (availableWidth + CATALOG_COLUMN_GAP) / (minColumnWidth + CATALOG_COLUMN_GAP),
  );
  return Math.max(1, Math.min(maxColumnCount, fittingColumns));
}

function displayName(entry: CatalogEntry): string {
  return entry.relativePath.split("/").at(-1) ?? entry.relativePath;
}

function isPdfEntry(entry: CatalogEntry): boolean {
  return entry.kind === "pdf";
}

function kindLabel(entry: CatalogEntry): string {
  return itemKindLabel(entry.kind, entry.relativePath, entry.archiveKind);
}

function formatSize(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModified(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return "—";
  return new Date(value).toLocaleString("ja-JP");
}

export function CatalogGrid({
  entries,
  selectedPath,
  selectedPaths,
  onSelect,
  onNavigate,
  onRead,
  viewMode = "cover_list",
  thumbnailFor = () => ({ status: "loading" }),
  onThumbnailNeeded = () => undefined,
  isFavorite = () => false,
  onToggleFavorite = () => undefined,
  onContextMenu = () => undefined,
}: CatalogGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const [scrollWidth, setScrollWidth] = useState<number | null>(null);
  const modeConfig = VIEW_MODE_CONFIG[viewMode];
  const columnCount = catalogColumnCountFor(viewMode, scrollWidth);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const reportWidth = () => {
      const nextWidth = element.clientWidth;
      setScrollWidth((current) => current === nextWidth ? current : nextWidth);
    };

    reportWidth();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(reportWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => {
    const output: CatalogEntry[][] = [];
    for (
      let index = 0;
      index < entries.length;
      index += columnCount
    ) {
      output.push(entries.slice(index, index + columnCount));
    }
    return output;
  }, [columnCount, entries]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => modeConfig.rowHeight,
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

  function moveFocus(
    currentIndex: number,
    offset: number,
    action?: "range",
  ) {
    const nextIndex = Math.max(
      0,
      Math.min(entries.length - 1, currentIndex + offset),
    );
    const next = entries[nextIndex];
    if (!next) return;
    if (action === undefined) onSelect(next);
    else onSelect(next, action);
    virtualizer.scrollToIndex(Math.floor(nextIndex / columnCount));
    requestAnimationFrame(() => itemRefs.current.get(next.relativePath)?.focus());
  }

  useEffect(() => {
    if (selectedPath === null) return;
    const index = entries.findIndex(
      (entry) => entry.relativePath === selectedPath,
    );
    if (index >= 0) {
      virtualizer.scrollToIndex(Math.floor(index / columnCount));
      requestAnimationFrame(() => itemRefs.current.get(selectedPath)?.focus());
    }
  }, [columnCount, entries, selectedPath, virtualizer, viewMode]);

  return (
    <div
      ref={scrollRef}
      className={`catalog-scroll catalog-scroll--${viewMode}`}
      role="grid"
      aria-label="現在のフォルダの項目"
      aria-rowcount={rows.length}
      data-catalog-view-mode={viewMode}
      data-catalog-column-count={columnCount}
      data-entry-count={entries.length}
      style={{ "--catalog-column-count": String(columnCount) } as CSSProperties}
      onContextMenu={(event) => {
        if ((event.target as Element).closest("[data-relative-path]") !== null) return;
        event.preventDefault();
        onContextMenu(null, { x: event.clientX, y: event.clientY });
      }}
    >
      {entries.length === 0 ? (
        <p className="empty-state">表示できる項目はありません。</p>
      ) : (
        <>
          {viewMode === "detail_list" && (
            <div className="catalog-list-header" aria-hidden="true">
              <span>名前</span>
              <span>種別</span>
              <span>サイズ</span>
              <span>更新日時</span>
              <span>操作</span>
            </div>
          )}
          <div
            className="virtual-canvas"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                className={`catalog-row catalog-row--${viewMode}`}
                role="row"
                aria-rowindex={virtualRow.index + 1}
                key={virtualRow.key}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {rows[virtualRow.index].map((entry, columnIndex) => {
                  const itemIndex =
                    virtualRow.index * columnCount + columnIndex;
                  const name = displayName(entry);
                  const kind = kindLabel(entry);
                  const size = formatSize(entry.byteSize);
                  const modified = formatModified(entry.modifiedMs);
                  const canNavigate = entry.kind === "folder";
                  const canRead =
                    entry.kind === "comicFolder" || entry.kind === "archive"
                    || entry.kind === "pdf" || entry.kind === "page";
                  const canFavorite =
                    entry.kind === "folder" || entry.kind === "comicFolder"
                    || entry.kind === "archive" || entry.kind === "pdf";
                  const favorite = canFavorite && isFavorite(entry);
                  const hasActions = canFavorite;
                  const thumbnail = (
                    <Thumbnail
                      entry={entry}
                      state={thumbnailFor(entry)}
                      onNeeded={onThumbnailNeeded}
                    />
                  );
                  return (
                    <div
                      role="gridcell"
                      aria-selected={selectedPaths?.includes(entry.relativePath) ?? selectedPath === entry.relativePath}
                      className={`catalog-cell catalog-cell--${viewMode}`}
                      data-has-actions={hasActions}
                      key={entry.relativePath}
                    >
                      <button
                        ref={(element) => {
                          if (element)
                            itemRefs.current.set(entry.relativePath, element);
                          else itemRefs.current.delete(entry.relativePath);
                        }}
                        className={`catalog-item catalog-item--${viewMode}`}
                        data-selected={selectedPaths?.includes(entry.relativePath) ?? selectedPath === entry.relativePath}
                        data-relative-path={entry.relativePath}
                        data-kind={entry.kind}
                        data-archive-kind={entry.archiveKind ?? "missing"}
                        data-modified-ms={entry.modifiedMs ?? "missing"}
                        data-byte-size={entry.byteSize ?? "missing"}
                        data-view-mode={viewMode}
                        aria-label={`${name}、${kind}、サイズ ${size}、更新日時 ${modified}`}
                        title={`${name} — ${kind}`}
                        tabIndex={
                          selectedPath === entry.relativePath ||
                          (selectedPath === null && itemIndex === 0)
                            ? 0
                            : -1
                        }
                        onClick={(event) => {
                          if (event.shiftKey) onSelect(entry, "range");
                          else if (event.ctrlKey || event.metaKey) onSelect(entry, "toggle");
                          else onSelect(entry);
                        }}
                        onDoubleClick={() =>
                          canNavigate
                            ? onNavigate(entry)
                            : canRead && onRead(entry)
                        }
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onContextMenu(entry, { x: event.clientX, y: event.clientY });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                            event.preventDefault();
                            const bounds = event.currentTarget.getBoundingClientRect();
                            onContextMenu(entry, { x: bounds.left + 24, y: bounds.top + 24 });
                            return;
                          }
                          const offsets: Partial<Record<string, number>> = {
                            ArrowLeft: -1,
                            ArrowRight: 1,
                            ArrowUp: -columnCount,
                            ArrowDown: columnCount,
                            Home: -itemIndex,
                            End: entries.length - 1 - itemIndex,
                          };
                          const offset = offsets[event.key];
                          if (offset !== undefined) {
                            event.preventDefault();
                            moveFocus(
                              itemIndex,
                              offset,
                              event.shiftKey ? "range" : undefined,
                            );
                            return;
                          }
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onSelect(entry);
                            if (event.ctrlKey && canRead) onRead(entry);
                            else if (canNavigate) onNavigate(entry);
                            else if (canRead) onRead(entry);
                          }
                        }}
                      >
                        {viewMode === "detail_list" ? (
                          <>
                            <span className="detail-primary">
                              {thumbnail}
                              <span className="item-name">{name}</span>
                            </span>
                            <span className="item-kind">{kind}</span>
                            <span className="item-metadata item-size">
                              {size}
                            </span>
                            <span className="item-metadata item-modified">
                              {modified}
                            </span>
                          </>
                        ) : (
                          <>
                            {thumbnail}
                            <span className="item-name">{name}</span>
                          </>
                        )}
                      </button>
                      {hasActions && (
                        <div
                          className="catalog-actions"
                          role="group"
                          aria-label={`${name}の操作`}
                        >
                          {canFavorite && (
                            <button
                              type="button"
                              className="favorite-toggle"
                              aria-label={favorite ? "お気に入りから解除" : "お気に入りに追加"}
                              aria-pressed={favorite}
                              data-favorite={favorite}
                              data-product-id="favorite-toggle"
                              onClick={(event) => {
                                event.stopPropagation();
                                onToggleFavorite(entry);
                              }}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              {favorite ? "★" : "☆"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
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
  const eligible = entry.kind === "archive" || entry.kind === "comicFolder" || isPdfEntry(entry);
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
      {entry.kind === "archive" ? "▣" : isPdfEntry(entry) ? "PDF" : "▤"}
    </span>
  );
}
