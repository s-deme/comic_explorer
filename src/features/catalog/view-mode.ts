export const CATALOG_VIEW_MODES = [
  "detail_list",
  "small_thumbnail",
  "cover_list",
  "card_grid",
  "reference_tile",
] as const;

export type CatalogViewMode = (typeof CATALOG_VIEW_MODES)[number];

export const CATALOG_VIEW_MODE_LABELS: Record<CatalogViewMode, string> = {
  detail_list: "詳細リスト",
  small_thumbnail: "小サムネイル",
  cover_list: "表紙グリッド",
  card_grid: "カードグリッド",
  reference_tile: "情報カード",
};

export interface CatalogThumbnailSizes {
  smallThumbnail: number;
  coverList: number;
  cardGrid: number;
  referenceTile: number;
}

export const MIN_CATALOG_THUMBNAIL_SIZE = 64;
export const MAX_CATALOG_THUMBNAIL_SIZE = 320;

export const DEFAULT_CATALOG_THUMBNAIL_SIZES: CatalogThumbnailSizes = {
  smallThumbnail: 104,
  coverList: 144,
  cardGrid: 216,
  referenceTile: 128,
};

export function normalizeCatalogThumbnailSize(
  value: unknown,
  fallback: number,
): number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= MIN_CATALOG_THUMBNAIL_SIZE
    && value <= MAX_CATALOG_THUMBNAIL_SIZE
    ? value
    : fallback;
}

export function normalizeCatalogThumbnailSizes(value: unknown): CatalogThumbnailSizes {
  const candidate = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<CatalogThumbnailSizes>
    : {};
  return {
    smallThumbnail: normalizeCatalogThumbnailSize(
      candidate.smallThumbnail,
      DEFAULT_CATALOG_THUMBNAIL_SIZES.smallThumbnail,
    ),
    coverList: normalizeCatalogThumbnailSize(
      candidate.coverList,
      DEFAULT_CATALOG_THUMBNAIL_SIZES.coverList,
    ),
    cardGrid: normalizeCatalogThumbnailSize(
      candidate.cardGrid,
      DEFAULT_CATALOG_THUMBNAIL_SIZES.cardGrid,
    ),
    referenceTile: normalizeCatalogThumbnailSize(
      candidate.referenceTile,
      DEFAULT_CATALOG_THUMBNAIL_SIZES.referenceTile,
    ),
  };
}

export const DEFAULT_CATALOG_VIEW_MODE: CatalogViewMode = "cover_list";

export function normalizeCatalogViewMode(
  value: string | null | undefined,
): CatalogViewMode {
  return CATALOG_VIEW_MODES.includes(value as CatalogViewMode)
    ? (value as CatalogViewMode)
    : DEFAULT_CATALOG_VIEW_MODE;
}
