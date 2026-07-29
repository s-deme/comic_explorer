import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveReadingPosition } from "../library/client";
import { Viewer } from "./Viewer";

vi.mock("../library/client", () => ({ saveReadingPosition: vi.fn() }));

const session = {
  itemKey: "book.cbz",
  displayName: "Book",
  pages: [
    {
      id: "page-1" as never,
      relativePath: "1.png" as never,
      mediaUri: "comic://localhost/token",
    },
  ],
  startIndex: 0,
};

describe("Viewer settings", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(saveReadingPosition).mockReset();
  });

  it("starts from restored mode and direction and reports changes", () => {
    const onSettingsChange = vi.fn();
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="spread"
        initialDirection="leftToRight"
        onSettingsChange={onSettingsChange}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText("見開き")).toBeInTheDocument();
    expect(screen.getByText("左開き")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "単ページへ" }));
    expect(onSettingsChange).toHaveBeenCalledWith("single", "leftToRight");
    fireEvent.click(screen.getByRole("button", { name: "読み方向" }));
    expect(onSettingsChange).toHaveBeenLastCalledWith("single", "rightToLeft");
  });
});
