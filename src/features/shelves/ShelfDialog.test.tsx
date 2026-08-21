import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addShelfItems,
  createShelf,
  executeShelfNodeDelete,
  executeShelfCleanup,
  executeShelvesImport,
  exportShelvesText,
  listShelves,
  openShelfItem,
  previewShelfNodeDelete,
  previewShelfCleanup,
  previewShelvesImport,
  updateShelfNode,
  type ShelfSnapshot,
} from "../library/client";
import { ShelfDialog } from "./ShelfDialog";

vi.mock("../library/client", () => ({
  addShelfItems: vi.fn(),
  createShelf: vi.fn(),
  createShelfFolder: vi.fn(),
  deleteShelf: vi.fn(),
  executeShelfNodeDelete: vi.fn(),
  executeShelfCleanup: vi.fn(),
  executeShelvesImport: vi.fn(),
  exportShelvesText: vi.fn(),
  listShelves: vi.fn(),
  openShelfItem: vi.fn(),
  previewShelfCleanup: vi.fn(),
  previewShelfNodeDelete: vi.fn(),
  previewShelvesImport: vi.fn(),
  reorderShelfNodes: vi.fn(),
  reorderShelves: vi.fn(),
  saveStartupShelf: vi.fn(),
  updateShelf: vi.fn(),
  updateShelfNode: vi.fn(),
}));

const initial: ShelfSnapshot = {
  shelves: [{ id: 1, name: "読む本", icon: "books", sortOrder: 0 }],
  nodes: [
    {
      id: 10,
      shelfId: 1,
      parentId: null,
      nodeType: "folder",
      name: "SF",
      targetPath: null,
      targetKind: null,
      icon: "folder",
      sortOrder: 0,
    },
    {
      id: 11,
      shelfId: 1,
      parentId: 10,
      nodeType: "item",
      name: "one.cbz",
      targetPath: "C:\\Comics\\one.cbz",
      targetKind: "archive",
      icon: "archive",
      sortOrder: 0,
    },
  ],
  startupShelfId: 1,
};

function ok<T>(data: T) {
  return { status: "ok", requestId: "test", generation: 1, data } as never;
}

describe("ShelfDialog", () => {
  beforeEach(() => {
    vi.mocked(listShelves).mockResolvedValue(ok(initial));
    vi.mocked(createShelf).mockResolvedValue(ok(initial));
    vi.mocked(addShelfItems).mockResolvedValue(ok(initial));
    vi.mocked(updateShelfNode).mockResolvedValue(ok(initial));
    vi.mocked(previewShelfNodeDelete).mockResolvedValue(ok({
      totalNodeCount: 1,
      previewKey: "delete-preview",
    }));
    vi.mocked(executeShelfNodeDelete).mockResolvedValue(ok({ ...initial, nodes: [initial.nodes[0]] }));
    vi.mocked(previewShelfCleanup).mockResolvedValue(ok({
      missingNodeIds: [11],
      unavailableNodeIds: [12],
    }));
    vi.mocked(executeShelfCleanup).mockResolvedValue(ok({ ...initial, nodes: [initial.nodes[0]] }));
    vi.mocked(openShelfItem).mockResolvedValue(ok({
      libraryRoot: "C:\\Comics",
      itemRelativePath: "one.cbz",
      itemKind: "archive",
      mode: "normal",
    }));
    vi.mocked(exportShelvesText).mockResolvedValue(ok({
      fileName: "shelf.jsonl",
      bytes: [...new TextEncoder().encode("{\"type\":\"comic-explorer-shelves\",\"version\":1}\r\n")],
      shelfCount: 1,
      nodeCount: 2,
    }));
    vi.mocked(previewShelvesImport).mockResolvedValue(ok({
      shelfCount: 1,
      nodeCount: 2,
      conflictingNames: ["読む本"],
      previewKey: "preview",
    }));
    vi.mocked(executeShelvesImport).mockResolvedValue(ok(initial));
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("REQ-LEY-P4-001 loads the startup shelf, creates a named shelf, and registers only internal paths", async () => {
    render(
      <ShelfDialog
        selectedPaths={["selected.cbz"]}
        draggedPaths={["dragged.cbz"]}
        onOpenPlan={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("起動時に指定された本棚を開きました。")).toBeInTheDocument();
    const name = screen.getByLabelText("本棚名");
    await waitFor(() => expect(name).toHaveValue("読む本"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.change(name, { target: { value: "新しい本棚" } });
    expect(name).toHaveValue("新しい本棚");
    fireEvent.click(screen.getByRole("button", { name: "新規作成" }));
    await waitFor(() => expect(createShelf).toHaveBeenCalledWith("新しい本棚", "books", expect.any(Number)));

    fireEvent.click(screen.getByRole("button", { name: /SF$/ }));
    fireEvent.click(screen.getByRole("button", { name: "選択を登録" }));
    await waitFor(() => expect(addShelfItems).toHaveBeenCalledWith(1, 10, ["selected.cbz"], expect.any(Number)));

    fireEvent.drop(screen.getByRole("tree", { name: "本棚ツリー" }).closest("section")!);
    await waitFor(() => expect(addShelfItems).toHaveBeenCalledWith(1, 10, ["dragged.cbz"], expect.any(Number)));
  });

  it("REQ-LEY-P4-001 edits the virtual hierarchy, opens a Rust plan, and keeps missing cleanup explicit", async () => {
    const onOpenPlan = vi.fn();
    render(
      <ShelfDialog selectedPaths={[]} draggedPaths={[]} onOpenPlan={onOpenPlan} onClose={vi.fn()} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /one\.cbz$/ }));
    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "renamed.cbz" } });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await waitFor(() => expect(updateShelfNode).toHaveBeenCalledWith(
      11, 10, "renamed.cbz", "archive", expect.any(Number),
    ));

    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    await waitFor(() => expect(onOpenPlan).toHaveBeenCalledWith(expect.objectContaining({ itemRelativePath: "one.cbz" })));

    fireEvent.click(within(screen.getByRole("group", { name: "選択項目" }))
      .getByRole("button", { name: "除去" }));
    await waitFor(() => expect(previewShelfNodeDelete).toHaveBeenCalledWith(11, expect.any(Number)));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("実ファイルは変更しません"));
    await waitFor(() => expect(executeShelfNodeDelete).toHaveBeenCalledWith(
      11, "delete-preview", expect.any(Number),
    ));

    fireEvent.click(screen.getByRole("button", { name: "消失登録を検査" }));
    await waitFor(() => expect(executeShelfCleanup).toHaveBeenCalledWith(1, [11], expect.any(Number)));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("一時的に確認できない1件は残します"));
  });

  it("REQ-LEY-P4-001 previews the versioned text before confirmed transactional import", async () => {
    render(
      <ShelfDialog selectedPaths={[]} draggedPaths={[]} onOpenPlan={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "選択本棚を出力" }));
    expect(await screen.findByDisplayValue(/comic-explorer-shelves/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "同名本棚を明示的に置換" }));
    fireEvent.click(screen.getByRole("button", { name: "importを検査" }));
    expect(await screen.findByText(/同名: 読む本/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "確認済みimportを実行" }));
    await waitFor(() => expect(executeShelvesImport).toHaveBeenCalledWith(
      expect.any(Array), true, "preview", expect.any(Number),
    ));
  });
});
