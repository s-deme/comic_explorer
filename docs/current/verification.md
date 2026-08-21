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

## Leeyes P2-I ルーペ

対象はLEY-VIEWER-029の1件。既存pointerルーペへ80〜400pxの正方形サイズと125〜800%倍率を追加し、image座標とstage内中心clamp、strict profile v12、SQLite、設定dialog、viewerを接続する。v1〜v11は180px・200%へ移行する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend | PASS | model・Viewer・profile・Appの4 files / 235件、FAIL 0。size/zoom境界、stageより大きいloupeの中央clamp、CSS background寸法・位置、pointer leave、v11 migration、不正値拒否、設定applyを含む。 |
| TypeScript typecheck | PASS | exit 0。 |
| Rust focused | PASS | persisted loupe size/zoomの既定値・正常値・不正値fallback 1件、FAIL 0。 |
| Windows tests / build | PASS | Python 59件、frontend 27 files / 379件、FAIL 0。typecheck exit 0、frontend 68 modules build。bundle 505.07kBでViteの500kB advisoryを1件記録し、機能PASSへ読み替えない。 |
| Rust / release / CoDD | PASS | formal canonical再実行は173.4秒で全12 stageがexit 0。Rust lib 170件 + shutdown process 1件、release executable/freshness、GUI権限付きshortcut product回帰、cleanup audit、CoDD scan/check/verifyを含む。初回は機能外の既存folder thumbnail待機がproduct-shortcutでtimeoutしたが、診断後の同一source再実行は12.7秒で通過した。 |
| 性能・製品直接観測 | NOT RUN | 既存media URIを再利用し追加decode・timerなし。release WebView2の巨大画像、800%、400px時のGPU/描画時間とDPI表示は未測定。 |

## Leeyes P2-J 先読み

対象はLEY-VIEWER-032の1件。既存の固定forward先読みを、進行方向0〜4page・戻り方向0〜4page、16〜512MiBのnative media grant上限へ完成させる。profile v13、SQLite、設定dialog、page/continuous共通window、on-demand visible優先、window外frontend解放、native LRUを接続する。v1〜v12は進行4・戻り0・256MiBへ移行する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend | PASS | model・Viewer・profile・Appの4 files / 239件、FAIL 0。前後window、0page時on-demand visible、window外URI解放、v12 migration、不正値拒否、設定applyを含む。 |
| TypeScript typecheck | PASS | exit 0。 |
| Rust focused | PASS | persisted先読み設定の既定値・正常値・不正値fallbackとbounded media grant LRUの2件、FAIL 0。2,048 grant投入後もtest上限1,024 byte・16件以下を0.04秒内で維持した。 |
| Windows tests / build | PASS | Python 59件、frontend 27 files / 383件、FAIL 0。typecheck exit 0、frontend 68 modules build。bundle 508.55kBでViteの500kB advisoryを1件記録し、機能PASSへ読み替えない。 |
| Rust / release / CoDD | PASS | final formal canonicalは179.9秒で全12 stageがexit 0。Rust lib 172件 + shutdown process 1件、release executable/freshness、GUI権限付きshortcut product回帰11.7秒、cleanup audit、CoDD scan/check/verifyを含む。事前product回帰で`MiB` acronymの自動camelCase差を検出し、明示serde名とJSON往復testを追加した後のrelease直接回帰もPASS。 |
| 性能・製品直接観測 | PARTIAL | synthetic 2,048 grantのbounded testはPASS。release WebView2の巨大画像、256MiB実上限、低速disk/archiveでのpage移動100ms基準、process working setは未測定。 |

## Leeyes P2-K 全画面終了・スクリーンセーバー制御

対象はLEY-VIEWER-033の1件。Escで全画面だけを解除する既存挙動に、全画面を解除してviewerも閉じる選択肢と、全画面中だけWindows display-required要求を保持するopt-inを追加する。profile v14、SQLite、設定dialog、Viewer lifecycle、Windows power requestを接続し、v1〜v13は既存互換の解除のみ・抑止無効へ移行する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend | PASS | fullscreen adapter・Viewer・profile・Appを含む138件、FAIL 0。power要求の取得/解放順、Esc close、取得失敗rollback、v13 migration、不正値拒否、App接続を含む。既存atomic settings長時間testは20秒上限へ実測に合わせ、10.35秒でPASS。 |
| TypeScript typecheck | PASS | Windows runnerと直接実行の双方でexit 0。 |
| Windows tests / build | PASS | Python 59件、frontend 27 files / 389件、FAIL 0。frontend 68 modules build、bundle 511.55kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust / OS power API | PASS | Windows canonicalのlib 173件中、実`PowerCreateRequest`・`PowerSetRequest`・`PowerClearRequest`・`CloseHandle`による取得、重複取得、解放、重複解放を1件で直接実行。shutdown process 1件もPASS。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは250.079秒で全12 stageがexit 0。Rust canonical、release executable/freshness、GUI権限付きshortcut product回帰11.033秒、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・製品直接観測 | PARTIAL | OS requestのdebug test直接実行とrelease buildはPASS。release WebView2で抑止を有効にしたまま実スクリーンセーバー待機・monitor消灯時間を待つ長時間観測、group policy・remote desktop・battery別挙動は未測定。 |

## Leeyes P2-L タスクトレイ

対象はLEY-SHELL-014の1件。既存の手動tray格納と明示Quitに、最小化時の自動格納、閉じる操作のtray格納、single/double click復帰を追加する。profile v15、SQLite、設定dialog、main window event、tray icon eventを接続し、v1〜v14は既存互換の自動格納無効・閉じると終了・single click復帰へ移行する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend | PASS | profile・Appの対象testで、v14 migration、不正値拒否、最小化・close・復帰設定のatomic保存、既存手動格納とQuit回帰を確認。FAIL 0。 |
| TypeScript typecheck | PASS | Windows runnerでexit 0。 |
| Windows tests / build | PASS | Python 59件、frontend 27 files / 391件、FAIL 0。frontend 68 modules build、bundle 513.77kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust lifecycle | PASS | 最小化の設定有無と重複防止、close-to-trayのclose prevent・hide失敗回復、quit設定時の非介入、stored状態と完全一致gestureだけの復帰を4件で確認。canonical lib全件とshutdown process 1件もPASS。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは359.415秒で全12 stageがexit 0。Rust canonical 150.790秒、release executable/freshness、GUI権限付きshortcut product回帰12.839秒、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・製品直接観測 | PARTIAL | event処理にtimer・polling・追加workerは導入していない。release通知領域で実際に最小化・閉じる・single/double click・明示Quitを操作する直接観測、複数monitor/DPI、Explorer再起動後のtray再登録は未測定。 |

## Leeyes P2-M slideshow詳細設定

対象はLEY-VIEWER-008の1件。P2-Aの単一timer slideshowへ0.5〜60秒の間隔、順方向・逆方向・random、現在作品内の反復を追加し、profile v16、SQLite、設定dialog、通常/slideshow起動viewerで共有する。Leeyesのrandom重複規則は未確認のため、page数以下のFisher-Yates shuffle-bagで1 cycle内の重複を防ぐ独自挙動を採用した。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend | PASS | slideshow helper・Viewer・profile・Appの4 files / 229件、FAIL 0。0.5〜60秒境界、v15 migration、不正値拒否、atomic設定、逆順反復、random 1 cycleの全page一意・自動停止を含む。 |
| TypeScript typecheck | PASS | Windows runnerでexit 0。 |
| Windows tests / build | PASS | Python 59件、frontend 28 files / 397件、FAIL 0。frontend 69 modules build、bundle 517.52kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust settings / canonical | PASS | profileの間隔・順序invalid拒否、SQLiteの7.5秒・random・反復保存と再openをfocused 2件で確認。canonical lib 177件とshutdown process 1件、FAIL 0。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは364.735秒で全12 stageがexit 0。Rust canonical 152.466秒、release executable/freshness、GUI権限付きshortcut product回帰13.477秒、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能 | PASS / 限定 | `vite-node`で100,000 pageから現在pageを除くqueueを生成し、99,999件・全件一意・22.315ms。queueはpage数以下、同時timeoutは1件。単回synthetic測定でありrelease WebView2の長時間timer精度やprocess memoryを示さない。 |
| 製品直接観測 | NOT RUN | release WebView2での長時間timer精度、background/focus復帰、実archiveのdecode/prefetch待機、順序・反復全組合せ、長時間memoryは未測定。 |

## Leeyes P2-N 画像clipboard

対象はLEY-VIEWER-011の1件。viewerの現在anchor pageをRust commandへ渡し、folder・archive・PDF・対応画像を既存の読み取り境界でdecodeして、透明度を保持したtop-down 32bpp BGRAの`CF_DIBV5`としてWindows clipboardへ書く。TypeScriptは現在pageの識別、重複操作防止、status表示だけを担う。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend / Rust | PASS | Viewer 51件、Rust `REQ-LEY-P2-014` 3件、FAIL 0。現在anchor、見開き非合成、busy無効化、page変更後の古いstatus抑止、透明PNG→BGRA、top-down DIBV5 header・alpha mask・overflow拒否、実Windows clipboardのCF_DIBV5 availabilityを含む。 |
| Windows tests / typecheck / build | PASS | Python 59件、frontend 28 files / 399件、FAIL 0。typecheck exit 0、frontend 69 modules build、bundle 518.78kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 180件とshutdown process 1件、FAIL 0。既存folder・archive・PDF page読取、resource上限、原本非破壊回帰を含む。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは374.755秒で全12 stageがexit 0。Rust canonical 150.135秒、release executable/freshness、GUI権限付きshortcut product回帰25.245秒、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・上限 | PASS / 限定 | source 256MiB、長辺16,384px、120,000,000 pixels、DIBV5 header込み256MiBの拒否境界とchecked overflowをtestした。decodeとclipboard書込みはblocking workerへ分離する。最大付近の実画像による処理時間・peak working setは未測定。 |
| 製品直接観測 | NOT RUN | release WebView2 toolbarからの実操作、Explorer・Paint等の他appへの透明画像貼り付け、animated形式、archive・PDF全形式、clipboard競合中の再試行は未測定。 |

## Leeyes P2-O 一覧選択同期

対象はLEY-VIEWER-012の1件。Viewerのanchor page変化を、現行session・generation・読み込み済みvisible catalogが一致する場合だけ単一selectionへ反映する。画像folderはpage path、archive・PDF・comic folderと次巻・前巻はitem keyを使い、設定無効または不可視候補では既存selectionを保持する。設定はprofile v17とSQLiteへatomic保存する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend / Rust | PASS | App 92件、profile 91件、selection resolver 3件、client contract 1件、Rust settings 2件、FAIL 0。画像page、同期無効、次巻item、v16 migration、不正boolean、SQLite false再open、必須payloadを含む。 |
| Windows tests / typecheck / build | PASS | 最終sourceを含むcanonical CoDD verifyでPython 59件とfrontend 30 files / 408件、FAIL 0。typecheck exit 0。frontend 70 modules build、bundle 520.23kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 180件とshutdown process 1件、FAIL 0。設定transaction、既存catalog・viewer境界の回帰を含む。 |
| Formal canonical / release / CoDD | PASS | 初回canonicalはproduct-shortcutで新設定fieldのfrontend payload欠落を検出してFAIL。fieldとclient contract test追加後の再実行は258.865秒で全12 stageがexit 0。Rust 45.647秒、release executable/freshness、GUI権限付きshortcut product回帰11.670秒、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能 | PASS / 限定 | visible pathのSetはcatalog変更時だけ構築し、page移動ごとは現在pageとitem keyの最大2 indexed lookupであることをspy testで確認。追加I/O、polling、page数比例stateはない。release 10,000項目での復帰scroll時間・frame timeは未測定。 |
| 製品直接観測 | NOT RUN | release WebView2で画像folderの連続page移動後に一覧へ戻る操作、10,000項目virtual catalogのscroll復帰、検索・mask中の不可視候補、次巻・前巻の選択表示は未測定。 |

## Leeyes P2-P 回転・反転

対象はLEY-VIEWER-030の1件。現在anchor pageだけに時計回り90度、screen軸の左右・上下反転、resetを適用する。状態はViewer session内のpage別疎Mapに限定し、回転後寸法をauto spreadとfitへ渡す。main imageとloupe surfaceへ同じCSS transformを適用する一方、原画像、Rust decode、media URI、cache、clipboard、読書位置、gridは変更しない。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend | PASS | transform helper 3件とViewer 54件、計57件、FAIL 0。4回転・reset、screen軸flip、原URI不変、anchor限定、page別保持、入力control抑止、回転後spread判定、loupe transformを含む。 |
| TypeScript typecheck | PASS | `tsc --noEmit` exit 0。 |
| Windows tests / build | PASS | Python 59件、frontend 31 files / 414件、FAIL 0。typecheck exit 0。frontend 71 modules build、bundle 523.53kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 180件とshutdown process 1件、FAIL 0。Rust sourceは変更せず、既存decode・media・cache・clipboard境界の全体回帰を確認した。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは260.839秒で全12 stageがexit 0。Rust 43.934秒、release executable/freshness、GUI権限付きshortcut product回帰11.073秒、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能 | PASS / 限定 | 非identity pageだけをMapへ保持し、現在pageの参照・更新はO(1)。操作ごとのcanvas decode、native I/O、timer、原画像copyはない。大量pageを実際に変換したrelease process memory・GPU frame timeは未測定。 |
| 製品直接観測 | NOT RUN | release WebView2の実画像、見開き、縦横scroll、fit各mode、loupe、DPI別表示、GPU描画、keyboard layout差は未測定。 |

## Leeyes P3-A wildcard論理検索

対象はLEY-SEARCH-003の1件。Rust search portでplain部分一致と、wildcard・quoted literal・escape・NOT/AND/OR・括弧をfilesystem走査前にparseし、basenameだけへ短絡評価する。frontendは構文例と安全なparser errorだけを表示する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust / frontend | PASS | Rust parser 3件、実filesystem・既存option統合1件、frontend構文案内/error 1件、FAIL 0。plain互換、case・全半角英数、wildcard、escape、quoted operator、優先順位、invalid、1024文字、128 token、16階層を含む。 |
| TypeScript typecheck | PASS | `tsc --noEmit` exit 0。 |
| Windows tests / build | PASS | frontend 31 files / 415件とPython 59件、FAIL 0。typecheck exit 0。frontend 71 modules build、bundle 523.86kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 185件とshutdown process 1件、FAIL 0。parser、実filesystem、既存catalog・viewer・file操作境界の全体回帰を含む。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは368.632秒で全12 stageがexit 0。Rust canonical 148.831秒、release executable 78.781秒、GUI権限付きshortcut product回帰14.009秒、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・上限 | PASS / 限定 | parserは1024文字・128 token・括弧16階層で拒否し、matcherはregex engineを使わず短絡評価する。synthetic 10,000 basenameをdebug testで83.403ms（gate 2秒未満）。release filesystemの10,000実file、最大basename、worst-case wildcard、wall-clock・working setは未測定。 |
| 製品直接観測 | NOT RUN | release WebView2での日本語・全角・quoted/escaped入力、keyboard layout、検索cancel、removable/slow diskは未測定。 |

## Leeyes P3-B Rust共通ファイルマスク

対象はLEY-CATALOG-006の1件。現在catalogのbasenameだけをRustへbatch送信し、P3-Aと同じbounded parser・matcherの位置対応結果で表示集合を更新する。frontendの旧regex matcherは削除した。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | parser/semicolon互換1件、batch port・上限・性能1件、FAIL 0。論理式、quoted/escaped semicolon、空mask、invalid、100,000件上限、不正basenameを含む。 |
| Focused frontend / typecheck | PASS | App 93件 + client contract 2件、FAIL 0。draft/適用、Rust batch payload、invalid時の最終valid表示保持、安全なerror、解除を含む。`tsc --noEmit` exit 0。 |
| Windows tests / build | PASS | frontend 31 files / 415件とPython 59件、FAIL 0。typecheck exit 0。frontend 71 modules build、bundle 525.30kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 187件とshutdown process 1件、FAIL 0。共通parser、batch port、既存search・catalog・viewer・file操作境界の全体回帰を含む。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは375.468秒で全12 stageがexit 0。Rust canonical 155.601秒、release executable 79.454秒、GUI権限付きshortcut product回帰11.791秒、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・上限 | PASS / 限定 | synthetic 10,000 basenameのRust batch評価84.896ms（gate 2秒未満）。100,000件・mask/basename 1024文字・128 token・16階層を自動検証。release WebView2 IPC、100,000件のserialization/working set、最大basename、worst-case wildcardは未測定。 |
| 製品直接観測 | NOT RUN | release WebView2での入力、Enter/適用/解除、navigation中のstale応答、IME・keyboard layout、100,000件catalogは未測定。 |

## Leeyes P3-C mask詳細条件・保存

対象はLEY-CATALOG-007の1件。名前式と種別・size・local calendar日付を同じRust batchでAND評価し、名前付き条件はapp-local SQLite schema v6へ保存する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust / SQLite | PASS | 複合評価・範囲拒否1件、32件上限・同名置換・更新順・再open・削除・schema v6確認1件、FAIL 0。欠落metadata、終了日半開境界、invalid name/expression/optionsを含む。 |
| Focused frontend / typecheck | PASS | AppのREQ-LEY-P3-002/003 2件とclient contract 2件、FAIL 0。詳細draft、保存条件復元、適用、同名置換、対象名付き削除確認、Rust payloadを含む。`tsc --noEmit` exit 0。 |
| Windows tests / build | PASS | frontend 31 files / 417件とPython 59件、FAIL 0。typecheck exit 0。frontend 71 modules build、bundle 531.92kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 189件とshutdown process 1件、FAIL 0。schema v1〜v6移行、SQLite再open、複合mask、既存search・catalog・viewer・file操作境界の全体回帰を含む。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは377.157秒で全12 stageがexit 0。Rust canonical 153.135秒、release executable 78.842秒、GUI権限付きshortcut product回帰14.952秒、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・上限 | PASS / 限定 | 名前式・種別・size・日付を組み合わせたsynthetic 10,000項目をdebug testで104.382ms（gate 2秒未満）。100,000件batch、保存32件、名前64文字を制限。release WebView2の100,000件serialization/working setとSQLite同時利用は未測定。 |
| 製品直接観測 | NOT RUN | release WebView2でのlocal timezone/DST別日付、再起動後復元、32件管理、保存・置換・削除、100,000件catalogは未測定。 |

## Leeyes P3-D/E 複数source・複数場所検索

対象はLEY-SEARCH-001/002の2件。pickerでRustが承認したsession sourceだけを既存Rust search portで横断し、canonical itemをsource入力順で重複排除する。frontendはsource選択と結果navigationだけを担当する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | 2件、FAIL 0。3 source、重なり、入力順優先、別source同一relative path、未承認path、8件上限、50,000結果上限、missing、cancelを含む。 |
| Focused frontend / typecheck | PASS | App 95件とclient contract 4件、FAIL 0。picker cancel既定、source追加、複数source payload、固定folder無効化、source別同名結果、別source root登録と親folder選択を含む。`tsc --noEmit` exit 0。 |
| Windows tests / build | PASS | frontend 31 files / 419件とPython 59件、FAIL 0。typecheck exit 0。frontend 71 modules build、bundle 533.96kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 191件とshutdown process 1件、FAIL 0。複数source・allowlist・上限に加え、既存search・catalog・viewer・file操作・SQLite境界の全体回帰を含む。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは378.891秒で全12 stageがexit 0。Rust canonical 152.594秒、release executable 80.549秒、GUI権限付きshortcut product回帰13.503秒、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・上限 | PASS / 限定 | 最大8 sourceと合計50,000結果をRust境界で自動検証。複数source走査の基準PC時間、slow/removable drive、50,000実fileのwall-clockとworking setは未測定。 |
| 製品直接観測 | NOT RUN | release WebView2のfolder picker、cancel、network/removable folder、access変化、結果source表示と移動は未測定。 |

## Leeyes P3-F 現在folder自動更新

対象はLEY-FILER-010の1件。Rust OS watcherを表示中folderへ1件だけ設定し、bounded coalescing後の一致eventを既存catalog再走査へ接続する。設定はstrict profile v18とapp-local SQLiteへ保存する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust / filesystem | PASS | 2件、FAIL 0。実temp folderの100 file burst、rename、delete、watcher drop後の通知停止、250ms coalescing、canonical nested folder、parent traversal拒否、missing/file拒否を含む。 |
| Focused frontend / profile / typecheck | PASS | App 96件、client 5件、profile 92件、計193件、FAIL 0。current/stale/別path event、残存selection、設定無効化、typed event/command、v17→v18移行を含む。`tsc --noEmit` exit 0。 |
| Windows tests / build | PASS | frontend 31 files / 422件とPython 59件、FAIL 0。typecheck exit 0。frontend 71 modules build、bundle 536.39kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 193件とshutdown process 1件、FAIL 0。watcher lifecycle、設定永続、既存search・catalog・viewer・file操作・SQLite境界の全体回帰を含む。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは391.090秒で全12 stageがexit 0。Rust canonical 157.382秒、release executable 86.151秒、GUI権限付きshortcut product回帰15.177秒、SBOM/third-party notice、cleanup audit、CoDD scan/check/verifyを含む。 |
| 性能・上限 | PASS / 限定 | 実100-event burstを250ms windowで1通知へcoalesceし、watcherを常に最大1件とするtestはPASS。10,000-event burst、network/removable drive、基準PCの反映時間・CPU・working setは未測定。 |
| 製品直接観測 | NOT RUN | release WebView2で外部Explorerからの作成・rename・削除、設定切替、watch error表示、F5 fallbackは未測定。 |

## Leeyes P3-G tree詳細動作

対象はLEY-FILER-015の1件。Rustがdirect child folderとleaf/branchをroot-containedに判定し、frontendはleaf expander、自動折畳み、boundedなtree幅を提供する。設定はstrict profile v19とapp-local SQLiteへ保存し、書庫treeはP4へ分離する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust / filesystem | PASS | 2件、FAIL 0。direct childだけのleaf/branch、hidden child、missing、下位確認無効時のnullable結果、10,000直下folderを実filesystemで検証。 |
| Focused frontend / profile | PASS | FolderTree 13件、profile 95件、client 6件、App 96件、計210件、FAIL 0。leaf expander、自動折畳み、pointer/keyboardの180〜480px clamp、v18→v19移行、Rust payloadを含む。 |
| Windows tests / build | PASS | frontend 31 files / 427件とPython 59件、FAIL 0。typecheck exit 0。frontend 71 modules build、bundle 539.48kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 195件とshutdown process 1件、FAIL 0。tree列挙、設定永続、watcher、既存search・catalog・viewer・file操作・SQLite境界の全体回帰を含む。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは288.539秒で全12 stageがexit 0。Rust canonical 63.276秒、release executable 79.978秒、GUI権限付きshortcut product回帰11.124秒、cleanup audit、CoDD scan/check/verifyを含む。初回product gateは確認不能なdrive直下folderで親tree全体が停止する不足を検出し、そのnodeだけnullable未確認へfallback後に再実行した。 |
| 性能・上限 | PASS / 限定 | Windows実filesystemの10,000直下folderを下位確認有効で2,900.692ms。test全体は作成・列挙・削除を含め16.75秒、60秒runaway上限内。CPU、peak working set、remote/removable driveは未測定。 |
| 製品直接観測 | PASS / 限定 | release WebView2のproduct shortcutでdrive rootから深いharness folderまでcurrent ancestor treeを復元し、全127 catalog項目とshortcut操作を確認。設定dialogの各toggle、DPI別splitter drag、access変化は未測定。 |

## Leeyes P3-H open規則

対象はLEY-FILER-017の1件。double click、Enter、Ctrl+EnterをTypeScriptからRust resolverへ渡し、保存済みのfolder・画像・書庫/PDF規則とtyped kindに基づく`navigate`/`read`/`none`だけを既存portへdispatchする。strict profile v20とSQLiteへ保存し、v1〜v19へ現行互換の既定値を補う。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | 1件、FAIL 0。全kindの既定、folder read/none、画像・書庫/PDF none、Ctrl+Enter強制読書、folder抑止、不正trigger拒否を純粋Rust判定で検証。 |
| Windows tests / typecheck / build | PASS | frontend 31 files / 431件とPython 59件、FAIL 0。gesture、none、stale/error、設定UI、profile v19→v20移行、Rust payloadを含む。typecheck exit 0、frontend 71 modules build。bundle 542.58kBの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 196件とshutdown process 1件、FAIL 0。resolver、SQLite再open、既存catalog・viewer・file操作・search・watch・tree境界の全体回帰を含む。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは406.295秒で全12 stageがexit 0。Rust canonical 173.494秒、release executable 80.460秒、GUI権限付きshortcut product回帰15.095秒、cleanup audit、CoDD scan/check/verifyを含む。log rootは`src-tauri/target/verification/imp-004-20260821T034701763Z`。 |
| 性能・上限 | NOT RUN | resolverはSQLiteの3 enum読取とkind table判定だけで追加filesystem走査を行わないが、基準PCのactivation latency、連続入力、working setは未測定でありPASSとしない。 |
| 製品直接観測 | NOT RUN | product shortcutは全体回帰としてPASSしたが、P3-H固有のrelease WebView2実double click、Enter/Ctrl+Enter、IME、設定変更、removable driveは直接観測していない。 |

## Leeyes P3-I 詳細一覧書式

対象はLEY-FILER-019の1件。詳細一覧の罫線、行密度、任意列をstrict profile v21とSQLiteへ保存し、header・rowの共有列template、狭幅縮退、accessible name、virtualizationを維持する。描画調整はCSSとvirtualizer測定だけで、filesystem、metadata、cache、他4一覧形式を変更しない。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused frontend / CSS | PASS | CatalogGrid、profile、client、Appの4 files / 245件と`test_ui_styles.py` 19件、FAIL 0。3罫線mode、3密度、列の組合せ、v20→v21移行、不正値拒否、設定payloadを含む。10,000 synthetic項目をdetail・縦横罫線・comfortable・任意列非表示で描画してmounted rowを100以下に維持した。 |
| Focused Rust / typecheck | PASS | 設定の既定、不正enum fallback/import拒否、boolean保持、SQLite再openを含む3件、FAIL 0。`cargo check --locked`とTypeScript typecheckはexit 0。既存dead-code warningをPASSへ加算しない。 |
| Windows tests / build | PASS | frontend 31 files / 435件とPython 60件、FAIL 0。frontend 71 modules build、CSS 42.26kB、JS 547.49kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 197件とshutdown process 1件、FAIL 0。profile/SQLiteと既存catalog・viewer・file操作・search・watch・tree境界の全体回帰を含む。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは407.826秒で全12 stageがexit 0。Rust canonical 168.964秒、release executable 82.799秒、GUI権限付きshortcut product回帰13.118秒、cleanup audit、CoDD scan/check/verifyを含む。log rootは`src-tauri/target/verification/imp-004-20260821T041046393Z`。 |
| 性能・上限 | PASS / 限定 | 10,000 synthetic項目でDOM上限を検証し、設定による全件DOM展開がないことを確認した。release WebView2の10,000実項目FPS、layout時間、CPU、peak working setは未測定でありPASSとしない。 |
| 製品直接観測 | NOT RUN | product shortcutは全体回帰としてPASSしたが、P3-I固有の罫線、密度、列切替、DPI、high contrast、font scalingはrelease WebView2で直接観測していない。 |

## Leeyes P3-J 再帰サムネイル一括生成

対象はLEY-CATALOG-016の1件。サムネイル管理で現在folder以下またはlibrary全体を明示選択し、Rustが全候補を安全上限内で列挙してから、既存bounded workerと同じcache pipelineへbackground priorityで逐次投入する。TypeScriptは範囲payload、generation付きprogress/result、二重開始防止、cancel表示だけを担当し、filesystem走査・対象判定・cache生成は行わない。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | REQ-LEY-P3-009の5件、FAIL 0。自然順、hidden、unsupported/空folder除外、missing、depth 64、候補10,000上限、事前cancel、新規/cache hit/失敗継続、shutdown cancel、共有pipeline実生成を含む。 |
| Focused frontend / CSS | PASS | clientとAppの2 files / 107件、`test_ui_styles.py` 20件、FAIL 0。current/library範囲、上限preview、generation付きprogress、二重開始防止、cancel、stale event破棄、typed command/eventを含む。 |
| Windows tests / typecheck / build | PASS | frontend 31 files / 437件とPython 61件、FAIL 0。初回全体回帰でApp.fr-b09/b10の新listener mock漏れ10件を検出しfixture修正後に再実行した。typecheck exit 0。frontend 71 modules build、CSS 42.73kB、JS 550.78kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 203件とshutdown process 1件、FAIL 0。再帰列挙、coordinator、共有thumbnail pipeline、SQLite/cacheと既存catalog・viewer・file操作・search・watch・tree境界の全体回帰を含む。 |
| Formal canonical / release / CoDD | PASS | 性能test追加後の最終sourceに対する`IMP-004` canonicalは408.559秒で全12 stageがexit 0。Rust canonical 167.572秒、release executable 82.412秒、GUI権限付きshortcut product回帰11.444秒、cleanup audit、CoDD scan/check/verifyを含む。log rootは`src-tauri/target/verification/imp-004-20260821T045756238Z`。 |
| 性能・上限 | PASS / 限定 | Windows実filesystem上で5,000 folderと各1画像から10,000候補を2.2759029秒で列挙し、10,001候補を`RESOURCE_LIMIT`で拒否した。既存共有pipelineによる実folder・画像・CBZの3件生成は104.6683ms。focused 5件全体はfixture作成・列挙・上限再走査・削除を含め14.01秒。releaseの10,000実画像、巨大画像、書庫/PDF混在、slow/removable drive、CPU、peak working set、cache eviction時間は未測定でありPASSとしない。 |
| 製品直接観測 | NOT RUN | product shortcutは全体回帰としてPASSしたが、P3-J固有のrelease WebView2範囲選択、長時間progress、実cancel、root変更、cache再利用は直接観測していない。 |

## Leeyes P3-K ドラッグ＆ドロップ

対象はLEY-FILE-020の1件。library内では明示folder targetへの既定move・Ctrl copyを既存Rust file-operation境界へ渡す。ExplorerからのdropはRustが最大256件をpreview・再検証して確認後にcopyし、Alt+dragの外向き操作はRustがWindows Shell `IDataObject`を構築してcopy effectだけで開始する。TypeScriptはphysical座標からCSS targetへの変換、修飾key、確認dialog、root変更時のstale preview破棄だけを担当する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | REQ-LEY-P3-010の4件、FAIL 0。file/folder preview・copyと原本保持、相対path・重複・257件・上限・stale missing・reparse拒否、実Shell data objectのCF_HDROP公開を含む。 |
| Focused frontend | PASS | native座標、client、CatalogGrid、FolderTree、Appで既定move、Ctrl copy、Alt drag-out、inbound preview・確認、cancel、root変更時無効化を検証し、FAIL 0。 |
| Windows tests / typecheck / build | PASS | frontend 32 files / 442件とPython 61件、FAIL 0。typecheck exit 0。frontend 73 modules build、CSS 42.82kB、JS 558.25kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 207件とshutdown process 1件、FAIL 0。Shell payload、file操作と既存catalog・viewer・search・watch・tree・SQLite/cache境界の全体回帰を含む。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは310.966秒で全12 stageがexit 0。Rust canonical 69.270秒、release executable 83.971秒、GUI権限付きshortcut product回帰12.182秒、CoDD verify 103.587秒を含む。log rootは`src-tauri/target/verification/imp-004-20260821T055624203Z`。初回は既存FT-B14-001の1秒待機flakeを検出し、10秒待機へ安定化して単独10/10 PASS後に最終全体を再実行した。 |
| 性能・上限 | PASS / 限定 | 256 source上限と257件拒否は自動検証した。実Explorer、network/removable drive、大量・大容量copyの時間、CPU、peak working setは未測定でありPASSとしない。 |
| 製品直接観測 | NOT RUN | Explorerとの実drag in/out、100/150/200% DPI、Shell cursor/effect表示、長時間copy中の製品UIは直接観測していない。 |

## Leeyes P3-L 複数キー割当

対象はLEY-INPUT-001の1件。各既知commandへ1〜4個の順序付きbindingを割り当て、Rust registryが形、key、件数、重複、競合、予約操作を保存前に検証してSQLiteへ配列でatomic保存する。TypeScriptは検証済み配列の即時dispatch、追加・編集・削除UI、reset、help表示だけを担当する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | 3件、FAIL 0。1〜4件、command内重複、command間競合、予約、空、5件上限、legacy command補完、旧SQLite単一文字列から配列への移行、複数binding保存・再openを含む。 |
| Focused frontend | PASS | shortcuts、profile、help、App FR-B11の4 files / 110件、FAIL 0。alternate追加・dispatch・編集・削除・保存、primary互換、競合・予約拒否、reset、v21→v22移行、v22単一文字列拒否、helpの全binding表示を含む。 |
| Windows tests / typecheck / build | PASS | frontend 32 files / 444件とPython 61件、FAIL 0。typecheck exit 0。frontend 73 modules build、CSS 43.17kB、JS 559.71kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 208件とshutdown process 1件、FAIL 0。shortcut registry・SQLite移行と既存catalog・viewer・file操作・search・watch・tree・cache境界の全体回帰を含む。既存dead-code warning 2件をPASSへ加算しない。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは325.978秒で全12 stageがexit 0。Rust canonical 67.745秒、release executable 85.210秒、GUI権限付きshortcut product回帰11.232秒、CoDD verify 116.396秒を含む。log rootは`src-tauri/target/verification/imp-004-20260821T062502633Z`。 |
| 性能 | NOT APPLICABLE / 限定 | registryは16 command×最大4 bindingに固定され、filesystem・画像・書庫処理を追加しないため専用throughput測定対象外。設定dialogの既存統合testは複数control追加後21.469秒で完了し、timeoutを40秒へ調整した。release UIの入力latency、CPU、working setは未測定。 |
| 製品直接観測 | PASS / 限定 | GUI権限付きproduct shortcut回帰はprimary bindingのremap、競合、viewer command、reset、restart復元と原本差分0を11.232秒で確認した。alternate追加・削除、keyboard layout、IME、AltGr、DPIはrelease WebView2で直接観測していない。 |

## Leeyes P3-M キースクロール設定

対象はLEY-INPUT-005の1件。Rustが移動量、100〜300%のrepeat加速率、連続動作booleanをstrict profile v23とSQLiteへ保存し、TypeScriptはpaged Viewerのfocus安全なkeyboard event、4方向overflow、既存page commandへのdispatchだけを担当する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | REQ-LEY-P3-012の2件、FAIL 0。既定150%・連続有効、100〜300%境界、不正値fallback、220%・連続無効のSQLite再openを含む。 |
| Focused frontend | PASS | model、Viewer、profile、client、Appの5 files / 289件、FAIL 0。4方向、端でのpage移動、repeat加速・抑止、smooth/reduced-motion、focus・IME保護、v22→v23移行、不正値拒否、Rust payloadを含む。 |
| Windows tests / typecheck / build | PASS | frontend 32 files / 449件とPython 61件、FAIL 0。typecheck exit 0。frontend 73 modules build、CSS 43.17kB、JS 563.32kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 208件とshutdown process 1件、FAIL 0。設定validation・SQLite再openと既存catalog、viewer、file操作、search、watch、tree、cache境界の全体回帰を含む。既存dead-code warning 2件をPASSへ加算しない。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは439.245秒で全12 stageがexit 0。Rust canonical 180.811秒、release executable 85.443秒、GUI権限付きshortcut product回帰12.395秒、CoDD verify 117.303秒を含む。log rootは`src-tauri/target/verification/imp-004-20260821T065813069Z`。 |
| 性能 | NOT APPLICABLE / 限定 | 4方向target計算は固定個数の算術と単一`scrollTo`で、filesystem・画像decode・書庫・cache処理を追加しないため専用throughput測定対象外。releaseのkey-to-scroll latency、CPU、working setは未測定。 |
| 製品直接観測 | NOT RUN | product shortcutは全体回帰としてPASSしたが、P3-M固有の実keyboard repeat rate、IME、keyboard layout、smooth scroll、DPIはrelease WebView2で直接観測していない。 |

## Leeyes P3-N 一覧マウス割当

対象はLEY-INPUT-006の1件。Rustがprimary、double、middle、back、forwardの完全なgesture集合と安全な既知actionをstrict profile v24とSQLiteで検証・保存し、TypeScriptはWebView mouse event、primary/double分離timer、設定draft、既存handlerへのdispatchだけを担当する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | REQ-LEY-P3-013の2件、FAIL 0。既定値、完全shape、未知gesture/action拒否、custom割当のSQLite再open、profile atomic validationを含む。 |
| Focused frontend | PASS | catalog-mouse、CatalogGrid、profile、client、Appの5 files / 259件、FAIL 0。single/double分離、middle/back/forward、複数選択・context・drag保護、open/navigation/search/refresh、timer cleanup、v23→v24移行と不正値拒否を含む。 |
| Windows tests / typecheck / build | PASS | frontend 33 files / 456件とPython 61件、FAIL 0。typecheck exit 0。frontend 74 modules build、CSS 43.17kB、JS 566.76kB。Viteの500kB advisoryを機能PASSへ読み替えない。並行実行時に既存FT-B14-001が1回timeoutしたが、単独と負荷を分離した全体再実行はPASSした。 |
| Rust canonical | PASS | lib 208件とshutdown process 1件、FAIL 0。catalog mouse registry・SQLite/profile再openと既存catalog、viewer、file操作、search、watch、tree、cache境界の全体回帰を含む。既存dead-code warning 2件をPASSへ加算しない。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは491.928秒で全12 stageがexit 0。Rust canonical 179.052秒、release executable 124.671秒、GUI権限付きshortcut product回帰12.986秒、CoDD verify 121.877秒を含む。log rootは`src-tauri/target/verification/imp-004-20260821T073845748Z`。 |
| 性能 | NOT APPLICABLE / 限定 | registryは5 gesture、dispatchは1 eventにつき固定個数の分岐、primary判定timerは最大1件に固定され、filesystem・画像decode・書庫・cache処理を追加しないため専用throughput測定対象外。releaseのinput latency、CPU、working setは未測定。 |
| 製品直接観測 | NOT RUN | canonicalのproduct shortcut回帰はPASSしたが、P3-N固有の実double-click interval、button 3/4、touchpad、DPI、設定UI操作はrelease WebView2で直接観測していない。 |

## Leeyes P3-O 4象限クリック

対象はLEY-INPUT-008の1件。RustがViewerの4象限完全shapeと安全な既知actionをstrict profile v25・SQLiteで検証・保存し、TypeScriptはWebView stage座標、mouse/pan境界、250ms timer、既存Viewer commandへのdispatchだけを担当する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | REQ-LEY-P3-014の2件、FAIL 0。既定値、完全shape、未知象限/action拒否、custom割当のSQLite再open、profile atomic validationを含む。 |
| Focused frontend | PASS | viewer-quadrants、Viewer、profile、client、Appの5 files / 275件、FAIL 0。4象限と中央境界、single/double分離、pan・touch・pen・modifier保護、拡大画像click、timer cleanup、action routing、v24→v25移行と不正値拒否を含む。 |
| Windows tests / typecheck / build | PASS | frontend 34 files / 463件とPython 61件、FAIL 0。typecheck exit 0。frontend 75 modules build、CSS 43.17kB、JS 569.60kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 208件とshutdown process 1件、FAIL 0。quadrant registry・SQLite/profile再openと既存catalog、viewer、file操作、search、watch、tree、cache境界の全体回帰を含む。既存dead-code warning 2件をPASSへ加算しない。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは337.970秒で全12 stageがexit 0。Rust canonical 70.349秒、release executable 85.244秒、GUI権限付きshortcut product回帰13.841秒、CoDD verify 123.765秒を含む。log rootは`src-tauri/target/verification/imp-004-20260821T083122335Z`。これ以前の1回は最終CoDD verify内のtest commandだけがexit 1となったが、同commandを直後に単独実行してfrontend 463件・Python 61件PASSを確認し、source変更なしの全12 stage再実行もPASSした。その後の連続layout除外追加に対しても上記最終canonicalを全stage再実行した。 |
| 性能 | NOT APPLICABLE / 限定 | 象限判定は4領域への固定個数の比較、待機timerは最大1件で、filesystem・画像decode・書庫・cache処理を追加しないため専用throughput測定対象外。releaseのinput latency、CPU、working setは未測定。 |
| 製品直接観測 | NOT RUN | canonicalのproduct shortcut回帰はPASSしたが、P3-O固有の実double-click interval、touchpad、pen、DPI、設定UI操作はrelease WebView2で直接観測していない。 |

## Leeyes P3-P 右クリック割当

対象はLEY-INPUT-009の1件。Rustが`none`を含む安全な既知Viewer actionをstrict profile v26・SQLiteで検証・保存し、TypeScriptはWebView right-button event、4px移動境界、right-wheel取消、既存Viewer commandへのdispatchだけを担当する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | REQ-LEY-P3-015の2件、FAIL 0。既定`none`、既知・未知action、custom割当のSQLite再open、profile atomic validationを含む。 |
| Focused frontend | PASS | Viewer、profile、client、Appの4 files / 276件、FAIL 0。single dispatch、全3 layout、4px以上の往復移動、touch・pen・modifier・cancel・blur保護、right-wheel優先、context menu抑止、v25→v26移行、Rust復元値のApp接続を含む。 |
| Windows tests / typecheck / build | PASS | frontend 34 files / 466件とPython 61件、FAIL 0。typecheck exit 0。frontend 75 modules build、CSS 43.17kB、JS 571.29kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 208件とshutdown process 1件、FAIL 0。right-click action registry・SQLite/profile再openと既存catalog、viewer、file操作、search、watch、tree、cache境界の全体回帰を含む。既存dead-code warning 2件をPASSへ加算しない。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後の`IMP-004` canonicalは253.511秒で全12 stageがexit 0。Rust canonical 67.471秒、release executable freshness 1.411秒、GUI権限付きshortcut product回帰10.013秒、CoDD verify 130.690秒を含む。log rootは`src-tauri/target/verification/imp-004-20260821T090609098Z`。これ以前の1回は最終CoDD verify内のtest commandだけがexit 1となったが、直後の単独full Windows test 466+61件、単独CoDD verify、source変更なしの全12 stage再実行がすべてPASSした。 |
| 性能 | NOT APPLICABLE / 限定 | right-click判定は1 pointerの固定個数比較でtimer・filesystem・画像decode・書庫・cache処理を追加しないため専用throughput測定対象外。releaseのinput latency、CPU、working setは未測定。 |
| 製品直接観測 | NOT RUN | canonicalのproduct shortcut回帰はPASSしたが、P3-P固有の実right-click event順序、touchpad、多ボタンmouse、DPI、設定UI操作はrelease WebView2で直接観測していない。 |

## Leeyes P3-Q ドラッグ矩形ズーム

対象はLEY-INPUT-013の1件。Rustのresolve_viewer_rectangle_zoomがviewport・selection・scroll・現在倍率の検証、1〜800%倍率と中心scroll位置の計算を担当し、TypeScriptはWebView pointer capture・clamp・overlay・DOM適用だけを担当する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | REQ-LEY-P3-016の1件、FAIL 0。倍率・中心scroll計算、800% clamp、12px未満、viewport外、32768px超過、負scroll、NaN拒否を含む。 |
| Focused frontend | PASS | Viewerとclientの2 files / 77件、FAIL 0。toolbar toggle、pointer capture、stage clamp、overlay、Rust payload/plan適用、全3 layout保護、小矩形、pan・象限・right/middle/side・wheel・touch・pen・modifier競合、Escape・cancel・layout cleanup、stale/error応答を含む。 |
| Windows tests / typecheck / build | PASS | frontend 34 files / 470件とPython 61件、FAIL 0。typecheck exit 0。frontend 75 modules build、CSS 43.49kB、JS 574.80kB。Viteの500kB advisoryを機能PASSへ読み替えない。SBOM 746 components、unknown/prohibited license 0。 |
| Rust canonical | PASS | lib 209件とshutdown process 1件、FAIL 0。rectangle zoom計算・IPC commandと既存catalog、viewer、file操作、search、watch、tree、cache境界の全体回帰を含む。既存dead-code warning 2件をPASSへ加算しない。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後のIMP-004 canonicalは255.292秒で全12 stageがexit 0。Rust canonical 69.144秒、release executable freshness 1.474秒、GUI権限付きshortcut product回帰10.277秒、CoDD verify 129.171秒を含む。log rootはsrc-tauri/target/verification/imp-004-20260821T093525065Z。これ以前の1回は既存folder thumbnail待機だけがtimeoutしたが、単独product shortcutは9.3秒・原本差分0でPASSし、source変更なしの全12 stage再実行もPASSした。 |
| 性能 | NOT APPLICABLE / 限定 | pointer moveは1矩形の固定個数stateだけを更新し、Rust計算は固定個数の比較・乗除算と1回のIPC。filesystem・画像decode・書庫・cache処理を追加しないため専用throughput測定対象外。releaseのinput/zoom latency、CPU、working setは未測定。 |
| 製品直接観測 | NOT RUN | canonicalのproduct shortcut回帰はPASSしたが、P3-Q固有の実pointer capture、selection overlay、DPI、高倍率画像はrelease WebView2で直接操作・観測していない。Leeyes 2.6.1の現行起動gestureは監査資料上Unverifiedのままである。 |

## Leeyes P3-R 外部アプリ登録・安全起動・履歴

対象はLEY-FILE-005/006/007の3件。RustがWindows native picker由来`.exe`のallowlist、SQLite schema v7、canonical identity再検証、library containment、個別引数のlaunch plan、確認preview、path・引数を含まないbounded履歴を担当する。TypeScriptは登録・編集draft、catalog選択、確認dialog、Tauri orchestrationだけを担当する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | REQ-LEY-P3-017の2件、FAIL 0。schema v7移行・再open、登録16件・履歴20件上限、履歴column privacy、canonical executable、root包含、literal個別引数、入力上限、opaque preview keyを含む。 |
| Focused frontend | PASS | ExternalAppDialog、CatalogContextMenu、clientの3 files / 20件、FAIL 0。構造化IPC、登録draft、複数選択preview、二段階確認、既存Windows chooserのmenu併存を含む。 |
| Windows tests / typecheck / build | PASS | frontend 35 files / 473件とPython 61件、FAIL 0。typecheck exit 0。frontend 76 modules build、CSS 44.14kB、JS 580.70kB。Viteの500kB advisoryを機能PASSへ読み替えない。 |
| Rust canonical | PASS | lib 211件とshutdown process 1件、FAIL 0。`cargo fmt --check`、`cargo check --locked`、external app registry/plan/historyと既存filesystem・viewer・search・cache境界の全体回帰を含む。既存dead-code warning 2件をPASSへ加算しない。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後のIMP-004 canonicalは466.560秒で全12 stageがexit 0。Rust canonical 192.495秒、release executable 86.845秒、製品shortcut回帰12.127秒、CoDD verify 130.586秒を含む。log rootは`src-tauri/target/verification/imp-004-20260821T100823381Z`。SBOM 746 components、unknown/prohibited license 0。 |
| 性能 | NOT APPLICABLE / 限定 | registry 16件、固定引数16件、対象64件、履歴20件へ固定上限を設け、preview計算は対象数に対して線形である。第三者appの起動時間、slow/removable executable、CPU・working setは未測定。 |
| 製品直接観測 | NOT RUN | canonicalの製品shortcut回帰はPASSしたが、P3-R固有のnative `.exe` picker、第三者app/UAC、長いUnicode path、removable executable、履歴表示はrelease WebView2で直接操作・観測していない。 |

## Leeyes P3-S 名前変更設定

対象はLEY-FILE-022の1件。RustがSQLite設定、単一・一括rename入力の検証、連番・拡張子解析、library containment、Windows名規則、衝突判定、preview key、実renameと逆順rollbackを担当する。TypeScriptはWebViewの選択範囲、複数選択、設定draft、preview確認、Tauri orchestrationだけを担当する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | REQ-LEY-P3-018の3件、FAIL 0。設定永続化、mixed extension、大小文字非依存の重複、既存target衝突、不正設定、途中失敗と実file rollback、256実fileを含む。256件の計画は62.821ms。 |
| Focused frontend | PASS | App、BatchRenameDialog、CatalogContextMenu、clientの4 files / 123件、FAIL 0。単一名のstem/full選択、設定保存、複数選択preview、二段階確認、構造化IPCを含む。開発中の初回全体testがasync設定応答と利用者checkbox操作の競合を検出したためrevision境界を追加し、対象testと最終全体testで回帰した。 |
| Windows tests / typecheck / build | PASS | 最終canonical内でfrontend 36 files / 476件とPython 61件、FAIL 0。typecheck exit 0。frontend 77 modules build、CSS 44.54kB、JS 585.65kB。Viteの500kB advisoryを機能PASSへ読み替えない。SBOM 746 components、unknown/prohibited license 0。 |
| Rust canonical | PASS | lib 214件とshutdown process 1件、FAIL 0。`cargo fmt --check`、`cargo check --locked`、rename設定・計画・rollbackと既存filesystem・viewer・search・cache境界の全体回帰を含む。既存dead-code warning 2件をPASSへ加算しない。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後のIMP-004 canonicalは385.417秒で全12 stageがexit 0。Rust canonical 106.940秒、release executable 88.392秒、製品shortcut回帰15.741秒、CoDD verify 129.356秒を含む。log rootは`src-tauri/target/verification/imp-004-20260821T104532125Z`。これ以前の1回は既存FT-B11-004のViewer開始待機だけがtimeoutしたが、同test単独は535.959msでPASSし、source変更なしの全12 stage再実行もPASSした。 |
| 性能 | PASS / 限定 | 256個の1-byte JPEG実fileを作成し、全source metadata確認、target生成、衝突確認、preview key生成までをdebug testで62.821msと実測し、5秒上限を満たした。実rename throughput、network/removable drive、CPU、peak working setは未測定。 |
| 製品直接観測 | NOT RUN | canonicalの製品shortcut回帰はPASSしたが、P3-S固有の実disk一括rename、途中I/O障害、長いUnicode名、衝突dialog、rollback結果はrelease WebView2で直接操作・観測していない。 |

## Leeyes P3-T 使用設定profile切替

対象はLEY-SETTING-004の1件。Leeyesの任意設定fileを直接標準保存先へする方式は採らず、Rustがapp-local SQLiteのnamed strict snapshot、active state、全field validation、preview key、atomic switchを担当する。TypeScriptは名前入力、一覧、確認、native topmost adapter、成功したprofileのReact state反映、Tauri orchestrationだけを担当する。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust | PASS | REQ-LEY-P3-019を含む2件、FAIL 0。schema v8 migration、最大16件、case-insensitive conflict、明示上書き、active削除・上書き拒否、通常保存時のactive解除、再open、名前・全field・unknown field拒否、端末path除外、opaque key、変更field数を含む。 |
| Focused frontend | PASS | App、FR-B10、FR-B11、clientの4 files / 129件、FAIL 0。profile一覧、上書き二段階確認、切替preview、明示確認、構造化IPC、既存settings draft・shortcut/tag回帰を含む。 |
| Windows tests / typecheck / build | PASS | frontend 36 files / 478件とPython 61件、FAIL 0。typecheck exit 0。frontend 77 modules build、CSS 44.99kB、JS 591.09kB。Viteの500kB advisoryを機能PASSへ読み替えない。SBOM 746 components、unknown/prohibited license 0。 |
| Rust canonical | PASS | lib 215件とshutdown process 1件、FAIL 0。`cargo fmt --check`、`cargo check --locked`、schema v8、named profile repository/validation/switchと既存settings・filesystem・viewer・search・cache境界の全体回帰を含む。既存dead-code warning 2件をPASSへ加算しない。 |
| Formal canonical / release / CoDD | PASS | 最終source変更後のIMP-004 canonicalは477.253秒で全12 stageがexit 0。Rust canonical 193.354秒、release executable 90.695秒、製品shortcut回帰15.365秒、CoDD verify 131.937秒を含む。log rootは`src-tauri/target/verification/imp-004-20260821T112148516Z`。 |
| 性能 | PASS / 限定 | 16件の全field profileをJSON deserializeしRust strict validationする処理をdebug testで4.613msと実測し、5秒上限を満たした。SQLite I/O、React再描画、CPU、peak working setは未測定。 |
| 製品直接観測 | NOT RUN | canonicalの製品shortcut回帰はPASSしたが、P3-T固有のprofile保存・上書き・切替表示、長いUnicode名、DB障害復旧はrelease WebView2で直接操作・観測していない。 |

## Leeyes P3-U CSV preset・列・header・単位・対象・名前分割

対象はLEY-IO-001〜006の6件。Rustがapp-local SQLite schema v9のpreset、strict config、library内再列挙、scope、列順、単位、名前分割、CSV escapeとbyte列生成を担当する。TypeScriptは設定dialog、上書き・削除確認、Tauri orchestration、Rust byte列のdownloadだけを担当し、従来のTypeScript `catalogCsv`は撤去した。

| Gate | 結果 | 2026-08-21の実測 |
|---|---|---|
| Focused Rust / SQLite / filesystem | PASS | REQ-LEY-P3-020の6件、FAIL 0。schema v9 migration・再open、preset 32件、case-insensitive conflict、明示上書き・削除、strict列schema、header、KiB単位、literal分割、formula無害化、選択scope containment、recursive列挙、symlink/reparse非追跡、深さ64、50,000行、16 MiB上限を含む。 |
| Focused frontend / IPC | PASS | CsvExportDialog、client、Appの3 files / 5件、FAIL 0。preset読込・上書き・削除確認、ordered config、recursive scope、Rust byte列download、download adapter failure、構造化IPCを含む。 |
| Windows tests / typecheck / build | PASS | 最終canonical内でfrontend 37 files / 480件とPython 61件、FAIL 0。typecheck exit 0。frontend 78 modules build、CSS 45.71kB、JS 596.90kB。Viteの500kB advisoryを機能PASSへ読み替えない。SBOM 746 components、unknown/prohibited license 0。 |
| Rust canonical | PASS | lib 221件とshutdown process 1件、FAIL 0。`cargo fmt --check`、`cargo check --locked`、schema v9、CSV preset/repository/generator/filesystem境界と既存settings・viewer・search・cache境界の全体回帰を含む。既存dead-code warning 2件をPASSへ加算しない。 |
| Formal canonical / release / CoDD | PASS | case違いpreset名のatomic上書き補強を含む最終source変更後のIMP-004 canonicalは546.126秒で全12 stageがexit 0。Rust canonical 184.740秒、release executable 129.195秒、製品shortcut回帰13.116秒、CoDD verify 137.169秒を含む。log rootは`src-tauri/target/verification/imp-004-20260821T121901095Z`。canonical前のfull frontend runは既存menu/Viewerの1秒待機flakeを各1回検出し、各単独PASSを確認して10秒の明示待機へ安定化した後、最終canonical内の全testをPASSした。 |
| 性能・上限 | PASS / 限定 | 50,000 synthetic行・5列をdebug Rust focused testで808.978ms、2,639,808 bytesとして生成し、5秒・16 MiB上限を満たした。16 MiB超過、50,001行相当、深さ65、symlinkを自動拒否した。50,000実fileの走査・IPC serialization、slow/removable drive、CPU、peak working setは未測定。 |
| 製品直接観測 | NOT RUN | canonicalの製品shortcut回帰はPASSしたが、P3-U固有のrelease WebView2保存dialog、preset操作、長いUnicode delimiter、50,000実file、DB障害復旧は直接操作・観測していない。 |

## Leeyes P3-V CLI path・-f・-s・single-instance

対象はLEY-IO-007〜009の3件。RustがOS分割済みargument、cwd相対path、canonical/readability/file kind、normal/fullscreen/slideshow launch plan、最大16件FIFOを担当する。公式Tauri single-instance pluginを最初のpluginとし、後続起動は既存windowをshow・unminimize・focusしてqueueへ渡す。TypeScriptはRustの検証済みplanを既存library/catalog/viewerへ適用するだけとした。

| 検証 | 結果 | 証拠 |
|---|---|---|
| Focused Rust | PASS | `application::cli_launch::tests` 5/5。space・Unicode・relative・`--`、option alias、unknown・mode重複/競合・複数path・control・32,767 UTF-16上限、missing/unsupported、file/folder plan、FIFO/溢れを検証。 |
| Queue性能 | PASS | debug Rustで10,000要求を9.775msでbounded queueへ投入・先頭16件順序・溢れ通知を検証。 |
| Frontend focused | PASS | `src/App.test.tsx` startup normal archiveの非全画面と後続single-instance slideshow、`src/features/library/client.test.ts` IPC/event contractの3件PASS。 |
| Frontend full | PASS | Windows-native 37 files / 483件、FAIL 0。既存FT-B11-006の1秒待機はfull-suite並行負荷で一時失敗、単独PASS後に10秒の明示上限へ安定化し、全件再実行をPASS。 |
| Rust canonical | PASS | lib 226件とshutdown process 1件、FAIL 0。`cargo fmt --check`、locked Cargo、single-instance plugin統合を含む。既存dead-code warning 2件はPASSに加算しない。 |
| Typecheck / build / SBOM | PASS | Windows-native typecheck、78 modules、CSS 45.71kB、JS 598.05kB。500kB超過advisoryは失敗ではない。SBOM 783 components、unknown/prohibited license 0。 |
| Product shortcut | PASS | release隔離probeは5秒継続、`run-product-ui-harness.ps1 -ShortcutOnly` PASS、canonicalのproduct-shortcutは11.409秒、source difference 0。managed sandbox内の2回はnative mutex/windowの起動前にCDP未開で失敗し、sandbox外の同一releaseでPASSした。 |
| Windows canonical | PASS | `verify-feature-windows.ps1 -Feature IMP-004 -RustMode Canonical`、sandbox外で全12 stage PASS、257.394秒。log `src-tauri/target/verification/imp-004-20260821T131117174Z`。CoDD scan/check/verify、product cleanupを含む。 |
| CoDD verify | PASS | red 3 PASS / 0 FAIL、amber 1 WARN、3 SKIP、1 VACUOUS。tests実行証拠101.23秒、typecheck executed、source integrity 13 files。SKIP/VACUOUSをPASSに加算しない。 |
| 未測定 | NOT RUN | Windows Terminal/PowerShell/cmd/Explorer別quoting、実の後続instanceからのpath引渡し、release実contentの`-f`/`-s`、UNC・長path、network/removable drive、起動・focus時間、CPU・peak working set。PASSに加算しない。 |

## Leeyes P4-A 仮想本棚

対象はLEY-SHELF-001/003/004/005/007/008/009の7件。RustがSQLite schema v10、名前付き本棚、仮想階層、順序、組込みicon、起動指定、library参照検証、消失整理、再帰除去preview、JSON Lines v1 import/exportとtransactionを担当する。TypeScriptは非modal dialog、App内部drag state、確認、download、Rust検証済みopen planの適用だけを担当する。

| 検証 | 結果 | 証拠 |
|---|---|---|
| Focused Rust | PASS | REQ-LEY-P4-001の7件、FAIL 0。SQLite CRUD・再open、仮想階層・cycle/cross-shelf拒否、順序、起動指定、組込みicon、recursive delete key、JSONL親先行・absolute path・unknown field・上限を含む。 |
| 性能・上限 | PASS / 限定 | debug Rustで10,000 node snapshot 36.840ms、50,000 node import preview 1.577秒。各本棚10,000、import合計50,000、16 MiB、64 KiB/行、深さ64を実装境界とした。実disk 50,000参照、IPC、React FPS、CPU、peak working setは未測定。 |
| Frontend focused | PASS | ShelfDialog、App、client、legacy collectionの4 files / 6件、FAIL 0。本棚作成、内部drag登録、hierarchy編集、Rust open plan、除去/cleanup確認、startup、versioned text preview/import IPCを含む。 |
| Windows tests / typecheck | PASS | Windows-native frontend 38 files / 489件、Python 61件、FAIL 0。typecheck exit 0。 |
| Windows canonical / build / CoDD | PASS | 最終source変更後の`verify-feature-windows.ps1 -Feature IMP-004 -RustMode Canonical`は全12 stage PASS、510.420秒。Rust 233件とshutdown process 1件、79 modules build、SBOM 783 components・unknown/prohibited license 0、product shortcut、CoDD scan/check/verifyを含む。logは`src-tauri/target/verification/imp-004-20260821T140441865Z`。 |
| 製品直接観測 | NOT RUN | release WebView2の大規模tree FPS/working set、native drag、保存dialog、network/removable/offline分類、cold start、実content openを直接操作・観測していない。 |

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
