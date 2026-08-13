import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "../../types/domain";
import { CatalogGrid, catalogColumnCountFor, catalogLayoutFor } from "./CatalogGrid";

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
    expect(catalogColumnCountFor("small_thumbnail", 1_000)).toBe(7);
    expect(catalogColumnCountFor("small_thumbnail", 700)).toBe(5);
    expect(catalogColumnCountFor("cover_list", 700)).toBe(4);
    expect(catalogColumnCountFor("card_grid", 700)).toBe(3);
    expect(catalogColumnCountFor("reference_tile", 700)).toBe(2);
    expect(catalogColumnCountFor("reference_tile", 460)).toBe(1);
    expect(catalogColumnCountFor("detail_list", 320)).toBe(1);
  });

  it("keeps configured thumbnail dimensions fixed while only the column count changes", () => {
    const sizes = { smallThumbnail: 160, coverList: 192, cardGrid: 224, referenceTile: 176 };
    expect(catalogLayoutFor("card_grid", sizes)).toMatchObject({
      thumbnailWidth: 224,
      thumbnailHeight: 336,
      cardWidth: 224,
      rowHeight: 336,
    });
    expect(catalogLayoutFor("reference_tile", sizes)).toMatchObject({
      thumbnailWidth: 176,
      thumbnailHeight: 264,
      cardWidth: 354,
      rowHeight: 286,
    });
    expect(catalogColumnCountFor("reference_tile", 1_000, sizes)).toBe(2);
    expect(catalogColumnCountFor("reference_tile", 700, sizes)).toBe(1);
    expect(catalogLayoutFor("reference_tile", {
      ...sizes,
      referenceTile: 64,
    })).toMatchObject({
      thumbnailWidth: 64,
      thumbnailHeight: 96,
      rowHeight: 154,
    });
    expect(catalogColumnCountFor("small_thumbnail", 1_000, sizes)).toBe(5);
    expect(catalogColumnCountFor("small_thumbnail", 700, sizes)).toBe(3);
    expect(catalogLayoutFor("small_thumbnail", sizes)).toMatchObject({
      thumbnailWidth: 160,
      thumbnailHeight: 160,
    });
  });

  it.each([
    ["small_thumbnail", 9, 156, 10],
    ["detail_list", 2, 62, 0],
    ["cover_list", 6, 274, 10],
    ["card_grid", 5, 324, 4],
    ["reference_tile", 3, 214, 10],
  ] as const)(
    "%s positions the second virtual row after its configured gap",
    (viewMode, entryCount, rowHeight, rowGap) => {
      render(
        <CatalogGrid
          entries={entries(entryCount)}
          selectedPath={null}
          onSelect={() => undefined}
          onNavigate={() => undefined}
          onRead={() => undefined}
          viewMode={viewMode}
        />,
      );

      const rows = document.querySelectorAll(`.catalog-row--${viewMode}`);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveStyle({
        height: `${rowHeight}px`,
        transform: "translateY(0px)",
      });
      expect(rows[1]).toHaveStyle({
        height: `${rowHeight}px`,
        transform: `translateY(${rowHeight + rowGap}px)`,
      });
    },
  );

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

  it("moves into folders and opens only files from the card without duplicate read buttons", () => {
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

    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(onNavigate).toHaveBeenCalledWith(folder);
    expect(onNavigate).toHaveBeenCalledWith(comicFolder);
    expect(onRead).toHaveBeenCalledTimes(3);
    expect(onRead).toHaveBeenNthCalledWith(1, archive);
    expect(onRead).toHaveBeenNthCalledWith(2, image);
    expect(onRead).toHaveBeenNthCalledWith(3, pdf);
    expect(screen.queryByText("読む")).not.toBeInTheDocument();
  });

  it("keeps the favorite toggle separate from the card's open control", () => {
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

  it.each(["small_thumbnail", "cover_list", "card_grid", "reference_tile", "detail_list"] as const)(
    "%s places a favorite toggle beside, not inside, the card's open button",
    (viewMode) => {
      const archive: CatalogEntry = {
        relativePath: "favorite-placement.cbz" as never,
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
          viewMode={viewMode}
        />,
      );

      const item = screen.getByRole("button", { name: /^favorite-placement/ });
      const cell = item.closest(".catalog-cell");
      expect(cell).not.toBeNull();
      const favorite = within(cell as HTMLElement).getByRole("button", {
        name: "お気に入りに追加",
      });
      expect(favorite).toHaveClass("favorite-toggle");
      expect(item).not.toContainElement(favorite);
      expect(favorite.parentElement).toHaveClass("catalog-actions");
    },
  );

  it("reserves the first detail-list column for favorite toggles", () => {
    render(
      <CatalogGrid
        entries={[{
          relativePath: "favorite-column.cbz" as never,
          kind: "archive",
          archiveKind: "cbz",
        }]}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
        onToggleFavorite={() => undefined}
        viewMode="detail_list"
      />,
    );

    const header = document.querySelector(".catalog-list-header");
    expect(header).not.toBeNull();
    expect(header?.children).toHaveLength(5);
    expect(header?.firstElementChild).toHaveClass("catalog-favorite-column");
    const cell = screen.getByRole("button", { name: /^favorite-column/ })
      .closest(".catalog-cell--detail_list");
    expect(cell?.querySelector(":scope > .catalog-actions")).toBeInTheDocument();
    expect(cell?.querySelector(":scope > .catalog-item")).toBeInTheDocument();
  });

  it.each(["small_thumbnail", "cover_list"] as const)(
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
      const fileName = within(item).getByText("tall-cover with a very long title.cbz");
      expect(fileName).toHaveClass("item-name__text");
      expect(fileName.parentElement).toHaveClass("item-name");
      expect(item.querySelector('[data-thumbnail-icon="archive"]')).toBeInTheDocument();
      expect(within(item).queryByText("CBZ")).not.toBeInTheDocument();
      expect(item).toHaveAttribute("aria-label", expect.stringContaining("CBZ"));
    },
  );

  it("renders reference tiles as horizontal information cards", () => {
    const modifiedMs = Date.UTC(2026, 7, 12, 3, 4, 5);
    const archive: CatalogEntry = {
      relativePath: "information-card.cbz" as never,
      kind: "archive",
      archiveKind: "cbz",
      byteSize: 1024 * 1024,
      modifiedMs,
    };
    render(
      <CatalogGrid
        entries={[archive]}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
        viewMode="reference_tile"
      />,
    );

    const item = screen.getByRole("button", { name: /^information-card/ });
    const information = item.querySelector(".reference-tile-info");
    expect(information).not.toBeNull();
    expect(within(information as HTMLElement).getByText("information-card.cbz"))
      .toHaveClass("item-name__text");
    expect(within(information as HTMLElement).getByText("CBZ"))
      .toHaveClass("reference-tile-kind");
    expect(within(information as HTMLElement).getByText("1.0 MB"))
      .toHaveClass("item-size");
    expect(within(information as HTMLElement).getByText(new Date(modifiedMs).toLocaleString("ja-JP")))
      .toHaveClass("item-modified");
    expect(item.firstElementChild).toHaveClass("thumbnail");
  });

  it("renders card grids as large thumbnails without visible file information", () => {
    const archive: CatalogEntry = {
      relativePath: "cover-only.cbz" as never,
      kind: "archive",
      archiveKind: "cbz",
      byteSize: 1024 * 1024,
      modifiedMs: Date.UTC(2026, 7, 12),
    };
    render(
      <CatalogGrid
        entries={[archive]}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
        viewMode="card_grid"
      />,
    );

    const item = screen.getByRole("button", { name: /^cover-only\.cbz、CBZ/ });
    const grid = screen.getByRole("grid", { name: "現在のフォルダの項目" });
    expect(item).toHaveAttribute("title", "cover-only.cbz — CBZ");
    expect(grid).toHaveStyle({
      "--catalog-card-width": "216px",
      "--catalog-column-gap": "4px",
    });
    expect(item.firstElementChild).toHaveClass("thumbnail");
    expect(item.children).toHaveLength(1);
    expect(item.querySelector(".item-name")).not.toBeInTheDocument();
    expect(item.querySelector(".item-metadata")).not.toBeInTheDocument();
    expect(within(item).queryByText("cover-only.cbz")).not.toBeInTheDocument();
    expect(within(item).queryByText("CBZ")).not.toBeInTheDocument();
    expect(within(item).queryByText("1.0 MB")).not.toBeInTheDocument();
  });

  it("uses distinct folder and archive icons for placeholder thumbnails", () => {
    render(
      <CatalogGrid
        entries={[
          { relativePath: "library" as never, kind: "folder" },
          { relativePath: "volume.cbz" as never, kind: "archive", archiveKind: "cbz" },
        ]}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
      />,
    );

    expect(document.querySelector('[data-thumbnail-icon="folder"]')).toBeInTheDocument();
    expect(document.querySelector('[data-thumbnail-icon="archive"]')).toBeInTheDocument();
  });

  it.each(["detail_list", "small_thumbnail", "cover_list", "reference_tile"] as const)(
    "%s places a distinct kind icon at the start of every file name",
    (viewMode) => {
      const catalogEntries: Array<[CatalogEntry, string]> = [
        [{ relativePath: "picture.png" as never, kind: "page" }, "image"],
        [{ relativePath: "library" as never, kind: "folder" }, "folder"],
        [{ relativePath: "comic" as never, kind: "comicFolder" }, "folder"],
        [{ relativePath: "volume.cbz" as never, kind: "archive", archiveKind: "cbz" }, "archive"],
        [{ relativePath: "manual.pdf" as never, kind: "pdf" }, "pdf"],
        [{ relativePath: "notes.txt" as never, kind: "unsupported" }, "file"],
      ];
      render(
        <CatalogGrid
          entries={catalogEntries.map(([entry]) => entry)}
          selectedPath={null}
          onSelect={() => undefined}
          onNavigate={() => undefined}
          onRead={() => undefined}
          viewMode={viewMode}
        />,
      );

      catalogEntries.forEach(([entry, iconKind]) => {
        const name = entry.relativePath;
        const item = screen.getByRole("button", { name: new RegExp(`^${name}`) });
        const label = within(item).getByText(name).closest(".item-name");
        expect(label?.firstElementChild).toHaveAttribute("data-item-kind-icon", iconKind);
        expect(label?.lastElementChild).toHaveClass("item-name__text");
      });
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

  it("requests folder thumbnails and keeps the folder icon when no direct image exists", async () => {
    const onNeeded = vi.fn();
    const folders: CatalogEntry[] = [
      { relativePath: "plain-folder" as never, kind: "folder" },
      { relativePath: "series-folder" as never, kind: "comicFolder" },
    ];
    const { rerender } = render(
      <CatalogGrid
        entries={folders}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
        onThumbnailNeeded={onNeeded}
      />,
    );

    expect(document.querySelectorAll(".thumbnail")[0])
      .toHaveAttribute("data-thumbnail-state", "loading");
    expect(document.querySelectorAll(".thumbnail")[1])
      .toHaveAttribute("data-thumbnail-state", "loading");
    await waitFor(() => {
      expect(onNeeded).toHaveBeenCalledWith(folders[0]);
      expect(onNeeded).toHaveBeenCalledWith(folders[1]);
    });

    rerender(
      <CatalogGrid
        entries={folders}
        selectedPath={null}
        onSelect={() => undefined}
        onNavigate={() => undefined}
        onRead={() => undefined}
        thumbnailFor={(entry) => entry.relativePath === "series-folder"
          ? {
              status: "ready",
              mediaUri: "comic://localhost/folder-cover",
              cacheHit: false,
            }
          : { status: "error" }}
      />,
    );

    expect(document.querySelectorAll(".thumbnail")[0])
      .toHaveAttribute("data-thumbnail-state", "error");
    expect(document.querySelectorAll('[data-thumbnail-icon="folder"]')).toHaveLength(1);
    expect(document.querySelector(".thumbnail img"))
      .toHaveAttribute("src", "comic://localhost/folder-cover");
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
