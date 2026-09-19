// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { tauriFullscreenAdapter } from "./fullscreen";

const windowMock = vi.hoisted(() => ({
  isFullscreen: vi.fn<() => Promise<boolean>>(),
  setFullscreen: vi.fn<(value: boolean) => Promise<void>>(),
}));
const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMock,
}));

describe("Tauri fullscreen adapter", () => {

  it("REQ-LEY-P2-011 delegates bounded fullscreen display-awake requests", async () => {
    invokeMock
      .mockResolvedValueOnce({ status: "ok", data: true })
      .mockResolvedValueOnce({ status: "ok", data: false });

    await tauriFullscreenAdapter.setDisplayAwake?.(true);
    await tauriFullscreenAdapter.setDisplayAwake?.(false);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "set_fullscreen_display_awake", {
      context: expect.objectContaining({ apiVersion: 1, generation: 0 }),
      enabled: true,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "set_fullscreen_display_awake", {
      context: expect.objectContaining({ apiVersion: 1, generation: 0 }),
      enabled: false,
    });
  });
});
