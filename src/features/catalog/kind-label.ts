import type { CatalogEntry, ItemKind } from "../../types/domain";

export type ArchiveKind = NonNullable<CatalogEntry["archiveKind"]>;

const ARCHIVE_KIND_BY_EXTENSION: Record<string, ArchiveKind> = {
  zip: "zip",
  cbz: "cbz",
  epub: "epub",
  rar: "rar",
  cbr: "cbr",
  "7z": "sevenZip",
  cb7: "cb7",
  lzh: "lzh",
};

const ARCHIVE_KIND_LABELS: Record<ArchiveKind, string> = {
  zip: "ZIP",
  cbz: "CBZ",
  epub: "EPUB",
  rar: "RAR",
  cbr: "CBR",
  sevenZip: "7Z",
  cb7: "CB7",
  lzh: "LZH",
};

export function archiveKindFromPath(path: string): ArchiveKind | undefined {
  const extension = path.split(".").at(-1)?.toLocaleLowerCase("en-US");
  return extension === undefined ? undefined : ARCHIVE_KIND_BY_EXTENSION[extension];
}

function extensionLabel(path: string): string {
  const name = path.split("/").at(-1) ?? path;
  const separator = name.lastIndexOf(".");
  return separator > 0 && separator < name.length - 1
    ? name.slice(separator)
    : "拡張子なし";
}

export function itemKindLabel(
  kind: ItemKind | null,
  relativePath: string,
  archiveKind?: ArchiveKind,
): string {
  switch (kind) {
    case "folder":
      return "フォルダ";
    case "comicFolder":
      return "漫画フォルダ";
    case "archive": {
      const resolvedKind = archiveKind ?? archiveKindFromPath(relativePath);
      return resolvedKind === undefined ? "書庫" : ARCHIVE_KIND_LABELS[resolvedKind];
    }
    case "pdf":
      return "PDF";
    case "page":
      return "画像";
    case "unsupported":
      return extensionLabel(relativePath);
    default:
      return "不明";
  }
}
