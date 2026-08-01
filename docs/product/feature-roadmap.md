---
codd:
  node_id: "product:feature-roadmap"
  type: design
  status: active
  depends_on:
    - id: "product:feature-status"
      relation: "derives_from"
      semantic: "governance"
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "priority"
---

# Comic Explorer 機能ロードマップ

## 目的と正本

本書は、未実装機能を縦切りの小さな実装単位へ並べるための**優先順位案**である。
未承認の候補を実装決定済みとは扱わない。機能の採否、実装状態、検証状態、根拠は
[機能ステータス台帳](./feature-status.md)を正本とし、本書はその台帳を変更せずに
実装順、依存、Feature Lane の境界、完了ゲートを管理する。

本書を読んだだけでは実装を開始しない。候補の採用が承認され、対象行の一次根拠、
実装根拠、直接観測テストが揃ったときだけ `feature-status.md` の状態を更新する。
`Candidate`、`Deferred`、`NOT TESTED` を `Planned`、`Implemented`、`PASS` と読み替えない。

### 二つの状態語彙

ロードマップの `Planned` / `In Progress` / `Blocked` / `Done` は、バッチを実行する
運用状態である。台帳の `Implemented` / `Partial` / `Planned` / `Candidate` /
`Deferred` / `Rejected`（実装状態）と、`PASS` / `FAIL` / `BLOCKED` /
`NOT TESTED`（検証状態）は別の値であり、本書が台帳の状態を上書きすることはない。

| ロードマップ状態 | 判定条件 |
|---|---|
| `Planned` | 優先順位案として登録済み。実装作業は未着手。 |
| `In Progress` | 採用承認後、担当と focused test が割り当てられ、実装中。 |
| `Blocked` | 明示された依存、環境、ライセンス、安全設計、または採否判断が未解決。未着手の候補を先行割当しない。 |
| `Done` | 対象範囲の実装根拠と直接観測 focused test が揃い、台帳側も正しい状態へ更新され、末尾ゲートを通過。 |

FR-B02はC0採用承認とpilot実装・重点QCを完了し、`Done`へ更新した。FR-B03もC0/C1の
connected evidence、focused QC、batch末尾gateを完了し、`Done`へ更新した。FR-B04〜FR-B12は
引き続き`Planned`であり、未着手の対象`FUT-*`行を実装決定や完了とは扱わない。

## 推奨実装順

順序は表示倍率、巻末動作、一覧表示形式、閲覧画面 mode、名前検索、お気に入り、
読書情報、追加画像形式、library 診断、tag 管理、入力拡張、追加書庫形式で固定する。
各バッチは原則3〜5原子機能を目標とする。ただし、台帳が明示的に原子化した機能や、
同じ縦切りの親子境界を人工的に分割しないため、6機能または1〜2機能になるバッチは
例外として記録する。IDを水増しして3〜5に見せない。

| 固定ID | Batch | 領域 | 対象 feature ID（台帳の原子ID） | 現在の運用状態 |
|---|---:|---|---|---|
| `FR-B01` | 1 | 表示倍率 | `FUT-C-018`, `FUT-C-033`〜`FUT-C-037` | `Done`（重点QC完了） |
| `FR-B02` | 2 | 巻末動作 | `FUT-C-020`, `FUT-C-038`〜`FUT-C-041` | `Done`（pilot実装・重点QC完了） |
| `FR-B03` | 3 | 一覧表示形式 | `FUT-C-012`〜`FUT-C-014` | `Done`（重点QC完了） |
| `FR-B04` | 4 | 閲覧画面 mode | `FUT-C-015`〜`FUT-C-017` | `Planned` |
| `FR-B05` | 5 | 名前検索 | `FUT-C-010` | `Planned` |
| `FR-B06` | 6 | お気に入り | `FUT-C-011`, `FUT-C-021` | `Planned` |
| `FR-B07` | 7 | 読書情報 | `FUT-C-023`, `FUT-R-004`, `FUT-R-005` | `Planned` |
| `FR-B08` | 8 | 追加画像形式 | `FUT-C-005`〜`FUT-C-008` | `Planned` |
| `FR-B09` | 9 | library 診断 | `FUT-C-030`〜`FUT-C-032` | `Planned` |
| `FR-B10` | 10 | tag 管理 | `FUT-C-022` | `Planned` |
| `FR-B11` | 11 | 入力拡張 | `FUT-C-019`, `FUT-R-006`, `FUT-R-007` | `Planned` |
| `FR-B12` | 12 | 追加書庫形式 | `FUT-C-001`, `FUT-C-002` | `Planned` |

## バッチ仕様

### FR-B01 — 表示倍率（Batch 1、重点QC）

- **状態:** `Done`。対象6行は採用要件化され、`Implemented / PASS`へ更新済み。Q5-4 の記述を、
  任意倍率、横幅フィット、高さフィット、原寸、状態維持、ルーペの原子要件として実装した。
- **対象 feature ID:** `FUT-C-018`, `FUT-C-033`, `FUT-C-034`, `FUT-C-035`,
  `FUT-C-036`, `FUT-C-037`（6原子機能。台帳の原子化を優先するため3〜5の例外）。
- **user outcome:** 読者が、画像を読みやすい倍率または表示領域への fit へ切り替え、
  ページ遷移後も意図した見え方を保ったまま閲覧できる。
- **共通基盤:** viewer の scale model、fit mode の列挙、画像表示領域と pointer の座標変換、
  ローカル設定の保存、既存の比率維持・全体 fit の契約。
- **依存:** `REQ-MVP-011`、`REQ-MVP-012`、`REQ-MVP-014` の既存 viewer 契約。原本へ
  書き込まず、外部通信を行わないこと。
- **実装順:** (1) scale/fit の共通状態と境界値、(2) 任意倍率と横幅・高さ fit、
  (3) 原寸表示とページ間の状態維持、(4) pointer 周辺のルーペ、(5) 設定復元。
- **focused test 範囲:** `FT-B01-001` 任意倍率の上下限・丸め、`FT-B01-002` 横幅/高さ fit、
  `FT-B01-003` 原寸とページ移動時の状態維持、`FT-B01-004` ルーペの pointer 境界、
  `FT-B01-005` 再起動復元。未作成の test ID は実測結果を表さない。
- **batch末尾 gate:** `BATCH-1-FOCUSED-QC`（全 focused test を SKIP 0 で実測し、
  scale/fit の境界を重点QC）を通過した後、共通の `BATCH-END-GATE` を通過する。

#### FR-B01 実装・直接観測証跡

- **採用要件:** [FR-B01 表示倍率要件](../requirements/viewer-scale-requirements.md)。
- **実装根拠:** `src/features/viewer/model.ts`、`src/features/viewer/Viewer.tsx`、
  `src/styles.css`、`src/features/library/client.ts`、`src/App.tsx`、
  `src-tauri/src/application/mod.rs`、`src-tauri/src/state/repository.rs`。
- **直接観測:** [FR-B01 focused test結果](../testing/fr-b01-results.md)。FT-B01-001〜005は
  12 tests、SKIP 0、失敗0でPASS。既存単頁・見開き・左右読み・page/作品遷移のcomponent
  回帰も同じViewerテストで確認した。
- **設定境界:** customは25%〜400%、0.1倍刻み。scale mode、倍率、ルーペを既存local
  settingsへ保存し、library root外・外部通信0を維持する。
- **未実行環境:** Windows WebView2製品harnessはLinux環境のため未実行。これはcomponent
  focused test、Rust check/test、CoDD verifyのPASSとは別の製品実機gateとして保持する。

### FR-B02 — 巻末動作（Batch 2、pilot完了）

- **状態:** `Done`。対象5行はC0で採用要件化され、`Implemented / PASS`へ更新済み。
- **対象 feature ID:** `FUT-C-020`, `FUT-C-038`, `FUT-C-039`, `FUT-C-040`, `FUT-C-041`。
- **user outcome:** 巻末で、次の巻を開く、確認してから開く、library へ戻る、停止する、
  または先頭へ loop する動作を読者が選べる。
- **共通基盤:** end-of-volume policy の設定 schema、確認 dialog、並べ替え済み catalog の
  次項目解決、設定復元、対象がない場合の安全な留まり方。
- **依存:** `REQ-MVP-016` の固定既定動作と `REQ-MVP-007` の並べ替え契約。既定動作を
  壊さず、設定機能を追加する。B02 の完了は、B01 の倍率機能を必須条件にしない。
- **実装順:** (1) 共通 policy と「次がない」分岐、(2) 自動遷移、(3) 確認後遷移、
  (4) library 復帰と停止、(5) loop と設定の永続化。
- **focused test 範囲:** `FT-B02-001` 自動遷移、`FT-B02-002` 確認後遷移、
  `FT-B02-003` 一覧復帰、`FT-B02-004` 停止、`FT-B02-005` loop/次項目なし、
  `FT-B02-006` sort 順と再起動復元。
- **batch末尾 gate:** 全6本の focused test を SKIP 0 で実測し、既存 `TC-UI-014`/
  `TC-E2E-003` 相当の既定動作を退行させないことを確認した後、`BATCH-END-GATE`。

#### FR-B02 実装・直接観測証跡

- **採用要件:** [FR-B02 巻末動作要件](../requirements/end-of-volume-requirements.md)。
- **実装根拠:** `src/features/catalog/end-of-volume.ts`、`src/App.tsx`、
  `src/features/library/client.ts`、`src-tauri/src/application/mod.rs`、
  `src-tauri/src/state/repository.rs`、`src-tauri/src/lib.rs`。
- **直接観測:** [FR-B02 focused test結果](../testing/fr-b02-results.md)。FT-B02-001〜006は
  policy resolver、確認UI、一覧復帰、停止、loop/no-next、sort順と再起動復元を対象に
  SKIP 0で実測する。
- **C0/C1境界:** `auto_next`、`confirm_next`、`return_library`、`stop`、`loop`を固定し、
  未知値と旧設定の既定値は`auto_next`。次項目なしはloopだけsort済み先頭へ戻り、他は
  現在巻末に留まる。B04〜B12はB03の重点QC完了まで開始しない。
- **非破壊境界:** policyはlibrary root外のapp-local SQLite settingsへ保存し、原本・書庫・
  library管理fileの新規作成0、外部通信0を維持する。

### FR-B03 — 一覧表示形式（Batch 3、serial完了）

- **状態:** `Done`。対象3行はC0で採用要件化され、`Implemented / PASS`へ更新済み。
- **対象 feature ID:** `FUT-C-012`, `FUT-C-013`, `FUT-C-014`。
- **user outcome:** library の項目を小サムネイル、詳細リスト、表紙付きリストから選び、
  長い名前・種別・件数を文脈を失わず確認できる。
- **共通基盤:** Catalog item view mode、thumbnail と metadata の共通 view model、
  virtualization、選択状態と mode のローカル保存。
- **依存:** `REQ-MVP-005`、`REQ-MVP-006`、`REQ-MVP-007` の一覧、表紙、並べ替え契約。
- **実装順:** (1) mode 列挙と切替、(2) 小サムネイル、(3) 詳細列と欠損値、
  (4) 表紙付きレイアウト、(5) mode 復元と keyboard focus。
- **focused test 範囲:** `FT-B03-001` 三つの mode 切替、`FT-B03-002` 長名/種別/欠損値、
  `FT-B03-003` 選択・scroll・focus、`FT-B03-004` 再起動復元と sort 退行。
- **batch末尾 gate:** focused test を SKIP 0 で実測し、表示形式ごとに全項目へ到達できること、
  既存 `TC-UI-005`〜`TC-UI-007` 相当を退行させないことを確認して `BATCH-END-GATE`。

#### FR-B03 実装・直接観測証跡

- **採用要件:** [FR-B03 一覧表示形式要件](../requirements/catalog-view-requirements.md)。
- **実装根拠:** `src/features/catalog/view-mode.ts`、`src/features/catalog/CatalogGrid.tsx`、
  `src/App.tsx`、`src/styles.css`、`src/features/library/client.ts`、
  `src-tauri/src/application/mod.rs`、`src-tauri/src/state/repository.rs`、`src-tauri/src/lib.rs`。
- **直接観測:** [FR-B03 focused test結果](../testing/fr-b03-results.md)。FT-B03-001〜004は
  接続済み`App`→`CatalogGrid`のmode切替、metadata、選択・focus、設定復元をSKIP 0で実測した。
- **C0/C1境界:** `small_thumbnail`、`detail_list`、`cover_list`を固定し、既定値は`cover_list`。
  detail listはサイズ・更新日時の欠損を`—`で表示し、全modeの件数を一覧snapshotとstatus barで同期する。
- **非破壊境界:** `catalogViewMode`はlibrary root外のapp-local SQLite settingsへ保存し、
  原本・書庫・library管理fileの新規作成0、外部通信0を維持する。B04〜B12は未着手のまま保持する。

### FR-B04 — 閲覧画面 mode（Batch 4）

- **状態:** `Planned`。対象行は `Candidate / NOT TESTED`。
- **対象 feature ID:** `FUT-C-015`, `FUT-C-016`, `FUT-C-017`。
- **user outcome:** 読者が縦スクロール、横スクロール、full-screen を選び、現在ページ、
  読み方向、focus を保ったまま閲覧できる。
- **共通基盤:** viewer layout mode、navigation/input adapter、画面状態と OS window 状態の
  復元、B01 の scale/fit 契約との境界。
- **依存:** `REQ-MVP-011`〜`REQ-MVP-014`、B01 が定める scale 状態との整合。full-screen の
  OS 差は実機確認が必要で、未確認を PASS にしない。
- **実装順:** (1) viewer mode state、(2) 縦/横 layout、(3) full-screen lifecycle、
  (4) 読み方向・page anchor・focus の復元、(5) error/escape 復帰。
- **focused test 範囲:** `FT-B04-001` 縦スクロール、`FT-B04-002` 横スクロール、
  `FT-B04-003` full-screen enter/exit、`FT-B04-004` page anchor・読み方向・Esc、
  `FT-B04-005` 再起動と error 復帰。
- **batch末尾 gate:** 全 focused test を SKIP 0 で実測し、既存 `TC-UI-009`〜`TC-UI-013` と
  `TC-A11Y-001` 相当の viewer 操作を退行させないことを確認して `BATCH-END-GATE`。

### FR-B05 — 名前検索（Batch 5）

- **状態:** `Planned`。`FUT-C-010` は Candidate かつ備考に推論由来・未決定性があるため、
  本行は採用承認を待つ優先順位案である。
- **対象 feature ID:** `FUT-C-010`（file name/folder name の検索 UI と機能契約）。
- **user outcome:** library 内の file/folder name をローカルだけで検索し、結果から元の
  階層・種別・現在位置へ移動できる。
- **共通基盤:** catalog の normalized name/query model、Unicode/大小文字規則、結果から
  path へ戻る navigation、空結果と error の表示。
- **依存:** `REQ-MVP-001`、`REQ-MVP-002`、`REQ-MVP-005` の catalog/path 契約。検索性能の
  10,000項目実測は `FR-S03` に分離し、本バッチの機能完了条件へ混ぜない。
- **実装順:** (1) 検索範囲と query 規則、(2) catalog index/query、(3) result UI と path
  navigation、(4) empty/error/clear、(5) 再スキャン時の index 更新。
- **focused test 範囲:** `FT-B05-001` exact/partial と大小文字・Unicode、`FT-B05-002`
  file/folder 混在、`FT-B05-003` result からの階層復帰、`FT-B05-004` empty/error/clear、
  `FT-B05-005` 再起動・再スキャン。性能閾値は含めない。
- **batch末尾 gate:** 機能 focused test を SKIP 0 で実測し、外部通信0・原本差分0を確認して
  `BATCH-END-GATE`。性能の PASS は `FR-S03` の実測証跡が揃うまで付与しない。

### FR-B06 — お気に入り（Batch 6）

- **状態:** `Planned`。対象行は `Candidate / NOT TESTED`。
- **対象 feature ID:** `FUT-C-011`, `FUT-C-021`。
- **user outcome:** 読者が任意の folder/comic をお気に入りへ登録・解除し、次回起動後も
  quick access から安全に開ける。
- **共通基盤:** stable path identity、local metadata store、登録対象の欠損/移動表示、
  quick-access navigation、冪等な add/remove。
- **依存:** `REQ-MVP-001`、`REQ-MVP-002` の path identity と local-only 方針。ファイル操作や
  外部同期を実装しない。
- **実装順:** (1) stable identity と schema、(2) add/remove と重複排除、(3) quick-access
  表示、(4) 欠損対象の再解決/解除、(5) restart persistence。
- **focused test 範囲:** `FT-B06-001` add/remove/idempotence、`FT-B06-002` quick-access
  navigation、`FT-B06-003` restart persistence、`FT-B06-004` 欠損/移動対象、
  `FT-B06-005` 原本差分・外部通信0。
- **batch末尾 gate:** focused test を SKIP 0 で実測し、local metadata の migration と
  path safety を確認して `BATCH-END-GATE`。

### FR-B07 — 読書情報（Batch 7）

- **状態:** `Planned`。対象行は `Candidate / NOT TESTED`。`FUT-D-005` の読書状態ラベルは
  未決定のため本バッチへ先行投入しない。
- **対象 feature ID:** `FUT-C-023`, `FUT-R-004`, `FUT-R-005`（memo、閲覧履歴、評価）。
- **user outcome:** 読者が作品にメモ、閲覧履歴、評価をローカル保存し、後から同じ作品の
  読書文脈を確認できる。
- **共通基盤:** local metadata schema/migration、作品 identity、空/削除済み対象の扱い、
  privacy boundary。既存の読書位置を別属性として保持する。
- **依存:** `REQ-MVP-015` の reading position と混同しないこと。既存の DB writer/専用 app
  data を再利用し、原本、書庫、外部サービスへ書き込まない。
- **実装順:** (1) metadata schema と migration、(2) memo CRUD、(3) history の記録/表示、
  (4) rating の入力/表示、(5) 欠損対象と再起動復元。
- **focused test 範囲:** `FT-B07-001` memo CRUD、`FT-B07-002` history の順序と重複、
  `FT-B07-003` rating の境界/未設定、`FT-B07-004` migration・restart、`FT-B07-005`
  reading position との分離と原本差分0。
- **batch末尾 gate:** focused test を SKIP 0 で実測し、metadata migration、原本非破壊、
  外部通信0を確認して `BATCH-END-GATE`。`FUT-D-005` の採否判断は別トラックで行う。

### FR-B08 — 追加画像形式（Batch 8）

- **状態:** `Planned`。対象行は `Candidate / NOT TESTED`。静止GIFの行は台帳の注記どおり
  推論由来候補であり、採用済みとしない。
- **対象 feature ID:** `FUT-C-005`, `FUT-C-006`, `FUT-C-007`, `FUT-C-008`（WebP、静止GIF、
  animation GIF、AVIF）。
- **user outcome:** 既存の画像 folder/書庫閲覧と同じ原本非破壊契約で、追加画像形式を表示し、
  非対応・破損時には対象を隠さず説明して継続できる。
- **共通基盤:** format detection、decoder adapter、静止/animation の frame policy、
  thumbnail/cache、error classification、license/SBOM 記録。
- **依存:** `REQ-MVP-008`、`REQ-MVP-009` の image pipeline と `REQ-MVP-017` の原本非破壊。
  decoder のライセンスと platform availability が未確認なら `Blocked` とし、推測で PASS にしない。
- **実装順:** (1) format/decoder interface と license gate、(2) WebP、(3) static/animation GIF、
  (4) AVIF、(5) thumbnail/cache/error と viewer integration。
- **focused test 範囲:** `FT-B08-001` WebP、`FT-B08-002` static GIF、`FT-B08-003` animation
  GIF の frame policy、`FT-B08-004` AVIF、`FT-B08-005` corrupt/unsupported fallback と
  cache/原本 snapshot。
- **batch末尾 gate:** 形式ごとに focused test を SKIP 0 で実測し、license check、原本差分0、
  既存 JPEG/JPG/PNG/ZIP/CBZ の回帰0を確認して `BATCH-END-GATE`。

### FR-B09 — library 診断（Batch 9）

- **状態:** `Planned`。対象行は `Candidate / NOT TESTED`。
- **対象 feature ID:** `FUT-C-030`, `FUT-C-031`, `FUT-C-032`（変更検出、重複作品検出、
  壊れた書庫検出）。
- **user outcome:** library 内の変更、重複、壊れた書庫を read-only の診断結果として把握し、
  原本を変えずに次の対応を選べる。
- **共通基盤:** read-only scanner、stable identity/hash policy、diagnostic result model、
  severity、再実行可能な report と error boundary。
- **依存:** `REQ-MVP-001`、`REQ-MVP-002`、`REQ-MVP-009`、`REQ-MVP-017`。既存 ZIP/CBZ の
  parser を利用し、将来の追加書庫は B12 の adapter 契約を通して拡張する。
- **実装順:** (1) scanner/result schema、(2) 変更検出、(3) 重複判定、(4) 壊れた書庫判定、
  (5) report UI と再実行/キャンセル。
- **focused test 範囲:** `FT-B09-001` added/changed/missing、`FT-B09-002` duplicate identity、
  `FT-B09-003` corrupt archive、`FT-B09-004` mixed result/severity、`FT-B09-005` cancel/retry と
  snapshot/hash 不変。
- **batch末尾 gate:** read-only focused test を SKIP 0 で実測し、診断が file operation を
  発行しないこと、既存書庫閲覧を退行させないことを確認して `BATCH-END-GATE`。

### FR-B10 — tag 管理（Batch 10）

- **状態:** `Planned`。対象行は `Candidate / NOT TESTED`。台帳上の原子機能が1件なので、
  3〜5機能へ人工分割せず、付与・検索・永続化を一つの縦切りで扱う。
- **対象 feature ID:** `FUT-C-022`。
- **user outcome:** 読者が作品へ tag を付け、tag で検索し、再起動後も同じ分類を利用できる。
- **共通基盤:** B06/B07 と共有できる local metadata schema、tag normalization、query index、
  add/remove/rename の冪等性。
- **依存:** local-only metadata と stable path identity。`FUT-D-004` の作品別表示設定とは
  別機能であり、未決定のまま結合しない。
- **実装順:** (1) tag schema/normalization、(2) assign/remove、(3) tag query、
  (4) rename/merge/empty、(5) migration と restart persistence。
- **focused test 範囲:** `FT-B10-001` assign/remove、`FT-B10-002` query/Unicode/empty、
  `FT-B10-003` rename/duplicate、`FT-B10-004` migration/restart/原本差分0。
- **batch末尾 gate:** focused test を SKIP 0 で実測し、metadata の局所性、外部通信0、
  library navigation の回帰0を確認して `BATCH-END-GATE`。

### FR-B11 — 入力拡張（Batch 11）

- **状態:** `Planned`。対象行は `Candidate / NOT TESTED`。
- **対象 feature ID:** `FUT-C-019`, `FUT-R-006`, `FUT-R-007`（user-defined shortcut、
  touch、gamepad）。
- **user outcome:** 読者が操作割当を自分の環境へ合わせ、keyboard 以外の入力でも安全に
  page/navigation/viewer 操作を行える。
- **共通基盤:** input abstraction、event-to-command mapping、conflict resolution、focus/
  accessibility fallback、device capability detection、local settings。
- **依存:** `REQ-MVP-014` の keyboard/click/wheel/Esc 契約。touch/gamepad 実機がない環境は
  `Blocked` と記録し、skip を PASS にしない。
- **実装順:** (1) command/input abstraction、(2) shortcut remap と conflict、
  (3) touch gesture、(4) gamepad mapping、(5) reset/import-safe persistence と help。
- **focused test 範囲:** `FT-B11-001` remap/conflict/reset、`FT-B11-002` touch gesture と
  boundary、`FT-B11-003` gamepad mapping/disconnect、`FT-B11-004` keyboard fallback/focus、
  `FT-B11-005` restart/accessibility。
- **batch末尾 gate:** 各入力経路を利用可能な環境で focused test を SKIP 0 で実測し、
  unavailable device は環境別 `Blocked` と明記して `BATCH-END-GATE`。

### FR-B12 — 追加書庫形式（Batch 12）

- **状態:** `Planned`。対象行は `Candidate / NOT TESTED`。PDF/EPUB/video はこのバッチへ
  混ぜず、`FR-S01` で別判断する。
- **対象 feature ID:** `FUT-C-001`, `FUT-C-002`（RAR/CBR、7z）。2原子機能だが、同じ
  archive backend adapter と license gate を共有するため一つの縦切りに固定する。
- **user outcome:** RAR/CBR と 7z の画像書庫を、既存 ZIP/CBZ と同じく展開物を残さず、
  元書庫を変更せずに閲覧できる。
- **共通基盤:** archive backend adapter、entry enumeration/order、decoder hand-off、
  corrupt/error isolation、license/SBOM、原本 snapshot。
- **依存:** `REQ-MVP-009`、`REQ-MVP-017` と B09 の診断 adapter 契約。ライブラリの license、
  platform build、実際の fixture が揃わない間は `Blocked` とする。
- **実装順:** (1) adapter/fixture/license gate、(2) RAR/CBR reader、(3) 7z reader、
  (4) ordering/error/cancellation、(5) Catalog/viewer/diagnostics integration。
- **focused test 範囲:** `FT-B12-001` RAR/CBR enumeration/order、`FT-B12-002` 7z enumeration/order、
  `FT-B12-003` malformed/unsupported/error recovery、`FT-B12-004` no extraction と archive/
  parent snapshot/hash 不変、`FT-B12-005` catalog/viewer/diagnostics integration。
- **batch末尾 gate:** license/SBOM と各形式の focused test を SKIP 0 で実測し、原本差分0、
  一時展開物0、既存 ZIP/CBZ 回帰0を確認して `BATCH-END-GATE`。その後に全体最終QCを行う。

## 重複・umbrella 境界台帳

同じ user outcome を二度実装しないため、以下の親子・非重複境界を固定する。

| 境界 | 取り扱い |
|---|---|
| `FUT-C-011` / `FUT-C-021` | `FUT-C-011` はお気に入り・quick access の利用体験、`FUT-C-021` は永続保存の原子機能。FR-B06で一つの縦切りとして実装し、quick-access UI と metadata persistence を別々の重複機能として作らない。 |
| `FUT-C-020` / `FUT-C-038`〜`FUT-C-041` | `FUT-C-020` は巻末動作設定の umbrella、後四つは確認、一覧復帰、停止、loop の原子 option。FR-B02の共通 policy と option mapping に集約し、umbrella 自体へ別実装を作らない。既存 `REQ-MVP-016` の固定既定動作は維持する。 |
| `FUT-C-010` / `FUT-D-001` | `FUT-C-010` は名前検索の機能/UI umbrella。`FUT-D-001` は10,000項目・1秒以内の性能受入であり、同じ検索 UI の二重機能ではない。FR-B05の機能テストと FR-S03 の性能実測を分離する。 |
| `REQ-MVP-015` / 読書情報 | MVPの reading position は既存の保存・復元機能であり、FR-B07の memo/history/rating や未決定の読書状態ラベルへ再実装しない。 |
| 追加書庫 / PDF・EPUB・video | FR-B12は画像書庫の RAR/CBR・7z だけを対象にする。PDF、EPUB、video は reader/codec/license の別境界であり、FR-S01へ隔離する。 |

## 通常 Feature Lane から分離するトラック

分離トラックは、通常12バッチへ未承認のまま割り当てない。状態はロードマップ上の
`Blocked` または採用対象外として記録し、前提が解消されたら新しい task/cmd で再評価する。

### FR-S01 — PDF / EPUB / video reader

- **対象:** `FUT-C-003`（PDF）、`FUT-C-004`（EPUB）、`FUT-C-009`（video）。台帳上は
  `Candidate / NOT TESTED`。
- **分離理由:** 画像書庫と異なる reader/codec、ライセンス、再生ライフサイクル、error/
  seek 契約が必要。FR-B08/B12へ混ぜず、採用承認、技術調査、license/SBOM、専用E2Eを先に行う。
- **状態:** `Blocked`（別設計・別Feature Lane待ち）。未実装を `Done` としない。

### FR-S02 — 破壊的 file operation

- **対象:** `FUT-C-024`, `FUT-C-025`, `FUT-C-026`, `FUT-C-027`, `FUT-C-028`, `FUT-C-029`
  （名前変更、移動、copy、新規 folder、ごみ箱移動、完全削除）。
  台帳上は `Candidate / NOT TESTED`。
- **分離理由:** 原本非破壊の恒久方針と衝突し得るため、確認、権限、rollback、対象範囲、
  trash と完全削除の安全設計を通常laneで短縮しない。専用の安全設計と明示承認が必要。
- **状態:** `Blocked`（安全設計・採用判断待ち）。このロードマップのバッチは file operation
  を発行しない。

### FR-S03 — 性能・実測 gate

- **対象:** `FUT-D-001`（名前検索性能）、`FUT-D-003`（性能計測条件の適用）。関連する
  `TC-PERF-001`〜`TC-PERF-006`、NFR-MVP-001/002 の Windows 基準環境実測もここで扱う。
  台帳上は `Deferred / NOT TESTED`。
- **分離理由:** FR-B05 の機能検索は結果の正しさを扱い、10,000項目・時間・memory・p95 の
  empirical evidence は独立した測定計画と環境証跡を必要とする。推定値やLinux結果でPASS化しない。
- **依存と状態:** 基準Windows環境、測定条件、fixture、結果保存が揃うまで `Blocked`。
  `FUT-C-010`のUI実装を不必要に止めないが、性能受入だけは本トラックの完了条件とする。

### FR-S04 — 未決定機能

- **対象:** `FUT-D-002`（最大 file size）、`FUT-D-004`（作品別表示設定）、
  `FUT-D-005`（読書状態ラベル）。台帳上は `Deferred / NOT TESTED`。
- **分離理由:** 優先度、採否、受入範囲が未決定であり、FR-B03、FR-B04、FR-B07へ先行混入させない。
- **状態:** `Blocked`（Lord/プロダクト判断と一次根拠待ち）。承認されるまで実装順へ入れない。

### FR-S05 — 恒久方針による非採用

- **対象:** `FUT-R-001`, `FUT-R-002`, `FUT-R-003`, `FUT-R-008`。台帳上は `Rejected / NOT TESTED`。
- **取り扱い:** cloud sync、外部書誌、外部送信、閲覧時の原本自動変更は、local-only・
  外部送信禁止・原本非破壊の恒久方針により本ロードマップへ入れない。方針変更と新しい根拠が
  ない限り `Planned` や `Done` へ変更しない。

## 共通の実装・検証運用

1. **承認前:** 対象行の一次根拠と台帳状態を読み、`Candidate` を採用決定とみなさない。
   依存、tool/version、platform、cache、runnable test を preflight し、不足なら `Blocked` とする。
2. **1 owner:** 一つのバッチは一人の実装 owner とし、追加 owner、split、redo には理由を残す。
   バッチが3〜5機能の境界を超えた、依存が増えた、または二度目のQCが必要になった場合は
   通常workflowへ戻す。
3. **focused test:** 各 feature の focused test を実装直後に実測する。`SKIP > 0` は未完了であり、
   `Done` や PASS と報告しない。環境不足は `Blocked`、実行済み失敗は `FAIL` と記録する。
4. **Batch 1 gate:** FR-B01を重点QCとし、scale/fit/ルーペの境界と原子IDの対応を確認してから
   同じ実装方法をFR-B02以降へ展開する。
5. **batch末尾:** 各バッチの全 focused test、全回帰（applicable な unit/UI/type/Rust checks）、
   一回の aggregate CoDD gate、Gunshi の最終QC、許可された関連pathだけの一回の論理commitを
   通過させる。push は本ロードマップのgateに含めない。
6. **完了更新:** focused test と直接観測根拠を確認してから、feature-status の該当行、実装path、
   検証根拠を突合する。roadmapの `Done` は台帳の `Implemented + PASS` と矛盾してはならない。

### BATCH-END-GATE（各 FR-B01〜FR-B12 共通）

- 対象バッチの全 focused test が実測済みで `SKIP=0`、失敗0、環境別 `Blocked` の根拠あり。
- 直接影響する既存回帰、type/build/test、原本 snapshot/hash、local-only/外部通信0を確認。
- `.venv/bin/codd scan`、`.venv/bin/codd check` を実行し、関連する red gate を残さない。
- Gunshi の一回の最終QCで feature ID、状態、依存、テスト範囲、受入証跡を確認。
- `git diff --check`、Markdown/link/feature ID scan、staged path を確認し、対象変更だけを一つの
  論理commitへ保存する。既存の `codd/codd.yaml` と `docs/plan/` は変更・stage・commitしない。
- `git push` は行わない。必要ならLordの明示承認を受けた別手順とする。

## 変更時の記録

- 本書のバッチID、対象ID、状態変更、依存の解消、focused test の実測結果、gate/QC/commit を
  同じバッチIDで追記する。
- feature-status の正本行が変更された場合は、実装根拠と直接観測ケースを先に突合し、
  本書の優先順位案と矛盾しないか確認する。
- 新しい候補や別案件を追加するときは、既存IDとの umbrella/duplicate 境界、通常laneか分離laneか、
  未決定性・安全性・性能実測の扱いを明記する。IDを再利用しない。
