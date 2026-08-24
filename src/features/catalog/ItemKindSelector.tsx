interface ItemKindSelectorProps {
  includeFolders: boolean;
  includeFiles: boolean;
  onChange: (next: { includeFolders: boolean; includeFiles: boolean }) => void;
  legend?: string;
}

export function ItemKindSelector({
  includeFolders,
  includeFiles,
  onChange,
  legend = "結果に含める種類",
}: ItemKindSelectorProps) {
  return (
    <fieldset className="item-kind-selector">
      <legend>{legend}</legend>
      <label>
        <input
          type="checkbox"
          aria-label="結果にフォルダーを含める"
          checked={includeFolders}
          disabled={includeFolders && !includeFiles}
          onChange={(event) => onChange({
            includeFolders: event.target.checked,
            includeFiles,
          })}
        />
        フォルダー
      </label>
      <label>
        <input
          type="checkbox"
          aria-label="結果にファイルを含める"
          checked={includeFiles}
          disabled={includeFiles && !includeFolders}
          onChange={(event) => onChange({
            includeFolders,
            includeFiles: event.target.checked,
          })}
        />
        ファイル
      </label>
    </fieldset>
  );
}
