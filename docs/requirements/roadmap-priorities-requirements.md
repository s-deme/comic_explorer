---
codd:
  node_id: "req:roadmap-priorities"
  type: requirement
  status: approved
  confidence: 0.9
  depends_on:
    - id: "req:mvp-requirements"
      relation: "extends"
      semantic: "local-only-read-only-library-contract"
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "leeyes-parity-priority"
    - id: "design:architecture"
      relation: "implements"
      semantic: "typed-command-and-cache-boundary"
---

# ロードマップ P1〜P10 実装要件

## 共通採用範囲

ロードマップのP1〜P10に列挙された機能を、既存のReact/Tauri shell、catalog、viewer、
app-local SQLite、thumbnail pipelineへ接続する。実装は登録library root内の参照と、
利用者が明示したapp-local metadata/cache操作に限定する。libraryの原本、書庫、sidecar、
library管理fileへ自動書込みせず、外部通信・外部書誌・同期を行わない。新しいcommandは
既存の`RequestContext`、generation、構造化errorを利用し、絶対pathや任意SQLをUIへ返さない。

## P1: catalog command基盤

`FUT-C-057`は現在folderの再走査をF5で実行し、更新後も安全なselectionとaddressを保つ。
`FUT-C-055`は全選択、kind選択、反転、解除をkeyboardで行う。`FUT-C-054`は選択項目の
library-root相対pathを改行区切りでclipboardへ渡す。`FUT-C-049`は選択が一件のときに
name、kind、relative path、size、更新日時を表示する。`FUT-C-068`はfilter後の現在位置、
表示件数、選択をstatusへ反映する。複数選択でfile mutationは実行しない。

## P2: open・navigation

`FUT-C-042`は登録root内のfile/folderをopenする。file openは画像または漫画項目をviewerへ、
folderはcatalogへ送る。`FUT-C-044`は成功したopenだけをrecent menuへ追加し、`FUT-C-056`は
back/forward履歴から直接移動する。`FUT-C-051`は明示的な終了commandを提供するが、未保存の
原本操作を暗黙に作らない。

## P3: しおり・本棚

`FUT-C-045`はviewerの現在pageをitem identityとpage keyで明示保存し、一覧から再openする。
`FUT-C-046`は現在pageより後のbookmarkへ進み、末尾では先頭へwrapする。`FUT-C-047`は
favoriteと混同しないapp-local bookshelf collectionを表示し、catalogから追加・除去する。

## P4: filter・export

`FUT-C-058`はbasenameのglob mask（`*`、`?`、複数maskを`;`区切り）を現在catalogへ適用し、
空maskは全件とする。`FUT-C-050`は現在のfiltered rowsをUTF-8 BOMなしCSVへ出力する。
CSVはname、kind、relative path、size、modifiedを持ち、absolute pathや原本書込みを含まない。
ブラウザdownloadが使えない環境では利用者へ失敗を通知する。

## P5: 参照shell UI

`FUT-C-065`は参照commandをファイル/編集/表示/オプション/ヘルプへ整理し、既存commandを
二重実装しない。`FUT-C-066`はaccessible name付きicon toolbarを提供する。`FUT-C-067`は
既存thumbnail/view-modeを再利用した参照型tileを提供し、long nameとkeyboard focusを保つ。

## P6: workspace・window

`FUT-C-062`はfolder paneを表示切替し、`FUT-C-063`はtoolbar/menu barをcurrent-sessionで
表示切替する。`FUT-C-060`はviewerをcatalog shellから同一アプリ内の独立表示状態へ切り替え、
Escで復帰できる。`FUT-C-061`はtray APIが利用できるWindowsではhide/showを提供し、tray
APIがない環境では安全にdisabledと表示する。終了と収納を混同しない。

## P7: 設定・help

`FUT-C-069`は先行priorityの設定を一つのdialogでapply/cancelする。`FUT-C-071`は非機密の
表示・操作設定だけをJSON profileとしてexport/importする。`FUT-C-072`はgesture設定を
keyboard commandのlocal mappingとして保持し、conflictを拒否する。`FUT-C-076`はoffline
helpを表示し、`FUT-C-077`はversion、runtime、license notice導線を表示する。

## P8: 追加画像形式

`FUT-C-006` static GIF、`FUT-C-008` AVIF、`FUT-C-007` animation GIFを既存page MIME、
catalog、viewerへ接続する。animationはWebView2の再生を許可し、アプリ側はframeを永続化
しない。破損・非対応形式は構造化errorとplaceholderで継続する。

## P9: 追加書庫形式

`FUT-C-001` RAR/CBR、`FUT-C-002` 7zはarchive adapterの契約で列挙・順序付けし、抽出物を
libraryへ残さない。依存crateのlicense/SBOM、Windows build、fixtureが確認できない形式は
catalogでunsupportedとして扱い、壊れた書庫を成功と判定しない。

## P10: thumbnail保守

`FUT-C-073`はapp-local thumbnail cacheの件数・bytes・削除を表示する。`FUT-C-074`は
表示中thumbnailを利用者が選んだローカル保存先へJPEGとして保存する。`FUT-C-075`は同じ
thumbnail形式のファイルを選択してcacheへ読み込み、既存原本と衝突させない。容量上限、
失敗、取消、cache migrationはUIに説明し、元画像へ書き戻さない。

## 受入テスト

各priorityは次のfocused test群を直接観測し、SKIP 0で受入する。

| Priority | focused IDs |
|---|---|
| P1 | FT-B13-001〜005 |
| P2 | FT-B14-001〜004 |
| P3 | FT-B15-001〜003 |
| P4 | FT-B16-001〜002 |
| P5 | FT-B17-001〜003 |
| P6 | FT-B18-001〜004 |
| P7 | FT-B19-001〜005 |
| P8 | FT-B08-002〜005 |
| P9 | FT-B12-001〜005 |
| P10 | FT-B20-001〜003 |

focused test、typecheck/build、Rust check/test、CoDDの結果は対応する結果文書へ記録する。
Windows-only product gateやdecoder/archive dependencyが利用できない場合はPASSへ読み替えず、
そのpriorityの状態をBlockedまたは未測定として保持する。
