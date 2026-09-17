import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { clearReadingHistory, listReadingHistory } from "../library/client";
import { useReadingHistory } from "./useReadingHistory";

vi.mock("../library/client", () => ({ clearReadingHistory: vi.fn(), listReadingHistory: vi.fn() }));

it("does not restore or reopen stale history after it is cleared", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(listReadingHistory).mockReturnValue(new Promise((resolve) => { finish = resolve; }) as never);
  vi.mocked(clearReadingHistory).mockResolvedValue({ status: "ok", data: undefined } as never);
  const onHistoryChange = vi.fn();
  const onOpenRecent = vi.fn();
  const { result } = renderHook(() => useReadingHistory({ onHistoryChange, onOpenRecent }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.refreshHistory(true); });
  await act(() => result.current.clearRecentHistory());
  await act(async () => {
    finish({ status: "ok", data: [{ itemIdentity: "old.cbz" }] });
    await pending;
  });
  expect(onHistoryChange).toHaveBeenCalledExactlyOnceWith([]);
  expect(onOpenRecent).not.toHaveBeenCalled();
  expect(result.current.readingHistory).toEqual([]);
  expect(result.current.historyLoading).toBe(false);
});
