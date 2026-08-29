import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useLibraryDiagnostics } from "./useLibraryDiagnostics";

describe("useLibraryDiagnostics", () => {
  it("uses the current report as a retry baseline and exposes the native result", async () => {
    const diagnoseLibrary = vi.fn()
      .mockResolvedValueOnce({
        status: "ok",
        data: { snapshot: [{ itemRelativePath: "one.cbz" }], summary: {}, findings: [] },
      })
      .mockResolvedValueOnce({ status: "cancelled" });
    const cancelLibraryDiagnostics = vi.fn().mockResolvedValue({ status: "ok" });
    const { result } = renderHook(() => useLibraryDiagnostics({
      diagnoseLibrary,
      cancelLibraryDiagnostics,
    }));

    await act(() => result.current.runDiagnostics());
    expect(result.current.diagnosticReport?.snapshot).toEqual([{ itemRelativePath: "one.cbz" }]);

    await act(() => result.current.runDiagnostics(true));
    expect(diagnoseLibrary).toHaveBeenLastCalledWith(
      [{ itemRelativePath: "one.cbz" }],
      2,
      true,
    );
    expect(result.current.diagnosticNotice).toBe("ライブラリ診断をキャンセルしました。");

    result.current.cancelDiagnostics();
    expect(cancelLibraryDiagnostics).toHaveBeenCalledWith(2);
  });

  it("does not let an older native response replace a newer report", async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    let resolveSecond: (value: unknown) => void = () => undefined;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    const second = new Promise((resolve) => { resolveSecond = resolve; });
    const diagnoseLibrary = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const { result } = renderHook(() => useLibraryDiagnostics({
      diagnoseLibrary,
      cancelLibraryDiagnostics: vi.fn(),
    }));

    act(() => { void result.current.runDiagnostics(); });
    act(() => { void result.current.runDiagnostics(true); });
    await act(async () => { resolveSecond({
      status: "ok",
      data: { snapshot: [{ itemIdentity: "new" }], summary: {}, findings: [] },
    }); });
    await act(async () => { resolveFirst({
      status: "ok",
      data: { snapshot: [{ itemIdentity: "old" }], summary: {}, findings: [] },
    }); });

    expect(result.current.diagnosticReport?.snapshot).toEqual([{ itemIdentity: "new" }]);
    expect(result.current.diagnosticsLoading).toBe(false);
  });
});
