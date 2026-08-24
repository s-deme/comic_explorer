import type { SavedCatalogMask } from "../library/client";
import { ItemKindSelector } from "./ItemKindSelector";

export interface CatalogFilterDraft {
  includeFolders: boolean;
  includeFiles: boolean;
  minSizeKiB: string;
  maxSizeKiB: string;
  dateStart: string;
  dateEnd: string;
}

interface CatalogFilterBarProps {
  expression: string;
  options: CatalogFilterDraft;
  active: boolean;
  activeExpression: string;
  searchResultsVisible: boolean;
  busy: boolean;
  error: string | null;
  savedMasks: SavedCatalogMask[];
  selectedSavedMask: string;
  savedMaskName: string;
  savedMaskBusy: boolean;
  savedMaskNotice: string | null;
  pendingDelete: string | null;
  onExpressionChange: (value: string) => void;
  onOptionsChange: (next: CatalogFilterDraft) => void;
  onApply: () => void;
  onClear: () => void;
  onRestoreSavedMask: (name: string) => void;
  onSavedMaskNameChange: (name: string) => void;
  onSave: () => void;
  onRequestDelete: (name: string) => void;
  onConfirmDelete: (name: string) => void;
  onCancelDelete: () => void;
}

export function CatalogFilterBar({
  expression,
  options,
  active,
  activeExpression,
  searchResultsVisible,
  busy,
  error,
  savedMasks,
  selectedSavedMask,
  savedMaskName,
  savedMaskBusy,
  savedMaskNotice,
  pendingDelete,
  onExpressionChange,
  onOptionsChange,
  onApply,
  onClear,
  onRestoreSavedMask,
  onSavedMaskNameChange,
  onSave,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: CatalogFilterBarProps) {
  const sizeSpecified = options.minSizeKiB !== "" || options.maxSizeKiB !== "";

  return (
    <section className="catalog-filter-bar" aria-label="現在の一覧を絞り込む">
      <form
        className="catalog-filter-primary"
        aria-label="一覧の絞り込みフォーム"
        onSubmit={(event) => {
          event.preventDefault();
          onApply();
        }}
      >
        <label htmlFor="catalog-filter-expression">現在の一覧を絞り込む</label>
        <input
          id="catalog-filter-expression"
          aria-label="一覧の絞り込み"
          aria-describedby="catalog-filter-syntax"
          value={expression}
          onChange={(event) => onExpressionChange(event.target.value)}
          placeholder="例: *.jpg;*.cbz"
        />
        <button type="submit" disabled={busy}>適用</button>
        <button type="button" onClick={onClear}>絞り込みを解除</button>
      </form>
      <p id="catalog-filter-syntax" className="catalog-filter-hint">
        現在表示しているフォルダー直下だけを絞り込みます。*、?、AND / OR / NOTを使用できます。
      </p>
      {active && (
        <div className="catalog-filter-active" role="status">
          <span>適用中: {activeExpression || "詳細条件"}</span>
          {searchResultsVisible && <span>名前検索結果には適用されません。</span>}
        </div>
      )}
      <details className="catalog-filter-details">
        <summary>詳細条件と保存済み条件</summary>
        <ItemKindSelector
          includeFolders={options.includeFolders}
          includeFiles={options.includeFiles}
          onChange={(kind) => onOptionsChange({ ...options, ...kind })}
        />
        <div className="catalog-filter-ranges">
          <label>
            最小サイズ (KiB)
            <input
              type="number"
              min="0"
              step="1"
              value={options.minSizeKiB}
              onChange={(event) => onOptionsChange({ ...options, minSizeKiB: event.target.value })}
            />
          </label>
          <label>
            最大サイズ (KiB)
            <input
              type="number"
              min="0"
              step="1"
              value={options.maxSizeKiB}
              onChange={(event) => onOptionsChange({ ...options, maxSizeKiB: event.target.value })}
            />
          </label>
          <label>
            更新日（開始）
            <input
              type="date"
              value={options.dateStart}
              onChange={(event) => onOptionsChange({ ...options, dateStart: event.target.value })}
            />
          </label>
          <label>
            更新日（終了）
            <input
              type="date"
              value={options.dateEnd}
              onChange={(event) => onOptionsChange({ ...options, dateEnd: event.target.value })}
            />
          </label>
        </div>
        {sizeSpecified && options.includeFolders && (
          <p className="catalog-filter-note">
            サイズ情報のないフォルダーは、サイズ条件を指定している間は結果に含まれません。
          </p>
        )}
        <section className="saved-catalog-masks" aria-label="保存済み一覧フィルター">
          <label htmlFor="saved-catalog-mask">保存済み条件</label>
          <select
            id="saved-catalog-mask"
            value={selectedSavedMask}
            onChange={(event) => onRestoreSavedMask(event.target.value)}
          >
            <option value="">選択してください</option>
            {savedMasks.map((mask) => (
              <option key={mask.name} value={mask.name}>{mask.name}</option>
            ))}
          </select>
          <label htmlFor="saved-catalog-mask-name">条件名</label>
          <input
            id="saved-catalog-mask-name"
            value={savedMaskName}
            maxLength={64}
            onChange={(event) => onSavedMaskNameChange(event.target.value)}
          />
          <div className="search-pane-actions">
            <button type="button" disabled={savedMaskBusy} onClick={onSave}>
              保存・同名置換
            </button>
            {selectedSavedMask !== "" && (
              <button
                type="button"
                disabled={savedMaskBusy}
                onClick={() => onRequestDelete(selectedSavedMask)}
              >
                削除
              </button>
            )}
          </div>
          {pendingDelete !== null && (
            <div role="alertdialog" aria-label="保存済み条件の削除確認">
              <p>「{pendingDelete}」を削除しますか？</p>
              <button type="button" onClick={() => onConfirmDelete(pendingDelete)}>
                削除を確定
              </button>
              <button type="button" onClick={onCancelDelete}>キャンセル</button>
            </div>
          )}
          {savedMaskNotice !== null && <p role="status">{savedMaskNotice}</p>}
        </section>
      </details>
      {busy && <p role="status">一覧を絞り込んでいます…</p>}
      {error !== null && <p role="alert">{error}</p>}
    </section>
  );
}
