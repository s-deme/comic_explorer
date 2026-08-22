import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listArchiveVirtualTree } from "../library/client";
import { ArchiveExplorerPane } from "./ArchiveExplorerDialog";
import { DEFAULT_CATALOG_THUMBNAIL_SIZES } from "../catalog/view-mode";

vi.mock("../library/client", () => ({ listArchiveVirtualTree: vi.fn() }));

const snapshot = {
  archiveRelativePath: "book.cbz",
  entries: [
    { id: "folder", parentId: null, name: "chapter", kind: "folder", hasChildren: true, pageKey: null, sortOrder: 0 },
    { id: "page", parentId: "folder", name: "2.png", kind: "image", hasChildren: false, pageKey: "chapter/2.png", sortOrder: 0 },
    { id: "nested", parentId: null, name: "inner.cbz", kind: "archive", hasChildren: true, pageKey: null, sortOrder: 1 },
    { id: "nested-page", parentId: "nested", name: "1.png", kind: "image", hasChildren: false, pageKey: "@comic-explorer-nested-v1/aa/bb", sortOrder: 0 },
  ],
} as const;

const displayProps = {
  viewMode: "cover_list" as const,
  thumbnailSizes: DEFAULT_CATALOG_THUMBNAIL_SIZES,
  palette: "system" as const,
  detailGridLines: "none" as const,
  detailRowDensity: "standard" as const,
  detailShowKind: true,
  detailShowSize: true,
  detailShowModified: true,
};

describe("ArchiveExplorerPane", () => {
  beforeEach(() => {
    vi.mocked(listArchiveVirtualTree).mockResolvedValue({
      status: "ok",
      requestId: "archive" as never,
      generation: 1 as never,
      data: snapshot as never,
    });
  });

  afterEach(cleanup);

  it("REQ-LEY-P4-002 navigates direct children in the catalog pane and opens opaque page keys", async () => {
    const onOpenPage = vi.fn();
    render(
      <ArchiveExplorerPane
        {...displayProps}
        archiveRelativePath="book.cbz"
        onOpenPage={onOpenPage}
        onClose={vi.fn()}
      />,
    );
    const pane = await screen.findByRole("region", { name: "書庫の内容" });
    expect(within(pane).getByRole("button", { name: /chapter/ })).toBeInTheDocument();
    expect(within(pane).getByRole("grid", { name: "現在のフォルダの項目" }))
      .toHaveAttribute("data-catalog-view-mode", "cover_list");
    fireEvent.click(within(pane).getByRole("button", { name: /chapter/ }));
    fireEvent.click(await within(pane).findByRole("button", { name: /2\.png/ }));
    expect(onOpenPage).toHaveBeenCalledWith("chapter/2.png");

    fireEvent.click(within(pane).getByRole("button", { name: "親へ" }));
    fireEvent.click(await within(pane).findByRole("button", { name: /inner\.cbz/ }));
    fireEvent.click(await within(pane).findByRole("button", { name: /1\.png/ }));
    expect(onOpenPage).toHaveBeenCalledWith("@comic-explorer-nested-v1/aa/bb");
    expect(screen.queryByText(/削除|名前変更|貼り付け/)).not.toBeInTheDocument();
  });

  it("REQ-LEY-P4-002 keeps the catalog pane recoverable on a Rust archive error", async () => {
    vi.mocked(listArchiveVirtualTree).mockResolvedValue({
      status: "error",
      requestId: "archive-error" as never,
      generation: 1 as never,
      error: {
        code: "CORRUPT_ARCHIVE",
        message: "raw detail",
        retryable: false,
      },
    });
    const onClose = vi.fn();
    render(<ArchiveExplorerPane {...displayProps} archiveRelativePath="bad.cbz" onOpenPage={vi.fn()} onClose={onClose} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "フォルダー一覧へ戻る" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("REQ-LEY-P4-002 shares the selected catalog presentation and keeps selection readable", async () => {
    render(
      <ArchiveExplorerPane
        {...displayProps}
        viewMode="detail_list"
        palette="paper"
        archiveRelativePath="book.cbz"
        onOpenPage={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const grid = await screen.findByRole("grid", { name: "現在のフォルダの項目" });
    expect(grid).toHaveAttribute("data-catalog-view-mode", "detail_list");
    expect(grid).toHaveAttribute("data-catalog-palette", "paper");
    const chapter = within(grid).getByRole("button", { name: /chapter/ });
    expect(chapter).toHaveClass("catalog-item--detail_list");
    expect(chapter).not.toHaveAttribute("draggable", "true");
    fireEvent.click(chapter);
    const page = await screen.findByRole("button", { name: /2\.png/ });
    fireEvent.click(page);
    expect(page).toHaveAttribute("data-selected", "true");
    expect(within(grid).queryByRole("button", { name: /お気に入り/ })).not.toBeInTheDocument();
  });
});
