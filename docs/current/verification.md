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

- 最終更新日: 2026-08-11 JST
- version: 0.1.0
- 文書統合開始時commit: `3777cf5ec552aef80e0cd52ea19011edf3c7f68d`
- 対象: 上記commitの実装と、本ドキュメント統合差分

実装コードと実行可能なテストコードを検証内容の正本とする。本書は最後に受理された結果と
未完了境界の要約であり、Git履歴上の過去runを現在のPASSへ合算しない。

## 最新の受理済み結果

| 領域 | 状態 | 実測内容または境界 |
|---|---|---|
| Rust canonical | PASS | 2026-08-11、lib 150件 + shutdown process 1件、FAIL 0。検索のscope・種別・size・更新日時・固定場所の条件適用、catalogへ直接表示する画像自身のthumbnail生成を含む。`cargo fmt --check`と`cargo check --locked`もexit 0。 |
| Rust P8 focused | PASS / feature部分BLOCKED | 2026-08-10、22 PASS / 0 FAIL / 0 ignored。GIF/AVIF container testであり製品decodeのPASSではない。 |
| 追加画像形式 | PASS / animated GIF製品観測BLOCKED | BMP/GIF/TIFF/ICOの実ピクセルdecode、SVGの静止・外部resource無効rasterize、folder/archive列挙、MIME/signature、PNG viewer配信、WIC JPEG thumbnailをWindows Rust canonicalで直接検証。release WebView2のanimated GIF再生は未観測。 |
| TypeScript/frontend | PASS | 2026-08-11、24 files / 205 tests PASS、FAIL 0。対応書庫の項目別形式表示、検索条件のrequest変換・検索結果保持、一般ヘルプとバージョン情報の分離、診断のread-only説明と実行中indicator、catalogの利用可能幅に応じたcard列数・virtual行の縮退、サムネイル系cardの種別非表示と画像・長いファイル名のlayout分離、folder内に直接表示する画像のthumbnail要求、viewer toolbarからの巻末動作変更、対応archiveの通常open時の全画面開始、全画面toolbarの上端pointer表示、TypeScript typecheckもexit 0。 |
| Python | PASS | 2026-08-11、45 tests PASS、FAIL 0。menu/addressのcompact寸法、tree文字色、固定page幅を持たないcatalog縮退、検索条件・診断indicator、viewer toolbar内の巻末動作controlと全画面時の非占有・市松背景style contract、現行status/verification間の5値consistencyもPASS。 |
| standalone PDF | PASS / 製品観測BLOCKED | Windows.Data.Pdfで実PDFのpage列挙とPNG renderを直接検証。1 GiB source、10,000 pages、最大辺16,384 px、120,000,000 pixelsをrender前に制限し、暗号化・破損・access・missingのerror分類、root外symlink拒否、独立した`pdf`種別と画像選択境界をRust canonicalとfrontend testで検証した。release WebView2のviewer・thumbnail表示は未観測。 |
| file manager | PASS / 製品観測BLOCKED | Windows Rust canonicalでrename、folder作成、copy、move、完全delete、CF_HDROPのcopy/cut round trip、root containment、reparse point・同名衝突・子孫destination拒否を実filesystem上で検証。frontend testで右click/keyboard menu、rename・delete接続、確認dialog、全画面・slideshow起動を検証した。release製品のnative folder picker、ごみ箱、Explorer、アプリ選択は未観測。 |
| EPUB書庫 | PASS | ZIP互換Stored/DeflateのEPUBについて、大文字小文字を無視した分類、自然順画像列挙、catalog、WebP、media token、原本非破壊をWindows Rust canonicalと87-file fixtureで直接検証。HTML本文組版は対象外。 |
| 対応書庫 | PASS | ZIP/CBZ/EPUB、RAR/CBR、7z/CB7、LZHについて、大文字小文字を無視した分類、自然順画像列挙、entry読取、catalog metadata、診断、原本非展開をWindows Rust canonicalで直接検証。ZIP内でCBZ/CB7/LZH/CBRを混在させた多重圧縮の列挙・読取、opaque page key、内側3階層と64書庫の上限も直接検証した。RARは単一volume・非暗号化RAR4/RAR5、7zはCopy/LZMA/LZMA2、LZHはStored/LH1/LH4〜LH7/LZS/LZ5を採用範囲とし、危険path、size/entry/再帰上限、未対応圧縮方式を拒否する。 |
| frontend build/SBOM | PASS | Windows buildは63 modulesをbuild、exit 0。SBOMは729 components、unknown/prohibited license 0。UnRAR、`sevenz-rust`、`delharc`を含むnoticeを同期済み。 |
| release executable | PASS / 製品受入部分BLOCKED | 追加decoderを含むWindows release executableを再buildしexit 0。static WebP、search、favorite、tag、memo/history/rating等のaccepted product laneはPASS。animated GIF観測、P5/P6/P8/P10と全外部release gateへ波及しない。 |
| 原本非破壊 | PASS（測定済みlane） | accepted product harnessでlibrary source tree差分0。未実行laneを含む全操作の無条件PASSではない。 |
| 外部通信 | BLOCKED | code/依存境界はlocal-only。VM外部監視による完全観測は未実施。 |
| CoDD | PASS（red 0） | scan 4 documents / 55 nodes / 119 edges。check red 0。verify exit 0、DAG red FAIL 0。構造的SKIP/VACUOUSはPASSへ加算しない。 |

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

- PASS: FR-B01、B02、B03、B05、B06、B07、static WebPのB08、B10、B12、B13〜B16、B19、FR-B11のkeyboard範囲。
- BLOCKED/PARTIAL: B08のanimated GIF製品観測とAVIF decode、B11のtouch/gamepad、B17、B18、B20、B21、B22の製品表示・native shell観測。
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
