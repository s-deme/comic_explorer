import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function markPrefetchedPagesReady(): void {
  document.querySelectorAll<HTMLImageElement>(".prefetch-page")
    .forEach((image) => fireEvent.load(image));
}

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

  it("renders viewer actions as explained icon buttons", () => {
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    const toolbar = document.querySelector<HTMLElement>(".viewer-toolbar");
    expect(toolbar).not.toBeNull();
    const buttons = within(toolbar!).getAllByRole("button");
    expect(buttons).toHaveLength(13);
    buttons.forEach((button) => {
      expect(button).toHaveClass("viewer-icon-button");
      expect(button).toHaveAttribute("title");
      expect(button.getAttribute("title")).not.toBe("");
    });

    const spread = within(toolbar!).getByRole("button", { name: "見開きへ" });
    expect(spread).toHaveTextContent("▯▯");
    expect(spread).not.toHaveTextContent("見開きへ");
    const close = within(toolbar!).getByRole("button", { name: "一覧へ戻る" });
    expect(close).toHaveTextContent("↩");
    expect(close).not.toHaveTextContent("一覧へ戻る");
  });

  it("moves to any page from the bottom page navigator instead of the toolbar", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    const toolbar = document.querySelector<HTMLElement>(".viewer-toolbar");
    expect(toolbar).not.toHaveTextContent("1 / 2");

    const navigator = screen.getByRole("navigation", { name: "ページ移動" });
    const slider = within(navigator).getByRole("slider", { name: "ページ移動" });
    expect(slider).toHaveValue("0");
    expect(slider).toHaveAttribute("aria-valuetext", "1 / 2");
    expect(within(navigator).getByText("1 / 2")).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "1" } });

    expect(slider).toHaveValue("1");
    expect(slider).toHaveAttribute("aria-valuetext", "2 / 2");
    expect(within(navigator).getByText("2 / 2")).toBeInTheDocument();
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-page-anchor", "1");
  });

  it("lets the viewer toolbar change the end-of-volume policy", () => {
    const onEndOfVolumePolicyChange = vi.fn();
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        endOfVolumePolicy="auto_next"
        onEndOfVolumePolicyChange={onEndOfVolumePolicyChange}
      />,
    );

    const policy = screen.getByRole("combobox", { name: "巻末動作" });
    expect(policy).toHaveValue("auto_next");
    fireEvent.change(policy, { target: { value: "stop" } });
    expect(onEndOfVolumePolicyChange).toHaveBeenCalledWith("stop");
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
    const scaleInput = screen.getByRole("spinbutton", { name: "任意倍率（%）" });
    expect(scaleInput).toHaveValue(170);
    expect(scaleInput).toHaveAttribute("min", "25");
    expect(scaleInput).toHaveAttribute("max", "400");
    expect(scaleInput).toHaveAttribute("step", "1");

    fireEvent.change(screen.getByRole("combobox", { name: "倍率モード" }), {
      target: { value: "width" },
    });
    expect(spread).toHaveAttribute("data-scale-mode", "width");
    fireEvent.change(scaleInput, {
      target: { value: "230" },
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

  it("zooms from the displayed fit percentage and restores it with the opposite control", () => {
    const onScaleChange = vi.fn();
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onScaleChange={onScaleChange}
        onClose={() => undefined}
      />,
    );

    const image = document.querySelector<HTMLImageElement>(".page-spread img");
    expect(image).not.toBeNull();
    Object.defineProperties(image!, {
      naturalWidth: { configurable: true, value: 1000 },
      naturalHeight: { configurable: true, value: 1000 },
    });
    vi.spyOn(image!, "getBoundingClientRect").mockReturnValue({
      width: 580,
      height: 580,
    } as DOMRect);
    fireEvent.load(image!);

    expect(screen.getByLabelText("現在の倍率")).toHaveTextContent("58%");
    fireEvent.click(screen.getByRole("button", { name: "倍率を上げる" }));
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "0.68");
    expect(screen.getByLabelText("現在の倍率")).toHaveTextContent("68%");

    fireEvent.click(screen.getByRole("button", { name: "倍率を下げる" }));
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "0.58");
    expect(screen.getByLabelText("現在の倍率")).toHaveTextContent("58%");
    expect(onScaleChange).toHaveBeenLastCalledWith({
      mode: "custom",
      scale: 0.58,
      loupeEnabled: false,
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

    markPrefetchedPagesReady();
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

  it("pans overflowing images by dragging without changing pages", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialScaleMode="custom"
        initialScale={2}
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        mouseGestures={{
          swipeLeft: "nextPage",
          swipeRight: "previousPage",
          doubleClick: "none",
        }}
      />,
    );

    const stage = document.querySelector<HTMLElement>(".viewer-stage");
    const spread = document.querySelector<HTMLElement>(".page-spread");
    expect(stage).not.toBeNull();
    expect(spread).not.toBeNull();
    Object.defineProperties(spread!, {
      clientWidth: { configurable: true, value: 500 },
      clientHeight: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 1000 },
      scrollHeight: { configurable: true, value: 800 },
    });
    spread!.scrollLeft = 250;
    spread!.scrollTop = 200;

    fireEvent.pointerDown(stage!, { pointerId: 1, clientX: 200, clientY: 180 });
    fireEvent.pointerMove(stage!, { pointerId: 1, clientX: 100, clientY: 80 });
    expect(spread).toHaveProperty("scrollLeft", 350);
    expect(spread).toHaveProperty("scrollTop", 300);
    expect(stage).toHaveAttribute("data-panning", "true");
    fireEvent.pointerUp(stage!, { pointerId: 1, clientX: 100, clientY: 80 });

    expect(stage).toHaveAttribute("data-panning", "false");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("keeps the current spread until every page in the next spread is ready", async () => {
    const fourPageSession = {
      ...multiPageSession,
      pages: [
        ...multiPageSession.pages,
        { id: "page-3" as never, relativePath: "3.png" as never, mediaUri: "comic://localhost/three" },
        { id: "page-4" as never, relativePath: "4.png" as never, mediaUri: "comic://localhost/four" },
      ],
    };
    render(
      <Viewer
        session={fourPageSession}
        generation={1}
        initialMode="spread"
        initialDirection="leftToRight"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "次ページ" }));
    expect(screen.getByText("1-2 / 4")).toBeInTheDocument();
    const prefetched = document.querySelectorAll<HTMLImageElement>(".prefetch-page");
    expect(prefetched).toHaveLength(2);
    fireEvent.load(prefetched[0]);
    expect(screen.getByText("1-2 / 4")).toBeInTheDocument();
    fireEvent.load(prefetched[1]);
    await waitFor(() => expect(screen.getByText("3-4 / 4")).toBeInTheDocument());
  });

  it("starts tall pages at the top and advances downward before changing pages", async () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialScaleMode="original"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    markPrefetchedPagesReady();
    const spread = document.querySelector<HTMLElement>(".page-spread");
    expect(spread).not.toBeNull();
    Object.defineProperties(spread!, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1100 },
    });
    spread!.scrollTop = 0;
    spread!.scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
      const top = typeof options === "number" ? y : options?.top;
      spread!.scrollTop = top ?? spread!.scrollTop;
    }) as HTMLDivElement["scrollTo"];
    const nextButton = screen.getByRole("button", { name: "次ページ" });

    fireEvent.click(nextButton);
    expect(spread).toHaveProperty("scrollTop", 360);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(nextButton);
    expect(spread).toHaveProperty("scrollTop", 700);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(nextButton);

    await waitFor(() => expect(screen.getByText("2 / 2")).toBeInTheDocument());
    expect(spread).toHaveProperty("scrollTop", 0);
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

  it("FT-B04-004 reveals fullscreen controls only at their matching screen edges", async () => {
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
    const viewer = screen.getByRole("region", { name: "Book ビューワ" });
    await waitFor(() =>
      expect(viewer).toHaveAttribute("data-toolbar-visible", "false"),
    );
    expect(viewer).toHaveAttribute("data-page-navigator-visible", "false");
    expect(adapter.enter).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(viewer, { clientY: 0 });
    await waitFor(() =>
      expect(viewer).toHaveAttribute("data-toolbar-visible", "true"),
    );
    expect(viewer).toHaveAttribute("data-page-navigator-visible", "false");
    expect(screen.getByRole("button", { name: "全画面表示を終了" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const toolbar = document.querySelector<HTMLElement>(".viewer-toolbar");
    expect(toolbar).not.toBeNull();
    fireEvent.pointerLeave(toolbar!);
    await waitFor(() =>
      expect(viewer).toHaveAttribute("data-toolbar-visible", "false"),
    );

    fireEvent.pointerMove(viewer, { clientY: window.innerHeight - 1 });
    await waitFor(() =>
      expect(viewer).toHaveAttribute("data-page-navigator-visible", "true"),
    );

    const navigator = screen.getByRole("navigation", { name: "ページ移動" });
    fireEvent.pointerLeave(navigator);
    await waitFor(() =>
      expect(viewer).toHaveAttribute("data-page-navigator-visible", "false"),
    );

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(viewer).toHaveAttribute("data-fullscreen", "false"),
    );
    expect(adapter.exit).toHaveBeenCalledTimes(1);
  });

  it("keeps stage clicks inert and toggles fullscreen with a double click", async () => {
    const adapter = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn().mockResolvedValue(undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
    };
    const onClose = vi.fn();
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={onClose}
        fullscreenAdapter={adapter}
      />,
    );

    const stage = document.querySelector<HTMLElement>(".viewer-stage");
    const viewer = screen.getByRole("region", { name: "Multi Page ビューワ" });
    expect(stage).not.toBeNull();
    expect(document.querySelector(".page-zone")).not.toBeInTheDocument();

    fireEvent.click(stage!);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.doubleClick(stage!);
    await waitFor(() => expect(viewer).toHaveAttribute("data-fullscreen", "true"));
    expect(adapter.enter).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.doubleClick(stage!);
    await waitFor(() => expect(viewer).toHaveAttribute("data-fullscreen", "false"));
    expect(adapter.exit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
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

  it("starts context-menu fullscreen and advances slideshow pages", async () => {
    const adapter = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn().mockResolvedValue(undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
    };
    vi.useFakeTimers();
    try {
      render(
        <Viewer
          session={multiPageSession}
          generation={1}
          initialMode="single"
          initialDirection="rightToLeft"
          initialFullscreen
          slideshowIntervalMs={600}
          fullscreenAdapter={adapter}
          onSettingsChange={() => undefined}
          onClose={() => undefined}
        />,
      );
      await act(async () => Promise.resolve());
      expect(adapter.enter).toHaveBeenCalledTimes(1);
      expect(document.querySelector(".viewer")).toHaveAttribute("data-slideshow", "true");
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
      markPrefetchedPagesReady();
      await act(async () => vi.advanceTimersByTime(600));
      expect(screen.getByText("2 / 2")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("FT-B15-001 resolves stale bookmark ordinals by pageKey and opens them from the list", async () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        bookmarks={[{
          itemKey: multiPageSession.itemKey,
          pageIndex: 0,
          pageKey: "2.png",
          createdAt: 1,
        }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "しおり一覧" }));
    const dialog = screen.getByRole("dialog", { name: "しおり一覧" });
    fireEvent.click(screen.getByRole("button", { name: "2ページ: 2.png" }));
    expect(dialog).not.toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("FT-B18-003 closes a detached viewer with one Escape instead of only toggling its shell", async () => {
    const onClose = vi.fn();
    const onToggleDetached = vi.fn();
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={onClose}
        detached
        onToggleDetached={onToggleDetached}
      />,
    );

    const detachButton = screen.getByRole("button", { name: "画像表示を統合" });
    detachButton.focus();
    fireEvent.keyDown(detachButton, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onToggleDetached).not.toHaveBeenCalled();
  });

  it("FT-B19-003 connects configured swipe gestures to page movement", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        mouseGestures={{
          swipeLeft: "nextPage",
          swipeRight: "previousPage",
          doubleClick: "none",
        }}
      />,
    );

    const stage = document.querySelector<HTMLElement>(".viewer-stage");
    expect(stage).not.toBeNull();
    markPrefetchedPagesReady();
    fireEvent.pointerDown(stage!, { clientX: 100 });
    fireEvent.pointerUp(stage!, { clientX: 0 });
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.pointerDown(stage!, { clientX: 0 });
    fireEvent.pointerUp(stage!, { clientX: 100 });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });
});
