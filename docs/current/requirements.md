---
codd:
  node_id: "req:project-requirements"
  type: requirement
  status: approved
  confidence: 0.95
---

# Comic Explorer 現行要件

## 目的と正本

Comic Explorerは、Windows上のローカルドライブをExplorer風の画面で探索し、
画像フォルダと対応書庫を安全に閲覧するデスクトップアプリである。本書は実装完了後の
保守契約の正本であり、受入結果は[verification.md](verification.md)、現在状態は
[status.md](status.md)、技術境界は[architecture.md](architecture.md)を正とする。

統合前の詳細な受入条件と判断履歴はGit履歴から参照・復元できる。変更時は本書の安定IDを
維持し、未測定項目を実装済みまたはPASSへ推定しない。

## 範囲

対象は、サイドバーで選択したローカルドライブ内の階層移動、catalog、thumbnail、検索、viewer、読書位置・
利用者metadata、app-local設定/cache、Windows配布である。BMP、JPEG/JPG、GIF、TIFF/TIF、PNG、
ICO、SVG、静止WebP、PDF、ZIP/CBZ/EPUB/RAR/CBR/7z/CB7/LZHを実装済み範囲とする。WICは画像形式ではなく、
Windows標準codecが扱うraster画像のdecode基盤として利用する。AVIFには実装済みの安全な
分類・拒否境界があるが、製品decodeの受入は未完了である。

対象外は、クラウド同期、外部書誌取得、telemetry、外部データ送信、library原本への自動変更である。
明示的な利用者操作に限り、catalogおよびfolder treeのcontext menuからOS全体を対象とするfile manager操作を提供する。

## 恒久安全原則

- すべての閲覧経路はlibrary原本、書庫、mtime、sidecarを変更しない。原本変更はfile managerの
  明示操作と確認を経た対象だけに限定する（REQ-MVP-017、REQ-MVP-021）。
- DB、設定、cache、temp、recovery、logはlibrary root外のapp-local領域だけへ保存する。
- 漫画データ、path、読書情報、利用状況を外部送信せず、通常利用はofflineで完結する（REQ-MVP-018）。
- UIへ絶対path、任意SQL、任意archive entry accessを公開せず、backendでroot境界とpathを検証する。
- 未測定、未実行、外部環境待ちはPASSではない。

## MVP機能要件

| 安定ID | 現行契約 |
|---|---|
| REQ-MVP-001 | library rootの登録画面や手入力設定を要求せず、release executableの起動時にconsoleやterminal windowを表示しないまま、PC配下のWindows論理ドライブをサイドバーへ列挙する。ドライブ選択時はそのドライブを安全境界として閲覧を開始し、最後に使用したドライブをapp-local設定から復元できる。旧版でfolder単位のlibrary rootが保存されている場合は、そのドライブと階層へ自動移行する。debug buildは診断用consoleを維持してよい。 |
| REQ-MVP-002 | 固定metadataを要求せず任意のfolder階層を扱う。 |
| REQ-MVP-003 | folder treeはPC、論理ドライブ、folderの階層をExplorerと同様に表示し、ドライブおよびfolderの展開・選択と現在folderを同期する。tree nodeは14px基準の約11px文字、24px固定行高、16px幅の展開記号列、14px幅の種類icon列を使い、展開記号とiconの間にnodeの左paddingを置かないcompact表示とする。利用者が開いたbranchは、current folderの移動、別driveとの往復、検索pane表示、treeの一時非表示では自動的に閉じず、明示的な個別折りたたみまたはtree上部の「すべて閉じる」で閉じる。tree上部には現在folderのExplorer形式absolute pathを表示する。別ドライブの選択時は安全境界とcatalogをそのドライブへ切り替える。 |
| REQ-MVP-004 | address入力、icon toolbarの戻る・進む・上へ・address移動、file menuの履歴移動を選択中ドライブ内で行う。addressにはWindows Explorerと同じ通常の絶対pathを表示し、内部canonical pathの拡張長接頭辞`\\?\`（UNCの場合は`\\?\UNC\`）を表示しない。address入力はWindows Explorerの「パスのコピー」による引用符付き絶対pathを受理し、slash・大文字小文字を正規化したうえでdriveとpath segment境界を厳密に判定する。別ドライブの絶対path入力時は安全境界をそのドライブへ切り替えて移動する。 |
| REQ-MVP-005 | folder、漫画folder、対応archive、画像をcatalogに表示し、未対応fileの種別にはfile名の拡張子をそのまま表示する。thumbnailを表示できないfolderとarchiveには、それぞれを判別できる専用iconを表示する。ファイル名を表示する一覧形式では名前の左端に種類iconを常時表示し、画像、folder（漫画folderを含む）、archive、PDF、未対応fileを表紙thumbnailの有無によらず判別できるようにする。ファイル名を表示しないカードグリッドでは、項目のaccessible nameとhover説明に名前と種別を保持する。 |
| REQ-MVP-006 | 対応archive・PDFは自然順の先頭pageから表紙thumbnailを生成し、catalogに直接表示する対応画像はその画像自身のthumbnailを生成する。folderは直下1階層だけにある対応画像を自然順で並べた先頭からthumbnailを生成し、サブfolder内の画像や直下archiveは表紙候補として走査しない。直下に対応画像がないfolder項目には専用iconを表示する。thumbnailは選択したsourceを含むfingerprintとcache鮮度を管理する。 |
| REQ-MVP-007 | catalog toolbar buttonから並べ替え、昇降順、一覧形式のmenuを操作し、viewer toolbarから巻末動作を操作して、設定を保存する。一覧形式は詳細リスト、小サムネイル、表紙グリッド、カードグリッド、情報カードの順に提示し、小サムネイル、表紙グリッド、カードグリッド、情報カードそれぞれのthumbnail幅を設定画面から変更して保存・復元できる。 |
| REQ-MVP-008 | 画像folderおよび対応archive内のBMP、JPEG/JPG、GIF、TIFF/TIF、PNG、ICO、SVG、静止WebPを1冊として相対pathの自然順で読み、catalogの画像を直接開いた場合は同じfolderのpage群を選択画像から開始する。raster画像はWICまたは専用decoderで実ピクセルを検証し、SVGはscriptと外部resourceを実行・取得せずに表示とthumbnail生成を行う。 |
| REQ-MVP-009 | ZIP/CBZ/EPUB、単一volume・非暗号化RAR4/RAR5（RAR/CBR）、非暗号化7z（7z/CB7）、LHA/LZH（LZH）を隣接展開せず、対応圧縮entryを検証し、格納画像を自然順で読む。対応書庫内の対応書庫は形式を混在でき、内側3階層・内側書庫64個・内側書庫の展開データ累計512 MiBを上限として再帰的に読む。分割RAR、暗号化書庫、未対応圧縮方式、EPUBのHTML本文組版は対象外とする。書庫ごとのentry数・展開後entry size・展開後合計size上限、危険path拒否、原本非破壊を共通に保証する。 |
| REQ-MVP-010 | catalogのfolder（漫画画像を含むfolderを含む）はダブルクリックまたはkeyboardでviewerを開かず、そのfolderへ移動する。親folderから子folderへ移動したcatalogは先頭から表示し、子folderから親folderへ戻ったcatalogは親folderを離れる直前のscroll位置を復元する。archive、PDF、画像は同じ操作でviewerへ開き、card内に重複する読むbuttonを置かず、終了後にcatalogの文脈を復元する。 |
| REQ-MVP-011 | 単pageを縦横比維持で表示し、範囲内移動とfitを提供する。page layoutの横幅フィットでは、利用者が設定したpage周囲余白を除く画像表示領域の横幅を使い、見開き時は設定したpage間隔だけを残す。page周囲余白の既定値は0pxとし、横幅フィットしたpageが表示領域より低い場合は残る縦余白を上下へ均等に配分し、高い場合は上端から画像下端まで設定値以外の末尾余白なしでscrollできるようにする。page layoutで縦が表示領域へ収まらない場合は上端から表示し、次page操作では未表示部分を下へ送って全体を閲覧した後に次pageへ進む。 |
| REQ-MVP-012 | 見開きは最大2pageとし、横長pageと末尾1pageを単独表示する。 |
| REQ-MVP-013 | 右開き・左開きを配置と移動へ一貫適用し、設定を保存する。 |
| REQ-MVP-014 | keyboard、wheel、swipe、Escで閲覧でき、画像stageの単clickではpage移動せず、double clickで全画面表示と解除を切り替える。viewer toolbarの操作を説明付きicon buttonで提供する。現在pageはtoolbarに表示せず、画像表示領域の下部に現在位置と総page数を示すslider式のpage移動barを置き、任意のpageへ移動できる。対応archiveを通常openした場合は全画面で開始し、全画面中はviewer toolbarとpage移動barを隠して、toolbarは画面上端、page移動barは画面下端へpointerを移動したときだけ表示する。viewerはopen時に全pageを画像として読み込まず、現在表示に必要なpageと最大4page先までを先読みする。見開き遷移は次の表示対象を先読みし、途中で1pageだけを表示せず見開き単位で滑らかに切り替える。viewer generationの古い結果を捨てる。 |
| REQ-MVP-015 | page keyを基準に読書位置をapp-local SQLiteへ保存・復元し、破損DBから安全に回復する。 |
| REQ-MVP-016 | 巻末では現在のcatalog sort順に従って次の漫画の1page目へ進む。folder内の画像群を1冊として閲覧している場合は親folderのcatalog sort順を使い、次の項目が対応archive、PDF、画像を含むfolderのいずれでもその先頭pageを開く。巻頭で前pageへ戻る操作は同じsort順の前の漫画を末尾pageから開き、前の漫画がなければ現在表示を維持する。 |
| REQ-MVP-017 | 閲覧、thumbnail、読書位置保存の前後でlibrary原本を非破壊に保つ。REQ-MVP-021の明示的file manager操作だけを例外とし、暗黙のrename、move、copy、create、deleteを行わない。 |
| REQ-MVP-018 | 外部通信、telemetry、crash upload、書誌取得、cloud同期を行わない。 |
| REQ-MVP-019 | 項目単位のaccess、missing、corrupt、unsupported errorから別操作へ復帰できる。 |
| REQ-MVP-020 | standalone PDF（`.pdf`）をcatalogの独立したPDF種別から1冊として開き、Windows標準PDF APIで各pageを上限付き画像へ変換して既存viewerの単page・見開き・読書位置・thumbnail・favorite・巻末遷移へ接続する。root包含確認後のWindows canonical path（拡張長接頭辞`\\?\`を含む）からも同じPDFを列挙・renderできること。PDF本体は1 GiB、page数は10,000、renderは最大辺16,384 pxかつ120,000,000 pixelsを上限とし、library root外へ展開・変換保存しない。非対応の暗号化PDF、破損PDF、空PDF、root外symlinkは分類した局所errorとする。 |
| REQ-MVP-021 | catalog context menuからrename、任意folderへのmove/copy、folder作成、ごみ箱delete、確認付き完全delete、Explorer表示、Windowsのアプリ選択、OS clipboardのCF_HDROPによるcut/copy/pasteを行う。folder treeのfolder nodeではcontext menu、Shift+F10、Ctrl+X/C/Vからcut/copy/pasteを行い、Deleteまたはcontext menuからcatalogと同じ確認dialogを経てごみ箱へ移動する。drive nodeではrootへのpasteだけを許可する。catalogのfolderを右clickしてpasteした場合は現在folderではなく右clickしたfolder内を宛先とする。catalogの選択項目またはfolder treeのfolderは、catalogまたはfolder treeに表示された同一drive内のfolderへdrag and dropしてmoveできる。アプリがclipboardへ設定したcut/copyはWindows Explorerへ貼り付けでき、Explorerが設定したfile clipboardもアプリ内folderへ貼り付けできる。相対sourceはcanonical library root内に限定し、folder pickerとOS clipboardで利用者が明示した外部pathだけを入出力に許可する。同名衝突、root外symlink、source自身または子孫へのmove/copy、不正名、欠落、access拒否、途中失敗を分類して通知し、成功後はcatalogとfolder treeを再列挙する。 |

## MVP非機能要件

| 安定ID | 現行契約 | 未完了境界 |
|---|---|---|
| NFR-MVP-001 | 1TB、10,000 files、1,000作品、1冊300pageを想定し、遅延処理、virtualize、10GiB thumbnail LRUを使う。folder移動では一覧の列挙と表示をthumbnail生成・cache保守の完了待ちから分離し、placeholderを先に表示してthumbnailを非同期に更新する。新しいfolderへ移動した場合は古いthumbnail要求をcancelし、cancel不能な生成中処理やpin解除が完了するまでfolder一覧を開く操作を待たせない。 | 10,000項目のWindows製品UI性能はBLOCKED。 |
| NFR-MVP-002 | cold起動3秒、cached一覧1秒、prefetch済みpage 100ms、10,000項目検索1秒、idle 250MiBを基準PCで測る。 | 現行release候補の基準PC測定はBLOCKED。 |
| NFR-MVP-003 | 14px基準のcompactな文字でtree、catalog、viewerをkeyboard操作でき、focusを視認できる。icon buttonは間隔、accessible name、hover説明を持ち、catalog cardは文字と操作欄を重ねず、tree labelは選択状態によらず背景と判別できる文字色で表示する。viewerの画像表示領域は既定で濃いグレーの市松模様を使い、設定から市松模様、濃灰、黒、明色の背景を選択して画像領域を判別可能にする。catalogの全5一覧形式は利用可能なペイン幅に応じて列数または表示する詳細列を縮退し、横方向にはみ出し・重なりを起こさない。小サムネイルと表紙グリッドでは画像の縦横比にかかわらずファイル名用の領域を画像とは別に確保し、文字を画像へ重ねず、種別ラベルを表示しない。カードグリッドは表紙グリッドより大きい既定thumbnailだけを縦横比2:3で表示し、ファイル名・種類icon・metadata用の視覚領域を設けない。情報カードでは横長cardの左に表紙、右にファイル名、種別、サイズ、更新日時を独立した情報領域として配置し、欠落metadataは安全な代替表示にする。小サムネイルでは画像をサムネイル枠の下端でclipし、ファイル名領域へ描画しない。サムネイル系4形式のthumbnail寸法は保存された形式別設定だけから決定し、ウィンドウやcatalogペインの幅変更では拡縮しない。ファイル名は本文より小さいcompactサイズで表示し、左端の種類iconを文字の省略や折返しから独立させる。お気に入りtoggleは小サムネイル、表紙グリッド、カードグリッドではサムネイルの左上、情報カードでは情報領域の右上、詳細リストでは左端の専用列に表示する小型buttonとする。設定画面を含む全dialogは共通のheader、余白、control、action、scroll表現を使い、狭い画面でもlabelと操作を重ねない。 | UIA、screen reader、high contrast、DPIはBLOCKED。 |
| NFR-MVP-004 | lockfile全依存を再配布可能licenseに限定し、SBOMとTHIRD-PARTY-NOTICESを同期する。 | 既知の禁止・unknown licenseは0。 |
| NFR-MVP-005 | Windows 10 22H2 x64と対応中Windows 11 x64向けinstallerを生成する。 | clean VM install/uninstallはBLOCKED。 |
| NFR-MVP-006 | 採用構成を再現可能なfixture、性能値、原本snapshot、配布検証で評価し、実測・推定・未測定を分ける。 | 外部環境の未測定を保持する。 |
| NFR-MAINT-001 | Windows filesystem上のCoDD、test、typecheck、buildは`.venv-windows`とWindows toolchainを使い、child exit codeと最終結果を保持する。 | Linux runnerで代替しない。 |

## 採用済みFeature要件

各行の安定IDは統合前要件から継承する。本表は保守時の現行契約だけを示し、過去の詳細は
Git履歴から参照する。

| Feature | 要件ID | 状態追跡ID | 現行契約 |
|---|---|---|---|
| FR-B01 表示倍率 | REQ-FR-B01-001, REQ-FR-B01-002, REQ-FR-B01-003, REQ-FR-B01-004, REQ-FR-B01-005, REQ-LEY-P1-003, REQ-LEY-P1-004, REQ-LEY-P1-006 | FUT-C-018, FUT-C-033, FUT-C-034, FUT-C-035, FUT-C-036, FUT-C-037, LEY-VIEWER-020, LEY-VIEWER-021, LEY-VIEWER-022 | 共通scale model、1%〜800%、fit幅/高さ/全体、原寸、状態維持、正方形のpointerルーペ、再起動復元。任意倍率の入力欄は1〜800%の整数で表示・入力し、内部値と保存形式には換算した倍率を使う。`+`/`-` は現在表示中の先頭pageの実表示倍率を基準に10%ずつ増減し、連続する逆方向操作で直前の表示倍率へ戻す。画像が表示領域を超えてもscrollbarを表示せず、pointer dragで任意の表示位置へpanできる。 |
| FR-B02 巻末動作 | REQ-FR-B02-001, REQ-FR-B02-002, REQ-FR-B02-003 | FUT-C-020, FUT-C-038, FUT-C-039, FUT-C-040, FUT-C-041 | viewer toolbarから`auto_next`、`confirm_next`、`return_library`、`stop`、`loop`を安全に適用し、sortと設定を維持する。folder内画像の閲覧では親catalogを巻順として使い、対応archive、PDF、画像folderを次巻・前巻候補とする。次巻・loop先は先頭page、巻頭からの前巻移動は末尾pageを開く。 |
| FR-B03 一覧形式 | REQ-FR-B03-001, REQ-FR-B03-002 | FUT-C-012, FUT-C-013, FUT-C-014 | `detail_list`、`small_thumbnail`、`cover_list`（表示名: 表紙グリッド）、`card_grid`（表示名: カードグリッド）、`reference_tile`（表示名: 情報カード）の順序、操作、focus、永続化を共通modelで扱う。表紙グリッドは縦長の表紙と直下のファイル名を中心にした画像優先layout、カードグリッドは表紙グリッドより大きい既定thumbnailだけを表示してファイル名・種類icon・metadataを視覚表示しない表紙専用layout、情報カードは横長cardの左側に縦長の表紙、右側に左揃えのファイル名、種別、サイズ、更新日時を置く情報優先layoutとし、外枠や色だけに依存せずシルエットと情報量で判別可能にする。カードグリッドでも項目名と種別はaccessible name、title、selection、context menuへ保持する。小サムネイルと表紙グリッドは種別ラベルを省き、画像とファイル名を別のlayout領域に置く。小サムネイルの画像はサムネイル枠の下端でclipしてファイル名領域への描画を防ぐ。カードグリッドは外側の枠線と内側余白を設けずthumbnailをcard全面へ配置し、行間・列間を他のthumbnail形式より狭い4pxにする。選択状態は外枠ではなくthumbnail上の色overlayで示す。カードグリッドのお気に入りtoggleは表紙の左上、情報カードでは情報領域の右上へ置き、card全体の既存open・selection・context menu操作と重ねない。仮想化した各rowは形式別thumbnail幅設定から導出した固定寸法、高さ、縦間隔を適用し、ウィンドウ幅変更時はthumbnailを拡縮せず列数だけを変更する。`small_thumbnail`、`cover_list`、`card_grid`、`reference_tile`の形式別thumbnail幅は安全な範囲へ検証し、profile、app-local設定、再起動復元へ含める。profile v3で導入した4つの必須幅をprofile v4/v5でも保持し、旧profile v1/v2には新しいカードグリッドの既定幅を補って移行する。詳細リストと情報カードでは種別を表示する。 |
| FR-B05 名前検索 | REQ-FR-B05-001, REQ-FR-B05-002, REQ-FR-B05-003, REQ-FR-B05-004, REQ-FR-B05-005 | FUT-C-010 | toolbarの検索buttonで開くside paneから正規化した名前検索、mixed result、結果移動、empty/clear/error、明示rescan、local-onlyを保証する。検索条件として、サブフォルダ、folder/file種別、固定した現在folderの検索範囲、sizeの以上/以下、更新日時の以降/以前/期間を指定でき、結果を移動時にも保持するか選べる。 |
| FR-B06 お気に入り | REQ-FR-B06-001, REQ-FR-B06-002, REQ-FR-B06-003, REQ-FR-B06-004, REQ-FR-B06-005 | FUT-C-011, FUT-C-021 | stable identity、冪等add/remove、quick access、missing/moved再解決、migrationと再起動保存を保証する。 |
| FR-B07 読書情報 | REQ-FR-B07-001, REQ-FR-B07-002, REQ-FR-B07-003, REQ-FR-B07-004, REQ-FR-B07-005 | FUT-C-023, FUT-R-004, FUT-R-005 | item identityごとのmemo、成功open history、rating、schema migration、原本非破壊を保証する。 |
| FR-B08 静止WebP | REQ-FR-B08-001, REQ-FR-B08-002, REQ-FR-B08-003, REQ-FR-B08-004, REQ-FR-B08-005 | FUT-C-005 | folder/ZIP/CBZ/EPUB/RAR/CBR/7z/CB7/LZHの静止WebPを列挙・表示・thumbnail化し、corrupt/animatedを局所errorにしてlicense gateを通す。 |
| FR-B09 ライブラリ診断 | REQ-FR-B09-001, REQ-FR-B09-002, REQ-FR-B09-003 | — | ライブラリをread-onlyで確認し、前回診断との追加・変更・欠落、重複、破損した対応書庫を表示する。作品を変更・削除・外部送信しないこと、初回は比較基準を作ることを説明する。実行中は割合を推定せず、確認対象と動作中を示すインジケータおよびcancel操作を表示する。 |
| FR-B10 tag | REQ-FR-B10-001, REQ-FR-B10-002, REQ-FR-B10-003, REQ-FR-B10-004 | FUT-C-022 | normalized tagのassign/remove/query/rename/merge、invalid拒否、migration、再起動保存を保証する。 |
| FR-B11 入力拡張 | REQ-FR-B11-001, REQ-FR-B11-002, REQ-FR-B11-003, REQ-FR-B11-004 | FUT-C-019, FUT-R-006, FUT-R-007 | catalogのopen・戻る・進む・上へ・更新・検索と、viewerのpage移動・表示・方向・倍率・ルーペ・全画面をkeyboard commandとしてremapし、command間および予約済みapp操作とのconflict拒否、個別/全体reset、focus fallback、再起動保存を保証する。viewerでは左右swipe、page layoutのwheel上下、右button+wheel上下、middle button、戻る/進むside buttonをcommandへ割り当て、double clickの全画面toggleは固定する。同じcommandへの複数mouse入力を許可し、旧keyboard/swipe設定を新しい既定値と統合して復元する。旧keyと新command既定値の衝突時は旧割り当てを優先し、新commandだけを未使用keyへ退避する。編集入口は統合設定だけに置き、group、command、keyboard、mouse、説明を同じcommand表で確認できるようにし、helpは現在のkeyboard割り当て表示だけを行う。原本変更・file削除・保存・印刷はglobal入力割り当てへ含めず、任意軌跡gesture、touch、gamepad、command parameterは候補のままとする。 |
| FR-B22 file manager | REQ-MVP-021, REQ-FR-B22-001, REQ-FR-B22-002, REQ-FR-B22-003, REQ-FR-B22-004 | FUT-C-024〜029, FUT-C-053 | 右click/keyboard context menu、Windows shell連携、選択項目のrename/move/copy/delete、現在folderへのcreate/paste、安全境界、成功後refreshを一貫して扱う。通常deleteはごみ箱、完全deleteは対象名を示す確認後だけ実行する。 |
| FR-B23 Leeyes viewer操作・外観 | REQ-FR-B23-001, REQ-FR-B23-002, REQ-FR-B23-003, REQ-FR-B23-004 | LEY-VIEWER-004, LEY-VIEWER-025, LEY-VIEWER-028 | page layoutの見開きを表示単位とは独立して1pageずつ前後へずらす。viewer背景、page周囲余白、見開き間隔、cursor自動非表示時間を統合設定、app-local設定、strict profileで検証・保存し、旧profileを安全な既定値へ移行する。 |

## 採用済みP1〜P10

| Priority / Feature | 対象ID | 現行契約 |
|---|---|---|
| P1 / FR-B13 | FUT-C-049, FUT-C-054, FUT-C-055, FUT-C-057, FUT-C-068 | refresh、複数・種別選択、相対path copy、property、現在位置status。 |
| P2 / FR-B14 | FUT-C-042, FUT-C-044, FUT-C-051, FUT-C-056 | root内open、成功openのrecent、履歴jump、明示終了。 |
| P3 / FR-B15 | FUT-C-045, FUT-C-046, FUT-C-047 | page-key bookmark、next/wrap、favoriteと別のapp-local bookshelf。 |
| P4 / FR-B16 | FUT-C-050, FUT-C-058 | 検索side paneのbasename maskと、absolute pathを含まずformulaを無害化するCSV出力。 |
| P5 / FR-B17 | FUT-C-065, FUT-C-066, FUT-C-067 | 5分類menu、accessible icon toolbar、情報カードとして永続化する既存`reference_tile`と、表紙専用`card_grid`。 |
| P6 / FR-B18 | FUT-C-060, FUT-C-061, FUT-C-062, FUT-C-063 | pane/bar可逆表示、viewer分離、native tray hide/showと終了の分離。 |
| P7 / FR-B19 | FUT-C-069, FUT-C-071, FUT-C-072, FUT-C-076, FUT-C-077 | atomic設定、strict profile、左右swipe gesture、offline help、version/runtime/license表示。統合設定はcatalog、viewer、interface、入力、profileの意味単位で移動でき、名前・説明・現在値を対象とする検索で該当設定だけを絞り込む。各設定は効果を説明し、全設定の既定値復元を含む変更は適用まで下書きに留める。viewerのdouble clickは設定対象にせず全画面切替へ固定する。ヘルプmenuでは一般ヘルプとバージョン情報を別の項目・dialogとして開く。 |
| P8 / FR-B08 | FUT-C-006, FUT-C-007, FUT-C-008 | GIFの安全な分類・metadata・MIME・製品decodeと、AVIFの安全な分類・metadata・MIME・corrupt境界。AVIFの製品decodeは未受入。 |
| P9 / FR-B12 | FUT-C-001, FUT-C-002 | 単一volume・非暗号化RAR4/RAR5（RAR/CBR）、非暗号化7z（7z/CB7）、LHA/LZH（LZH）を安全に読み、分割RAR、暗号化書庫、未対応圧縮方式はunsupported分類する。一覧・検索結果・お気に入りでは、対応書庫の集合ではなく各項目の実際の形式（ZIP、CBZ、EPUB、RAR、CBR、7Z、CB7、LZH）を表示する。 |
| P10 / FR-B20 | FUT-C-073, FUT-C-074, FUT-C-075 | app-local thumbnail管理、明示保存、検証済みJPEG import。製品file picker gateは未完了。 |

## 全体受入シナリオ

- E2E-MVP-001: サイドバーのドライブ選択から画像folderを開き、単page/見開きで読み、再起動後にドライブと読書位置を復元する。起動時にlibrary root登録画面を表示せず、addressに`\\?\`を表示しない。
- E2E-MVP-002: ZIP/CBZ/EPUB/RAR/CBR/7z/CB7/LZHを閲覧してcacheと読書位置を生成しても、原本tree、hash、mtimeが一致する。
- E2E-MVP-003: catalogの自然順・sort順に従い、巻末から次の漫画の先頭または保存pageへ進む。
- E2E-MVP-004: network隔離状態で主要機能が動作し、外部DNS/TCP/UDP送信がないことを外部監視する。これは未完了gateである。
- E2E-MVP-005: catalogの右clickまたはkeyboard context menuからrename、copy、move、create、delete、OS clipboard pasteを行い、folder treeのfolderまたはdrive nodeからcut/copy/pasteを行う。選択した対象だけが変更され、アプリとWindows Explorerの双方向pasteおよび成功後のcatalog反映を確認する。
- E2E-MVP-006: 見開きを1pageずつ前後へずらし、背景・page周囲余白・見開き間隔・cursor自動非表示時間を変更して再起動およびprofile export/import後にも復元する。設定変更と閲覧の前後でlibrary原本を変更しない。

## Leeyes P1-A 即効改善の受入条件

Leeyesの観察可能な操作目的を独自実装し、旧UI、文章、画像、iconはコピーしない。設定変更は
app-local SQLiteとstrict profileへ保存し、library原本を変更しない。

| 要件ID | Leeyes ID | 受入条件 |
|---|---|---|
| REQ-LEY-P1-001 | LEY-SHELL-012 | 統合設定からmenu bar、navigation toolbar、address bar、status barを個別に表示・非表示へ切り替え、再起動とprofile export/import後に復元する。すべてを隠しても設定画面を再度開けるkeyboard入口を残す。 |
| REQ-LEY-P1-002 | LEY-SHELL-013 | 「常に手前」を統合設定から切り替え、main windowへだけ適用する。native window APIが失敗した場合は保存済み状態と成功表示を更新せず分類した局所errorを示す。再起動とprofileで復元する。 |
| REQ-LEY-P1-003 | LEY-VIEWER-020 | 任意倍率を1%〜800%の整数として直接入力し、範囲外と非数値を拒否する。fit、原寸、段階zoom、表示倍率表示と同じscale modelを使い、巨大なdecodeや原本変更を発生させない。 |
| REQ-LEY-P1-004 | LEY-VIEWER-022 | zoom保持を`global`、`book`、`page`から選ぶ。globalは次の作品と再起動へ保存し、bookは現在作品を閉じるまで、pageは現在pageを離れるまで保持する。fit系modeと任意倍率を同じpolicyで扱う。 |
| REQ-LEY-P1-005 | LEY-INPUT-004 | shortcut設定はcommandごとの既定値復元と全commandの既定値復元を区別し、いずれも予約key・重複を生じない。変更は設定dialogのdraftに留め、適用またはcancelの既存atomic境界を守る。 |
| REQ-LEY-P1-006 | LEY-VIEWER-021 | 現在の先頭表示画像について幅または高さを1〜32768pxで指定し、実画像寸法と縦横比から安全な1%〜800%の表示scaleへ換算する。自然寸法が未取得、0、範囲外、または換算scaleが範囲外なら適用しない。 |
| REQ-LEY-P1-007 | LEY-VIEWER-031 | viewerへ非破壊grid overlayを表示し、無効または8〜256pxの間隔と明色・暗色を選べる。overlayはpointer操作、画像decode、clipboard、thumbnail、原本に影響せず、設定を再起動とprofileで復元する。 |
| REQ-LEY-P1-008 | LEY-INPUT-010 | viewerのpointer pan係数を50%〜200%で設定し、pointer capture中の移動量へだけ適用する。swipe判定、click、drag終了、keyboard操作へは適用しない。 |
| REQ-LEY-P1-009 | LEY-INPUT-012 | page layoutのwheel入力に0〜200の不感帯を設定し、閾値未満のdeltaはpage commandへ変換しない。Ctrl+wheel、右button+wheel、scroll layoutのnative scrollは既存境界を維持する。 |

## Leeyes P1-B 既存機能完成の受入条件

| 要件ID | Leeyes ID | 受入条件 |
|---|---|---|
| REQ-LEY-P1-010 | LEY-FILER-016 | folder移動後の初期選択を「選択なし」「先頭」「末尾」「前回選択を復元」から選べる。表示中sort/filter後の項目へ適用し、空folderでは選択せず、検索結果から戻る際の明示的な対象復元を優先する。設定をprofileと再起動で復元する。 |
| REQ-LEY-P1-011 | LEY-CATALOG-010 | 既存の一覧形式別thumbnail寸法に加え、生成範囲を「表示中のみ」「表示中と近傍」「全項目」から選べる。設定変更後は要求queueを再評価し、同一画像生成物のcache keyを不要に変えず、worker上限とcache上限を維持する。profileと再起動で復元する。 |
| REQ-LEY-P1-012 | LEY-FILE-001 | Windows標準file dialogを対応画像・書庫・PDFのfilter付きで開き、cancelを正常終了として扱う。選択fileをcanonicalizeし、対応形式・通常fileであることをbackendで検証してから、そのdriveを安全境界として登録し直接viewerへ開く。root外path文字列を既存rootへ注入せず、失敗時は現在画面を保持する。 |
| REQ-LEY-P1-013 | LEY-FILE-009 | 成功して開いた最近の作品を新しい順・重複なし・最大20件で表示し、項目から再度開ける。missing・access拒否は局所errorとして履歴画面を維持し、全履歴を明示的に消去できる。cancel・失敗openは追加しない。 |
| REQ-LEY-P1-014 | LEY-SETTING-005 | 起動場所を「前回のfolder」「前回driveのroot」から選び、存在しない・読めない保存pathではshellを維持して安全にdrive選択へ戻す。初期選択はREQ-LEY-P1-010のpolicyを共有し、設定をstrict profileとapp-local SQLiteへ保存する。 |
| REQ-LEY-P1-015 | LEY-HELP-001 | 同梱dataだけで閲覧できる利用者向けoffline helpへ、開始、folder/list、viewer、検索、file操作、設定、privacy・安全上の制約、現在のshortcutを章立てして収録する。topic検索とkeyboard操作を提供し、外部URLやnetworkを要求しない。 |

## Leeyes P1-C 独立S機能の受入条件

| Requirement | Leeyes ID | 受入条件 |
|---|---|---|
| REQ-LEY-P1-016 | LEY-FILER-007 | File menuからWindowsのDesktop、Downloads、Documents、Picturesへ移動できる。known-folder APIが返した実filesystem pathだけを使い、通常のdrive登録・canonical containment境界を経由する。取得不能な場所は表示せず、shell virtual extensionや任意codeを読み込まない。PCは既存tree入口を正とする。 |
| REQ-LEY-P1-017 | LEY-FILER-011 | Windows hidden属性または先頭dotを持つ項目を既定で一覧・folder page列挙から除外し、「隠し項目を表示」で一覧に含められる。設定は再起動とprofileで復元し、symlink/reparse point、root containment、対応形式の既存安全境界を変更しない。 |
| REQ-LEY-P1-018 | LEY-FILER-014 | catalogにkeyboard focusがあるとき、IME composition外の表示可能文字を1秒以内に続けて入力すると、NFKC・case insensitiveな名前前方一致で次の項目へ選択とfocusを移す。同じ文字列の再入力は現在位置の次から循環し、input・dialog・viewerのshortcutを奪わない。 |
| REQ-LEY-P1-019 | LEY-FILER-018 | catalog配色をsystem、paper、midnight、high contrastの検証済みpresetから選び、背景、文字、補助文字、hover、選択を一体で変更する。原本・thumbnailを加工せず、profileと再起動で復元する。任意色による判読不能な組合せは導入しない。 |
| REQ-LEY-P1-020 | LEY-VIEWER-006 | 2page以上のviewerで現在page以外を一様に選ぶrandom移動commandを提供し、1pageでは何も変更しない。page sequence、読書位置保存、prefetch上限、原本を変更せず、選択結果を通常page移動と同じ境界へ渡す。 |
| REQ-LEY-P1-021 | LEY-SETTING-006 | 「前回の画像を再表示」を明示的に有効化した場合だけ、前回root復元後に最新の成功した閲覧作品と保存pageを再度開く。既定は無効とし、cancel・失敗openを対象にせず、missing・access拒否・removable drive不在ではshellを維持して局所errorを表示する。設定はprofileとSQLiteへ保存する。 |

## Leeyes P2 閲覧中核の受入条件

| Requirement | Leeyes ID | 受入条件 |
|---|---|---|
| REQ-LEY-P2-001 | LEY-VIEWER-007 | 2page以上のviewerはtoolbarからslideshowを開始・停止でき、slideshow起動commandでは開始状態で開く。既定間隔3秒で通常の次page commandを1回ずつ実行し、page decode/prefetch待機と巻末policyを迂回しない。documentが非表示またはwindow focusを失った間は自動送りせず、復帰後に新しい1 intervalを待つ。1pageでは開始不可とし、停止・viewer終了・unmountでtimerを破棄する。詳細な間隔・順序・反復・random設定はLEY-VIEWER-008で要件化し、このbatchでは固定しない。 |
| REQ-LEY-P2-002 | LEY-VIEWER-009 | 巻末動作は「次巻を自動」「次巻を確認」「libraryへ戻る」「停止」「最終巻から先頭巻へloop」の5 policyを設定dialogとviewerで選択・永続化する。archive、PDF、画像folderを同じ読み取り可能volumeとして現在のcatalog sort順で扱い、次巻は先頭page、前巻は末尾pageから開く。「libraryへ戻る」は次巻の有無にかかわらず巻末でviewerを閉じる。次巻なし、現在volume不明、一覧再取得失敗では安全に停止し、確認前・失敗時に別volumeを開かない。 |
| REQ-LEY-P2-003 | LEY-VIEWER-010 | 作品ごとに複数の任意pageをしおりとしてapp-local SQLiteへ保存し、同じpageの再保存は重複を作らず最新ordinal hintへ更新する。viewerを開くと保存済みしおりを読込み、現在のpageKey列へ再解決して次の有効なしおりへ循環移動できる。欠落pageは一覧に残して無効と明示し、個別削除できる。既存root-scoped localStorageしおりは対象作品を初めて開いたときSQLiteへ重複なく移行し、全件成功後だけ旧行を除去する。root外path、空key、不正ordinal・時刻、過大な移行payloadは拒否し、失敗時はviewerと旧データを保持して局所errorを表示する。 |
| REQ-LEY-P2-004 | LEY-VIEWER-013 | viewerの表示枚数を「自動」「単ページ」「見開き」から明示選択し、toolbarと設定profile/SQLiteで同じmodeを保持する。単ページは常に1page、見開きは横長pageと最終余りpageを単独表示し、それ以外を2page単位で表示する。自動はpage layoutかつ表示領域の幅/高さ比が1.25以上のときだけ2枚の縦長pageを見開きにし、狭い領域、横長page、最終余りpageでは単独表示する。resizeで自動判定を更新しても現在anchorを保持し、次移動は現在の表示枚数、前移動は実際に通ったanchor履歴へ戻る。詳細なしきい値、先頭単独、偶奇条件はLEY-VIEWER-014へ分離する。 |
| REQ-LEY-P2-005 | LEY-VIEWER-014 | 見開き条件として、縦長pageとみなす最大幅/高さ比を50〜100%、自動見開きを許可するviewer領域の最小幅/高さ比を100〜300%、先頭pageの単独表示を有効/無効、組合せ開始を「制限なし」「奇数page」「偶数page」から選択できる。見開き候補は現在pageと次pageの両方が縦長条件を満たし、選択した開始page条件を満たす場合だけ2pageとする。単独page、横長page、条件外pageの後は選択した偶奇条件へ再同期し、最終余りpageは単独とする。設定dialog、profile v8、app-local SQLite、通常viewerを同じ値へ接続し、旧profile v1〜v7と欠落DB keyはP2-D相当の既定値（100%、125%、先頭単独なし、制限なし）へ安全に移行する。不正値はprofile import/native境界で拒否し、原本へ書き込まない。 |
| REQ-LEY-P2-006 | LEY-VIEWER-019 | 全体フィットの詳細として、小画像の拡大を許可/縮小のみ、見開き全体を1領域へ収める/各pageを1領域基準で合わせる、page周囲余白をfit計算へ含める/含めないを選択できる。paged layoutの全体フィットでは、読込み済みpageのnatural寸法、viewer領域、見開き間隔、選択した余白基準から共通倍率を計算し、縦横比を維持して両pageへ同じ倍率を適用する。見開き全体基準は2page幅とgapを合わせて領域内へ収め、page基準は各page単独の最大寸法を基準にして必要ならscroll/panを許す。縮小のみでは倍率を100%以下、拡大許可でも既存の1〜800%安全範囲に制限する。画像寸法が未確定・0・非有限なら従来CSS fitへ安全にfallbackし、width/height/original/custom modeとcontinuous layoutは変更しない。設定dialog、profile v9、app-local SQLite、通常viewerを接続し、旧profile v1〜v8と欠落DB keyは「縮小のみ・見開き全体・余白を含む」へ移行する。 |
| REQ-LEY-P2-007 | LEY-VIEWER-026 | 表示領域を超える画像のscroll/pan詳細として、page移動commandで送る量をviewport高の10〜100%、連続layoutのwheel速度を50〜200%、page内移動の滑らかなanimationを有効/無効から設定できる。paged layoutのnext commandは下端へ達するまで設定量ずつ下へ送り、previous commandは上端へ達するまで同じ量ずつ上へ戻し、端に達した後だけ隣page/作品へ移動する。smooth有効時もOSの`prefers-reduced-motion`が有効なら即時移動を優先する。vertical/horizontal scroll layoutのwheelは`deltaMode`をpixelへ正規化して設定倍率を適用し、pointer dragは既存の50〜200% pan係数とpointer captureを維持してrelease後の慣性移動を発生させない。Ctrl+wheel、右button+wheel、wheel不感帯、swipe、N字/Z字走査は変更しない。設定dialog、profile v10、app-local SQLite、通常viewerを接続し、旧profile v1〜v9と欠落DB keyは90%・100%・smooth有効へ移行する。不正値はprofile import/native境界で拒否し、原本へ書き込まない。 |
| REQ-LEY-P2-008 | LEY-VIEWER-027 | paged layoutで表示領域を縦横とも超える画像・見開きを、標準縦送り、N字、Z字から選んだ規則で読書順に走査する。N字は設定済みpage内scroll量で上から下へ進み、下端で読書方向の次列へ移って上端へ戻るcolumn優先とする。Z字は読書方向へ横に進み、行端で下の次行へ移って読書方向の先頭端へ戻るrow優先とする。右開きは右端から左へ、左開きは左端から右へ進む。previousは各経路を厳密に逆順で戻り、経路の先頭/末尾へ達した後だけ前後page・作品へ移動する。各stepはviewport幅/高さにREQ-LEY-P2-007の10〜100%量を適用し、行/列の切替は1回のatomic scrollとして対角線上の中間frameを作らない。smooth/reduced-motion、pointer pan、fit、見開き、巻末policyを既存境界のまま利用し、continuous layoutでは走査modeを適用しない。設定dialog、profile v11、app-local SQLite、通常viewerを接続し、旧profile v1〜v10と欠落DB keyは標準縦送りへ移行する。不正値はprofile import/native境界で拒否し、原本へ書き込まない。 |
| REQ-LEY-P2-009 | LEY-VIEWER-029 | 既存の非破壊pointerルーペについて、正方形の表示サイズを80〜400pxの整数、拡大率を125〜800%で設定できる。ルーペは有効時に読込み済みの表示page上へpointerがある間だけ表示し、元画像やcacheを変更せず、現在の表示画像をCSS backgroundとして再利用する。pointerの画像内座標はpage境界へ、ルーペ中心はviewer stage内へclampし、stageが指定サイズより小さい場合はstage中央へ置いて画面外への拡大を抑える。page移動、倍率変更、pointer leave、ルーペ無効化では即座に消し、cursor自動非表示とpointer panの既存抑止を維持する。設定dialog、profile v12、app-local SQLite、通常viewerを接続し、旧profile v1〜v11と欠落DB keyは180px・200%へ移行する。frontend/native境界で範囲外・非有限値を拒否し、GPU負荷を制限する。 |
| REQ-LEY-P2-010 | LEY-VIEWER-032 | viewerの先読み量として現在の表示単位より後を0〜4page、前を0〜4page、media grantに保持する圧縮済みpage byteの上限を16〜512MiBから選択できる。既定値は既存挙動と同じ後4page・前0page・256MiBとし、page layoutと連続layoutのどちらも現在anchorを起点とする同じbounded windowだけを要求する。0page指定では該当方向をbackground要求せず、利用者が未先読みpageへ移動した時点でvisible優先度として読込みを開始する。見開き遷移は設定上限に収まる場合は表示単位全体を先読みし、未準備pageがある場合は現在の見開きを保持して全pageのloadまたは局所error確定後だけ原子的に切り替える。backendのmedia registryは期限切れgrantを除去したうえでLRU順に非表示pageのgrantを解放し、上限を超える単一pageはその1件だけを許容して無制限な蓄積を防ぐ。window外へ出たfrontend media URI・decode状態・失敗状態を解放し、stale generation結果は復帰させない。設定dialog、profile v13、app-local SQLite、通常viewer、native media registryを接続し、旧profile v1〜v12と欠落DB keyは既定値へ移行する。範囲外・非整数・非有限値はfrontend/native境界で拒否し、原本、thumbnail cache、任意code実行境界を変更しない。 |

## 非採用と将来候補の境界

| 区分 | 安定ID | 扱い |
|---|---|---|
| Candidate | FUT-C-052 | file operation undo。OS shellのundo履歴をapplication状態として保証できるまで未採用。 |
| Candidate | FUT-R-006, FUT-R-007 | touch、gamepad。実機契約と直接観測ができるまで未採用。 |
| Rejected | FUT-R-001, FUT-R-002, FUT-R-003, FUT-R-008 | cloud同期、外部書誌、外部送信、閲覧時の原本自動変更。恒久安全原則を変更しない限り採用しない。 |
| Partial | FUT-C-006, FUT-C-007, FUT-C-008 | AVIFはunsupported/parser境界だけ実装済み。完全decodeを推定しない。 |

FR-B04は現行の採用laneとして定義されていない。欠番を新機能の根拠として扱わない。

## Leeyes viewer操作・外観の受入条件

| 要件ID | Leeyes ID | 受入条件 |
|---|---|---|
| REQ-FR-B23-001 | LEY-VIEWER-004 | page layoutかつ見開き表示のtoolbarに「1ページ戻す」「1ページ進める」を説明付きicon buttonとして置く。操作は現在の見開きanchorを自然順で正確に1pageだけ移動し、読み方向に従う左右配置、横長pageの単独表示、読書位置保存を維持する。先頭・末尾では範囲外へ進まず、巻頭・巻末の作品移動を発火しない。単pageとscroll layoutでは無効にする。 |
| REQ-FR-B23-002 | LEY-VIEWER-025 | viewer設定で背景を市松模様・濃灰・黒・明色から選び、page周囲余白と見開き間隔をそれぞれ0〜64pxの整数で指定する。既定値は市松模様・0px・8pxとする。設定値はpage layoutの単page・見開きおよびscroll layoutへ適用し、見開き画像の利用可能幅計算にも同じ間隔を用いる。 |
| REQ-FR-B23-003 | LEY-VIEWER-028 | viewer設定でcursor自動非表示を無効・1秒・2秒・3秒・5秒から選ぶ。有効時はpointerが画像stage内で指定時間操作されなければstage上のcursorだけを隠し、pointer移動・再入場・button操作で直ちに再表示する。pointer drag中およびルーペ有効時はcursorを隠さず、toolbar・page移動bar上のcursorへ影響させない。既定値は無効とする。 |
| REQ-FR-B23-004 | LEY-VIEWER-025, LEY-VIEWER-028 | 背景、余白、間隔、自動非表示時間はapp-local SQLiteと設定profile v5へ保存し、再起動とexport/importで復元する。profile v1〜v4と既存SQLiteに値がない場合は安全な既定値へ移行する。frontendとbackendの両方でenum・整数範囲を検証し、不正値を適用・保存しない。 |

## PDF対応の受入条件

| Feature | 要件ID | 現行契約 |
|---|---|---|
| FR-B21 PDF viewer | REQ-MVP-020, REQ-FR-B21-001, REQ-FR-B21-002, REQ-FR-B21-003 | `.pdf`をcatalogの`pdf`種別で表示し、standalone documentのpage数を列挙する。root包含確認で得たWindows canonical pathをWindows.Data.Pdfが受理できる通常pathへ変換し、各pageは寸法を検証してからboundedな出力寸法を指定してPNG renderし、既存viewer、thumbnail、favorite、巻末遷移、読書位置を利用する。PDFは書庫内entryや書庫として再帰解釈せず、暗号化・破損・0 page・過大source/render・root外symlinkを分類して拒否する。 |
