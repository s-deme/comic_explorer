---
codd:
  node_id: "doc:feature-roadmap"
  type: design
  status: active
  depends_on:
    - id: "doc:feature-status"
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
実装順、依存、Feature Lane の境界、完了ゲートを管理する。1件ずつの着手順、担当中の
作業、完了判定は[実装バックログ](./implementation-backlog.md)で管理する。

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
connected evidence、focused QC、batch末尾gateを完了し、`Done`へ更新した。FR-B04は
connected evidenceとfocused QCまでは通過したが、canonical aggregate（CoDD verify内の
`scripts/run-tests.sh`）がexit 1となったため、batch末尾gate未達の`Blocked`で停止した。
FUT-C-015〜017は未実測・外部環境待ちをPASSへ読み替えず、新redoでRCA後に再判定する。
FR-B05、FR-B06、FR-B08、FR-B12は引き続き`Planned`であり、未着手の対象`FUT-*`行を実装決定や完了とは扱わない。FR-B09はsemantic gateを受理したが、CoDD structural gateとWindows WebView2 native product UIが未完了・未測定のため`Partial / BLOCKED`で保持する。FR-B10はIMP-005でWindows WebView2製品gateと現行canonical aggregateを完了し、`Done`へ更新した。FR-B11はkeyboard三契約のsemantic gateを受理した一方、touch/gamepad実機とCoDD/native product gateが未完了・未測定のため`Partial / BLOCKED`で保持する。
FR-B07はIMP-006でmemoのWindows product gateを完了したが、history/ratingのproduct gateが残るため
全体は`Partial / BLOCKED`で保持する。

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
| `FR-B04` | 4 | 閲覧画面 mode | `FUT-C-015`〜`FUT-C-017` | `Blocked`（focused PASS、canonical aggregate FAIL） |
| `FR-B05` | 5 | 名前検索 | `FUT-C-010` | `Planned` |
| `FR-B06` | 6 | お気に入り | `FUT-C-011`, `FUT-C-021` | `Planned` |
| `FR-B07` | 7 | 読書情報 | `FUT-C-023`, `FUT-R-004`, `FUT-R-005` | `Partial / BLOCKED`（memo product PASS、history/rating product BLOCKED） |
| `FR-B08` | 8 | 追加画像形式 | `FUT-C-005`〜`FUT-C-008` | `Planned` |
| `FR-B09` | 9 | library 診断 | `FUT-C-030`〜`FUT-C-032` | `Partial / BLOCKED`（semantic ACCEPT、CoDD INCOMPLETE / NOT APPLICABLE、Windows product gate BLOCKED） |
| `FR-B10` | 10 | tag 管理 | `FUT-C-022` | `Done`（Windows WebView2製品gate・canonical aggregate完了） |
| `FR-B11` | 11 | 入力拡張 | `FUT-C-019`, `FUT-R-006`, `FUT-R-007` | `Partial / BLOCKED`（shortcutはproduct PASS、touch/gamepad `BLOCKED_UNMEASURED`） |
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
  原本・書庫・library管理fileの新規作成0、外部通信0を維持する。B05〜B12は未着手のまま保持する。

### FR-B04 — 閲覧画面 mode（Batch 4）

- **状態:** `Blocked`。`FUT-C-015`〜017のfocused connected evidenceは通過し、
  `FUT-C-017`のWindows WebView2 product gateもPASSしたが、canonical aggregateは
  既存のspread history回帰で未達のためbatch末尾gateを保留する。
- **対象 feature ID:** `FUT-C-015`, `FUT-C-016`, `FUT-C-017`。
- **user outcome:** 読者が縦スクロール、横スクロール、full-screen を選び、現在ページ、
  読み方向、focus を保ったまま閲覧できる。
- **共通基盤:** viewer layout mode、navigation/input adapter、画面状態と OS window 状態の
  復元、B01 の scale/fit 契約との境界。
- **依存:** `REQ-MVP-011`〜`REQ-MVP-014`、B01 が定める scale 状態との整合。full-screen の
  OS 差は実機確認が必要で、未確認を PASS にしない。
- **実装順:** (1) viewer mode state、(2) 縦/横 layout、(3) full-screen lifecycle、
  (4) 読み方向・page anchor・focus の復元、(5) error/escape 復帰。
- **focused test 範囲:** `FT-B04-001` enum/default・設定保存、`FT-B04-002` 縦横layoutと
  page anchor、`FT-B04-003` 読み方向・keyboard navigation・native wheel・Esc、
  `FT-B04-004` full-screen enter/exit/error、`FT-B04-005` 設定復元と非永続window state。
- **batch末尾 gate:** focused testはSKIP 0で通過したが、CoDD verify内のcanonical
  `scripts/run-tests.sh`がexit 1となり未達。同一task内のaggregate再実行は禁止し、新redoで
  失敗出力を保存してRCAする。

#### FR-B04 実装・直接観測証跡

- **採用要件:** [FR-B04 閲覧画面 mode要件](../requirements/viewer-layout-requirements.md)。
- **実装根拠:** `src/features/viewer/model.ts`、`src/features/viewer/Viewer.tsx`、
  `src/features/viewer/fullscreen.ts`、`src/App.tsx`、`src/features/library/client.ts`、
  `src/styles.css`、`src-tauri/src/application/mod.rs`、`src-tauri/src/state/repository.rs`、
  `src-tauri/capabilities/default.json`。
- **直接観測:** [FR-B04 focused test結果](../testing/fr-b04-results.md)。FT-B04-001〜005は
  selector、App→Viewer→DOM、page anchor/focus、読み方向・wheel・Esc、adapter lifecycle、
  persistenceを接続境界で直接観測し、FT-B04-006はrelease WebView2のOS boundsとEsc復帰を
  直接観測した。focused scopeはPASSしたが、canonical aggregateが未達のためbatch完了根拠には
  昇格していない。
- **保存・非永続境界:** `layoutMode`だけを既存app-local SQLiteへ保存し、fullscreenはOS
  window stateへ委譲して保存しない。旧値・未知値は`paged`へ戻し、B01のview/scale/fit/
  loupe/reading positionを独立に保全する。原本・書庫・library root配下への書込みと外部通信は0。
- **環境境界:** Windows WebView2でのOS fullscreen製品実機測定は`FT-B04-006`でPASSした。
  canonical aggregateのspread history回帰は別の未解消gateとして保持し、未完了部分をPASSへ
  昇格しない。

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

2026-08-09のsuite監査で、mock済みfrontendから原本非破壊を判定していた重複を除外した。
現行はApp/client接続をfrontend 4件、SQLite・原本byte不変をRust 5件で検証する。以下の
focused exact5とSHAは2026-08-03時点のaccepted rawとして保持し、現行件数には使わない。

- **状態:** `Partial / BLOCKED`。IMP-006で`FUT-C-023`のWindows WebView2製品gateと現行canonical
  aggregateを完了し、memoは`Implemented / PASS`である。`FUT-R-004`と`FUT-R-005`の製品gateは
  `BLOCKED_UNMEASURED`のため、FR-B07全体は完了へ昇格しない。`FUT-D-005` の読書状態ラベルは
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
  reading position との分離と原本差分0、`FT-B07-006` Windows release製品のmemo
  save/reopen/restart/clearとsource tree差分0。
- **実装path:** `src-tauri/src/state/repository.rs`、`src-tauri/src/application/mod.rs`、
  `src-tauri/src/lib.rs`、`src/features/library/client.ts`、`src/App.tsx`、`src/App.test.tsx`、
  `src/App.fr-b07.test.tsx`。
- **batch末尾 gate:** 受理済みrawを再実行せず、変更後source SHA
  `f7031d69365005301961896db87da20ace8b9c5086531c6ad7501e9b68aa9c83` のfocused exact5
  （5/5 PASS、0 FAIL、0 SKIP、duplicate 0）、App回帰（1 file、39/39 PASS、0 FAIL、0 SKIP、
  direct web adapter calls 0）、Windows offline Rust（FR-B07 exact5、5 PASS、0 failed、0 ignored、
  0 SKIP、およびfull canonical 66 unit + 1 process、0 failed、0 ignored、0 SKIP）、typecheck、
  buildをそれぞれ一回のaccepted rawとして照合した。FT-B07-002はproduction `open_comic`へ接続した
  open-history seamで、成功したcurrent-generation・非空openだけを一行記録し、failed/empty/cancelled
  は記録せず、履歴表示の順序と重複0を観測した。FT-B07-005は実一時original/library fixtureを
  metadata・history・rating・reading-position操作の前後でbyte/SHA snapshotし、差分0と
  `library.index`不変を観測した。CoDD scan/check/verifyも各exit 0だが、verifyの生値は
  3 SKIP・1 VACUOUS・verification tests 0であり、SKIP=FAIL規則により `BATCH-END-GATE` は
  未達のまま保持する。`FUT-D-005` の採否判断は別トラックで行う。

#### IMP-006 memo受入証跡

- `./scripts/run-feature-verification-wsl.sh IMP-006 -RustMode Canonical`は全12 stage、exit 0、
  133.969秒で完了した。frontendは`FT-B07-001`をexact 1 PASS、非対象3件をpattern除外として記録し、
  Windows canonical Rustは79 unit + 1 process PASSだった。
- release WebView2 `FT-B07-006`はsave、viewer再open、edit、製品restart復元、clear、再open、
  library source tree差分0を観測した。cleanupは製品/WebView2 process、port、SQLite lock残留0。
- CoDD scan/check/verifyは各exit 0・red 0。任意profileのSKIP/VACUOUSは生値を開示し、memoの
  機能PASSへ加算しない。run ID、stage時間、各SHAは[FR-B07結果](../testing/fr-b07-results.md)を正本とする。

#### cmd_400 最終同期の受入証跡（履歴）

- **機能raw:** [FR-B07結果](../testing/fr-b07-results.md) と、次のaccepted rawを参照する。
  focused exact5・typecheck・buildは
  `queue/reports/evidence/cmd_400/fr_b07_node_fs_type_final_resume`、App回帰は
  `queue/reports/evidence/cmd_400/fr_b07_production_open_seam_semantic_redo`、Rust exact5/fullは
  `queue/reports/evidence/cmd_400/fr_b07_rustfmt_final_resume` に保存されている。

  | Gate | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 |
  |---|---|---|---|
  | frontend focused exact5 | `e8b2f80dc8a888d6b1d30d77a92de91a37924666d70ae6b0ab1ce41acb5f96e5` | `fa650fbaf4ff41c316ece825d4eb854c158ac34186792fb7b108e082bc50c82c` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
  | App regression 39 | `61e315c69353832f1c5bd0d3654946ef00f9e3282c50b0ca34ea44589ec9ef22` | `08a87b125f0e0a53a0bd2e2c716e6f758e344ff6b1906c2bbc244c725354c840` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
  | Rust exact5 | `cfda35406b78a9f54b9802e778742662bd8e52cb84db23949891f1e6a1b89233` | `183e3903947eb258abe21709870766315345cf246b5b78479fed95e509303a10` | `ae905bcf7333addf0b0de89c426235ed167ef5e4292bd2cf66e3430236751265` |
  | Rust full canonical 66 unit + 1 process | `8570b03c8b8906d4f7a4abc80ddb0f62e2169aacbcdc42aa1ef2b9ce35813a36` | `d61c8d92af8474b90aa2d4aa39adbc8f0f1b383e025a4d7b2306be3128c2312c` | `ada375b0eba1d9560e9bfaf926b522177d4d257295c7aeea8c15d4f8ce3f4734` |
  | typecheck | `f9e29543ebc74c92a00c457eec8d972600407e264670331143f4a09153b0948d` | `d2297a8e6a87dc32114bcda90f5c007ec0f1b287e38f677de0314e929ea78294` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
  | build | `54fccdea2a0a31370659e48ad9d605bcf45c7a560e8c8a35c1cbe9b8edd97954` | `5145cd83897a30cbd37916d882fffa259f125353c0115cf3d3a3b774d733eedc` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
- **CoDD raw・境界:** 復元後の既存scan/check/verify rawを参照し、manifest SHAは順に
  `d5b843479ee8a5635bd6aa92678144b67813c6f87c1141177f61d2dec2554384`、
  `a1cf36608fe80076dce202252b0dbd6387f1b717711afb914a635ed32681de6f`、
  `93f6aeef90bfacde5a7f1f76eddbbdb1510dc83adb7f97fd3739069acb7685a6`。verifyは
  `3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、verification tests 0であり、
  `INCOMPLETE / NOT APPLICABLE`としてPASS数へ加算しない。accepted functional raw、CoDD rawの
  cmd_400では再実行、retry、commit、pushを行わなかった。当時のWindows WebView2 native product UIと
  OS syscallの完全観測は`UNMEASURED / BLOCKED`であり、local evidenceをPASSへ代替しなかった。

- **最終diff境界:** cmd_400当時は11-path product diff、draft contamination 0、staged path 0、
  `git diff --check PASS`を確認し、四文書以外の7機能pathをbyte不変として保全した。当時の
  complete diff QC前にはcommitを行っていない。

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

- **状態:** `Partial / BLOCKED`。機能semantic gateは受理済みだが、CoDD構造gateとWindows
  WebView2 native product UIが未完了・未測定である。
- **対象 feature ID:** `FUT-C-030`, `FUT-C-031`, `FUT-C-032`（変更検出、重複作品検出、
  壊れた書庫検出）。
- **実装path:** `src/App.tsx`; `src/features/library/client.ts`;
  `src-tauri/src/application/mod.rs`; `src-tauri/src/diagnostics/mod.rs`。
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
- **最終受入:** `FT-B09-001`〜`FT-B09-005` は 5 PASS / 0 FAIL / 0 SKIP のfocused exact5、
  App回帰は39 PASS / 0 FAIL / 0 SKIP、Windows offline Rustは74 unit + 1 process PASS /
  failed 0 / ignored 0 / SKIP 0、typecheck/buildはPASS・SKIP0である。FT-B09-005はcancelled
  response、loading=false、cancel notice、stale=0、新generation retryに加え、real folderと
  ZIP/CBZのpath、bytes、SHA、entry setのcancel/retry前後exact equalityを含む。
- **accepted evidence:** frontend exact5・typecheck・buildは
  `queue/reports/evidence/cmd_400/fr_b09_callback_typing_final_resume/`、App回帰は
  `queue/reports/evidence/cmd_400/fr_b09_ft005_normal_workflow_repair/`、Windows fullは
  `queue/reports/evidence/cmd_400/fr_b09_diagnostics_rustfmt_resume/` に保存された不変rawを参照する。
  最終focused source SHAは
  `6701c3465e24a481e899a07d1aa5e41b8dd30881962c8f9ab68dead99626c0fe`。
- **raw SHA ledger:** focused manifest/stdout/stderrは
  `88d8dd15f3fd1c81be344fbc6fcebeaba0af407c527b9b4a6f9f612f59c40587` /
  `768f6a0a53adc17991a10330344683aa616a3d1a56be03b192f97219c4189bfe` /
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`、App回帰は
  `b48e8bcc41b56a78eccd17c7a9f98c392639d3d9778487aed34709354a021f05` /
  `6d5de88aacf157bcddd42d42666130742ca20aea91a8b87dad45ee10b18f844a` /
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`、Windows fullは
  `b7a5d353a0cfd2f644abd34149a981eb375229362e78d1c94ec674456c1218b3` /
  `ab2ac9e49fd58008d826665914faf8b7f21dd256dd6edb55469c1ca77d80ef6d` /
  `c3b80068c26dca16ac167f6e78bd7e8f233c03f70973b4c47145e54a5e50beab` である。
  typecheck/buildとCoDD structural exceptionの全SHAは [FR-B09結果](../testing/fr-b09-results.md) と
  [FR-B09要件](../requirements/library-diagnostics-requirements.md) の最終ledgerに固定する。
- **境界と履歴:** CoDDは `3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、verification
  tests 0の `INCOMPLETE / NOT APPLICABLE` でありPASSへ加算しない。Windows WebView2 native product
  UIは `BLOCKED_UNMEASURED`、OS syscallは `UNMEASURED / BLOCKED`。Feature Lane fallback、wrapper
  起動失敗、typing failure、canonical resume停止の旧rawは履歴のみで、受入証跡には再利用しない。
- **batch末尾 gate:** 上記のaccepted rawを不変参照し、今回の同期ではfunctional、Rust、typecheck、
  build、CoDDの再実行・commit・pushを行わない。

### FR-B10 — tag 管理（Batch 10）

- **状態:** `Done`。既存のconnected semantic gateに加え、IMP-005でWindows release製品を使う
  `FT-B10-005`を追加し、付与・正規化検索・rename・再起動復元・除去・library原本差分0を直接観測した。
  Windows-native canonical aggregateは全stage exit 0、CoDD red 0である。CoDDの任意profile由来の
  SKIP/VACUOUSは生値のままadvisoryとして開示し、機能PASS数へ加算しない。初回FAIL、selector、migration、
  typingのrejected rootsは受入証跡へ昇格せず履歴として保持する。台帳上の原子機能が1件なので、3〜5機能へ
  人工分割せず、付与・検索・永続化を一つの縦切りで扱う。
- **対象 feature ID:** `FUT-C-022`。
- **user outcome:** 読者が作品へ tag を付け、tag で検索し、再起動後も同じ分類を利用できる。
- **共通基盤:** B06/B07 と共有できる local metadata schema、tag normalization、query index、
  add/remove/rename の冪等性。
- **依存:** local-only metadata と stable path identity。`FUT-D-004` の作品別表示設定とは
  別機能であり、未決定のまま結合しない。
- **実装順:** (1) tag schema/normalization、(2) assign/remove、(3) tag query、
  (4) rename/merge/invalid/empty、(5) migration と restart persistence。
- **focused test 範囲:** `FT-B10-001` assign/remove、`FT-B10-002` query/Unicode/empty、
  `FT-B10-003` rename/merge/invalid、`FT-B10-004` migration/restart/原本差分0、`FT-B10-005`
  Windows release製品でのassign/query/rename/restart/remove。
- **accepted source binding:** frontend focused source SHA `6ee91612e6710ff20d97795110306324a14e584c8c9149ce18ffb90da1bc61ff`、
  repository SHA `dc56457520e18ed7b1e7a56e9257ee7e1d7a41417eadadf64d93ef5d88386913`。
- **accepted gates:** cmd_400履歴ではfocused exact4 `4 PASS / 0 FAIL / 0 SKIP`、App回帰
  `39 PASS / 0 FAIL / 0 SKIP`、Windows offline Rust `78 unit + 1 process PASS`を受理した。IMP-005では
  focused exact4、Windows canonical Rust `79 unit + 1 process PASS`、typecheck/SBOM/build、
  `FT-B10-005`を現行source上でPASSした。詳細なmanifest/stdout/stderr SHAは
  [FR-B10結果](../testing/fr-b10-results.md)のledgerを正本とする。
- **batch末尾 gate:** IMP-005のWindows-native canonical laneでfocused frontend、typecheck、SBOM/build、
  canonical Rust、release freshness、`FT-B10-005`、cleanup、CoDD scan/check/verifyを一回の集約実行で
  PASSした。CoDD verifyの任意profile advisoryはPASSへ読み替えず、red 0と実行済みcanonical test/typecheck、
  非vacuousな`depends_on_consistency` gateを完了根拠として分離記録する。

#### FR-B10 実装・受入証跡

- **採用要件:** [FR-B10 タグ管理要件](../requirements/tag-management-requirements.md)。
- **実装根拠:** `src-tauri/src/state/repository.rs`、`src-tauri/src/application/mod.rs`、
  `src-tauri/src/lib.rs`、`src/features/library/client.ts`、`src/App.tsx`、
  `src/App.fr-b10.test.tsx`。
- **C0/Feature guard:** Executable C0はexact FT-B10-001〜004、selected_count 4、canonical command、owned SHA、
  raw destinationを固定した。Feature guard checkpoints（before_first_edit/before_test/before_evidence）はPASSであり、
  新validator、plugin、contract、schema版は追加していない。
- **canonical-preflightの履歴:** `canonical-preflight`は`validate_incident_attempt.py`不在によりfail-closedとなった。
  standalone validator/toolchain matrixはPASSだったという履歴事実として記録するが、これは受入PASS証跡ではなく、
  canonical-preflightの全面PASSへ読み替えない。
- **migration:** v1のbase metadata、v2のfavorites、v3のmemo/history/rating、v4の`tags`/`item_tags`/
  indexを各一段のtransactionで適用し、schema markerをv3からv4へ直接昇格させない。accepted Rustで再open後の
  tag復元、既存値保持、original/sidecar差分0を確認した。
- **CoDD:** approved structural reference `queue/reports/evidence/cmd_400/fr_b07_reject_codd_draft_restore_gate/`
  は履歴として保持する。IMP-005では現行source上でWindows-native scan/check/verifyを実行し、exit 0・red 0を
  確認した。構造的SKIP/VACUOUSは機能テストPASSへ加算しない。
- **IMP-005製品gate:** `scripts/run-product-ui-harness.ps1 -TagsOnly`はrelease WebView2から実SQLiteへ接続し、
  `FT-B10-005`のassign/query/rename/restart/removeとsource tree差分0を一つの製品scenarioで観測する。

### FR-B11 — 入力拡張（Batch 11）

- **状態:** `Partial / BLOCKED`。`FUT-C-019`はFT-B11-006のWindows WebView2 product gateを
  PASSした。touch/gamepadは `BLOCKED_UNMEASURED` のため、FR-B11全体はPartialを維持する。
- **対象 feature ID:** `FUT-C-019`, `FUT-R-006`, `FUT-R-007`（user-defined shortcut、
  touch、gamepad）。`FUT-C-019`は`Implemented / PASS`として台帳へ同期し、
  touch/gamepad候補は候補性を維持したまま未測定境界を記録する。
- **user outcome:** 読者が操作割当を自分の環境へ合わせ、keyboard fallbackとfocus境界を保ったまま
  page/navigation/viewer操作を行える。touch/gamepadは対応機器上で同じ操作契約を検証できる状態を
  将来の解除条件とする。
- **共通基盤:** input abstraction、event-to-command mapping、conflict resolution、focus/
  accessibility fallback、device capability detection、local settings。今回受理した実装は
  `src/features/input/shortcuts.ts`を中心とするkeyboard command mappingである。
- **依存:** `REQ-MVP-014` の keyboard/click/wheel/Esc 契約。touch/gamepad実機がない環境は
  `BLOCKED_UNMEASURED` と記録し、SKIPをPASSへ読み替えない。Windows WebView2 native product UI、
  UIA/screen-reader/DPI、OS syscallの未観測もlocal/component evidenceで代替しない。
- **実装順:** (1) command/input abstraction、(2) shortcut remap と conflict、
  (3) touch gesture、(4) gamepad mapping、(5) reset/import-safe persistence と help。
  今回は(1)、(2)、(5)のkeyboard connected sliceを受理した。
- **focused test 範囲:** `FT-B11-001` remap/conflict/reset（ACCEPT）、`FT-B11-002` touch gesture と
  boundary（`BLOCKED_UNMEASURED`）、`FT-B11-003` gamepad mapping/disconnect（`BLOCKED_UNMEASURED`）、
  `FT-B11-004` keyboard fallback/focus（ACCEPT）、`FT-B11-005` restart/accessibility（ACCEPT）、
  `FT-B11-006` Windows product remap/restart/reset（PASS）。
- **accepted source binding:** 最終keyboard test source manifestは
  `fr_b11_branded_identity_type_resume/source-sha.tsv` SHA-256
  `553b821a818756c1f260caef7443cd59968c23c776a2d9bee4743df84e426751`であり、最終test source
  `src/App.fr-b11.test.tsx` SHA-256は
  `f58e45d04ddaab3d2e4c0ef376ee5b16f5208c7d66dc9fdd70fe6a6bef78633a`である。詳細は[FR-B11結果](../testing/fr-b11-results.md)を正本とする。
- **accepted gates:** focused exact3 `3 PASS / 0 FAIL / 0 SKIP`、App回帰 `39 PASS / 0 FAIL / 0 SKIP`、
  Windows Rust `79 unit + 1 process PASS / failed 0 / ignored 0 / SKIP 0`、typecheck `PASS / SKIP 0`、
  release build `PASS / SKIP 0`、FT-B11-006 product gate PASS。
- **batch末尾 gate:** keyboard semantic evidenceは受理するが、touch/gamepadが`BLOCKED_UNMEASURED`であり、
  hardware accessibility observationが未測定のためbatch末尾gateは未達。

#### FR-B11 実装・受入証跡

- **採用要件:** [FR-B11 入力拡張要件](../requirements/input-customization-requirements.md)。
- **実装根拠:** `src/features/input/shortcuts.ts`、`src/App.tsx`、`src/features/viewer/Viewer.tsx`、
  `src/features/library/client.ts`、`src-tauri/src/application/mod.rs`、
  `src-tauri/src/state/repository.rs`、`src-tauri/src/lib.rs`、`src/App.fr-b11.test.tsx`。
- **直接観測:** FT-B11-001はproduction Appのremap/conflict/reset、FT-B11-004はkeyboard fallback・
  focused input suppression・Viewer/navigation boundary、FT-B11-005はrestart persistence・accessible
  help/name・safe default recoveryを接続境界で受理した。FT-B11-006はrelease executableの
  remap・restart・resetを観測した。FT-B11-002/003はhardware unavailableのため
  `BLOCKED_UNMEASURED`であり、PASS/SKIP countには含めない。
- **rejected history:** false C0のselected path/command不一致、rustfmt失敗、E0382 partial-move、
  TS2322 branded identity typing failureは履歴のみとし、accepted PASS証跡へ混入させない。
- **CoDDと環境境界:** 承認済みstructural referenceの生値は`3 PASS / 0 red FAIL / 1 amber WARN /
  3 SKIP / 1 VACUOUS`、verification tests 0の`INCOMPLETE / NOT APPLICABLE`である。構造的SKIP三件以外の
  functional SKIPを免除せず、Windows WebView2 native product UI・touch/gamepad hardwareを未測定のまま保持する。
- **最終差分:** 機能/test 8 path + 文書4 path = exact 12、contamination 0、staged path 0、
  `git diff --check PASS`を確認対象とする。今回のtaskではcommit/push、functional/Rust/typecheck/build/
  CoDD再実行を行わず、Gunshiのcomplete diff QCへ引き渡す。

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
