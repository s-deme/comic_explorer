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

現行要件台帳はMVP 27件（REQ 21、NFR 6）とMVP後/将来75件の計102件である。Leeyes互換機能は別の運用台帳`leeyes-feature-tracker.csv`で192件を管理する。2026-08-21に、当時UndecidedかつMissing / Partialだった103件（Missing 67件、Partial 36件）をP1〜P5の実装対象として一括選択した。対象集合と順序は`leeyes-implementation-manifest.csv`を正とし、既存Published 3件は再実装対象に含めない。

## Leeyes P1〜P5進捗

| tier | 対象 | Published | 未完了 |
|---|---:|---:|---:|
| P1 即効改善 | 21 | 0 | 21 |
| P2 閲覧中核 | 16 | 0 | 16 |
| P3 操作・検索 | 31 | 0 | 31 |
| P4 大型基盤 | 12 | 0 | 12 |
| P5 専門機能 | 23 | 0 | 23 |
| **合計** | **103** | **0** | **103** |

マニフェストは各tier内のrankを依存基盤、PartialExisting、利用頻度とリスク、規模の順で固定する。
対象外のNoAction、ReviewAlternative、DeclinedSafety、Rejected、Alternativeは依存を理由に採用状態や
Leeyes互換方式へ変更しない。

| 実装状態 | 検証状態 | 件数 |
|---|---|---:|
| Implemented | PASS | 71 |
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
| FR-B01 | 表示倍率 | Implemented / PASS | page layoutの横幅フィットはviewer stage全幅・全高を使い、見開きではpage間gapだけを残す。stageより低い画像の上下中央配置と、高い画像を上端から下端まで末尾の固定余白なしでscrollできるstyle contractをWindows testで検証済み。 |
| FR-B02 | 巻末policy | Implemented / PASS | folder内画像を1冊として閲覧した巻末では親catalogのsort順から次巻を選び、次項目が通常folderでもbackendのfolder画像列挙へ渡して先頭pageを開くことをWindows frontend testで検証済み。 |
| FR-B03 | catalog表示形式 | Implemented / PASS | 詳細、小サムネイル、表紙グリッド、カードグリッド、情報カードの順序・名称、4形式別の固定thumbnail幅、表紙中心の縦型grid、外枠と内側余白を省いて4px間隔で並べる大判表紙だけのカードグリッド、属性付き横長情報カードの区別、ファイル名非重複、profile v1/v2からv3への移行とprofile v4での保持、SQLite再起動復元をWindows frontend/Rust/Python testで検証。 |
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
| FR-B19 / P7 | settings・help | Implemented / PASS | 設定5カテゴリ、横断検索、説明付きrow、全設定のdraft resetをWindows frontend testで検証済み。 |
| FR-B20 / P10 | thumbnail maintenance | Implemented / BLOCKED | 製品file picker、実JPEG保存、一括import未測定。 |
| FR-B21 | standalone PDF | Implemented / PASS | Windows.Data.Pdfの実render、canonical path正規化、上限・分類・root containmentに加え、release WebView2のviewer・thumbnail実decodeを日本語名PDFで直接観測済み。 |
| FR-B22 | file manager | Implemented / BLOCKED | Windows filesystemとOS clipboardのbackend実動作、Shell delete path正規化、catalog/tree context menu・keyboard操作・右click宛先paste・catalog/tree双方を起点とするdrag move・tree folder削除後の安全な親folder遷移・操作後tree再列挙・確認dialogのfrontend接続はPASS。native picker、ごみ箱、Explorerとの実paste、アプリ選択の製品直接観測は未測定。 |
| FR-B23 | Leeyes viewer操作・外観 | Implemented / PASS | LEY-VIEWER-004、025、028を選択範囲として、見開きanchorの1page移動、4背景preset、0〜64pxの周囲余白・見開き間隔、無効/1/2/3/5秒のstage cursor自動非表示、profile v4・SQLite保存、v1〜v3移行、不正値拒否をWindows frontend 296件、Python 56件、Rust canonical、typecheck、buildで検証済み。release WebView2上の目視・操作は未測定であり、自動検証PASSへ合算しない。 |

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

- Windows 10 22H2 / Windows 11 clean VMのinstall、offline WebView2、launch、uninstall、user-data保持/削除。
- VM外部からのDNS/TCP/UDP監視による外部通信0の確認。
- 基準PCでのcold TTI、10,000項目、scroll/FPS、input/page latency、working set、cache測定。
- Windows UIA、Narrator/NVDA、high contrast、100/150/200% DPI。
- WebView2 custom protocolの実Origin/Referer header統合。
- animated GIFのrelease WebView2直接観測とcorrupt fallback、AVIFの製品decode。
- tray notification area、P5 visual/DPI、thumbnail file pickerと実disk I/Oの製品gate。
- file managerのnative folder picker、ごみ箱、Explorerとの実paste、アプリ選択、release WebView2 context menuの製品直接観測。

これらが残るため、製品全体を「すべてのrelease gateがPASS」とは判定しない。
