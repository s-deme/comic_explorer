import { useEffect, useRef } from "react";
import type { CatalogEntry } from "../../types/domain";
import type { FileClipboardStatus } from "../library/client";

export type CatalogContextAction =
  | "open"
  | "openFullscreen"
  | "openSlideshow"
  | "reveal"
  | "openWith"
  | "openDefault"
  | "addBookshelf"
  | "cut"
  | "copy"
  | "paste"
  | "copyToFolder"
  | "moveToFolder"
  | "copyPath"
  | "copyParentPath"
  | "createFolder"
  | "recycle"
  | "rename"
  | "properties"
  | "permanentDelete";

interface CatalogContextMenuProps {
  entry: CatalogEntry | null;
  x: number;
  y: number;
  selectionCount: number;
  clipboard: FileClipboardStatus;
  busy?: boolean;
  onAction: (action: CatalogContextAction) => void;
  onClose: () => void;
}

function readable(entry: CatalogEntry | null): boolean {
  return entry !== null && (
    entry.kind === "folder"
    || entry.kind === "comicFolder"
    || entry.kind === "archive"
    || entry.kind === "pdf"
    || entry.kind === "page"
  );
}

function viewerReadable(entry: CatalogEntry | null): boolean {
  return entry !== null && entry.kind !== "folder" && readable(entry);
}

function bookshelfEligible(entry: CatalogEntry | null): boolean {
  return entry !== null && (
    entry.kind === "folder"
    || entry.kind === "comicFolder"
    || entry.kind === "archive"
    || entry.kind === "pdf"
  );
}

export function CatalogContextMenu({
  entry,
  x,
  y,
  selectionCount,
  clipboard,
  busy = false,
  onAction,
  onClose,
}: CatalogContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const hasSelection = entry !== null && selectionCount > 0;
  const canRead = readable(entry);
  const canOpenViewer = viewerReadable(entry);

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

  function activate(action: CatalogContextAction, disabled = false) {
    if (disabled || busy) return;
    onAction(action);
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

  const item = (
    action: CatalogContextAction,
    label: string,
    disabled = false,
    shortcut?: string,
  ) => (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled || busy}
      onClick={() => activate(action, disabled)}
    >
      <span>{label}</span>
      {shortcut !== undefined && <span className="menu-shortcut">{shortcut}</span>}
    </button>
  );

  return (
    <div
      ref={menuRef}
      className="catalog-context-menu"
      role="menu"
      aria-label="項目の操作"
      data-context-path={entry?.relativePath ?? ""}
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={moveFocus}
    >
      {item("open", "開く", !canRead)}
      {item("openFullscreen", "全画面表示で開く", !canOpenViewer)}
      {item("openSlideshow", "スライドショー書庫として開く", !canOpenViewer)}
      <div className="menu-separator" role="separator" />
      {item("reveal", "エクスプローラーで開く", entry === null)}
      {item("openWith", "アプリケーションから開く…", entry === null)}
      {item("openDefault", "動作中のアプリケーションで開く…", entry === null)}
      <div className="menu-separator" role="separator" />
      {item("addBookshelf", "本棚に追加", !bookshelfEligible(entry))}
      <div className="menu-separator" role="separator" />
      {item("cut", "切り取り", !hasSelection, "Ctrl+X")}
      {item("copy", "コピー", !hasSelection, "Ctrl+C")}
      {item("paste", `貼り付け${clipboard.items > 0 ? `（${clipboard.items}件）` : ""}`, !clipboard.available, "Ctrl+V")}
      {item("copyToFolder", "フォルダへコピー…", !hasSelection)}
      {item("moveToFolder", "フォルダへ移動…", !hasSelection)}
      <div className="menu-separator" role="separator" />
      {item("copyPath", "パスをコピー", entry === null)}
      {item("copyParentPath", "親フォルダのパスをコピー", entry === null)}
      <div className="menu-separator" role="separator" />
      {item("createFolder", "新しいフォルダ", false)}
      {item("recycle", "削除", !hasSelection, "Del")}
      {item("rename", "名前の変更", entry === null || selectionCount !== 1)}
      {item("properties", "プロパティ", entry === null || selectionCount !== 1)}
      <div className="menu-separator" role="separator" />
      {item("permanentDelete", "親フォルダ/書庫を完全に削除", entry === null)}
    </div>
  );
}
