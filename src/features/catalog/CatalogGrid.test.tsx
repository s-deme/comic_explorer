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
