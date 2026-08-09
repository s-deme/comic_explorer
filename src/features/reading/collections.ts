export interface PageBookmark {
  itemKey: string;
  pageIndex: number;
  pageKey: string;
  createdAt: number;
}

const BOOKMARKS_KEY = "comic-explorer.bookmarks.v1";
const BOOKSHELF_KEY = "comic-explorer.bookshelf.v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a locked app-data directory must not interrupt reading.
  }
}

export function listBookmarks(itemKey: string): PageBookmark[] {
  return readJson<PageBookmark[]>(BOOKMARKS_KEY, [])
    .filter((bookmark) => bookmark.itemKey === itemKey)
    .sort((left, right) => left.pageIndex - right.pageIndex || left.createdAt - right.createdAt);
}

export function saveBookmark(bookmark: PageBookmark): PageBookmark[] {
  const all = readJson<PageBookmark[]>(BOOKMARKS_KEY, [])
    .filter((candidate) => !(candidate.itemKey === bookmark.itemKey && candidate.pageIndex === bookmark.pageIndex));
  all.push(bookmark);
  writeJson(BOOKMARKS_KEY, all);
  return listBookmarks(bookmark.itemKey);
}

export function nextBookmark(bookmarks: PageBookmark[], pageIndex: number): PageBookmark | null {
  return bookmarks.find((bookmark) => bookmark.pageIndex > pageIndex) ?? bookmarks[0] ?? null;
}

export function listBookshelf(): string[] {
  return readJson<string[]>(BOOKSHELF_KEY, []).filter((path) => typeof path === "string");
}

export function addBookshelfItem(path: string): string[] {
  const next = [...new Set([...listBookshelf(), path])].sort((left, right) => left.localeCompare(right, "ja"));
  writeJson(BOOKSHELF_KEY, next);
  return next;
}

export function removeBookshelfItem(path: string): string[] {
  const next = listBookshelf().filter((candidate) => candidate !== path);
  writeJson(BOOKSHELF_KEY, next);
  return next;
}
