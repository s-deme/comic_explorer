import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "../../types/domain";
import { CatalogGrid } from "./CatalogGrid";

function entries(count: number): CatalogEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    relativePath: `book-${index}` as never,
    kind: "archive",
    archiveKind: "cbz",
  }));
}

describe("CatalogGrid", () => {
  afterEach(cleanup);

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
    const onSelect = vi.fn();
    const onNavigate = vi.fn();
    const onRead = vi.fn();
    render(
      <CatalogGrid
        entries={[folder, comicFolder, archive, image]}
        selectedPath={null}
        onSelect={onSelect}
        onNavigate={onNavigate}
        onRead={onRead}
      />,
    );

    expect(screen.getByText("フォルダ")).toBeInTheDocument();
    expect(screen.getByText("漫画フォルダ")).toBeInTheDocument();
    expect(screen.getByText("ZIP / CBZ / EPUB")).toBeInTheDocument();
    expect(screen.getByText("画像")).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByRole("button", { name: /^library、フォルダ/ }));
    fireEvent.doubleClick(screen.getByRole("button", { name: /^series、漫画フォルダ/ }));
    fireEvent.doubleClick(screen.getByRole("button", { name: /^volume\.cbz、ZIP \/ CBZ/ }));
    fireEvent.doubleClick(screen.getByRole("button", { name: /^cover\.jpg、画像/ }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(folder);
    expect(onRead).toHaveBeenCalledTimes(3);
    expect(onRead).toHaveBeenNthCalledWith(1, comicFolder);
    expect(onRead).toHaveBeenNthCalledWith(2, archive);
    expect(onRead).toHaveBeenNthCalledWith(3, image);
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
});
