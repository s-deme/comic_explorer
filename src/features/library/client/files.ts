import { invoke } from "@tauri-apps/api/core";
import type { ApiResponse } from "../../../types/api";
import type {
  FileOperationResult,
  FileClipboardStatus,
  FileUndoStatus,
  NativeFileDropPreview,
  RenamePreferences,
  BatchRenamePreview,
  ExternalAppTargetMode,
  ExternalAppEntry,
  ExternalAppHistoryEntry,
  ExternalAppLaunchPreview,
} from "./contracts";
import { context } from "./context";

export async function copyFileItemsToDestination(
  itemRelativePaths: string[],
  destinationRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("copy_file_items_to_destination", {
    context: context(generation),
    itemRelativePaths,
    destinationRelativePath,
  });
}

export async function copyFileItemsToFolder(
  itemRelativePaths: string[],
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("copy_file_items_to_folder", {
    context: context(generation),
    itemRelativePaths,
  });
}

export async function copyNativeFileDrop(
  absolutePaths: string[],
  destinationRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("copy_native_file_drop", {
    context: context(generation),
    absolutePaths,
    destinationRelativePath,
  });
}

export async function createFileFolder(
  parentRelativePath: string,
  name: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("create_file_folder", {
    context: context(generation),
    parentRelativePath,
    name,
  });
}

export async function deleteFileItems(
  itemRelativePaths: string[],
  permanent: boolean,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("delete_file_items", {
    context: context(generation),
    itemRelativePaths,
    permanent,
  });
}

export async function deleteExternalApp(appId: number, generation: number): Promise<ApiResponse<boolean>> {
  return invoke("delete_external_app", { context: context(generation), appId });
}

export async function executeBatchRename(
  itemRelativePaths: string[],
  baseName: string,
  preferences: RenamePreferences,
  previewKey: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("execute_batch_rename", {
    context: context(generation), itemRelativePaths, baseName, preferences, previewKey, confirmed: true,
  });
}

export async function getFileClipboardStatus(
  generation: number,
): Promise<ApiResponse<FileClipboardStatus>> {
  return invoke("file_clipboard_status", { context: context(generation) });
}

export async function getFileUndoStatus(
  generation: number,
): Promise<ApiResponse<FileUndoStatus>> {
  return invoke("get_file_undo_status", { context: context(generation) });
}

export async function getRenamePreferences(generation: number): Promise<ApiResponse<RenamePreferences>> {
  return invoke("get_rename_preferences", { context: context(generation) });
}

export async function launchExternalApp(
  appId: number,
  itemRelativePaths: string[],
  previewKey: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("launch_external_app", {
    context: context(generation), appId, itemRelativePaths, previewKey, confirmed: true,
  });
}

export async function listExternalAppHistory(
  generation: number,
): Promise<ApiResponse<ExternalAppHistoryEntry[]>> {
  return invoke("list_external_app_history", { context: context(generation) });
}

export async function listExternalApps(generation: number): Promise<ApiResponse<ExternalAppEntry[]>> {
  return invoke("list_external_apps", { context: context(generation) });
}

export async function moveFileItemsToDestination(
  itemRelativePaths: string[],
  destinationRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("move_file_items_to_destination", {
    context: context(generation),
    itemRelativePaths,
    destinationRelativePath,
  });
}

export async function moveFileItemsToFolder(
  itemRelativePaths: string[],
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("move_file_items_to_folder", {
    context: context(generation),
    itemRelativePaths,
  });
}

export async function openFileItemDefault(
  itemRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("open_file_item_default", {
    context: context(generation),
    itemRelativePath,
  });
}

export async function openFileItemWith(
  itemRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("open_file_item_with", {
    context: context(generation),
    itemRelativePath,
  });
}

export async function pasteFileItems(
  destinationRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("paste_file_items", {
    context: context(generation),
    destinationRelativePath,
  });
}

export async function previewBatchRename(
  itemRelativePaths: string[],
  baseName: string,
  preferences: RenamePreferences,
  generation: number,
): Promise<ApiResponse<BatchRenamePreview>> {
  return invoke("preview_batch_rename", {
    context: context(generation), itemRelativePaths, baseName, preferences,
  });
}

export async function previewExternalAppLaunch(
  appId: number,
  itemRelativePaths: string[],
  generation: number,
): Promise<ApiResponse<ExternalAppLaunchPreview>> {
  return invoke("preview_external_app_launch", { context: context(generation), appId, itemRelativePaths });
}

export async function previewNativeFileDrop(
  absolutePaths: string[],
  destinationRelativePath: string,
  generation: number,
): Promise<ApiResponse<NativeFileDropPreview>> {
  return invoke("preview_native_file_drop", {
    context: context(generation),
    absolutePaths,
    destinationRelativePath,
  });
}

export async function registerExternalApp(
  displayName: string,
  fixedArgs: string[],
  targetMode: ExternalAppTargetMode,
  generation: number,
): Promise<ApiResponse<ExternalAppEntry>> {
  return invoke("register_external_app", { context: context(generation), displayName, fixedArgs, targetMode });
}

export async function renameFileItem(
  itemRelativePath: string,
  newName: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("rename_file_item", {
    context: context(generation),
    itemRelativePath,
    newName,
  });
}

export async function revealFileItem(
  itemRelativePath: string,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("reveal_file_item", {
    context: context(generation),
    itemRelativePath,
  });
}

export async function saveRenamePreferences(
  preferences: RenamePreferences,
  generation: number,
): Promise<ApiResponse<RenamePreferences>> {
  return invoke("save_rename_preferences", { context: context(generation), preferences });
}

export async function setFileClipboard(
  itemRelativePaths: string[],
  cut: boolean,
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("set_file_clipboard", {
    context: context(generation),
    itemRelativePaths,
    cut,
  });
}

export async function startNativeFileDrag(
  itemRelativePaths: string[],
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("start_native_file_drag", {
    context: context(generation),
    itemRelativePaths,
  });
}

export async function undoLastFileOperation(
  generation: number,
): Promise<ApiResponse<FileOperationResult>> {
  return invoke("undo_last_file_operation", { context: context(generation) });
}

export async function updateExternalApp(
  appId: number,
  displayName: string,
  fixedArgs: string[],
  targetMode: ExternalAppTargetMode,
  generation: number,
): Promise<ApiResponse<ExternalAppEntry>> {
  return invoke("update_external_app", { context: context(generation), appId, displayName, fixedArgs, targetMode });
}
