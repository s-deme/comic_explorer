import type { ViewerSession } from "../library/client";

export function resolveViewerCatalogSelection(
  session: ViewerSession,
  index: number,
  visiblePaths: ReadonlySet<string>,
): string | null {
  const pagePath = session.pages[index]?.relativePath;
  if (pagePath !== undefined && visiblePaths.has(pagePath)) return pagePath;
  if (visiblePaths.has(session.itemKey)) return session.itemKey;
  return null;
}
