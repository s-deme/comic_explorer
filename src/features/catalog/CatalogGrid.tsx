import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { CatalogEntry } from "../../types/domain";
import { itemKindLabel } from "./kind-label";
import {
  DEFAULT_CATALOG_THUMBNAIL_SIZES,
  DETAIL_ROW_HEIGHTS,
  type CatalogThumbnailSizes,
  type CatalogViewMode,
} from "./view-mode";
import type { DetailGridLineMode, DetailRowDensity } from "../settings/profile";
import {
  DEFAULT_CATALOG_MOUSE_BINDINGS,
  type CatalogMouseAction,
  type CatalogMouseBindings,
} from "../input/catalog-mouse";

interface CatalogGridProps {
  entries: CatalogEntry[];
  currentFolderPath?: string;
  loadedFolderPath?: string | null;
  selectedPath: string | null;
  selectedPaths?: string[];
  onSelect: (entry: CatalogEntry, action?: "toggle" | "range") => void;
  onNavigate: (entry: CatalogEntry) => void;
  onRead: (entry: CatalogEntry) => void;
  onActivate?: (
    entry: CatalogEntry,
    trigger: "doubleClick" | "enter" | "ctrlEnter",
  ) => void;
  mouseBindings?: CatalogMouseBindings;
  onMouseAction?: (action: CatalogMouseAction, entry: CatalogEntry) => void;
  viewMode?: CatalogViewMode;
  thumbnailSizes?: CatalogThumbnailSizes;
  detailGridLines?: DetailGridLineMode;
  detailRowDensity?: DetailRowDensity;
  detailShowKind?: boolean;
  detailShowSize?: boolean;
  detailShowModified?: boolean;
  displayNameFor?: (entry: CatalogEntry) => string;
  readOnly?: boolean;
  singleClickActivate?: boolean;
  thumbnailFor?: (entry: CatalogEntry) => ThumbnailViewState;
  onThumbnailNeeded?: (entry: CatalogEntry) => void;
  isFavorite?: (entry: CatalogEntry) => boolean;
  onToggleFavorite?: (entry: CatalogEntry) => void;
  onContextMenu?: (
    entry: CatalogEntry | null,
    position: { x: number; y: number },
  ) => void;
  onFileDragStart?: (paths: string[]) => void;
  onNativeFileDragStart?: (paths: string[]) => void;
  onFileDragEnd?: () => void;
  canDropFiles?: boolean;
  onTransferItems?: (
    destinationRelativePath: string,
    operation: "copy" | "move",
  ) => void;
}

export type ThumbnailViewState =
  | { status: "loading" }
  | { status: "ready"; mediaUri: string; cacheHit: boolean }
  | { status: "error" };

const VIEW_MODE_CONFIG: Record<
  CatalogViewMode,
  {
    rowGap: number;
    columnGap: number;
  }
> = {
  detail_list: { rowGap: 0, columnGap: 10 },
  small_thumbnail: { rowGap: 10, columnGap: 10 },
  cover_list: { rowGap: 10, columnGap: 10 },
  card_grid: { rowGap: 4, columnGap: 4 },
  reference_tile: { rowGap: 10, columnGap: 10 },
};

const CATALOG_HORIZONTAL_PADDING = 24;

interface CatalogLayout {
  thumbnailWidth: number;
  thumbnailHeight: number;
  cardWidth: number;
  rowHeight: number;
}

export function catalogLayoutFor(
  viewMode: CatalogViewMode,
  thumbnailSizes: CatalogThumbnailSizes = DEFAULT_CATALOG_THUMBNAIL_SIZES,
  detailRowDensity: DetailRowDensity = "standard",
): CatalogLayout {
  if (viewMode === "detail_list") {
    const detail = DETAIL_ROW_HEIGHTS[detailRowDensity];
    return {
      thumbnailWidth: detail.thumbnailWidth,
      thumbnailHeight: detail.thumbnailHeight,
      cardWidth: 0,
      rowHeight: detail.virtual,
    };
  }
  if (viewMode === "small_thumbnail") {
    return {
      thumbnailWidth: thumbnailSizes.smallThumbnail,
      thumbnailHeight: thumbnailSizes.smallThumbnail,
      cardWidth: thumbnailSizes.smallThumbnail + 10,
      rowHeight: thumbnailSizes.smallThumbnail + 52,
    };
  }
  const thumbnailWidth = viewMode === "cover_list"
    ? thumbnailSizes.coverList
    : viewMode === "card_grid"
      ? thumbnailSizes.cardGrid
      : thumbnailSizes.referenceTile;
  const thumbnailHeight = Math.round(thumbnailWidth * 1.5);
  if (viewMode === "reference_tile") {
    const informationWidth = Math.max(
      144,
      Math.round(thumbnailWidth * 0.75),
    );
    return {
      thumbnailWidth,
      thumbnailHeight,
      cardWidth: thumbnailWidth + informationWidth + 34,
      rowHeight: Math.max(thumbnailHeight + 22, 154),
    };
  }
  if (viewMode === "card_grid") {
    return {
      thumbnailWidth,
      thumbnailHeight,
      cardWidth: thumbnailWidth,
      rowHeight: thumbnailHeight,
    };
  }
  return {
    thumbnailWidth,
    thumbnailHeight,
    cardWidth: thumbnailWidth + 16,
    rowHeight: thumbnailHeight + 58,
  };
}

export function catalogColumnCountFor(
  viewMode: CatalogViewMode,
  scrollWidth: number | null,
  thumbnailSizes: CatalogThumbnailSizes = DEFAULT_CATALOG_THUMBNAIL_SIZES,
): number {
  if (viewMode === "detail_list") return 1;
  const { cardWidth } = catalogLayoutFor(viewMode, thumbnailSizes);
  const { columnGap } = VIEW_MODE_CONFIG[viewMode];
  const measuredWidth = scrollWidth === null || scrollWidth <= 0 ? 900 : scrollWidth;

  const availableWidth = Math.max(0, measuredWidth - CATALOG_HORIZONTAL_PADDING);
  const fittingColumns = Math.floor(
    (availableWidth + columnGap) / (cardWidth + columnGap),
  );
  return Math.max(1, fittingColumns);
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

function isAncestorFolder(ancestor: string, descendant: string): boolean {
  if (ancestor === descendant) return false;
  if (ancestor === "") return descendant.length > 0;
  return descendant.startsWith(`${ancestor}/`);
}

export function CatalogGrid({
  entries,
  currentFolderPath = "",
  loadedFolderPath = currentFolderPath,
  selectedPath,
  selectedPaths,
  onSelect,
  onNavigate,
  onRead,
  onActivate,
  mouseBindings = DEFAULT_CATALOG_MOUSE_BINDINGS,
  onMouseAction,
  viewMode = "cover_list",
  thumbnailSizes = DEFAULT_CATALOG_THUMBNAIL_SIZES,
  detailGridLines = "none",
  detailRowDensity = "standard",
  detailShowKind = true,
  detailShowSize = true,
  detailShowModified = true,
  displayNameFor = displayName,
  readOnly = false,
  singleClickActivate = false,
  thumbnailFor = () => ({ status: "loading" }),
  onThumbnailNeeded = () => undefined,
  isFavorite = () => false,
  onToggleFavorite = () => undefined,
  onContextMenu = () => undefined,
  onFileDragStart = () => undefined,
  onNativeFileDragStart = () => undefined,
  onFileDragEnd = () => undefined,
  canDropFiles = false,
  onTransferItems = () => undefined,
}: CatalogGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const folderScrollPositions = useRef(new Map<string, number>());
  const previousFolderPath = useRef(currentFolderPath);
  const pendingScrollRestoration = useRef<{ path: string; scrollTop: number } | null>(null);
  const suppressSelectionScroll = useRef(false);
  const incrementalSearch = useRef({ value: "", updatedAt: 0 });
  const primaryActionTimer = useRef<number | null>(null);
  const [scrollWidth, setScrollWidth] = useState<number | null>(null);
  const modeConfig = VIEW_MODE_CONFIG[viewMode];
  const layout = catalogLayoutFor(viewMode, thumbnailSizes, detailRowDensity);
  const columnCount = catalogColumnCountFor(viewMode, scrollWidth, thumbnailSizes);
  const detailColumns = [
    "minmax(0, 2fr)",
    ...(detailShowKind ? ["120px"] : []),
    ...(detailShowSize ? ["140px"] : []),
    ...(detailShowModified ? ["180px"] : []),
  ].join(" ");
  const detailMediumColumns = [
    "minmax(0, 2fr)",
    ...(detailShowKind ? ["minmax(96px, 1fr)"] : []),
    ...(detailShowSize ? ["minmax(76px, .7fr)"] : []),
  ].join(" ");

  useEffect(() => {
    incrementalSearch.current = { value: "", updatedAt: 0 };
    if (primaryActionTimer.current !== null) {
      window.clearTimeout(primaryActionTimer.current);
      primaryActionTimer.current = null;
    }
  }, [currentFolderPath]);

  useEffect(() => () => {
    if (primaryActionTimer.current !== null) {
      window.clearTimeout(primaryActionTimer.current);
    }
  }, []);

  function clearPrimaryAction() {
    if (primaryActionTimer.current === null) return;
    window.clearTimeout(primaryActionTimer.current);
    primaryActionTimer.current = null;
  }

  function dispatchMouseAction(
    action: CatalogMouseAction,
    entry: CatalogEntry,
    trigger: "enter" | "doubleClick" = "enter",
  ) {
    if (action === "none" || action === "selectOnly") return;
    if (action === "openSelected" && onActivate !== undefined) {
      onActivate(entry, trigger);
      return;
    }
    if (onMouseAction !== undefined) {
      onMouseAction(action, entry);
      return;
    }
    if (action === "openSelected") {
      if (onActivate !== undefined) onActivate(entry, trigger);
      else if (entry.kind === "folder" || entry.kind === "comicFolder") onNavigate(entry);
      else if (entry.kind === "archive" || entry.kind === "pdf" || entry.kind === "page") {
        onRead(entry);
      }
    }
  }

  function schedulePrimaryAction(entry: CatalogEntry) {
    clearPrimaryAction();
    const action = mouseBindings.primaryClick;
    if (action === "none" || action === "selectOnly") return;
    primaryActionTimer.current = window.setTimeout(() => {
      primaryActionTimer.current = null;
      dispatchMouseAction(action, entry);
    }, 250);
  }

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
    estimateSize: () => layout.rowHeight,
    gap: modeConfig.rowGap,
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

  useLayoutEffect(() => {
    if (viewMode === "detail_list") virtualizer.measure();
  }, [detailRowDensity, virtualizer, viewMode]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const previous = previousFolderPath.current;
    if (!element || previous === currentFolderPath) return;

    folderScrollPositions.current.set(previous, element.scrollTop);
    const movingToAncestor = isAncestorFolder(currentFolderPath, previous);
    suppressSelectionScroll.current = movingToAncestor;
    pendingScrollRestoration.current = {
      path: currentFolderPath,
      scrollTop: movingToAncestor
        ? folderScrollPositions.current.get(currentFolderPath) ?? 0
        : 0,
    };
    previousFolderPath.current = currentFolderPath;

    if (!movingToAncestor) element.scrollTop = 0;
  }, [currentFolderPath]);

  useLayoutEffect(() => {
    const pending = pendingScrollRestoration.current;
    const element = scrollRef.current;
    if (
      !element
      || pending === null
      || pending.path !== currentFolderPath
      || loadedFolderPath !== currentFolderPath
    ) return;

    element.scrollTop = pending.scrollTop;
    pendingScrollRestoration.current = null;
    requestAnimationFrame(() => { suppressSelectionScroll.current = false; });
  }, [currentFolderPath, entries, loadedFolderPath]);

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
    if (selectedPath === null || suppressSelectionScroll.current) return;
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
      data-native-drop-path={readOnly ? undefined : currentFolderPath}
      data-detail-grid-lines={detailGridLines}
      data-detail-row-density={detailRowDensity}
      data-detail-columns={[
        "name",
        ...(detailShowKind ? ["kind"] : []),
        ...(detailShowSize ? ["size"] : []),
        ...(detailShowModified ? ["modified"] : []),
      ].join(" ")}
      style={{
        "--catalog-column-count": String(columnCount),
        "--catalog-column-gap": `${modeConfig.columnGap}px`,
        "--catalog-card-width": `${layout.cardWidth}px`,
        "--catalog-thumbnail-width": `${layout.thumbnailWidth}px`,
        "--catalog-thumbnail-height": `${layout.thumbnailHeight}px`,
        "--detail-item-height": `${DETAIL_ROW_HEIGHTS[detailRowDensity].item}px`,
        "--detail-columns": detailColumns,
        "--detail-columns-medium": detailMediumColumns,
        "--detail-header-columns": `32px ${detailColumns}`,
        "--detail-header-columns-medium": `32px ${detailMediumColumns}`,
      } as CSSProperties}
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
              <span className="catalog-favorite-column" />
              <span className="detail-column-name">名前</span>
              {detailShowKind && <span className="detail-column-kind">種別</span>}
              {detailShowSize && <span className="detail-column-size">サイズ</span>}
              {detailShowModified && <span className="detail-column-modified">更新日時</span>}
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
                style={{
                  height: layout.rowHeight,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {rows[virtualRow.index].map((entry, columnIndex) => {
                  const itemIndex =
                    virtualRow.index * columnCount + columnIndex;
                  const name = displayNameFor(entry);
                  const kind = kindLabel(entry);
                  const size = formatSize(entry.byteSize);
                  const modified = formatModified(entry.modifiedMs);
                  const canNavigate =
                    entry.kind === "folder" || entry.kind === "comicFolder";
                  const canRead =
                    entry.kind === "archive" || entry.kind === "pdf"
                    || entry.kind === "page";
                  const canFavorite = !readOnly && (
                    entry.kind === "folder" || entry.kind === "comicFolder"
                    || entry.kind === "archive" || entry.kind === "pdf"
                  );
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
                        data-native-drop-path={!readOnly && canNavigate ? entry.relativePath : undefined}
                        aria-label={`${name}、${kind}、サイズ ${size}、更新日時 ${modified}`}
                        title={`${name} — ${kind}`}
                        draggable={!readOnly}
                        tabIndex={
                          selectedPath === entry.relativePath ||
                          (selectedPath === null && itemIndex === 0)
                            ? 0
                            : -1
                        }
                        onClick={(event) => {
                          if (event.shiftKey) onSelect(entry, "range");
                          else if (event.ctrlKey || event.metaKey) onSelect(entry, "toggle");
                          else {
                            onSelect(entry);
                            if (singleClickActivate && event.detail <= 1) {
                              dispatchMouseAction("openSelected", entry);
                            } else if (event.detail === 1) schedulePrimaryAction(entry);
                          }
                        }}
                        onDoubleClick={(event) => {
                          clearPrimaryAction();
                          if (singleClickActivate) return;
                          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                          dispatchMouseAction(mouseBindings.doubleClick, entry, "doubleClick");
                        }}
                        onMouseDown={(event) => {
                          if ([1, 3, 4].includes(event.button)) event.preventDefault();
                        }}
                        onAuxClick={(event) => {
                          const action = event.button === 1
                            ? mouseBindings.middleClick
                            : event.button === 3
                              ? mouseBindings.backButton
                              : event.button === 4 ? mouseBindings.forwardButton : null;
                          if (action === null) return;
                          event.preventDefault();
                          event.stopPropagation();
                          clearPrimaryAction();
                          onSelect(entry);
                          dispatchMouseAction(action, entry);
                        }}
                        onDragStart={(event) => {
                          clearPrimaryAction();
                          const paths = selectedPaths?.includes(entry.relativePath)
                            ? selectedPaths
                            : [entry.relativePath];
                          if (!selectedPaths?.includes(entry.relativePath)) onSelect(entry);
                          if (event.altKey) {
                            event.preventDefault();
                            onNativeFileDragStart(paths);
                            return;
                          }
                          event.dataTransfer.effectAllowed = "copyMove";
                          event.dataTransfer.setData("text/plain", paths.join("\n"));
                          onFileDragStart(paths);
                        }}
                        onDragEnd={() => onFileDragEnd()}
                        onDragEnter={(event) => {
                          if (canNavigate && canDropFiles) {
                            event.currentTarget.dataset.fileDropActive = "true";
                          }
                        }}
                        onDragLeave={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            delete event.currentTarget.dataset.fileDropActive;
                          }
                        }}
                        onDragOver={(event) => {
                          if (!canNavigate || !canDropFiles) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = event.ctrlKey ? "copy" : "move";
                        }}
                        onDrop={(event) => {
                          delete event.currentTarget.dataset.fileDropActive;
                          if (!canNavigate || !canDropFiles) return;
                          event.preventDefault();
                          event.stopPropagation();
                          onTransferItems(
                            entry.relativePath,
                            event.ctrlKey || event.dataTransfer.dropEffect === "copy"
                              ? "copy"
                              : "move",
                          );
                        }}
                        onContextMenu={(event) => {
                          clearPrimaryAction();
                          event.preventDefault();
                          event.stopPropagation();
                          if (readOnly) return;
                          onContextMenu(entry, { x: event.clientX, y: event.clientY });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                            event.preventDefault();
                            if (readOnly) return;
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
                          if (
                            !event.nativeEvent.isComposing
                            && !event.ctrlKey
                            && !event.metaKey
                            && !event.altKey
                            && event.key.length === 1
                            && event.key.trim() !== ""
                          ) {
                            const now = Date.now();
                            const key = event.key.normalize("NFKC").toLocaleLowerCase("ja");
                            const previous = now - incrementalSearch.current.updatedAt <= 1_000
                              ? incrementalSearch.current.value
                              : "";
                            const query = previous.length === 1 && previous === key
                              ? key
                              : `${previous}${key}`;
                            incrementalSearch.current = { value: query, updatedAt: now };
                            const match = Array.from({ length: entries.length }, (_, offsetIndex) =>
                              (itemIndex + 1 + offsetIndex) % entries.length)
                              .find((candidateIndex) => displayNameFor(entries[candidateIndex])
                                .normalize("NFKC")
                                .toLocaleLowerCase("ja")
                                .startsWith(query));
                            if (match !== undefined) {
                              event.preventDefault();
                              const next = entries[match];
                              onSelect(next);
                              virtualizer.scrollToIndex(Math.floor(match / columnCount));
                              requestAnimationFrame(() => itemRefs.current.get(next.relativePath)?.focus());
                            }
                            return;
                          }
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onSelect(entry);
                            if (onActivate !== undefined) {
                              onActivate(entry, event.ctrlKey ? "ctrlEnter" : "enter");
                            } else if (event.ctrlKey && canRead) onRead(entry);
                            else if (canNavigate) onNavigate(entry);
                            else if (canRead) onRead(entry);
                          }
                        }}
                      >
                        {viewMode === "detail_list" ? (
                          <>
                            <span className="detail-primary">
                              {thumbnail}
                              <ItemName entry={entry} name={name} />
                            </span>
                            {detailShowKind && <span className="item-kind detail-column-kind">{kind}</span>}
                            {detailShowSize && <span className="item-metadata item-size detail-column-size">
                              {size}
                            </span>}
                            {detailShowModified && <span className="item-metadata item-modified detail-column-modified">
                              {modified}
                            </span>}
                          </>
                        ) : viewMode === "reference_tile" ? (
                          <>
                            {thumbnail}
                            <span className="reference-tile-info">
                              <ItemName entry={entry} name={name} />
                              <span className="reference-tile-kind">{kind}</span>
                              <span className="reference-tile-metadata">
                                <span className="item-metadata item-size">{size}</span>
                                <span className="item-metadata item-modified">{modified}</span>
                              </span>
                            </span>
                          </>
                        ) : viewMode === "card_grid" ? (
                          thumbnail
                        ) : (
                          <>
                            {thumbnail}
                            <ItemName entry={entry} name={name} />
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

function ItemName({ entry, name }: { entry: CatalogEntry; name: string }) {
  return (
    <span className="item-name">
      <ItemKindIcon entry={entry} />
      <span className="item-name__text">{name}</span>
    </span>
  );
}

function ItemKindIcon({ entry }: { entry: CatalogEntry }) {
  if (entry.kind === "page") {
    return (
      <svg
        className="item-kind-icon item-kind-icon--image"
        data-item-kind-icon="image"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <rect className="item-kind-icon__image-frame" x="1.5" y="2.5" width="13" height="11" rx="1.25" />
        <circle className="item-kind-icon__image-sun" cx="11.25" cy="5.75" r="1.25" />
        <path className="item-kind-icon__image-landscape" d="m3.25 11 2.9-3 2.05 2 1.45-1.45L12.8 11.5H3.25z" />
      </svg>
    );
  }
  if (entry.kind === "folder" || entry.kind === "comicFolder") {
    return (
      <svg
        className="item-kind-icon item-kind-icon--folder"
        data-item-kind-icon="folder"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path className="item-kind-icon__folder-back" d="M1.5 4h5l1.5 1.75h6.5v7.75h-13z" />
        <path className="item-kind-icon__folder-front" d="M1.5 6h13l-1 7.5h-12z" />
      </svg>
    );
  }
  if (entry.kind === "archive") {
    return (
      <svg
        className="item-kind-icon item-kind-icon--archive"
        data-item-kind-icon="archive"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path className="item-kind-icon__document" d="M3 1.5h6l4 4v9H3z" />
        <path className="item-kind-icon__fold" d="M9 1.5v4h4" />
        <path className="item-kind-icon__archive-zipper" d="M7.5 4.5h2M7.5 7h2M7.5 9.5h2M8.5 4.5v7.5" />
      </svg>
    );
  }
  if (entry.kind === "pdf") {
    return (
      <svg
        className="item-kind-icon item-kind-icon--pdf"
        data-item-kind-icon="pdf"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path className="item-kind-icon__document" d="M3 1.5h6l4 4v9H3z" />
        <path className="item-kind-icon__fold" d="M9 1.5v4h4" />
        <path className="item-kind-icon__pdf-mark" d="M5 11.75V8.5h1.4a1 1 0 0 1 0 2H5m3 1.25V8.5h1a1.6 1.6 0 0 1 0 3.25H8" />
      </svg>
    );
  }
  return (
    <svg
      className="item-kind-icon item-kind-icon--file"
      data-item-kind-icon="file"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path className="item-kind-icon__document" d="M3 1.5h6l4 4v9H3z" />
      <path className="item-kind-icon__fold" d="M9 1.5v4h4" />
      <path className="item-kind-icon__file-lines" d="M5 8h6M5 10.5h6M5 13h4" />
    </svg>
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
  const eligible = entry.kind === "folder" || entry.kind === "comicFolder"
    || entry.kind === "archive" || entry.kind === "page" || isPdfEntry(entry);
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
      {entry.kind === "archive" ? <ArchivePlaceholderIcon />
        : entry.kind === "folder" || entry.kind === "comicFolder" ? <FolderPlaceholderIcon />
          : isPdfEntry(entry) ? "PDF" : "▤"}
    </span>
  );
}

function FolderPlaceholderIcon() {
  return (
    <svg
      className="thumbnail-icon thumbnail-icon--folder"
      data-thumbnail-icon="folder"
      viewBox="0 0 48 40"
    >
      <path className="thumbnail-icon__folder-back" d="M4 9h15l4 5h21v20H4z" />
      <path className="thumbnail-icon__folder-front" d="M4 15h40v19H4z" />
    </svg>
  );
}

function ArchivePlaceholderIcon() {
  return (
    <svg
      className="thumbnail-icon thumbnail-icon--archive"
      data-thumbnail-icon="archive"
      viewBox="0 0 48 40"
    >
      <path className="thumbnail-icon__archive-page" d="M11 3h19l8 8v26H11z" />
      <path className="thumbnail-icon__archive-fold" d="M30 3v8h8" />
      <path className="thumbnail-icon__archive-zipper" d="M24 13v18" />
      <path className="thumbnail-icon__archive-teeth" d="M21 15h6M21 20h6M21 25h6M21 30h6" />
    </svg>
  );
}
