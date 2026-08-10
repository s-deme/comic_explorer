import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "../../types/domain";
import { CatalogContextMenu } from "./CatalogContextMenu";

const archive: CatalogEntry = {
  relativePath: "books/volume.cbz" as never,
  kind: "archive",
  archiveKind: "cbz",
};

describe("CatalogContextMenu", () => {
  afterEach(cleanup);

  it("exposes the requested Windows file operations and shortcuts", () => {
    render(
      <CatalogContextMenu
        entry={archive}
        x={40}
        y={60}
        selectionCount={2}
        clipboard={{ available: true, cut: false, items: 3 }}
        onAction={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByRole("menuitem", { name: "開く" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /切り取り.*Ctrl\+X/ })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /コピー.*Ctrl\+C/ })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /貼り付け（3件）.*Ctrl\+V/ })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "フォルダへコピー…" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "フォルダへ移動…" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "新しいフォルダ" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /削除.*Del/ })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "名前の変更" })).toHaveAttribute("aria-disabled", "true");
  });

  it("dispatches actions and closes with Escape", () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(
      <CatalogContextMenu
        entry={archive}
        x={0}
        y={0}
        selectionCount={1}
        clipboard={{ available: false, cut: false, items: 0 }}
        onAction={onAction}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "名前の変更" }));
    expect(onAction).toHaveBeenCalledWith("rename");
    fireEvent.keyDown(screen.getByRole("menu", { name: "項目の操作" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps target operations disabled on the catalog background", () => {
    render(
      <CatalogContextMenu
        entry={null}
        x={0}
        y={0}
        selectionCount={0}
        clipboard={{ available: true, cut: true, items: 1 }}
        onAction={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole("menuitem", { name: "開く" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: /貼り付け（1件）.*Ctrl\+V/ })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "新しいフォルダ" })).toBeEnabled();
  });
});
