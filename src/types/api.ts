import type {
  AppError,
  Generation,
  RequestId,
} from "./domain";

export const API_VERSION = 1 as const;

export const CONTRACT_LIMITS = Object.freeze({
  channelItems: 512,
  imageBytes: 256 * 1024 * 1024,
  imagePixels: 120_000_000,
  archiveEntries: 100_000,
  archiveEntryBytes: 512 * 1024 * 1024,
  archiveTotalBytes: 8 * 1024 * 1024 * 1024,
  nestedArchiveDepth: 3,
  nestedArchives: 64,
  nestedArchiveBytes: 512 * 1024 * 1024,
});

export interface RequestContext {
  apiVersion: typeof API_VERSION;
  requestId: RequestId;
  generation: Generation;
}

export type ApiResponse<T> =
  | {
      status: "ok";
      requestId: RequestId;
      generation: Generation;
      data: T;
    }
  | {
      status: "error";
      requestId: RequestId;
      generation: Generation;
      error: AppError;
    }
  | {
      status: "cancelled";
      requestId: RequestId;
      generation: Generation;
    };

export function isCurrentResponse<T>(
  response: ApiResponse<T>,
  generation: Generation,
): boolean {
  return response.generation === generation;
}
