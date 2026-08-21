export interface PageBookmark {
  itemKey: string;
  pageIndex: number;
  pageKey: string;
  createdAt: number;
}

export type CollectionWriteFailureReason =
  | "storage-unavailable"
  | "write-failed"
  | "invalid-data";

export type CollectionWriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; value: T; reason: CollectionWriteFailureReason };

const BOOKMARKS_KEY = "comic-explorer.bookmarks.v1";
const BOOKSHELF_KEY = "comic-explorer.bookshelf.v1";
const ROOT_COLLECTIONS_KEY = "comic-explorer.reading-collections.v2";

export interface RootCollections {
  namespace: string;
  bookmarks: PageBookmark[];
  bookshelf: string[];
}

interface RootCollectionsEnvelope {
  version: 2;
  legacyOwner?: string;
  roots: RootCollections[];
}

function storageOrNull(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  const storage = storageOrNull();
  if (storage === null) return undefined;
  try {
    const value = storage.getItem(key);
    return value === null ? undefined : JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): CollectionWriteFailureReason | null {
  const storage = storageOrNull();
  if (storage === null) return "storage-unavailable";
  try {
    storage.setItem(key, JSON.stringify(value));
    return null;
  } catch {
    return "write-failed";
  }
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPageBookmark(value: unknown): value is PageBookmark {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PageBookmark>;
  return typeof candidate.itemKey === "string" && candidate.itemKey.length > 0
    && typeof candidate.pageKey === "string" && candidate.pageKey.length > 0
    && isFiniteNonNegativeInteger(candidate.pageIndex)
    && isFiniteNonNegativeInteger(candidate.createdAt);
}

function validBookshelfPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function dedupeBookmarks(values: readonly PageBookmark[]): PageBookmark[] {
  const unique = new Map<string, PageBookmark>();
  values.forEach((bookmark) => {
    const identity = JSON.stringify([bookmark.itemKey, bookmark.pageKey]);
    unique.set(identity, bookmark);
  });
  return [...unique.values()];
}

function sanitizeBookmarks(value: unknown): PageBookmark[] {
  if (!Array.isArray(value)) return [];
  return dedupeBookmarks(value.filter(isPageBookmark));
}

function sanitizeBookshelf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(validBookshelfPath))];
}

function emptyEnvelope(): RootCollectionsEnvelope {
  return { version: 2, roots: [] };
}

function sanitizeEnvelope(value: unknown): RootCollectionsEnvelope {
  if (typeof value !== "object" || value === null) return emptyEnvelope();
  const candidate = value as {
    version?: unknown;
    legacyOwner?: unknown;
    roots?: unknown;
  };
  if (candidate.version !== 2 || !Array.isArray(candidate.roots)) {
    return emptyEnvelope();
  }
  const roots = candidate.roots.flatMap((root): RootCollections[] => {
    if (typeof root !== "object" || root === null) return [];
    const rootCandidate = root as {
      namespace?: unknown;
      bookmarks?: unknown;
      bookshelf?: unknown;
    };
    if (typeof rootCandidate.namespace !== "string" || rootCandidate.namespace.length === 0) {
      return [];
    }
    return [{
      namespace: rootCandidate.namespace,
      bookmarks: sanitizeBookmarks(rootCandidate.bookmarks),
      bookshelf: sanitizeBookshelf(rootCandidate.bookshelf),
    }];
  });
  return {
    version: 2,
    ...(typeof candidate.legacyOwner === "string" && candidate.legacyOwner.length > 0
      ? { legacyOwner: candidate.legacyOwner }
      : {}),
    roots,
  };
}

function readEnvelope(): RootCollectionsEnvelope {
  return sanitizeEnvelope(readJson(ROOT_COLLECTIONS_KEY));
}

function rootCollections(
  envelope: RootCollectionsEnvelope,
  namespace: string,
): RootCollections {
  return envelope.roots.find((root) => root.namespace === namespace) ?? {
    namespace,
    bookmarks: [],
    bookshelf: [],
  };
}

function replaceRootCollections(
  envelope: RootCollectionsEnvelope,
  replacement: RootCollections,
): RootCollectionsEnvelope {
  return {
    ...envelope,
    roots: [
      ...envelope.roots.filter((root) => root.namespace !== replacement.namespace),
      replacement,
    ],
  };
}

function sortedBookmarks(bookmarks: readonly PageBookmark[], itemKey: string): PageBookmark[] {
  return bookmarks
    .filter((bookmark) => bookmark.itemKey === itemKey)
    .sort((left, right) => left.pageIndex - right.pageIndex || left.createdAt - right.createdAt);
}

export function listBookmarks(itemKey: string, rootNamespace?: string): PageBookmark[] {
  const bookmarks = rootNamespace === undefined
    ? sanitizeBookmarks(readJson(BOOKMARKS_KEY))
    : rootCollections(readEnvelope(), rootNamespace).bookmarks;
  return sortedBookmarks(bookmarks, itemKey);
}

export function saveBookmarkResult(
  bookmark: PageBookmark,
  rootNamespace?: string,
): CollectionWriteResult<PageBookmark[]> {
  const candidate: unknown = bookmark;
  if (!isPageBookmark(candidate)) {
    const itemKey = typeof (candidate as Partial<PageBookmark> | null)?.itemKey === "string"
      ? (candidate as Partial<PageBookmark>).itemKey ?? ""
      : "";
    return {
      ok: false,
      value: listBookmarks(itemKey, rootNamespace),
      reason: "invalid-data",
    };
  }

  if (rootNamespace === undefined) {
    const current = sanitizeBookmarks(readJson(BOOKMARKS_KEY));
    const next = dedupeBookmarks([...current, bookmark]);
    const failure = writeJson(BOOKMARKS_KEY, next);
    return failure === null
      ? { ok: true, value: sortedBookmarks(next, bookmark.itemKey) }
      : {
          ok: false,
          value: sortedBookmarks(current, bookmark.itemKey),
          reason: failure,
        };
  }

  const envelope = readEnvelope();
  const current = rootCollections(envelope, rootNamespace);
  const nextRoot = {
    ...current,
    bookmarks: dedupeBookmarks([...current.bookmarks, bookmark]),
  };
  const failure = writeJson(
    ROOT_COLLECTIONS_KEY,
    replaceRootCollections(envelope, nextRoot),
  );
  return failure === null
    ? { ok: true, value: sortedBookmarks(nextRoot.bookmarks, bookmark.itemKey) }
    : {
        ok: false,
        value: sortedBookmarks(current.bookmarks, bookmark.itemKey),
        reason: failure,
      };
}

/**
 * Compatibility wrapper for callers that do not yet expose persistence errors.
 * New UI integrations should use saveBookmarkResult.
 */
export function saveBookmark(bookmark: PageBookmark, rootNamespace?: string): PageBookmark[] {
  return saveBookmarkResult(bookmark, rootNamespace).value;
}

export function removeLegacyBookmarksForItemResult(
  itemKey: string,
  rootNamespace: string,
): CollectionWriteResult<PageBookmark[]> {
  const envelope = readEnvelope();
  const current = rootCollections(envelope, rootNamespace);
  const retained = current.bookmarks.filter((bookmark) => bookmark.itemKey !== itemKey);
  const failure = writeJson(
    ROOT_COLLECTIONS_KEY,
    replaceRootCollections(envelope, { ...current, bookmarks: retained }),
  );
  return failure === null
    ? { ok: true, value: [] }
    : { ok: false, value: sortedBookmarks(current.bookmarks, itemKey), reason: failure };
}

export function resolveBookmarks(
  bookmarks: readonly PageBookmark[],
  pageKeys: readonly string[],
): PageBookmark[] {
  const pageIndexByKey = new Map<string, number>();
  pageKeys.forEach((pageKey, index) => {
    if (!pageIndexByKey.has(pageKey)) pageIndexByKey.set(pageKey, index);
  });
  return dedupeBookmarks(bookmarks.filter(isPageBookmark))
    .flatMap((bookmark): PageBookmark[] => {
      const pageIndex = pageIndexByKey.get(bookmark.pageKey);
      return pageIndex === undefined ? [] : [{ ...bookmark, pageIndex }];
    })
    .sort((left, right) => left.pageIndex - right.pageIndex || left.createdAt - right.createdAt);
}

export function nextResolvedBookmark(
  bookmarks: readonly PageBookmark[],
  pageKeys: readonly string[],
  pageIndex: number,
): PageBookmark | null {
  const resolved = resolveBookmarks(bookmarks, pageKeys);
  return resolved.find((bookmark) => bookmark.pageIndex > pageIndex) ?? resolved[0] ?? null;
}

export function nextBookmark(bookmarks: PageBookmark[], pageIndex: number): PageBookmark | null;
export function nextBookmark(
  bookmarks: PageBookmark[],
  pageKeys: readonly string[],
  pageIndex: number,
): PageBookmark | null;
export function nextBookmark(
  bookmarks: PageBookmark[],
  pageKeysOrIndex: readonly string[] | number,
  pageIndex?: number,
): PageBookmark | null {
  if (typeof pageKeysOrIndex === "number") {
    return bookmarks.find((bookmark) => bookmark.pageIndex > pageKeysOrIndex)
      ?? bookmarks[0]
      ?? null;
  }
  return nextResolvedBookmark(bookmarks, pageKeysOrIndex, pageIndex ?? 0);
}

export function listBookshelf(rootNamespace?: string): string[] {
  return rootNamespace === undefined
    ? sanitizeBookshelf(readJson(BOOKSHELF_KEY))
    : [...rootCollections(readEnvelope(), rootNamespace).bookshelf];
}

export function addBookshelfItemResult(
  path: string,
  rootNamespace?: string,
): CollectionWriteResult<string[]> {
  const current = listBookshelf(rootNamespace);
  if (!validBookshelfPath(path)) {
    return { ok: false, value: current, reason: "invalid-data" };
  }
  const next = [...new Set([...current, path])]
    .sort((left, right) => left.localeCompare(right, "ja"));

  if (rootNamespace === undefined) {
    const failure = writeJson(BOOKSHELF_KEY, next);
    return failure === null
      ? { ok: true, value: next }
      : { ok: false, value: current, reason: failure };
  }

  const envelope = readEnvelope();
  const root = rootCollections(envelope, rootNamespace);
  const failure = writeJson(
    ROOT_COLLECTIONS_KEY,
    replaceRootCollections(envelope, { ...root, bookshelf: next }),
  );
  return failure === null
    ? { ok: true, value: next }
    : { ok: false, value: current, reason: failure };
}

export function addBookshelfItem(path: string, rootNamespace?: string): string[] {
  return addBookshelfItemResult(path, rootNamespace).value;
}

export function removeBookshelfItemResult(
  path: string,
  rootNamespace?: string,
): CollectionWriteResult<string[]> {
  const current = listBookshelf(rootNamespace);
  const next = current.filter((candidate) => candidate !== path);

  if (rootNamespace === undefined) {
    const failure = writeJson(BOOKSHELF_KEY, next);
    return failure === null
      ? { ok: true, value: next }
      : { ok: false, value: current, reason: failure };
  }

  const envelope = readEnvelope();
  const root = rootCollections(envelope, rootNamespace);
  const failure = writeJson(
    ROOT_COLLECTIONS_KEY,
    replaceRootCollections(envelope, { ...root, bookshelf: next }),
  );
  return failure === null
    ? { ok: true, value: next }
    : { ok: false, value: current, reason: failure };
}

export function removeBookshelfItem(path: string, rootNamespace?: string): string[] {
  return removeBookshelfItemResult(path, rootNamespace).value;
}

export function clearLegacyBookshelfResult(
  rootNamespace: string,
): CollectionWriteResult<string[]> {
  const envelope = readEnvelope();
  const current = rootCollections(envelope, rootNamespace);
  const failure = writeJson(
    ROOT_COLLECTIONS_KEY,
    replaceRootCollections(envelope, { ...current, bookshelf: [] }),
  );
  return failure === null
    ? { ok: true, value: [] }
    : { ok: false, value: [...current.bookshelf], reason: failure };
}

/**
 * Claims the legacy unscoped v1 data for exactly one root. The v1 keys are kept
 * intact so a failed migration is recoverable, while legacyOwner prevents a
 * later root from importing the same relative paths.
 */
export function migrateLegacyCollections(
  rootNamespace: string,
): CollectionWriteResult<RootCollections> {
  const envelope = readEnvelope();
  const current = rootCollections(envelope, rootNamespace);
  if (rootNamespace.length === 0) {
    return { ok: false, value: current, reason: "invalid-data" };
  }
  if (envelope.legacyOwner !== undefined) {
    return { ok: true, value: current };
  }

  const migrated: RootCollections = {
    namespace: rootNamespace,
    bookmarks: dedupeBookmarks([
      ...current.bookmarks,
      ...sanitizeBookmarks(readJson(BOOKMARKS_KEY)),
    ]),
    bookshelf: [...new Set([
      ...current.bookshelf,
      ...sanitizeBookshelf(readJson(BOOKSHELF_KEY)),
    ])],
  };
  const nextEnvelope = replaceRootCollections(
    { ...envelope, legacyOwner: rootNamespace },
    migrated,
  );
  const failure = writeJson(ROOT_COLLECTIONS_KEY, nextEnvelope);
  return failure === null
    ? { ok: true, value: migrated }
    : { ok: false, value: current, reason: failure };
}
