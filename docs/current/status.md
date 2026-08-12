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

現行台帳はMVP 27件（REQ 21、NFR 6）とMVP後/将来71件の計98件である。

| 実装状態 | 検証状態 | 件数 |
|---|---|---:|
| Implemented | PASS | 66 |
| Implemented | BLOCKED | 16 |
| Partial | BLOCKED | 9 |
| Candidate | NOT TESTED | 3 |
| Rejected | NOT TESTED | 4 |
| **合計** |  | **98** |

## MVP状態

| 範囲 | 状態 | 備考 |
|---|---|---|
| REQ-MVP-001〜007, 009〜017, 019 | Implemented / PASS | root登録画面なしのExplorer shell、PC配下のWindows drive列挙・選択・切替、treeの現在folder表示・drive別展開保持・明示的な全折りたたみ、通常pathのaddress表示、子孫を走査しないfolder一覧と専用icon、file名左端の種類別iconを含むcatalog、現在pageから最大4page先に限定したviewer先読み、読書位置、原本非破壊、error回復をWindows Rust canonicalとfrontend testで直接観測済み。 |
| REQ-MVP-008 | Implemented / BLOCKED | BMP/JPEG/GIF/TIFF/PNG/ICO/SVG/WebPの列挙、実decode、安全なviewer配信とWIC thumbnailはWindows testでPASS。release WebView2上のanimated GIF直接観測は未完了。 |
| REQ-MVP-018 | Partial / BLOCKED | code上はlocal-onlyだが、隔離VM外部からのDNS/TCP/UDP監視が未実施。 |
| REQ-MVP-020 | Implemented / BLOCKED | PDFの独立種別、Windows.Data.Pdfによるpage列挙・上限付きPNG render、thumbnail、favorite、巻末遷移、source/root/error境界はWindows Rust canonicalとfrontend testでPASS。release WebView2上のPDF viewer・thumbnail直接観測は未完了。 |
| REQ-MVP-021 | Implemented / BLOCKED | rename、create、copy、move、完全delete、実CF_HDROP、root containmentと衝突境界はWindows Rust canonicalでPASSし、context menu接続はfrontend testでPASS。ごみ箱、folder picker、Explorer、アプリ選択をrelease製品で直接観測するgateは未完了。 |
| NFR-MVP-001〜003 | Partial / BLOCKED | 規模・性能・UIA/screen reader/high contrast/DPIの製品実測待ち。 |
| NFR-MVP-004 | Implemented / PASS | lock inventory、SBOM、notice、license auditの受入証跡あり。 |
| NFR-MVP-005〜006 | Partial / BLOCKED | clean VM配布、Windows製品性能・環境matrixが未完了。 |

## Feature lane状態

| Lane | 対象 | 現在状態 | 未完了境界 |
|---|---|---|---|
| FR-B01 | 表示倍率 | Implemented / PASS | — |
| FR-B02 | 巻末policy | Implemented / PASS | — |
| FR-B03 | catalog表示形式 | Implemented / PASS | 詳細、小サムネイル、表紙グリッド、カードグリッドの順序・名称、形式別固定thumbnail幅、ファイル名非重複、profile v1移行とSQLite再起動復元をWindows frontend/Rust/Python testで検証。 |
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
| FR-B21 | standalone PDF | Implemented / BLOCKED | Windows.Data.Pdfの実renderと上限・分類・root containmentはPASS。release WebView2のviewer・thumbnailは未測定。 |
| FR-B22 | file manager | Implemented / BLOCKED | Windows filesystemとOS clipboardのbackend実動作、context menu・確認dialogのfrontend接続はPASS。native picker、ごみ箱、Explorer、アプリ選択の製品直接観測は未測定。 |

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
- animated GIFのrelease WebView2直接観測とcorrupt fallback、AVIFの製品decode、PDF viewer・thumbnailの製品直接観測。
- tray notification area、P5 visual/DPI、thumbnail file pickerと実disk I/Oの製品gate。
- file managerのnative folder picker、ごみ箱、Explorer、アプリ選択、release WebView2 context menuの製品直接観測。

これらが残るため、製品全体を「すべてのrelease gateがPASS」とは判定しない。
