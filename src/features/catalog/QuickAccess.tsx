import type { FavoriteEntry } from "../library/client";

interface QuickAccessProps {
  favorites: FavoriteEntry[];
  loading: boolean;
  refreshRevision: number;
  notice: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpen: (favorite: FavoriteEntry) => void;
  onResolve: (favorite: FavoriteEntry) => void;
  onRemove: (favorite: FavoriteEntry) => void;
}

function kindLabel(favorite: FavoriteEntry): string {
  switch (favorite.kind) {
    case "folder":
      return "フォルダ";
    case "comicFolder":
      return "漫画フォルダ";
    case "archive":
      return "ZIP / CBZ";
    default:
      return "不明";
  }
}

function statusLabel(favorite: FavoriteEntry): string {
  switch (favorite.status) {
    case "available":
      return "利用可能";
    case "moved":
      return "移動を検出";
    case "missing":
      return "見つかりません";
  }
}

export function QuickAccess({
  favorites,
  loading,
  refreshRevision,
  notice,
  onClose,
  onRefresh,
  onOpen,
  onResolve,
  onRemove,
}: QuickAccessProps) {
  return (
    <div className="dialog-backdrop">
      <section
        className="quick-access-dialog"
        data-product-id="quick-access-dialog"
        data-favorite-refresh-revision={refreshRevision}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-access-title"
      >
        <div className="quick-access-heading">
          <h2 id="quick-access-title">お気に入り</h2>
          <div>
            <button
              type="button"
              data-product-id="favorite-refresh"
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? "確認中…" : "再走査"}
            </button>
            <button
              type="button"
              data-product-id="favorite-close"
              onClick={onClose}
            >
              閉じる
            </button>
          </div>
        </div>
        {notice !== null && <p className="error-panel" role="alert">{notice}</p>}
        {loading && favorites.length === 0 && (
          <p role="status">お気に入りを確認しています。</p>
        )}
        {!loading && favorites.length === 0 && (
          <p className="empty-state" role="status">お気に入りはありません。</p>
        )}
        {favorites.length > 0 && (
          <ul className="quick-access-list">
            {favorites.map((favorite) => {
              const canOpen = favorite.status === "available";
              const resolvedPath = favorite.resolvedPath;
              return (
                <li
                  key={favorite.favoriteId}
                  data-product-id="favorite-row"
                  data-favorite-id={favorite.favoriteId}
                  data-favorite-relative-path={favorite.relativePath}
                  data-favorite-resolved-path={favorite.resolvedPath ?? ""}
                  data-favorite-status={favorite.status}
                >
                  <div className="quick-access-main">
                    <span className="quick-access-path">{favorite.relativePath}</span>
                    <span className="quick-access-kind">{kindLabel(favorite)}</span>
                    <span className={`quick-access-status quick-access-status--${favorite.status}`}>
                      {statusLabel(favorite)}
                    </span>
                    {favorite.status === "moved" && resolvedPath !== null && (
                      <span className="quick-access-resolved">現在: {resolvedPath}</span>
                    )}
                  </div>
                  <div className="quick-access-actions">
                    <button
                      type="button"
                      data-product-id="favorite-open"
                      disabled={!canOpen}
                      onClick={() => onOpen(favorite)}
                    >
                      開く
                    </button>
                    {favorite.status === "moved" && resolvedPath !== null && (
                      <button
                        type="button"
                        data-product-id="favorite-resolve"
                        onClick={() => onResolve(favorite)}
                      >
                        再解決
                      </button>
                    )}
                    {favorite.status === "missing" && (
                      <button
                        type="button"
                        data-product-id="favorite-row-refresh"
                        onClick={onRefresh}
                        disabled={loading}
                      >
                        再走査
                      </button>
                    )}
                    <button
                      type="button"
                      data-product-id="favorite-remove"
                      onClick={() => onRemove(favorite)}
                    >
                      解除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
