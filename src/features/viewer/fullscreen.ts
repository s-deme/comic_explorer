import { getCurrentWindow } from "@tauri-apps/api/window";
import { setFullscreenDisplayAwake } from "../library/client";

export interface FullscreenAdapter {
  enter: () => Promise<void>;
  exit: () => Promise<void>;
  isFullscreen: () => Promise<boolean>;
  setDisplayAwake?: (enabled: boolean) => Promise<void>;
}

export const tauriFullscreenAdapter: FullscreenAdapter = {
  enter: async () => {
    await getCurrentWindow().setFullscreen(true);
  },
  exit: async () => {
    await getCurrentWindow().setFullscreen(false);
  },
  isFullscreen: async () => getCurrentWindow().isFullscreen(),
  setDisplayAwake: async (enabled) => {
    const response = await setFullscreenDisplayAwake(enabled, 0);
    if (response.status !== "ok" || response.data !== enabled) {
      throw new Error("display awake request was rejected");
    }
  },
};
