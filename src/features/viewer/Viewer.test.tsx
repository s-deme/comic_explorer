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

  it("FT-B04-002 connects vertical and horizontal layout modes while keeping the page anchor", async () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialLayoutMode="paged"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onLayoutChange={vi.fn()}
        onClose={() => undefined}
      />,
    );

    const selector = screen.getByRole("combobox", { name: "閲覧レイアウト" });
    const spread = document.querySelector(".page-spread");
    fireEvent.change(selector, { target: { value: "vertical_scroll" } });
    await waitFor(() => {
      expect(spread).toHaveAttribute("data-layout-mode", "vertical_scroll");
      expect(spread).toHaveAttribute("data-page-anchor", "0");
      expect(screen.getByRole("article", { name: "ページ 1" })).toHaveFocus();
    });

    fireEvent.change(selector, { target: { value: "horizontal_scroll" } });
    await waitFor(() => {
      expect(spread).toHaveAttribute("data-layout-mode", "horizontal_scroll");
      expect(spread).toHaveAttribute("data-page-anchor", "0");
    });
  });

  it("FT-C-016 preserves reading order and maps wheel input to horizontal scrolling", async () => {
    const threePageSession = {
      ...multiPageSession,
      pages: [
        ...multiPageSession.pages,
        {
          id: "page-3" as never,
          relativePath: "3.png" as never,
          mediaUri: "comic://localhost/three",
        },
      ],
    };
    render(
      <Viewer
        session={threePageSession}
        generation={1}
        initialMode="single"
        initialLayoutMode="horizontal_scroll"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    const spread = document.querySelector<HTMLElement>(".page-spread");
    expect(spread).not.toBeNull();
    expect(
      screen.getAllByRole("article").map((page) => page.getAttribute("aria-label")),
    ).toEqual(["ページ 3", "ページ 2", "ページ 1"]);

    fireEvent.keyDown(window, { key: "r" });
    await waitFor(() =>
      expect(
        screen.getAllByRole("article").map((page) => page.getAttribute("aria-label")),
      ).toEqual(["ページ 1", "ページ 2", "ページ 3"]),
    );

    const stage = document.querySelector(".viewer-stage");
    expect(stage).not.toBeNull();
    fireEvent.wheel(stage as HTMLElement, { deltaY: 120 });
    expect(spread).toHaveProperty("scrollLeft", 120);
    expect(spread).toHaveAttribute("data-page-anchor", "0");
  });

  it("FT-B04-003 preserves reading direction, keyboard navigation, native wheel and Escape", async () => {
    const onSettingsChange = vi.fn();
    const onClose = vi.fn();
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialLayoutMode="vertical_scroll"
        initialDirection="leftToRight"
        onSettingsChange={onSettingsChange}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("左開き")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByText("右開き")).toBeInTheDocument();
    expect(onSettingsChange).toHaveBeenLastCalledWith("single", "rightToLeft");

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() =>
      expect(document.querySelector(".page-spread")).toHaveAttribute(
        "data-page-anchor",
        "1",
      ),
    );
    expect(screen.getByRole("article", { name: "ページ 2" })).toHaveFocus();

    const stage = document.querySelector(".viewer-stage");
    expect(stage).not.toBeNull();
    fireEvent.wheel(stage as HTMLElement, { deltaY: 120 });
    expect(document.querySelector(".page-spread")).toHaveAttribute(
      "data-page-anchor",
      "1",
    );

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("FT-B04-004 connects fullscreen enter, exit and Escape without closing the Viewer", async () => {
    const adapter = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn().mockResolvedValue(undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
    };
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={vi.fn()}
        fullscreenAdapter={adapter}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "全画面表示" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "全画面表示を終了" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(adapter.enter).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "全画面表示" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
    expect(adapter.exit).toHaveBeenCalledTimes(1);
  });

  it("FT-B04-004 reports an adapter error without claiming fullscreen", async () => {
    const adapter = {
      enter: vi.fn().mockRejectedValue(new Error("window unavailable")),
      exit: vi.fn().mockResolvedValue(undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
    };
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        fullscreenAdapter={adapter}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "全画面表示" }));
    expect(
      await screen.findByText("全画面表示を切り替えられません。もう一度お試しください。"),
    ).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "全画面表示" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
