---
codd:
  node_id: "test:project-verification"
  type: test
  status: approved
  confidence: 0.95
  depends_on:
    - id: "req:project-requirements"
      relation: "verifies"
      semantic: "behavioral-contract"
    - id: "design:project-architecture"
      relation: "verifies"
      semantic: "system-boundary"
---

# Comic Explorer 現行検証記録

## 対象

- 最終更新日: 2026-08-21 JST
- version: 0.1.0
- 文書統合開始時commit: `3777cf5ec552aef80e0cd52ea19011edf3c7f68d`
- 対象: 上記commit以降の実装と、本ドキュメントを含むcurrent branch差分

実装コードと実行可能なテストコードを検証内容の正本とする。本書は最後に受理された結果と
未完了境界の要約であり、Git履歴上の過去runを現在のPASSへ合算しない。

## Leeyes P1〜P5実装マニフェスト

2026-08-21の一括承認対象を`leeyes-implementation-manifest.csv`へ固定した。自動検査は103件の一意性、
Missing 67件 / Partial 36件、P1 21件 / P2 16件 / P3 31件 / P4 12件 / P5 23件、tier内rank連番、
trackerとのpriority一致、既存Published 3件との分離、対象外statusの非混入、依存が後tierを指さないことを確認する。

Windows test runnerがPowerShell 7環境で存在しない`$PSHOME\powershell.exe`を固定参照していたため、
実行中host、`pwsh.exe`、Windows PowerShellの順で検証済み実行fileを解決する共通境界へ修正した。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Windows tests | PASS | Python 59件、frontend 25 files / 296件、FAIL 0。tracker/manifest整合5件とPowerShell 5/7 host解決回帰を含む。 |
| TypeScript typecheck | PASS | `run-typecheck-windows.ps1` exit 0。 |
| Windows frontend build / SBOM | PASS | 66 modules、SBOM 729 components、unknown/prohibited license 0。 |
| Rust canonical | PASS | `cargo fmt --check`、`cargo check --locked`、lib 158件とshutdown process 1件を含む`cargo test --locked`がexit 0。既存dead-code warning 2件はFAILへ読み替えない。 |

この段階では実装対象を選択・順序固定しただけであり、103件をImplemented、Verified、Publishedへ推定しない。

## Leeyes P1-A 即効改善

対象はLEY-SHELL-012/013、LEY-VIEWER-020/021/022/031、LEY-INPUT-004/010/012の9件。shell面、native topmost、倍率・pixel寸法・保持scope・grid、設定reset、pan/wheel調整をprofile v5とapp-local SQLiteのatomic保存へ接続した。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Windows tests | PASS | Python 59件、frontend 26 files / 316件、FAIL 0。profile v1〜v4移行とstrict v5、1〜800%・pixel範囲、page保持、grid overlay、pan係数、wheel不感帯、shell面、Ctrl/Cmd+`,`、native topmost成功/失敗を含む。 |
| TypeScript typecheck | PASS | `run-typecheck-windows.ps1` exit 0。 |
| Rust focused/canonical | PASS | settings profile focused 1件、canonical lib 158件 + shutdown process 1件、`fmt --check`、`check --locked`、FAIL 0。既存dead-code warning 2件。 |
| Windows frontend build | PASS | 67 modules、exit 0。`dist/`は生成物としてcommitしない。 |
| CoDD | PASS（red 0） | scan/check/verifyの最終結果を記録。advisory、SKIP、VACUOUSを機能PASSへ合算しない。 |
| 性能・製品直接観測 | NOT RUN | この設定中心batchに専用性能目標はない。release WebView2のtopmost、grid目視、mouse/trackpad別の操作感は未測定。 |

## Leeyes P1-B 既存機能完成

対象はLEY-FILER-016、LEY-CATALOG-010、LEY-FILE-001/009、LEY-SETTING-005、LEY-HELP-001の6件。初期選択4 policy、thumbnail生成3 scope、Windows native file picker、recent上限20件・再起動復元・消去、起動場所2 policy、同梱help検索をprofile v6とapp-local SQLiteへ接続した。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Windows tests | PASS | Python 59件、frontend 27 files / 328件、FAIL 0。tracker/manifest 5件、profile v5→v6移行、不正enum拒否、初期選択、表示中25件のthumbnail scope、file picker接続、recent復元・消去、drive root起動、offline help検索を含む。 |
| TypeScript typecheck | PASS | `run-typecheck-windows.ps1` exit 0。 |
| Windows frontend build / SBOM | PASS | 68 modules、SBOM 729 components、unknown/prohibited license 0。`dist/`は生成物としてcommitしない。 |
| Rust focused/canonical | PASS | file path再検証、profile enum検証、SQLite設定復元、history newest 20件・消去を含むlib 160件 + shutdown process 1件、`fmt --check`、`check --locked`、FAIL 0。既存dead-code warning 2件。 |
| CoDD | PASS（red 0） | 最終文書・tracker同期後のscan/check/verifyはexit 0。scan 5 documents / 63 nodes / 139 edges、check red failure 0。advisory、SKIP、VACUOUSを機能PASSへ合算しない。 |
| 性能・製品直接観測 | PARTIAL / NOT RUN | 自動testで50 archiveに対する表示中scope 25要求とhistory 25件から20件への上限を直接観測。基準PC時間・memoryは未測定。release WebView2のnative picker操作、欠落recent file、help visual/DPIは未測定。 |

## Leeyes P1-C 独立S機能

対象はLEY-FILER-007/011/014/018、LEY-VIEWER-006、LEY-SETTING-006の6件。Windows known folder移動、隠し項目表示、incremental search、catalog配色preset、random page、opt-inの前回viewer復元をprofile v7とapp-local SQLiteへ接続した。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Windows tests | PASS | Python 59件、frontend 27 files / 340件、FAIL 0。known folderのdrive境界、dot/Windows hidden属性、NFKC前方一致と循環、IME/modifier抑止、palette contract、現在page除外random、profile v6→v7移行、設定保存・一覧再読込、opt-in startup viewer復元を含む。 |
| TypeScript typecheck | PASS | `run-typecheck-windows.ps1` exit 0。 |
| Windows frontend build / SBOM | PASS | 68 modules、SBOM 729 components、unknown/prohibited license 0。`dist/`は生成物としてcommitしない。 |
| Rust canonical | PASS | `cargo fmt --check`、`cargo check --locked`、hidden属性・known folder・profile enum・SQLite再起動復元を含むlib 163件 + shutdown process 1件、FAIL 0。既存dead-code warning 2件。 |
| release / product回帰 | PASS | release executable freshness PASS。GUI権限付きshortcut product harnessはremap・conflict・viewer command・reset・restart復元と原本差分0でPASS。P1-C固有操作のrelease直接観測ではない。 |
| CoDD | PASS（red 0） | formal canonical内のscan/check/verifyはexit 0。文書・tracker最終同期後にもscan/check/verifyを再実行する。SKIP、VACUOUS、advisoryを機能PASSへ合算しない。 |
| 性能・製品直接観測 | NOT RUN | このS機能batchに専用性能閾値はない。10,000項目virtual DOMの既存回帰はPASSだがincremental searchの基準PC時間、random分布の統計測定、known folder全種類、hidden実folder、4配色、IME、removable drive欠落をrelease WebView2では未測定。 |

## Leeyes P2-A slideshow中核

対象はLEY-VIEWER-007の1件。既存context slideshowをtoolbar開始・停止、focus/visibility pause、fresh interval、1page無効化、timer cleanupまで完成させた。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Windows tests | PASS | Python 59件、frontend 27 files / 342件、FAIL 0。Viewer単体33件に開始・停止、2999/3000ms境界、blur中の非進行、focus復帰後600msのfresh interval、既存context起動を含む。 |
| TypeScript typecheck | PASS | `run-typecheck-windows.ps1` exit 0。 |
| Windows frontend build | PASS | 68 modules、exit 0。`dist/`は生成物としてcommitしない。 |
| Rust / release / CoDD | PASS | formal canonicalは全12 stageがexit 0。Rust lib 163件 + shutdown process 1件、release executable/freshness、GUI権限付きshortcut product回帰、cleanup audit、CoDD scan/check/verifyを含む。製品harnessはP2-A固有slideshowの直接観測ではない。 |
| 性能・製品直接観測 | NOT RUN | timerは常に1件でboundedだが、release WebView2での3秒精度、background、focus復帰、長時間memoryは未測定。詳細設定の性能・組合せはLEY-VIEWER-008で測定する。 |

## Leeyes P2-B 境界動作

対象はLEY-VIEWER-009の1件。既存5 policyの接続を回帰し、最終volumeでreturn-libraryがno-next停止になる不足を修正した。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Windows tests | PASS | Python 59件、frontend 27 files / 344件、FAIL 0。resolver 9件とApp 83件に、最終巻return、次巻ありreturn、auto/confirm/stop/loop、PDF・画像folder、次巻先頭・前巻末尾、stale設定、永続復元を含む。known-folder addressの非同期assertion flakeをwaitForへ補強後に全件再実行した。 |
| TypeScript typecheck / build | PASS | typecheck exit 0、frontend 68 modules build。 |
| Rust / release / CoDD | PASS | formal canonicalは251.2秒で全12 stageがexit 0。Rust lib 163件 + shutdown process 1件、release executable/freshness、GUI権限付きshortcut product回帰、cleanup audit、CoDD scan/check/verifyを含む。製品harnessはP2-B固有の全policy直接観測ではない。 |
| 性能・製品直接観測 | NOT RUN | resolverはbounded catalog snapshot上の同期判定。release WebView2での全5 policy、低速folder再列挙、長時間連続巻移動は未測定。 |

## Leeyes P2-C しおり

対象はLEY-VIEWER-010の1件。既存の複数しおり・pageKey再解決をapp-local SQLite schema v5へ移し、root分離、重複upsert、欠落page表示、個別削除、旧localStorage行の成功後cleanupを接続した。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Windows tests | PASS | Python 59件、frontend 27 files / 348件、FAIL 0。Appのnative load/save/delete・旧行移行、Viewerの欠落page削除、collection cleanupを含む。 |
| TypeScript typecheck / build | PASS | typecheck exit 0、frontend 68 modules build。 |
| Rust focused | PASS | schema v5の永続化、root namespace分離、同一page upsert、順序、idempotent delete、restartを1件で確認。 |
| Rust / release / CoDD | PASS | formal canonicalは349.9秒で全12 stageがexit 0。Rust lib 164件 + shutdown process 1件、release executable/freshness、GUI権限付きshortcut product回帰、cleanup audit、CoDD scan/check/verifyを含む。製品harnessはP2-C固有のSQLite再起動を直接観測するものではない。 |
| 性能・製品直接観測 | NOT RUN | 作品ごとのDB上限10000件、旧行自動移行上限1000件は実装済み。上限件数でのmigration時間、release WebView2再起動、DB破損復旧は未測定。 |

## Leeyes P2-D 自動・単ページ・見開き

対象はLEY-VIEWER-013の1件。既存single/spreadへauto modeを加え、viewport比と横長pageを組み合わせた固定heuristic、resize再判定、表示単位next/履歴previous、toolbar・profile・SQLite境界を接続した。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Windows tests | PASS | Python 59件、frontend 27 files / 352件、FAIL 0。modelの3 mode・1.25境界・next履歴、Viewerのwide/narrow resizeと明示spread、profile/Appのauto applyを含む。 |
| TypeScript typecheck / build | PASS | typecheck exit 0、frontend 68 modules build。 |
| Rust focused | PASS | auto/single/spreadの正規化と不正値single fallbackを1件で確認。 |
| Rust / release / CoDD | PASS | formal canonicalは348.5秒で全12 stageがexit 0。Rust lib 165件 + shutdown process 1件、release executable/freshness、GUI権限付きshortcut product回帰、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・製品直接観測 | NOT RUN | 判定は定数時間でResizeObserverを1件だけ保持する。release WebView2での連続resize、DPI/分離viewer、実画像の多様な縦横比は未測定。 |

## Leeyes P2-E 見開き条件

対象はLEY-VIEWER-014の1件。縦長page比率、auto viewport比率、先頭単独、開始偶奇をstrict profile v8・SQLite・設定dialog・viewer modelへ接続し、v1〜v7はP2-D互換既定値へ移行する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend | PASS | model・Viewer・profile・Appの4 files / 219件、FAIL 0。cover/even再同期、50〜100% page比、100〜300% viewport比、設定apply、v7 migration、不正値拒否を含む。 |
| TypeScript typecheck | PASS | exit 0。 |
| Rust focused | PASS | persisted spread ruleの既定値・正常値・不正値fallback 1件、FAIL 0。sandbox内target書込み拒否後、承認済みWindows境界で再実行した。 |
| Windows tests / build | PASS | Python 59件、frontend 27 files / 363件、FAIL 0。typecheck exit 0、frontend 68 modules build。 |
| Rust / release / CoDD | PASS | formal canonicalは350.2秒で全12 stageがexit 0。Rust lib 166件 + shutdown process 1件、release executable/freshness、GUI権限付きshortcut product回帰、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・製品直接観測 | NOT RUN | 判定はpageごとに定数時間、設定値は固定サイズ。release WebView2のDPI別resize、実画像の縦横比境界、極端な画像寸法は未測定。 |

## Leeyes P2-F フィット詳細

対象はLEY-VIEWER-019の1件。小画像の拡大可否、見開き全体/page単位のfit基準、page余白のfit算入可否をstrict profile v9・SQLite・設定dialog・viewerへ接続し、v1〜v8は縮小のみ・見開き全体・余白算入へ移行する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend | PASS | model・Viewer・profile・Appの4 files / 223件、FAIL 0。自然寸法未確定時のCSS fallback、見開き/page基準、gap・margin、小画像拡大、v8 migration、設定applyを含む。初回の並列実行では無関係なApp menu timing 1件が失敗したが、App 85件の単独再実行はPASSして再現しなかった。 |
| TypeScript typecheck | PASS | exit 0。 |
| Rust focused | PASS | persisted fit ruleの既定値・正常値・不正値fallback 1件、FAIL 0。sandbox内target書込み拒否と初回compile timeout後、承認済みWindows境界で再実行した。 |
| Windows tests / build | PASS | Python 59件、frontend 27 files / 367件、FAIL 0。typecheck exit 0、frontend 68 modules build。 |
| Rust / release / CoDD | PASS | gap補正後のfinal sourceに対するformal canonicalは242.3秒で全12 stageがexit 0。Rust lib 167件 + shutdown process 1件、release executable/freshness、GUI権限付きshortcut product回帰、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・製品直接観測 | NOT RUN | fit計算は表示page数に比例し、現行上限は見開き2page。release WebView2のDPI別zoom、巨大画像、異なる縦横比の見開き、scroll/pan感触は未測定。 |

## Leeyes P2-G scroll / pan / animation

対象はLEY-VIEWER-026の1件。page内scroll量10〜100%、連続layoutのwheel速度50〜200%、smooth有無をstrict profile v10・SQLite・設定dialog・viewerへ接続し、v1〜v9は90%・100%・smooth有効へ移行する。pointer release後の慣性は導入せず、OSの視覚効果軽減を優先する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend | PASS | model・Viewer・profile・Appの4 files / 228件、FAIL 0。上下page内scroll、設定量、smooth無効、wheel deltaMode/速度、v9 migration、不正値拒否、設定applyを含む。 |
| TypeScript typecheck | PASS | exit 0。 |
| Rust focused | PASS | persisted scroll量・wheel速度の既定値・正常値・不正値fallback 1件、FAIL 0。 |
| Windows tests / build | PASS | Python 59件、frontend 27 files / 372件、FAIL 0。typecheck exit 0、frontend 68 modules build。bundle 501.32kBでViteの500kB advisoryを1件記録し、機能PASSへ読み替えない。 |
| Rust / release / CoDD | PASS | formal canonicalは354.1秒で全12 stageがexit 0。Rust lib 168件 + shutdown process 1件、release executable/freshness、GUI権限付きshortcut product回帰、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・製品直接観測 | NOT RUN | wheel変換とcommand量計算は定数時間、慣性timerなし。release WebView2でのmouse/trackpad deltaMode、smooth animation、reduced-motion、巨大画像panの体感は未測定。 |

## Leeyes P2-H N字・Z字スクロール

対象はLEY-VIEWER-027の1件。標準縦送り、N字のcolumn優先、Z字のrow優先を左右の読書方向とprevious逆走へ接続し、strict profile v11・SQLite・設定dialog・viewerで共有する。v1〜v10は標準縦送りへ移行し、行/列切替はatomic scrollとする。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend | PASS | model・Viewer・profile・Appの4 files / 232件、FAIL 0。N/Zのforward/reverse、左右読書方向、右端開始、atomic行列切替、v10 migration、不正値拒否、設定applyを含む。 |
| TypeScript typecheck | PASS | exit 0。 |
| Rust focused | PASS | persisted scan modeのvertical/n/zと不正値fallback 1件、FAIL 0。 |
| Windows tests / build | PASS | Python 59件、frontend 27 files / 376件、FAIL 0。typecheck exit 0、frontend 68 modules build。bundle 503.37kBでViteの500kB advisoryを1件記録し、機能PASSへ読み替えない。 |
| Rust / release / CoDD | PASS | formal canonicalは356.3秒で全12 stageがexit 0。Rust lib 169件 + shutdown process 1件、release executable/freshness、GUI権限付きshortcut product回帰、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・製品直接観測 | NOT RUN | target計算は定数時間、追加timerなし。release WebView2の巨大画像・見開きでのN/Z経路、smooth中の連続入力、pointer pan後の再開位置は未測定。 |

## FR-B23 Leeyes viewer操作・外観

対象は利用者が明示的に選択したLEY-VIEWER-004、LEY-VIEWER-025、LEY-VIEWER-028だけである。192機能の採否・進捗・証拠は`leeyes-feature-tracker.csv`を正本とし、未選択IDを実装済みへ変更しない。

| Gate | 結果 | 2026-08-20の実測 |
|---|---|---|
| Windows tests | PASS | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-tests-windows.ps1`: Python 56件、frontend 25 files / 296件、FAIL 0。見開き1page移動、背景・余白・間隔、cursor inactivityとpointer drag・ルーペ中の抑止、profile v4移行・不正値拒否、Appからbackend payloadとViewer CSS propertyへの接続、192行トラッカー整合性を含む。 |
| TypeScript typecheck | PASS | `.\scripts\run-typecheck-windows.ps1`: exit 0。 |
| Rust focused | PASS | `.\scripts\invoke-windows-toolchain.ps1 -Task RustFocused -RustFilter ft_b23_004`: 1件PASS、157件filtered out、FAIL 0。 |
| Rust canonical | PASS | `.\scripts\invoke-windows-toolchain.ps1 -Task RustCanonical`: `cargo fmt --check`、`cargo check --locked`、lib 158件とshutdown process 1件を含む`cargo test --locked`がexit 0。既存dead-code warning 2件はFAILへ読み替えない。 |
| Windows frontend build | PASS | `.\scripts\run-build-windows.ps1`: 66 modules、exit 0。`dist/`は生成物としてcommitしない。 |
| CoDD | PASS（red 0） | scan 5 documents / 59 nodes / 132 edges。checkはred failure 0、advisory 10。verifyはexit 0、DAG red 3 PASS / 0 FAIL、amber WARN 1、SKIP 3、VACUOUS 1、typecheck実行、source integrity 13 files。SKIP・VACUOUS・verification tests 0件を機能PASSへ加算しない。 |
| release WebView2直接観測 | NOT RUN | 背景色、余白、見開き間隔、cursor消去・復帰の実製品目視は今回の必須自動gateに含まれず未測定。自動テストのPASSから直接観測済みとは推定しない。 |

Windows SDK x64 libraryが当初存在しなかったため、Microsoft公式component `Microsoft.VisualStudio.Component.Windows11SDK.26100`をVisual Studio Community 2026へ追加した。SDKは`E:\Windows Kits\10\Lib\10.0.26100.0`として解決され、追加後にRust focused/canonicalを実行した。

## 既存laneの受理済み結果

| 領域 | 状態 | 実測内容または境界 |
|---|---|---|
| Rust canonical | PASS | 2026-08-14、lib 157件 + shutdown process 1件、FAIL 0。Windows論理ドライブbitmaskの列挙、Explorer表示用pathとPDF `StorageFile`境界での`\\?\` / `\\?\UNC\`除去、Windows Shell delete境界での同接頭辞除去、canonical PDFのviewer PNG・WIC JPEG thumbnail生成、folder一覧がmetadataだけを返す境界、生成中thumbnail pipelineのlockを保持してもnavigation用pin解除とfolder列挙を待たせない境界、folder thumbnailが直下画像を自然順で選びサブfolder画像とarchiveを候補にしない境界、明示的なlibrary診断では画像folderの作品判定を維持する境界、検索条件、viewer page worker、thumbnail、設定永続化を含む。`cargo fmt --check`と`cargo check --locked`もexit 0。 |
| Rust P8 focused | PASS / feature部分BLOCKED | 2026-08-10、22 PASS / 0 FAIL / 0 ignored。GIF/AVIF container testであり製品decodeのPASSではない。 |
| 追加画像形式 | PASS / animated GIF製品観測BLOCKED | BMP/GIF/TIFF/ICOの実ピクセルdecode、SVGの静止・外部resource無効rasterize、folder/archive列挙、MIME/signature、PNG viewer配信、WIC JPEG thumbnailをWindows Rust canonicalで直接検証。release WebView2のanimated GIF再生は未観測。 |
| TypeScript/frontend | PASS | 2026-08-14、25 files / 279 tests PASS、FAIL 0。root登録画面を表示しない起動、PC配下のdrive表示とsidebar選択、24px単位のvirtual tree rowと16px階層indent、drive切替、現在folder absolute pathのtree header、folder treeの右click・Shift+F10・Ctrl+X/C/Vによるfolder cut/copy/pasteと安全境界を切り替えて行うdrive root paste、catalogおよびfolder treeの右click folder内へのpaste、catalog選択項目とtree folder自体のcatalog/tree folderへのdrag move、folder treeの右click・Deleteによる共通確認dialog経由の削除と表示中folder削除後の親folder遷移、file操作後のcatalog/tree再列挙、親から子へのcatalog移動時の先頭表示と子から親へ戻る際の保存scroll位置復元、folder内画像を1冊として閲覧した巻末で親catalog sort順の次巻を選び通常folder内画像も先頭pageから開く接続、navigation・drive往復・検索pane・一時非表示をまたぐbranch展開保持、明示的な全折りたたみ、folder thumbnail要求と画像なし時の専用icon fallback、連続viewerで現在pageと最大4page先だけを要求するbounded prefetch、重複page要求の抑止を含む。外枠・内側余白なしでthumbnailと同寸、行列4px間隔、overlay選択となる大判表紙だけのカードグリッド、左側の固定表紙と右側の名前・種別・サイズ・更新日時を持つ情報カード、全5一覧形式の切替、4形式別のthumbnail幅、profile v1/v2からv3への移行、既存の種類icon、設定、command、検索、viewer回帰、TypeScript typecheckもexit 0。 |
| Python | PASS | 2026-08-14、52 tests PASS、FAIL 0。releaseだけにWindows GUI subsystemを指定してdebug consoleを維持するentry point契約、canonical pathのPDF thumbnail・viewer実decodeを観測するFT-B21-001製品gate、page layoutの横幅フィットがviewer stage全幅・全高を使い、見開きのpage間隔だけを残し、低い画像を上下中央へ置き、高い画像の下端後ろへ固定余白を作らないstyle contract、約11px文字・24px行高・16px展開記号列・左paddingなし・14px icon列のcompact tree、tree headerと独立scroll領域、設定dialog、catalog固定幅card、表紙グリッドの画像・ファイル名分離、外枠・内側余白なしで4px間隔となる大判カードグリッドのthumbnail専用領域・overlay選択・左上favorite、情報カードの横長2領域と右上favorite、固定幅種類iconと省略、狭幅時にもthumbnailを上書きしないstyle contract、現行status/verification間の5値consistencyもPASS。 |
| standalone PDF | PASS | Windows canonical pathの`\\?\` / `\\?\UNC\`接頭辞を`StorageFile`境界で通常pathへ戻し、Windows.Data.Pdfで実PDFのpage列挙とPNG render、WIC JPEG thumbnail生成を直接検証。1 GiB source、10,000 pages、最大辺16,384 px、120,000,000 pixelsをrender前に制限し、暗号化・破損・access・missingのerror分類、root外symlink拒否、独立した`pdf`種別と画像選択境界を検証した。FT-B21-001はrelease WebView2で日本語名PDFのthumbnailとviewer pageを実画像decodeし、原本差分0でPASS。 |
| file manager | PASS / 製品観測BLOCKED | Windows Rust canonicalでrename、folder作成、copy、move、完全delete、Windows Explorer互換のCF_HDROPとPreferred DropEffectによるcopy/cut round trip、Shell deleteに渡すcanonical pathの正規化、root containment、reparse point・同名衝突・子孫destination拒否を実filesystem上で検証。frontend testでcatalogに加えてfolder treeの右click・Shift+F10・Ctrl+X/C/V、folder cut/copy/paste、drive root paste、右click folderを宛先とするpaste、catalog/treeの同一drive folderへのdrag move、操作後のtree再列挙、rename・delete接続、確認dialog、全画面・slideshow起動を検証した。release製品のnative folder picker、ごみ箱、Explorerとの実paste、アプリ選択は未観測。 |
| EPUB書庫 | PASS | ZIP互換Stored/DeflateのEPUBについて、大文字小文字を無視した分類、自然順画像列挙、catalog、WebP、media token、原本非破壊をWindows Rust canonicalと87-file fixtureで直接検証。HTML本文組版は対象外。 |
| 対応書庫 | PASS | ZIP/CBZ/EPUB、RAR/CBR、7z/CB7、LZHについて、大文字小文字を無視した分類、自然順画像列挙、entry読取、catalog metadata、診断、原本非展開をWindows Rust canonicalで直接検証。ZIP内でCBZ/CB7/LZH/CBRを混在させた多重圧縮の列挙・読取、opaque page key、内側3階層と64書庫の上限も直接検証した。RARは単一volume・非暗号化RAR4/RAR5、7zはCopy/LZMA/LZMA2、LZHはStored/LH1/LH4〜LH7/LZS/LZ5を採用範囲とし、危険path、size/entry/再帰上限、未対応圧縮方式を拒否する。 |
| frontend build/SBOM | PASS | 2026-08-13のWindows frontend buildは66 modulesをbuild、exit 0。SBOMは直近受理済み729 components、unknown/prohibited license 0。UnRAR、`sevenz-rust`、`delharc`を含むnoticeを同期済み。 |
| release executable | PASS / 製品受入部分BLOCKED | 2026-08-14にthumbnail生成中もfolder一覧を待たせないnavigation修正を含むWindows release executableを再buildしexit 0。PE subsystemを修正前の3（Windows CUI）から2（Windows GUI）へ変更したことをbinary headerで直接確認し、release起動時にconsole/terminalを生成しない。debug buildは診断用consoleを維持する。Explorer型address移動、folder直下画像thumbnailとサブfolder画像だけの場合の専用icon fallback、PDF thumbnail・viewer、shortcut、static WebP、search、favorite、tag、memo/history/rating等のaccepted product laneはPASS。animated GIF観測、P5/P6/P8/P10と全外部release gateへ波及しない。 |
| 原本非破壊 | PASS（測定済みlane） | accepted product harnessでlibrary source tree差分0。未実行laneを含む全操作の無条件PASSではない。 |
| 外部通信 | BLOCKED | code/依存境界はlocal-only。VM外部監視による完全観測は未実施。 |
| CoDD | PASS（red 0） | 2026-08-14、scan 4 documents / 58 nodes / 132 edges。check red 0、verify exit 0、DAG red 3 PASS / 0 FAIL、source integrity 13 files。構造的SKIP/VACUOUSとverification-node 0件は機能PASSへ加算しない。 |

## MVP release case summary

| 結果 | 件数 |
| --- | ---: |
| PASS | 60 |
| FAIL | 0 |
| BLOCKED | 12 |
| NOT RUN | 1 |
| **合計** | **73** |

この集計は旧Phase 6結果72件（PASS 60 / FAIL 0 / BLOCKED 12 / NOT RUN 0）に、仕様には存在するが
結果行がなかったTC-NFR-006-001をNOT RUN 1として明示した現在値である。欠落caseをPASSへ推定しない。

## Feature受入要約

- PASS: FR-B01、B02、B03、B05、B06、B07、static WebPのB08、B10、B12、B13〜B16、B19、B21、B23、FR-B11のkeyboard・mouse範囲。
- BLOCKED/PARTIAL: B08のanimated GIF製品観測とAVIF decode、B11の任意軌跡gesture/touch/gamepad、B17、B18、B20、B22の製品表示・native shell観測。
- Windows release WebView2を直接観測したlaneと、Vitest/jsdom・Rust contractだけのlaneを区別する。
- focused testのexcluded-by-pattern、構造的SKIP、vacuous check、advisoryをPASS件数へ加えない。

## BLOCKED / NOT RUN gate

| Gate | 状態 | PASSにしない理由 |
|---|---|---|
| Windows clean VM matrix | BLOCKED | Win10 22H2 / Win11のinstall、offline WebView2、launch、uninstall未実施。 |
| 外部通信監視 | BLOCKED | VM外部からのDNS/TCP/UDP監視が必要。 |
| 製品性能 | BLOCKED | 基準PCのcold TTI、10,000項目、FPS、latency、working set未測定。 |
| accessibility/DPI | BLOCKED | UIA、screen reader、high contrast、100/150/200% DPI未測定。 |
| custom protocol実header | BLOCKED | WebView2が送るOrigin/Refererの実統合trace未採取。 |
| animated GIF / AVIF | BLOCKED | GIFのparser・実decode・thumbnailはPASSだがrelease WebView2のanimation未観測。AVIFの製品decodeは未受入。 |
| P5/P6/P10 product UI | BLOCKED | visual/DPI、tray、file picker、実disk保存/import未測定。 |
| file manager product UI | BLOCKED | release WebView2のcatalog/tree context menuからnative folder picker、ごみ箱、Explorerとの実paste、アプリ選択までの直接観測を未実施。filesystem・CF_HDROP backendとfrontend contractはPASS。 |
| TC-NFR-006-001 | NOT RUN | 仕様にはあるが旧個別結果に収載されていない。 |

## 実行コマンド

Windows filesystem上ではproject rootから次を使用する。Linux `.venv/bin/codd`へ置き換えない。

```powershell
.\scripts\run-codd-windows.ps1 scan
.\scripts\run-codd-windows.ps1 impact
.\scripts\run-codd-windows.ps1 check
.\scripts\run-codd-windows.ps1 verify
.\scripts\run-tests-windows.ps1
.\scripts\run-typecheck-windows.ps1
.\scripts\run-build-windows.ps1
.\scripts\run-product-ui-harness.ps1 -PdfOnly
```

Rustのfeature/canonical laneは該当する`verify-feature-windows.ps1`または
`run-feature-verification-wsl.sh <ID> -RustMode Canonical`を使う。実測環境がない場合は
Linux runnerで代替せず、`BLOCKED`または`NOT RUN`として記録する。

## 文書統合の効果とCoDD結果

| 指標 | 統合前 | 統合後 |
|---|---:|---:|
| CoDD対象frontmatter documents | 49 | 4 |
| CoDD graph nodes | 94 | 49 |
| CoDD graph edges | 197 | 104 |
| Windows-native scan | 1.75秒 | 1.45秒 |
| Windows-native check | 30.58秒 / red 0 / advisory 10 | 11.85秒 / red 0 / advisory 9 |

check時間は同一環境の単回実測で18.73秒（約61%）短縮した。統合後のactive 4文書は459行である。
移動前の`docs/`は49 Markdown / 8,459行、最小化後の作業ツリーは4 current + READMEの5文書だけとし、
削除した詳細資料はGit履歴から参照・復元する。

2026-08-11の最終Windows-native `verify`はexit 0。DAGはred PASS 4 / red FAIL 0 /
amber PASS 1 / amber WARN 3 / VACUOUS 1、artifact contractはopt-inのためSKIP、CoDD verification-node集計は0件である。
一方、設定されたproject test commandはPython 45件とfrontend 205件を実行して全件PASSし、typecheckを実行、source integrityを確認した。
SKIP、VACUOUS、0件のverification-node集計を機能PASSへ読み替えない。

`scan`出力は`Frontmatter: 4 documents in docs\current`であり、他の資料をCoDD対象に含めない。
