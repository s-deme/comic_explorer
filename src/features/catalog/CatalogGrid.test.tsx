import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "../../types/domain";
import { CatalogGrid, catalogColumnCountFor } from "./CatalogGrid";

function entries(count: number): CatalogEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    relativePath: `book-${index}` as never,
    kind: "archive",
    archiveKind: "cbz",
  }));
}

describe("CatalogGrid", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reduces card columns to the available catalog width", () => {
    expect(catalogColumnCountFor("small_thumbnail", 1_000)).toBe(8);
    expect(catalogColumnCountFor("small_thumbnail", 700)).toBe(6);
    expect(catalogColumnCountFor("cover_list", 700)).toBe(4);
    expect(catalogColumnCountFor("reference_tile", 460)).toBe(3);
    expect(catalogColumnCountFor("detail_list", 320)).toBe(1);
  });

  it("recomputes virtual rows when the catalog width changes", async () => {
    const resizeCallbacks: Array<() => void> = [];
    class ResizeObserverMock {
      constructor(private readonly callback: () => void) {}

      observe() { resizeCallbacks.push(this.callback); }
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    render(
      <CatalogGrid
        entries={entries(20)}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
        viewMode="cover_list"
      />,
    );
    const grid = screen.getByRole("grid");
    Object.defineProperty(grid, "clientWidth", {
      configurable: true,
      value: 700,
    });
    resizeCallbacks.forEach((callback) => callback());

    await waitFor(() =>
      expect(grid).toHaveAttribute("data-catalog-column-count", "4"),
    );
    expect(grid).toHaveAttribute("aria-rowcount", "5");
  });

  it("moves selection and focus with grid arrow keys", () => {
    const onSelect = vi.fn();
    render(
      <CatalogGrid
        entries={entries(20)}
        selectedPath={null}
        onSelect={onSelect}
        onNavigate={() => undefined}
        onRead={() => undefined}
      />,
    );
    const first = screen.getByRole("button", { name: /book-0/ });
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "book-1" }),
    );
  });

  it("extends the pointer-compatible range with Shift+Arrow", () => {
    const onSelect = vi.fn();
    render(
      <CatalogGrid
        entries={entries(20)}
        selectedPath={"book-3" as never}
        selectedPaths={["book-3"]}
        onSelect={onSelect}
        onNavigate={() => undefined}
        onRead={() => undefined}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /book-3/ }), {
      key: "ArrowRight",
      shiftKey: true,
    });

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "book-4" }),
      "range",
    );
  });

  it("keeps the mounted DOM bounded for 10,000 catalog entries", () => {
    render(
      <CatalogGrid
        entries={entries(10_000)}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
      />,
    );
    const mounted = screen.getAllByRole("gridcell").length;
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThanOrEqual(100);
  });

  it("restores focus to the selected item when the grid remounts", async () => {
    render(
      <CatalogGrid
        entries={entries(20)}
        selectedPath={"book-3" as never}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /book-3/ })).toHaveFocus(),
    );
  });

  it("selects a keyboard-focused item before Ctrl+Enter opens it", () => {
    const onSelect = vi.fn();
    const onRead = vi.fn();
    render(
      <CatalogGrid
        entries={entries(1)}
        selectedPath={null}
        onSelect={onSelect}
        onNavigate={() => undefined}
        onRead={onRead}
      />,
    );
    const item = screen.getByRole("button", { name: /book-0/ });

    fireEvent.keyDown(item, { key: "Enter", ctrlKey: true });

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "book-0" }),
    );
    expect(onRead).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "book-0" }),
    );
  });

  it("opens the item context menu from right click and Shift+F10", () => {
    const onContextMenu = vi.fn();
    render(
      <CatalogGrid
        entries={entries(1)}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
        onContextMenu={onContextMenu}
      />,
    );
    const item = screen.getByRole("button", { name: /book-0/ });
    fireEvent.contextMenu(item, { clientX: 120, clientY: 80 });
    expect(onContextMenu).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ relativePath: "book-0" }),
      { x: 120, y: 80 },
    );

    fireEvent.keyDown(item, { key: "F10", shiftKey: true });
    expect(onContextMenu).toHaveBeenCalledTimes(2);
    expect(onContextMenu.mock.calls[1][0]).toEqual(
      expect.objectContaining({ relativePath: "book-0" }),
    );
  });

  it("opens supported kinds from the card without duplicate read buttons", () => {
    const folder: CatalogEntry = {
      relativePath: "library" as never,
      kind: "folder",
    };
    const comicFolder: CatalogEntry = {
      relativePath: "series" as never,
      kind: "comicFolder",
    };
    const archive: CatalogEntry = {
      relativePath: "volume.cbz" as never,
      kind: "archive",
      archiveKind: "cbz",
    };
    const image: CatalogEntry = {
      relativePath: "cover.jpg" as never,
      kind: "page",
    };
    const pdf: CatalogEntry = {
      relativePath: "document.PDF" as never,
      kind: "pdf",
    };
    const onSelect = vi.fn();
    const onNavigate = vi.fn();
    const onRead = vi.fn();
    render(
      <CatalogGrid
        entries={[folder, comicFolder, archive, image, pdf]}
        selectedPath={null}
        onSelect={onSelect}
        onNavigate={onNavigate}
        onRead={onRead}
        viewMode="detail_list"
      />,
    );

    expect(screen.getByText("フォルダ")).toBeInTheDocument();
    expect(screen.getByText("漫画フォルダ")).toBeInTheDocument();
    expect(screen.getByText("CBZ")).toBeInTheDocument();
    expect(screen.getByText("画像")).toBeInTheDocument();
    expect(screen.getAllByText("PDF").length).toBeGreaterThanOrEqual(1);

    fireEvent.doubleClick(screen.getByRole("button", { name: /^library、フォルダ/ }));
    fireEvent.doubleClick(screen.getByRole("button", { name: /^series、漫画フォルダ/ }));
    fireEvent.doubleClick(screen.getByRole("button", { name: /^volume\.cbz、CBZ/ }));
    fireEvent.doubleClick(screen.getByRole("button", { name: /^cover\.jpg、画像/ }));
    fireEvent.doubleClick(screen.getByRole("button", { name: /^document\.PDF、PDF/ }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(folder);
    expect(onRead).toHaveBeenCalledTimes(4);
    expect(onRead).toHaveBeenNthCalledWith(1, comicFolder);
    expect(onRead).toHaveBeenNthCalledWith(2, archive);
    expect(onRead).toHaveBeenNthCalledWith(3, image);
    expect(onRead).toHaveBeenNthCalledWith(4, pdf);
    expect(screen.queryByText("読む")).not.toBeInTheDocument();
  });

  it("keeps long labels and card actions in separate layout regions", () => {
    const archive: CatalogEntry = {
      relativePath: "Ginga FUJISAN Ryu vol 01 with a very long title.cbz" as never,
      kind: "archive",
      archiveKind: "cbz",
    };
    render(
      <CatalogGrid
        entries={[archive]}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
        onToggleFavorite={() => undefined}
        viewMode="small_thumbnail"
      />,
    );

    const item = screen.getByRole("button", { name: /^Ginga FUJISAN/ });
    const cell = item.closest(".catalog-cell");
    expect(cell).not.toBeNull();
    expect(cell).toHaveClass("catalog-cell--small_thumbnail");
    const actions = within(cell as HTMLElement).getByRole("group", {
      name: `${archive.relativePath}の操作`,
    });
    expect(item).not.toContainElement(actions);
    expect(within(actions).getByRole("button", { name: "お気に入りに追加" }))
      .toBeInTheDocument();
    expect(within(actions).queryByRole("button", { name: /読む/ }))
      .not.toBeInTheDocument();
  });

  it.each(["small_thumbnail", "cover_list", "reference_tile"] as const)(
    "%s cards reserve the label for the file name and hide the file format",
    (viewMode) => {
      const archive: CatalogEntry = {
        relativePath: "tall-cover with a very long title.cbz" as never,
        kind: "archive",
        archiveKind: "cbz",
      };
      render(
        <CatalogGrid
          entries={[archive]}
          selectedPath={null}
          onSelect={() => undefined}
          onNavigate={() => undefined}
          onRead={() => undefined}
          viewMode={viewMode}
        />,
      );

      const item = screen.getByRole("button", { name: /^tall-cover/ });
      expect(within(item).getByText("tall-cover with a very long title.cbz"))
        .toHaveClass("item-name");
      expect(within(item).getByText("▣")).toHaveClass("thumbnail");
      expect(within(item).queryByText("CBZ")).not.toBeInTheDocument();
      expect(item).toHaveAttribute("aria-label", expect.stringContaining("CBZ"));
    },
  );

  it("shows an unsupported file's original extension and no read/favorite actions", () => {
    const unsupported: CatalogEntry = {
      relativePath: "future.RAR" as never,
      kind: "unsupported",
      archiveKind: "rar",
    };
    const onRead = vi.fn();
    const onToggleFavorite = vi.fn();
    render(
      <CatalogGrid
        entries={[unsupported]}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={onRead}
        onToggleFavorite={onToggleFavorite}
        viewMode="detail_list"
      />,
    );

    expect(screen.getByText(".RAR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /読む/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /お気に入り/ })).not.toBeInTheDocument();
    expect(document.querySelector(".thumbnail")).toHaveAttribute("data-thumbnail-state", "placeholder");
    expect(onRead).not.toHaveBeenCalled();
    expect(onToggleFavorite).not.toHaveBeenCalled();
  });

  it("keeps the thumbnail slot stable while loading and displays the generated image", async () => {
    const onNeeded = vi.fn();
    const { rerender } = render(
      <CatalogGrid
        entries={entries(1)}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
        onThumbnailNeeded={onNeeded}
      />,
    );
    const slot = document.querySelector(".thumbnail");
    expect(slot).toHaveAttribute("data-thumbnail-state", "loading");
    await waitFor(() => expect(onNeeded).toHaveBeenCalledTimes(1));

    rerender(
      <CatalogGrid
        entries={entries(1)}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
        thumbnailFor={() => ({
          status: "ready",
          mediaUri: "comic://localhost/token",
          cacheHit: true,
        })}
      />,
    );
    expect(document.querySelector(".thumbnail")).toBe(slot);
    expect(document.querySelector(".thumbnail img")).toHaveAttribute(
      "src",
      "comic://localhost/token",
    );
    expect(slot).toHaveAttribute("data-cache-hit", "true");
  });

  it("requests a thumbnail for an image displayed directly in the catalog", async () => {
    const page: CatalogEntry = {
      relativePath: "chapter/001.jpg" as never,
      kind: "page",
    };
    const onNeeded = vi.fn();
    render(
      <CatalogGrid
        entries={[page]}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
        onThumbnailNeeded={onNeeded}
      />,
    );

    expect(document.querySelector(".thumbnail"))
      .toHaveAttribute("data-thumbnail-state", "loading");
    await waitFor(() => expect(onNeeded).toHaveBeenCalledWith(page));
  });
});
