---
codd:
  node_id: "test:test-cases"
  type: test
  status: approved
  depends_on:
    - id: "design:test-strategy"
      relation: "verifies"
      semantic: "behavioral"
    - id: "req:mvp-requirements"
      relation: "verifies"
      semantic: "behavioral"
---

# Comic Explorer MVP テストケース

## 承認記録

- 内容承認者：ユーザー
- 内容承認日：2026-07-29
- 承認範囲：現行テストケース、優先度、期待結果、非期待結果
- 制約：製造開始は別途指示があるまで行わない
- 留保：`Blocked`ケースは、製品、実機または要件決定の前提が満たされるまで
  実行可能・合格とは扱わない

## 1. 共通規則

全ケースは専用のライブラリ、アプリデータ、キャッシュ、tempを使い、後処理ではその試験用領域だけを除去する。製品コード未実装のため自動化状態は原則 `Specified`、技術・配布・未決オラクル待ちは `Blocked` である。「標準後処理」はプロセス終了、before/afterスナップショット保存、専用領域除去を指す。非期待結果は一つでも起きれば失敗とする。

## 2. Unit

| テストID | 対応要件 | レベル | 優先度 | 前提条件 | テストデータ | 操作 | 期待結果 | 非期待結果 | 後処理 | 自動化状態 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-UT-001 | REQ-MVP-007-AC1,008-AC2 | Unit | P0 | 比較器のみ | FIX-ORDER-001 | `10,2,1`を昇順比較 | `1,2,10`、反復100回同一 | 辞書順、入力順依存 | なし | Specified | 共通oracle |
| TC-UT-002 | REQ-MVP-008-AC1/3,009-AC1/3 | Unit | P0 | 拡張子判定のみ | FIX-ORDER-003 | 全対象名を判定 | jpg/jpeg/png/zip/cbzは大小文字非区別、txt/webpはfalse | 対象外混入 | なし | Specified |  |
| TC-UT-003 | REQ-MVP-008-AC2,009-AC2 | Unit | P0 | Windows相対path契約 | FIX-NESTED-001 | `/`,`\`,`.`を含む入力を正規化 | 区切り統一、`..`脱出拒否、絶対化なし | root外path | なし | Specified |  |
| TC-UT-004 | REQ-MVP-005,008〜010 | Unit | P0 | 項目分類契約 | FIX-LIBRARY-001 | 各項目を分類 | folder/comic/archive/page/unsupportedが一意。画像と子フォルダ併存でもEnterは移動、読むは明示操作 | metadata推測、暗黙閲覧 | なし | Specified | GAP-TEST-004解決済み |
| TC-UT-005 | REQ-MVP-006-AC1 | Unit | P0 | page一覧あり | FIX-ORDER-001/003 | 表紙を選択 | 隠し・対象外を除く自然順先頭 | 列挙順採用 | なし | Specified |  |
| TC-UT-006 | REQ-MVP-012-AC3 | Unit | P0 | 寸法取得済み | FIX-IMAGE-001 | 縦、横、正方形を判定 | width>heightだけ横長 | 正方形を横長扱い | なし | Specified | OPEN-MVP-003 |
| TC-UT-007 | REQ-MVP-015 | Unit | P0 | 位置契約 | FIX-READING-001 | 同一page、追加、削除を解決 | 同一相対page優先、なければ最小距離、同距離は後方 | indexだけで別page、同距離で前方 | なし | Specified | GAP-TEST-003解決済み |
| TC-UT-008 | REQ-MVP-012-AC5,015 | Unit | P0 | 先頭page IDあり | FIX-READING-001 | 1→2、2→1、方向変更 | 変更前先頭page ID維持 | 隣pageへずれる | なし | Specified |  |
| TC-UT-009 | REQ-MVP-007 | Unit | P0 | 項目配列 | FIX-LIBRARY-001 | 4条件×2方向sort | 欠落値は末尾、種類順と最終tie-breakを含め欠落・重複0 | 不安定同値、欠損値が先頭 | なし | Specified | GAP-TEST-005解決済み |
| TC-UT-010 | REQ-MVP-016 | Unit | P0 | 一覧snapshot | FIX-LIBRARY-001 | 現項目の次を求める | 確定sortの直後、末尾none | 後続自動skip、同値で変動 | なし | Specified |  |
| TC-UT-011 | REQ-MVP-015 | Unit | P0 | identity契約 | FIX-READING-001 | 2冊×folder/zipのkey生成 | 項目とpageごとに一意 | 別作品混線 | なし | Specified |  |
| TC-UT-012 | REQ-MVP-004-AC5 | Unit | P0 | library root固定 | FIX-LIBRARY-001 | root、子、兄弟、`..`を検査 | rootと子だけ許可 | prefix一致による脱出 | なし | Specified | junctionはIntegration |
| TC-UT-013 | REQ-MVP-009,017 | Unit/Security | P0 | archive仮想root | FIX-ZIP-ERROR-001 | entry名を正規化 | `../`、絶対、drive、backslash脱出拒否 | host path結合 | なし | Specified | 抽出禁止 |
| TC-UT-014 | REQ-MVP-006-AC4/5 | Unit | P1 | cache metadata契約 | FIX-IMAGE-001 | 同一、mtime/size/hash変更を判定 | 同一hit、変更・削除stale | stale表紙利用 | なし | Specified |  |
| TC-UT-015 | REQ-MVP-008-AC2 | Unit | P0 | 自然順比較器 | FIX-ORDER-002 | `1,01,001`比較 | `001,01,1`のUTF-16序数で決定的 | 列挙順依存 | なし | Specified | GAP-TEST-001解決済み |
| TC-UT-016 | REQ-MVP-008-AC2 | Unit | P1 | Unicode比較器 | FIX-ORDER-004 | 日本語、ASCII、全角、NFC/NFD比較 | 正規化せずUTF-16序数で決定的 | locale依存変動、暗黙正規化 | なし | Specified | GAP-TEST-002解決済み |

## 3. Contract

| テストID | 対応要件 | レベル | 優先度 | 前提条件 | データ | 操作 | 期待結果 | 非期待結果 | 後処理 | 自動化状態 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-CT-001 | REQ-MVP-002,008 | Contract | P0 | 列挙port | FIX-NESTED-001 | 成功・拒否・消失・cancel | 相対path、種別、metadataまたは分類error/cancel | 部分成功を全成功扱い | 標準 | Specified | API未定 |
| TC-CT-002 | REQ-MVP-008-AC4,019 | Contract | P0 | decoder port | FIX-IMAGE-001/ERROR | 各画像decode | 成功は寸法/format、失敗は対象付きerror | process終了 | 標準 | Specified |  |
| TC-CT-003 | REQ-MVP-009 | Contract | P0 | archive port | FIX-ZIP-001/ERROR | list/open/cancel | entriesまたはcorrupt/encrypted/unsupported、安全拒否 | 暗黙抽出 | 標準 | Specified |  |
| TC-CT-004 | REQ-MVP-006 | Contract | P1 | thumbnail port | FIX-IMAGE-001 | generate/hit/cancel | page identity、画像、cache status | 原本書込み | 標準 | Specified |  |
| TC-CT-005 | REQ-MVP-015 | Contract | P0 | position store | FIX-READING-001 | put/get/reopen | item別の最新表示成功page | 未完了request保存 | DB削除 | Specified | schema未定 |
| TC-CT-006 | REQ-MVP-001,019 | Contract | P1 | UI-backend境界 | FIX-LIBRARY-001 | success/error/cancel | request IDと分類結果、cancel後no result | stale反映 | 標準 | Specified |  |
| TC-CT-007 | REQ-MVP-006,017 | Contract | P1 | cache port | FIX-IMAGE-001 | key/read/write/invalidate | app領域内のkeyだけ | library配下path | 標準 | Specified |  |

## 4. Integration／Security

| テストID | 対応要件 | レベル | 優先度 | 前提条件 | データ | 操作 | 期待結果 | 非期待結果 | 後処理 | 自動化状態 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-INT-001 | REQ-MVP-002,008 | Integration | P0 | 実FS adapter | FIX-ORDER/NESTED | folder列挙 | manifest順、表紙、件数 | 対象外/隠し混入 | 標準 | Specified |  |
| TC-INT-002 | REQ-MVP-009 | Integration | P0 | ZIP adapter | FIX-ZIP-001 | zip/cbz列挙 | folderと同じ相対path順・表紙 | 格納順依存 | 標準 | Specified |  |
| TC-INT-003 | REQ-MVP-008,009 | Integration | P0 | 両adapter | FIX-READING-001 | 同一内容2形式を列挙 | 順序・件数一致 | 順序差 | 標準 | Specified |  |
| TC-INT-004 | REQ-MVP-006-AC4 | Integration | P1 | cache分離 | FIX-IMAGE-001 | thumbnailを2回要求 | 2回目hit、同一表紙 | 再decode/原本書込み | 標準 | Specified |  |
| TC-INT-005 | REQ-MVP-006-AC5 | Integration | P1 | cache済み | FIX-IMAGE-001複製 | 試験側変更後に要求 | stale検出し新cache | 古い表紙 | 標準 | Specified | 複製のみ変更 |
| TC-INT-006 | REQ-MVP-008-AC4,019 | Integration | P0 | viewer service | FIX-IMAGE-ERROR-001 | error page後に次へ | 局所error、次の正常page | app終了、自動修復 | 標準 | Specified |  |
| TC-INT-007 | REQ-MVP-009-AC4,019 | Integration | P0 | archive service | FIX-ZIP-ERROR-001 | 各書庫open | 対象・分類error、他書庫利用可 | 抽出・process終了 | 標準 | Specified |  |
| TC-INT-008 | REQ-MVP-015 | Integration | P0 | 永続store | FIX-READING-001 | page 7保存、service再生成 | page 7、追加後も同path | 別item page 7 | DB削除 | Specified |  |
| TC-INT-009 | REQ-MVP-005 | Integration | P1 | list service | FIX-LIBRARY-001 | 混在root列挙 | 種別を正しく分類し、画像＋子folderは移動と読むを分離 | rar/7zを漫画扱い、Enterで暗黙閲覧 | 標準 | Specified | GAP-TEST-004解決済み |
| TC-INT-010 | REQ-MVP-017,AC-005 | Integration | P0 | 全read service | 全core | 各操作をsnapshotで囲む | mtime含む差分0 | 任意差分 | 標準 | Specified | release blocker |
| TC-INT-011 | REQ-MVP-006,019 | Integration | P1 | 非同期処理 | FIX-LIBRARY-001 | A読込中にBへ移動/cancel | Bだけ反映、A破棄 | 三領域不一致 | 標準 | Specified | 100回反復 |
| TC-INT-012 | REQ-MVP-015,019 | Integration | P1 | position store | FIX-READING-001 | DBなし/空/破損/旧schema | 破損元をrecoveryへ隔離、空DBで通知・安全継続 | 原本変更、無通知削除、誤位置 | 標準 | Specified | GAP-TEST-006解決済み |
| TC-SEC-001 | REQ-MVP-009,017 | Security | P0 | 書込み監視 | FIX-ZIP-ERROR-001 | 危険ZIPをlist/open | 危険entry拒否、新規file 0 | root内外へ展開 | 標準 | Specified | 抽出API禁止 |
| TC-SEC-002 | REQ-MVP-018 | Security | P0 | OS通信監視 | 全core | 全MVP操作 | 外向きDNS/TCP/UDP 0 | telemetry通信 | 標準 | Blocked | 製品待ち |

## 5. UI／E2E／エラー

| テストID | 対応要件 | レベル | 優先度 | 前提条件 | データ | 操作 | 期待結果 | 非期待結果 | 後処理 | 自動化状態 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-UI-001 | REQ-MVP-001 | UI | P0 | 初回状態 | FIX-LIBRARY-001 | root登録 | tree/address/current一致、再起動復元 | library内設定 | 標準 | Blocked | UI待ち |
| TC-UI-002 | REQ-MVP-002,003 | UI | P1 | root登録済み | FIX-LIBRARY-001 | tree展開/折畳/深い選択 | 直下表示、折畳、深さ差なし | 固定階層推測 | 標準 | Blocked |  |
| TC-UI-003 | REQ-MVP-003/004 | UI | P0 | 複数folder | FIX-LIBRARY-001 | 3手段で移動 | tree=address=list=current | 一部だけ旧path | 標準 | Blocked |  |
| TC-UI-004 | REQ-MVP-004 | UI | P1 | A→B→C済み | FIX-LIBRARY-001 | back/forward/up/外入力 | 正しい履歴、越境拒否 | root越境 | 標準 | Blocked |  |
| TC-UI-005 | REQ-MVP-005 | UI | P1 | 一覧表示 | FIX-LIBRARY-001 | 長名選択、scroll | 種別/名/件数/完全名、全到達 | status不一致 | 標準 | Blocked |  |
| TC-UI-006 | REQ-MVP-006 | UI | P1 | cache cold | FIX-LIBRARY-001 | 生成中に操作 | 操作可能、固定layout | 画面block | 標準 | Blocked |  |
| TC-UI-007 | REQ-MVP-007,AC-006 | UI | P0 | mixed items | FIX-LIBRARY-001 | 4条件×昇降順 | 条件表示、欠損末尾、種類・tie-break規則、欠落重複0 | 次項目と別sort | 標準 | Blocked | UI待ち。sort oracle確定済み |
| TC-UI-008 | REQ-MVP-005,010 | UI | P0 | comic選択 | FIX-READING-001 | 漫画folderはCtrl+Enter、書庫はEnterで開きEsc | 未読先頭/既読page、一覧context復元。漫画folderのEnterは移動 | context喪失、漫画folderのEnterで暗黙閲覧 | 標準 | Blocked | UI待ち |
| TC-UI-009 | REQ-MVP-011 | UI | P0 | viewer | FIX-IMAGE-001 | 単page前後/端 | 全体fit、比率維持、端stay | crop/変形 | 標準 | Blocked |  |
| TC-UI-010 | REQ-MVP-011/012 | UI | P0 | 連続page | FIX-READING-001 | 1/2切替 | 最大2page、先頭ID維持 | page skip | 標準 | Blocked |  |
| TC-UI-011 | REQ-MVP-012 | UI | P0 | 横長/奇数末尾 | FIX-IMAGE-001 | 見開き移動 | 横長単独、末尾1枚、戻り整合 | 横長と次を併置 | 標準 | Blocked |  |
| TC-UI-012 | REQ-MVP-013 | UI | P0 | viewer | FIX-READING-001 | R切替、再起動 | 配置/矢印/click反転、永続、初回右 | 一部だけ反転 | 標準 | Blocked |  |
| TC-UI-013 | REQ-MVP-014 | UI | P0 | viewer | FIX-READING-001 | key/click/wheel | 同じpage、focus可視 | focus依存 | 標準 | Blocked |  |
| TC-UI-014 | REQ-MVP-016 | UI | P0 | 複数comic | FIX-LIBRARY/READING | 末尾でnext | 直後を自動open、なければ留まる | loop/後続skip | 標準 | Blocked |  |
| TC-E2E-001 | E2E-MVP-001,AC-001/003/004 | E2E | P0 | clean install | FIX-LIBRARY/READING | 登録→閲覧→終了→再起動 | 最終成功page復元 | 位置消失/原本差分 | 標準 | Blocked |  |
| TC-E2E-002 | E2E-MVP-002,AC-002/005 | E2E | P0 | clean data | FIX-ZIP-001 | snapshot→閲覧→snapshot | ZIP/親folder差分0 | 隣に展開物 | 標準 | Blocked | blocker |
| TC-E2E-003 | E2E-MVP-003,AC-007 | E2E | P0 | 名前昇順 | FIX-LIBRARY-001 | 中巻末でnext | 次comicの保存page/先頭 | dialog/別sort | 標準 | Blocked |  |
| TC-E2E-004 | REQ-MVP-018 | E2E | P0 | network blocked | 全core | E2Eとerrors | 全MVP完走、通信0 | online依存 | 標準 | Blocked |  |
| TC-ERR-001 | REQ-MVP-001,019 | UI/E2E | P0 | root無効 | FIX-LIBRARY-001 | 拒否/消失/retry/reselect | path/reason/action、復帰 | app終了/削除 | 標準 | Blocked | Windows ACL |
| TC-ERR-002 | REQ-MVP-003,019 | UI | P0 | 一部拒否 | FIX-LIBRARY-001 | node展開後別nodeへ | 局所error、他folder利用可 | tree全停止 | 標準 | Blocked |  |
| TC-ERR-003 | REQ-MVP-008,019 | UI | P0 | viewer | FIX-IMAGE-ERROR-001 | corrupt pageから回復 | path/reason/actions、回復成功 | 自動skip/修復 | 標準 | Blocked |  |
| TC-ERR-004 | REQ-MVP-009,019 | UI | P0 | viewer | FIX-ZIP-ERROR-001 | 異常書庫open | archive/reason/retry/list | viewer開始/展開 | 標準 | Blocked |  |
| TC-ERR-005 | REQ-MVP-019 | UI | P0 | 読込中 | FIX-READING-001 | 試験側で対象消失 | error、確定page保持、一覧復帰 | crash/混線 | 標準 | Blocked | 複製のみ |

## 6. Non-functional／Distribution

| テストID | 対応要件 | レベル | 優先度 | 前提条件 | データ | 操作 | 期待結果 | 非期待結果 | 後処理 | 自動化状態 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-PERF-001 | NFR-MVP-001 | Performance | P1 | 基準PC | 1k items | cold/warm一覧5回 | time/memory/cache/p95記録 | 全thumb同時保持 | 標準 | Blocked | 製品待ち |
| TC-PERF-002 | NFR-MVP-001 | Performance | P1 | 基準PC | 10k items | scroll/列挙/離脱 | 遅延処理、memory回収、idle≤250MiB | OOM/UI停止 | 標準 | Blocked | 製品待ち。上限確定済み |
| TC-PERF-003 | NFR-MVP-001 | Performance | P1 | 基準PC | 300page両形式 | 連続閲覧 | time/memory/cache記録 | 全decode保持 | 標準 | Blocked |  |
| TC-PERF-004 | NFR-MVP-002-AC1 | Performance | P1 | cold固定 | core | 起動7回 | 操作可能までmedian≤3sを判定 | 完了時刻だけ測定 | 標準 | Blocked | 製品待ち。PC確定済み |
| TC-PERF-005 | NFR-MVP-002-AC2 | Performance | P1 | warm cache | 10k | 一覧5回 | 操作可能≤1s | cache作成混入 | 標準 | Blocked |  |
| TC-PERF-006 | NFR-MVP-002-AC3 | Performance | P1 | prefetch済み | 300page | 切替100回 | 各値/p95、≤100ms判定 | 総処理だけ記録 | 標準 | Blocked |  |
| TC-A11Y-001 | NFR-MVP-003,REQ-MVP-014 | UI/A11y | P1 | keyboardのみ | core | 登録からerror復帰 | mouseなし完走、focus可視 | trap | 標準 | Blocked |  |
| TC-A11Y-002 | NFR-MVP-003 | UI/A11y | P1 | UIA inspector | core | Tab/F6/状態検査 | 順序、name/role/state完全 | 色のみ | 標準 | Blocked |  |
| TC-A11Y-003 | NFR-MVP-003 | Manual/UI | P1 | high contrast/DPI | core | 100/150/200% | focus、完全名、操作可視 | clipping | 標準 | Blocked | 実機 |
| TC-DIST-001 | NFR-MVP-004 | License | P1 | lockfile/SBOM | 直接依存 | license照合 | 全件情報、禁止0 | unknown/有料 | report保持 | Blocked | 製造・lockfile待ち。技術決定済み |
| TC-DIST-002 | NFR-MVP-005-AC1〜3 | Distribution | P0 | Win10/11 | installer | snapshot→install/start/uninstall | 両OS成功、library差分0 | 原本変更 | 方針どおり | Blocked | blocker |
| TC-DIST-003 | NFR-MVP-005-AC5 | Distribution | P1 | 設定/cacheあり | installer | 既定と削除選択でuninstall | 既定は専用data保持、選択時だけ専用領域削除、原本不変 | 無断位置消失、原本変更 | 標準 | Blocked | 製品待ち。方針確定済み |

## 7. 件数

| レベル群 | 件数 |
| --- | ---: |
| Unit | 16 |
| Contract | 7 |
| Integration／Security | 14 |
| UI／E2E／Error | 23 |
| Performance／Accessibility／Distribution | 12 |
| **合計** | **72** |

P0は47件、P1は25件である。要件ギャップ解消後の現時点で `Specified` は36件、
`Blocked` は36件である。残る`Blocked`は製品実装、lockfile、Windows実機または
配布物待ちであり、要件オラクル未決によるものではない。
