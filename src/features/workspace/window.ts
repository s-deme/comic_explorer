import { getCurrentWindow } from "@tauri-apps/api/window";

export interface AlwaysOnTopAdapter {
  setAlwaysOnTop(value: boolean): Promise<void>;
}

export const tauriAlwaysOnTopAdapter: AlwaysOnTopAdapter = {
  setAlwaysOnTop(value) {
    return getCurrentWindow().setAlwaysOnTop(value);
  },
};

export async function applyAlwaysOnTop(
  adapter: AlwaysOnTopAdapter,
  value: boolean,
): Promise<boolean> {
  try {
    await adapter.setAlwaysOnTop(value);
    return true;
  } catch {
    return false;
  }
}
