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
viewerのpage要求は現在表示を起点とするbounded windowに限定し、連続layoutでも現在pageから最大4page先までだけを要求する。
scrollやsliderでanchorが移動した時点でwindowを更新し、open直後に書庫全pageの展開・decode要求をqueueへ投入しない。
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
Leeyes viewer外観設定はfrontendとbackendで同じenum・数値範囲を検証し、app-local SQLiteへ既存設定と同じtransactionで保存する。strict profile v10は背景preset、page周囲余白、見開き間隔、cursor自動非表示時間、倍率保持scope、grid、pan係数、wheel不感帯、page内scroll量、連続wheel速度、smooth指定、shell surface、always-on-top、移動後初期選択、thumbnail生成範囲、起動場所、隠し項目表示、安全なcatalog配色preset、前回viewer復元、表示枚数と見開き条件、fit拡大・基準・余白算入を必須fieldとし、profile v1〜v9およびkeyがない既存SQLiteには各導入時の既定値を補う。gridは画像と原本から独立した`pointer-events: none`のoverlayとする。always-on-topはnative window APIを先に適用し、失敗時はprofileを保存せず、backend保存失敗時はnative状態を元へ戻す。
folder移動後の選択は無選択・先頭・末尾・folder別の直前選択復元を共有policyとして扱い、検索結果から親へ戻る明示選択を常に優先する。thumbnail生成範囲は表示中25件、表示中と近傍40件、全項目を選べるが、いずれも既存bounded worker、LRU、negative cacheを迂回しない。起動復元は前回folderまたは同じdrive rootを選び、設定取得が停止してもshell起動を100msより長く待たせない。
native file pickerはWindows `IFileOpenDialog`へ対応拡張子filterを渡し、返されたregular fileをcanonicalize・readability・対応形式で再検証する。任意codeや外部appは起動しない。最近使った項目はSQLiteの読書履歴を新しい順20件に制限してFile menuと履歴dialogへ共有し、明示消去をrepository transaction境界で実行する。offline helpは同梱topicと現在のshortcutだけを検索・表示し、network locationを開かない。
特殊folderはWindows known-folder APIでDesktop、Downloads、Documents、Picturesの実在するcanonical folderだけを列挙し、通常のdrive登録・相対path検証を経て移動する。folder/catalog page列挙は先頭dotとWindows hidden属性を既定で除外し、profileで明示した場合だけ含める。catalog focus中の文字入力はNFKC・case非依存のbasename前方一致として1秒のsequenceへ束ね、同じ1文字の反復は次候補を循環する。IME composition、modifier入力、dialog、viewerへは伝播させない。catalog配色はsystem、paper、midnight、highContrastの検証済みpresetだけをCSS contractへ渡し、任意色入力を持たない。
viewerのrandom commandは2page以上で現在pageを除いた候補へ一様写像し、1pageでは無操作とする。前回viewer復元は既定無効の明示opt-inとし、library rootの復元完了後にSQLiteの最新成功履歴を通常のopen境界へ渡す。欠落・removable sourceの失敗時もshellと履歴を保持する。
viewerのpage内scrollはnext/previousの共通commandより先にoverflowを解決し、設定されたviewport比率で上下へ対称に進める。smooth指定はnative `scrollTo`へ限定し、`prefers-reduced-motion`時は常に即時移動へ縮退する。連続layoutのwheelはpixel・line・pageの`deltaMode`をそれぞれ1px・16px・対象viewportへ正規化してから50〜200%係数を適用する。pointer panは既存のcaptureと係数を使い、release後の慣性timerを作らないため、page decode・navigation・N/Z走査の責務と分離される。
slideshowはviewer内の単一timer stateとして通常のnext commandへ接続し、2page以上でtoolbarから開始・停止する。context menuのslideshow起動は既定3秒の開始状態を渡すが、timer自身はpage decode/prefetchと巻末policyを置き換えない。document visibilityとwindow focusを別stateで監視し、background・blurでtimerを破棄、復帰時に新しいintervalを開始する。詳細な間隔、順序、反復、random policyはprofileへ追加する後続LEY-VIEWER-008の責務とする。
巻末policy resolverは現在folderのsort済みcatalog snapshotを入力とし、archive、PDF、画像folderを同じvolume列へ写像する。auto/confirmは次volume、loopは最終volumeから先頭volumeへ進み、stopとreturn-libraryは次volumeの有無より先に判定する。したがってreturn-libraryは最終volumeでもviewerを閉じ、stopは常にpolicy停止として説明する。snapshot取得失敗、現在identity不明、stale generationはopenへ進めず、前巻移動は同じ列の直前volumeを末尾pageから開く。
巻末動作は閲覧している作品の文脈でviewer toolbarから変更し、app-local設定へ保存する。

keyboard focusとselectionは別状態で、menuはroving focusを使う。tree/catalog/viewerの主要操作はkeyboard、
pointerのどちらからも同じcommandへ到達する。catalog cardのfolderとcomic folderはダブルクリックまたはEnterでそのfolderへ移動し、archive、PDF、画像だけをviewerへ開く。重複する読むbuttonは置かない。
viewerのpointerによるpage移動はtoolbar、wheel、左右swipeに限定し、double clickは全画面切替へ固定する。
サムネイル系cardは画像と文字を別のgrid領域に配置して画像の縦横比で名前を侵食させない。小サムネイルと表紙グリッドは縦型の画像優先layoutとして種別ラベルを省く。カードグリッドは既定216px幅の大判表紙だけを2:3で配置し、視覚上のファイル名、種類icon、metadata領域を生成しない一方、項目のaccessible nameには名前・種別・サイズ・更新日時、titleには名前・種別を保持する。カードグリッドのitem寸法はthumbnail寸法と一致させ、外側の枠線とpaddingを置かず、行・列とも4px間隔で密に並べる。hoverとselectionは寸法を変える枠線ではなくthumbnail上の半透明overlayで示す。情報カード（既存内部値`reference_tile`）は横長の情報優先layoutとして左側の表紙と右側のファイル名、種別、サイズ、更新日時を明確に分ける。お気に入りtoggleは小サムネイル、表紙グリッド、カードグリッドでは表紙の左上、情報カードでは情報領域の右上へ置く。4つのサムネイル形式はそれぞれ独立した保存済みthumbnail幅を使い、ウィンドウ幅変更時はthumbnailを拡縮せず列数だけを変更する。profile v3で導入した4つの必須幅をprofile v4/v5でも検証し、旧profile v1には全既定値、v2には新しいカードグリッドの既定値を補って移行する。backendは同じ値を範囲検証してapp-local SQLiteへatomicに保存する。
shortcut編集はoptionsの統合設定だけから行い、catalogとviewerのcommandをgroup、keyboard、割り当て済みmouse入力、
説明の同一表で扱う。keyboardはcommand間と予約済みapp操作の衝突を拒否し、mouseはviewer stageで直接観測できる
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
