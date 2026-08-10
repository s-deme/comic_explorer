---
codd:
  node_id: "req:fr-b03"
  type: requirement
  status: approved
  confidence: 0.92
  depends_on:
    - id: "req:mvp-requirements"
      relation: "extends"
      semantic: "catalog-contract"
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "Q4-2-adoption"
---

# FR-B03 一覧表示形式要件

## 採用記録

Q4-2由来の候補をC0で採用し、`FUT-C-012`〜`FUT-C-014`を一つのcatalog view
mode契約へ統合する。採用IDは次の3件で固定する。

`FUT-C-012`, `FUT-C-013`, `FUT-C-014`

一覧形式はViewerの単ページ／見開き設定（`viewMode`）とは別の
`catalogViewMode`として保存する。初回起動、旧DB、欠損値、不正値の既定は
`cover_list`とし、既存の表紙付き一覧表示を維持する。

## REQ-FR-B03-001: mode boundary

UI、UI-backend境界、SQLiteは次の3値だけを受け付ける。

| `catalogViewMode` | 採用ID | 表示契約 |
|---|---|---|
| `small_thumbnail` | FUT-C-012 | 小さな表紙サムネイルを複数列に配置し、長名を省略しても完全名をアクセシブル名で保持する |
| `detail_list` | FUT-C-013 | 1行1項目で名前・種別・サイズ・更新日時を列として表示し、欠損メタデータは`—`で表示する |
| `cover_list` | FUT-C-014 | 既存の表紙付き複数列表示を維持し、名前・種別・表紙を同じ項目内で表示する |

全modeで一覧件数、長名、種別、選択状態を接続済みUIから確認できる。件数は
ステータスバーと一覧の`data-entry-count`で同じsnapshotを示す。folderの再帰サイズや
ページ数を推測して補完せず、存在しないサイズ・更新日時は`—`とする。

## REQ-FR-B03-002: interaction and persistence

mode切替は現在のfolderとsort済み項目を維持したまま即時反映する。各modeの全項目へ
virtualizationを通じて到達でき、クリック・矢印キー・Home/End・Enter・Ctrl+Enterの
選択、scroll、keyboard focusを維持する。mode切替または再描画後も選択項目が存在すれば
その項目へscrollしてfocusを戻す。

`catalogViewMode`は既存app-local SQLite `settings` tableの`catalogViewMode`へ保存し、
再起動後に復元する。未知値や旧DBにキーがない場合は`cover_list`へ正規化する。library
root配下へDB、cache、temp、log、sidecarを作成せず、外部通信を追加しない。

## C0/C1 ownership checkpoint

FR-B03は一名のintegration ownerで実装する。C0でenum・既定値・3 layout境界を固定し、
C1で次のpath ownershipとconnected evidence matrixを凍結する。

| boundary | owned paths | contract |
|---|---|---|
| mode/view model | `src/features/catalog/view-mode.ts`, `src/features/catalog/view-mode.test.ts` | enum、label、未知値→`cover_list` |
| UI integration | `src/App.tsx`, `src/features/catalog/CatalogGrid.tsx`, `src/styles.css` | selector、3 layout、metadata、selection/scroll/focus |
| persistence/API | `src/features/library/client.ts`, `src-tauri/src/application/mod.rs`, `src-tauri/src/state/repository.rs`, `src-tauri/src/lib.rs` | validation、default、SQLite save/load、local-only |
| direct evidence | `docs/requirements/catalog-view-requirements.md`, `docs/testing/fr-b03-results.md`, `docs/product/feature-status.md`, `docs/product/feature-roadmap.md` | adopted IDs、実装path、FT-B03、gate結果を同期 |

### Connected evidence matrix

| checkpoint | observable contract | required evidence |
|---|---|---|
| C0 | 3値、既定`cover_list`、不正値の安全なfallback | `FT-B03-001` connected App mode selector |
| C1 metadata | 長名、種別、件数、欠損値を各modeで表示 | `FT-B03-002` connected App/CatalogGrid observation |
| C1 interaction | 選択、scroll、keyboard focus、sort結果を各modeで維持 | `FT-B03-003` connected App/CatalogGrid observation |
| C1 persistence | selector save、SQLite reopen、再起動復元 | `FT-B03-004` connected App restore + Rust reopen |

pure unit testだけで完了扱いにせず、少なくとも`App`から`CatalogGrid`へ接続した証跡を
各行に残す。FT-B03が1件でもSKIPまたは未接続ならFR-B03をPASSへ更新しない。

## Non-destructive and batch boundary

一覧形式の設定はlibrary root外の既存app-local stateだけへ保存する。原本、ZIP/CBZ、
library管理file、thumbnail sourceへ書込みを行わず、network/installを実行しない。
後続batchはFR-B03のfocused QCとbatch末尾gateがACCEPTされるまで開始しない。
