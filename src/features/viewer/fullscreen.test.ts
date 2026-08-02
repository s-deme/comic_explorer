import { describe, expect, it, vi } from "vitest";
import { tauriFullscreenAdapter } from "./fullscreen";

const windowMock = vi.hoisted(() => ({
  isFullscreen: vi.fn<() => Promise<boolean>>(),
  setFullscreen: vi.fn<(value: boolean) => Promise<void>>(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMock,
}));

describe("Tauri fullscreen adapter", () => {
  it("FT-B04-004 delegates enter, exit and state reads to the current OS window", async () => {
    windowMock.setFullscreen.mockResolvedValue(undefined);
    windowMock.isFullscreen.mockResolvedValue(true);

    await tauriFullscreenAdapter.enter();
    await tauriFullscreenAdapter.exit();
    await expect(tauriFullscreenAdapter.isFullscreen()).resolves.toBe(true);

    expect(windowMock.setFullscreen).toHaveBeenNthCalledWith(1, true);
    expect(windowMock.setFullscreen).toHaveBeenNthCalledWith(2, false);
    expect(windowMock.isFullscreen).toHaveBeenCalledTimes(1);
  });
});
