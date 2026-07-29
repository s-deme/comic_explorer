import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { listTreeChildren } from "../library/client";

interface TreeNode {
  path: string;
  name: string;
  depth: number;
  expandable: boolean;
}

interface FolderTreeProps {
  libraryRoot: string;
  currentPath: string;
  onNavigate: (relativePath: string) => void;
}

function leafName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

export function FolderTree({
  libraryRoot,
  currentPath,
  onNavigate,
}: FolderTreeProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const generation = useRef(0);
  const [expanded, setExpanded] = useState(() => new Set([""]));
  const [children, setChildren] = useState<Map<string, string[]>>(
    () => new Map(),
  );
  const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
  const [loading, setLoading] = useState<Set<string>>(() => new Set());

  async function loadChildren(path: string) {
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
        next.set(
          path,
          response.data.map((entry) => entry.relativePath),
        );
        return next;
      });
      setErrors((previous) => {
        const next = new Map(previous);
        next.delete(path);
        return next;
      });
    } else if (response.status === "error") {
      setErrors((previous) =>
        new Map(previous).set(path, response.error.message),
      );
    }
  }

  useEffect(() => {
    void loadChildren("");
  }, [libraryRoot]);

  useEffect(() => {
    const ancestors = [""];
    const segments = currentPath.split("/").filter(Boolean);
    for (let index = 0; index < segments.length; index += 1) {
      ancestors.push(segments.slice(0, index + 1).join("/"));
    }
    setExpanded((previous) => new Set([...previous, ...ancestors]));
    for (const ancestor of ancestors) {
      if (!children.has(ancestor) && !loading.has(ancestor)) {
        void loadChildren(ancestor);
      }
    }
  }, [currentPath]);

  const nodes = useMemo(() => {
    const flattened: TreeNode[] = [
      {
        path: "",
        name: libraryRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? libraryRoot,
        depth: 0,
        expandable: true,
      },
    ];
    for (let index = 0; index < flattened.length; index += 1) {
      const node = flattened[index];
      if (!expanded.has(node.path)) continue;
      const childPaths = children.get(node.path) ?? [];
      flattened.splice(
        index + 1,
        0,
        ...childPaths.map((path) => ({
          path,
          name: leafName(path),
          depth: node.depth + 1,
          expandable: true,
        })),
      );
    }
    return flattened;
  }, [children, expanded, libraryRoot]);

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 8,
    initialRect: { width: 240, height: 720 },
    observeElementRect: (instance, callback) => {
      const element = instance.scrollElement;
      if (!element) return undefined;
      const report = () =>
        callback({
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
    <aside
      className="folder-tree"
      aria-label="フォルダツリー"
      ref={scrollRef}
    >
      <div
        role="tree"
        aria-label="ライブラリフォルダ"
        className="tree-canvas"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualNode) => {
          const node = nodes[virtualNode.index];
          const isExpanded = expanded.has(node.path);
          const childCount = children.get(node.path)?.length;
          return (
            <div
              className="tree-row"
              key={node.path || "root"}
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
                    if (next.has(node.path)) next.delete(node.path);
                    else next.add(node.path);
                    return next;
                  });
                  if (!isExpanded && !children.has(node.path)) {
                    void loadChildren(node.path);
                  }
                }}
              >
                {loading.has(node.path) ? "…" : isExpanded ? "▾" : "▸"}
              </button>
              <button
                role="treeitem"
                aria-level={node.depth + 1}
                aria-selected={currentPath === node.path}
                className="tree-node"
                title={node.name}
                onClick={() => onNavigate(node.path)}
              >
                {node.name}
              </button>
              {errors.has(node.path) && (
                <span className="tree-error" title={errors.get(node.path)}>
                  !
                </span>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
