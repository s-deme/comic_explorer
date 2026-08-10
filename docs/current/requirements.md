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
ICO、SVG、静止WebP、ZIP/CBZ/EPUB/RARを実装済み範囲とする。WICは画像形式ではなく、
Windows標準codecが扱うraster画像のdecode基盤として利用する。AVIFとCBR/7zには
実装済みの安全な分類・拒否境界があるが、製品decodeまたはreaderの受入は未完了である。

対象外は、クラウド同期、外部書誌取得、telemetry、外部データ送信、library原本への自動変更、
OS全体を操作するfile managerである。rename、move、copy、create、delete、OS clipboard file操作は
採用未決定の候補であり、現行契約には含めない。

## 恒久安全原則

- すべての閲覧経路はlibrary原本、書庫、mtime、sidecarを変更しない（REQ-MVP-017）。
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
| REQ-MVP-005 | folder、漫画folder、対応archive、画像をcatalogに表示し、未対応fileの種別にはfile名の拡張子をそのまま表示する。 |
| REQ-MVP-006 | 自然順の先頭pageから表紙thumbnailを生成し、fingerprintとcache鮮度を管理する。 |
| REQ-MVP-007 | toolbar buttonから並べ替え、昇降順、巻末動作、一覧形式のmenuを操作し、設定を保存する。 |
| REQ-MVP-008 | 画像folderおよび対応archive内のBMP、JPEG/JPG、GIF、TIFF/TIF、PNG、ICO、SVG、静止WebPを1冊として相対pathの自然順で読み、catalogの画像を直接開いた場合は同じfolderのpage群を選択画像から開始する。raster画像はWICまたは専用decoderで実ピクセルを検証し、SVGはscriptと外部resourceを実行・取得せずに表示とthumbnail生成を行う。 |
| REQ-MVP-009 | ZIP/CBZ/EPUBと単一volume・非暗号化RAR4/RAR5を隣接展開せず、対応圧縮entryを検証し、格納画像を自然順で読む。分割RAR、暗号化RAR、EPUBのHTML本文組版は対象外とする。 |
| REQ-MVP-010 | catalog項目はダブルクリックまたはkeyboardでviewerへ開き、card内に重複する読むbuttonを置かず、終了後にcatalogの文脈を復元する。 |
| REQ-MVP-011 | 単pageを縦横比維持で表示し、範囲内移動とfitを提供する。 |
| REQ-MVP-012 | 見開きは最大2pageとし、横長pageと末尾1pageを単独表示する。 |
| REQ-MVP-013 | 右開き・左開きを配置と移動へ一貫適用し、設定を保存する。 |
| REQ-MVP-014 | keyboard、click、wheel、Escで閲覧でき、viewer toolbarの操作を説明付きicon buttonで提供し、viewer generationの古い結果を捨てる。 |
| REQ-MVP-015 | page keyを基準に読書位置をapp-local SQLiteへ保存・復元し、破損DBから安全に回復する。 |
| REQ-MVP-016 | 巻末では現在のcatalog sort順に従って次の漫画へ進む。 |
| REQ-MVP-017 | 閲覧、thumbnail、読書位置保存の前後でlibrary原本を非破壊に保つ。 |
| REQ-MVP-018 | 外部通信、telemetry、crash upload、書誌取得、cloud同期を行わない。 |
| REQ-MVP-019 | 項目単位のaccess、missing、corrupt、unsupported errorから別操作へ復帰できる。 |

## MVP非機能要件

| 安定ID | 現行契約 | 未完了境界 |
|---|---|---|
| NFR-MVP-001 | 1TB、10,000 files、1,000作品、1冊300pageを想定し、遅延処理、virtualize、10GiB thumbnail LRUを使う。 | 10,000項目のWindows製品UI性能はBLOCKED。 |
| NFR-MVP-002 | cold起動3秒、cached一覧1秒、prefetch済みpage 100ms、10,000項目検索1秒、idle 250MiBを基準PCで測る。 | 現行release候補の基準PC測定はBLOCKED。 |
| NFR-MVP-003 | 14px基準のcompactな文字でtree、catalog、viewerをkeyboard操作でき、focusを視認できる。icon buttonは間隔、accessible name、hover説明を持ち、catalog cardは文字と操作欄を重ねず、tree labelは選択状態によらず背景と判別できる文字色で表示する。設定画面を含む全dialogは共通のheader、余白、control、action、scroll表現を使い、狭い画面でもlabelと操作を重ねない。 | UIA、screen reader、high contrast、DPIはBLOCKED。 |
| NFR-MVP-004 | lockfile全依存を再配布可能licenseに限定し、SBOMとTHIRD-PARTY-NOTICESを同期する。 | 既知の禁止・unknown licenseは0。 |
| NFR-MVP-005 | Windows 10 22H2 x64と対応中Windows 11 x64向けinstallerを生成する。 | clean VM install/uninstallはBLOCKED。 |
| NFR-MVP-006 | 採用構成を再現可能なfixture、性能値、原本snapshot、配布検証で評価し、実測・推定・未測定を分ける。 | 外部環境の未測定を保持する。 |
| NFR-MAINT-001 | Windows filesystem上のCoDD、test、typecheck、buildは`.venv-windows`とWindows toolchainを使い、child exit codeと最終結果を保持する。 | Linux runnerで代替しない。 |

## 採用済みFeature要件

各行の安定IDは統合前要件から継承する。本表は保守時の現行契約だけを示し、過去の詳細は
Git履歴から参照する。

| Feature | 要件ID | 状態追跡ID | 現行契約 |
|---|---|---|---|
| FR-B01 表示倍率 | REQ-FR-B01-001, REQ-FR-B01-002, REQ-FR-B01-003, REQ-FR-B01-004, REQ-FR-B01-005 | FUT-C-018, FUT-C-033, FUT-C-034, FUT-C-035, FUT-C-036, FUT-C-037 | 共通scale model、25%〜400%、fit幅/高さ/全体、原寸、状態維持、pointerルーペ、再起動復元。 |
| FR-B02 巻末動作 | REQ-FR-B02-001, REQ-FR-B02-002, REQ-FR-B02-003 | FUT-C-020, FUT-C-038, FUT-C-039, FUT-C-040, FUT-C-041 | `auto_next`、`confirm_next`、`return_library`、`stop`、`loop`を安全に適用し、sortと設定を維持する。 |
| FR-B03 一覧形式 | REQ-FR-B03-001, REQ-FR-B03-002 | FUT-C-012, FUT-C-013, FUT-C-014 | `small_thumbnail`、`detail_list`、`cover_list`の操作・focus・永続化を共通modelで扱う。 |
| FR-B05 名前検索 | REQ-FR-B05-001, REQ-FR-B05-002, REQ-FR-B05-003, REQ-FR-B05-004, REQ-FR-B05-005 | FUT-C-010 | toolbarの検索buttonで開くside paneから正規化した名前検索、mixed result、結果移動、empty/clear/error、明示rescan、local-onlyを保証する。 |
| FR-B06 お気に入り | REQ-FR-B06-001, REQ-FR-B06-002, REQ-FR-B06-003, REQ-FR-B06-004, REQ-FR-B06-005 | FUT-C-011, FUT-C-021 | stable identity、冪等add/remove、quick access、missing/moved再解決、migrationと再起動保存を保証する。 |
| FR-B07 読書情報 | REQ-FR-B07-001, REQ-FR-B07-002, REQ-FR-B07-003, REQ-FR-B07-004, REQ-FR-B07-005 | FUT-C-023, FUT-R-004, FUT-R-005 | item identityごとのmemo、成功open history、rating、schema migration、原本非破壊を保証する。 |
| FR-B08 静止WebP | REQ-FR-B08-001, REQ-FR-B08-002, REQ-FR-B08-003, REQ-FR-B08-004, REQ-FR-B08-005 | FUT-C-005 | folder/ZIP/CBZ/EPUB/RARの静止WebPを列挙・表示・thumbnail化し、corrupt/animatedを局所errorにしてlicense gateを通す。 |
| FR-B10 tag | REQ-FR-B10-001, REQ-FR-B10-002, REQ-FR-B10-003, REQ-FR-B10-004 | FUT-C-022 | normalized tagのassign/remove/query/rename/merge、invalid拒否、migration、再起動保存を保証する。 |
| FR-B11 入力拡張 | REQ-FR-B11-001, REQ-FR-B11-002, REQ-FR-B11-003, REQ-FR-B11-004 | FUT-C-019, FUT-R-006, FUT-R-007 | keyboard commandのremap、conflict拒否、reset、focus fallback、再起動保存を保証する。編集入口は統合設定だけに置き、helpは現在の割り当て表示だけを行う。touch/gamepadは候補のまま。 |

## 採用済みP1〜P10

| Priority / Feature | 対象ID | 現行契約 |
|---|---|---|
| P1 / FR-B13 | FUT-C-049, FUT-C-054, FUT-C-055, FUT-C-057, FUT-C-068 | refresh、複数・種別選択、相対path copy、property、現在位置status。 |
| P2 / FR-B14 | FUT-C-042, FUT-C-044, FUT-C-051, FUT-C-056 | root内open、成功openのrecent、履歴jump、明示終了。 |
| P3 / FR-B15 | FUT-C-045, FUT-C-046, FUT-C-047 | page-key bookmark、next/wrap、favoriteと別のapp-local bookshelf。 |
| P4 / FR-B16 | FUT-C-050, FUT-C-058 | 検索side paneのbasename maskと、absolute pathを含まずformulaを無害化するCSV出力。 |
| P5 / FR-B17 | FUT-C-065, FUT-C-066, FUT-C-067 | 5分類menu、accessible icon toolbar、永続化する`reference_tile`。 |
| P6 / FR-B18 | FUT-C-060, FUT-C-061, FUT-C-062, FUT-C-063 | pane/bar可逆表示、viewer分離、native tray hide/showと終了の分離。 |
| P7 / FR-B19 | FUT-C-069, FUT-C-071, FUT-C-072, FUT-C-076, FUT-C-077 | atomic設定、strict profile、gesture、offline help、version/runtime/license表示。 |
| P8 / FR-B08 | FUT-C-006, FUT-C-007, FUT-C-008 | GIFの安全な分類・metadata・MIME・製品decodeと、AVIFの安全な分類・metadata・MIME・corrupt境界。AVIFの製品decodeは未受入。 |
| P9 / FR-B12 | FUT-C-001, 002 | 単一volume・非暗号化RAR4/RAR5を安全に読み、CBR/7zと分割・暗号化RARはunsupported分類する。 |
| P10 / FR-B20 | FUT-C-073, FUT-C-074, FUT-C-075 | app-local thumbnail管理、明示保存、検証済みJPEG import。製品file picker gateは未完了。 |

## 全体受入シナリオ

- E2E-MVP-001: root登録から画像folderを開き、単page/見開きで読み、再起動後に読書位置を復元する。
- E2E-MVP-002: ZIP/CBZ/EPUB/RARを閲覧してcacheと読書位置を生成しても、原本tree、hash、mtimeが一致する。
- E2E-MVP-003: catalogの自然順・sort順に従い、巻末から次の漫画の先頭または保存pageへ進む。
- E2E-MVP-004: network隔離状態で主要機能が動作し、外部DNS/TCP/UDP送信がないことを外部監視する。これは未完了gateである。

## 非採用と将来候補の境界

| 区分 | 安定ID | 扱い |
|---|---|---|
| Candidate | FUT-C-024, FUT-C-025, FUT-C-026, FUT-C-027, FUT-C-028, FUT-C-029, FUT-C-052, FUT-C-053 | rename、move、copy、folder作成、trash、完全削除、undo、OS clipboard file操作。採用時はREQ-MVP-017を先に改定する。 |
| Candidate | FUT-R-006, FUT-R-007 | touch、gamepad。実機契約と直接観測ができるまで未採用。 |
| Rejected | FUT-R-001, FUT-R-002, FUT-R-003, FUT-R-008 | cloud同期、外部書誌、外部送信、閲覧時の原本自動変更。恒久安全原則を変更しない限り採用しない。 |
| Partial | FUT-C-001, FUT-C-002, FUT-C-006, FUT-C-007, FUT-C-008 | CBR/7zとAVIFはunsupported/parser境界だけ実装済み。完全reader/decodeを推定しない。 |

FR-B04とFR-B09は現行の採用laneとして定義されていない。欠番を新機能の根拠として扱わない。
