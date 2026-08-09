import type { CatalogEntry } from "../../types/domain";

export const USER_THUMBNAILS_STORAGE_KEY = "comic-explorer.user-thumbnails.v1";
export const MAX_USER_THUMBNAIL_BYTES = 3 * 1024 * 1024;
export const MAX_USER_THUMBNAIL_FILE_BYTES = 2 * 1024 * 1024;

export interface ManagedThumbnail {
  itemRelativePath: string;
  dataUrl: string;
  bytes: number;
  importedAtMs: number;
}

export type ManagedThumbnailMap = Record<string, ManagedThumbnail>;

export interface ImportedThumbnail {
  itemRelativePath: string;
  dataUrl: string;
  bytes: number;
}

export interface ThumbnailStats {
  count: number;
  bytes: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isJpegDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function isRelativePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("..") && !value.includes("\\");
}

function isSafeByteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_USER_THUMBNAIL_FILE_BYTES;
}

function normalizeEntry(key: string, value: unknown): ManagedThumbnail | null {
  if (!isRelativePath(key) || typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<ManagedThumbnail>;
  if (candidate.itemRelativePath !== key || !isJpegDataUrl(candidate.dataUrl) || !isSafeByteCount(candidate.bytes)) {
    return null;
  }
  return {
    itemRelativePath: key,
    dataUrl: candidate.dataUrl,
    bytes: candidate.bytes,
    importedAtMs: typeof candidate.importedAtMs === "number" && Number.isFinite(candidate.importedAtMs)
      ? candidate.importedAtMs
      : 0,
  };
}

export function normalizeManagedThumbnails(value: unknown): ManagedThumbnailMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const normalized: ManagedThumbnailMap = {};
  let bytes = 0;
  for (const [key, candidate] of Object.entries(value)) {
    const entry = normalizeEntry(key, candidate);
    if (entry === null) continue;
    if (bytes + entry.bytes > MAX_USER_THUMBNAIL_BYTES) continue;
    normalized[key] = entry;
    bytes += entry.bytes;
  }
  return normalized;
}

export function loadManagedThumbnails(storage?: StorageLike): ManagedThumbnailMap {
  if (storage === undefined) return {};
  try {
    const raw = storage.getItem(USER_THUMBNAILS_STORAGE_KEY);
    return raw === null ? {} : normalizeManagedThumbnails(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveManagedThumbnails(storage: StorageLike | undefined, thumbnails: ManagedThumbnailMap): void {
  if (storage === undefined) return;
  storage.setItem(USER_THUMBNAILS_STORAGE_KEY, JSON.stringify(normalizeManagedThumbnails(thumbnails)));
}

export function thumbnailStats(thumbnails: ManagedThumbnailMap): ThumbnailStats {
  return Object.values(thumbnails).reduce(
    (stats, thumbnail) => ({ count: stats.count + 1, bytes: stats.bytes + thumbnail.bytes }),
    { count: 0, bytes: 0 },
  );
}

export function formatThumbnailBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileName(value: string): string {
  return value.replaceAll("\\", "/").split("/").at(-1) ?? value;
}

function catalogAliases(entry: CatalogEntry): string[] {
  const base = fileName(entry.relativePath).toLocaleLowerCase();
  const stem = base.replace(/\.(?:zip|cbz|rar|cbr|7z)$/i, "");
  return [base, stem];
}

function importAlias(file: File): string {
  return fileName(file.name).replace(/\.jpe?g$/i, "").toLocaleLowerCase();
}

export function resolveImportTargets(
  files: File[],
  entries: CatalogEntry[],
): { accepted: Array<{ file: File; itemRelativePath: string }>; rejected: string[] } {
  const eligible = entries.filter((entry) => entry.kind === "archive" || entry.kind === "comicFolder");
  const accepted: Array<{ file: File; itemRelativePath: string }> = [];
  const rejected: string[] = [];
  const used = new Set<string>();
  for (const file of files) {
    if (!/^(?:image\/jpeg|image\/jpg)?$/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) {
      rejected.push(`${file.name}: JPEGのみ対応`);
      continue;
    }
    const matches = eligible.filter((entry) => catalogAliases(entry).includes(importAlias(file)));
    if (matches.length !== 1 || used.has(matches[0]?.relativePath ?? "")) {
      rejected.push(`${file.name}: 対象を一意に特定できません`);
      continue;
    }
    const target = matches[0].relativePath;
    used.add(target);
    accepted.push({ file, itemRelativePath: target });
  }
  return { accepted, rejected };
}

export function readJpegFile(file: File): Promise<{ dataUrl: string; bytes: number }> {
  if (file.size <= 0 || file.size > MAX_USER_THUMBNAIL_FILE_BYTES) {
    return Promise.reject(new Error("JPEGのサイズが上限を超えています。"));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("JPEGを読み込めませんでした。"));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!isJpegDataUrl(dataUrl)) {
        reject(new Error("JPEGのデータ形式を確認できませんでした。"));
        return;
      }
      resolve({ dataUrl, bytes: file.size });
    };
    reader.readAsDataURL(file);
  });
}

export function mergeImportedThumbnails(
  current: ManagedThumbnailMap,
  imports: ImportedThumbnail[],
  importedAtMs = Date.now(),
): { thumbnails: ManagedThumbnailMap; accepted: number; rejected: string[] } {
  const next = { ...current };
  const rejected: string[] = [];
  let accepted = 0;
  for (const item of imports) {
    if (!isJpegDataUrl(item.dataUrl) || !isSafeByteCount(item.bytes)) {
      rejected.push(`${item.itemRelativePath}: JPEGまたはサイズが不正です`);
      continue;
    }
    const currentBytes = thumbnailStats(next).bytes - (next[item.itemRelativePath]?.bytes ?? 0);
    if (currentBytes + item.bytes > MAX_USER_THUMBNAIL_BYTES) {
      rejected.push(`${item.itemRelativePath}: 管理容量の上限を超えます`);
      continue;
    }
    next[item.itemRelativePath] = { ...item, importedAtMs };
    accepted += 1;
  }
  return { thumbnails: next, accepted, rejected };
}

export function thumbnailDownloadName(relativePath: string): string {
  const base = fileName(relativePath).replace(/\.[^.]+$/, "") || "thumbnail";
  return `${base}.jpg`;
}

export async function saveThumbnailDataUrl(dataUrl: string, filename: string): Promise<void> {
  const response = await fetch(dataUrl);
  if (!response.ok && response.status !== 0) throw new Error("thumbnailを取得できませんでした。");
  const blob = await response.blob();
  const pickerWindow = window as Window & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
  };
  if (pickerWindow.showSaveFilePicker !== undefined) {
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "JPEG thumbnail", accept: { "image/jpeg": [".jpg", ".jpeg"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
