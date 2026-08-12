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

- 最終更新日: 2026-08-12 JST
- version: 0.1.0
- 文書統合開始時commit: `3777cf5ec552aef80e0cd52ea19011edf3c7f68d`
- 対象: 上記commitの実装と、本ドキュメント統合差分

実装コードと実行可能なテストコードを検証内容の正本とする。本書は最後に受理された結果と
未完了境界の要約であり、Git履歴上の過去runを現在のPASSへ合算しない。

## 最新の受理済み結果

| 領域 | 状態 | 実測内容または境界 |
|---|---|---|
| Rust canonical | PASS | 2026-08-13、lib 154件 + shutdown process 1件、FAIL 0。Windows論理ドライブbitmaskの列挙、Explorer表示用pathからの`\\?\` / `\\?\UNC\`除去、folder一覧が子孫画像・表紙候補を分類せずmetadataだけを返す境界と、明示的なlibrary診断では画像folderの作品判定を維持する境界、検索条件、viewer page worker、thumbnail、設定永続化を含む。`cargo fmt --check`と`cargo check --locked`もexit 0。 |
| Rust P8 focused | PASS / feature部分BLOCKED | 2026-08-10、22 PASS / 0 FAIL / 0 ignored。GIF/AVIF container testであり製品decodeのPASSではない。 |
| 追加画像形式 | PASS / animated GIF製品観測BLOCKED | BMP/GIF/TIFF/ICOの実ピクセルdecode、SVGの静止・外部resource無効rasterize、folder/archive列挙、MIME/signature、PNG viewer配信、WIC JPEG thumbnailをWindows Rust canonicalで直接検証。release WebView2のanimated GIF再生は未観測。 |
| TypeScript/frontend | PASS | 2026-08-13、25 files / 263 tests PASS、FAIL 0。root登録画面を表示しない起動、PC配下のdrive表示とsidebar選択、drive切替、現在folder absolute pathのtree header、navigation・drive往復・検索pane・一時非表示をまたぐbranch展開保持、明示的な全折りたたみ、folder thumbnail要求0、連続viewerで現在pageと最大4page先だけを要求するbounded prefetch、重複page要求の抑止を含む。大判表紙だけを表示して視覚上のファイル情報を省くカードグリッド、左側の固定表紙と右側の名前・種別・サイズ・更新日時を持つ情報カード、全5一覧形式の切替、4形式別のthumbnail幅、profile v1/v2からv3への移行、既存の種類icon、設定、command、検索、viewer回帰、TypeScript typecheckもexit 0。 |
| Python | PASS | 2026-08-13、49 tests PASS、FAIL 0。tree headerと独立scroll領域、設定dialog、catalog固定幅card、表紙グリッドの画像・ファイル名分離、大判カードグリッドのthumbnail専用領域と左上favorite、情報カードの横長2領域と右上favorite、固定幅種類iconと省略、狭幅時にもthumbnailを上書きしないstyle contract、現行status/verification間の5値consistencyもPASS。 |
| standalone PDF | PASS / 製品観測BLOCKED | Windows.Data.Pdfで実PDFのpage列挙とPNG renderを直接検証。1 GiB source、10,000 pages、最大辺16,384 px、120,000,000 pixelsをrender前に制限し、暗号化・破損・access・missingのerror分類、root外symlink拒否、独立した`pdf`種別と画像選択境界をRust canonicalとfrontend testで検証した。release WebView2のviewer・thumbnail表示は未観測。 |
| file manager | PASS / 製品観測BLOCKED | Windows Rust canonicalでrename、folder作成、copy、move、完全delete、CF_HDROPのcopy/cut round trip、root containment、reparse point・同名衝突・子孫destination拒否を実filesystem上で検証。frontend testで右click/keyboard menu、rename・delete接続、確認dialog、全画面・slideshow起動を検証した。release製品のnative folder picker、ごみ箱、Explorer、アプリ選択は未観測。 |
| EPUB書庫 | PASS | ZIP互換Stored/DeflateのEPUBについて、大文字小文字を無視した分類、自然順画像列挙、catalog、WebP、media token、原本非破壊をWindows Rust canonicalと87-file fixtureで直接検証。HTML本文組版は対象外。 |
| 対応書庫 | PASS | ZIP/CBZ/EPUB、RAR/CBR、7z/CB7、LZHについて、大文字小文字を無視した分類、自然順画像列挙、entry読取、catalog metadata、診断、原本非展開をWindows Rust canonicalで直接検証。ZIP内でCBZ/CB7/LZH/CBRを混在させた多重圧縮の列挙・読取、opaque page key、内側3階層と64書庫の上限も直接検証した。RARは単一volume・非暗号化RAR4/RAR5、7zはCopy/LZMA/LZMA2、LZHはStored/LH1/LH4〜LH7/LZS/LZ5を採用範囲とし、危険path、size/entry/再帰上限、未対応圧縮方式を拒否する。 |
| frontend build/SBOM | PASS | 2026-08-13のWindows frontend buildは65 modulesをbuild、exit 0。SBOMは直近受理済み729 components、unknown/prohibited license 0。UnRAR、`sevenz-rust`、`delharc`を含むnoticeを同期済み。 |
| release executable | PASS / 製品受入部分BLOCKED | 追加decoderを含むWindows release executableを再buildしexit 0。static WebP、search、favorite、tag、memo/history/rating等のaccepted product laneはPASS。animated GIF観測、P5/P6/P8/P10と全外部release gateへ波及しない。 |
| 原本非破壊 | PASS（測定済みlane） | accepted product harnessでlibrary source tree差分0。未実行laneを含む全操作の無条件PASSではない。 |
| 外部通信 | BLOCKED | code/依存境界はlocal-only。VM外部監視による完全観測は未実施。 |
| CoDD | PASS（red 0） | 2026-08-13、scan 4 documents / 57 nodes / 129 edges。check red 0、verify exit 0、DAG red 3 PASS / 0 FAIL、source integrity 13 files。構造的SKIP/VACUOUSとverification-node 0件は機能PASSへ加算しない。 |

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

- PASS: FR-B01、B02、B03、B05、B06、B07、static WebPのB08、B10、B12、B13〜B16、B19、FR-B11のkeyboard・mouse範囲。
- BLOCKED/PARTIAL: B08のanimated GIF製品観測とAVIF decode、B11の任意軌跡gesture/touch/gamepad、B17、B18、B20、B21、B22の製品表示・native shell観測。
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
| PDF product UI | BLOCKED | release WebView2でのPDF viewerとthumbnailの直接表示を未観測。backendの実renderとfrontend contractはPASS。 |
| file manager product UI | BLOCKED | release WebView2のcontext menuからnative folder picker、ごみ箱、Explorer、アプリ選択までの直接観測を未実施。filesystem・CF_HDROP backendとfrontend contractはPASS。 |
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
