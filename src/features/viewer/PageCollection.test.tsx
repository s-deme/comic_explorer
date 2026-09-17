import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadPage, type ViewerSession } from "../library/client";
import { PageCollection } from "./PageCollection";

vi.mock("../library/client", () => ({ loadPage: vi.fn() }));
const session = { itemKey: "book", displayName: "Book", startIndex: 0,
  pages: Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}`, relativePath: `${i}.png`, mediaUri: "" })) } as ViewerSession;
beforeEach(() => {
  vi.mocked(loadPage).mockReset().mockResolvedValue({ status: "ok", generation: 1, requestId: "p", data: { pageId: "p", mediaUri: "/page.png" } } as never);
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(cleanup);

it("REQ-VIEW-025 bounds the page index and recovers a failed page without navigating", async () => {
  vi.mocked(loadPage).mockRejectedValueOnce(new Error("failed"));
  const onIndex = vi.fn();
  render(<PageCollection session={session} generation={1} index={0} grid onIndex={onIndex} />);
  fireEvent.click(await screen.findByRole("button", { name: "1ページを再試行" }));
  await screen.findByAltText("1ページ");
  expect(vi.mocked(loadPage).mock.calls.length).toBeLessThan(20);
  expect(onIndex).not.toHaveBeenCalled();
  fireEvent.click(screen.getByAltText("2ページ"));
  expect(onIndex).toHaveBeenCalledWith(1);
});

it("REQ-VIEW-026 focuses the continuous reader and tracks the visible page on scroll", async () => {
  const onIndex = vi.fn();
  render(<PageCollection session={session} generation={1} index={0} onIndex={onIndex} />);
  const region = screen.getByRole("region", { name: "連続縦読み" });
  expect(region).toHaveFocus();
  await screen.findByAltText("1ページ");
  Object.defineProperty(region, "scrollTop", { configurable: true, value: 950 });
  fireEvent.scroll(region);
  await waitFor(() => expect(onIndex).toHaveBeenCalledWith(1));
  expect(vi.mocked(loadPage).mock.calls.length).toBeLessThan(10);
});
