import type { CatalogEntry } from "../../types/domain";

export type SortField = "name" | "modified" | "size" | "kind";
export type SortDirection = "ascending" | "descending";

function ordinalCompare(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function naturalCompare(left: string, right: string): number {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftDigit = left.charCodeAt(leftIndex) >= 48 && left.charCodeAt(leftIndex) <= 57;
    const rightDigit =
      right.charCodeAt(rightIndex) >= 48 && right.charCodeAt(rightIndex) <= 57;
    if (leftDigit && rightDigit) {
      let leftEnd = leftIndex;
      let rightEnd = rightIndex;
      while (leftEnd < left.length && /\d/.test(left[leftEnd])) leftEnd += 1;
      while (rightEnd < right.length && /\d/.test(right[rightEnd])) rightEnd += 1;
      const leftRun = left.slice(leftIndex, leftEnd);
      const rightRun = right.slice(rightIndex, rightEnd);
      const leftSignificant = leftRun.replace(/^0+/, "") || "0";
      const rightSignificant = rightRun.replace(/^0+/, "") || "0";
      const numericDifference =
        leftSignificant.length - rightSignificant.length ||
        ordinalCompare(leftSignificant, rightSignificant);
      if (numericDifference !== 0) return numericDifference;
      const runDifference = ordinalCompare(leftRun, rightRun);
      if (runDifference !== 0) return runDifference;
      leftIndex = leftEnd;
      rightIndex = rightEnd;
      continue;
    }
    const difference = left.charCodeAt(leftIndex) - right.charCodeAt(rightIndex);
    if (difference !== 0) return difference;
    leftIndex += 1;
    rightIndex += 1;
  }
  return left.length - right.length;
}

function displayName(entry: CatalogEntry): string {
  return entry.relativePath.split("/").at(-1) ?? entry.relativePath;
}

function kindRank(entry: CatalogEntry): number {
  if (entry.kind === "folder") return 0;
  if (entry.kind === "comicFolder") return 1;
  if (entry.kind === "archive" && entry.archiveKind === "zip") return 2;
  if (entry.kind === "archive" && entry.archiveKind === "cbz") return 3;
  return 4;
}

function optionalNumberCompare(
  left: number | undefined,
  right: number | undefined,
  direction: SortDirection,
): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  const difference = left - right;
  return direction === "ascending" ? difference : -difference;
}

export function compareCatalogEntries(
  left: CatalogEntry,
  right: CatalogEntry,
  field: SortField,
  direction: SortDirection,
): number {
  let primary = 0;
  if (field === "name") primary = naturalCompare(displayName(left), displayName(right));
  else if (field === "modified")
    primary = optionalNumberCompare(left.modifiedMs, right.modifiedMs, direction);
  else if (field === "size")
    primary = optionalNumberCompare(left.byteSize, right.byteSize, direction);
  else primary = kindRank(left) - kindRank(right);

  if (field !== "modified" && field !== "size" && direction === "descending") {
    primary = -primary;
  }
  if (primary !== 0) return primary;

  const name = naturalCompare(displayName(left), displayName(right));
  if (name !== 0) return name;
  return ordinalCompare(left.relativePath, right.relativePath);
}

export function sortCatalogEntries(
  entries: readonly CatalogEntry[],
  field: SortField,
  direction: SortDirection,
): CatalogEntry[] {
  return [...entries].sort((left, right) =>
    compareCatalogEntries(left, right, field, direction),
  );
}

export function nextComicEntry(
  entries: readonly CatalogEntry[],
  currentRelativePath: string,
): CatalogEntry | undefined {
  const current = entries.findIndex(
    (entry) => entry.relativePath === currentRelativePath,
  );
  if (current < 0) return undefined;
  return entries
    .slice(current + 1)
    .find((entry) => entry.kind === "comicFolder" || entry.kind === "archive");
}
