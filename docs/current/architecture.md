---
codd:
  node_id: "design:project-architecture"
  type: design
  status: approved
  confidence: 0.95
  depends_on:
    - id: "req:project-requirements"
      relation: "implements"
      semantic: "current-system-contract"
---

# Comic Explorer 現行アーキテクチャ

## 採用構成

| 層 | 現行構成 |
|---|---|
| desktop shell | Tauri 2、Windows WebView2、NSIS |
| frontend | React 19、TypeScript、Vite、TanStack Virtual、HTML/CSS |
| backend | Rust 2024 edition、Tokio、typed Tauri commands |
| catalog/archive | read-only filesystem adapter、`zip`（Stored/Deflate）、`unrar`（RAR4/RAR5）、`sevenz-rust`（Copy/LZMA/LZMA2）、`delharc`（LHA/LZH）、上限付き多重圧縮、自然順 |
| image/thumbnail | WIC thumbnail pipeline、`image` raster validation/PNG conversion、`resvg` static SVG rasterize、静止WebPは`image-webp`によるpure-Rust decode、PDFはWindows.Data.PdfからPNGへrender |
| persistence | app-local SQLite WAL（`rusqlite` bundled）、local settings/collections、file cache |
| verification | Vitest/Testing Library、Python unittest、Cargo test、Windows release product harness、CoDD |

native entry pointは`src-tauri/src/main.rs`、Tauri composition rootは`src-tauri/src/lib.rs`、
UI entry pointは`src/main.tsx`、root componentは`src/App.tsx`である。
Windows release buildのnative entry pointはGUI subsystemを指定してconsole/terminalを生成せず、
debug buildでは診断出力のためconsole subsystemを維持する。

## frontend/backend境界

```text
React shell/tree/catalog/viewer/settings
        │ typed command + request ID + generation
        ▼
Rust api/application coordinator
        ├─ catalog: folder/archive/image metadata/natural sort
        ├─ media: opaque grant/token and bounded page delivery
        ├─ state: SQLite, reading data, settings, fingerprints
        ├─ thumbnail: queue, decode, cache, LRU
        └─ tray/diagnostics/error presentation boundary
```

frontendは表示、focus、selection、dialog、virtual range、即時feedbackを担当する。backendは
root/path認可、列挙、archive、MIME/metadata、generation、queue、cache、SQLiteを担当する。
frontendへ任意のhost path、SQL、archive entry accessを渡さない。成功、分類済みerror、cancel、
stale responseを構造的に区別する。

## catalogとnavigation

起動時はlibrary root登録画面を介さず、Windowsの論理ドライブbitmaskをbackendで列挙して、frontendの
folder treeへ`PC > drive > folder`として表示する。drive選択または別driveのabsolute address入力時は、
そのdrive rootを既存のcanonical library rootへ設定してread-only catalog境界を切り替える。これにより
Explorer型の操作を提供しつつ、検索、thumbnail、viewer、metadata、file操作が参照する単一root containmentを
維持する。旧版のfolder単位rootは起動時にdrive rootとroot-relative pathへ分解して同じnavigationへ移行する。

選択drive rootはbackendでcanonicalizeし、すべての相対pathがroot内に留まることを検証する。folder、
comic folder、画像、`pdf`、ZIP/CBZ/EPUB/RAR/CBR/7z/CB7/LZH、unsupported fileをtyped kindとして列挙し、自然順と選択中sortを
適用する。tree、address、catalogは同じcurrent folderを指し、back/forward/up/history jumpと
明示refreshは同じnavigation stateを更新する。catalogのscroll位置はdriveごとのmount内でfolder別に保持し、親から子への移動では
子catalogを先頭表示し、子から祖先へ戻る場合は対象folderの一覧取得完了後に保存位置を復元する。treeの展開集合と取得済み子nodeはdrive identityを含むkeyで保持し、
drive切替時にも別driveの展開を破棄しない。検索paneまたはtree表示設定で隠す場合もtree componentはmountを維持し、
復帰時に利用者が開いたbranchを再表示する。treeは24pxのvirtual row、16px単位の階層indent兼展開記号列、
左paddingなしで続く14pxの種類icon列、約11pxのlabelを使って密に配置する。tree headerは現在folderのExplorer形式absolute pathと、PC直下を残して
全drive・folderを折りたたむ明示操作を提供する。addressのWindows絶対pathは外側の引用符を除去し、
separatorとcaseを比較用に正規化してからdriveとpath segment境界を検証し、安全なdrive相対pathへ変換する。
Rustのcanonical pathが持つ拡張長接頭辞`\\?\` / `\\?\UNC\`はfilesystem内部だけで使い、API responseと
address表示ではExplorerと同じ通常pathへ変換する。

treeのleaf/branch判定はRustのroot-contained `list_tree_children`で行い、下位確認を有効にした場合だけ各direct child folderを非再帰・先頭一致で調べてnullable `hasChildren`を返す。frontendはleafのexpanderを無効化し、自動折畳み設定ではPC、active drive、current ancestor chainだけを展開集合へ残す。tree幅は180〜480pxへpointer/keyboard共通でclampし、これら3値をprofile v19とSQLiteへ保存する。書庫nodeおよび書庫内仮想pathはP4のLEY-FILER-002/003で扱い、このfilesystem tree境界へ先行混在させない。

catalogはvirtualizeし、表示範囲外のthumbnail処理を遅延する。folder移動は先に古いgenerationをcancelして
metadata一覧を返し、placeholderを表示した後でthumbnail要求を非同期に投入する。navigation時のpin解除は
生成・decode・cache書込を直列化するthumbnail pipelineとは独立した短時間の同期境界で行い、生成中の
thumbnailやcache保守の完了をfolder一覧の応答条件にしない。folder一覧は各項目のmetadataだけを読み、
子孫画像の有無や直下archiveを表紙候補として走査しない。表示対象になったfolderだけをthumbnail workerが
直下1階層に限定して列挙し、対応画像を自然順で並べた先頭を表紙にする。直下画像がない場合は専用iconへ
局所的にfallbackし、利用者が移動したfolderの内容は次の一覧要求で改めて列挙する。名前検索はfrontendで検索条件を構成し、
backendのread-only workerが正規化したbasename、検索開始folder、再帰、folder/file種別、size、mtimeを
同時に評価する。固定した検索場所はroot相対pathとして再検証・canonicalizeし、root外symlinkや親directory
への脱出を許可しない。検索結果の保持はfrontend表示状態だけに適用し、検索実行時のfilesystem再走査を
cacheへ置き換えない。card形式はprofileに保存した形式別thumbnail幅から画像枠とcardの固定寸法を導出し、
scroll containerの幅を観測して収まる列数だけを決める。ウィンドウ幅の変更ではthumbnailを拡縮しないため、
仮想行、keyboardの上下移動、focus復元は同じ固定card幅から求めた列数に従う。詳細リストはcatalog paneのcontainer queryで更新日時、種別・サイズの順に非表示へ縮退し、
primary情報と独立したお気に入りtoggleを、詳細リストでは左端の専用列、サムネイル系cardではサムネイル左上への重ね表示として維持する。thumbnail未生成のfolderとarchiveには、inline SVGのtab付きfolder iconと積層書庫iconを表示して区別する。さらに全一覧形式のfile名先頭へcompactなinline SVG種類iconを置き、`page`を画像、`folder`と`comicFolder`をfolder、`archive`を圧縮file、`pdf`をPDF、`unsupported`を汎用fileへ写像する。種類iconは`aria-hidden`とし、既存の項目accessible nameで種別を通知する。検索、mask、複数選択、property、
CSV、recent、bookmark、bookshelf、favorite、tag、memo/history/ratingは既存catalog identityと
root namespaceを再利用する。右clickまたはcontext-menu keyで選択を確定し、open、fullscreen、
Explorer表示、Windowsのアプリ選択、本棚、file cut/copy/paste、folderへのcopy/move、path copy、
folder作成、ごみ箱delete、rename、property、確認付き完全deleteを同じcontext menuから起動する。
folder treeはfolder nodeの右click、Shift+F10、Ctrl+X/C/Vを同じfile-operation portへ接続し、drive nodeでは
drive rootへのpasteだけを許可する。別driveのnodeを操作するときは先にcanonical library rootをそのdriveへ切り替える。

## viewerとmedia

folder pageはread-only file stream、ZIP/CBZ/EPUB pageは必要entryだけをinflateする。RAR/CBRは
UnRARのlisting/processing APIで単一volume・非暗号化RAR4/RAR5の必要entryだけをmemoryへ読む。
7z/CB7は`sevenz-rust`でCopy/LZMA/LZMA2 entryを、LZHは`delharc`でStored/LH1/LH4〜LH7/LZS/LZ5
entryを読み、いずれもlibraryへ展開しない。分割RAR、暗号化書庫、未対応compression、危険path、
entry数・展開後entry size・展開後合計size上限超過は読取前またはstream境界で拒否する。
対応書庫entryは形式を混在して再帰列挙し、内側3階層、内側書庫64個、内側書庫の展開データ累計
512 MiBを上限とする。通常pageの相対keyは維持し、入れ子pageだけbackend専用の衝突しないopaque keyで
書庫entry chainを表す。内側書庫はlibrary root外のOS tempへ寿命付きfileとして展開し、読取後に削除する。
catalogの画像を直接開く経路も親folderをviewer itemとして同じfolder page群を列挙し、選択pageから開始する。
standalone PDFはWindows.Data.Pdfのread-only `PdfDocument`としてpage countを列挙し、選択pageのDIP寸法から最大辺と
pixel上限内の出力寸法を先に算出して`PdfPageRenderOptions`へ指定し、boundedなPNGをviewerへ渡す。PDF page keyはbackend専用の
opaque keyとし、PDF本体をlibraryへ展開・変換保存しない。sourceはcanonicalizeしたpathでroot包含を検証し、WinRTの`StorageFile`境界でだけ
`\\?\`または`\\?\UNC\`接頭辞を通常のWindows pathへ戻す。1 GiBを超えるfileはWinRTへ渡さない。暗号化PDF、0 page、破損PDF、render size/pixel上限超過は分類したcatalogまたはpage単位errorで拒否する。書庫内PDFは現行契約の
対応entryではなくunsupportedとして扱う。
BMP、TIFF/TIF、ICOはboundedなpure-Rust decoderで実ピクセルを検証してPNGへ変換し、SVGはscriptを
解釈せず外部・埋め込みimage resolverを無効化した`resvg`でPNG化してからWebView2へ渡す。
JPEG/JPG、PNG、GIF、静止WebPは検証済みの原バイトと正しいMIMEをopaque media URLから渡す。
pageは相対page keyの自然順で管理する。単page、見開き、読み方向、fit/scale、正方形のルーペ、巻末policy、
bookmark、読書位置はviewer modelを介して整合させる。
bookmarkはcanonical library root namespace、作品item key、page keyの複合identityでapp-local SQLite schema v5へ保存し、原本やsidecarへ書き込まない。保存ordinalは表示用hintに限定し、移動時は現在のpage key列から再解決する。同一pageの再保存はupsert、削除はidempotentとし、作品ごとに最大10000件を上限にする。旧root-scoped localStorage行は作品を開いた時点で最大1000件ずつnative APIへ重複なく移し、全件成功後だけ当該作品の旧行を消す。失敗・cancel・stale generationでは旧行とviewerを保持する。
表示枚数modeはauto、single、spreadの検証済みenumとしてprofileとSQLiteへ保存する。見開き判定は純粋なviewer modelに集約し、両pageの幅/高さ比、先頭単独、1-based page番号の開始偶奇、最終余りを同じ順序で評価する。autoはpaged layoutかつviewer viewportの幅/高さ比が永続しきい値以上の場合だけ見開き判定を許し、ResizeObserverまたはwindow resizeで再評価する。既定値はP2-D互換のpage比100%、viewport比125%、先頭単独なし、偶奇制限なしとする。各比率は整数percentで保存・境界検証し、resizeはanchorを変えず、nextは判定済みの表示単位、previousは通過anchor履歴を使う。
通常のopenで対応archiveを選択した場合はviewerを全画面で開始し、明示した全画面・slideshow起動モードはそのまま優先する。
現在pageはtoolbarではなく、画像表示領域下部のrange slider式page移動barで総page数とともに示す。sliderはviewer modelの`go` commandへ接続し、任意のpageを表示する。
全画面中のviewer toolbarとpage移動barはlayout領域を占有せず、toolbarは画面上端、page移動barは画面下端へpointerを移動したときだけ表示し、各controlから画像領域へ離れると再び隠す。
viewer-stageの単clickはpage移動へ割り当てず、double clickは設定に依存しない全画面表示・解除のtoggleとして扱う。
viewer-stageはscrollbarを表示せず、表示領域を超える画像・連続layoutをpointer dragでpanする。drag中はpage送りswipeを発火しない。
page layoutの次表示候補は見開き全体をmedia取得・画像decodeまで先読みし、必要pageが揃うまで現在の表示を保持してから短いfadeで原子的に切り替える。
viewerのpage要求は現在表示を起点とするbounded windowに限定し、前後それぞれ0〜4pageを設定できる。page layoutと連続layoutは同じwindow計算を使い、利用者の遷移先だけはvisible優先度で不足pageを要求する。
scrollやsliderでanchorが移動した時点でwindowを更新し、open直後に書庫全pageの展開・decode要求をqueueへ投入しない。window外のfrontend URI・decode状態・errorは解放し、native media registryは16〜512MiBの設定上限を圧縮済みMemory grantへ適用して期限切れ・LRU順に除去する。上限より大きい単一pageはその1件だけを残し、無制限なgrant蓄積へ拡張しない。
全画面遷移と画面消灯抑止はfrontendの単一lifecycleで直列化する。Windowsの`PowerCreateRequest`/`PowerSetRequest`でdisplay-required handleを全画面遷移成功後だけ保持し、解除前・viewer unmount・application shutdownでは`PowerClearRequest`と`CloseHandle`を実行する。抑止取得失敗はnative全画面をrollbackし、全画面解除失敗は抑止を再取得するため、DOM・native window・OS requestの状態を食い違わせない。OSの永続電源設定、system-required、away modeは変更しない。
page layoutで表示内容が縦方向へoverflowする場合、page開始時のscroll位置を上端へresetし、共通next commandはviewport単位の下方向panをpage遷移より優先する。scroll末尾到達後のnext commandで次pageへ切り替える。
catalog sort順をまたぐviewer移動は、次巻を先頭page、前巻を末尾pageへ明示的に固定し、保存済みreading positionによる開始位置を上書きする。folder内画像を1冊として開いたviewerでは、最大16件に制限したcatalog snapshotから親一覧を取得し、未保持時は親folderを再列挙して巻順に使う。巻移動では通常のcatalog操作ではnavigation対象となるfolderもviewerへ直接渡し、backendでfolder内画像を列挙する。
viewer-stageの背景は濃いグレーの大きめなCSS市松模様を既定とし、濃灰、黒、明色の安全なpresetへ切り替えられる。page-spreadは設定された0〜64pxの周囲余白と0〜64pxの見開き間隔をCSS custom propertyで受け取り、画像の最大幅計算にも同じ間隔の半分を使う。
page layoutの見開きでは、通常の表示単位移動とは別にanchorを自然順で1だけ増減するmodel actionを提供する。この操作はpage範囲内でclampし、巻頭・巻末policyを呼び出さず、reading directionは表示順だけへ適用する。
cursor自動非表示はviewer-stage局所のtimerで管理し、設定時間後にstageのdata属性だけを切り替える。pointer移動・再入場・button操作で再表示し、drag中とルーペ有効時はtimerを停止する。toolbarとpage移動barのcursorには適用しない。

media URLにはhost pathを含めず、server-sideのsession/pageへ結び付いたopaque tokenを使う。
Windowsは`http://comic.localhost/<token>`へplatform-mapし、query/fragment、traversal、absolute/drive/UNC、
不正Origin/Referer、期限切れ・別session tokenを拒否する。応答は正しいMIME/length、`nosniff`、
限定CORSを持ち、内部errorや原本pathを開示しない。

navigationとviewerは別の単調増加generationを持つ。新要求は旧taskをcancelし、cancel不能区間の
完了結果もgeneration不一致ならcommitしない。page workerとthumbnail workerはbounded queueを使い、
shutdownは新規受付拒否、task cancel/join、読書位置flush、media grant失効、handle closeの順で進む。

## thumbnailとcache

thumbnailは対応archive・PDFでは自然順の先頭表示可能pageから、catalogに直接表示する画像では画像ファイル自身から生成し、長辺384px、拡大なし、JPEG quality 82を基本とする。folderは直下1階層の対応画像だけを自然順で評価し、先頭画像から生成する。サブfolder内の画像と直下archiveは候補にせず、直下画像がない場合は専用iconを表示する。
BMP、JPEG/JPG、GIF、TIFF/TIF、PNG、ICOはWindows標準WIC codec、静止WebPはWIC codecに依存しない
pure-Rust decoderを使う。SVGは安全な静止PNGにrasterize後、同じWIC JPEG encoderへ渡す。
animated GIFはviewerで原animationを渡しthumbnailは先頭frameを使う。animated WebP、破損画像、
過大dimensionは局所errorまたはplaceholderとし、他項目の操作を止めない。
PDFは先頭pageをWindows.Data.PdfでPNG renderしてから既存WIC JPEG encoderへ渡す。PDFのfingerprintは本体の
size/mtimeとpage keyを含め、生成物は既存thumbnail cacheだけへ保存する。

source fingerprintはfile size/mtimeと必要なarchive metadataを含む。生成物はtemp write後にatomic renameし、
DB transactionでindexを更新する。cache rootは`%LOCALAPPDATA%\ComicExplorer\cache`、自動生成thumbnailは
10GiB LRU、利用者が明示importするJPEG storeは3MiB上限でrootごとに分離する。生成中・表示中のentryを
pinし、negative cacheで破損fileの無限retryを防ぐ。

再帰サムネイル一括生成はnavigationと分離したRust generation/cancellationを持ち、現在folderまたはlibrary rootから候補を全件列挙して上限検証した後だけ生成へ進む。列挙はhidden設定を共有し、symlink/reparse pointを辿らず、深さ64、走査50,000項目、生成候補10,000件で停止する。folderは直下に対応画像があるもの、fileは対応画像・書庫・PDFだけを自然順の候補とする。各候補は既存2-worker queueへ1件ずつbackground priorityで投入し、visible/near要求へ譲りながら同じfingerprint、atomic cache write、negative cache、LRU/hard capを通す。各処理後はbatchのpinを解放し、破損・access errorを失敗件数へ集約して続行する。progress eventと最終reportはgenerationでgateし、新しいbatch、root変更、cancel、shutdownで旧結果を破棄する。

## SQLiteと利用者状態

SQLite WALはsettings、reading position、fingerprint、thumbnail index、favorite、tag、memo、history、
ratingなどのapp-local状態を保持する。SQLはRust repository境界だけから発行する。schema migrationは
短いtransactionで段階的・冪等に行い、失敗を成功として通知しない。

読書位置はitem identityとrelative page keyを正本とし、page追加・削除後は安全な近傍へ解決する。
DB破損または非対応schemaは元DBをapp-local `recovery`へ隔離して空DBで継続し、再初期化と隔離先を
通知する。原本から再構築できない利用者metadataはcacheと区別する。

## path安全性と明示的file操作

- 閲覧用filesystem adapterはread-onlyのまま保ち、変更操作は直列化した専用file-operation portへ隔離する。
- rename、create、deleteの対象はcanonical library root内の相対pathだけとする。copy/move先はWindows folder pickerまたは
  同一drive内のfolder drop target、paste元はCF_HDROPとして利用者が明示したpathだけを受け入れ、絶対pathをfrontend responseへ返さない。
- copy/move/pasteは同名targetを上書きせず、reparse point、source自身または子孫への操作、重複sourceを拒否する。
- 通常deleteはcanonical containmentの確認後、Windows Shellが受理する表示path形式でごみ箱へ送る。完全deleteはUIが対象名と復元不能性を確認した後だけ実行する。
- clipboard cut/copyはCF_HDROPとPreferred DropEffectを設定してWindows Explorerと相互運用し、paste成功後だけcut clipboardを消費する。
- catalogとfolder treeのfolder context pasteとdrag/dropはcatalogの現在位置ではなく操作対象のfolderをdestinationとする。tree folder自身も同一drive内のdrag sourceとし、treeのごみ箱deleteはcatalogと同じ確認dialogへ集約する。変更成功後はcatalogと展開済みfolder-tree branchを再列挙する。
- native ExplorerからのdropはRustが最大256件の絶対pathをcanonicalizeし、通常file/folder、重複、reparse point、衝突、source自身・子孫をpreview時と実行直前の両方で検証する。利用者が確認した後もcopyだけを許可し、外部sourceのmove、上書き、暗黙のopen・library登録は行わない。
- Explorerへのdrag-outはRustが検証済みlibrary内pathからWindows Shell `IDataObject`を構築し、`SHDoDragDrop`へcopy effectだけを渡す。TypeScriptはphysical座標から明示的なdrop targetを特定し、修飾keyと確認dialogを調整するだけで、path検証、file I/O、Shell payload構築を担当しない。
- archive entry名をlibrary側host pathへ結合せず、暗号化、未対応compression、traversal、再帰深度・個数・size上限超過を読む前またはstream境界で拒否する。
- cache、DB、profile、export、temp、recovery、logはlibrary root外だけに置く。
- CSVへはlibrary-root相対pathだけを出し、CSV formula-leading cellを無害化する。明示的なpath copyだけはOS操作用の絶対pathをclipboardへ出す。
- error回復は原本の修復、削除、上書きを自動実行しない。
- test/product harnessは閲覧操作では前後のtree、kind、size、mtime、hash、archive entry一覧が一致すること、
  file manager操作では選択targetだけが変更されることを比較する。

## 画面状態と主要操作

library shellは5分類menu、toolbar、address、folder/search side pane、catalog、status barから成り、root未選択時も
shellを表示してside paneのPC配下からdriveを選択できる。
toolbarの検索buttonはfolder treeと、名前検索・basename maskをまとめたsearch paneを切り替える。catalogは
詳細リスト、小サムネイル、表紙グリッド、カードグリッド、情報カードの表示順、sort、search result、selection、loading/empty/error、context menu、
rename/create/delete確認dialog、file-operation結果を区別する。
viewerはsingle/spread、direction、scale、loading/page error/end stateを区別する。page layoutの横幅フィットはpage-spreadをstage全幅・全高へ広げ、単pageは全幅、見開きはpage間gapを除く左右半分ずつを使う。画像のblock方向auto marginにより、stageより低い画像は上下中央へ置き、高い画像はauto marginを0として上端から下端まで余計な末尾余白なしでscrollさせる。全体フィットは読込み済みpageのnatural寸法とResizeObserverで得たstage寸法から純粋関数で共通倍率を求める。見開き全体基準はpage幅合計とgapを領域へ収め、page単位基準は最大page幅・高さを領域へ合わせて横overflowをpan対象として残す。page余白の算入有無と小画像の拡大許可を同じ計算へ渡し、縮小のみは100%、拡大許可は既存上限800%で制限する。寸法未確定・0・非有限なら従来CSS fitへfallbackする。任意倍率のUIは1〜800%の整数を内部scaleへ換算して表示・保存し、原寸寸法から表示幅または高さを1〜32768pxで指定して同じcustom scaleへ変換できる。fit系表示中の`+`/`-`は先頭pageの実表示倍率を取得してcustom scaleへ引き継ぐため、逆方向の連続操作で直前の大きさへ戻る。settings、quick access、
bookmark/bookshelf、tag、metadata、thumbnail maintenance、help/aboutは共通の余白、control、action、scroll表現を持つ
dialogまたはmenuから開き、settingsはcatalog、viewer、interface、入力、profileのカテゴリnavigationと、
名前・説明・現在値を対象にした検索で意味単位のsectionを切り替える。各設定は説明付きのrowとして表示し、
狭幅時はnavigationと内容を1列layoutにする。既定値復元、profile import、個別編集は同じdraftを更新し、
明示的な適用時だけ既存のatomic profile保存へ渡す。
Leeyes viewer外観設定とshell設定はfrontendとbackendで同じenum・数値範囲を検証し、app-local SQLiteへ既存設定と同じtransactionで保存する。strict profile v25は1〜4件のshortcut配列、catalog mouse割当、Viewer 4象限割当、詳細一覧の罫線・密度・任意列、現在folder自動更新、tree詳細、folder・画像・書庫/PDFのopen規則、背景preset、page周囲余白、見開き間隔、cursor自動非表示時間、倍率保持scope、grid、pan係数、wheel不感帯、page内scroll量、key repeat加速・連続動作、連続wheel速度、smooth指定、page走査mode、loupeサイズ・倍率、先読み前後page数・media memory上限、全画面Esc動作・display sleep抑止、tray最小化・close・復帰gesture、slideshow間隔・順序・反復、Viewerとcatalogの選択同期、shell surface、always-on-top、移動後初期選択、thumbnail生成範囲、起動場所、隠し項目表示、安全なcatalog配色preset、前回viewer復元、表示枚数と見開き条件、fit拡大・基準・余白算入を必須fieldとし、profile v1〜v24およびkeyがない既存SQLiteには各導入時の既定値または安全な移行値を補う。gridは画像と原本から独立した`pointer-events: none`のoverlayとする。always-on-topはnative window APIを先に適用し、失敗時はprofileを保存せず、backend保存失敗時はnative状態を元へ戻す。
native tray lifecycleはmain windowだけを対象にし、最小化時は設定有効・tray available・未格納の場合だけhideする。close-to-trayはclose requestを同期的にpreventしてからhideし、失敗時はshow・unminimize・focusへ回復するため明示Quitと混同しない。tray iconのsingle/double clickは保存済みgestureと一致し、かつstored状態のときだけ復帰を1回実行する。File menuとtray menuのQuitはwindow closeを経由せず`app.exit`へ進み、共通shutdownでDB・media・power requestを解放する。
folder移動後の選択は無選択・先頭・末尾・folder別の直前選択復元を共有policyとして扱い、検索結果から親へ戻る明示選択を常に優先する。thumbnail生成範囲は表示中25件、表示中と近傍40件、全項目を選べるが、いずれも既存bounded worker、LRU、negative cacheを迂回しない。起動復元は前回folderまたは同じdrive rootを選び、設定取得が停止してもshell起動を100msより長く待たせない。
native file pickerはWindows `IFileOpenDialog`へ対応拡張子filterを渡し、返されたregular fileをcanonicalize・readability・対応形式で再検証する。任意codeや外部appは起動しない。最近使った項目はSQLiteの読書履歴を新しい順20件に制限してFile menuと履歴dialogへ共有し、明示消去をrepository transaction境界で実行する。offline helpは同梱topicと現在のshortcutだけを検索・表示し、network locationを開かない。
特殊folderはWindows known-folder APIでDesktop、Downloads、Documents、Picturesの実在するcanonical folderだけを列挙し、通常のdrive登録・相対path検証を経て移動する。folder/catalog page列挙は先頭dotとWindows hidden属性を既定で除外し、profileで明示した場合だけ含める。catalog focus中の文字入力はNFKC・case非依存のbasename前方一致として1秒のsequenceへ束ね、同じ1文字の反復は次候補を循環する。IME composition、modifier入力、dialog、viewerへは伝播させない。catalog配色はsystem、paper、midnight、highContrastの検証済みpresetだけをCSS contractへ渡し、任意色入力を持たない。
名前検索式はRustのread-only search portでfilesystem走査前にtokenize・構文解析する。plain入力は従来の空白を含むcase・全半角英数非依存の部分一致、wildcard termはbasename全体への`*`・`?` matcherとし、括弧、NOT、AND、ORの順で短絡評価する。quoted termとbackslash escapeをliteral境界に使い、regex engineや外部query engineは導入しない。入力1024文字、128 token、括弧16階層を上限として不正式は`INVALID_REQUEST`へ変換し、root canonicalize・directory列挙・検索option評価より前に停止する。frontendは式を解釈せず構文案内と修正可能なerrorだけを表示し、mask側との共通構文は同じcontract caseで照合する。

横断検索のsource正本もRust command境界に置く。現在library rootとWindows folder pickerでcanonicalize・readability検証を通過したfolderだけをsession allowlistへ登録し、frontendから渡された未承認絶対pathは拒否する。最大8 sourceを入力順に同じRust search portへ渡し、複数sourceではroot相対の固定folderを無効化する。結果はcanonical absolute item keyのcase-insensitive Setで統合して重なるsourceでは先行sourceを残し、合計50,000件で停止する。frontendはsourceの追加・削除、resultのsource/relative path表示、選択resultのsourceを既存root登録境界へ戻すcoordinationだけを担当し、検索、path検証、重複判定、上限判定を複製しない。source listはsession限定でSQLite、profile、library原本へ保存しない。

現在folderの自動更新はRustの`notify` OS backendを最大1 watcherだけ保持する。watch commandはroot相対pathを既存`RelativePath`とcanonical containmentで再検証し、表示中directoryを非再帰で監視する。native callbackはaccess eventを除外し、専用thread/channelで最初のeventから250msの固定windowをcoalesceして、generation、root、relative pathだけをTauri eventへ渡す。frontendは一致するcurrent generation/root/pathかつ設定有効時だけ既存`list_folder`を再実行し、残存selectionを復元する。folder移動時は新watcherで置換し、無効化とshutdownではdrop時にnative watcher、sender、workerを順に閉じる。watch errorは安全な局所messageへ変換してF5を残し、raw OS error、network全体、下位folder、書庫内部、検索sourceを監視しない。

catalog項目のactivationはTypeScript側でdouble click、Enter、Ctrl+Enterとtyped item kindを収集し、Rustの`resolve_catalog_activation`だけがSQLiteの保存済み規則から`navigate`、`read`、`none`を決定する。frontendはcurrent generationの成功応答だけを既存navigation/viewer portへdispatchし、stale、cancel、errorでは推測実行しない。Ctrl+Enterは画像・書庫・PDFの明示的な強制読書だけに限定し、folder、unsupported file、外部app、書庫tree、新しいfilesystem権限へ広げない。

catalog mouse割当はRustの完全shape registryを設定の正本とし、primary、double、middle、back、forwardの5 gestureと既知の非破壊actionだけをSQLite/profile保存前に検証する。TypeScriptはWebViewが直接観測するbutton・modifier、primaryとdoubleを分離する250ms timer、設定draft、Rust検証済みactionの既存handlerへのdispatchだけを担う。primary selection、modifier複数選択、context menu、drag、favoriteは固定操作として先に処理し、double成立時は待機中のprimary追加actionを破棄する。middle/back/forwardはbrowser既定動作を抑止してevent対象を選択するが、delete、file操作、外部app、global hook、機器固有buttonへ拡張しない。

Viewer 4象限割当もRustの完全shape registryを設定の正本とし、top-left、top-right、bottom-left、bottom-rightと既知Viewer actionだけをSQLite/profile保存前に検証する。TypeScriptはstageのbounding rectとclient座標による固定個数の象限判定、mouse primary・modifier・4px移動境界、250ms timer、既存Viewer commandへのdispatchだけを担う。stage中央の境界はright/bottomへ含め、物理領域の割当は読書方向から独立させる。touch、pen、pan、swipe、middle/side button、wheel、固定double click全画面切替を優先し、拡大画像でも4px未満のmouse clickだけを象限actionとして扱う。任意code、外部app、filesystem、global hookはこの経路へ接続しない。

Viewer右click割当は同じRustの既知Viewer action registryを正本とし、strict profile v26とSQLiteの保存前に`none`を含む単1 actionを検証する。TypeScriptはWebView stageのmouse right-button down/up、modifier、4pxの移動境界、right-wheel成立時の取消、Rust検証済みactionの既存handlerへのdispatchだけを担う。右button+wheel、touch、pen、pointer cancel、window blur、toolbar/dialog/controlを優先し、catalog・folder treeのfile-operation context menuは固定境界のまま変更しない。filesystem、外部app、任意code、global hookへは接続しない。

矩形ズームはRustのresolve_viewer_rectangle_zoomを計算正本とし、viewport、selection、scroll、現在倍率の有限値・包含・上限をIPC境界で検証した後だけ、1〜800%の目標倍率と選択中心を保つscroll位置を返す。TypeScriptはWebViewでしか観測できないpointer座標、capture、stage内clamp、一時overlay、Rust planの既存scale/scroll DOM adapterへの適用だけを担う。toolbarの明示toggleからpaged layoutで1回だけarmedとし、通常pan・象限・mouse gesture・wheelを優先させず完全に分離する。overlayとarmed stateはsession限定で、原本、profile、SQLite、bookmark、cacheへは保存しない。

外部アプリ連携はRustのapp-local SQLite registryとWindows native `.exe` pickerをallowlist境界とする。登録時と起動時にcanonical regular file・非reparse・拡張子を検証し、表示名、最大16個の固定literal引数、先頭・全選択・親folderの対象modeだけを保存する。起動対象は既存library root containmentを最大64件へ適用し、previewと確認後のplanを再計算して一致するopaque keyだけを受理する。processはshell文字列、placeholder、環境展開を使わずRust `Command::new`へ各引数を個別に渡す。履歴は最大20件のapp ID・表示名・mode・件数・時刻だけとし、file pathと引数を保存しない。TypeScriptはWebViewの選択、登録・編集draft、確認dialog、Tauri orchestrationだけを持ち、実行file path、allowlist、quoting、process、履歴正本を持たない。任意DLL/plugin loadと対象外の実行file直接起動は導入しない。

一括名前変更はRustのfile-operation境界を正本とする。2〜256件のlibrary内source、基本名、separator、開始番号、桁数、拡張子保持設定から実行順を固定し、Windows名規則、canonical containment、reparse、欠落、大小文字を無視した重複、既存target衝突をpreview前と実行直前に検証する。previewは相対pathとopaque keyだけを返し、同じ入力から再計算したkeyと明示確認が一致するときだけfile-operation mutex内で順次renameする。途中失敗時は完了済み項目を逆順rollbackし、rollback失敗も隠さず返す。設定は既存profileと分離したSQLite keyへ保存する。TypeScriptは単一名入力の選択範囲、複数選択、設定draft、preview確認、Tauri orchestrationだけを担当し、連番生成、拡張子解析、衝突判定、filesystem変更を実装しない。

用途別設定profileは任意の外部設定fileを標準保存先へせず、app-local SQLite schema v8の最大16件のnamed strict snapshotとして管理する。Rustは名前、件数、大小文字を無視した一意性、全field schema/value、保存・上書き、active判定、変更field数、snapshot内容へ結び付くopaque keyを正本とする。切替はpreviewと明示確認後にsnapshotを再読込・再検証し、現行settings全体とactive名を1 transactionで保存する。active snapshotの削除・上書きを拒否し、通常の設定保存はsnapshotを暗黙更新せずactive markerを解除する。library root、履歴、bookmark、pathはsnapshotへ含めない。TypeScriptは名前入力、一覧、上書き・削除・切替確認、native topmost adapter、成功したprofileのReact state反映、Tauri orchestrationだけを担当し、snapshot JSON、validation、active state、transactionを持たない。

CSV出力はRustの`application::csv_export`を唯一のschema・preset・生成正本とする。ordered column、header、bytes/KiB/MiB、literal filename delimiterをRustがstrict validationし、app-local SQLite schema v9へ最大32 presetを保存する。選択、現在folder直下、recursiveの各scopeはfrontendの表示snapshotを信用せず、Rustが現在のlibrary rootとhidden設定から再列挙する。選択はcurrent folderのdirect child完全一致だけを許可し、recursiveはsymlink/reparseを追跡せず深さ64、50,000行、16 MiBで停止する。RustがUTF-8 BOM、CRLF、quote、formula-leading cellの無害化、相対path限定、決定的な単位丸め、最大4部分の名前分割を完了してbyte列を返す。TypeScriptはWebViewの設定入力、preset上書き・削除確認、scope・選択値、Tauri orchestration、Blob downloadだけを担当し、CSV escape、単位計算、filename解析、filesystem traversalを持たない。対象外のCLIや外部CSV設定fileへは波及させない。

CLI起動はRustの`application::cli_launch`をargument・path・queueの正本とする。OSが分割したargumentだけを受け、`-f`/`--fullscreen`、`-s`/`--slideshow`、`--`、1個のpathをbounded parserで検証し、cwd相対解決、canonicalization、readability、対応file kindをfilesystem上で確認してlibrary root・相対item・launch modeのplanに変換する。shell文字列、quote再解析、environment/wildcard展開を持たない。公式`tauri-plugin-single-instance`はbuilderの最初のpluginとし、後続起動のargumentとcwdを既存processへ渡してmain windowをshow・unminimize・focusする。検証結果はRust内の最大16件FIFOに保持し、超過は既存要求を捨てず後続通知とする。TypeScriptはeventをwake-up signalとしてqueueを順次取得し、Rustが返す検証済みplanを既存library登録、catalog読込、viewer、全画面、slideshowへ適用するだけで、argument parser、path結合、filesystem判定、single-instance IPC、queueを実装しない。

詳細一覧の書式はRustのstrict settings profileを正本とし、`none`・`horizontal`・`both`の罫線、`compact`・`standard`・`comfortable`の密度、種別・サイズ・更新日時の表示booleanだけを保存する。frontendは同じ検証済み値をCSS data attributeと共有grid-template variableへ写像し、headerとrowの列構成を一致させる。狭幅では更新日時、次に種別・サイズを視覚的に縮退してもbuttonのaccessible nameにはmetadataを残す。高さはvirtualizerのestimateと実測を再計測し、一覧全件DOM化や項目単位の書式stateを作らず、他の一覧形式と原本・metadata・cacheを変更しない。

catalog maskも同じRust `search_query` parser・非regex matcherを使う。frontendは現在snapshotからbasenameだけを最大100,000件のbatchとして`evaluate_catalog_mask`へ渡し、返された位置対応booleanだけで既存のsorted catalogを絞り込むため、maskごとのfilesystem再走査、native I/O、TypeScript側の構文複製を行わない。draftはEnterまたは適用buttonまで表示へ反映せず、invalid・cancel・stale generationは最後のvalidな適用済みmaskと選択を保持する。既存semicolon区切りはquoted/escaped境界を尊重して最外ORへ変換し、式全体で1024文字・128 token、各basename 1024文字を制限する。

mask詳細条件は同じbatch candidateへ種別、size、更新時刻metadataを添え、Rustで名前式とのANDとして評価する。folder/file条件を先に、次に欠落metadataを含むsize・半開日付範囲、最後に名前式を短絡評価し、frontendへ式解釈を戻さない。名前付きmaskはlibrary原本やprofileではなくapp-local SQLite schema v6の`catalog_masks`へ最大32件保存し、name primary keyのupsert transactionで同名置換する。listは更新時刻降順、削除は確認状態をUIに提示した後の専用commandとし、保存・復元は表示中maskと独立したdraftだけを変更する。
viewerのrandom commandは2page以上で現在pageを除いた候補へ一様写像し、1pageでは無操作とする。前回viewer復元は既定無効の明示opt-inとし、library rootの復元完了後にSQLiteの最新成功履歴を通常のopen境界へ渡す。欠落・removable sourceの失敗時もshellと履歴を保持する。
viewerのpage内scrollはnext/previousの共通commandより先にoverflowを解決し、設定されたviewport比率で前後へ対称に進める。標準modeは縦方向だけ、N字は縦を終えてから読書方向の次列へ移るcolumn優先、Z字は読書方向の横を終えてから次行へ移るrow優先の純粋なtarget計算を共有し、previousは同じ経路を逆算する。右開きは右端、左開きは左端を開始位置とし、行/列切替のleft/topを1回の`scrollTo`へ渡す。smooth指定はnative `scrollTo`へ限定し、`prefers-reduced-motion`時は常に即時移動へ縮退する。連続layoutのwheelはpixel・line・pageの`deltaMode`をそれぞれ1px・16px・対象viewportへ正規化してから50〜200%係数を適用する。pointer panは既存のcaptureと係数を使い、release後の慣性timerを作らないため、page decode・navigationと分離される。
modifierなし矢印keyのpage内scrollはpaged Viewerの既存overflow surfaceだけを上下左右へ移動し、通常keydownでは設定済みviewport比率、repeatではRust検証済み100〜300%の加速率を掛ける。連続動作を無効にした場合はrepeat eventを消費し、有効時も各軸の端へ達するまでだけpanする。左右矢印が該当端へ達した後は同じeventでoverflow走査を二重適用せず、既存の読書方向page commandへ進む。PageUp/PageDownと割当済み前後page commandは既存走査順を保って同じ量・repeat加速を共有する。focus、modifier、IME compositionとreduced-motionの判断はWebView event adapterに限定し、repeat timerや永続化をTypeScriptへ複製しない。
loupeは表示済みimageと同じlocal media URIを内部CSS background surfaceへ再利用し、別decode・canvas・原本変換を作らない。80〜400pxの正方形と125〜800%の倍率だけを受理し、pointerのimage座標とloupe中心を個別にclampする。stageがloupeより小さい場合は中心をstage中央へ固定して外側への拡大を抑え、page/scale/pointer lifecycleで一時stateを破棄する。surfaceだけに現在pageと同じ回転・反転を適用し、loupe枠とgrid overlayはscreen軸に固定する。
slideshowはviewer内の単一timeout stateとして2page以上でtoolbarから開始・停止し、context menuのslideshow起動は同じ保存済み設定で開始する。profile v16とSQLiteで0.5〜60秒の間隔、順方向・逆方向・random、現在作品の反復有無を共有する。順方向・逆方向の反復無効は通常の前後commandと既存巻末/巻頭policyを使い、反復有効は現在作品の端で反対端へ移動する。randomは現在page以外をFisher-Yatesでpage数以下のqueueへshuffleし、1 cycle内で重複せず、反復無効ならcycle末尾で停止、反復有効なら直前pageを除く次cycleを作る。Leeyesのrandom重複規則は未確認のため、このbounded shuffle-bagを安全で予測可能な独自挙動として採用する。document visibilityとwindow focusを別stateで監視し、background・blur、設定変更、手動移動、表示単位変更で古いtimeoutを破棄し、復帰・変更後は新しいintervalを開始する。page decode/prefetch、読書位置保存、viewer終了cleanupは既存境界を共有する。
viewerの画像clipboard出力はRust native commandを中核とする。TypeScriptは現在のanchor pageを指定し、重複操作と古い結果表示だけを抑止する。Rustはfolder・archive・PDFを既存のcontained path、entry上限、PDF render境界で読み、static WebPを含む対応形式をEXIF向き適用後の32bpp BGRAへdecodeする。出力はtop-downの`CF_DIBV5`とし、透明度を保持する。source・長辺・pixel・payload上限とchecked arithmeticをallocation前に検証し、global memoryのallocate・lock・copyを`EmptyClipboard`より先に完了する。`SetClipboardData`成功時だけownershipをOSへ渡し、失敗したhandleはRust側で解放するため、原本・viewer media・他のclipboard形式を共有実装へ混在させない。
Viewerとcatalogの選択同期はprofile v17・SQLiteの既定有効booleanで制御する。Viewerのpage callbackはsessionとviewer generationが一致し、かつ現在navigationのcatalog snapshotが読み込み済みの場合だけ反映する。visible path集合はcatalog変更時に1回だけ構築し、page移動ごとは現在page、次にitem keyの最大2回のindexed lookupとする。画像folderではpage path、archive・PDF・comic folderや次巻・前巻ではitem keyを単一selectionとanchorへ設定し、候補が検索・mask・別folderで不可視ならnavigationや既存selectionを変えない。Viewer終了後は既存CatalogGridのvirtualizerがactive selectionをscroll範囲へ戻すため、追加native I/O、polling、page数比例stateを作らない。
viewerの回転・反転は原画像、Rust decode、media grant、clipboard、cacheを変更しないsession内の表示状態とする。page indexをkeyとする疎なMapに非identity状態だけを保持し、現在anchorへの時計回り90度、screen軸の左右・上下反転、resetをO(1)で合成する。90度・270度ではnatural寸法の縦横を入れ替えてauto spread判定とfit倍率へ渡し、CSS transformをmain imageとloupe surfaceへ同じ順序で適用する。固定keyは`]`、`H`、`V`、`0`とし、modifier、編集control、contenteditable、dialogからは発火させない。Viewerを閉じるとMapを破棄し、profile・SQLite・原本へ保存しない。
巻末policy resolverは現在folderのsort済みcatalog snapshotを入力とし、archive、PDF、画像folderを同じvolume列へ写像する。auto/confirmは次volume、loopは最終volumeから先頭volumeへ進み、stopとreturn-libraryは次volumeの有無より先に判定する。したがってreturn-libraryは最終volumeでもviewerを閉じ、stopは常にpolicy停止として説明する。snapshot取得失敗、現在identity不明、stale generationはopenへ進めず、前巻移動は同じ列の直前volumeを末尾pageから開く。
巻末動作は閲覧している作品の文脈でviewer toolbarから変更し、app-local設定へ保存する。

keyboard focusとselectionは別状態で、menuはroving focusを使う。tree/catalog/viewerの主要操作はkeyboard、
pointerのどちらからも同じcommandへ到達する。catalog cardのfolderとcomic folderはダブルクリックまたはEnterでそのfolderへ移動し、archive、PDF、画像だけをviewerへ開く。重複する読むbuttonは置かない。
viewerのpointerによるpage移動はtoolbar、wheel、左右swipeに限定し、double clickは全画面切替へ固定する。
サムネイル系cardは画像と文字を別のgrid領域に配置して画像の縦横比で名前を侵食させない。小サムネイルと表紙グリッドは縦型の画像優先layoutとして種別ラベルを省く。カードグリッドは既定216px幅の大判表紙だけを2:3で配置し、視覚上のファイル名、種類icon、metadata領域を生成しない一方、項目のaccessible nameには名前・種別・サイズ・更新日時、titleには名前・種別を保持する。カードグリッドのitem寸法はthumbnail寸法と一致させ、外側の枠線とpaddingを置かず、行・列とも4px間隔で密に並べる。hoverとselectionは寸法を変える枠線ではなくthumbnail上の半透明overlayで示す。情報カード（既存内部値`reference_tile`）は横長の情報優先layoutとして左側の表紙と右側のファイル名、種別、サイズ、更新日時を明確に分ける。お気に入りtoggleは小サムネイル、表紙グリッド、カードグリッドでは表紙の左上、情報カードでは情報領域の右上へ置く。4つのサムネイル形式はそれぞれ独立した保存済みthumbnail幅を使い、ウィンドウ幅変更時はthumbnailを拡縮せず列数だけを変更する。profile v3で導入した4つの必須幅をprofile v4/v5でも検証し、旧profile v1には全既定値、v2には新しいカードグリッドの既定値を補って移行する。backendは同じ値を範囲検証してapp-local SQLiteへatomicに保存する。
shortcut編集はoptionsの統合設定だけから行い、catalogとviewerのcommandをgroup、1〜4個のkeyboard binding、割り当て済みmouse入力、
説明の同一表で扱う。Rustのshortcut registryは既知command、正規key、順序、件数、command内重複、command間と予約済みapp操作の衝突を検証し、SQLiteへ配列としてatomicに保存する。strict profile v22も配列を必須とし、v1〜v21と既存SQLiteの単一文字列は1要素配列へ移行する。TypeScriptはkeyboard eventを正規形へ変換してRust検証済み配列を即時照合し、draft UIとdispatchだけを担う。mouseはviewer stageで直接観測できる
左右swipe、wheel、右button+wheel、middle/side buttonだけをcommandへ変換する。page layoutの通常wheel以外の
scroll layout、Ctrl+wheel、double clickは既存のscroll、zoom、fullscreen境界を維持する。旧設定mapは既知の旧key集合だけを
新しい既定値へmergeし、旧割り当てと新command既定値が衝突した場合は旧割り当てを優先して新commandだけを未使用keyへ退避する。
未知key、invalid入力、profileの欠落fieldは拒否する。helpは現在のkeyboard割り当てをread-onlyで表示する。
stale responseは現在画面を置換せず、局所error後もretry、
前後移動、別項目open、catalog復帰を可能にする。

## errorと回復

backend errorはcode、target、user message、安全なrecovery、retry可否を持つ。利用者向け分類はaccess、
missing、unsupported、corrupt、encrypted、temporarily unavailable、app-data resetである。thumbnail errorは
item局所、page errorはviewer局所、root/DB起動errorだけをshell-levelにする。stack traceや原本内容を
主メッセージへ出さず、telemetry/crash uploadを行わない。

## 現在の設計判断

Tauri/React/Rust、SQLite bundled、ZIP互換（ZIP/CBZ/EPUB）Stored/Deflate、UnRARによるRAR/CBR、
`sevenz-rust`による7z/CB7、`delharc`によるLZH読取、opaque media token、bounded worker、app-local cacheを
採用済みとする。比較検討と実装phaseの完了履歴はGit履歴から参照する。Windows製品性能、
clean VM、UIA/DPI、外部通信監視、GIF/AVIF decode、tray/file pickerの実製品gateは
設計未決ではなく検証未完了であり、[status.md](status.md)と[verification.md](verification.md)で追跡する。
