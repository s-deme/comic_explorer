import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listArchiveVirtualTree } from "../library/client";
import { ArchiveExplorerDialog } from "./ArchiveExplorerDialog";

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

describe("ArchiveExplorerDialog", () => {
  beforeEach(() => {
    vi.mocked(listArchiveVirtualTree).mockResolvedValue({
      status: "ok",
      requestId: "archive" as never,
      generation: 1 as never,
      data: snapshot as never,
    });
  });

  afterEach(cleanup);

  it("REQ-LEY-P4-002 synchronizes virtual tree and direct-child list and opens opaque page keys", async () => {
    const onOpenPage = vi.fn();
    render(
      <ArchiveExplorerDialog
        archiveRelativePath="book.cbz"
        onOpenPage={onOpenPage}
        onClose={vi.fn()}
      />,
    );
    const list = await screen.findByRole("region", { name: "書庫内一覧" });
    expect(within(list).getByRole("button", { name: /chapter/ })).toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: /chapter/ }));
    fireEvent.click(await within(list).findByRole("button", { name: "2.pngを開く" }));
    expect(onOpenPage).toHaveBeenCalledWith("chapter/2.png");

    fireEvent.click(screen.getByRole("treeitem", { name: /inner\.cbz/ }));
    fireEvent.click(await within(list).findByRole("button", { name: "1.pngを開く" }));
    expect(onOpenPage).toHaveBeenCalledWith("@comic-explorer-nested-v1/aa/bb");
    expect(screen.queryByText(/削除|名前変更|貼り付け/)).not.toBeInTheDocument();
  });

  it("REQ-LEY-P4-002 keeps the dialog recoverable on a Rust archive error", async () => {
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
    render(<ArchiveExplorerDialog archiveRelativePath="bad.cbz" onOpenPage={vi.fn()} onClose={onClose} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
