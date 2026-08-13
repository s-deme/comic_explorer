import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { listTreeChildren, listWindowsDrives, type WindowsDrive } from "../library/client";
import type { FileClipboardStatus } from "../library/client";
import { presentError } from "../errors/presentation";
import { normalizeWindowsDisplayPath } from "./navigation";
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
  kind: "pc" | "drive" | "folder";
  driveRoot?: string;
  driveIdentity?: string;
}

interface FolderTreeProps {
  libraryRoot: string | null;
  currentPath: string;
  hidden?: boolean;
  onNavigate: (relativePath: string) => void;
  onSelectDrive: (absolutePath: string, relativePath?: string) => unknown | Promise<unknown>;
  clipboard?: FileClipboardStatus;
  fileOperationBusy?: boolean;
  onFileAction?: (action: TreeFileAction, target: TreeFileTarget) => void;
  onRefreshFileClipboard?: () => void;
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
    : normalizeWindowsDisplayPath(path).toLocaleLowerCase("en-US");
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

export function FolderTree({
  libraryRoot,
  currentPath,
  hidden = false,
  onNavigate,
  onSelectDrive,
  clipboard = { available: false, cut: false, items: 0 },
  fileOperationBusy = false,
  onFileAction = () => undefined,
  onRefreshFileClipboard = () => undefined,
}: FolderTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const driveGeneration = useRef(0);
  const [drives, setDrives] = useState<WindowsDrive[]>([]);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => new Set(["pc"]));
  const [children, setChildren] = useState<Map<string, string[]>>(() => new Map());
  const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<TreeMenuState | null>(null);
  const activeDrive = normalizedDrive(libraryRoot);

  async function loadChildren(path: string, driveAtRequest = activeDrive) {
    if (driveAtRequest === "") return;
    const pathKey = drivePathKey(driveAtRequest, path);
    setLoading((previous) => new Set(previous).add(pathKey));
    generation.current += 1;
    const response = await listTreeChildren(path, generation.current);
    setLoading((previous) => {
      const next = new Set(previous);
      next.delete(pathKey);
      return next;
    });
    if (response.status === "ok") {
      setChildren((previous) => {
        const next = new Map(previous);
        next.set(pathKey, response.data.map((entry) => entry.relativePath));
        return next;
      });
      setErrors((previous) => {
        const next = new Map(previous);
        next.delete(pathKey);
        return next;
      });
    } else if (response.status === "error") {
      setErrors((previous) => new Map(previous).set(pathKey, presentError(response.error)));
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
    setExpanded((previous) => new Set([
      ...previous,
      `drive:${activeDrive}`,
      ...ancestors.map((path) => folderExpansionKey(activeDrive, path)),
    ]));
    for (const ancestor of ancestors) {
      const pathKey = drivePathKey(activeDrive, ancestor);
      if (!children.has(pathKey) && !loading.has(pathKey)) {
        void loadChildren(ancestor);
      }
    }
  }, [currentPath, activeDrive]);

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
      for (const path of children.get(drivePathKey(driveIdentity, parent)) ?? []) {
        const key = folderExpansionKey(driveIdentity, path);
        flattened.push({
          key,
          path,
          name: leafName(path),
          depth,
          kind: "folder",
          driveRoot,
          driveIdentity,
        });
        if (expanded.has(key)) appendFolders(driveIdentity, driveRoot, path, depth + 1);
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
        <button
          type="button"
          aria-label="ツリーをすべて閉じる"
          title="開いているドライブとフォルダーをすべて閉じる"
          onClick={() => setExpanded(new Set(["pc"]))}
        >
          <span aria-hidden="true">⊟</span>
        </button>
      </header>
      <div className="tree-scroll" ref={scrollRef}>
        <div
          role="tree"
          aria-label="PCのフォルダ"
          className="tree-canvas"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualNode) => {
            const node = nodes[virtualNode.index];
            const isExpanded = expanded.has(node.key);
            const nodeDrive = node.driveIdentity ?? activeDrive;
            const pathKey = drivePathKey(nodeDrive, node.path);
            const childCount = node.kind === "pc"
              ? drives.length
              : node.kind === "folder"
                ? children.get(pathKey)?.length
                : undefined;
            const isSelected = node.kind === "pc"
              ? libraryRoot === null
              : node.kind === "drive"
                ? normalizedDrive(node.driveRoot ?? null) === activeDrive && currentPath === ""
                : nodeDrive === activeDrive && currentPath === node.path;
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
                    ? "Shift+F10 Control+X Control+C Control+V"
                    : node.kind === "drive" ? "Shift+F10 Control+V" : undefined}
                  className="tree-node"
                  title={node.name}
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
                    } else if (node.kind === "folder") {
                      if (nodeDrive === activeDrive) onNavigate(node.path);
                      else if (node.driveRoot !== undefined) {
                        void onSelectDrive(node.driveRoot, node.path);
                      }
                    }
                  }}
                >
                  <span className={`tree-icon tree-icon--${node.kind}`} aria-hidden="true">
                    {node.kind === "pc" ? "▣" : node.kind === "drive" ? "▰" : "■"}
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
