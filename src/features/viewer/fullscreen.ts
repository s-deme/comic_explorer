import { getCurrentWindow } from "@tauri-apps/api/window";

export interface FullscreenAdapter {
  enter: () => Promise<void>;
  exit: () => Promise<void>;
  isFullscreen: () => Promise<boolean>;
}

export const tauriFullscreenAdapter: FullscreenAdapter = {
  enter: async () => {
    await getCurrentWindow().setFullscreen(true);
  },
  exit: async () => {
    await getCurrentWindow().setFullscreen(false);
  },
  isFullscreen: async () => getCurrentWindow().isFullscreen(),
};
