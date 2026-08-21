import type { CatalogEntry } from "../../types/domain";

export type SelectionAction = "replace" | "toggle" | "range";
export type CatalogSelectionKind = CatalogEntry["kind"] | "file" | "image";

export function isCatalogFile(entry: CatalogEntry): boolean {
  return entry.kind !== "folder" && entry.kind !== "comicFolder";
}

export function selectEntriesByKind(
  entries: CatalogEntry[],
  kind: CatalogSelectionKind,
): string[] {
  return entries
    .filter((entry) => {
      if (kind === "file") return isCatalogFile(entry);
      if (kind === "image") return entry.kind === "page";
      return entry.kind === kind;
    })
    .map((entry) => entry.relativePath);
}

export function toggleEntrySelection(selected: string[], path: string): string[] {
  return selected.includes(path)
    ? selected.filter((value) => value !== path)
    : [...selected, path];
}

export function rangeSelection(
  entries: CatalogEntry[],
  anchor: string | null,
  target: string,
): string[] {
  const anchorIndex = anchor === null
    ? -1
    : entries.findIndex((entry) => entry.relativePath === anchor);
  const targetIndex = entries.findIndex((entry) => entry.relativePath === target);
  if (targetIndex < 0) return [];
  if (anchorIndex < 0) return [target];
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return entries.slice(start, end + 1).map((entry) => entry.relativePath);
}

export function csvEscape(value: string): string {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safeValue)
    ? `"${safeValue.replaceAll('"', '""')}"`
    : safeValue;
}

export function catalogCsv(entries: CatalogEntry[]): string {
  const header = ["name", "kind", "relativePath", "size", "modified"].join(",");
  const rows = entries.map((entry) => {
    const name = entry.relativePath.split("/").at(-1) ?? entry.relativePath;
    return [
      name,
      entry.kind,
      entry.relativePath,
      entry.byteSize?.toString() ?? "",
      entry.modifiedMs?.toString() ?? "",
    ].map(csvEscape).join(",");
  });
  return [header, ...rows].join("\n");
}
