import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadPage, type ViewerSession } from "../library/client";
import { PagePreviewDialog } from "./PagePreviewDialog";

vi.mock("../library/client", () => ({ loadPage: vi.fn() }));
const session = {
  itemKey: "book.cbz", displayName: "Book", startIndex: 0,
  pages: [0, 1, 2].map((index) => ({ id: `p${index}`, relativePath: `${index}.png`, mediaUri: "" })),
} as ViewerSession;
const response = (uri: string) => ({ status: "ok" as const, generation: 1 as never, requestId: "p" as never, data: { pageId: "p" as never, mediaUri: uri } });

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  vi.mocked(loadPage).mockReset();
});
afterEach(cleanup);

it("REQ-VIEW-023 previews without moving, recovers from failure and commits only on selection", async () => {
  vi.mocked(loadPage).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(response("/page.png"));
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<PagePreviewDialog session={session} generation={1} initialIndex={0} onSelect={onSelect} onClose={onClose} />);
  fireEvent.click(await screen.findByRole("button", { name: "再試行" }));
  expect(await screen.findByAltText("1ページのプレビュー")).toHaveAttribute("src", "/page.png");
  fireEvent.change(screen.getByLabelText("プレビューページ"), { target: { value: "3" } });
  await screen.findByAltText("3ページのプレビュー");
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("このページへ移動"));
  expect(onSelect).toHaveBeenCalledWith(2);
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false, cancelable: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledTimes(1);
});

it("REQ-VIEW-023 serializes requests and discards superseded responses", async () => {
  let resolve!: (value: ReturnType<typeof response>) => void;
  vi.mocked(loadPage).mockImplementationOnce(() => new Promise((done) => { resolve = done; }))
    .mockResolvedValue(response("/latest.png"));
  render(<PagePreviewDialog session={session} generation={1} initialIndex={0} onSelect={vi.fn()} onClose={vi.fn()} />);
  await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("プレビューページ"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("プレビューページ"), { target: { value: "3" } });
  await act(async () => { resolve(response("/stale.png")); });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(await screen.findByAltText("3ページのプレビュー")).toHaveAttribute("src", "/latest.png");
  expect(loadPage).toHaveBeenCalledTimes(2);
  expect(loadPage).toHaveBeenLastCalledWith(session, 2, 1, "near");
});
