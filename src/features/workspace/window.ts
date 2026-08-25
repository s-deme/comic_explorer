import { getCurrentWindow } from "@tauri-apps/api/window";

export interface AlwaysOnTopAdapter {
  setAlwaysOnTop(value: boolean): Promise<void>;
}

export type NativeWindowTheme = "light" | "dark" | null;

export interface WindowThemeAdapter {
  setTheme(value: NativeWindowTheme): Promise<void>;
}

export const tauriAlwaysOnTopAdapter: AlwaysOnTopAdapter = {
  setAlwaysOnTop(value) {
    return getCurrentWindow().setAlwaysOnTop(value);
  },
};

export const tauriWindowThemeAdapter: WindowThemeAdapter = {
  setTheme(value) {
    return getCurrentWindow().setTheme(value);
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

export async function applyWindowTheme(
  adapter: WindowThemeAdapter,
  value: NativeWindowTheme,
): Promise<boolean> {
  try {
    await adapter.setTheme(value);
    return true;
  } catch {
    return false;
  }
}
