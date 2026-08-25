import { describe, expect, it, vi } from "vitest";
import { applyAlwaysOnTop, applyWindowTheme } from "./window";

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

describe("native window theme boundary", () => {
  it.each(["light", "dark", null] as const)(
    "forwards %s and reports success",
    async (theme) => {
      const adapter = { setTheme: vi.fn().mockResolvedValue(undefined) };

      await expect(applyWindowTheme(adapter, theme)).resolves.toBe(true);
      expect(adapter.setTheme).toHaveBeenCalledWith(theme);
    },
  );

  it("reports native failure without throwing", async () => {
    const adapter = { setTheme: vi.fn().mockRejectedValue(new Error("denied")) };

    await expect(applyWindowTheme(adapter, "dark")).resolves.toBe(false);
  });
});
