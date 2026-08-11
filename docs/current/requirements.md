---
codd:
  node_id: "req:project-requirements"
  type: requirement
  status: approved
  confidence: 0.95
---

# Comic Explorer 現行要件

## 目的と正本

Comic Explorerは、Windows上のローカル漫画ライブラリをExplorer風の画面で探索し、
画像フォルダと対応書庫を安全に閲覧するデスクトップアプリである。本書は実装完了後の
保守契約の正本であり、受入結果は[verification.md](verification.md)、現在状態は
[status.md](status.md)、技術境界は[architecture.md](architecture.md)を正とする。

統合前の詳細な受入条件と判断履歴はGit履歴から参照・復元できる。変更時は本書の安定IDを
維持し、未測定項目を実装済みまたはPASSへ推定しない。

## 範囲

対象は、登録したlibrary root内の階層移動、catalog、thumbnail、検索、viewer、読書位置・
利用者metadata、app-local設定/cache、Windows配布である。BMP、JPEG/JPG、GIF、TIFF/TIF、PNG、
ICO、SVG、静止WebP、PDF、ZIP/CBZ/EPUB/RAR/CBR/7z/CB7/LZHを実装済み範囲とする。WICは画像形式ではなく、
Windows標準codecが扱うraster画像のdecode基盤として利用する。AVIFには実装済みの安全な
分類・拒否境界があるが、製品decodeの受入は未完了である。

対象外は、クラウド同期、外部書誌取得、telemetry、外部データ送信、library原本への自動変更である。
明示的な利用者操作に限り、catalog context menuからOS全体を対象とするfile manager操作を提供する。

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
| REQ-MVP-001 | 読取可能なlibrary rootを登録し、app-local設定から復元する。 |
| REQ-MVP-002 | 固定metadataを要求せず任意のfolder階層を扱う。 |
| REQ-MVP-003 | folder treeの展開・選択と現在folderを同期する。 |
| REQ-MVP-004 | address入力、icon toolbarの戻る・進む・上へ・address移動、file menuの履歴移動をroot内で行う。 |
| REQ-MVP-005 | folder、漫画folder、対応archive、画像をcatalogに表示し、未対応fileの種別にはfile名の拡張子をそのまま表示する。thumbnailを表示しないfolderとarchiveには、それぞれを判別できる専用iconを表示する。 |
| REQ-MVP-006 | 漫画folder・対応archive・PDFは自然順の先頭pageから表紙thumbnailを生成し、catalogに直接表示する対応画像はその画像自身のthumbnailを生成する。通常folderの直下に対応archiveが複数ある場合は、その自然順先頭archiveの表紙thumbnailをfolder項目に表示する。いずれも選択したsourceを含むfingerprintとcache鮮度を管理する。 |
| REQ-MVP-007 | catalog toolbar buttonから並べ替え、昇降順、一覧形式のmenuを操作し、viewer toolbarから巻末動作を操作して、設定を保存する。 |
| REQ-MVP-008 | 画像folderおよび対応archive内のBMP、JPEG/JPG、GIF、TIFF/TIF、PNG、ICO、SVG、静止WebPを1冊として相対pathの自然順で読み、catalogの画像を直接開いた場合は同じfolderのpage群を選択画像から開始する。raster画像はWICまたは専用decoderで実ピクセルを検証し、SVGはscriptと外部resourceを実行・取得せずに表示とthumbnail生成を行う。 |
| REQ-MVP-009 | ZIP/CBZ/EPUB、単一volume・非暗号化RAR4/RAR5（RAR/CBR）、非暗号化7z（7z/CB7）、LHA/LZH（LZH）を隣接展開せず、対応圧縮entryを検証し、格納画像を自然順で読む。対応書庫内の対応書庫は形式を混在でき、内側3階層・内側書庫64個・内側書庫の展開データ累計512 MiBを上限として再帰的に読む。分割RAR、暗号化書庫、未対応圧縮方式、EPUBのHTML本文組版は対象外とする。書庫ごとのentry数・展開後entry size・展開後合計size上限、危険path拒否、原本非破壊を共通に保証する。 |
| REQ-MVP-010 | catalogのfolder（漫画画像を含むfolderを含む）はダブルクリックまたはkeyboardでviewerを開かず、そのfolderへ移動する。archive、PDF、画像は同じ操作でviewerへ開き、card内に重複する読むbuttonを置かず、終了後にcatalogの文脈を復元する。 |
| REQ-MVP-011 | 単pageを縦横比維持で表示し、範囲内移動とfitを提供する。page layoutで縦が表示領域へ収まらない場合は上端から表示し、次page操作では未表示部分を下へ送って全体を閲覧した後に次pageへ進む。 |
| REQ-MVP-012 | 見開きは最大2pageとし、横長pageと末尾1pageを単独表示する。 |
| REQ-MVP-013 | 右開き・左開きを配置と移動へ一貫適用し、設定を保存する。 |
| REQ-MVP-014 | keyboard、wheel、swipe、Escで閲覧でき、画像stageの単clickではpage移動せず、double clickで全画面表示と解除を切り替える。viewer toolbarの操作を説明付きicon buttonで提供する。現在pageはtoolbarに表示せず、画像表示領域の下部に現在位置と総page数を示すslider式のpage移動barを置き、任意のpageへ移動できる。対応archiveを通常openした場合は全画面で開始し、全画面中はviewer toolbarとpage移動barを隠して、toolbarは画面上端、page移動barは画面下端へpointerを移動したときだけ表示する。見開き遷移は次の表示対象を先読みし、途中で1pageだけを表示せず見開き単位で滑らかに切り替える。viewer generationの古い結果を捨てる。 |
| REQ-MVP-015 | page keyを基準に読書位置をapp-local SQLiteへ保存・復元し、破損DBから安全に回復する。 |
| REQ-MVP-016 | 巻末では現在のcatalog sort順に従って次の漫画の1page目へ進む。巻頭で前pageへ戻る操作は同じsort順の前の漫画を末尾pageから開き、前の漫画がなければ現在表示を維持する。 |
| REQ-MVP-017 | 閲覧、thumbnail、読書位置保存の前後でlibrary原本を非破壊に保つ。REQ-MVP-021の明示的file manager操作だけを例外とし、暗黙のrename、move、copy、create、deleteを行わない。 |
| REQ-MVP-018 | 外部通信、telemetry、crash upload、書誌取得、cloud同期を行わない。 |
| REQ-MVP-019 | 項目単位のaccess、missing、corrupt、unsupported errorから別操作へ復帰できる。 |
| REQ-MVP-020 | standalone PDF（`.pdf`）をcatalogの独立したPDF種別から1冊として開き、Windows標準PDF APIで各pageを上限付き画像へ変換して既存viewerの単page・見開き・読書位置・thumbnail・favorite・巻末遷移へ接続する。PDF本体は1 GiB、page数は10,000、renderは最大辺16,384 pxかつ120,000,000 pixelsを上限とし、library root外へ展開・変換保存しない。非対応の暗号化PDF、破損PDF、空PDF、root外symlinkは分類した局所errorとする。 |
| REQ-MVP-021 | catalog context menuからrename、任意folderへのmove/copy、folder作成、ごみ箱delete、確認付き完全delete、Explorer表示、Windowsのアプリ選択、OS clipboardのCF_HDROPによるcut/copy/pasteを行う。相対sourceはcanonical library root内に限定し、folder pickerとOS clipboardで利用者が明示した外部pathだけを入出力に許可する。同名衝突、root外symlink、source自身または子孫へのmove/copy、不正名、欠落、access拒否、途中失敗を分類して通知し、成功後はcatalogを再列挙する。 |

## MVP非機能要件

| 安定ID | 現行契約 | 未完了境界 |
|---|---|---|
| NFR-MVP-001 | 1TB、10,000 files、1,000作品、1冊300pageを想定し、遅延処理、virtualize、10GiB thumbnail LRUを使う。 | 10,000項目のWindows製品UI性能はBLOCKED。 |
| NFR-MVP-002 | cold起動3秒、cached一覧1秒、prefetch済みpage 100ms、10,000項目検索1秒、idle 250MiBを基準PCで測る。 | 現行release候補の基準PC測定はBLOCKED。 |
| NFR-MVP-003 | 14px基準のcompactな文字でtree、catalog、viewerをkeyboard操作でき、focusを視認できる。icon buttonは間隔、accessible name、hover説明を持ち、catalog cardは文字と操作欄を重ねず、tree labelは選択状態によらず背景と判別できる文字色で表示する。viewerの画像表示領域は濃いグレーの市松模様で画像領域を判別可能にする。catalogの小サムネイル、詳細リスト、表紙付きリスト、参照型タイルは利用可能なペイン幅に応じて列数または表示する詳細列を縮退し、横方向にはみ出し・重なりを起こさない。サムネイル系cardでは画像の縦横比にかかわらずファイル名用の領域を確保して画像と重ねず、種別ラベルを表示しない。ファイル名は本文より小さいcompactサイズで表示し、お気に入りtoggleはサムネイルの左上に重ねる小型buttonとする。設定画面を含む全dialogは共通のheader、余白、control、action、scroll表現を使い、狭い画面でもlabelと操作を重ねない。 | UIA、screen reader、high contrast、DPIはBLOCKED。 |
| NFR-MVP-004 | lockfile全依存を再配布可能licenseに限定し、SBOMとTHIRD-PARTY-NOTICESを同期する。 | 既知の禁止・unknown licenseは0。 |
| NFR-MVP-005 | Windows 10 22H2 x64と対応中Windows 11 x64向けinstallerを生成する。 | clean VM install/uninstallはBLOCKED。 |
| NFR-MVP-006 | 採用構成を再現可能なfixture、性能値、原本snapshot、配布検証で評価し、実測・推定・未測定を分ける。 | 外部環境の未測定を保持する。 |
| NFR-MAINT-001 | Windows filesystem上のCoDD、test、typecheck、buildは`.venv-windows`とWindows toolchainを使い、child exit codeと最終結果を保持する。 | Linux runnerで代替しない。 |

## 採用済みFeature要件

各行の安定IDは統合前要件から継承する。本表は保守時の現行契約だけを示し、過去の詳細は
Git履歴から参照する。

| Feature | 要件ID | 状態追跡ID | 現行契約 |
|---|---|---|---|
| FR-B01 表示倍率 | REQ-FR-B01-001, REQ-FR-B01-002, REQ-FR-B01-003, REQ-FR-B01-004, REQ-FR-B01-005 | FUT-C-018, FUT-C-033, FUT-C-034, FUT-C-035, FUT-C-036, FUT-C-037 | 共通scale model、25%〜400%、fit幅/高さ/全体、原寸、状態維持、正方形のpointerルーペ、再起動復元。任意倍率の入力欄は25〜400%の整数で表示・入力し、内部値と保存形式には換算した倍率を使う。`+`/`-` は現在表示中の先頭pageの実表示倍率を基準に10%ずつ増減し、連続する逆方向操作で直前の表示倍率へ戻す。画像が表示領域を超えてもscrollbarを表示せず、pointer dragで任意の表示位置へpanできる。 |
| FR-B02 巻末動作 | REQ-FR-B02-001, REQ-FR-B02-002, REQ-FR-B02-003 | FUT-C-020, FUT-C-038, FUT-C-039, FUT-C-040, FUT-C-041 | viewer toolbarから`auto_next`、`confirm_next`、`return_library`、`stop`、`loop`を安全に適用し、sortと設定を維持する。次巻・loop先は先頭page、巻頭からの前巻移動は末尾pageを開く。 |
| FR-B03 一覧形式 | REQ-FR-B03-001, REQ-FR-B03-002 | FUT-C-012, FUT-C-013, FUT-C-014 | `small_thumbnail`、`detail_list`、`cover_list`の操作・focus・永続化を共通modelで扱う。サムネイル系cardは種別ラベルを省き、画像とファイル名を別のlayout領域に置き、サムネイル領域をカードのrow内に収める。仮想化した各rowは表示形式ごとの単一設定から高さと縦間隔を適用し、サムネイル系の後続rowは直前rowの終端より後に配置する。`small_thumbnail`はサムネイルを上、ファイル名を下に配置し、`cover_list`と`reference_tile`も画像が次段へはみ出さないようにする。詳細リストでは種別を表示する。 |
| FR-B05 名前検索 | REQ-FR-B05-001, REQ-FR-B05-002, REQ-FR-B05-003, REQ-FR-B05-004, REQ-FR-B05-005 | FUT-C-010 | toolbarの検索buttonで開くside paneから正規化した名前検索、mixed result、結果移動、empty/clear/error、明示rescan、local-onlyを保証する。検索条件として、サブフォルダ、folder/file種別、固定した現在folderの検索範囲、sizeの以上/以下、更新日時の以降/以前/期間を指定でき、結果を移動時にも保持するか選べる。 |
| FR-B06 お気に入り | REQ-FR-B06-001, REQ-FR-B06-002, REQ-FR-B06-003, REQ-FR-B06-004, REQ-FR-B06-005 | FUT-C-011, FUT-C-021 | stable identity、冪等add/remove、quick access、missing/moved再解決、migrationと再起動保存を保証する。 |
| FR-B07 読書情報 | REQ-FR-B07-001, REQ-FR-B07-002, REQ-FR-B07-003, REQ-FR-B07-004, REQ-FR-B07-005 | FUT-C-023, FUT-R-004, FUT-R-005 | item identityごとのmemo、成功open history、rating、schema migration、原本非破壊を保証する。 |
| FR-B08 静止WebP | REQ-FR-B08-001, REQ-FR-B08-002, REQ-FR-B08-003, REQ-FR-B08-004, REQ-FR-B08-005 | FUT-C-005 | folder/ZIP/CBZ/EPUB/RAR/CBR/7z/CB7/LZHの静止WebPを列挙・表示・thumbnail化し、corrupt/animatedを局所errorにしてlicense gateを通す。 |
| FR-B09 ライブラリ診断 | REQ-FR-B09-001, REQ-FR-B09-002, REQ-FR-B09-003 | — | ライブラリをread-onlyで確認し、前回診断との追加・変更・欠落、重複、破損した対応書庫を表示する。作品を変更・削除・外部送信しないこと、初回は比較基準を作ることを説明する。実行中は割合を推定せず、確認対象と動作中を示すインジケータおよびcancel操作を表示する。 |
| FR-B10 tag | REQ-FR-B10-001, REQ-FR-B10-002, REQ-FR-B10-003, REQ-FR-B10-004 | FUT-C-022 | normalized tagのassign/remove/query/rename/merge、invalid拒否、migration、再起動保存を保証する。 |
| FR-B11 入力拡張 | REQ-FR-B11-001, REQ-FR-B11-002, REQ-FR-B11-003, REQ-FR-B11-004 | FUT-C-019, FUT-R-006, FUT-R-007 | keyboard commandのremap、conflict拒否、reset、focus fallback、再起動保存を保証する。編集入口は統合設定だけに置き、helpは現在の割り当て表示だけを行う。touch/gamepadは候補のまま。 |
| FR-B22 file manager | REQ-MVP-021, REQ-FR-B22-001, REQ-FR-B22-002, REQ-FR-B22-003, REQ-FR-B22-004 | FUT-C-024〜029, FUT-C-053 | 右click/keyboard context menu、Windows shell連携、選択項目のrename/move/copy/delete、現在folderへのcreate/paste、安全境界、成功後refreshを一貫して扱う。通常deleteはごみ箱、完全deleteは対象名を示す確認後だけ実行する。 |

## 採用済みP1〜P10

| Priority / Feature | 対象ID | 現行契約 |
|---|---|---|
| P1 / FR-B13 | FUT-C-049, FUT-C-054, FUT-C-055, FUT-C-057, FUT-C-068 | refresh、複数・種別選択、相対path copy、property、現在位置status。 |
| P2 / FR-B14 | FUT-C-042, FUT-C-044, FUT-C-051, FUT-C-056 | root内open、成功openのrecent、履歴jump、明示終了。 |
| P3 / FR-B15 | FUT-C-045, FUT-C-046, FUT-C-047 | page-key bookmark、next/wrap、favoriteと別のapp-local bookshelf。 |
| P4 / FR-B16 | FUT-C-050, FUT-C-058 | 検索side paneのbasename maskと、absolute pathを含まずformulaを無害化するCSV出力。 |
| P5 / FR-B17 | FUT-C-065, FUT-C-066, FUT-C-067 | 5分類menu、accessible icon toolbar、永続化する`reference_tile`。 |
| P6 / FR-B18 | FUT-C-060, FUT-C-061, FUT-C-062, FUT-C-063 | pane/bar可逆表示、viewer分離、native tray hide/showと終了の分離。 |
| P7 / FR-B19 | FUT-C-069, FUT-C-071, FUT-C-072, FUT-C-076, FUT-C-077 | atomic設定、strict profile、左右swipe gesture、offline help、version/runtime/license表示。viewerのdouble clickは設定対象にせず全画面切替へ固定する。ヘルプmenuでは一般ヘルプとバージョン情報を別の項目・dialogとして開く。 |
| P8 / FR-B08 | FUT-C-006, FUT-C-007, FUT-C-008 | GIFの安全な分類・metadata・MIME・製品decodeと、AVIFの安全な分類・metadata・MIME・corrupt境界。AVIFの製品decodeは未受入。 |
| P9 / FR-B12 | FUT-C-001, FUT-C-002 | 単一volume・非暗号化RAR4/RAR5（RAR/CBR）、非暗号化7z（7z/CB7）、LHA/LZH（LZH）を安全に読み、分割RAR、暗号化書庫、未対応圧縮方式はunsupported分類する。一覧・検索結果・お気に入りでは、対応書庫の集合ではなく各項目の実際の形式（ZIP、CBZ、EPUB、RAR、CBR、7Z、CB7、LZH）を表示する。 |
| P10 / FR-B20 | FUT-C-073, FUT-C-074, FUT-C-075 | app-local thumbnail管理、明示保存、検証済みJPEG import。製品file picker gateは未完了。 |

## 全体受入シナリオ

- E2E-MVP-001: root登録から画像folderを開き、単page/見開きで読み、再起動後に読書位置を復元する。
- E2E-MVP-002: ZIP/CBZ/EPUB/RAR/CBR/7z/CB7/LZHを閲覧してcacheと読書位置を生成しても、原本tree、hash、mtimeが一致する。
- E2E-MVP-003: catalogの自然順・sort順に従い、巻末から次の漫画の先頭または保存pageへ進む。
- E2E-MVP-004: network隔離状態で主要機能が動作し、外部DNS/TCP/UDP送信がないことを外部監視する。これは未完了gateである。
- E2E-MVP-005: catalogの右clickまたはkeyboard context menuからrename、copy、move、create、delete、OS clipboard pasteを行い、選択した対象だけが変更され、成功後のcatalogへ結果が反映される。

## 非採用と将来候補の境界

| 区分 | 安定ID | 扱い |
|---|---|---|
| Candidate | FUT-C-052 | file operation undo。OS shellのundo履歴をapplication状態として保証できるまで未採用。 |
| Candidate | FUT-R-006, FUT-R-007 | touch、gamepad。実機契約と直接観測ができるまで未採用。 |
| Rejected | FUT-R-001, FUT-R-002, FUT-R-003, FUT-R-008 | cloud同期、外部書誌、外部送信、閲覧時の原本自動変更。恒久安全原則を変更しない限り採用しない。 |
| Partial | FUT-C-006, FUT-C-007, FUT-C-008 | AVIFはunsupported/parser境界だけ実装済み。完全decodeを推定しない。 |

FR-B04は現行の採用laneとして定義されていない。欠番を新機能の根拠として扱わない。

## PDF対応の受入条件

| Feature | 要件ID | 現行契約 |
|---|---|---|
| FR-B21 PDF viewer | REQ-MVP-020, REQ-FR-B21-001, REQ-FR-B21-002, REQ-FR-B21-003 | `.pdf`をcatalogの`pdf`種別で表示し、standalone documentのpage数を列挙する。各pageは寸法を検証してからWindows.Data.Pdfへboundedな出力寸法を指定してPNG renderし、既存viewer、thumbnail、favorite、巻末遷移、読書位置を利用する。PDFは書庫内entryや書庫として再帰解釈せず、暗号化・破損・0 page・過大source/render・root外symlinkを分類して拒否する。 |
