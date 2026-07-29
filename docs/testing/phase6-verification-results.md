---
codd:
  node_id: "test:phase6-verification-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "design:implementation-plan"
      relation: "verifies"
      semantic: "behavioral"
    - id: "design:test-strategy"
      relation: "executes"
      semantic: "behavioral"
    - id: "test:test-cases"
      relation: "executes"
      semantic: "behavioral"
---

# Phase 6 検証結果

## 実行情報

- 実行日: 2026-07-29
- 実行環境: Windows 11 host + WSL2
- 対象version: 0.1.0
- fixture: 固定seed 20260728、通常64ファイル/11 fixture、性能版11,365ファイル/12 fixture

## 自動検証結果

| 検証 | 結果 | 証跡 |
| --- | --- | --- |
| Rust fmt/check/test | PASS | Windows MSVC、44 tests |
| TypeScript typecheck | PASS | `tsc --noEmit` |
| React unit/component | PASS | 24 tests |
| Python fixture/benchmark/release tests | PASS | 7 tests、68 files / 11 fixtures、fixture validator |
| Production frontend build | PASS | Vite production build |
| CoDD scan/check/verify | PASS | red gate 0、advisory 4 |
| Windows release executable | PASS | `comic-explorer.exe`生成 |
| Windows process smoke launch | PASS | 5秒間起動継続後、試験processを終了 |
| NSIS x64 installer | PASS | offline WebView2 modeで生成 |
| License/SBOM/notices | PASS | npm/Cargo direct/transitive 665 components、unknown/禁止0、CycloneDX 1.6とnotice同期 |

72ケースの個別判定、対応test名、未実行理由は
`docs/testing/phase6-case-results.md`に記録した。
外部環境が必要なBLOCKEDケースの再現手順は
`docs/testing/phase6-manual-procedures.md`に記録した。

## 基礎性能測定

この値はWSL2上のportable foundation harnessであり、Windows製品UIの合否値ではない。
7回測定のp95は次のとおり。

| 操作 | p95 |
| --- | ---: |
| 1,000項目列挙・metadata sort | 21.588 ms |
| 10,000項目列挙・metadata sort | 238.665 ms |
| Deflate ZIPから30ページrandom read | 21.153 ms |
| Stored ZIPから30ページrandom read | 20.798 ms |
| SQLite 10,000件insert + 100件read | 116.516 ms |

## 配布物

release executableおよびNSIS installerをWindows MSVCで生成した。installerは
WebView2 `offlineInstaller` を使用し、ネットワーク不要の導入を構成上要求する。
署名証明書は設定されていないため、現成果物は未署名である。

| 成果物 | bytes | SHA-256 |
| --- | ---: | --- |
| `comic-explorer.exe` | 10,814,976 | `5afc419eb9328d058e57c774377323e65a3552a6c3a181ed68d1257905fc30d5` |
| `Comic Explorer_0.1.0_x64-setup.exe` | 209,274,596 | `c9a1756765f0d5bca968eca35cdc28816be65204850328baeb0fab427e3e5ef5` |

## 実機・隔離環境待ち

次の項目は現在の単一開発ホストでは合否を確定しない。

- Windows 10 22H2 clean VMでのinstall/start/read/uninstall
- 別のWindows 11 clean VMでのinstall/start/read/uninstall
- OSレベルDNS/TCP/UDP監視による外向き通信0件
- WebView2未導入VMでのoffline runtime導入
- 製品UIのcold TTI、page switch、scroll FPS、input delay、working set
- screen readerを含むWindows実機アクセシビリティ
- installerのuser-data保持と明示削除動作

これらは未実施をPASSとして扱わず、release判定前のblocked manual verificationとする。

## 既知の未完了実装

現時点の成果物は製造ベースラインであり、MVP完了判定は行わない。次は未完了である。

- thumbnail priority workerとcancel後の未開始job破棄
- 製品WebViewでcold生成、cache hit、失敗placeholderを連続観測する統合試験
- custom protocolのWindows WebView2実機security試験
- shutdown時の全task停止、全handle close、最終位置flushを対象とするE2E

これらを解消し、72テストケースの実行記録を揃えるまでPhase 6のMVP完了条件は未達とする。

## 今回完了した実装

- 2026-07-29: JPEG/JPG/PNGをmemory入力からWICでdecodeし、EXIF orientation適用、
  拡大なし・長辺384pxの縦横比維持resize、JPEG quality 82 encodeを実装した。
  folderとZIP/CBZは同じ自然順先頭pageを使い、archive entryを展開しない。source
  fingerprint由来content key、cache index hit/stale、app-local temp、atomic write、
  理由/期限付きnegative cache、10GiB LRU、pinを実処理へ接続し、`get_thumbnail`
  commandとReactの固定thumbnail slotへ実画像URIを接続した。実fixtureのWIC出力、
  folder/archiveの自然順先頭page一致、cache hit、実file差替え後のstale再生成、negative
  cache、原本隣接展開0をWindows MSVC 44 tests、表示slotをReact 24 testsで検証し、
  TC-INT-005をPASSへ変更した。priority workerと製品WebView統合は未完了として残す。
- 2026-07-29: 一覧項目へ更新日時、ファイルサイズ、ZIP/CBZ種別metadataを追加し、
  名前・更新日時・サイズ・種類の昇順／降順、欠損値末尾、自然順と決定的tie-break、
  選択中sortのSQLite保存・再起動復元を実装した。Windows MSVC 29 tests、
  React 14 tests、typecheck、production buildで検証した。
- 2026-07-29: Windows標準のfolder pickerを追加し、選択pathをbackendでcanonical化、
  directory判定、directory列挙による読取可否確認を行ってからSQLiteへ保存するように
  した。登録済みrootが消失・アクセス拒否になった場合もpathを維持して再試行・
  再選択できる。Windows MSVC 31 tests、React 15 tests、typecheck、production
  build、fixture validatorで検証した。picker自体のWindows UI操作は実機試験に残す。
- 2026-07-29: 任意の未選択branchを遅延展開・折りたたみできる仮想folder treeを
  実装した。tree専用backend列挙は通常フォルダと漫画フォルダだけを返し、一覧の
  navigation cancellationとは分離した。branch単位のアクセスエラーを局所表示し、
  他branchの操作を維持する。Windows MSVC 31 tests、React 17 tests、typecheck、
  production build、fixture validatorで検証した。
- 2026-07-29: folder tree splitterを初期240px・最小180pxでpointer/keyboard操作
  可能にし、catalog gridの上下左右/Home/End移動、ヘルプを閉じた際の呼出元focus
  復元を実装した。10,000項目を入力したcomponent testで、mounted gridcellが100件
  以下に保たれることも自動検証した。Windows MSVC 31 tests、React 20 tests、
  typecheck、production build、fixture validatorで検証した。
- 2026-07-29: custom protocolのGET method、queryなしURI、32桁hex token、
  Origin/Referer allowlistを検証し、成功・エラーとも正確なContent-Type、
  Content-Length、`nosniff`、CORS、cache制御headerを付けるhandlerへ分離した。
  任意origin、traversal相当URI、query、method、期限切れ・失効token、byte上限を
  拒否する。Windows MSVC 33 tests、React 20 tests、typecheck、production build、
  fixture validatorで検証した。WebView2から届く実headerとの統合確認はBLOCKEDの
  実機試験として残す。
- 2026-07-29: Tauriの`ExitRequested`/`Exit`をshutdown treeへ接続した。shutdown
  flagを先に確定して全commandの新規受付を拒否し、進行中navigationをcancel、
  media tokenを全失効、SQLite connectionをdropしてWAL/SHM handleを閉じる。
  冪等なshutdown unit testを追加し、Windows MSVC 34 tests、React 20 tests、
  typecheck、production build、fixture validatorで検証した。製品process終了時の
  task/handle/最終読書位置をまとめて観測するE2Eは引き続き未完了である。
- 2026-07-29: 単ページ/見開きmodeと右開き/左開きを既存SQLite settingsへ保存し、
  起動時にfrontendへ復元してViewer初期stateへ渡すようにした。Viewerのbutton/key
  操作時に先頭pageを維持したまま設定を即時保存するcomponent testを追加した。
  Windows MSVC 34 tests、React 21 tests、typecheck、production build、fixture
  validatorで検証した。製品再起動を含むUIケースは引き続きNOT RUNである。
- 2026-07-29: Viewer終了と巻末から次漫画へ遷移する際、最新の確定済み先頭pageの
  `save_reading_position`完了後に画面遷移するようflush順序を変更した。成功/失敗
  どちらでもUIを停止させず、保存要求が遷移callbackより先になることをcomponent
  testで検証した。Windows MSVC 34 tests、React 22 tests、typecheck、production
  build、fixture validatorで検証した。
- 2026-07-29: 実装済みのroot/folder/page列挙、ZIP/CBZ列挙、folder page media読込、
  archive entry media読込を同一fixture treeへ実行し、前後の全relative path、種別、
  size、mtime、file content byteが完全一致するintegration testを追加した。
  Windows MSVC 35 testsで差分0を実測した。
- 2026-07-29: snapshotへZIP entry名、size、CRC、圧縮方式、暗号化flagを加え、
  library配下のDB/WAL/SHM/cache/temp/log 0件を明示検証した。malformed image/ZIP
  corpusを68 filesへ拡張し、generatorの既存出力拒否も実測した。実装済み全read経路
  の期待結果を観測できたためTC-INT-010をPASSへ変更した。
- 2026-07-29: npm/Cargoの直接・推移依存665 componentをlockfileとCargo metadata
  から監査し、unknown/禁止license 0件を確認した。同一inventoryからCycloneDX 1.6
  SBOMと`THIRD-PARTY-NOTICES.md`を生成し同期checkを自動化したためTC-DIST-001を
  PASSへ変更した。portable benchmarkも7回再測定した。
- 2026-07-29: 確定済み一覧順から次の読取可能漫画だけを選ぶpure functionを製品の
  巻末遷移へ接続し、末尾とcurrent消失を含むunit testを追加した。item pathとpage
  pathをscopeに含む決定的IDをfolder/ZIP/CBZ page生成へ接続し、形式間衝突を検証した。
  Windows MSVC 36 tests、React対象4 testsでTC-UT-010/011をPASSへ変更した。
- 2026-07-29: 100 generationのnavigationを実Tokio taskとして同時再開し、各taskの
  cancel tokenとcommit時のgeneration gateを観測した。旧99 generationのcommit 0、
  最新generationだけ1件をWindows MSVC 37 testsで確認し、TC-INT-011をPASSへ変更した。
- 2026-07-29: `FIX-LIBRARY-001`を実FS adapterで列挙し、通常folder、comic folder、
  ZIP、CBZ、unsupportedが一意に分類され欠落・重複しないことをWindows MSVC
  38 testsで確認した。既存React Enter/Ctrl+Enter分岐と合わせTC-INT-009をPASSにした。
