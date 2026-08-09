export const CATALOG_VIEW_MODES = [
  "small_thumbnail",
  "detail_list",
  "cover_list",
  "reference_tile",
] as const;

export type CatalogViewMode = (typeof CATALOG_VIEW_MODES)[number];

export const CATALOG_VIEW_MODE_LABELS: Record<CatalogViewMode, string> = {
  small_thumbnail: "小サムネイル",
  detail_list: "詳細リスト",
  cover_list: "表紙付きリスト",
  reference_tile: "参照型タイル",
};

export const DEFAULT_CATALOG_VIEW_MODE: CatalogViewMode = "cover_list";

export function normalizeCatalogViewMode(
  value: string | null | undefined,
): CatalogViewMode {
  return CATALOG_VIEW_MODES.includes(value as CatalogViewMode)
    ? (value as CatalogViewMode)
    : DEFAULT_CATALOG_VIEW_MODE;
}
