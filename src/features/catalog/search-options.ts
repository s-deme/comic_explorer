export type SearchSizeComparison = "atLeast" | "atMost";
export type SearchDateMode = "recentMonths" | "recentDays" | "calendarDate";
export type SearchDateComparison = "before" | "after" | "between";

export interface SearchOptions {
  includeSubfolders: boolean;
  includeFolders: boolean;
  includeFiles: boolean;
  retainResults: boolean;
  fixedLocation: string | null;
  sizeEnabled: boolean;
  sizeKiB: number;
  sizeComparison: SearchSizeComparison;
  dateEnabled: boolean;
  dateMode: SearchDateMode;
  dateAmount: number;
  dateComparison: SearchDateComparison;
  dateStart: string;
  dateEnd: string;
}

export interface SearchRequestOptions {
  includeSubfolders: boolean;
  includeFolders: boolean;
  includeFiles: boolean;
  fixedLocation: string | null;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  modifiedAfterMs?: number;
  modifiedBeforeMs?: number;
}

function todayInputValue(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function defaultSearchOptions(nowMs = Date.now()): SearchOptions {
  const today = todayInputValue(nowMs);
  return {
    includeSubfolders: true,
    includeFolders: true,
    includeFiles: true,
    retainResults: false,
    fixedLocation: null,
    sizeEnabled: false,
    sizeKiB: 0,
    sizeComparison: "atLeast",
    dateEnabled: false,
    dateMode: "recentMonths",
    dateAmount: 1,
    dateComparison: "after",
    dateStart: today,
    dateEnd: today,
  };
}

function dayStartMs(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) return undefined;
  return timestamp;
}

function positiveInteger(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}

export function toSearchRequestOptions(
  options: SearchOptions,
  nowMs = Date.now(),
): SearchRequestOptions {
  const request: SearchRequestOptions = {
    includeSubfolders: options.includeSubfolders,
    includeFolders: options.includeFolders,
    includeFiles: options.includeFiles,
    fixedLocation: options.fixedLocation,
  };

  if (options.sizeEnabled) {
    const bytes = Math.max(0, Math.floor(options.sizeKiB * 1024));
    if (options.sizeComparison === "atLeast") request.minSizeBytes = bytes;
    else request.maxSizeBytes = bytes;
  }

  if (!options.dateEnabled) return request;

  if (options.dateMode === "recentMonths") {
    const boundary = new Date(nowMs);
    boundary.setUTCMonth(boundary.getUTCMonth() - positiveInteger(options.dateAmount));
    request.modifiedAfterMs = boundary.getTime();
    return request;
  }
  if (options.dateMode === "recentDays") {
    request.modifiedAfterMs = nowMs - positiveInteger(options.dateAmount) * 86_400_000;
    return request;
  }

  const start = dayStartMs(options.dateStart);
  const end = dayStartMs(options.dateEnd);
  if (options.dateComparison === "after" && start !== undefined) {
    request.modifiedAfterMs = start;
  } else if (options.dateComparison === "before" && start !== undefined) {
    request.modifiedBeforeMs = start + 86_400_000 - 1;
  } else if (options.dateComparison === "between" && start !== undefined && end !== undefined) {
    request.modifiedAfterMs = Math.min(start, end);
    request.modifiedBeforeMs = Math.max(start, end) + 86_400_000 - 1;
  }
  return request;
}
