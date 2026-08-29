import type { CatalogEntry } from "../types/domain";

/** A readable archive entry for App-level tests. */
export function testArchiveEntry(relativePath: string): CatalogEntry {
  return {
    relativePath: relativePath as never,
    kind: "archive",
    archiveKind: "cbz",
  };
}
