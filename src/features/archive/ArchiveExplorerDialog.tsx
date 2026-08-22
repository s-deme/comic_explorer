import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CatalogEntry, RelativePath } from "../../types/domain";
import { CatalogGrid } from "../catalog/CatalogGrid";
import type { CatalogThumbnailSizes, CatalogViewMode } from "../catalog/view-mode";
import {
  getArchiveThumbnail,
  listArchiveVirtualTree,
  type ArchiveVirtualEntry,
  type ArchiveVirtualTreeSnapshot,
} from "../library/client";
import type { ThumbnailViewState } from "../catalog/CatalogGrid";
import { presentError } from "../errors/presentation";
import type { CatalogPalette, DetailGridLineMode, DetailRowDensity } from "../settings/profile";

interface ArchiveExplorerPaneProps {
  archiveRelativePath: string;
  onOpenPage: (pageKey: string) => void | Promise<void>;
  onClose: () => void;
  viewMode: CatalogViewMode;
  thumbnailSizes: CatalogThumbnailSizes;
  palette: CatalogPalette;
  detailGridLines: DetailGridLineMode;
  detailRowDensity: DetailRowDensity;
  detailShowKind: boolean;
  detailShowSize: boolean;
  detailShowModified: boolean;
  requestGeneration: number;
}

function leafName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

export function ArchiveExplorerPane({
  archiveRelativePath,
  onOpenPage,
  onClose,
  viewMode,
  thumbnailSizes,
  palette,
  detailGridLines,
  detailRowDensity,
  detailShowKind,
  detailShowSize,
  detailShowModified,
  requestGeneration,
}: ArchiveExplorerPaneProps) {
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<ArchiveVirtualTreeSnapshot | null>(null);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, ThumbnailViewState>>({});
  const thumbnailRequests = useRef(new Map<string, number>());
  const thumbnailRequestSequence = useRef(0);
  const requestGenerationRef = useRef(requestGeneration);
  requestGenerationRef.current = requestGeneration;

  useEffect(() => {
    const requestGeneration = ++generation.current;
    setSnapshot(null);
    setSelectedContainerId(null);
    setSelectedEntryId(null);
    setLoading(true);
    setError(null);
    setThumbnails({});
    thumbnailRequests.current.clear();
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

  useEffect(() => {
    setThumbnails({});
    thumbnailRequests.current.clear();
  }, [requestGeneration]);

  const queueThumbnail = useCallback((entry: CatalogEntry) => {
    const virtualEntry = snapshot?.entries.find((candidate) => candidate.id === entry.relativePath);
    if (virtualEntry?.kind !== "image" || virtualEntry.pageKey === null) return;
    if (thumbnailRequests.current.has(virtualEntry.id)) return;
    const requestToken = ++thumbnailRequestSequence.current;
    thumbnailRequests.current.set(virtualEntry.id, requestToken);
    const requestEpoch = generation.current;
    setThumbnails((current) => ({
      ...current,
      [virtualEntry.id]: { status: "loading" },
    }));
    void getArchiveThumbnail(
      archiveRelativePath,
      virtualEntry.pageKey,
      requestGeneration,
      "visible",
    )
      .then((response) => {
        if (
          requestEpoch !== generation.current
          || requestGeneration !== requestGenerationRef.current
        ) return;
        setThumbnails((current) => ({
          ...current,
          [virtualEntry.id]: response.status === "ok"
            ? {
                status: "ready",
                mediaUri: response.data.mediaUri,
                cacheHit: response.data.cacheHit,
              }
            : { status: "error" },
        }));
      })
      .catch(() => {
        if (
          requestEpoch === generation.current
          && requestGeneration === requestGenerationRef.current
        ) {
          setThumbnails((current) => ({
            ...current,
            [virtualEntry.id]: { status: "error" },
          }));
        }
      })
      .finally(() => {
        if (thumbnailRequests.current.get(virtualEntry.id) === requestToken) {
          thumbnailRequests.current.delete(virtualEntry.id);
        }
      });
  }, [archiveRelativePath, requestGeneration, snapshot]);

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
  const entriesById = useMemo(
    () => new Map(directChildren.map((entry) => [entry.id, entry])),
    [directChildren],
  );
  const catalogEntries = useMemo<CatalogEntry[]>(() => directChildren.map((entry) => ({
    relativePath: entry.id as RelativePath,
    kind: entry.kind === "image" ? "page" : entry.kind,
  })), [directChildren]);

  function activateEntry(entry: CatalogEntry) {
    const virtualEntry = entriesById.get(entry.relativePath);
    if (virtualEntry === undefined) return;
    if (virtualEntry.kind === "image" && virtualEntry.pageKey !== null) {
      void onOpenPage(virtualEntry.pageKey);
      return;
    }
    setSelectedContainerId(virtualEntry.id);
    setSelectedEntryId(null);
  }

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
          <button type="button" disabled={selectedContainerId === null} onClick={() => {
            setSelectedContainerId(selectedContainer?.parentId ?? null);
            setSelectedEntryId(null);
          }}>親へ</button>
          <button type="button" onClick={onClose}>フォルダー一覧へ戻る</button>
        </div>
      </header>
      {loading && <p className="catalog-state" role="status">書庫の内容を読み込んでいます…</p>}
      {error !== null && <div className="catalog-state" role="alert"><p>{error}</p></div>}
      {!loading && error === null && snapshot !== null && (
        <div className="archive-pane-body">
          <p className="archive-pane-summary">{directChildren.length}項目</p>
          <CatalogGrid
            entries={catalogEntries}
            currentFolderPath={selectedContainerId ?? "@archive-root"}
            loadedFolderPath={selectedContainerId ?? "@archive-root"}
            selectedPath={selectedEntryId}
            viewMode={viewMode}
            thumbnailSizes={thumbnailSizes}
            palette={palette}
            detailGridLines={detailGridLines}
            detailRowDensity={detailRowDensity}
            detailShowKind={detailShowKind}
            detailShowSize={detailShowSize}
            detailShowModified={detailShowModified}
            displayNameFor={(entry) => entriesById.get(entry.relativePath)?.name ?? entry.relativePath}
            readOnly
            singleClickActivate
            thumbnailFor={(entry) => thumbnails[entry.relativePath] ?? (
              entriesById.get(entry.relativePath)?.kind === "image"
                ? { status: "loading" }
                : { status: "error" }
            )}
            onThumbnailNeeded={queueThumbnail}
            onSelect={(entry) => setSelectedEntryId(entry.relativePath)}
            onNavigate={activateEntry}
            onRead={activateEntry}
            onActivate={activateEntry}
          />
        </div>
      )}
    </section>
  );
}
