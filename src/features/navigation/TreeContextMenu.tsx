import { useEffect, useRef } from "react";
import type { FileClipboardStatus } from "../library/client";

export type TreeFileAction = "cut" | "copy" | "paste" | "recycle";

export interface TreeFileTarget {
  driveRoot: string;
  relativePath: string;
  kind: "drive" | "folder";
  name: string;
}

interface TreeContextMenuProps {
  target: TreeFileTarget;
  x: number;
  y: number;
  clipboard: FileClipboardStatus;
  busy?: boolean;
  onAction: (action: TreeFileAction, target: TreeFileTarget) => void;
  onClose: () => void;
}

export function TreeContextMenu({
  target,
  x,
  y,
  clipboard,
  busy = false,
  onAction,
  onClose,
}: TreeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = menuRef.current;
    menu?.querySelector<HTMLButtonElement>('button:not([aria-disabled="true"])')?.focus();
    function closeForPointer(event: PointerEvent) {
      if (menu !== null && !menu.contains(event.target as Node)) onClose();
    }
    function closeForWindowChange() {
      onClose();
    }
    window.addEventListener("pointerdown", closeForPointer);
    window.addEventListener("blur", closeForWindowChange);
    window.addEventListener("resize", closeForWindowChange);
    return () => {
      window.removeEventListener("pointerdown", closeForPointer);
      window.removeEventListener("blur", closeForWindowChange);
      window.removeEventListener("resize", closeForWindowChange);
    };
  }, [onClose]);

  function item(
    action: TreeFileAction,
    label: string,
    shortcut: string,
    disabled: boolean,
  ) {
    return (
      <button
        type="button"
        role="menuitem"
        aria-disabled={disabled || busy}
        onClick={() => {
          if (!disabled && !busy) onAction(action, target);
        }}
      >
        <span>{label}</span>
        <span className="menu-shortcut">{shortcut}</span>
      </button>
    );
  }

  function moveFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([aria-disabled="true"])'),
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[index]?.focus();
  }

  const canTransfer = target.kind === "folder";
  return (
    <div
      ref={menuRef}
      className="catalog-context-menu"
      role="menu"
      aria-label="フォルダツリーの操作"
      data-context-path={target.relativePath}
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={moveFocus}
    >
      {item("cut", "切り取り", "Ctrl+X", !canTransfer)}
      {item("copy", "コピー", "Ctrl+C", !canTransfer)}
      {item("paste", `貼り付け${clipboard.items > 0 ? `（${clipboard.items}件）` : ""}`, "Ctrl+V", !clipboard.available)}
      <div className="menu-separator" role="separator" />
      {item("recycle", "削除", "Del", !canTransfer)}
    </div>
  );
}
