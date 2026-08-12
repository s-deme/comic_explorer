import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { listTreeChildren, listWindowsDrives, type WindowsDrive } from "../library/client";
import { presentError } from "../errors/presentation";
import { normalizeWindowsDisplayPath } from "./navigation";

interface TreeNode {
  key: string;
  path: string;
  name: string;
  depth: number;
  kind: "pc" | "drive" | "folder";
  driveRoot?: string;
}

interface FolderTreeProps {
  libraryRoot: string | null;
  currentPath: string;
  onNavigate: (relativePath: string) => void;
  onSelectDrive: (absolutePath: string) => void | Promise<void>;
}

function leafName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function normalizedDrive(path: string | null): string {
  return path === null
    ? ""
    : normalizeWindowsDisplayPath(path).toLocaleLowerCase("en-US");
}

export function FolderTree({
  libraryRoot,
  currentPath,
  onNavigate,
  onSelectDrive,
}: FolderTreeProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const generation = useRef(0);
  const driveGeneration = useRef(0);
  const [drives, setDrives] = useState<WindowsDrive[]>([]);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => new Set(["pc"]));
  const [children, setChildren] = useState<Map<string, string[]>>(() => new Map());
  const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const activeDrive = normalizedDrive(libraryRoot);

  async function loadChildren(path: string) {
    if (libraryRoot === null) return;
    setLoading((previous) => new Set(previous).add(path));
    generation.current += 1;
    const response = await listTreeChildren(path, generation.current);
    setLoading((previous) => {
      const next = new Set(previous);
      next.delete(path);
      return next;
    });
    if (response.status === "ok") {
      setChildren((previous) => {
        const next = new Map(previous);
        next.set(path, response.data.map((entry) => entry.relativePath));
        return next;
      });
      setErrors((previous) => {
        const next = new Map(previous);
        next.delete(path);
        return next;
      });
    } else if (response.status === "error") {
      setErrors((previous) => new Map(previous).set(path, presentError(response.error)));
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
    setChildren(new Map());
    setErrors(new Map());
    setLoading(new Set());
    if (libraryRoot !== null) {
      setExpanded((previous) => new Set([...previous, `drive:${activeDrive}`]));
      void loadChildren("");
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
      ...ancestors.map((path) => `folder:${path}`),
    ]));
    for (const ancestor of ancestors) {
      if (!children.has(ancestor) && !loading.has(ancestor)) {
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

    const appendFolders = (parent: string, depth: number) => {
      for (const path of children.get(parent) ?? []) {
        flattened.push({
          key: `folder:${path}`,
          path,
          name: leafName(path),
          depth,
          kind: "folder",
        });
        if (expanded.has(`folder:${path}`)) appendFolders(path, depth + 1);
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
      });
      if (driveIdentity === activeDrive && expanded.has(`drive:${driveIdentity}`)) {
        appendFolders("", 2);
      }
    }
    return flattened;
  }, [activeDrive, children, drives, expanded]);

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
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

  return (
    <aside className="folder-tree" aria-label="フォルダツリー" ref={scrollRef}>
      <div
        role="tree"
        aria-label="PCのフォルダ"
        className="tree-canvas"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualNode) => {
          const node = nodes[virtualNode.index];
          const isExpanded = expanded.has(node.key);
          const childCount = node.kind === "pc"
            ? drives.length
            : node.kind === "folder"
              ? children.get(node.path)?.length
              : undefined;
          const isSelected = node.kind === "pc"
            ? libraryRoot === null
            : node.kind === "drive"
              ? normalizedDrive(node.driveRoot ?? null) === activeDrive && currentPath === ""
              : currentPath === node.path;
          return (
            <div
              className="tree-row"
              key={node.key}
              style={{
                transform: `translateY(${virtualNode.start}px)`,
                paddingInlineStart: `${node.depth * 18}px`,
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
                  } else if (node.kind === "folder" && !isExpanded && !children.has(node.path)) {
                    void loadChildren(node.path);
                  }
                }}
              >
                {node.kind === "folder" && loading.has(node.path)
                  ? "…"
                  : isExpanded ? "▾" : "▸"}
              </button>
              <button
                role="treeitem"
                aria-level={node.depth + 1}
                aria-selected={isSelected}
                className="tree-node"
                title={node.name}
                onClick={() => {
                  if (node.kind === "drive" && node.driveRoot !== undefined) {
                    void onSelectDrive(node.driveRoot);
                  } else if (node.kind === "folder") {
                    onNavigate(node.path);
                  }
                }}
              >
                <span className={`tree-icon tree-icon--${node.kind}`} aria-hidden="true">
                  {node.kind === "pc" ? "▣" : node.kind === "drive" ? "▰" : "■"}
                </span>
                {node.name}
              </button>
              {node.kind === "folder" && errors.has(node.path) && (
                <span className="tree-error" title={errors.get(node.path)}>!</span>
              )}
            </div>
          );
        })}
        {driveError !== null && <p className="tree-load-error" role="alert">{driveError}</p>}
      </div>
    </aside>
  );
}
