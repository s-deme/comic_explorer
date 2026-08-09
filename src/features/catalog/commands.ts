import type { CatalogEntry } from "../../types/domain";

export type SelectionAction = "replace" | "toggle" | "range";

export function selectEntriesByKind(
  entries: CatalogEntry[],
  kind: CatalogEntry["kind"] | "image",
): string[] {
  return entries
    .filter((entry) => kind === "image" ? entry.kind === "page" : entry.kind === kind)
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
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
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

export function globMatch(value: string, mask: string): boolean {
  const escaped = mask
    .split("")
    .map((character) => {
      if (character === "*") return ".*";
      if (character === "?") return ".";
      return /[\\^$+.()[\]{}|]/.test(character) ? `\\${character}` : character;
    })
    .join("");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

export function matchesMask(entry: CatalogEntry, mask: string): boolean {
  const normalized = mask.trim();
  if (normalized === "") return true;
  const name = entry.relativePath.split("/").at(-1) ?? entry.relativePath;
  return normalized.split(";").some((part) => part.trim() !== "" && globMatch(name, part.trim()));
}
