import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("shows a visible action for each supported kind and invokes its existing callback", () => {
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
    const onSelect = vi.fn();
    const onNavigate = vi.fn();
    const onRead = vi.fn();
    render(
      <CatalogGrid
        entries={[folder, comicFolder, archive]}
        selectedPath={null}
        onSelect={onSelect}
        onNavigate={onNavigate}
        onRead={onRead}
      />,
    );

    expect(screen.getByText("フォルダ")).toBeInTheDocument();
    expect(screen.getByText("漫画フォルダ")).toBeInTheDocument();
    expect(screen.getByText("ZIP / CBZ")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "フォルダの項目1を開く" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "漫画フォルダの項目2を読む" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "ZIP / CBZの項目3を読む" }),
    );

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(folder);
    expect(onRead).toHaveBeenCalledTimes(2);
    expect(onRead).toHaveBeenNthCalledWith(1, comicFolder);
    expect(onRead).toHaveBeenNthCalledWith(2, archive);
    expect(onSelect).not.toHaveBeenCalled();
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
