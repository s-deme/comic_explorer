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

FR-B01〜B03、B05〜B07、B10は完了済みである。FR-B04、B09、B11は既存の未解消gateを
`Blocked`として保持する。FR-B08はstatic WebPだけが完了した`Partial`、FR-B12は未着手の
`Planned`である。2026-08-10の優先度再検討では、Leeyes代替としての利用価値、後続機能を
解放する依存、原本非破壊、安全性、Windows製品での検証容易性を評価し、未実装候補を
P1〜P10と分離trackへ再編した。これは優先順位案であり、台帳の`Candidate / NOT TESTED`を
採用済みへ変更せず、`Next`または`In Progress`も自動設定しない。

## 推奨実装順

優先度はP1が最優先で、同一priority内は対象feature IDの記載順に1件ずつ進める。Batch番号と
`FR-Bxx`は履歴・受入証跡に結び付く安定IDであり、優先度変更時も改番しない。通常batchは
原則3〜5原子機能を目標とし、2機能になるB16/B12は同じ縦切りを人工分割しない例外とする。
`Hold`は順位末尾ではなく、安全・仕様・環境の解除条件を満たすまで通常queueへ入れないことを表す。

| 現行優先度 | 固定ID | 登録Batch | 領域 | 対象 feature ID（実装順） | 現在の運用状態 |
|---|---|---:|---|---|---|
| P1 | `FR-B13` | 13 | catalog command基盤 | `FUT-C-057`, `FUT-C-055`, `FUT-C-054`, `FUT-C-049`, `FUT-C-068` | `Done` |
| P2 | `FR-B14` | 14 | open・navigation | `FUT-C-042`, `FUT-C-044`, `FUT-C-056`, `FUT-C-051` | `Done` |
| P3 | `FR-B15` | 15 | しおり・本棚 | `FUT-C-045`, `FUT-C-046`, `FUT-C-047` | `Done` |
| P4 | `FR-B16` | 16 | filter・export | `FUT-C-058`, `FUT-C-050` | `Done` |
| P5 | `FR-B17` | 17 | 参照shell UI | `FUT-C-065`, `FUT-C-066`, `FUT-C-067` | `Done` |
| P6 | `FR-B18` | 18 | workspace・window | `FUT-C-062`, `FUT-C-063`, `FUT-C-060`, `FUT-C-061` | `Done` |
| P7 | `FR-B19` | 19 | 設定・help | `FUT-C-069`, `FUT-C-071`, `FUT-C-072`, `FUT-C-076`, `FUT-C-077` | `Done` |
| P8 | `FR-B08` | 8 | 追加画像形式の残件 | `FUT-C-006`, `FUT-C-008`, `FUT-C-007` | `Partial`（WebP完了、残件はCandidate） |
| P9 | `FR-B12` | 12 | 追加書庫形式 | `FUT-C-001`, `FUT-C-002` | `Planned`（license・fixture確認待ち） |
| P10 | `FR-B20` | 20 | thumbnail保守 | `FUT-C-073`, `FUT-C-074`, `FUT-C-075` | `Planned`（入出力仕様確定待ち） |
| Hold | `FR-S02` | — | file mutation・undo | `FUT-C-027`, `FUT-C-026`, `FUT-C-024`, `FUT-C-025`, `FUT-C-028`, `FUT-C-053`, `FUT-C-052`, `FUT-C-029` | `Blocked`（安全設計・明示承認待ち） |
| Hold | `FR-S06` | — | 仕様・architecture未決定 | `FUT-C-043`, `FUT-C-059`, `FUT-C-064`, `FUT-C-048`, `FUT-C-070` | `Blocked`（product・security判断待ち） |
| Hold | `FR-S01` | — | 独立reader・media | `FUT-C-003`, `FUT-C-004`, `FUT-C-009` | `Blocked`（別設計・license確認待ち） |
| Hold | `FR-S03` | — | 性能・実測 | `FUT-D-001`, `FUT-D-003` | `Blocked`（基準Windows環境待ち） |
| Hold | `FR-S04` | — | 未決定機能 | `FUT-D-002`, `FUT-D-004`, `FUT-D-005` | `Blocked`（採否・受入範囲待ち） |
| Hold | `FR-B04` | 4 | 閲覧画面modeの受入 | `FUT-C-015`〜`FUT-C-017` | `Blocked`（既存canonical aggregate gate） |
| Hold | `FR-B09` | 9 | library診断の受入 | `FUT-C-030`〜`FUT-C-032` | `Partial / BLOCKED`（Windows product gate等） |
| Hold | `FR-B11` | 11 | touch・gamepad実測 | `FUT-R-006`, `FUT-R-007` | `Partial / BLOCKED`（実機待ち） |
| Rejected | `FR-S05` | — | 恒久非採用 | `FUT-R-001`〜`FUT-R-003`, `FUT-R-008` | `Rejected`（local-only・原本非破壊方針） |
| Done | `FR-B01` | 1 | 表示倍率 | `FUT-C-018`, `FUT-C-033`〜`FUT-C-037` | `Done` |
| Done | `FR-B02` | 2 | 巻末動作 | `FUT-C-020`, `FUT-C-038`〜`FUT-C-041` | `Done` |
| Done | `FR-B03` | 3 | 一覧表示形式 | `FUT-C-012`〜`FUT-C-014` | `Done` |
| Done | `FR-B05` | 5 | 名前検索 | `FUT-C-010` | `Done` |
| Done | `FR-B06` | 6 | お気に入り | `FUT-C-011`, `FUT-C-021` | `Done` |
| Done | `FR-B07` | 7 | 読書情報 | `FUT-C-023`, `FUT-R-004`, `FUT-R-005` | `Done` |
| Done | `FR-B10` | 10 | tag管理 | `FUT-C-022` | `Done` |

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

- **状態:** `Done`。IMP-012で`FUT-C-010`のrelease WebView2 `FT-B05-006`、focused exact5、
  Rust `search_port_`、Windows-native canonical aggregateを同じsourceへ束縛した。
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
  `FT-B05-005` fresh request・再スキャン、`FT-B05-006` release製品でのnormalized mixed-kind、navigation、
  empty/clear、explicit rescan、source tree差分0。性能閾値は含めない。
- **batch末尾 gate:** selected focused exact5をSKIP 0で実測し、Windows WebView2 `FT-B05-006`、
  外部通信0・原本差分0、canonical aggregateを確認して`Done`。10,000項目/1秒の性能PASSは
  `FR-S03`の実測証跡まで`FUT-D-001`へ分離したまま、FR-B05を阻害しない。

### FR-B06 — お気に入り（Batch 6）

- **状態:** `Done`。IMP-013で`FUT-C-011`のcurrent-session quick access、IMP-014で`FUT-C-021`の
  v1 migration/restart persistence、strict missing/moved/re-resolveをそれぞれ`Implemented / PASS`へ更新した。
  二つの原子gateが揃ったためFR-B06 aggregateをDoneへ昇格する。
- **対象 feature ID:** `FUT-C-011`, `FUT-C-021`。
- **user outcome:** 読者がcurrent-sessionで任意のfolder/comicをお気に入りへ登録・解除し、
  quick accessから安全に開ける。次回起動後も同じfavoriteIdとavailable rowを復元し、移動/消失は安全停止して
  明示再解決または解除できる。
- **共通基盤:** stable path identity、local metadata store、登録対象の欠損/移動表示、
  quick-access navigation、冪等な add/remove。
- **依存:** `REQ-MVP-001`、`REQ-MVP-002` の path identity と local-only 方針。ファイル操作や
  外部同期を実装しない。
- **IMP-013 evidence:** selected `FT-B06-001/002` exact2、Rust
  `favorite_target_enforces_relative_path_and_eligible_kind_boundaries`、release WebView2
  `FT-B06-006`でavailable rows、folder navigation、comicFolder/archive viewer、remove、source tree差分0を
  観測し、Windows-native canonical aggregateは全12 stage exit 0である。
- **IMP-014 evidence:** selected `FT-B06-003`〜`005` exact3とRust `fr_b06_favorite_`でv1 migration/reopenを、
  release WebView2 `FT-B06-007`でrestart、strict moved/missing/re-resolve、missing再走査、source tree差分0を直接測定した。
  FUT-C-011のcurrent-session rawを再利用せず、全12 stage exit 0のcanonical aggregateを受理した。

### FR-B07 — 読書情報（Batch 7）

2026-08-09のsuite監査で、mock済みfrontendから原本非破壊を判定していた重複を除外した。
現行はApp/client接続をfrontend 4件、SQLite・原本byte不変をRust 5件で検証する。以下の
focused exact5とSHAは2026-08-03時点のaccepted rawとして保持し、現行件数には使わない。

- **状態:** `Done`。IMP-006で`FUT-C-023`、IMP-007で`FUT-R-004`、IMP-008で`FUT-R-005`の
  Windows WebView2製品gateと現行canonical aggregateを完了し、3原子機能はすべて
  `Implemented / PASS`である。`FUT-D-005` の読書状態ラベルは未決定の別トラックとして本バッチへ
  混入させない。
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
  save/reopen/restart/clearとsource tree差分0、`FT-B07-007` Windows release製品のhistory
  success-only/dedup/order/restartとsource tree差分0、`FT-B07-008` Windows release製品のrating
  1/5/restart/unset/reopenとsource tree差分0。
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
  3 SKIP・1 VACUOUS・verification tests 0であり、SKIP=FAIL規則によりcmd_400時点の
  `BATCH-END-GATE` は未達だった。この履歴を後続の3 atomic WebView2 gateの受入へ読み替えない。
  `FUT-D-005` の採否判断は別トラックで行う。

#### IMP-006 memo受入証跡

- `./scripts/run-feature-verification-wsl.sh IMP-006 -RustMode Canonical`は全12 stage、exit 0、
  133.969秒で完了した。frontendは`FT-B07-001`をexact 1 PASS、非対象3件をpattern除外として記録し、
  Windows canonical Rustは79 unit + 1 process PASSだった。
- release WebView2 `FT-B07-006`はsave、viewer再open、edit、製品restart復元、clear、再open、
  library source tree差分0を観測した。cleanupは製品/WebView2 process、port、SQLite lock残留0。
- CoDD scan/check/verifyは各exit 0・red 0。任意profileのSKIP/VACUOUSは生値を開示し、memoの
  機能PASSへ加算しない。run ID、stage時間、各SHAは[FR-B07結果](../testing/fr-b07-results.md)を正本とする。

#### IMP-007 history受入証跡

- `./scripts/run-feature-verification-wsl.sh IMP-007 -RustMode Canonical`は全12 stage、exit 0、
  129.093秒で完了した。frontendは`FT-B07-002`をexact 1 PASS、非対象3件をpattern除外として記録し、
  Windows canonical Rustは79 unit + 1 process PASSだった。
- release WebView2 `FT-B07-007`は異なる2作品のsuccess-only記録、一方のreopenに対するidentity dedup、
  決定順序、corrupt-open非記録、製品restart復元、library source tree差分0を観測した。cleanupは
  製品/WebView2 process、port、SQLite lock残留0。
- CoDD scan/check/verifyは各exit 0・red 0。任意profileのSKIP/VACUOUSは生値を開示し、historyの
  機能PASSへ加算しない。run ID、stage時間、各SHAは[FR-B07結果](../testing/fr-b07-results.md)を正本とする。

#### IMP-008 rating受入証跡

- `./scripts/run-feature-verification-wsl.sh IMP-008 -RustMode Canonical`はaccepted runで全12 stage、exit 0、
  130.870秒で完了した。frontendは`FT-B07-003`をexact 1 PASS、非対象3件をpattern除外として記録し、
  Windows canonical Rustは79 unit + 1 process PASSだった。
- release WebView2 `FT-B07-008`はrating 1保存・5更新・製品restart後の5復元・unset・viewer再openと
  library source tree差分0を観測した。cleanupは製品/WebView2 process、port、SQLite lock残留0。
- formal run 1は既存`confirm_next`の一過性full-suite failureでCoDD verifyが停止し、後続accepted runの
  full canonicalでPASSを再確認した。run 2はRating要件外のshared cold-thumbnail wait timeoutであり、laneから
  除外した。いずれもaccepted evidenceへ再利用しない。CoDD scan/check/verifyはaccepted runで各exit 0・
  red 0、任意profileのSKIP/VACUOUSは生値を開示し機能PASSへ加算しない。詳細は
  [FR-B07結果](../testing/fr-b07-results.md)を正本とする。

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

- **状態:** `Partial`。IMP-015で`FUT-C-005`（static WebP）を`Implemented / PASS`へ更新した。
  `FUT-C-006`〜`FUT-C-008`は `Candidate / NOT TESTED`のままであり、静止GIFは台帳の注記どおり
  推論由来候補であって採用済みとしない。
- **対象 feature ID:** `FUT-C-005`, `FUT-C-006`, `FUT-C-007`, `FUT-C-008`（WebP、静止GIF、
  animation GIF、AVIF）。
- **user outcome:** 既存の画像 folder/書庫閲覧と同じ原本非破壊契約で、追加画像形式を表示し、
  非対応・破損時には対象を隠さず説明して継続できる。
- **IMP-015受入:** `FT-B08-001` exact1、Rust `fr_b08_webp_`、release WebView2 `FT-B08-006`で
  folder/ZIP/CBZのstatic lossy/lossless/alpha、thumbnail cache、viewer、corrupt/animated local
  recovery、library source tree差分0を観測した。pure-Rust `image-webp` 0.2.4のlock/SBOM/noticeは
  unknown/prohibited 0であり、詳細は[FR-B08結果](../testing/fr-b08-results.md)を正本とする。
- **共通基盤:** format detection、decoder adapter、静止/animation の frame policy、
  thumbnail/cache、error classification、license/SBOM 記録。
- **依存:** `REQ-MVP-008`、`REQ-MVP-009` の image pipeline と `REQ-MVP-017` の原本非破壊。
  decoder のライセンスと platform availability が未確認なら `Blocked` とし、推測で PASS にしない。
- **残る実装順（P8）:** (1) `FUT-C-006` static GIF、(2) `FUT-C-008` AVIF、
  (3) `FUT-C-007` animation GIF。静止画decoderの縦切りを先に完了し、再生・停止・frame memory
  policyを要するanimation GIFを後段に置く。優先度の再検討だけではいずれも`Next`へ変更しない。
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

### FR-B13 — catalog command基盤（Batch 13 / P1）

- **状態:** `Done`。対象5行を採用要件化し、focused test、typecheck、CoDD gateを通過した。
- **対象と実装順:** (1) `FUT-C-057` 現在場所の手動更新、(2) `FUT-C-055` 複数・種別選択、
  (3) `FUT-C-054` path copy、(4) `FUT-C-049`項目properties、(5) `FUT-C-068`現在位置付きstatus。
- **優先理由:** 原本を変更せず、後続のexport、file operation、menu commandが共有する一覧の
  freshness、focus・anchor・selection、件数表示を先に確立できる。F5更新後のselection消失、3表示形式、
  sort/filterとの同期を同じcatalog state契約で扱う。
- **採用gate:** refresh/cacheの整合、複数選択のkeyboard・accessibility、clipboard adapter、
  複数選択時properties/statusの規則を要件化し、file writeをこのbatchへ混ぜない。

#### FR-B13 実装・直接観測証跡

- **採用要件:** [P1〜P10実装要件](../requirements/roadmap-priorities-requirements.md#p1-catalog-command基盤)。
- **実装根拠:** `src/App.tsx`、`src/features/catalog/CatalogGrid.tsx`、
  `src/features/catalog/commands.ts`、`src/features/catalog/commands.test.ts`。
- **直接観測:** [FR-B13 focused test結果](../testing/fr-b13-results.md)。FT-B13-001〜005相当を
  focused testでSKIP 0として実測し、既存CatalogGrid回帰も通過した。

### FR-B14 — open・navigation（Batch 14 / P2）

- **状態:** `Done`。B13のcatalog stateを再利用し、focused test、typecheck、CoDD gateを通過した。
- **対象と実装順:** (1) `FUT-C-042` file・folderを開く、(2) `FUT-C-044`最近開いたfile menu、
  (3) `FUT-C-056`履歴dropdown移動、(4) `FUT-C-051`終了menu。
- **優先理由:** 参照アプリの主要導線を早期に満たし、既存のnavigation historyと`FUT-R-004`を
  再利用できる。履歴保存を重複実装せず、採用時に成功・失敗時のrecent更新規則を決める。
- **採用gate:** `FUT-C-042`は登録root内だけを開くか、一時contextを許すかを先に決定する。
  root/path検証を緩めない。recentを漫画openだけに限定するか、file・folderを含む共有履歴modelへ
  拡張するかを明示する。終了はB18のtray lifecycleと矛盾しないclose policyを定義する。

#### FR-B14 実装・直接観測証跡

- **採用要件:** [P1〜P10実装要件](../requirements/roadmap-priorities-requirements.md#p2-opennavigation)。
- **実装根拠:** `src/App.tsx`、`src/features/navigation/navigation.ts`。
- **直接観測:** [FR-B14 focused test結果](../testing/fr-b14-results.md)。既存navigation focusedと
  App接続境界で、open/recent/history/quitの4契約を確認した。

### FR-B15 — しおり・本棚（Batch 15 / P3）

- **状態:** `Done`。対象3行を採用要件化し、focused test、typecheck、CoDD gateを通過した。
- **対象と実装順:** (1) `FUT-C-045`ページしおり保存・一覧、(2) `FUT-C-046`次のしおりへ移動、
  (3) `FUT-C-047`本棚表示・追加。
- **優先理由:** 読書の継続性に直結し、既存のreading position・favorite・永続metadataを活用できる。
  自動保存される読書位置、利用者が明示保存するページしおり、作品collectionとしての本棚を区別する。
- **採用gate:** identity、並び順、wrap、移動・欠損時の扱いを決める。本棚がfavoriteと同義なら
  新機能を作らず表示名・導線の変更としてB17へ統合する。

#### FR-B15 実装・直接観測証跡

- **採用要件:** [P1〜P10実装要件](../requirements/roadmap-priorities-requirements.md#p3-しおり本棚)。
- **実装根拠:** `src/features/reading/collections.ts`、`src/features/reading/collections.test.ts`、
  `src/features/viewer/Viewer.tsx`、`src/App.tsx`。
- **直接観測:** [FR-B15 focused test結果](../testing/fr-b15-results.md)。bookmarkのidentity/order/wrapと
  bookshelfのunique/add/removeをSKIP 0で実測した。

### FR-B16 — filter・export（Batch 16 / P4）

- **状態:** `Done`。2機能を原本非破壊で実装し、focused test、typecheck、CoDD gateを通過した。
- **対象と実装順:** (1) `FUT-C-058` file mask、(2) `FUT-C-050` CSV出力。
- **優先理由:** B13の複数選択・件数stateを使い、表示対象の絞り込みと一覧情報の持ち出しを
  原本非破壊で提供できる。mask適用後のcurrent/totalとexport対象を同じquery modelへ揃える。
- **採用gate:** mask構文・対象kind・保存scope、CSV列・encoding・選択/filtered/allの範囲、
  path情報の取り扱いを要件化する。

#### FR-B16 実装・直接観測証跡

- **採用要件:** [P1〜P10実装要件](../requirements/roadmap-priorities-requirements.md#p4-filterexport)。
- **実装根拠:** `src/App.tsx`、`src/features/catalog/commands.ts`、
  `src/features/catalog/commands.test.ts`。
- **直接観測:** [FR-B16 focused test結果](../testing/fr-b16-results.md)。glob mask、empty mask、
  CSV escaping/columnsをSKIP 0で実測した。

### FR-B17 — 参照shell UI（Batch 17 / P5）

- **状態:** `Done`。B13〜B16のcommand/stateを再利用して実装し、focused test、typecheck、CoDD gateを通過した。
- **対象と実装順:** (1) `FUT-C-065`参照menu構成、(2) `FUT-C-066`icon command toolbar、
  (3) `FUT-C-067`参照型thumbnail tile。
- **優先理由:** Leeyesとの差を縮めるが、先に外観だけを作るとdisabled commandやshortcutを
  作り直すため、実機能の後段に置く。既存のview mode・sort・thumbnail取得を再利用する。
- **採用gate:** menu/toolbarは既存commandを呼ぶpresentation層とし、機能を二重実装しない。
  accessible name、keyboard menu操作、long name、density、DPIの受入基準を決める。

#### FR-B17 実装・直接観測証跡

- **採用要件:** [P1〜P10実装要件](../requirements/roadmap-priorities-requirements.md#p5-参照shell-ui)。
- **実装根拠:** `src/App.tsx`、`src/features/catalog/view-mode.ts`、
  `src/features/catalog/CatalogGrid.tsx`、`src/styles.css`、`src/features/catalog/view-mode.test.ts`。
- **直接観測:** [FR-B17 focused test結果](../testing/fr-b17-results.md)。enum/default、grid mount、
  toolbar accessible labelsをSKIP 0で実測した。

### FR-B18 — workspace・window（Batch 18 / P6）

- **状態:** `Done`。表示surfaceの可逆切替、viewer分離、task tray APIの安全な利用可否表示を実装し、
  focused test、typecheck、CoDD gateを通過した。
- **対象と実装順:** (1) `FUT-C-062` pane表示切替、(2) `FUT-C-063` bar・menu表示切替、
  (3) `FUT-C-060`画像表示領域の分離、(4) `FUT-C-061`task tray収納。
- **優先理由:** 同一window内の可逆な表示切替を先に作り、別window・trayのfocus、復帰、fullscreen、
  process終了といったnative lifecycleを後段へ隔離する。
- **採用gate:** 常に戻せる導線、複数windowのowner、B14の終了menuとの相互作用を要件化し、
  release WebView2で直接観測する。B18単独では表示状態をcurrent sessionに限定し、永続化・profile
  schemaはB19で一度だけ設計する。

#### FR-B18 実装・直接観測証跡

- **採用要件:** [P1〜P10実装要件](../requirements/roadmap-priorities-requirements.md#p6-workspacewindow)。
- **実装根拠:** `src/App.tsx`、`src/features/workspace/display.ts`、
  `src/features/workspace/display.test.ts`、`src/features/viewer/Viewer.tsx`、`src/styles.css`。
- **直接観測:** [FR-B18 focused test結果](../testing/fr-b18-results.md)。pane/bar/menuのcurrent-session切替、
  viewer分離とEsc復帰、tray APIなし時のdisabled境界を確認した。

### FR-B19 — 設定・help（Batch 19 / P7）

- **状態:** `Done`。先行priorityの表示・viewer・操作設定を統合dialogへ束ね、profile、mouse gesture、
  offline help、version情報を実装し、focused test、typecheck、CoDD gateを通過した。
- **対象と実装順:** (1) `FUT-C-069`統合設定画面、(2) `FUT-C-071`設定profile、
  (3) `FUT-C-072`mouse gesture設定、(4) `FUT-C-076`一般help、(5) `FUT-C-077`version情報。
- **優先理由:** 個別設定を先に増殖させず、apply/cancel、migration、safe defaultを共有する。
  既存`FUT-C-019`のkeyboard shortcut設定は再実装せず統合導線から利用する。
- **採用gate:** profileへ含める値と秘密・machine固有値の除外、gesture conflict、offline help配布、
  version/license表示項目を決める。

#### FR-B19 実装・直接観測証跡

- **採用要件:** [P1〜P10実装要件](../requirements/roadmap-priorities-requirements.md#p7-help)。
- **実装根拠:** `src/App.tsx`、`src/features/settings/profile.ts`、
  `src/features/settings/profile.test.ts`、`src/features/viewer/Viewer.tsx`。
- **直接観測:** [FR-B19 focused test結果](../testing/fr-b19-results.md)。profileの非機密境界、gesture conflict、
  apply/cancel導線、一般help/version表示を確認した。

### FR-B20 — thumbnail保守（Batch 20 / P10）

- **状態:** `Planned`。既存thumbnail cacheは破棄可能なapp-local dataであり、入出力仕様が
  決まるまで利用者データ契約へ変更しない。
- **対象と実装順:** (1) `FUT-C-073` thumbnail管理、(2) `FUT-C-074`表示中thumbnailの保存、
  (3) `FUT-C-075` thumbnail一括読込。
- **優先理由:** 日常閲覧の必須導線より専門性が高く、cache形式・容量・overwrite・互換性を
  公開契約にする設計コストが大きいため通常候補の最後に置く。
- **採用gate:** 管理対象、保存format、input source、容量上限、取消・失敗回復、既存cache migration、
  原本非破壊を要件化する。

## 重複・umbrella 境界台帳

同じ user outcome を二度実装しないため、以下の親子・非重複境界を固定する。

| 境界 | 取り扱い |
|---|---|
| `FUT-C-011` / `FUT-C-021` | `FUT-C-011` はお気に入り・quick access の利用体験、`FUT-C-021` は永続保存の原子機能。FR-B06で一つの縦切りとして実装し、quick-access UI と metadata persistence を別々の重複機能として作らない。 |
| `FUT-C-020` / `FUT-C-038`〜`FUT-C-041` | `FUT-C-020` は巻末動作設定の umbrella、後四つは確認、一覧復帰、停止、loop の原子 option。FR-B02の共通 policy と option mapping に集約し、umbrella 自体へ別実装を作らない。既存 `REQ-MVP-016` の固定既定動作は維持する。 |
| `FUT-C-010` / `FUT-D-001` | `FUT-C-010` は名前検索の機能/UI umbrella。`FUT-D-001` は10,000項目・1秒以内の性能受入であり、同じ検索 UI の二重機能ではない。FR-B05の機能テストと FR-S03 の性能実測を分離する。 |
| `REQ-MVP-015` / 読書情報 | MVPの reading position は既存の保存・復元機能であり、FR-B07の memo/history/rating や未決定の読書状態ラベルへ再実装しない。 |
| `REQ-MVP-015` / `FUT-C-045`, `FUT-C-046` | reading positionは最後に読んだ位置の自動保存、page bookmarkは利用者が明示した複数位置の保存・移動。永続化基盤は共有しても意味とUIを混同しない。 |
| `FUT-C-011`, `FUT-C-021` / `FUT-C-047` | favorite/quick accessと本棚が同じcollection semanticsなら新しい保存modelを作らない。別collectionを採用する場合だけ差分要件を先に固定する。 |
| `REQ-MVP-004`, `FUT-R-004` / `FUT-C-044`, `FUT-C-056` | navigation stackと閲覧履歴を再利用する。recentの対象を漫画だけにするかfile・folderまで広げるかを要件化し、同じ対象集合の履歴を二重保存しない。 |
| `FUT-C-030` / `FUT-C-057` | `FUT-C-030`は自動変更検出、`FUT-C-057`は利用者が起動する現在場所の再読込。F5更新だけで自動監視を実装済みとしない。 |
| `FUT-C-012`〜`FUT-C-014`, `REQ-MVP-005`, `REQ-MVP-006` / `FUT-C-067` | 既存view mode、catalog state、thumbnail取得を維持し、参照型tileはvisual・interaction差分だけを実装する。 |
| `REQ-MVP-006` / `FUT-C-073`〜`FUT-C-075` | 既存の内部cache生成・上限制御と、利用者向け管理・保存・一括読込を分離する。後者の採用で既存cacheを暗黙の永続user dataへ変えない。 |
| `FR-B13`〜`FR-B16` / `FR-B17` | menu/toolbarは先行batchのcommandを呼ぶ情報設計・presentation層。B17内に同じ処理を再実装しない。 |
| 追加書庫 / PDF・EPUB・video | FR-B12は画像書庫の RAR/CBR・7z だけを対象にする。PDF、EPUB、video は reader/codec/license の別境界であり、FR-S01へ隔離する。 |

## 通常 Feature Lane から分離するトラック

分離トラックは、通常batchへ未承認のまま割り当てない。状態はロードマップ上の
`Blocked` または採用対象外として記録し、前提が解消されたら新しい task/cmd で再評価する。

### FR-S01 — PDF / EPUB / video reader

- **対象:** `FUT-C-003`（PDF）、`FUT-C-004`（EPUB）、`FUT-C-009`（video）。台帳上は
  `Candidate / NOT TESTED`。
- **分離理由:** 画像書庫と異なる reader/codec、ライセンス、再生ライフサイクル、error/
  seek 契約が必要。FR-B08/B12へ混ぜず、採用承認、技術調査、license/SBOM、専用E2Eを先に行う。
- **状態:** `Blocked`（別設計・別Feature Lane待ち）。未実装を `Done` としない。

### FR-S02 — file mutation・undo

- **対象:** `FUT-C-024`〜`FUT-C-029`, `FUT-C-052`, `FUT-C-053`
  （名前変更、移動、copy、新規folder、ごみ箱移動、完全削除、undo、clipboard file operation）。
  台帳上は `Candidate / NOT TESTED`。
- **分離理由:** 原本非破壊の恒久方針と衝突し得るため、確認、権限、rollback、対象範囲、
  identity/cache/読書情報の移行、trashと完全削除の安全設計を通常laneで短縮しない。
  clipboardやundoをmutation commandの代替として先行実装せず、専用の安全設計と明示承認を必要とする。
- **解除後の評価順:** `FUT-C-027`新規folder、`FUT-C-026`copy、`FUT-C-024`rename、
  `FUT-C-025`move、`FUT-C-028`trash、`FUT-C-053`clipboard、`FUT-C-052`undo、
  `FUT-C-029`完全削除。各段階でroot/path、collision、途中失敗、rollbackを再評価する。
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

### FR-S06 — 仕様・architecture境界未決定

- **対象:** `FUT-C-043`（指定動作で開く）、`FUT-C-059`（file表示の切替）、
  `FUT-C-064`（OS全体folder tree）、`FUT-C-048`（media表示）、`FUT-C-070`（plugin設定）。
  台帳上は`Candidate / NOT TESTED`。
- **分離理由:** screenshotだけではcommand semanticsまたは対象dataが確定せず、OS namespace、
  登録root外access、plugin runtime・trust・distributionは現行architectureとsecurity境界を変え得る。
- **状態:** `Blocked`（product semantics、採用範囲、architecture/security決定待ち）。設定UIだけを
  runtimeより先に作らず、決定後に通常batchを新設または既存batchへ明示統合する。

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

### BATCH-END-GATE（各通常 FR-Bxx 共通）

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
