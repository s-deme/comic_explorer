import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ApiResponse } from "../../../types/api";
import type { CliLaunchRequest, WindowsDrive, WindowsKnownFolder, TrayStatus } from "./contracts";
import { context } from "./context";

export async function getTrayStatus(
  generation: number,
): Promise<ApiResponse<TrayStatus>> {
  return invoke("get_tray_status", { context: context(generation) });
}

export async function listWindowsDrives(
  generation: number,
): Promise<ApiResponse<WindowsDrive[]>> {
  return invoke("list_windows_drives", {
    context: context(generation),
  });
}

export async function listWindowsKnownFolders(
  generation: number,
): Promise<ApiResponse<WindowsKnownFolder[]>> {
  return invoke("list_windows_known_folders", { context: context(generation) });
}

export async function listenCliLaunchPending(
  handler: () => void,
): Promise<UnlistenFn> {
  return listen("cli-launch-pending", handler);
}

export async function pickLibraryFile(
  generation: number,
): Promise<ApiResponse<{ absolutePath: string } | null>> {
  return invoke("pick_library_file", { context: context(generation) });
}

export async function pickLibraryRoot(
  generation: number,
): Promise<ApiResponse<{ absolutePath: string } | null>> {
  return invoke("pick_library_root", {
    context: context(generation),
  });
}

export async function pickSearchSource(
  generation: number,
): Promise<ApiResponse<{ absolutePath: string } | null>> {
  return invoke("pick_search_source", { context: context(generation) });
}

export async function quitApplication(
  generation: number,
): Promise<ApiResponse<void>> {
  return invoke("quit_application", { context: context(generation) });
}

export async function registerLibraryRoot(
  absolutePath: string,
  generation: number,
): Promise<ApiResponse<{ absolutePath: string }>> {
  return invoke("set_library_root", {
    context: context(generation),
    absolutePath,
  });
}

export async function restoreLibraryRoot(
  generation: number,
): Promise<ApiResponse<{ absolutePath: string } | null>> {
  return invoke("get_library_root", {
    context: context(generation),
  });
}

export async function restoreMainWindowFromTray(
  generation: number,
): Promise<ApiResponse<TrayStatus>> {
  return invoke("restore_main_window_from_tray", { context: context(generation) });
}

export async function setFullscreenDisplayAwake(
  enabled: boolean,
  generation: number,
): Promise<ApiResponse<boolean>> {
  return invoke("set_fullscreen_display_awake", {
    context: context(generation),
    enabled,
  });
}

export async function storeMainWindowInTray(
  generation: number,
): Promise<ApiResponse<TrayStatus>> {
  return invoke("store_main_window_in_tray", { context: context(generation) });
}

export async function takeCliLaunchRequest(
  generation: number,
): Promise<ApiResponse<CliLaunchRequest | null>> {
  return invoke("take_cli_launch_request", {
    context: context(generation),
  });
}
