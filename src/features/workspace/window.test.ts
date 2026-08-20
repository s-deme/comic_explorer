import { describe, expect, it, vi } from "vitest";
import { applyAlwaysOnTop } from "./window";

describe("always-on-top window boundary", () => {
  it("reports native success and failure without throwing", async () => {
    const success = { setAlwaysOnTop: vi.fn().mockResolvedValue(undefined) };
    const failure = { setAlwaysOnTop: vi.fn().mockRejectedValue(new Error("denied")) };

    await expect(applyAlwaysOnTop(success, true)).resolves.toBe(true);
    await expect(applyAlwaysOnTop(failure, false)).resolves.toBe(false);
    expect(success.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(failure.setAlwaysOnTop).toHaveBeenCalledWith(false);
  });
});
