import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const multiPageSession = {
  itemKey: "multi-page.cbz",
  displayName: "Multi Page",
  pages: [
    {
      id: "page-1" as never,
      relativePath: "1.png" as never,
      mediaUri: "comic://localhost/one",
    },
    {
      id: "page-2" as never,
      relativePath: "2.png" as never,
      mediaUri: "comic://localhost/two",
    },
  ],
  startIndex: 0,
};

describe("Viewer settings", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(saveReadingPosition).mockReset();
  });

  beforeEach(() => {
    vi.mocked(saveReadingPosition).mockResolvedValue({
      status: "ok",
      requestId: "position" as never,
      generation: 1 as never,
      data: undefined,
    });
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

  it("flushes the confirmed position before closing or advancing", async () => {
    const calls: string[] = [];
    vi.mocked(saveReadingPosition).mockImplementation(async () => {
      calls.push("saved");
      return {
        status: "ok",
        requestId: "position" as never,
        generation: 1 as never,
        data: undefined,
      };
    });
    const onClose = vi.fn(() => calls.push("closed"));
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "一覧へ戻る" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.slice(-2)).toEqual(["saved", "closed"]);

    cleanup();
    calls.length = 0;
    const onNextItem = vi.fn(() => calls.push("next"));
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        onNextItem={onNextItem}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);
    await waitFor(() => expect(onNextItem).toHaveBeenCalled());
    expect(calls.slice(-2)).toEqual(["saved", "next"]);
  });

  it("connects FR-B01 scale, fit and loupe controls to the Viewer", () => {
    const onScaleChange = vi.fn();
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialScaleMode="custom"
        initialScale={1.7}
        initialLoupeEnabled={false}
        onSettingsChange={() => undefined}
        onScaleChange={onScaleChange}
        onClose={() => undefined}
      />,
    );

    const spread = document.querySelector(".page-spread");
    expect(spread).toHaveAttribute("data-scale-mode", "custom");
    expect(spread).toHaveAttribute("data-scale", "1.7");
    expect(screen.getByRole("spinbutton", { name: "任意倍率" })).toHaveValue(1.7);

    fireEvent.change(screen.getByRole("combobox", { name: "倍率モード" }), {
      target: { value: "width" },
    });
    expect(spread).toHaveAttribute("data-scale-mode", "width");
    fireEvent.change(screen.getByRole("spinbutton", { name: "任意倍率" }), {
      target: { value: "2.3" },
    });
    expect(spread).toHaveAttribute("data-scale-mode", "custom");
    expect(spread).toHaveAttribute("data-scale", "2.3");

    fireEvent.click(screen.getByRole("button", { name: "ルーペ" }));
    expect(screen.getByRole("button", { name: "ルーペ" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(onScaleChange).toHaveBeenLastCalledWith({
      mode: "custom",
      scale: 2.3,
      loupeEnabled: true,
    });
  });

  it("keeps the chosen scale while moving between pages", async () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialScaleMode="custom"
        initialScale={1.5}
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "次ページ" }));
    await waitFor(() =>
      expect(screen.getByText("2 / 2")).toBeInTheDocument(),
    );
    expect(document.querySelector(".page-spread")).toHaveAttribute(
      "data-scale-mode",
      "custom",
    );
    expect(document.querySelector(".page-spread")).toHaveAttribute(
      "data-scale",
      "1.5",
    );
  });
});
