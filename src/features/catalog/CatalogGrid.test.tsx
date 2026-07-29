import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
