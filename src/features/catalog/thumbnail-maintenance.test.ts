import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry, RelativePath } from "../../types/domain";
import {
  MAX_USER_THUMBNAIL_BYTES,
  createManagedThumbnailMap,
  hasLegacyManagedThumbnails,
  isStructurallyValidJpeg,
  loadManagedThumbnailsForLibrary,
  managedThumbnailFor,
  managedThumbnailStorageKey,
  mergeImportedThumbnails,
  normalizeManagedThumbnails,
  readJpegFile,
  resolveImportTargets,
  saveThumbnailDataUrl,
  saveManagedThumbnailsForLibrary,
  thumbnailStats,
} from "./thumbnail-maintenance";

function structuralJpegBytes(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x02,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x00,
    0xff, 0xd9,
  ]);
}

function jpegDataUrl(bytes = structuralJpegBytes()): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

function record(itemRelativePath: string) {
  const bytes = structuralJpegBytes();
  return {
    itemRelativePath,
    dataUrl: jpegDataUrl(bytes),
    bytes: bytes.byteLength,
    importedAtMs: 4,
  };
}

function entry(relativePath: string, kind: CatalogEntry["kind"] = "archive"): CatalogEntry {
  return { relativePath: relativePath as RelativePath, kind };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("thumbnail maintenance", () => {
  it("validates JPEG markers, segment lengths, scan data, and terminal EOI", () => {
    const valid = structuralJpegBytes();
    expect(isStructurallyValidJpeg(valid)).toBe(true);
    expect(isStructurallyValidJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe(false);
    expect(isStructurallyValidJpeg(valid.slice(0, -2))).toBe(false);

    const badSegmentLength = valid.slice();
    badSegmentLength[8] = 0xff;
    badSegmentLength[9] = 0xff;
    expect(isStructurallyValidJpeg(badSegmentLength)).toBe(false);

    const trailingData = new Uint8Array(valid.byteLength + 1);
    trailingData.set(valid);
    expect(isStructurallyValidJpeg(trailingData)).toBe(false);
  });

  it("normalizes exact app-local JPEG bytes into a prototype-safe map", () => {
    const jpeg = record("book..cbz");
    const thumbnails = normalizeManagedThumbnails({
      "book..cbz": jpeg,
      bad: { itemRelativePath: "bad", dataUrl: "data:image/png;base64,AA==", bytes: 1 },
    });
    expect(Object.getPrototypeOf(thumbnails)).toBeNull();
    expect(thumbnailStats(thumbnails)).toEqual({ count: 1, bytes: jpeg.bytes });

    const special = normalizeManagedThumbnails(JSON.parse(JSON.stringify({
      constructor: record("constructor"),
      __proto_placeholder: record("__proto__"),
    }).replace("__proto_placeholder", "__proto__")));
    expect(Object.getPrototypeOf(special)).toBeNull();
    expect(managedThumbnailFor(special, "constructor")?.itemRelativePath).toBe("constructor");
    expect(managedThumbnailFor(special, "__proto__")?.itemRelativePath).toBe("__proto__");
    expect(managedThumbnailFor(createManagedThumbnailMap(), "constructor")).toBeUndefined();
  });

  it("rejects a declared byte count that does not match decoded JPEG data", () => {
    const candidate = record("book.cbz");
    expect(normalizeManagedThumbnails({
      "book.cbz": { ...candidate, bytes: candidate.bytes - 1 },
    })).toEqual(createManagedThumbnailMap());

    const merged = mergeImportedThumbnails(createManagedThumbnailMap(), [{
      itemRelativePath: "book.cbz",
      dataUrl: candidate.dataUrl,
      bytes: candidate.bytes + 1,
    }]);
    expect(merged.accepted).toBe(0);
    expect(merged.rejected).toEqual(["book.cbz: JPEGまたはサイズが不正です"]);
  });

  it("matches only JPEG filenames to visible archive or comic-folder targets", () => {
    const files = [
      new File(["a"], "book.jpg", { type: "image/jpeg" }),
      new File(["b"], "missing.jpg", { type: "image/jpeg" }),
      new File(["c"], "other.png", { type: "image/jpeg" }),
    ];
    const result = resolveImportTargets(files, [entry("book.cbz"), entry("book", "comicFolder")]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(3);
    expect(result.rejected[0]).toContain("一意");
    expect(result.rejected[2]).toContain("JPEGのみ");
  });

  it("requires structural bytes and a successful browser decode before import", async () => {
    const close = vi.fn();
    const decode = vi.fn(async () => ({ width: 1, height: 1, close }));
    vi.stubGlobal("createImageBitmap", decode);
    const bytes = structuralJpegBytes();
    const loaded = await readJpegFile(
      new File([bytes.buffer as ArrayBuffer], "book.jpg", { type: "application/octet-stream" }),
    );
    expect(loaded.bytes).toBe(bytes.byteLength);
    expect(loaded.dataUrl).toBe(jpegDataUrl(bytes));
    expect(decode).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();

    await expect(readJpegFile(
      new File(["not jpeg"], "fake.jpg", { type: "image/jpeg" }),
    )).rejects.toThrow("データ形式");
  });

  it("imports replacements, rejects duplicate batch targets, and keeps capacity accounting", () => {
    const current = normalizeManagedThumbnails({
      "old.cbz": record("old.cbz"),
    });
    const imported = record("new.cbz");
    const merged = mergeImportedThumbnails(current, [
      { itemRelativePath: "new.cbz", dataUrl: imported.dataUrl, bytes: imported.bytes },
      { itemRelativePath: "new.cbz", dataUrl: imported.dataUrl, bytes: imported.bytes },
    ], 5);
    expect(merged.accepted).toBe(1);
    expect(merged.rejected).toEqual(["new.cbz: 同じ対象が重複しています"]);
    expect(managedThumbnailFor(merged.thumbnails, "new.cbz")?.importedAtMs).toBe(5);
    expect(thumbnailStats(merged.thumbnails).bytes).toBe(record("old.cbz").bytes + imported.bytes);
    expect(MAX_USER_THUMBNAIL_BYTES).toBeGreaterThan(thumbnailStats(merged.thumbnails).bytes);
  });

  it("isolates persisted thumbnails by normalized library-root identity", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const first = normalizeManagedThumbnails({ "book.cbz": record("book.cbz") });
    const second = normalizeManagedThumbnails({ "other.cbz": record("other.cbz") });

    saveManagedThumbnailsForLibrary(storage, "C:\\Comics\\First\\", first);
    saveManagedThumbnailsForLibrary(storage, "D:/Comics/Second", second);

    expect(managedThumbnailStorageKey("C:\\COMICS\\FIRST"))
      .toBe(managedThumbnailStorageKey("c:/comics/first/"));
    expect(managedThumbnailFor(
      loadManagedThumbnailsForLibrary(storage, "c:/comics/first"),
      "book.cbz",
    )).toBeDefined();
    expect(managedThumbnailFor(
      loadManagedThumbnailsForLibrary(storage, "D:\\Comics\\Second\\"),
      "book.cbz",
    )).toBeUndefined();
    expect(managedThumbnailFor(
      loadManagedThumbnailsForLibrary(storage, "d:/comics/second"),
      "other.cbz",
    )).toBeDefined();
  });

  it("detects legacy unscoped thumbnails without assigning them to an arbitrary root", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(hasLegacyManagedThumbnails(storage)).toBe(false);
    values.set("comic-explorer.user-thumbnails.v1", JSON.stringify({
      "book.cbz": record("book.cbz"),
    }));
    expect(hasLegacyManagedThumbnails(storage)).toBe(true);
    expect(loadManagedThumbnailsForLibrary(storage, "C:/Comics"))
      .toEqual(createManagedThumbnailMap());
  });

  it("reports completion only after the native save picker has written and closed", async () => {
    const write = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const showSaveFilePicker = vi.fn(async () => ({
      createWritable: async () => ({ write, close }),
    }));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(["jpeg"], { type: "image/jpeg" }),
    })));
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: showSaveFilePicker,
    });

    try {
      await expect(saveThumbnailDataUrl("blob:thumbnail", "cover.jpg")).resolves.toBe("saved");
      expect(write).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      Reflect.deleteProperty(window, "showSaveFilePicker");
    }
  });

  it("propagates save-picker cancellation without claiming a completed save", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(["jpeg"], { type: "image/jpeg" }),
    })));
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: vi.fn(async () => {
        throw new DOMException("cancelled", "AbortError");
      }),
    });

    try {
      await expect(saveThumbnailDataUrl("blob:thumbnail", "cover.jpg"))
        .rejects.toMatchObject({ name: "AbortError" });
    } finally {
      Reflect.deleteProperty(window, "showSaveFilePicker");
    }
  });

  it("labels an anchor fallback as started and revokes its object URL later", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectURL = vi.fn(() => "blob:download");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(["jpeg"], { type: "image/jpeg" }),
    })));
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    await expect(saveThumbnailDataUrl("blob:thumbnail", "cover.jpg")).resolves.toBe("started");
    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:download");
  });
});
