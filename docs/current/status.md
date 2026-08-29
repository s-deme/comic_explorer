---
codd:
  node_id: "doc:project-status"
  type: documentation
  status: active
  confidence: 0.95
  depends_on:
    - id: "req:project-requirements"
      relation: "derives_from"
      semantic: "current-status"
    - id: "test:project-verification"
      relation: "refines"
      semantic: "verification-summary"
---

# Comic Explorer 現在状態

## 判定規則

実装状態と検証状態を分ける。`Implemented`は対象sourceが接続済み、`Partial`は受入範囲の一部だけが
実装・観測済み、`Candidate`は未採用、`Rejected`は恒久方針により非採用を表す。検証の`BLOCKED`は
実装の有無にかかわらず必要な直接観測が不足している状態で、`PASS`へ読み替えない。詳細証跡は
[verification.md](verification.md)を正とする。

## 機能集計

現行要件台帳はMVP 28件（REQ 22、NFR 6）とMVP後/将来76件の計104件である。Leeyes互換機能は別の運用台帳`leeyes-feature-tracker.csv`で192件を管理する。2026-08-21に、当時UndecidedかつMissing / Partialだった103件（Missing 67件、Partial 36件）をP1〜P5の実装対象として一括選択した。対象集合と順序は`leeyes-implementation-manifest.csv`を正とし、既存Published 3件は再実装対象に含めない。

Viewer toolbarはREQ-MVP-014Aにより主要操作だけを常時表示し、低頻度操作を展開式secondary rowへ集約した。横scrollbarは撤去し、狭幅では段階zoomと作品名を順に縮退する。Windows自動gateはPASSし、release WebView2のDPI別目視は未測定として残す。

2026-08-28に画像Viewerの縦・横連続レイアウトを廃止し、表示をpageへ固定した。toolbarと統合設定からレイアウト選択を撤去し、連続表示専用の描画、先読み、ホイール速度設定を除去した。既存profile、SQLite復元値、保存要求の旧`vertical_scroll`／`horizontal_scroll`は安全に`paged`へ正規化する。page内overflow scroll、zoom、pointer panは維持する。Windows frontend 598件、Python 74件、Rust 271+shutdown process 1件、typecheck、build、SBOMはPASSし、release WebView2直接観測は未測定として残す。

同日に通常表示の狭いViewer toolbarで「一覧へ戻る」が末尾へ折り返されて切り落とされる不具合を修正した。この操作を先頭側primary controlへ固定し、通常表示・全画面・狭幅のいずれでも作品名や段階zoomより先に残す。Viewer 61件、Python UI style 30件、Windows frontend 598件、Python 74件、typecheck、buildはPASSし、release WebView2直接観測は未測定として残す。

2026-08-29に統合設定を「一覧」「ビューワ」「画面とテーマ」「操作と入力」「プロファイル」の利用目的順へ再編し、各画面に作業単位の見出しを加えた。全体テーマと競合する一覧配色、固定ページ表示の旧`layoutMode`、実行時に使われない旧`wheelScrollFactor`をUIだけでなくprofile、named profile、IPC DTO、SQLite公開設定から除去した。旧値は読込み時に破棄する。release WebView2での最終目視は未測定として残す。

同日に、前page・次page・slideshowを上部Viewer toolbarとその他操作panelから外し、page移動bar右端へ集約した。slider、現在page数、3操作は全画面時にも同じ下端overlayの表示・非表示を共有する。release WebView2の通常幅・狭幅・DPI別目視は未測定として残す。

同日にViewer toolbarを、一覧へ戻る・作品名、表示枚数、倍率、しおりと補助操作、全画面の目的別groupへ再配置した。低頻度の読み方操作は「その他の操作」内で、読み方向、見開き調整、ランダムpageの順へ整理した。release WebView2の通常幅・狭幅・DPI別目視は未測定として残す。

同日にViewerをmain windowの画面切替から再利用可能な専用native windowへ移した。main側のcatalog、選択、scroll、読み込み済みthumbnailはViewerを開閉してもclear・unmount・再列挙しない。初回は相対item keyを持つViewer route、再利用時はwindow eventで作品を切り替え、閉じるとViewer windowだけを閉じてmainへfocusを戻す。Viewer window側は既存の安全なopen、bookmark、読書位置、page先読み、巻末移動、theme/settings境界を使う。同一window内の疑似「画像表示を分離」は廃止した。release WebView2での複数window、fullscreen、DPI別目視は未測定として残す。

同日にアプリテーマ選択をカード状のradio一覧からdropdownへ置き換え、その直下に選択中の16 semantic colorを反映する非操作previewを常設した。system previewはWindowsの現在のlight/darkへ追従し、選択変更はApplyまで画面全体へ反映しない。組込みテーマは既存7件に、明るい赤のさくら、青のオーシャン、緑のメドウ、紫のラベンダーを追加して11件とし、全組込み配色をcustom themeと同じcontrast境界で検査する。release WebView2での各配色・forced-colors・DPI別目視は未測定として残す。

同日に画像フィルターdialogを、セット一覧・選択中セットの保存/有効化/削除・順序付き処理手順の三つのsurfaceへ再構成した。現在使用中のセットと手順数を明示し、少ない手順ではcontent高へ縮み、多数手順だけを各panel内でscrollする。狭いdialog幅ではcontainer queryにより1列へ切り替えるため、buttonの横方向切り落としやdialog全体の横scrollbarを作らない。FilterDialog 4件、Viewer 61件、Python UI style 31件、Windows frontend 599件、Python 75件、typecheck、buildはPASSした。release WebView2の直接目視は、この環境でbrowser接続を取得できず未測定として残す。

同日にViewerの「その他の操作」を、toolbarの固定40px高で切り落とされる展開行から、表示とサイズ・移動と読み方・しおりと共有・画像の4群を持つ名前付きoverlay panelへ置き換えた。通常表示と全画面のどちらでも画像領域のlayoutを変えず、Escまたは閉じるbuttonで閉じる。Viewer表示中のnative title barは`Comic Explorer — <作品名>`へ更新し、作品切替時に再設定、Viewer終了時に`Comic Explorer`へ戻す。Tauri title APIの失敗は画面を閉じない。Viewer 62件、window adapter 6件、Python UI/release evidence 40件、Windows frontend 601件、Python 76件、typecheck、buildはPASSし、release WebView2直接目視は未測定として残す。

## Leeyes P1〜P5進捗

| tier | 対象 | Published | 未完了 |
|---|---:|---:|---:|
| P1 即効改善 | 21 | 21 | 0 |
| P2 閲覧中核 | 16 | 16 | 0 |
| P3 操作・検索 | 31 | 31 | 0 |
| P4 大型基盤 | 12 | 12 | 0 |
| P5 専門機能 | 23 | 23 | 0 |
| **合計** | **103** | **103** | **0** |

マニフェストは各tier内のrankを依存基盤、PartialExisting、利用頻度とリスク、規模の順で固定する。
対象外のNoAction、ReviewAlternative、DeclinedSafety、Rejected、Alternativeは依存を理由に採用状態や
Leeyes互換方式へ変更しない。

P1-AではLEY-SHELL-012/013、LEY-VIEWER-020/021/022/031、LEY-INPUT-004/010/012の9件をPublishedとした。shell 5面の独立表示、常に手前、1〜800%倍率、pixel寸法指定、倍率保持scope、非破壊grid、設定/shortcut reset、pan係数、wheel不感帯をprofile v5とSQLiteへ接続した。Windows自動gateはPASS。release WebView2でのtopmost、grid目視、実mouse/trackpad差は未測定であり、性能値や製品直接観測のPASSへ合算しない。

P1-BではLEY-FILER-016、LEY-CATALOG-010、LEY-FILE-001/009、LEY-SETTING-005、LEY-HELP-001の6件をPublishedとした。移動後初期選択、bounded thumbnail生成範囲、native file picker、永続recent 20件と消去、起動場所、検索可能な同梱helpをprofile v6・SQLite・Windows shell境界へ接続した。2026-08-22にhelpをheader/body/footerと章navigation・選択記事の2ペインへ更新し、日本語の利用手順、topic・操作説明・現在shortcutの横断検索、狭幅1列縮退を追加した。Windows自動gateはPASS。native pickerのrelease製品直接操作、実disk上のrecent欠落file回復、helpのDPI/visualは未測定として残す。

P1-CではLEY-FILER-007/011/014/018、LEY-VIEWER-006、LEY-SETTING-006の6件をPublishedとした。Windows known folder移動、dot/hidden属性の表示切替、NFKC前方一致incremental search、安全なcatalog配色preset、現在pageを除くrandom移動、opt-inの前回viewer復元をprofile v7・SQLite・Windows shell境界へ接続した。Windows自動gateとformal canonicalはPASS。特殊folder全種類、各配色のrelease目視、IME実入力、random統計、removable drive欠落時の製品直接操作は未測定として残す。

P2-AではLEY-VIEWER-007をPublishedとした。既存のslideshow context起動を、通常viewerからも開始・停止できる単一timer commandへ完成させ、background・focus喪失中の停止、復帰後のfresh interval、1page無効化、unmount cleanupを接続した。詳細な間隔・順序・反復・random設定は依存順どおりLEY-VIEWER-008で実装する。release WebView2でのbackground/focus直接観測は未測定として残す。

P2-BではLEY-VIEWER-009をPublishedとした。既存5 policyのsort順・archive/PDF/画像folder・次巻先頭/前巻末尾・確認・停止・loop・永続化を回帰し、return-libraryを次巻の有無より先に解決して最終巻でも確実に一覧へ戻す不足挙動を完成させた。catalog再取得失敗とstale generationは既存の安全停止を維持する。

P2-CではLEY-VIEWER-010をPublishedとした。複数しおりをcanonical root namespace・作品・page keyでSQLite schema v5へ保存し、pageKey再解決、次しおり循環、欠落pageの明示と個別削除、同一page upsert、root分離、旧localStorage行の成功後移行を接続した。作品ごとのDB上限10000件と旧行自動移行上限1000件を設けた。

P2-DではLEY-VIEWER-013をPublishedとした。自動・単ページ・見開きの3 modeを設定とSQLiteへ接続し、自動modeはpaged表示かつviewport比1.25以上で連続する縦長2pageだけを見開きにする。resize時は現在pageをanchorとして再判定し、次移動は表示単位、前移動は履歴単位を維持する。release WebView2での連続resize、DPI、分離viewer、実画像の多様な縦横比は未測定として残す。

P2-EではLEY-VIEWER-014をPublishedとした。見開き候補page比50〜100%、auto viewport比100〜300%、先頭単独、開始pageの奇数・偶数・制限なしをprofile v8・SQLite・設定dialog・viewer modelへ接続した。旧profile v1〜v7と欠落DB keyはP2-D互換既定値へ移行し、不正値はimport/native境界で拒否する。release WebView2のDPI別resizeと実画像比率matrixは未測定として残す。

P2-FではLEY-VIEWER-019をPublishedとした。全体フィットへ小画像の拡大可否、見開き全体/page単位の基準、page余白の算入可否をprofile v9・SQLite・設定dialog・viewerへ接続した。natural寸法が揃うまで従来CSSへfallbackし、縮小のみは100%、拡大許可は800%で制限する。release WebView2のDPI別zoom、巨大画像、異なる縦横比の見開き、scroll/pan感触は未測定として残す。

P2-GではLEY-VIEWER-026をPublishedとした。page内scroll量10〜100%、連続layoutのwheel速度50〜200%、smooth有無をprofile v10・SQLite・設定dialog・viewerへ接続した。previousもpage上端まで設定量ずつ戻し、wheelのpixel/line/page単位を正規化する。慣性timerは導入せずOSの視覚効果軽減を優先する。release WebView2のmouse/trackpad deltaMode、smooth/reduced-motion、巨大画像panの体感は未測定として残す。

P2-HではLEY-VIEWER-027をPublishedとした。標準縦送り、N字のcolumn優先、Z字のrow優先を左右の読書方向とprevious逆走へ接続し、profile v11・SQLite・設定dialog・viewerで共有する。行/列切替はleft/topを1回で移すatomic scrollとし、continuous layoutには適用しない。release WebView2の巨大画像・見開き経路、smooth中の連続入力、pointer pan後の再開位置は未測定として残す。

P2-IではLEY-VIEWER-029をPublishedとした。既存pointerルーペへ80〜400pxの正方形サイズと125〜800%倍率をprofile v12・SQLite・設定dialog・viewerで接続した。pointerの画像座標とstage内のルーペ中心をclampし、stageより大きい選択では中央へ固定する。既存media URIを再利用して追加decodeやtimerを導入しない。release WebView2の巨大画像、800%・400px時のGPU/描画時間、DPI別表示は未測定として残す。

P2-JではLEY-VIEWER-032をPublishedとした。先読みを進行方向0〜4page・戻り方向0〜4page、media grant 16〜512MiBとしてprofile v13・SQLite・設定dialogへ接続した。page/continuous共通window、0page時のvisible優先on-demand、window外frontend解放、native期限切れ/LRU解放を実装し、単一過大pageだけは表示可能性を保つ。synthetic 2,048 grantではtest上限を維持したが、releaseの巨大画像、低速disk/archive、process working set、100ms基準は未測定として残す。

P2-KではLEY-VIEWER-033をPublishedとした。Escを全画面解除だけ、またはnative全画面解除後にviewerも閉じる動作から選択できるようにし、全画面中だけWindows display-required requestを保持するopt-inをprofile v14・SQLite・設定dialog・Viewer lifecycleへ接続した。取得失敗rollback、解除失敗時再取得、unmount/application shutdown解放を実装し、OSの永続電源設定は変更しない。Windows power APIの短時間直接testとcanonical release buildはPASSしたが、release製品で実スクリーンセーバー・monitor消灯時間を待つ長時間観測、group policy・remote desktop・battery別挙動は未測定として残す。

P2-LではLEY-SHELL-014をPublishedとした。既存の手動tray格納に、最小化時の自動格納、閉じる操作のtray格納、single/double click復帰をprofile v15・SQLite・設定dialog・native window eventへ接続した。close-to-trayはcloseを先にpreventし、tray unavailableまたはhide失敗時はwindowをshow・unminimize・focusへ回復する。File menuとtray menuの明示Quitは設定にかかわらず終了する。Windows canonicalとrelease buildはPASSしたが、release通知領域での最小化・閉じる・icon click・明示Quitの直接操作は未測定として残す。

P2-MではLEY-VIEWER-008をPublishedとした。0.5〜60秒の間隔、順方向・逆方向・random、現在作品の反復をprofile v16・SQLite・設定dialog・通常/slideshow起動viewerへ接続した。randomはpage数以下のFisher-Yates shuffle-bagで1 cycle内の重複を防ぎ、Leeyesの不明な重複規則を安全で予測可能な独自挙動として明記した。100,000 page synthetic queueは99,999件一意を22.315msで生成した。Windows canonicalとrelease buildはPASSしたが、release WebView2での長時間timer精度、background/focus復帰、実archive decode待機、長時間memoryは未測定として残す。

P2-NではLEY-VIEWER-011をPublishedとした。viewer toolbarから現在のanchor pageをRust native commandへ渡し、folder・archive・PDF・対応画像を既存の安全境界で読み、EXIF向き適用済み32bpp BGRAをtop-down `CF_DIBV5`としてWindows clipboardへ書く。透明PNG、DIBV5 header・resource上限、実clipboard format、page変更後の古いstatus抑止を自動検証した。Windows canonicalとrelease buildはPASSしたが、release製品から他appへの貼り付け、最大上限付近の実画像、処理時間・peak memoryは未測定として残す。

P2-OではLEY-VIEWER-012をPublishedとした。既定有効の選択同期をprofile v17・SQLite・設定dialogへ追加し、画像folderの現在page、archive・PDF・comic folderと次巻・前巻のitem keyを、現行viewer generationとvisible catalogが一致するときだけ単一selectionへ反映する。catalog変更時に作るSetを共有し、page移動は最大2 lookupとした。初回canonicalではfrontendからRustへの新field欠落をproduct-shortcut gateが検出したため、payloadを修正して専用contract testを追加し、再実行した全12 stageはPASSした。release製品の大量catalog復帰scrollは未測定として残す。

P2-PではLEY-VIEWER-030をPublishedとした。現在anchor pageへ時計回り90度、screen軸の左右・上下反転、resetをtoolbarと固定keyから適用し、page別の疎なsession state、回転後寸法によるauto spread・fit再計算、main imageとloupeの同一transformを実装した。原画像、Rust decode、media URI、cache、clipboard、読書位置は変更しない。frontend 414件、Python 59件、Rust 180+1件、typecheck、build、Windows canonical全12 stageはPASSした。release WebView2の実画像・見開き・DPI・GPU描画は未測定として残す。

P3-AではLEY-SEARCH-003をPublishedとした。従来の空白を含むplain部分一致を維持し、Rust search portへ`*`・`?`、quoted literal、backslash escape、NOT/AND/OR、括弧と明示的な優先順位を持つbounded parser・非regex matcherを追加した。1024文字・128 token・16階層を走査前に検証し、frontendは構文案内と修正可能なerrorだけを表示する。synthetic 10,000 basenameはdebug testで83.403ms、frontend 415件、Python 59件、Rust 185+1件、typecheck、build、Windows canonical全12 stageはPASSした。release filesystemの10,000実file、最大basename、worst-case wildcard、working setは未測定として残す。

P3-BではLEY-CATALOG-006をPublishedとした。既存のTypeScript regex maskを撤去し、P3-Aと同じRust parser・matcherへ現在catalogのbasenameを一括送信する。semicolon最外OR互換、draft/適用分離、invalid時の最終valid表示保持、100,000件・basename 1024文字上限、stale generation破棄を接続した。synthetic 10,000 basenameは84.896ms、frontend 415件、Python 59件、Rust 187+1件、typecheck、build、Windows canonical全12 stageはPASSした。release WebView2 IPCの100,000件serialization/working set、最大basename、worst-case wildcardは未測定として残す。

P3-CではLEY-CATALOG-007をPublishedとした。folder/file、最小/最大size、local calendar開始/終了日を同じRust batch評価へ追加し、欠落metadata・範囲逆転・両種別無効を拒否する。条件一式はapp-local SQLite schema v6へ最大32件、同名atomic置換、更新順list、確認後削除として保存し、選択時はdraftだけを復元する。synthetic 10,000複合評価は104.382ms、frontend 417件、Python 59件、Rust 189+1件、typecheck、build、Windows canonical全12 stageはPASSした。release WebView2のtimezone/DST別日付、100,000件IPC/working set、SQLite同時利用は未測定として残す。

P3-D/EではLEY-SEARCH-001/002をPublishedとした。Windows folder pickerで明示した最大8 sourceをRustのsession allowlistへ登録し、未承認pathを拒否して同じRust search portで順次横断する。重なるsourceのcanonical itemは先行sourceへ統合し、全体50,000件上限、missing/cancel、source別結果表示と結果sourceへの再登録・親folder移動を接続した。frontend 419件、Python 59件、Rust 191+1件、typecheck、build、Windows canonical全12 stageはPASSした。release folder pickerの直接操作、50,000実file、slow/removable driveの時間・working setは未測定として残す。

2026-08-24に検索UIの責務を再整理した。名前検索は現在folder・library全体・複数場所の明示scopeを持つfilesystem走査へ限定し、catalog maskは一覧上部の「現在の一覧を絞り込む」へ移した。folder/fileは両機能で肯定形の共通selectorを使い最低1種を保証し、size metadata欠落、filterと検索結果の非合成、検索結果件数を画面へ明示した。Windows frontend 519件、Python 65件、Rust 257+1件、typecheck、build、SBOM、CoDD scan/check/verifyはPASSした。release WebView2の実layout・DPI・IME・folder pickerは未測定として残す。

2026-08-25に重複導線を整理し、toolbarの単独カードグリッド切替buttonを撤去して右側の一覧表示形式menuへ一本化した。catalog上部の「現在の一覧を絞り込む」と保存済み一覧filterも撤去し、名前・種別・size・更新日の絞り込みは検索paneだけで行う。旧版の保存済みcatalog maskはcatalogへ復元・適用しない。Windows frontend 517件、Python 65件、typecheck、buildはPASSした。

P3-FではLEY-FILER-010をPublishedとした。既定有効・profile v18/SQLite永続の設定で、Rust `notify` OS watcherを表示中canonical folderへ非再帰で最大1件だけ設定し、250ms windowでevent stormをcoalesceする。generation/root/pathが一致するeventだけを既存一覧再走査へ渡し、残存selectionを復元する。frontend 422件、Python 59件、Rust 193+1件、typecheck、build、Windows canonical全12 stageはPASSした。release WebView2、network/removable drive、10,000-event burstの反映時間・CPU・working setは未測定として残す。

P3-GではLEY-FILER-015をPublishedとした。Rustのtree列挙へ非再帰のdirect-child確認とnullable `hasChildren`を追加し、leaf expander、自動折畳み、180〜480px幅をprofile v19・SQLite・設定dialogへ接続した。10,000直下folderの下位確認は2,900.692ms。初回product gateがdrive直下の確認不能folderで親tree全体を停止する不足を検出したため、そのnodeだけ未確認へfallbackして再実行し、frontend 427件、Python 59件、Rust 195+1件、typecheck、build、Windows canonical全12 stageをPASSした。書庫treeはP4へ分離し、remote/removable drive、DPI別drag、CPU・working setは未測定として残す。

P3-HではLEY-FILER-017をPublishedとした。folder/comic folder、画像、書庫/PDFのdouble click・Enter規則をstrict profile v20・SQLite・設定dialogへ接続し、TypeScriptはgesture/kind/generationだけを渡してRustが`navigate`/`read`/`none`を決定する。Ctrl+Enterは画像・書庫・PDFだけを強制読書し、folderとunsupported fileでは無操作とする。stale/cancel/errorの推測実行を防ぎ、外部app・書庫tree・single click openは追加していない。release WebView2の実mouse/keyboard、IME、removable drive、activation latencyは未測定として残す。

P3-IではLEY-FILER-019をPublishedとした。詳細一覧へ区切りなし・横罫線・縦横罫線、compact・standard・comfortableの行密度、種別・サイズ・更新日時の列別表示をstrict profile v21・SQLite・設定dialogへ接続した。列headerとrowは同じCSS grid templateを共有し、狭幅の縮退、非表示列を含むaccessible name、他一覧形式、選択・sort・virtualizationを維持する。frontend 435件、Python 60件、Rust 197+1件、typecheck、build、Windows canonical全12 stageはPASSした。10,000項目のDOM上限は自動検証したが、release WebView2の実10,000項目FPS・working set、DPI、high contrast、font scalingは未測定として残す。

P3-JではLEY-CATALOG-016をPublishedとした。サムネイル管理から現在folder以下またはlibrary全体を選び、Rustがhidden、containment、symlink/reparse、深さ64、走査50,000、候補10,000の境界で自然順列挙してから、既存2-worker queueと`ThumbnailPipeline`へbackground priorityで1件ずつ投入する。独立generationで新規実行、root変更、cancel、shutdownを停止し、進捗と新規/cache hit/失敗件数を表示する。10,000候補列挙は2.276秒、共有pipelineの実folder・画像・書庫3件生成は104.668ms。frontend 437件、Python 61件、Rust 203+1件、typecheck、build、Windows canonical全12 stageはPASSした。releaseの10,000実画像、巨大画像、書庫/PDF混在、slow/removable drive、CPU・working set・cache eviction時間は未測定として残す。

P3-KではLEY-FILE-020をPublishedとした。library内dragは同一driveの明示folder targetへ既定move、Ctrlでcopyとし、Explorerからのnative dropはRustが最大256件の絶対pathをpreview・実行直前に再検証して、確認後もcopyだけを行う。Alt+dragの外向き操作はRustがWindows Shell `IDataObject`を構築し、copy effectだけで`SHDoDragDrop`を開始する。TypeScriptは座標・修飾key・確認UIの調整だけを担当する。frontend 32 files / 442件、Python 61件、Rust 207+1件、typecheck、build、Windows canonical全12 stageはPASSした。最初のcanonicalで既存FT-B14-001の1秒待機flakeを検出し、10秒の明示待機へ安定化して単独10/10 PASS後に全体を再実行した。実Explorerとのdrag in/out、100/150/200% DPI、network/removable drive、大量・大容量copyの時間・CPU・working setは未測定として残す。

P3-LではLEY-INPUT-001をPublishedとした。各catalog/viewer commandへ順序付きで1〜4個のkeyboard bindingを追加・編集・削除でき、command単位と全体のreset、全bindingのdispatch、offline help表示を接続した。Rust registryが既知command、canonical key、件数、command内重複、command間競合、予約keyを検証し、配列をSQLiteへatomic保存する。既存SQLiteとstrict profile v1〜v21の単一文字列はprofile v22の1要素配列へ移行する。frontend 32 files / 444件、Python 61件、Rust 208+1件、typecheck、build、Windows canonical全12 stageはPASSした。実keyboard layout、IME、AltGr、OS別system予約key差とalternate bindingのrelease UI直接操作は未測定として残す。

P3-MではLEY-INPUT-005をPublishedとした。paged Viewerのmodifierなし矢印keyで上下左右のoverflowを設定済みviewport比率だけpanし、PageUp/PageDownと前後page commandにも同じ量を共有した。repeatは100〜300%の加速率または連続動作無効を選べ、focus・modifier・IMEを保護し、左右端では走査を二重適用せず既存page移動へ進む。Rustが加速率・連続動作をstrict profile v23とSQLiteで検証・atomic保存し、TypeScriptはWebView keyboard eventとDOM scrollのadapterに限定した。frontend 32 files / 449件、Python 61件、Rust 208+1件、typecheck、build、Windows canonical全12 stageはPASSした。実keyboard repeat rate、IME/layout差、scroll latency、DPI、CPU・working setは未測定として残す。

P3-NではLEY-INPUT-006をPublishedとした。catalogのprimary、double、middle、back、forwardへ安全な既知commandを割り当て、primary選択、modifier複数選択、context menu、drag、favoriteを固定操作として保護した。Rustが完全なgesture/action registryをstrict profile v24とSQLiteで検証・atomic保存し、TypeScriptはWebView event、250msのsingle/double分離、設定draft、既存handlerへのdispatchに限定した。frontend 33 files / 456件、Python 61件、Rust 208+1件、typecheck、build、Windows canonical全12 stageはPASSした。並行負荷時の既存FT-B14-001 timeoutは単独および負荷分離した全体再実行でPASSした。実double-click interval、button 3/4、touchpad、DPI、input latency、CPU・working setは未測定として残す。

P3-OではLEY-INPUT-008をPublishedとした。Viewer stageを4象限に分け、安全な既知Viewer commandを象限別に割り当てた。Rustが完全な象限/action registryをstrict profile v25とSQLiteで検証・atomic保存し、TypeScriptはWebView座標、mouse/pan境界、250msのsingle/double分離、既存handlerへのdispatchに限定した。touch・pen・modifier・4px以上のpan・swipe・middle/side button・wheelと固定double click全画面切替を保護し、拡大画像でも移動量4px未満のmouse clickを利用できる。frontend 34 files / 463件、Python 61件、Rust 208+1件、typecheck、build、再実行したWindows canonical全12 stageはPASSした。初回canonicalの最終CoDD test commandだけの一時失敗は単独再実行と全stage再実行でPASSを確認した。実double-click interval、touchpad、pen、DPI、input latency、CPU・working setは未測定として残す。

P3-PではLEY-INPUT-009をPublishedとした。Viewer stageのmodifierなしright clickへ安全な既知Viewer commandを割り当て、既定`none`で現行操作を保った。Rustが単1 action registryをstrict profile v26とSQLiteで検証・atomic保存し、TypeScriptはWebView pointer event、4px移動判定、right-wheel取消、既存handlerへのdispatchに限定した。right-wheel、touch・pen・modifier・pointer cancel・blurを保護し、catalogとfolder treeのcontext menuは変更していない。frontend 34 files / 466件、Python 61件、Rust 208+1件、typecheck、75 modules build、最終Windows canonical全12 stageはPASSした。初回canonicalの最終CoDD test commandだけの一時失敗は単独full test、CoDD verify、source変更なしの全stage再実行でPASSを確認した。実right-click順序、touchpad、多ボタンmouse、DPI、input latency、CPU・working setは未測定として残す。

P3-QではLEY-INPUT-013をPublishedとした。paged Viewer toolbarから明示的に1回だけ矩形ズームをarmedにし、12px以上のmouse drag範囲を中央に保って1〜800%の範囲で拡大できる。Rust commandがviewport・selection・scroll・現在倍率を検証して倍率とscroll planを計算し、TypeScriptはpointer capture、stage clamp、一時overlay、DOM適用に限定した。pan・4象限・right click・middle/side・wheel・touch・pen・modifierを分離し、Escape・cancel・blur・layout/session変更で安全に解除する。frontend 34 files / 470件、Python 61件、Rust 209+1件、typecheck、75 modules build、SBOM 746 components・禁止license 0、再実行したWindows canonical全12 stageはPASSした。初回canonicalの既存folder thumbnail待機testだけの一時timeoutは単独product shortcutとsource変更なしの全stage再実行でPASSし、原本差分0を確認した。Leeyes 2.6.1の現行起動gesture、実pointer capture、DPI、高倍率画像、input・zoom latency、CPU・working setは未測定として残す。

P3-RではLEY-FILE-005/006/007をPublishedとした。Windows native pickerで明示選択した`.exe`だけを最大16件登録し、Rustがcanonical executable、固定引数、対象mode、library containment、最大64対象、preview keyを再検証して`Command::new`へ引数を個別に渡す。起動前の確認を必須とし、成功履歴はapp名・mode・件数・時刻だけをSQLite schema v7へ最大20件保存してpathと引数を残さない。TypeScriptは登録draft、選択収集、確認dialog、Tauri orchestrationだけを担当し、既存Windows「アプリケーションから開く…」も維持した。release製品でのnative picker、第三者app/UAC、長いUnicode path、removable executable、起動時間は未測定として残す。

P3-SではLEY-FILE-022をPublishedとした。単一renameは拡張子を除く初期選択を既定とし、設定で拡張子まで選択できる。複数選択は2〜256件の基本名・separator・開始番号・桁数・拡張子保持をSQLiteへ保存し、RustがWindows名規則、library包含、reparse、欠落、大小文字を無視した重複と既存target衝突を検証して相対path previewとopaque keyを返す。明示確認後も同じ計画をmutex内で再計算し、途中失敗では完了済みrenameを逆順rollbackする。TypeScriptは選択、入力、preview確認、Tauri orchestrationだけを担当する。256実fileの計画は62.821ms。release WebView2の実disk rename、network/removable drive、途中I/O障害、長いUnicode名、CPU・working setは未測定として残す。

P3-TではLEY-SETTING-004をPublishedとした。任意の外部設定fileを標準保存先へせず、用途別strict settings snapshotをapp-local SQLite schema v8へ最大16件保存する。Rustが名前・件数・case一意性、全field、保存・明示上書き、active判定、変更field数、opaque key、切替直前再検証、settings全体とactive名のatomic保存を担当する。active中の削除・上書きを拒否し、通常設定変更ではsnapshotを暗黙更新せずactive表示を解除する。TypeScriptは入力、一覧、確認、native topmost adapter、成功値のReact反映、Tauri orchestrationだけを担当する。16 full profilesのdeserialize・strict validationは4.613ms。release WebView2での切替表示、DB障害復旧、長いUnicode名、CPU・working setは未測定として残す。

P3-UではLEY-IO-001〜006をPublishedとした。従来TypeScriptにあった固定CSV生成を撤去し、Rustをpreset schema、列順、header、size単位、filename分割、対象scope、filesystem再列挙、escape、出力byte列の唯一の正本とした。presetはapp-local SQLite schema v9へ最大32件保存し、選択・現在folder・recursiveをlibrary root内で再検証する。recursiveはsymlink/reparseを追跡せず深さ64、50,000行、16 MiBでfail closedし、UTF-8 BOM・CRLFとformula無害化を適用する。TypeScriptはdialog入力、確認、Tauri orchestration、Rust byte列のdownloadだけを担当する。50,000 synthetic行は808.978ms・2,639,808 bytes。frontend 37 files / 480件、Python 61件、Rust 221+1件、typecheck、build、Windows canonical全12 stageはPASSした。release WebView2の保存dialog、50,000実file、slow/removable drive、長いUnicode delimiter、DB障害、CPU・working setは未測定として残す。

P3-VではLEY-IO-007〜009をPublishedとし、P3の31件を完了した。RustをCLI argument parser、cwd相対path解決、canonical/readability/file kind検証、launch plan、最大16件FIFO、公式Tauri single-instance引渡しの正本とした。pathは1件、`-f`/`--fullscreen`と`-s`/`--slideshow`は排他的に受理し、`--`、space、Unicode、relative pathを扱うが、shell再解析・環境変数・wildcard展開は行わない。後続instanceは既存windowをshow・unminimize・focusし、Rust queueへ渡す。TypeScriptは検証済みplanを既存library/catalog/viewer/fullscreen/slideshowへ適用するだけである。10,000 queue要求は9.775ms。frontend 37 files / 483件、Python 61件、Rust 226+1件、typecheck、78 modules build、SBOM 783 components・禁止license 0、sandbox外Windows canonical全12 stageはPASSした。managed sandbox内の2回のcanonicalはnative single-instance mutex/windowが起動できずproduct-shortcutで失敗したが、同一releaseの隔離probe・product-shortcut単独・sandbox外canonicalはPASSした。Windows Terminal/PowerShell/cmd/Explorer別quoting、実の後続instanceからのpath受渡し、UNC・長path、network/removable drive、起動・focus時間、CPU・working setは未測定として残す。

P4-AではLEY-SHELF-001/003/004/005/007/008/009の7件をPublishedとした。SQLite schema v10とRust commandを本棚・仮想階層・順序・icon preset・起動指定・登録path再検証・明示cleanup・versioned JSON Lines import/exportの正本とし、TypeScriptは本棚dialogとIPC orchestrationだけを担当する。仮想folder/itemの変更・除去は実filesystemを変更せず、子孫除去とimportはpreview key・確認・transactionへ固定した。10,000 node snapshotは36.840ms、50,000 node import previewは1.577秒。frontend 38 files / 489件、Python 61件、Rust 233+1件、typecheck、79 modules build、SBOM 783 components・禁止license 0、sandbox外Windows canonical全12 stageはPASSした。release WebView2の大規模tree FPS/working set、native drag、保存dialog、network/removable/offline分類、cold startは未測定として残す。

P4-BではLEY-FILER-002/003/004の3件をPublishedとした。filesystem treeへ対応書庫nodeを追加し、Rustが既存ZIP/RAR/7z/LZH・多重圧縮readerからfolder/image/nested archiveのopaque仮想snapshotを構築する。TypeScriptはvirtualized tree/listとRust page keyの既存Viewer適用だけを担当し、仮想nodeへfilesystem操作・抽出・外部appを接続しない。2026-08-23に書庫内画像のvisible thumbnail要求を既存2-worker・WIC JPEG・atomic cache・opaque media tokenへ接続し、全entry一括展開を避けた。続いて書庫内項目を1click選択・double click／Enter openへ揃え、選択画像を明示buttonまたはCtrl+Cから既存のbounded Windows画像clipboardへ直接copy可能にした。20,000 direct entryは625.062ms、50,000 synthetic nodeは116.589ms。現行Windows testsはfrontend 41 files / 517件、Python 65件、Rust 257+1件、typecheckをPASSした。release WebView2での書庫内実画像thumbnail・clipboard、FPS/working set、実大規模RAR/7z/LZH、slow/removable drive、temp peak、Viewer遷移時間は未測定として残す。

P4-CではLEY-FILE-016をPublishedとした。Rust file-operation mutex配下へsession内1段のoperation journalを追加し、library内rename・一括rename・folder作成・copy/move/paste/internal dragとlibrary内へ作成するnative drop copyだけを対象にした。Rustが変更後pathのtype・size・mtime・全対象合計最大50,000 nodeのdirectory manifest、root identity、reparse、外部変更、復元先衝突を検証し、copy/create削除、rename/move逆rename、複数move rollback、copy部分失敗の残存journalを担当する。TypeScriptは編集menu、catalog局所Ctrl+Z、typed IPC、既存再列挙だけを担当する。10,000 node fingerprintは410.828ms、frontend 39 files / 497件、Python 61件、Rust 243+1件、typecheck、80 modules build、SBOM 783 components・禁止license 0、sandbox外Windows canonical全12 stageはPASSした。release WebView2のUndo直接操作、network/removable drive、外部process競合、巨大directory、CPU・working setは未測定として残す。

P4-DではLEY-SHELL-007をPublishedとし、P4の12件を完了した。Rust settings・SQLite・strict profile v27を一覧位置（右・左・上・下）とnavigation幅/高さの検証・永続化・旧profile移行の正本とし、TypeScriptは固定CSS Grid area、設定UI、orientation別separator操作だけを担当する。配置切替後もcatalog選択を保持するApp回帰を含めfrontend 39 files / 502件、Python 61件、Rust 244+1件、typecheck、80 modules build、SBOM 783 components・禁止license 0、Windows canonical全12 stageをPASSした。4方向それぞれ10,000回のlayout helper呼出し（合計40,000回）は6.391ms。release WebView2の10,000 item FPS・reflow、DPI別pointer、最小window、CPU・working setは未測定として残す。

P5-AではLEY-MEDIA-001/002/003/004/005/008/009の7件をPublishedとした。RustがWindows volume identity、reparse非追跡のbounded scan、WIC JPEG表紙、cancel generation、SQLite schema v11の単一transaction、offline snapshot、接続volume再照合、open containment、組込みiconを所有し、TypeScriptはtyped IPCと台帳dialogだけを担当する。frontend 40 files / 506件、Python 61件、Rust 249+1件、typecheck、81 modules build、SBOM 783 components・禁止license 0、Windows canonical全12 stageをPASSした。50,000 entry DB transactionと再読込は2,556ms。光学disc・removable driveの抜差し、drive letter変更、実媒体50,000 file scan、巨大画像256枚、CPU・working set、台帳dialogのrelease DPI/keyboardは未測定として残す。実装commit `a88a752` はupstreamへpush済み。

P5-BではLEY-FILTER-001〜016の16件をPublishedとし、P1〜P5の全103件を完了した。Rustが14種のRGBA pixel処理、parameter・resource上限、順序付きchain、名前付きset、active set、WIC decode、bounded PNG、SQLite schema v12を所有し、TypeScriptはtyped IPCとReact/WebViewのset editorだけを担当する。frontend 41 files / 511件、Python 61件、Rust 255+1件、typecheck、82 modules build、SBOM 783 components・禁止license 0、Windows canonical全12 stageをPASSした。4K RGBAへgrayscale・gamma・contrast・blurの4 stepを適用したRust release測定は1,188ms（debug 21,168ms）。release WebView2の実画像品質、色管理、animated GIFの複数frame、実操作中のlatency、CPU・working setは未測定として残す。実装commit `f234432` はupstreamへpush済み。

| 実装状態 | 検証状態 | 件数 |
|---|---|---:|
| Implemented | PASS | 73 |
| Implemented | BLOCKED | 15 |
| Partial | BLOCKED | 9 |
| Candidate | NOT TESTED | 3 |
| Rejected | NOT TESTED | 4 |
| **合計** |  | **102** |

## MVP状態

| 範囲 | 状態 | 備考 |
|---|---|---|
| REQ-MVP-001〜007, 009〜017, 019 | Implemented / PASS | console/terminalを生成しないWindows GUI subsystemのrelease executable、root登録画面なしのExplorer shell、PC配下のWindows drive列挙・選択・切替、約11px文字・24px行高・16px展開記号列・14px icon列のcompact tree、treeの現在folder表示・drive別展開保持・明示的な全折りたたみ、通常pathのaddress表示、metadataだけを返してthumbnail生成中も待たせないfolder一覧、表示対象folderの直下画像を自然順で選ぶ非同期thumbnailと画像なし時の専用icon、file名左端の種類別iconを含むcatalog、親から子への先頭表示と子から親への保存scroll位置復元、現在pageから最大4page先に限定したviewer先読み、読書位置、原本非破壊、error回復をWindows release build、Rust canonical、frontend testで直接観測済み。 |
| REQ-MVP-008 | Implemented / BLOCKED | BMP/JPEG/GIF/TIFF/PNG/ICO/SVG/WebPの列挙、実decode、安全なviewer配信とWIC thumbnailはWindows testでPASS。release WebView2上のanimated GIF直接観測は未完了。 |
| REQ-MVP-018 | Partial / BLOCKED | code上はlocal-onlyだが、隔離VM外部からのDNS/TCP/UDP監視が未実施。 |
| REQ-MVP-020 | Implemented / PASS | root包含確認後のWindows canonical pathを通常pathへ変換してWindows.Data.Pdfでpage列挙・上限付きPNG renderし、release WebView2上の日本語名PDFでviewerとthumbnailの実画像decode、原本差分0を直接観測済み。favorite、巻末遷移、source/root/error境界もWindows Rust canonicalとfrontend testでPASS。 |
| REQ-MVP-021 | Implemented / BLOCKED | rename、create、copy、move、完全delete、Windows Explorer互換のCF_HDROPとPreferred DropEffect、Shell delete path正規化、root containmentと衝突境界はWindows Rust canonicalでPASSし、catalogおよびfolder treeのcontext menu・keyboard cut/copy/paste、右click folder内へのpaste、catalog選択項目とtree folder自体のcatalog/tree folderへのdrag move、tree folderの共通確認dialog経由の削除、表示中folder削除後の親folder遷移、操作後のtree再列挙はfrontend testでPASS。ごみ箱、folder picker、Explorerとの実paste、アプリ選択をrelease製品で直接観測するgateは未完了。 |
| NFR-MVP-001〜003 | Partial / BLOCKED | folder一覧をthumbnail生成・cache保守の完了待ちから分離するlock回帰testはPASS。規模・性能・UIA/screen reader/high contrast/DPIの製品実測待ち。 |
| NFR-MVP-004 | Implemented / PASS | lock inventory、SBOM、notice、license auditの受入証跡あり。 |
| NFR-MVP-005〜006 | Partial / BLOCKED | clean VM配布、Windows製品性能・環境matrixが未完了。 |

## Feature lane状態

| Lane | 対象 | 現在状態 | 未完了境界 |
|---|---|---|---|
| FR-B01 | 表示倍率 | Implemented / PASS | page layoutのfitに加え、1〜800%の直接入力、原寸から1〜32768pxの幅/高さ指定、global/book/page保持scopeをWindows testで検証済み。 |
| FR-B02 | 巻末policy | Implemented / PASS | folder内画像を1冊として閲覧した巻末では親catalogのsort順から次巻を選び、次項目が通常folderでもbackendのfolder画像列挙へ渡して先頭pageを開くことをWindows frontend testで検証済み。 |
| FR-B03 | catalog表示形式 | Implemented / PASS | 詳細、小サムネイル、表紙グリッド、カードグリッド、情報カードの順序・名称、4形式別の固定thumbnail幅、表紙中心の縦型grid、外枠と内側余白を省いて4px間隔で並べる大判表紙だけのカードグリッド、属性付き横長情報カードの区別、ファイル名非重複、profile v1/v2からv3への移行とprofile v4/v5での保持、SQLite再起動復元をWindows frontend/Rust/Python testで検証。 |
| FR-B05 | 名前検索 | Implemented / PASS | 10,000項目/1秒はNFR gate。 |
| FR-B06 | quick access・favorite保存 | Implemented / PASS | — |
| FR-B07 | memo・history・rating | Implemented / PASS | — |
| FR-B08 / static WebP | FUT-C-005 | Implemented / PASS | animated WebPへ波及しない。 |
| FR-B08 / P8 GIF | FUT-C-006〜008のGIF範囲 | Implemented / BLOCKED | 実decodeとWIC先頭frame thumbnailはPASS。release WebView2でanimation、corrupt fallback未測定。 |
| FR-B08 / P8 AVIF | FUT-C-006〜008のAVIF範囲 | Partial / BLOCKED | 安全な分類・metadata・MIMEのみ。製品decode未受入。 |
| FR-B10 | tag | Implemented / PASS | — |
| FR-B11 / keyboard・mouse | FUT-C-019 | Implemented / PASS | 16 command、9種類の変更可能mouse入力、固定double click、旧設定移行を検証済み。任意軌跡gesture、touch、gamepadはCandidate。 |
| FR-B12 / P9 | FUT-C-001, FUT-C-002 | Implemented / PASS | RAR/CBR、7z/CB7、LZH readerとZIP/RAR/7z/LZH混在の多重圧縮をWindows Rust canonical、再生成可能fixture、license gateで直接検証済み。 |
| FR-B13 / P1 | catalog command | Implemented / PASS | — |
| FR-B14 / P2 | open・navigation | Implemented / PASS | — |
| FR-B15 / P3 | bookmark・bookshelf | Implemented / PASS | — |
| FR-B16 / P4 | filter・CSV | Implemented / PASS | — |
| FR-B17 / P5 | reference shell | Implemented / BLOCKED | release DPI/visualと製品復元gate未測定。 |
| FR-B18 / P6 | workspace・tray | Implemented / BLOCKED | notification area、native hide/show/focus、lifecycle未測定。 |
| FR-B19 / P7 | settings・help | Implemented / PASS | 設定は「一覧」「ビューワ」「画面とテーマ」「操作と入力」「プロファイル」の5カテゴリ、横断検索、説明付きrow、全設定のdraft resetをWindows frontend testで検証済み。全体テーマと重複する一覧配色、無効な旧layout/wheel設定はprofile・SQLiteを含めて除去し旧値を安全に破棄する。設定・help navigationはlight neutral面、淡い青のcurrent面、blue accentへ統一した。バージョン情報は大形help layoutから分離し、最大幅440pxの専用dialogへcompact化した。 |
| FR-B20 / P10 | thumbnail maintenance | Implemented / BLOCKED | 製品file picker、実JPEG保存、一括import未測定。 |
| FR-B21 | standalone PDF | Implemented / PASS | Windows.Data.Pdfの実render、canonical path正規化、上限・分類・root containmentに加え、release WebView2のviewer・thumbnail実decodeを日本語名PDFで直接観測済み。 |
| FR-B22 | file manager | Implemented / BLOCKED | Windows filesystemとOS clipboardのbackend実動作、Shell delete path正規化、catalog/tree context menu・keyboard操作・右click宛先paste・catalog/tree双方を起点とするdrag move・tree folder削除後の安全な親folder遷移・操作後tree再列挙・確認dialogのfrontend接続はPASS。native picker、ごみ箱、Explorerとの実paste、アプリ選択の製品直接観測は未測定。 |
| FR-B23 | Leeyes viewer操作・外観 | Implemented / PASS | 既存3件にP1-Aのviewer/input 6件を加え、1〜800%倍率、pixel寸法、倍率scope、grid、pan係数、wheel不感帯、profile v5・SQLite保存、v1〜v4移行、不正値拒否をWindows frontend 316件、Python 59件、Rust canonical、typecheck、buildで検証済み。release WebView2上の目視・実device操作は未測定。 |
| FR-B24 | アプリテーマ | Implemented / PASS | システム連動と11組み込みテーマ、dropdown選択と局所preview、16 semantic tokenのカスタムテーマ作成・複製・編集・JSON入出力、最大32件、SQLite schema v13、profile v29、native title bar同期、旧設定移行と原子的rollbackをWindows frontend、Python、Rust canonical、typecheck、build、SBOM、CoDDで検証する。release WebView2の色・DPI・Windows high contrast/forced-colors直接観測は未測定。 |

## CandidateとRejected

- Candidate / NOT TESTED（3件）: FUT-C-052、FUT-R-006、FUT-R-007。
- Rejected / NOT TESTED（4件）: FUT-R-001〜003、FUT-R-008。
- Candidateを`Partial`へ、RejectedをCandidateへ変更するには、先に
  [requirements.md](requirements.md)の採用境界と恒久安全原則を変更する。

## MVP release case summary

最新の承認済みMVPケース仕様73件に対する現行集計は、`source: docs/current/verification.md`、
`scope: MVP release cases`、`PASS: 60`、`FAIL: 0`、`BLOCKED: 12`、`NOT RUN: 1`、`total: 73`である。
73件目のTC-NFR-006-001は旧Phase 6結果に行がなく、推測でPASSへ追加せずNOT RUNとする。

## 未完了release gate

- Windows 10 22H2 / Windows 11のWebView2導入済みclean VMにおけるinstall、launch、uninstall、user-data保持/削除と、WebView2未導入時の失敗表示。
- VM外部からのDNS/TCP/UDP監視による外部通信0の確認。
- 基準PCでのcold TTI、10,000項目、scroll/FPS、input/page latency、working set、cache測定。
- Windows UIA、Narrator/NVDA、high contrast、100/150/200% DPI。
- WebView2 custom protocolの実Origin/Referer header統合。
- animated GIFのrelease WebView2直接観測とcorrupt fallback、AVIFの製品decode。
- tray notification area、P5 visual/DPI、thumbnail file pickerと実disk I/Oの製品gate。
- file managerのnative folder picker、ごみ箱、Explorerとの実paste、アプリ選択、release WebView2 context menuの製品直接観測。

これらが残るため、製品全体を「すべてのrelease gateがPASS」とは判定しない。
