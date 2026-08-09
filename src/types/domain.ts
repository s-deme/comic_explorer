export type ItemId = string & { readonly __brand: "ItemId" };
export type PageId = string & { readonly __brand: "PageId" };
export type RequestId = string & { readonly __brand: "RequestId" };
export type RelativePath = string & { readonly __brand: "RelativePath" };
export type Generation = number & { readonly __brand: "Generation" };

export type ItemKind =
  | "folder"
  | "comicFolder"
  | "archive"
  | "page"
  | "unsupported";

export type ImageFormat = "jpeg" | "png" | "webp";

export interface LibraryItem {
  id: ItemId;
  name: string;
  relativePath: RelativePath;
  kind: ItemKind;
}

export interface CatalogEntry {
  relativePath: RelativePath;
  kind: ItemKind;
  byteSize?: number;
  modifiedMs?: number;
  archiveKind?: "zip" | "cbz";
}

export interface Page {
  id: PageId;
  itemId: ItemId;
  relativePath: RelativePath;
  format: ImageFormat;
  width: number;
  height: number;
}

export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_PATH"
  | "OUTSIDE_LIBRARY_ROOT"
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "UNSUPPORTED_FORMAT"
  | "CORRUPT_IMAGE"
  | "CORRUPT_ARCHIVE"
  | "ENCRYPTED_ARCHIVE"
  | "RESOURCE_LIMIT"
  | "CANCELLED"
  | "INTERNAL";

export interface AppError {
  code: ErrorCode;
  message: string;
  target?: RelativePath;
  retryable: boolean;
}
