import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listTreeChildren,
  confirmTreeChildren,
  listWindowsDrives,
  type TreeEntry,
  type WindowsDrive,
} from "../library/client";
import type { FileClipboardStatus } from "../library/client";
import { presentError } from "../errors/presentation";
import { normalizeWindowsDisplayPath, windowsDisplayPathKey } from "./navigation";
import {
  TreeContextMenu,
  type TreeFileAction,
  type TreeFileTarget,
} from "./TreeContextMenu";

interface TreeNode {
  key: string;
  path: string;
  name: string;
  depth: number;
  kind: "pc" | "drive" | "folder" | "archive";
  driveRoot?: string;
  driveIdentity?: string;
  hasChildren?: boolean | null;
}

interface FolderTreeProps {
  libraryRoot: string | null;
  currentPath: string;
  hidden?: boolean;
  autoCollapse?: boolean;
  confirmChildren?: boolean;
  onNavigate: (relativePath: string) => void;
  onSelectDrive: (absolutePath: string, relativePath?: string) => unknown | Promise<unknown>;
  clipboard?: FileClipboardStatus;
  fileOperationBusy?: boolean;
  onFileAction?: (action: TreeFileAction, target: TreeFileTarget) => void;
  onRefreshFileClipboard?: () => void;
  refreshToken?: number;
  canDropFiles?: boolean;
  onTransferItems?: (target: TreeFileTarget, operation: "copy" | "move") => void;
  onFileDragStart?: (paths: string[]) => void;
  onNativeFileDragStart?: (paths: string[]) => void;
  onFileDragEnd?: () => void;
  onOpenArchive?: (relativePath: string) => void;
  activeArchivePath?: string | null;
}

interface TreeMenuState {
  target: TreeFileTarget;
  x: number;
  y: number;
}

const TREE_ROW_HEIGHT = 24;
const TREE_INDENT_WIDTH = 16;

function leafName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function normalizedDrive(path: string | null): string {
  return path === null
    ? ""
    : windowsDisplayPathKey(path);
}

function drivePathKey(drive: string, path: string): string {
  return `${drive}\u0000${path}`;
}

function folderExpansionKey(drive: string, path: string): string {
  return `folder:${drive}:${path}`;
}

function currentFolderAddress(libraryRoot: string | null, currentPath: string): string {
  if (libraryRoot === null) return "PC";
  const root = normalizeWindowsDisplayPath(libraryRoot);
  if (currentPath === "") return root;
  const separator = root.endsWith("\\") ? "" : "\\";
  return `${root}${separator}${currentPath.replaceAll("/", "\\")}`;
}

function TreeIcon({ kind, expanded }: { kind: TreeNode["kind"]; expanded: boolean }) {
  if (kind === "pc") {
    return <svg viewBox="0 0 24 24" focusable="false"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>;
  }
  if (kind === "drive") {
    return <svg viewBox="0 0 24 24" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M6 15h12M17 9h.01" /></svg>;
  }
  if (kind === "archive") {
    return <svg viewBox="0 0 24 24" focusable="false"><path d="M4 6h16v14H4zM3 4h18v3H3z" /><path d="M10 9h4M10 12h4M10 15h4" /></svg>;
  }
  return <svg viewBox="0 0 24 24" focusable="false"><path d={expanded ? "M3 6h7l2 2h9v11H3z" : "M3 7h7l2 2h9v10H3z"} /></svg>;
}

export function FolderTree({
  libraryRoot,
  currentPath,
  hidden = false,
  autoCollapse = false,
  confirmChildren = true,
  onNavigate,
  onSelectDrive,
  clipboard = { available: false, cut: false, items: 0 },
  fileOperationBusy = false,
  onFileAction = () => undefined,
  onRefreshFileClipboard = () => undefined,
  refreshToken = 0,
  canDropFiles = false,
  onTransferItems = () => undefined,
  onFileDragStart = () => undefined,
  onNativeFileDragStart = () => undefined,
  onFileDragEnd = () => undefined,
  onOpenArchive = () => undefined,
  activeArchivePath = null,
}: FolderTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const driveGeneration = useRef(0);
  const [drives, setDrives] = useState<WindowsDrive[]>([]);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => new Set(["pc"]));
  const [children, setChildren] = useState<Map<string, TreeEntry[]>>(() => new Map());
  const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<TreeMenuState | null>(null);
  const [revealRequest, setRevealRequest] = useState(0);
  const activeDrive = normalizedDrive(libraryRoot);
  const requestEpoch = useRef(0);
  const pendingLoads = useRef(new Map<string, number>());
  const confirmationActive = useRef(false);
  const mounted = useRef(true);
  const confirmed = useRef(new Set<string>());
  const [confirmationRevision, setConfirmationRevision] = useState(0);
  const scope = `${activeDrive}\0${refreshToken}\0${confirmChildren}`;
  const requestScope = useRef(scope);
  if (requestScope.current !== scope) {
    requestScope.current = scope;
    requestEpoch.current += 1;
    confirmed.current.clear();
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestEpoch.current += 1; confirmed.current.clear(); };
  }, []);

  async function loadChildren(path: string, driveAtRequest = activeDrive) {
    if (driveAtRequest === "") return;
    const pathKey = drivePathKey(driveAtRequest, path);
    const epoch = requestEpoch.current;
    if (pendingLoads.current.get(pathKey) === epoch) return;
    pendingLoads.current.set(pathKey, epoch);
    setLoading((previous) => new Set(previous).add(pathKey));
    generation.current += 1;
    try {
      const response = await listTreeChildren(path, generation.current);
      if (epoch !== requestEpoch.current) return;
      if (response.status === "ok") {
        setChildren((previous) => new Map(previous).set(pathKey, response.data));
        setErrors((previous) => {
          const next = new Map(previous);
          next.delete(pathKey);
          return next;
        });
      } else if (response.status === "error") {
        setErrors((previous) => new Map(previous).set(pathKey, presentError(response.error)));
      }
    } catch {
      if (epoch === requestEpoch.current) setErrors((previous) => new Map(previous).set(pathKey, "フォルダーを読み込めませんでした。"));
    } finally {
      if (pendingLoads.current.get(pathKey) === epoch) pendingLoads.current.delete(pathKey);
      if (epoch === requestEpoch.current) setLoading((previous) => {
        const next = new Set(previous); next.delete(pathKey); return next;
      });
    }
  }

  useEffect(() => {
    driveGeneration.current += 1;
    const requestGeneration = driveGeneration.current;
    void listWindowsDrives(requestGeneration).then((response) => {
      if (requestGeneration !== driveGeneration.current) return;
      if (response.status === "ok") {
        setDrives(response.data);
        setDriveError(null);
      } else if (response.status === "error") {
        setDriveError(presentError(response.error));
      }
    }).catch(() => setDriveError("ドライブ一覧を取得できませんでした。"));
  }, []);

  useEffect(() => {
    generation.current += 1;
    setLoading(new Set());
    if (libraryRoot !== null) {
      setExpanded((previous) => new Set([...previous, `drive:${activeDrive}`]));
      if (!children.has(drivePathKey(activeDrive, ""))) void loadChildren("");
    }
  }, [activeDrive]);

  useEffect(() => {
    if (libraryRoot === null) return;
    const ancestors = [""];
    const segments = currentPath.split("/").filter(Boolean);
    for (let index = 0; index < segments.length; index += 1) {
      ancestors.push(segments.slice(0, index + 1).join("/"));
    }
    const currentBranch = ancestors.map((path) => folderExpansionKey(activeDrive, path));
    setExpanded((previous) => new Set(autoCollapse
      ? ["pc", `drive:${activeDrive}`, ...currentBranch]
      : [...previous, `drive:${activeDrive}`, ...currentBranch]));
    for (const ancestor of ancestors) {
      const pathKey = drivePathKey(activeDrive, ancestor);
      if (!children.has(pathKey) && !loading.has(pathKey)) {
        void loadChildren(ancestor);
      }
    }
  }, [currentPath, activeDrive, autoCollapse]);

  const nodes = useMemo(() => {
    const flattened: TreeNode[] = [{
      key: "pc",
      path: "",
      name: "PC",
      depth: 0,
      kind: "pc",
    }];
    if (!expanded.has("pc")) return flattened;

    const appendFolders = (
      driveIdentity: string,
      driveRoot: string,
      parent: string,
      depth: number,
    ) => {
      for (const child of children.get(drivePathKey(driveIdentity, parent)) ?? []) {
        const path = child.relativePath;
        const key = folderExpansionKey(driveIdentity, path);
        flattened.push({
          key,
          path,
          name: leafName(path),
          depth,
          kind: child.entryKind === "archive" ? "archive" : "folder",
          driveRoot,
          driveIdentity,
          hasChildren: child.hasChildren,
        });
        if (child.entryKind !== "archive" && expanded.has(key)) {
          appendFolders(driveIdentity, driveRoot, path, depth + 1);
        }
      }
    };

    for (const drive of drives) {
      const driveIdentity = normalizedDrive(drive.absolutePath);
      flattened.push({
        key: `drive:${driveIdentity}`,
        path: "",
        name: drive.name,
        depth: 1,
        kind: "drive",
        driveRoot: drive.absolutePath,
        driveIdentity,
      });
      if (expanded.has(`drive:${driveIdentity}`)) {
        appendFolders(driveIdentity, drive.absolutePath, "", 2);
      }
    }
    return flattened;
  }, [activeDrive, children, drives, expanded]);

  useEffect(() => {
    if (refreshToken === 0 || activeDrive === "") return;
    setLoading(new Set());
    const visibleParents = new Set([""]);
    for (const node of nodes) {
      if (
        node.kind === "folder"
        && node.driveIdentity === activeDrive
        && expanded.has(node.key)
      ) {
        visibleParents.add(node.path);
      }
    }
    setChildren((previous) => new Map(
      [...previous].filter(([key]) => !key.startsWith(`${activeDrive}\u0000`)),
    ));
    setErrors((previous) => new Map(
      [...previous].filter(([key]) => !key.startsWith(`${activeDrive}\u0000`)),
    ));
    for (const path of visibleParents) void loadChildren(path, activeDrive);
  }, [refreshToken]);

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TREE_ROW_HEIGHT,
    overscan: 8,
    initialRect: { width: 240, height: 720 },
    observeElementRect: (instance, callback) => {
      const element = instance.scrollElement;
      if (!element) return undefined;
      const report = () => callback({
        width: element.clientWidth || 240,
        height: element.clientHeight || 720,
      });
      report();
      if (typeof ResizeObserver === "undefined") return undefined;
      const observer = new ResizeObserver(report);
      observer.observe(element);
      return () => observer.disconnect();
    },
  });
  const virtualNodes = virtualizer.getVirtualItems();
  const nodeOrder = nodes.map((node) => node.key).join("\0");
  const confirmationPaths = virtualNodes.map(({ index }) => nodes[index])
    .filter((node) => node.kind === "folder" && node.driveIdentity === activeDrive && node.hasChildren == null)
    .map((node) => node.path).join("\0");

  useEffect(() => {
    if (hidden || !confirmChildren || confirmationActive.current || confirmationPaths === "") return;
    const paths = confirmationPaths.split("\0").filter((path) => !confirmed.current.has(path)).slice(0, 64);
    if (paths.length === 0) return;
    const epoch = requestEpoch.current;
    paths.forEach((path) => confirmed.current.add(path));
    confirmationActive.current = true;
    void confirmTreeChildren(paths, ++generation.current).then((response) => {
      if (epoch !== requestEpoch.current || response.status !== "ok") return;
      const results = new Map(response.data.map((entry) => [entry.relativePath, entry.hasChildren]));
      setChildren((previous) => new Map([...previous].map(([key, entries]) => [key,
        key.startsWith(`${activeDrive}\0`) ? entries.map((entry) => results.has(entry.relativePath)
          ? { ...entry, hasChildren: results.get(entry.relativePath) } : entry) : entries,
      ])));
    }).catch(() => undefined).finally(() => {
      confirmationActive.current = false;
      if (mounted.current) setConfirmationRevision((value) => value + 1);
    });
  }, [activeDrive, scope, confirmationPaths, hidden, confirmChildren, confirmationRevision]);

  useEffect(() => {
    if (libraryRoot === null || hidden) return;
    const key = currentPath === ""
      ? `drive:${activeDrive}`
      : folderExpansionKey(activeDrive, currentPath);
    const index = nodes.findIndex((node) => node.key === key);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  // Confirming row metadata must not pull a user's scroll back to the selected folder.
  }, [activeDrive, currentPath, hidden, nodeOrder, revealRequest, virtualizer]);

  function revealCurrentFolder() {
    if (libraryRoot === null) return;
    const segments = currentPath.split("/").filter(Boolean);
    const ancestors = [""];
    for (let index = 0; index < segments.length; index += 1) {
      ancestors.push(segments.slice(0, index + 1).join("/"));
    }
    setExpanded((previous) => new Set([
      ...previous,
      "pc",
      `drive:${activeDrive}`,
      ...ancestors.map((path) => folderExpansionKey(activeDrive, path)),
    ]));
    for (const ancestor of ancestors) {
      const pathKey = drivePathKey(activeDrive, ancestor);
      if (!children.has(pathKey) && !loading.has(pathKey)) void loadChildren(ancestor);
    }
    setRevealRequest((current) => current + 1);
  }

  const folderAddress = currentFolderAddress(libraryRoot, currentPath);

  function fileTarget(node: TreeNode): TreeFileTarget | null {
    if (
      (node.kind !== "drive" && node.kind !== "folder")
      || node.driveRoot === undefined
    ) return null;
    return {
      driveRoot: node.driveRoot,
      relativePath: node.path,
      kind: node.kind,
      name: node.name,
    };
  }

  function openContextMenu(target: TreeFileTarget, x: number, y: number) {
    const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
    setContextMenu({
      target,
      x: Math.max(4, Math.min(x, viewportWidth - 328)),
      y: Math.max(4, Math.min(y, viewportHeight - 150)),
    });
    onRefreshFileClipboard();
  }

  return (
    <aside className="folder-tree" aria-label="フォルダツリー" hidden={hidden}>
      <header className="folder-tree-header">
        <p className="current-folder-path">
          <span>現在のフォルダー</span>
          <strong title={folderAddress}>{folderAddress}</strong>
        </p>
        <div className="folder-tree-header-actions">
          <button type="button" aria-label="現在位置へ移動" title="現在のフォルダーをツリー内に表示" disabled={libraryRoot === null} onClick={revealCurrentFolder}>
            <span aria-hidden="true">⌖</span>
          </button>
          <button type="button" aria-label="ツリーをすべて閉じる" title="開いているドライブとフォルダーをすべて閉じる" onClick={() => setExpanded(new Set(["pc"]))}>
            <span aria-hidden="true">⊟</span>
          </button>
        </div>
      </header>
      <div className="tree-scroll" ref={scrollRef}>
        <div
          role="tree"
          aria-label="PCのフォルダ"
          className="tree-canvas"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualNodes.map((virtualNode) => {
            const node = nodes[virtualNode.index];
            const isExpanded = expanded.has(node.key) && node.hasChildren !== false;
            const nodeDrive = node.driveIdentity ?? activeDrive;
            const pathKey = drivePathKey(nodeDrive, node.path);
            const childCount = node.kind === "pc"
              ? drives.length
              : node.kind === "folder" || node.kind === "archive"
                ? node.hasChildren === false ? 0 : children.get(pathKey)?.length
                : undefined;
            const isSelected = node.kind === "pc"
              ? libraryRoot === null
              : node.kind === "drive"
                ? normalizedDrive(node.driveRoot ?? null) === activeDrive && currentPath === ""
                : node.kind === "archive"
                  ? nodeDrive === activeDrive && activeArchivePath === node.path
                  : nodeDrive === activeDrive && currentPath === node.path && activeArchivePath === null;
            return (
              <div
                className="tree-row"
                key={node.key}
                style={{
                  transform: `translateY(${virtualNode.start}px)`,
                  paddingInlineStart: `${node.depth * TREE_INDENT_WIDTH}px`,
                }}
              >
                <button
                  className="tree-expander"
                  aria-label={`${node.name}を${isExpanded ? "折りたたむ" : "展開する"}`}
                  aria-expanded={isExpanded}
                  disabled={childCount === 0}
                  onClick={() => {
                    if (node.kind === "archive") {
                      onOpenArchive(node.path);
                      return;
                    }
                    setExpanded((previous) => {
                      const next = new Set(previous);
                      if (next.has(node.key)) next.delete(node.key);
                      else next.add(node.key);
                      return next;
                    });
                    if (node.kind === "drive" && node.driveRoot !== undefined && !isExpanded) {
                      void onSelectDrive(node.driveRoot);
                    } else if (node.kind === "folder" && !isExpanded && !children.has(pathKey)) {
                      if (nodeDrive === activeDrive) {
                        void loadChildren(node.path, nodeDrive);
                      } else if (node.driveRoot !== undefined) {
                        void onSelectDrive(node.driveRoot, node.path);
                      }
                    }
                  }}
                >
                  {node.kind === "folder" && loading.has(pathKey)
                    ? "…"
                    : isExpanded ? "▾" : "▸"}
                </button>
                <button
                  role="treeitem"
                  aria-level={node.depth + 1}
                  aria-selected={isSelected}
                  aria-keyshortcuts={node.kind === "folder"
                    ? "Shift+F10 Control+X Control+C Control+V Delete"
                    : node.kind === "drive" ? "Shift+F10 Control+V" : undefined}
                  className="tree-node"
                  title={node.name}
                  data-native-drop-path={nodeDrive === activeDrive && fileTarget(node) !== null
                    ? node.path
                    : undefined}
                  draggable={node.kind === "folder" && nodeDrive === activeDrive}
                  onDragStart={(event) => {
                    if (node.kind !== "folder" || nodeDrive !== activeDrive) {
                      event.preventDefault();
                      return;
                    }
                    if (event.altKey) {
                      event.preventDefault();
                      onNativeFileDragStart([node.path]);
                      return;
                    }
                    event.dataTransfer.effectAllowed = "copyMove";
                    event.dataTransfer.setData("text/plain", node.path);
                    onFileDragStart([node.path]);
                  }}
                  onDragEnd={() => onFileDragEnd()}
                  onDragEnter={(event) => {
                    const canDrop = fileTarget(node) !== null
                      && canDropFiles
                      && nodeDrive === activeDrive;
                    if (canDrop) event.currentTarget.dataset.fileDropActive = "true";
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      delete event.currentTarget.dataset.fileDropActive;
                    }
                  }}
                  onDragOver={(event) => {
                    if (fileTarget(node) === null || !canDropFiles || nodeDrive !== activeDrive) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = event.ctrlKey ? "copy" : "move";
                  }}
                  onDrop={(event) => {
                    delete event.currentTarget.dataset.fileDropActive;
                    const target = fileTarget(node);
                    if (target === null || !canDropFiles || nodeDrive !== activeDrive) return;
                    event.preventDefault();
                    event.stopPropagation();
                    onTransferItems(
                      target,
                      event.ctrlKey || event.dataTransfer.dropEffect === "copy" ? "copy" : "move",
                    );
                  }}
                  onContextMenu={(event) => {
                    const target = fileTarget(node);
                    if (target === null) return;
                    event.preventDefault();
                    event.stopPropagation();
                    openContextMenu(target, event.clientX, event.clientY);
                  }}
                  onKeyDown={(event) => {
                    const target = fileTarget(node);
                    if (target === null) return;
                    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                      event.preventDefault();
                      const bounds = event.currentTarget.getBoundingClientRect();
                      openContextMenu(target, bounds.left + 24, bounds.top + 24);
                      return;
                    }
                    if (event.key === "Delete" && target.kind === "folder") {
                      event.preventDefault();
                      onFileAction("recycle", target);
                      return;
                    }
                    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
                    const shortcut = event.key.toLowerCase();
                    const action = shortcut === "x"
                      ? "cut"
                      : shortcut === "c"
                        ? "copy"
                        : shortcut === "v" ? "paste" : null;
                    if (
                      action === null
                      || ((action === "cut" || action === "copy") && target.kind !== "folder")
                    ) return;
                    event.preventDefault();
                    onFileAction(action, target);
                  }}
                  onClick={() => {
                    if (node.kind === "drive" && node.driveRoot !== undefined) {
                      void onSelectDrive(node.driveRoot);
                    } else if (node.kind === "archive") {
                      onOpenArchive(node.path);
                    } else if (node.kind === "folder") {
                      if (nodeDrive === activeDrive) onNavigate(node.path);
                      else if (node.driveRoot !== undefined) {
                        void onSelectDrive(node.driveRoot, node.path);
                      }
                    }
                  }}
                >
                  <span className={`tree-icon tree-icon--${node.kind}`} aria-hidden="true">
                    <TreeIcon kind={node.kind} expanded={isExpanded} />
                  </span>
                  {node.name}
                </button>
                {node.kind === "folder" && errors.has(pathKey) && (
                  <span className="tree-error" title={errors.get(pathKey)}>!</span>
                )}
              </div>
            );
          })}
          {driveError !== null && <p className="tree-load-error" role="alert">{driveError}</p>}
        </div>
      </div>
      {contextMenu !== null && (
        <TreeContextMenu
          target={contextMenu.target}
          x={contextMenu.x}
          y={contextMenu.y}
          clipboard={clipboard}
          busy={fileOperationBusy}
          onAction={(action, target) => {
            setContextMenu(null);
            onFileAction(action, target);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </aside>
  );
}
