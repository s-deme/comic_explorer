import { invoke } from "@tauri-apps/api/core";
import {
  API_VERSION,
  type ApiResponse,
  type RequestContext,
} from "../../types/api";
import type {
  CatalogEntry,
  Generation,
  RequestId,
} from "../../types/domain";

let requestSequence = 0;

function context(generation: number): RequestContext {
  requestSequence += 1;
  return {
    apiVersion: API_VERSION,
    requestId: `ui-${requestSequence}` as RequestId,
    generation: generation as Generation,
  };
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

export async function listFolder(
  relativePath: string,
  generation: number,
): Promise<ApiResponse<CatalogEntry[]>> {
  return invoke("list_folder", {
    context: context(generation),
    relativePath,
  });
}
