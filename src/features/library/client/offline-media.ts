import { invoke } from "@tauri-apps/api/core";
import type { ApiResponse } from "../../../types/api";
import type {
  CliLaunchPlan,
  OfflineMediaIcon,
  OfflineMediaCatalog,
  OfflineMediaDetail,
  OfflineMediaThumbnailPayload,
} from "./contracts";
import { context } from "./context";

export async function cancelOfflineMediaRegistration(generation: number): Promise<ApiResponse<boolean>> {
  return invoke("cancel_offline_media_registration", { context: context(generation) });
}

export async function deleteOfflineMedia(mediaId: number, generation: number): Promise<ApiResponse<OfflineMediaCatalog>> {
  return invoke("delete_offline_media", { context: context(generation), mediaId, confirmed: true });
}

export async function getOfflineMedia(mediaId: number, generation: number): Promise<ApiResponse<OfflineMediaDetail>> {
  return invoke("get_offline_media", { context: context(generation), mediaId });
}

export async function getOfflineMediaThumbnail(
  mediaId: number,
  relativePath: string,
  generation: number,
): Promise<ApiResponse<OfflineMediaThumbnailPayload | null>> {
  return invoke("get_offline_media_thumbnail", { context: context(generation), mediaId, relativePath });
}

export async function listOfflineMedia(generation: number): Promise<ApiResponse<OfflineMediaCatalog>> {
  return invoke("list_offline_media", { context: context(generation) });
}

export async function openOfflineMediaEntry(
  mediaId: number,
  relativePath: string,
  generation: number,
): Promise<ApiResponse<CliLaunchPlan>> {
  return invoke("open_offline_media_entry", { context: context(generation), mediaId, relativePath });
}

export async function registerOfflineMedia(
  name: string,
  icon: OfflineMediaIcon,
  generation: number,
): Promise<ApiResponse<OfflineMediaCatalog>> {
  return invoke("register_offline_media", {
    context: context(generation), request: { name, icon },
  });
}

export async function setOfflineMediaIcon(
  mediaId: number,
  icon: OfflineMediaIcon,
  generation: number,
): Promise<ApiResponse<OfflineMediaCatalog>> {
  return invoke("set_offline_media_icon", { context: context(generation), mediaId, icon });
}
