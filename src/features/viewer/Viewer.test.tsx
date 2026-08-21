import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  copyViewerPageToClipboard,
  loadPage,
  resolveViewerRectangleZoom,
  saveReadingPosition,
  activateViewerFilterSet,
  deleteViewerFilterSet,
  listViewerFilterSets,
  saveViewerFilterSet,
} from "../library/client";
import { DEFAULT_MOUSE_GESTURES } from "../settings/profile";
import { DEFAULT_VIEWER_QUADRANT_BINDINGS } from "../input/viewer-quadrants";
import { Viewer } from "./Viewer";

vi.mock("../library/client", () => ({
  copyViewerPageToClipboard: vi.fn(),
  loadPage: vi.fn(),
  resolveViewerRectangleZoom: vi.fn(),
  saveReadingPosition: vi.fn(),
  activateViewerFilterSet: vi.fn(),
  deleteViewerFilterSet: vi.fn(),
  listViewerFilterSets: vi.fn(),
  saveViewerFilterSet: vi.fn(),
}));

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
    .forEach((image) => {
      Object.defineProperties(image, {
        naturalWidth: { configurable: true, value: 800 },
        naturalHeight: { configurable: true, value: 1000 },
      });
      fireEvent.load(image);
    });
}

describe("Viewer settings", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.mocked(loadPage).mockReset();
    vi.mocked(saveReadingPosition).mockReset();
    vi.mocked(resolveViewerRectangleZoom).mockReset();
    vi.mocked(copyViewerPageToClipboard).mockReset();
    vi.mocked(activateViewerFilterSet).mockReset();
    vi.mocked(deleteViewerFilterSet).mockReset();
    vi.mocked(listViewerFilterSets).mockReset();
    vi.mocked(saveViewerFilterSet).mockReset();
  });

  beforeEach(() => {
    vi.mocked(loadPage).mockImplementation(() => new Promise(() => undefined));
    vi.mocked(saveReadingPosition).mockResolvedValue({
      status: "ok",
      requestId: "position" as never,
      generation: 1 as never,
      data: undefined,
    });
    vi.mocked(resolveViewerRectangleZoom).mockResolvedValue({
      status: "ok",
      requestId: "rectangle-zoom" as never,
      generation: 1 as never,
      data: { scale: 2, scrollLeft: 100, scrollTop: 80 },
    });
    vi.mocked(copyViewerPageToClipboard).mockResolvedValue({
      status: "ok",
      requestId: "clipboard-image" as never,
      generation: 1 as never,
      data: {
        pageRelativePath: "1.png",
        width: 800,
        height: 1_000,
        payloadBytes: 3_200_124,
      },
    });
    const filterCatalog = {
      sets: [{ id: 4, name: "Scan", chain: [{ enabled: true, filter: { kind: "grayscale" as const } }], active: true, updatedAtMs: 1 }],
      maximumSets: 32,
      maximumSteps: 16,
    };
    vi.mocked(listViewerFilterSets).mockResolvedValue({ status: "ok", requestId: "filters" as never, generation: 1 as never, data: filterCatalog });
    vi.mocked(activateViewerFilterSet).mockResolvedValue({ status: "ok", requestId: "filters" as never, generation: 1 as never, data: filterCatalog });
    vi.mocked(saveViewerFilterSet).mockResolvedValue({ status: "ok", requestId: "filters" as never, generation: 1 as never, data: filterCatalog });
    vi.mocked(deleteViewerFilterSet).mockResolvedValue({ status: "ok", requestId: "filters" as never, generation: 1 as never, data: filterCatalog });
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
    expect(screen.getByRole("combobox", { name: "表示枚数" })).toHaveValue("spread");
    expect(screen.getByText("左開き")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "単ページへ" }));
    expect(onSettingsChange).toHaveBeenCalledWith("single", "leftToRight");
    fireEvent.click(screen.getByRole("button", { name: "読み方向" }));
    expect(onSettingsChange).toHaveBeenLastCalledWith("single", "rightToLeft");
  });

  it("REQ-LEY-P2-004 selects automatic mode and responds to viewport width", async () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
      const onSettingsChange = vi.fn();
      render(
        <Viewer
          session={multiPageSession}
          generation={1}
          initialMode="auto"
          initialDirection="rightToLeft"
          onSettingsChange={onSettingsChange}
          onClose={() => undefined}
        />,
      );
      expect(screen.getByRole("combobox", { name: "表示枚数" })).toHaveValue("auto");
      expect(document.querySelector(".page-spread"))
        .toHaveAttribute("data-effective-view-mode", "spread");

      Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
      fireEvent(window, new Event("resize"));
      await waitFor(() => expect(document.querySelector(".page-spread"))
        .toHaveAttribute("data-effective-view-mode", "single"));

      fireEvent.change(screen.getByRole("combobox", { name: "表示枚数" }), {
        target: { value: "spread" },
      });
      expect(onSettingsChange).toHaveBeenCalledWith("spread", "rightToLeft");
      expect(document.querySelector(".page-spread"))
        .toHaveAttribute("data-effective-view-mode", "spread");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
  });

  it("REQ-LEY-P2-005 applies persisted cover and even-page pairing rules", () => {
    const fourPageSession = {
      ...multiPageSession,
      pages: [0, 1, 2, 3].map((index) => ({
        id: `spread-${index}` as never,
        relativePath: `${index + 1}.png` as never,
        mediaUri: `comic://localhost/${index + 1}`,
      })),
    };
    render(
      <Viewer
        session={fourPageSession}
        generation={1}
        initialMode="spread"
        spreadRules={{
          portraitMaxAspectPercent: 80,
          autoViewportMinAspectPercent: 160,
          firstPageSingle: true,
          pairing: "even",
        }}
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(document.querySelector(".page-spread"))
      .toHaveAttribute("data-effective-view-mode", "single");
    fireEvent.change(screen.getByRole("slider", { name: "ページ移動" }), {
      target: { value: "1" },
    });
    expect(document.querySelector(".page-spread"))
      .toHaveAttribute("data-effective-view-mode", "spread");
    expect(screen.getByAltText("Multi Page 2ページ")).toBeInTheDocument();
    expect(screen.getByAltText("Multi Page 3ページ")).toBeInTheDocument();
  });

  it("REQ-LEY-P2-006 applies a measured fit scale and keeps unknown dimensions on CSS fallback", async () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 300 });
      render(
        <Viewer
          session={session}
          generation={1}
          initialMode="single"
          fitRules={{ allowUpscale: true, basis: "spread", includePageMargin: true }}
          initialDirection="rightToLeft"
          onSettingsChange={() => undefined}
          onClose={() => undefined}
        />,
      );
      const spread = document.querySelector<HTMLElement>(".page-spread");
      expect(spread).toHaveAttribute("data-fit-scale-active", "false");
      const image = screen.getByAltText("Book 1ページ") as HTMLImageElement;
      Object.defineProperties(image, {
        naturalWidth: { configurable: true, value: 100 },
        naturalHeight: { configurable: true, value: 100 },
      });
      fireEvent.load(image);
      await waitFor(() => expect(spread).toHaveAttribute("data-fit-scale-active", "true"));
      expect(spread?.style.getPropertyValue("--viewer-fit-scale")).toBe("3");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
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
    expect(buttons).toHaveLength(26);
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

  it("REQ-LEY-P5-002 keeps the current anchor and reloads media after Rust filter activation", async () => {
    render(<Viewer session={session} generation={1} initialMode="single" initialDirection="rightToLeft" onSettingsChange={() => undefined} onClose={() => undefined} />);
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "画像フィルター" }));
    fireEvent.click(await screen.findByRole("button", { name: /● Scan/ }));
    fireEvent.click(screen.getByRole("button", { name: "有効にする" }));
    await waitFor(() => expect(activateViewerFilterSet).toHaveBeenCalledWith(4, 1));
    await waitFor(() => expect(loadPage).toHaveBeenCalledWith(session, 0, 1, "visible"));
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("moves to a random non-current page and disables the action for a single page", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.75);
    const { rerender } = render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "ランダムページ" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    rerender(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "ランダムページ" })).toBeDisabled();
    vi.restoreAllMocks();
  });

  it("FT-B23-001 shifts a paged spread by one page without invoking volume navigation", () => {
    const spreadSession = {
      ...multiPageSession,
      pages: [
        ...multiPageSession.pages,
        {
          id: "page-3" as never,
          relativePath: "3.png" as never,
          mediaUri: "comic://localhost/three",
        },
        {
          id: "page-4" as never,
          relativePath: "4.png" as never,
          mediaUri: "comic://localhost/four",
        },
      ],
    };
    const onNextItem = vi.fn();
    const onPreviousItem = vi.fn();
    render(
      <Viewer
        session={spreadSession}
        generation={1}
        initialMode="spread"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        onNextItem={onNextItem}
        onPreviousItem={onPreviousItem}
      />,
    );

    const previousOne = screen.getByRole("button", { name: "見開きを1ページ戻す" });
    const nextOne = screen.getByRole("button", { name: "見開きを1ページ進める" });
    expect(previousOne).toBeDisabled();
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-page-anchor", "0");

    fireEvent.click(nextOne);
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-page-anchor", "1");
    expect(previousOne).toBeEnabled();
    expect(onNextItem).not.toHaveBeenCalled();

    fireEvent.click(previousOne);
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-page-anchor", "0");
    expect(onPreviousItem).not.toHaveBeenCalled();
  });

  it("FT-B23-002 applies validated background, page margin and spread gap settings", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="spread"
        initialDirection="rightToLeft"
        initialBackground="black"
        initialPageMargin={24}
        initialSpreadGap={18}
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    const stage = document.querySelector<HTMLElement>(".viewer-stage");
    expect(stage).toHaveAttribute("data-background", "black");
    expect(stage?.style.getPropertyValue("--viewer-page-margin")).toBe("24px");
    expect(stage?.style.getPropertyValue("--viewer-spread-gap")).toBe("18px");
    expect(stage?.style.getPropertyValue("--viewer-spread-half-gap")).toBe("9px");
  });

  it("FT-B23-003 hides only the stage cursor after inactivity and reveals it on movement", () => {
    vi.useFakeTimers();
    try {
      render(
        <Viewer
          session={session}
          generation={1}
          initialMode="single"
          initialDirection="rightToLeft"
          initialCursorAutoHideMs={2_000}
          onSettingsChange={() => undefined}
          onClose={() => undefined}
        />,
      );

      const stage = document.querySelector<HTMLElement>(".viewer-stage");
      expect(stage).toHaveAttribute("data-cursor-hidden", "false");
      fireEvent.pointerEnter(stage!);
      act(() => vi.advanceTimersByTime(1_999));
      expect(stage).toHaveAttribute("data-cursor-hidden", "false");
      act(() => vi.advanceTimersByTime(1));
      expect(stage).toHaveAttribute("data-cursor-hidden", "true");

      fireEvent.pointerMove(stage!, { clientX: 10, clientY: 10 });
      expect(stage).toHaveAttribute("data-cursor-hidden", "false");
      fireEvent.pointerLeave(stage!);
      act(() => vi.advanceTimersByTime(2_000));
      expect(stage).toHaveAttribute("data-cursor-hidden", "false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("FT-B23-003 keeps the cursor visible while the loupe is active", () => {
    vi.useFakeTimers();
    try {
      render(
        <Viewer
          session={session}
          generation={1}
          initialMode="single"
          initialDirection="rightToLeft"
          initialLoupeEnabled
          initialCursorAutoHideMs={1_000}
          onSettingsChange={() => undefined}
          onClose={() => undefined}
        />,
      );

      const stage = document.querySelector<HTMLElement>(".viewer-stage");
      fireEvent.pointerEnter(stage!);
      act(() => vi.advanceTimersByTime(1_000));
      expect(stage).toHaveAttribute("data-cursor-hidden", "false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("REQ-LEY-P2-009 applies bounded loupe size and zoom without leaving the stage", () => {
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialLoupeEnabled
        loupeSize={240}
        loupeZoom={3.5}
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const stage = document.querySelector<HTMLElement>(".viewer-stage")!;
    const image = screen.getByAltText("Book 1ページ") as HTMLImageElement;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200,
    } as DOMRect);
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200,
    } as DOMRect);

    fireEvent.pointerMove(stage, { clientX: 10, clientY: 10 });
    const loupe = screen.getByRole("img", { name: "ポインタ周辺ルーペ" });
    expect(loupe).toHaveStyle({ left: "120px", top: "100px" });
    expect(loupe.style.getPropertyValue("--viewer-loupe-size")).toBe("240px");
    const loupeSurface = loupe.querySelector<HTMLElement>(".viewer-loupe-surface");
    expect(loupeSurface).toHaveStyle({
      backgroundSize: "1050px 700px",
      backgroundPosition: "85px 85px",
    });
    fireEvent.pointerLeave(stage);
    expect(screen.queryByRole("img", { name: "ポインタ周辺ルーペ" })).not.toBeInTheDocument();
  });

  it("FT-B23-003 suspends cursor hiding for the full pointer drag", () => {
    vi.useFakeTimers();
    try {
      render(
        <Viewer
          session={multiPageSession}
          generation={1}
          initialMode="single"
          initialDirection="rightToLeft"
          initialScaleMode="custom"
          initialScale={2}
          initialCursorAutoHideMs={1_000}
          onSettingsChange={() => undefined}
          onClose={() => undefined}
        />,
      );

      const stage = document.querySelector<HTMLElement>(".viewer-stage");
      const spread = document.querySelector<HTMLElement>(".page-spread");
      Object.defineProperties(spread!, {
        clientWidth: { configurable: true, value: 500 },
        clientHeight: { configurable: true, value: 400 },
        scrollWidth: { configurable: true, value: 1_000 },
        scrollHeight: { configurable: true, value: 800 },
      });

      fireEvent.pointerEnter(stage!);
      fireEvent.pointerDown(stage!, { pointerId: 1, clientX: 200, clientY: 180 });
      act(() => vi.advanceTimersByTime(1_000));
      expect(stage).toHaveAttribute("data-cursor-hidden", "false");
      fireEvent.pointerMove(stage!, { pointerId: 1, clientX: 100, clientY: 80 });
      expect(stage).toHaveAttribute("data-panning", "true");
      act(() => vi.advanceTimersByTime(1_000));
      expect(stage).toHaveAttribute("data-cursor-hidden", "false");

      fireEvent.pointerUp(stage!, { pointerId: 1, clientX: 100, clientY: 80 });
      expect(stage).toHaveAttribute("data-panning", "false");
      act(() => vi.advanceTimersByTime(1_000));
      expect(stage).toHaveAttribute("data-cursor-hidden", "true");
    } finally {
      vi.useRealTimers();
    }
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

  it("loads only the current page and four pages ahead in continuous layouts", async () => {
    const unloadedSession = {
      ...multiPageSession,
      pages: Array.from({ length: 12 }, (_, index) => ({
        id: `page-${index + 1}` as never,
        relativePath: `${index + 1}.png` as never,
        mediaUri: "",
      })),
    };
    render(
      <Viewer
        session={unloadedSession}
        generation={1}
        initialMode="single"
        initialLayoutMode="vertical_scroll"
        initialDirection="leftToRight"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(5));
    expect(vi.mocked(loadPage).mock.calls.map((call) => call[1])).toEqual([0, 1, 2, 3, 4]);

    fireEvent.change(screen.getByRole("slider", { name: "ページ移動" }), {
      target: { value: "8" },
    });

    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(9));
    expect(vi.mocked(loadPage).mock.calls.slice(5).map((call) => call[1]))
      .toEqual([8, 9, 10, 11]);
  });

  it("REQ-LEY-P2-010 applies configurable forward/backward windows and memory limits", async () => {
    const unloadedSession = {
      ...multiPageSession,
      pages: Array.from({ length: 10 }, (_, index) => ({
        id: `page-${index + 1}` as never,
        relativePath: `${index + 1}.png` as never,
        mediaUri: "",
      })),
    };
    vi.mocked(loadPage).mockImplementation(async (_viewer, index, generation) => ({
      status: "ok",
      requestId: `prefetch-${index}` as never,
      generation: generation as never,
      data: {
        pageId: `page-${index + 1}` as never,
        mediaUri: `comic://localhost/prefetch-${index}`,
      },
    }));
    render(
      <Viewer
        session={unloadedSession}
        generation={1}
        initialMode="single"
        initialLayoutMode="vertical_scroll"
        initialDirection="leftToRight"
        prefetchAhead={2}
        prefetchBehind={2}
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(3));
    expect(vi.mocked(loadPage).mock.calls.map((call) => call[1])).toEqual([0, 1, 2]);

    fireEvent.change(screen.getByRole("slider", { name: "ページ移動" }), {
      target: { value: "5" },
    });
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(8));
    expect(vi.mocked(loadPage).mock.calls.slice(3).map((call) => call[1]))
      .toEqual([5, 6, 7, 4, 3]);
    await waitFor(() => {
      expect(document.querySelector('img[data-page-index="0"]')).toBeNull();
      expect(document.querySelector('img[data-page-index="5"]')).not.toBeNull();
    });
  });

  it("REQ-LEY-P2-010 loads a zero-prefetch destination on demand as visible", async () => {
    const unloadedSession = {
      ...multiPageSession,
      pages: multiPageSession.pages.map((page) => ({ ...page, mediaUri: "" })),
    };
    render(
      <Viewer
        session={unloadedSession}
        generation={1}
        initialMode="single"
        initialDirection="leftToRight"
        prefetchAhead={0}
        prefetchBehind={0}
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));
    expect(vi.mocked(loadPage).mock.calls[0]?.[1]).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "次ページ" }));
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(loadPage).mock.calls[1]?.[1]).toBe(1);
    expect(vi.mocked(loadPage).mock.calls[1]?.[3]).toBe("visible");
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
    expect(scaleInput).toHaveAttribute("min", "1");
    expect(scaleInput).toHaveAttribute("max", "800");
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

  it("REQ-LEY-P1-006 converts a requested pixel width and rejects unsafe dimensions", () => {
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
      naturalWidth: { configurable: true, value: 1_000 },
      naturalHeight: { configurable: true, value: 2_000 },
    });

    fireEvent.change(screen.getByRole("spinbutton", { name: "表示幅（px）" }), {
      target: { value: "2500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "表示幅を適用" }));
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "2.5");
    expect(onScaleChange).toHaveBeenLastCalledWith({
      mode: "custom", scale: 2.5, loupeEnabled: false,
    });

    fireEvent.change(screen.getByRole("spinbutton", { name: "表示高さ（px）" }), {
      target: { value: "32769" },
    });
    fireEvent.click(screen.getByRole("button", { name: "表示高さを適用" }));
    expect(screen.getByRole("alert")).toHaveTextContent("1〜32768px");
  });

  it("REQ-LEY-P1-004 resets page-scoped zoom and REQ-LEY-P1-007 overlays a non-interactive grid", async () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialScaleMode="custom"
        initialScale={1.25}
        zoomRetention="page"
        viewerGridEnabled
        viewerGridSize={48}
        viewerGridColor="dark"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const grid = document.querySelector<HTMLElement>(".viewer-grid-overlay");
    expect(grid).toHaveAttribute("data-grid-color", "dark");
    expect(grid?.style.getPropertyValue("--viewer-grid-size")).toBe("48px");
    fireEvent.change(screen.getByRole("spinbutton", { name: "任意倍率（%）" }), {
      target: { value: "200" },
    });
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "2");
    markPrefetchedPagesReady();
    fireEvent.click(screen.getAllByRole("button", { name: "次ページ" })[0]);
    await waitFor(() => {
      expect(screen.getByText("2 / 2")).toBeInTheDocument();
      expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "1.25");
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

  it("REQ-LEY-P1-008 scales pointer pan without changing pages", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialScaleMode="custom"
        initialScale={2}
        panFactor={1.5}
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        mouseGestures={{
          ...DEFAULT_MOUSE_GESTURES,
          swipeLeft: "nextPage",
          swipeRight: "previousPage",
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
    expect(spread).toHaveProperty("scrollLeft", 400);
    expect(spread).toHaveProperty("scrollTop", 350);
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
    prefetched.forEach((image) => Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 800 },
      naturalHeight: { configurable: true, value: 1000 },
    }));
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

  it("REQ-LEY-P2-007 scrolls tall pages in the configured amount in both directions", () => {
    const onPreviousItem = vi.fn();
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialScaleMode="original"
        scrollStepPercent={50}
        smoothScroll={false}
        onPreviousItem={onPreviousItem}
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const spread = document.querySelector<HTMLElement>(".page-spread");
    expect(spread).not.toBeNull();
    Object.defineProperties(spread!, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1100 },
    });
    spread!.scrollTop = 400;
    spread!.scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
      const top = typeof options === "number" ? y : options?.top;
      spread!.scrollTop = top ?? spread!.scrollTop;
    }) as HTMLDivElement["scrollTo"];

    fireEvent.click(screen.getByRole("button", { name: "前ページ" }));
    expect(spread).toHaveProperty("scrollTop", 200);
    expect(onPreviousItem).not.toHaveBeenCalled();
    expect(spread!.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({
      top: 200,
      behavior: "auto",
    }));
    fireEvent.click(screen.getByRole("button", { name: "次ページ" }));
    expect(spread).toHaveProperty("scrollTop", 400);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("REQ-LEY-P3-012 pans in four directions and accelerates continuous key repeat", async () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialScaleMode="original"
        scrollStepPercent={50}
        keyScrollAccelerationPercent={200}
        keyScrollContinuous
        smoothScroll={false}
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const spread = document.querySelector<HTMLElement>(".page-spread")!;
    Object.defineProperties(spread, {
      clientWidth: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 400 },
    });
    spread.scrollLeft = 100;
    spread.scrollTop = 100;
    spread.scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
      if (typeof options === "number") {
        spread.scrollLeft = options;
        spread.scrollTop = y ?? spread.scrollTop;
      } else {
        spread.scrollLeft = options?.left ?? spread.scrollLeft;
        spread.scrollTop = options?.top ?? spread.scrollTop;
      }
    }) as HTMLDivElement["scrollTo"];

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(spread).toHaveProperty("scrollTop", 150);
    fireEvent.keyDown(window, { key: "ArrowDown", repeat: true });
    expect(spread).toHaveProperty("scrollTop", 250);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(spread).toHaveProperty("scrollLeft", 150);
    fireEvent.keyDown(window, { key: "ArrowLeft", repeat: true });
    expect(spread).toHaveProperty("scrollLeft", 50);
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(spread).toHaveProperty("scrollTop", 200);
    expect(spread.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({
      top: 200,
      behavior: "auto",
    }));

    markPrefetchedPagesReady();
    spread.scrollLeft = 0;
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByText("2 / 2")).toBeInTheDocument());
  });

  it("REQ-LEY-P3-012 can suppress repeat and keeps editing and IME input untouched", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialScaleMode="original"
        scrollStepPercent={50}
        keyScrollAccelerationPercent={250}
        keyScrollContinuous={false}
        smoothScroll
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const spread = document.querySelector<HTMLElement>(".page-spread")!;
    Object.defineProperties(spread, {
      clientWidth: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 300 },
    });
    spread.scrollTop = 50;
    spread.scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
      const top = typeof options === "number" ? y : options?.top;
      spread.scrollTop = top ?? spread.scrollTop;
    }) as HTMLDivElement["scrollTo"];

    fireEvent.keyDown(window, { key: "ArrowDown", repeat: true });
    expect(spread).toHaveProperty("scrollTop", 50);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(spread).toHaveProperty("scrollTop", 100);
    expect(spread.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({
      behavior: "smooth",
    }));

    const originalMatchMedia = window.matchMedia;
    try {
      window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as typeof window.matchMedia;
      fireEvent.keyDown(window, { key: "ArrowUp" });
      expect(spread).toHaveProperty("scrollTop", 50);
      expect(spread.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({
        behavior: "auto",
      }));
    } finally {
      window.matchMedia = originalMatchMedia;
    }

    const scale = screen.getByRole("spinbutton", { name: "任意倍率（%）" });
    fireEvent.keyDown(scale, { key: "ArrowDown" });
    expect(spread).toHaveProperty("scrollTop", 50);
    fireEvent.keyDown(window, { key: "ArrowDown", isComposing: true });
    expect(spread).toHaveProperty("scrollTop", 50);
  });

  it("REQ-LEY-P2-007 normalizes and scales wheel input only in continuous layouts", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialLayoutMode="vertical_scroll"
        initialDirection="rightToLeft"
        wheelScrollFactor={1.5}
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const spread = document.querySelector<HTMLElement>(".page-spread");
    const stage = document.querySelector<HTMLElement>(".viewer-stage");
    expect(spread).not.toBeNull();
    expect(stage).not.toBeNull();
    fireEvent.wheel(stage!, { deltaX: 1, deltaY: 2, deltaMode: 1 });
    expect(spread).toHaveProperty("scrollLeft", 24);
    expect(spread).toHaveProperty("scrollTop", 48);
  });

  it("REQ-LEY-P2-008 follows and reverses an atomic N scan before changing pages", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="leftToRight"
        initialScaleMode="original"
        scrollStepPercent={90}
        smoothScroll={false}
        pageScanMode="n"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const spread = document.querySelector<HTMLElement>(".page-spread")!;
    Object.defineProperties(spread, {
      clientWidth: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 300 },
    });
    spread.scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
      if (typeof options === "number") {
        spread.scrollLeft = options;
        spread.scrollTop = y ?? spread.scrollTop;
      } else {
        spread.scrollLeft = options?.left ?? spread.scrollLeft;
        spread.scrollTop = options?.top ?? spread.scrollTop;
      }
    }) as HTMLDivElement["scrollTo"];
    const nextButton = screen.getByRole("button", { name: "次ページ" });
    const previousButton = screen.getByRole("button", { name: "前ページ" });

    fireEvent.click(nextButton);
    expect(spread).toHaveProperty("scrollTop", 90);
    spread.scrollTop = 200;
    fireEvent.click(nextButton);
    expect(spread).toHaveProperty("scrollLeft", 90);
    expect(spread).toHaveProperty("scrollTop", 0);
    fireEvent.click(previousButton);
    expect(spread).toHaveProperty("scrollLeft", 0);
    expect(spread).toHaveProperty("scrollTop", 200);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("REQ-LEY-P2-008 starts a right-to-left Z scan at the right edge", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialScaleMode="original"
        scrollStepPercent={90}
        smoothScroll={false}
        pageScanMode="z"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const spread = document.querySelector<HTMLElement>(".page-spread")!;
    Object.defineProperties(spread, {
      clientWidth: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 300 },
    });
    spread.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
      if (typeof options !== "number") {
        spread.scrollLeft = options?.left ?? spread.scrollLeft;
        spread.scrollTop = options?.top ?? spread.scrollTop;
      }
    }) as HTMLDivElement["scrollTo"];
    fireEvent.click(screen.getByRole("button", { name: "次ページ" }));
    expect(spread).toHaveProperty("scrollLeft", 110);
    expect(spread).toHaveProperty("scrollTop", 0);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
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

  it("connects configurable loupe and fullscreen keyboard commands", async () => {
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
        onClose={() => undefined}
        fullscreenAdapter={adapter}
      />,
    );

    fireEvent.keyDown(window, { key: "l" });
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-loupe-enabled", "true");
    fireEvent.keyDown(window, { key: "F11" });
    await waitFor(() => expect(adapter.enter).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("region", { name: "Book ビューワ" })).toHaveAttribute(
      "data-fullscreen",
      "true",
    );
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

  it("REQ-LEY-P2-011 acquires display-awake after fullscreen and closes on configured Esc", async () => {
    const adapter = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn().mockResolvedValue(undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
      setDisplayAwake: vi.fn().mockResolvedValue(undefined),
    };
    const onClose = vi.fn();
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialFullscreen
        fullscreenEscapeBehavior="closeViewer"
        preventDisplaySleepFullscreen
        fullscreenAdapter={adapter}
        onSettingsChange={() => undefined}
        onClose={onClose}
      />,
    );

    await waitFor(() => expect(adapter.setDisplayAwake).toHaveBeenCalledWith(true));
    expect(adapter.enter.mock.invocationCallOrder[0])
      .toBeLessThan(adapter.setDisplayAwake.mock.invocationCallOrder[0]);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(adapter.setDisplayAwake).toHaveBeenLastCalledWith(false);
    expect(adapter.exit).toHaveBeenCalledTimes(1);
    expect(adapter.setDisplayAwake.mock.invocationCallOrder[1])
      .toBeLessThan(adapter.exit.mock.invocationCallOrder[0]);
  });

  it("REQ-LEY-P2-011 rolls back fullscreen when display-awake acquisition fails", async () => {
    const adapter = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn().mockResolvedValue(undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
      setDisplayAwake: vi.fn().mockRejectedValue(new Error("power API unavailable")),
    };
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        preventDisplaySleepFullscreen
        fullscreenAdapter={adapter}
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "全画面表示" }));
    expect(await screen.findByText(
      "全画面表示を切り替えられません。もう一度お試しください。",
    )).toBeInTheDocument();
    expect(adapter.exit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "Book ビューワ" }))
      .toHaveAttribute("data-fullscreen", "false");
  });

  it("REQ-LEY-P2-011 releases display-awake and native fullscreen on unmount", async () => {
    const adapter = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn().mockResolvedValue(undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
      setDisplayAwake: vi.fn().mockResolvedValue(undefined),
    };
    const view = render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        initialFullscreen
        preventDisplaySleepFullscreen
        fullscreenAdapter={adapter}
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    await waitFor(() => expect(adapter.setDisplayAwake).toHaveBeenCalledWith(true));

    view.unmount();

    await waitFor(() => expect(adapter.setDisplayAwake).toHaveBeenLastCalledWith(false));
    expect(adapter.exit).toHaveBeenCalledTimes(1);
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

  it("REQ-LEY-P2-001 starts and stops a fixed-interval slideshow from the toolbar", async () => {
    vi.useFakeTimers();
    try {
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
      markPrefetchedPagesReady();
      fireEvent.click(screen.getByRole("button", { name: "スライドショーを開始" }));
      expect(document.querySelector(".viewer")).toHaveAttribute("data-slideshow", "true");
      await act(async () => vi.advanceTimersByTime(2_999));
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
      await act(async () => vi.advanceTimersByTime(1));
      expect(screen.getByText("2 / 2")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "スライドショーを停止" }));
      await act(async () => vi.advanceTimersByTime(3_000));
      expect(screen.getByText("2 / 2")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("REQ-LEY-P2-001 pauses while the window is unfocused and waits a fresh interval", async () => {
    vi.useFakeTimers();
    try {
      render(
        <Viewer
          session={multiPageSession}
          generation={1}
          initialMode="single"
          initialDirection="rightToLeft"
          slideshowIntervalMs={600}
          onSettingsChange={() => undefined}
          onClose={() => undefined}
        />,
      );
      markPrefetchedPagesReady();
      fireEvent(window, new Event("blur"));
      await act(async () => vi.advanceTimersByTime(1_200));
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
      fireEvent(window, new Event("focus"));
      await act(async () => vi.advanceTimersByTime(599));
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
      await act(async () => vi.advanceTimersByTime(1));
      expect(screen.getByText("2 / 2")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("REQ-LEY-P2-013 uses the configured reverse interval and repeats inside the item", async () => {
    vi.useFakeTimers();
    try {
      render(
        <Viewer
          session={{ ...multiPageSession, startIndex: 0 }}
          generation={1}
          initialMode="single"
          initialDirection="rightToLeft"
          initialSlideshow
          slideshowIntervalMs={500}
          slideshowOrder="reverse"
          slideshowRepeatCurrentItem
          onSettingsChange={() => undefined}
          onClose={() => undefined}
        />,
      );
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
      await act(async () => vi.advanceTimersByTime(499));
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
      await act(async () => vi.advanceTimersByTime(1));
      expect(screen.getByText("2 / 2")).toBeInTheDocument();
      expect(document.querySelector(".viewer")).toHaveAttribute("data-slideshow-order", "reverse");
      expect(document.querySelector(".viewer")).toHaveAttribute("data-slideshow-repeat-current", "true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("REQ-LEY-P2-013 visits every random page once and stops after one bounded cycle", async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const randomSession = {
        ...multiPageSession,
        pages: [
          ...multiPageSession.pages,
          { id: "page-3" as never, relativePath: "3.png" as never, mediaUri: "comic://localhost/three" },
          { id: "page-4" as never, relativePath: "4.png" as never, mediaUri: "comic://localhost/four" },
        ],
      };
      render(
        <Viewer
          session={randomSession}
          generation={1}
          initialMode="single"
          initialDirection="rightToLeft"
          initialSlideshow
          slideshowIntervalMs={500}
          slideshowOrder="random"
          onSettingsChange={() => undefined}
          onClose={() => undefined}
        />,
      );
      const visited = new Set([screen.getByText(/1 \/ 4/).textContent]);
      for (let step = 0; step < 3; step += 1) {
        await act(async () => vi.advanceTimersByTime(500));
        visited.add(screen.getByText(/\d \/ 4/).textContent);
      }
      expect(visited.size).toBe(4);
      expect(document.querySelector(".viewer")).toHaveAttribute("data-slideshow", "false");
      const finalPage = screen.getByText(/\d \/ 4/).textContent;
      await act(async () => vi.advanceTimersByTime(1_000));
      expect(screen.getByText(/\d \/ 4/).textContent).toBe(finalPage);
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it("REQ-LEY-P2-014 copies only the current anchor page through the native image clipboard", async () => {
    let resolveCopy: ((value: Awaited<ReturnType<typeof copyViewerPageToClipboard>>) => void) | undefined;
    vi.mocked(copyViewerPageToClipboard).mockReturnValueOnce(new Promise((resolve) => {
      resolveCopy = resolve;
    }));
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="spread"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const button = screen.getByRole("button", { name: "現在ページの画像をコピー" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByText("ページ 1 をクリップボードへコピーしています。")).toBeInTheDocument();
    expect(copyViewerPageToClipboard).toHaveBeenCalledWith(multiPageSession, 0, 1);
    resolveCopy?.({
      status: "ok",
      requestId: "clipboard-image" as never,
      generation: 1 as never,
      data: { pageRelativePath: "1.png", width: 800, height: 1_000, payloadBytes: 3_200_124 },
    });
    await waitFor(() => expect(screen.getByText("ページ 1 を 800×1000px の画像としてコピーしました。"))
      .toBeInTheDocument());
    expect(button).not.toBeDisabled();
  });

  it("REQ-LEY-P2-014 suppresses a completed copy result after the page changes", async () => {
    let resolveCopy: ((value: Awaited<ReturnType<typeof copyViewerPageToClipboard>>) => void) | undefined;
    vi.mocked(copyViewerPageToClipboard).mockReturnValueOnce(new Promise((resolve) => {
      resolveCopy = resolve;
    }));
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
    markPrefetchedPagesReady();
    fireEvent.click(screen.getByRole("button", { name: "現在ページの画像をコピー" }));
    fireEvent.click(screen.getByRole("button", { name: "次ページ" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    resolveCopy?.({
      status: "ok",
      requestId: "clipboard-stale" as never,
      generation: 1 as never,
      data: { pageRelativePath: "1.png", width: 800, height: 1_000, payloadBytes: 3_200_124 },
    });
    await act(async () => Promise.resolve());
    expect(screen.queryByText(/画像としてコピーしました/)).not.toBeInTheDocument();
  });

  it("REQ-LEY-P2-016 rotates and flips only the current anchor without changing its media URI", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="spread"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const first = screen.getByAltText("Multi Page 1ページ") as HTMLImageElement;
    const second = screen.getByAltText("Multi Page 2ページ") as HTMLImageElement;
    const reset = screen.getByRole("button", { name: "回転・反転をリセット" });
    expect(reset).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "時計回りに90度回転" }));
    fireEvent.click(screen.getByRole("button", { name: "左右反転" }));
    fireEvent.click(screen.getByRole("button", { name: "上下反転" }));

    expect(first).toHaveAttribute("src", "comic://localhost/one");
    expect(first).toHaveAttribute("data-quarter-turns", "1");
    expect(first).toHaveAttribute("data-flip-horizontal", "true");
    expect(first).toHaveAttribute("data-flip-vertical", "true");
    expect(first).toHaveStyle({ transform: "scaleX(-1) scaleY(-1) rotate(90deg)" });
    expect(second).toHaveAttribute("data-quarter-turns", "0");
    expect(second).toHaveStyle({ transform: "scaleX(1) scaleY(1) rotate(0deg)" });
    expect(reset).toBeEnabled();

    fireEvent.click(reset);
    expect(first).toHaveAttribute("data-image-transformed", "false");
    expect(reset).toBeDisabled();
  });

  it("REQ-LEY-P2-016 keeps page transforms for the Viewer session and isolates fixed keys from editors", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialLayoutMode="vertical_scroll"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const first = screen.getByAltText("Multi Page 1ページ") as HTMLImageElement;
    fireEvent.keyDown(window, { key: "]" });
    expect(first).toHaveAttribute("data-quarter-turns", "1");

    const pixelInput = screen.getByRole("spinbutton", { name: "表示幅（px）" });
    fireEvent.keyDown(pixelInput, { key: "h" });
    expect(first).toHaveAttribute("data-flip-horizontal", "false");

    const second = screen.getByAltText("Multi Page 2ページ") as HTMLImageElement;
    fireEvent.focus(second.closest(".viewer-page")!);
    fireEvent.keyDown(window, { key: "v" });
    expect(second).toHaveAttribute("data-flip-vertical", "true");
    fireEvent.focus(screen.getByRole("article", { name: "ページ 1" }));
    expect(screen.getByRole("button", { name: "回転・反転をリセット" })).toBeEnabled();
  });

  it("REQ-LEY-P2-016 uses transformed dimensions for automatic spread pairing and the loupe", async () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="spread"
        initialDirection="rightToLeft"
        initialLoupeEnabled
        onSettingsChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const stage = document.querySelector<HTMLElement>(".viewer-stage")!;
    const first = screen.getByAltText("Multi Page 1ページ") as HTMLImageElement;
    Object.defineProperties(first, {
      naturalWidth: { configurable: true, value: 600 },
      naturalHeight: { configurable: true, value: 1_000 },
    });
    fireEvent.load(first);
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-effective-view-mode", "spread");
    fireEvent.click(screen.getByRole("button", { name: "時計回りに90度回転" }));
    await waitFor(() => expect(document.querySelector(".page-spread"))
      .toHaveAttribute("data-effective-view-mode", "single"));

    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300,
    } as DOMRect);
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, right: 200, bottom: 300, width: 200, height: 300,
    } as DOMRect);
    fireEvent.pointerMove(stage, { clientX: 100, clientY: 150 });
    const surface = screen.getByRole("img", { name: "ポインタ周辺ルーペ" })
      .querySelector<HTMLElement>(".viewer-loupe-surface");
    expect(surface).toHaveAttribute("data-quarter-turns", "1");
    expect(surface).toHaveStyle({ transform: "scaleX(1) scaleY(1) rotate(90deg)" });
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

  it("REQ-LEY-P2-003 keeps a missing-page bookmark visible and removable", () => {
    const onDeleteBookmark = vi.fn();
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
          pageIndex: 12,
          pageKey: "removed.png",
          createdAt: 1,
        }]}
        onDeleteBookmark={onDeleteBookmark}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "しおり一覧" }));
    expect(screen.getByRole("button", {
      name: "removed.png（現在の作品では見つかりません）",
    })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "しおりを削除: removed.png" }));
    expect(onDeleteBookmark).toHaveBeenCalledWith("removed.png");
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

  it("FT-B19-003 and REQ-LEY-P1-009 connect gestures with a wheel dead zone", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        wheelDeadZone={60}
        mouseGestures={{
          ...DEFAULT_MOUSE_GESTURES,
          swipeLeft: "nextPage",
          swipeRight: "previousPage",
          middleClick: "toggleDirection",
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

    fireEvent.wheel(stage!, { deltaY: 30 });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.wheel(stage!, { deltaY: 120 });
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.wheel(stage!, { deltaY: -120 });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.pointerDown(stage!, { button: 4 });
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.pointerDown(stage!, { button: 3 });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.pointerDown(stage!, { button: 1 });
    expect(screen.getByText("左開き")).toBeInTheDocument();

    fireEvent.pointerDown(stage!, { button: 2 });
    fireEvent.wheel(stage!, { deltaY: -120, buttons: 2 });
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "1.1");
    fireEvent.pointerUp(stage!, { button: 2 });
  });

  it("REQ-LEY-P3-014 maps all four stage quadrants and center boundaries", () => {
    vi.useFakeTimers();
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        quadrantBindings={{
          topLeft: "previousPage",
          topRight: "nextPage",
          bottomLeft: "toggleDirection",
          bottomRight: "zoomIn",
        }}
      />,
    );
    markPrefetchedPagesReady();
    const stage = document.querySelector<HTMLElement>(".viewer-stage")!;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 10, top: 20, width: 100, height: 80,
      right: 110, bottom: 100, x: 10, y: 20, toJSON: () => ({}),
    });
    const click = (x: number, y: number, pointerId: number) => {
      fireEvent.pointerDown(stage, { pointerId, pointerType: "mouse", button: 0, clientX: x, clientY: y });
      fireEvent.pointerUp(stage, { pointerId, pointerType: "mouse", button: 0, clientX: x, clientY: y });
      act(() => vi.advanceTimersByTime(250));
    };

    click(90, 40, 1);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    click(30, 40, 2);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    click(30, 80, 3);
    expect(screen.getByText("左開き")).toBeInTheDocument();
    click(60, 60, 4);
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "1.1");
  });

  it("REQ-LEY-P3-014 protects double click, pan, touch, pen, modifiers, and cleanup", async () => {
    vi.useFakeTimers();
    const adapter = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn().mockResolvedValue(undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
    };
    const onClose = vi.fn();
    const view = render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={onClose}
        fullscreenAdapter={adapter}
        quadrantBindings={{
          ...DEFAULT_VIEWER_QUADRANT_BINDINGS,
          topLeft: "closeViewer",
          topRight: "zoomIn",
        }}
      />,
    );
    const stage = document.querySelector<HTMLElement>(".viewer-stage")!;
    const spread = document.querySelector<HTMLElement>(".page-spread")!;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 100, height: 100,
      right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    });
    Object.defineProperties(spread, {
      clientWidth: { configurable: true, value: 50 },
      clientHeight: { configurable: true, value: 50 },
      scrollWidth: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 100 },
    });

    fireEvent.pointerDown(stage, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 25, clientY: 25 });
    fireEvent.pointerUp(stage, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 25, clientY: 25 });
    fireEvent.doubleClick(stage);
    await act(async () => Promise.resolve());
    act(() => vi.advanceTimersByTime(250));
    expect(adapter.enter).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(stage, { pointerId: 2, pointerType: "mouse", button: 0, clientX: 75, clientY: 25 });
    fireEvent.pointerMove(stage, { pointerId: 2, pointerType: "mouse", button: 0, clientX: 80, clientY: 25 });
    fireEvent.pointerMove(stage, { pointerId: 2, pointerType: "mouse", button: 0, clientX: 75, clientY: 25 });
    fireEvent.pointerUp(stage, { pointerId: 2, pointerType: "mouse", button: 0, clientX: 75, clientY: 25 });
    act(() => vi.advanceTimersByTime(250));
    expect(spread).toHaveAttribute("data-scale", "1");

    for (const [pointerType, modifier] of [
      ["touch", {}],
      ["pen", {}],
      ["mouse", { ctrlKey: true }],
    ] as const) {
      fireEvent.pointerDown(stage, { pointerId: 3, pointerType, button: 0, clientX: 75, clientY: 25, ...modifier });
      fireEvent.pointerUp(stage, { pointerId: 3, pointerType, button: 0, clientX: 75, clientY: 25, ...modifier });
    }
    act(() => vi.advanceTimersByTime(250));
    expect(spread).toHaveAttribute("data-scale", "1");

    fireEvent.pointerDown(stage, { pointerId: 4, pointerType: "mouse", button: 0, clientX: 75, clientY: 25 });
    fireEvent.pointerUp(stage, { pointerId: 4, pointerType: "mouse", button: 0, clientX: 75, clientY: 25 });
    act(() => vi.advanceTimersByTime(250));
    expect(spread).toHaveAttribute("data-scale", "1.1");

    fireEvent.change(screen.getByRole("combobox", { name: "閲覧レイアウト" }), {
      target: { value: "vertical_scroll" },
    });
    fireEvent.pointerDown(stage, { pointerId: 5, pointerType: "mouse", button: 0, clientX: 75, clientY: 25 });
    fireEvent.pointerUp(stage, { pointerId: 5, pointerType: "mouse", button: 0, clientX: 75, clientY: 25 });
    act(() => vi.advanceTimersByTime(250));
    expect(spread).toHaveAttribute("data-scale", "1.1");
    fireEvent.change(screen.getByRole("combobox", { name: "閲覧レイアウト" }), {
      target: { value: "paged" },
    });

    fireEvent.pointerDown(stage, { pointerId: 6, pointerType: "mouse", button: 0, clientX: 25, clientY: 25 });
    fireEvent.pointerUp(stage, { pointerId: 6, pointerType: "mouse", button: 0, clientX: 25, clientY: 25 });
    view.unmount();
    act(() => vi.advanceTimersByTime(250));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("REQ-LEY-P3-015 dispatches the Rust-validated right-click action in every layout", () => {
    render(
      <Viewer
        session={session}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        rightClickAction="zoomIn"
      />,
    );
    const stage = document.querySelector<HTMLElement>(".viewer-stage")!;
    const rightClick = (pointerId: number) => {
      fireEvent.pointerDown(stage, {
        pointerId, pointerType: "mouse", button: 2, clientX: 20, clientY: 20,
      });
      fireEvent.pointerUp(stage, {
        pointerId, pointerType: "mouse", button: 2, clientX: 20, clientY: 20,
      });
    };

    rightClick(1);
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "1.1");
    fireEvent.change(screen.getByRole("combobox", { name: "閲覧レイアウト" }), {
      target: { value: "vertical_scroll" },
    });
    rightClick(2);
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "1.2");
    fireEvent.change(screen.getByRole("combobox", { name: "閲覧レイアウト" }), {
      target: { value: "horizontal_scroll" },
    });
    rightClick(3);
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "1.3");

    const contextMenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    stage.dispatchEvent(contextMenu);
    expect(contextMenu.defaultPrevented).toBe(true);
  });

  it("REQ-LEY-P3-015 protects movement, non-mouse input, modifiers, cancel, blur, and right-wheel", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        rightClickAction="nextPage"
      />,
    );
    const stage = document.querySelector<HTMLElement>(".viewer-stage")!;

    fireEvent.pointerDown(stage, { pointerId: 1, pointerType: "mouse", button: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(stage, { pointerId: 1, pointerType: "mouse", button: 2, clientX: 14, clientY: 10 });
    fireEvent.pointerMove(stage, { pointerId: 1, pointerType: "mouse", button: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(stage, { pointerId: 1, pointerType: "mouse", button: 2, clientX: 10, clientY: 10 });

    for (const [pointerId, pointerType, modifier] of [
      [2, "touch", {}],
      [3, "pen", {}],
      [4, "mouse", { shiftKey: true }],
    ] as const) {
      fireEvent.pointerDown(stage, { pointerId, pointerType, button: 2, clientX: 10, clientY: 10, ...modifier });
      fireEvent.pointerUp(stage, { pointerId, pointerType, button: 2, clientX: 10, clientY: 10, ...modifier });
    }
    fireEvent.pointerDown(stage, { pointerId: 5, pointerType: "mouse", button: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerCancel(stage, { pointerId: 5, pointerType: "mouse", button: 2 });
    fireEvent.pointerDown(stage, { pointerId: 6, pointerType: "mouse", button: 2, clientX: 10, clientY: 10 });
    fireEvent.blur(window);
    fireEvent.pointerUp(stage, { pointerId: 6, pointerType: "mouse", button: 2, clientX: 10, clientY: 10 });

    fireEvent.pointerDown(stage, { pointerId: 7, pointerType: "mouse", button: 2, clientX: 10, clientY: 10 });
    fireEvent.wheel(stage, { deltaY: -120, buttons: 2 });
    fireEvent.pointerUp(stage, { pointerId: 7, pointerType: "mouse", button: 2, clientX: 10, clientY: 10 });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "1.1");
  });

  it("REQ-LEY-P3-016 draws a clamped rectangle and applies the Rust zoom plan once", async () => {
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
    const stage = document.querySelector<HTMLElement>(".viewer-stage")!;
    const spread = document.querySelector<HTMLElement>(".page-spread")!;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 10, top: 20, width: 1_000, height: 800,
      right: 1_010, bottom: 820, x: 10, y: 20, toJSON: () => ({}),
    });
    const capture = vi.fn();
    Object.defineProperty(stage, "setPointerCapture", { configurable: true, value: capture });
    Object.defineProperties(spread, {
      clientWidth: { configurable: true, value: 1_000 },
      clientHeight: { configurable: true, value: 800 },
      scrollWidth: { configurable: true, value: 2_000 },
      scrollHeight: { configurable: true, value: 1_600 },
    });

    const toggle = screen.getByRole("button", { name: "矩形ズーム" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerDown(stage, {
      pointerId: 81, pointerType: "mouse", button: 0, clientX: 260, clientY: 220,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 81, pointerType: "mouse", button: 0, clientX: 760, clientY: 620,
    });
    expect(capture).toHaveBeenCalledWith(81);
    expect(document.querySelector(".viewer-rectangle-zoom-selection")).toHaveStyle({
      left: "250px", top: "200px", width: "500px", height: "400px",
    });
    fireEvent.pointerUp(stage, {
      pointerId: 81, pointerType: "mouse", button: 0, clientX: 1_050, clientY: 900,
    });

    await waitFor(() => expect(resolveViewerRectangleZoom).toHaveBeenCalledWith(
      expect.objectContaining({
        viewportWidth: 1_000,
        viewportHeight: 800,
        selectionLeft: 250,
        selectionTop: 200,
        selectionWidth: 750,
        selectionHeight: 600,
        currentScale: 1,
      }),
      1,
    ));
    await waitFor(() => expect(spread).toHaveAttribute("data-scale", "2"));
    await waitFor(() => {
      expect(spread.scrollLeft).toBe(100);
      expect(spread.scrollTop).toBe(80);
    });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(document.querySelector(".viewer-rectangle-zoom-selection")).not.toBeInTheDocument();
  });

  it("REQ-LEY-P3-016 protects conflicting input and cancels without applying", () => {
    render(
      <Viewer
        session={multiPageSession}
        generation={1}
        initialMode="single"
        initialDirection="rightToLeft"
        onSettingsChange={() => undefined}
        onClose={() => undefined}
        rightClickAction="nextPage"
      />,
    );
    const stage = document.querySelector<HTMLElement>(".viewer-stage")!;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 100, height: 100,
      right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    });
    const toggle = screen.getByRole("button", { name: "矩形ズーム" });
    fireEvent.click(toggle);
    fireEvent.wheel(stage, { deltaY: 120 });
    fireEvent.pointerDown(stage, { pointerId: 1, pointerType: "mouse", button: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(stage, { pointerId: 1, pointerType: "mouse", button: 2, clientX: 10, clientY: 10 });
    for (const [pointerId, pointerType, modifier] of [
      [2, "touch", {}],
      [3, "pen", {}],
      [4, "mouse", { ctrlKey: true }],
    ] as const) {
      fireEvent.pointerDown(stage, { pointerId, pointerType, button: 0, clientX: 10, clientY: 10, ...modifier });
      fireEvent.pointerUp(stage, { pointerId, pointerType, button: 0, clientX: 90, clientY: 90, ...modifier });
    }
    fireEvent.pointerDown(stage, { pointerId: 5, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(stage, { pointerId: 5, pointerType: "mouse", button: 0, clientX: 15, clientY: 15 });
    expect(resolveViewerRectangleZoom).not.toHaveBeenCalled();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "1");
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.pointerDown(stage, { pointerId: 6, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(stage, { pointerId: 6, pointerType: "mouse", button: 0, clientX: 90, clientY: 90 });
    fireEvent.pointerCancel(stage, { pointerId: 6, pointerType: "mouse", button: 0 });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    fireEvent.change(screen.getByRole("combobox", { name: "閲覧レイアウト" }), {
      target: { value: "vertical_scroll" },
    });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("REQ-LEY-P3-016 ignores stale plans and presents Rust validation errors", async () => {
    vi.mocked(resolveViewerRectangleZoom)
      .mockResolvedValueOnce({
        status: "ok",
        requestId: "stale-rectangle" as never,
        generation: 0 as never,
        data: { scale: 4, scrollLeft: 200, scrollTop: 200 },
      })
      .mockResolvedValueOnce({
        status: "error",
        requestId: "invalid-rectangle" as never,
        generation: 1 as never,
        error: {
          code: "INVALID_REQUEST",
          message: "invalid geometry",
          retryable: false,
        },
      });
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
    const stage = document.querySelector<HTMLElement>(".viewer-stage")!;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 100, height: 100,
      right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    });
    const toggle = screen.getByRole("button", { name: "矩形ズーム" });
    const select = (pointerId: number) => {
      fireEvent.click(toggle);
      fireEvent.pointerDown(stage, {
        pointerId, pointerType: "mouse", button: 0, clientX: 20, clientY: 20,
      });
      fireEvent.pointerUp(stage, {
        pointerId, pointerType: "mouse", button: 0, clientX: 80, clientY: 80,
      });
    };

    select(91);
    await waitFor(() => expect(resolveViewerRectangleZoom).toHaveBeenCalledTimes(1));
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "1");
    select(92);
    expect(await screen.findByRole("alert")).toHaveTextContent("対応していません");
    expect(document.querySelector(".page-spread")).toHaveAttribute("data-scale", "1");
  });
});
