import type { CatalogEntry } from "../../types/domain";

export const USER_THUMBNAILS_STORAGE_KEY = "comic-explorer.user-thumbnails.v1";
export const USER_THUMBNAILS_STORAGE_PREFIX = "comic-explorer.user-thumbnails.v2";
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

const JPEG_DATA_URL_PATTERN = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_JPEG_BASE64_LENGTH = Math.ceil(MAX_USER_THUMBNAIL_FILE_BYTES / 3) * 4;

export function createManagedThumbnailMap(): ManagedThumbnailMap {
  return Object.create(null) as ManagedThumbnailMap;
}

function hasOwnThumbnail(
  thumbnails: ManagedThumbnailMap,
  itemRelativePath: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(thumbnails, itemRelativePath);
}

export function managedThumbnailFor(
  thumbnails: ManagedThumbnailMap,
  itemRelativePath: string,
): ManagedThumbnail | undefined {
  return hasOwnThumbnail(thumbnails, itemRelativePath)
    ? thumbnails[itemRelativePath]
    : undefined;
}

function isStartOfFrameMarker(marker: number): boolean {
  return marker >= 0xc0
    && marker <= 0xcf
    && marker !== 0xc4
    && marker !== 0xc8
    && marker !== 0xcc;
}

export function isStructurallyValidJpeg(bytes: Uint8Array): boolean {
  if (
    bytes.length < 4
    || bytes[0] !== 0xff
    || bytes[1] !== 0xd8
  ) {
    return false;
  }

  let offset = 2;
  let sawFrame = false;
  let sawScan = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return false;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0x00 || marker === 0xd8) return false;
    if (marker === 0xd9) {
      return sawFrame && sawScan && offset === bytes.length;
    }
    if (marker === 0x01) continue;
    if (marker >= 0xd0 && marker <= 0xd7) return false;
    if (offset + 2 > bytes.length) return false;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return false;
    const payloadOffset = offset + 2;
    const segmentEnd = offset + segmentLength;

    if (isStartOfFrameMarker(marker)) {
      if (segmentLength < 11) return false;
      const height = (bytes[payloadOffset + 1] << 8) | bytes[payloadOffset + 2];
      const width = (bytes[payloadOffset + 3] << 8) | bytes[payloadOffset + 4];
      const components = bytes[payloadOffset + 5];
      if (
        width === 0
        || height === 0
        || components === 0
        || segmentLength !== 8 + 3 * components
      ) {
        return false;
      }
      sawFrame = true;
    }

    if (marker !== 0xda) {
      offset = segmentEnd;
      continue;
    }

    if (!sawFrame || segmentLength < 8) return false;
    const scanComponents = bytes[payloadOffset];
    if (scanComponents === 0 || segmentLength !== 6 + 2 * scanComponents) {
      return false;
    }
    sawScan = true;
    offset = segmentEnd;
    let sawEntropyByte = false;
    let foundNextMarker = false;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        sawEntropyByte = true;
        offset += 1;
        continue;
      }
      const markerOffset = offset;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) return false;
      const scanMarker = bytes[offset];
      if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) {
        sawEntropyByte = true;
        offset += 1;
        continue;
      }
      offset = markerOffset;
      foundNextMarker = true;
      break;
    }
    if (!sawEntropyByte || !foundNextMarker) return false;
  }
  return false;
}

function jpegBytesFromDataUrl(value: unknown): Uint8Array | null {
  if (typeof value !== "string") return null;
  const match = JPEG_DATA_URL_PATTERN.exec(value);
  const encoded = match?.[1];
  if (
    encoded === undefined
    || encoded.length === 0
    || encoded.length > MAX_JPEG_BASE64_LENGTH
    || encoded.length % 4 !== 0
  ) {
    return null;
  }
  try {
    const decoded = atob(encoded);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function isRelativePath(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && !value.startsWith("/")
    && !value.includes("\\")
    && value[1] !== ":"
    && !value.includes("\0")
    && !value.split("/").includes("..");
}

function isSafeByteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_USER_THUMBNAIL_FILE_BYTES;
}

function normalizeEntry(key: string, value: unknown): ManagedThumbnail | null {
  if (!isRelativePath(key) || typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<ManagedThumbnail>;
  const dataUrl = candidate.dataUrl;
  const jpegBytes = jpegBytesFromDataUrl(dataUrl);
  if (
    candidate.itemRelativePath !== key
    || typeof dataUrl !== "string"
    || jpegBytes === null
    || !isStructurallyValidJpeg(jpegBytes)
    || !isSafeByteCount(candidate.bytes)
    || candidate.bytes !== jpegBytes.byteLength
  ) {
    return null;
  }
  return {
    itemRelativePath: key,
    dataUrl,
    bytes: candidate.bytes,
    importedAtMs: typeof candidate.importedAtMs === "number" && Number.isFinite(candidate.importedAtMs)
      ? candidate.importedAtMs
      : 0,
  };
}

export function normalizeManagedThumbnails(value: unknown): ManagedThumbnailMap {
  const normalized = createManagedThumbnailMap();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return normalized;
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
  if (storage === undefined) return createManagedThumbnailMap();
  try {
    const raw = storage.getItem(USER_THUMBNAILS_STORAGE_KEY);
    return raw === null ? createManagedThumbnailMap() : normalizeManagedThumbnails(JSON.parse(raw));
  } catch {
    return createManagedThumbnailMap();
  }
}

export function hasLegacyManagedThumbnails(storage?: StorageLike): boolean {
  return thumbnailStats(loadManagedThumbnails(storage)).count > 0;
}

export function saveManagedThumbnails(storage: StorageLike | undefined, thumbnails: ManagedThumbnailMap): void {
  if (storage === undefined) return;
  storage.setItem(USER_THUMBNAILS_STORAGE_KEY, JSON.stringify(normalizeManagedThumbnails(thumbnails)));
}

function normalizeLibraryRootIdentity(libraryRoot: string): string {
  let normalized = libraryRoot.trim().normalize("NFC").replaceAll("\\", "/");
  while (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized.toLocaleLowerCase("en-US");
}

export function managedThumbnailStorageKey(libraryRoot: string): string {
  const identity = normalizeLibraryRootIdentity(libraryRoot);
  if (identity.length === 0) throw new Error("Library root identity is required.");
  return `${USER_THUMBNAILS_STORAGE_PREFIX}:${encodeURIComponent(identity)}`;
}

export function loadManagedThumbnailsForLibrary(
  storage: StorageLike | undefined,
  libraryRoot: string,
): ManagedThumbnailMap {
  if (storage === undefined) return createManagedThumbnailMap();
  try {
    const raw = storage.getItem(managedThumbnailStorageKey(libraryRoot));
    return raw === null ? createManagedThumbnailMap() : normalizeManagedThumbnails(JSON.parse(raw));
  } catch {
    return createManagedThumbnailMap();
  }
}

export function saveManagedThumbnailsForLibrary(
  storage: StorageLike | undefined,
  libraryRoot: string,
  thumbnails: ManagedThumbnailMap,
): void {
  if (storage === undefined) return;
  storage.setItem(
    managedThumbnailStorageKey(libraryRoot),
    JSON.stringify(normalizeManagedThumbnails(thumbnails)),
  );
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
  const stem = base.replace(/\.(?:zip|cbz|epub|rar|cbr|7z|cb7|lzh|pdf)$/i, "");
  return [base, stem];
}

function importAlias(file: File): string {
  return fileName(file.name).replace(/\.jpe?g$/i, "").toLocaleLowerCase();
}

export function resolveImportTargets(
  files: File[],
  entries: CatalogEntry[],
): { accepted: Array<{ file: File; itemRelativePath: string }>; rejected: string[] } {
  const eligible = entries.filter(
    (entry) => entry.kind === "archive" || entry.kind === "comicFolder" || entry.kind === "pdf",
  );
  const accepted: Array<{ file: File; itemRelativePath: string }> = [];
  const rejected: string[] = [];
  const used = new Set<string>();
  for (const file of files) {
    if (!/\.jpe?g$/i.test(file.name)) {
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

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("JPEGを読み込めませんでした。"));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("JPEGのデータ形式を確認できませんでした。"));
    };
    reader.readAsArrayBuffer(blob);
  });
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("JPEGを読み込めませんでした。"));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("JPEGのデータ形式を確認できませんでした。"));
    };
    reader.readAsDataURL(blob);
  });
}

async function requireDecodableJpeg(blob: Blob): Promise<void> {
  if (typeof globalThis.createImageBitmap === "function") {
    try {
      const bitmap = await globalThis.createImageBitmap(blob);
      try {
        if (bitmap.width <= 0 || bitmap.height <= 0) throw new Error("invalid dimensions");
      } finally {
        bitmap.close();
      }
      return;
    } catch {
      throw new Error("JPEG画像をdecodeできませんでした。");
    }
  }

  if (
    typeof Image === "undefined"
    || typeof URL.createObjectURL !== "function"
    || typeof URL.revokeObjectURL !== "function"
  ) {
    throw new Error("JPEG画像をdecodeできる環境がありません。");
  }
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve();
        else reject(new Error("invalid dimensions"));
      };
      image.onerror = () => reject(new Error("decode failed"));
      image.src = url;
    });
  } catch {
    throw new Error("JPEG画像をdecodeできませんでした。");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function readJpegFile(file: File): Promise<{ dataUrl: string; bytes: number }> {
  if (file.size <= 0 || file.size > MAX_USER_THUMBNAIL_FILE_BYTES) {
    return Promise.reject(new Error("JPEGのサイズが上限を超えています。"));
  }
  return readBlobAsArrayBuffer(file).then(async (buffer) => {
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength !== file.size || !isStructurallyValidJpeg(bytes)) {
      throw new Error("JPEGのデータ形式を確認できませんでした。");
    }
    const jpegBlob = new Blob([bytes], { type: "image/jpeg" });
    await requireDecodableJpeg(jpegBlob);
    const dataUrl = await readBlobAsDataUrl(jpegBlob);
    if (jpegBytesFromDataUrl(dataUrl)?.byteLength !== bytes.byteLength) {
      throw new Error("JPEGのデータ形式を確認できませんでした。");
    }
    return { dataUrl, bytes: bytes.byteLength };
  });
}

export function mergeImportedThumbnails(
  current: ManagedThumbnailMap,
  imports: ImportedThumbnail[],
  importedAtMs = Date.now(),
): { thumbnails: ManagedThumbnailMap; accepted: number; rejected: string[] } {
  const next = normalizeManagedThumbnails(current);
  const rejected: string[] = [];
  const used = new Set<string>();
  let totalBytes = thumbnailStats(next).bytes;
  let accepted = 0;
  for (const item of imports) {
    const jpegBytes = jpegBytesFromDataUrl(item.dataUrl);
    if (
      !isRelativePath(item.itemRelativePath)
      || jpegBytes === null
      || !isStructurallyValidJpeg(jpegBytes)
      || !isSafeByteCount(item.bytes)
      || item.bytes !== jpegBytes.byteLength
    ) {
      rejected.push(`${item.itemRelativePath}: JPEGまたはサイズが不正です`);
      continue;
    }
    if (used.has(item.itemRelativePath)) {
      rejected.push(`${item.itemRelativePath}: 同じ対象が重複しています`);
      continue;
    }
    used.add(item.itemRelativePath);
    const existing = managedThumbnailFor(next, item.itemRelativePath);
    const currentBytes = totalBytes - (existing?.bytes ?? 0);
    if (currentBytes + item.bytes > MAX_USER_THUMBNAIL_BYTES) {
      rejected.push(`${item.itemRelativePath}: 管理容量の上限を超えます`);
      continue;
    }
    next[item.itemRelativePath] = { ...item, importedAtMs };
    totalBytes = currentBytes + item.bytes;
    accepted += 1;
  }
  return { thumbnails: next, accepted, rejected };
}

export function thumbnailDownloadName(relativePath: string): string {
  const base = fileName(relativePath).replace(/\.[^.]+$/, "") || "thumbnail";
  return `${base}.jpg`;
}

export async function saveThumbnailDataUrl(
  dataUrl: string,
  filename: string,
): Promise<"saved" | "started"> {
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
    return "saved";
  }
  if (typeof URL.createObjectURL !== "function") {
    throw new Error("thumbnailの保存機能を利用できません。");
  }
  let url: string | null = null;
  try {
    url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    return "started";
  } finally {
    if (url !== null) {
      const downloadUrl = url;
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    }
  }
}
