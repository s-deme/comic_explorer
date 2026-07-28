---
codd:
  node_id: "test:performance-benchmark-plan"
  type: test_plan
  status: approved
  confidence: 0.82
  depends_on:
    - id: "req:mvp-requirements"
      relation: "verifies"
      semantic: "verification"
    - id: "design:architecture"
      relation: "verifies"
      semantic: "verification"
---

# Comic Explorer 性能ベンチマーク計画

## 承認記録

- 内容承認者：ユーザー
- 内容承認日：2026-07-29
- 承認範囲：計測条件、性能gate、必要時の代替比較、結果記録方法
- 制約：製造開始は別途指示があるまで行わない
- 留保：実測値と採否判定は、計画承認によって確定したとは扱わない

## 1. 目的と判定

総処理時間だけでなく、最初に操作可能になるまでの時間（TTI）、入力遅延、p95、
UI thread停止を測り、確定済みADR-001の実装品質を検証する。未測定値は合格と
扱わないが、測定前であることを理由にADRとarchitectureを暫定へ戻さない。

品質gate:

| 指標 | gate |
| --- | ---: |
| cold start TTI | median ≤ 3,000ms |
| cached list ready | median ≤ 1,000ms |
| prefetched page input→presented | p95 ≤ 100ms |
| input delay | p95 ≤ 100ms |
| scroll frame interval | p95 ≤ 33.3ms、60 FPS目標 |
| UI long task | >50msを記録、navigation中p95 ≤ 100ms |
| idle working set | ≤250MiB（暫定） |
| crash/error後 | 別項目を開け、process crashなし |

## 2. 基準環境

最終結果には必ず次を固定・記録する。

- Windows 10 22H2 x64とWindows 11のclean VM/実機。
- 代表PC: 4 physical cores以上、16GiB RAM、1920x1080、100% scaling、
  NVMe SSD、AC接続、Balanced power plan。正確な型番/firmware/free spaceを記録。
- release build、debug/devtoolsなし、同一binary SHA-256。
- network無効。antivirus/indexerの停止有無を記録し、候補間で揃える。
- window 1600x900、light theme、thumbnail cell 176x248、同一scroll route。
- 各scenarioはwarm-up 1回（集計外）+ 7回。個々のsample、median、p95を保存する。
- coldはrebootまたはstandby list purgeを明記し、両者を混ぜない。warmは同一手順で
  1回表示後にapp restartする。

VM値は互いの回帰検出、実機値はUX判定に用い、混在集計しない。

## 3. dataset

`benchmarks/architecture-spike/windows/Generate-Dataset.ps1` を用い、manifestと
dataset SHA-256一覧を保存する。

| dataset | 内容 |
| --- | --- |
| items-1000/10000 | 日本語名、folder/CBZ混在 |
| images-300 | JPEG/PNG各150、1200x1800 |
| pages.zip/pages.cbz | 同じ300page、Deflate、日本語directory |
| special | 3600x1800横長、8000x12000、高解像度、破損JPEG、破損ZIP |
| cache-empty/warm | thumbnail未生成/300件生成済み |
| 追加ZIP corpus | ZIP64、Stored、UTF-8、CP437、CP932、directory、暗号化 |

追加corpusはテスト内で生成し、ライセンス不明の書庫をrepositoryへ入れない。

## 4. instrumentation

アプリの`--benchmark`は通常buildで無効な計測modeとし、JSONLへ単調clock timestamp、
generation、item/page ID（fixture内IDのみ）を出す。

必須event:

1. `process_started`
2. `window_created`
3. `ui_shell_painted`
4. `ui_ready`（input listenerとnavigationが有効）
5. `enumeration_first_chunk`
6. `list_ready`
7. `first_thumbnail`
8. `thumbnail_batch_complete`
9. `input_received`
10. `page_requested`
11. `page_bytes_ready`
12. `page_decode_complete`
13. `page_presented`
14. `run_complete`

`performance.now()`/Event Timing/Long Tasks/rAFでrenderer、Rust monotonic clockで
backendを測り、handshake eventで時計を対応付ける。Working Set/Private Bytes/CPU/
I/OはWindows Performance RecorderまたはProcess API、GPUはGPU Engine counter、
installerは署名後file sizeを使う。Tauri/Reactと代替candidateでevent定義を揃える。

## 5. scenario

| ID | 操作 | 主指標 |
| --- | --- | --- |
| P01 | cold/warm app launch | process→shell、TTI、initial/peak memory |
| P02 | 1,000/10,000項目へ移動 | first chunk、list ready、input delay、memory |
| P03 | empty cacheで一覧表示 | first thumbnail、300 complete、CPU、peak memory |
| P04 | warm cacheで一覧表示 | cached list、cache hit、disk read |
| P05 | JPEG/PNG各30 decode | decode median/p95、CPU、allocation |
| P06 | folder pageを30回送る | normal/prefetched input→presented |
| P07 | Deflate/Stored CBZを30回送る | entry bytes、decode、presented |
| P08 | 10k gridを一定速度で先頭→末尾→先頭 | FPS/frame p95、blank frame、long task |
| P09 | scroll中にkeyboard/mouse入力100回 | Event Timing p95、lost input |
| P10 | folderを10回高速切替 | cancel latency、stale commit=0 |
| P11 | wide/high-res/corrupt image/ZIP | peak memory、回復成功、process継続 |
| P12 | clean VM install/start/uninstall | installer size/time、runtime、原本hash |

P06/P07はprefetch無効、cold miss、prefetch hitを分ける。P03は表示領域近傍の最初の
thumbnailが遠方より先に完了することもassertする。P10は最後のgeneration以外が
DOM/DBへcommitされないことをlogと画面の両方で検証する。

## 6. gate未達時の代替比較spike

Tauri構成内のprofilingと改善後も主要gateを満たさない場合に限り、同じ10,000
item metadata（画像はvisible 100件だけ）、同じCSS相当寸法、同じ操作で代替shellを
比較する。候補固有の製品機能は入れない。

- Tauri 2 + React + TanStack Virtual
- WinUI 3 + ItemsRepeater
- 原因がReact更新に局在すると証明できる場合のみTauri + Solid/Svelte

比較するbinaryはrelease、single window、同じbackground workload、同じイベント
contractとする。最低でもP01、P02、P06、P08、P09、distribution sizeを比較する。
中央値だけで判断せず、p95、memory、回帰幅、実装の正しさ、移行コストを併記する。
基盤変更には新しいADRとユーザー承認を必要とする。

## 7. 実行手順

1. dataset生成、hash保存、PC再起動、環境情報採取。
2. candidateをrelease buildしSHA-256、依存lock、WebView2 versionを記録。
3. WPR traceを開始し、warm-upを1回実行して破棄。
4. `Run-DesktopBenchmark.ps1` で7回。各run間にapp終了とhandle解放を確認。
5. cold条件を作り直してcold 7回、warm条件でwarm 7回。
6. ETL、JSONL、summary JSON、screenshot/errorをrun IDで関連付ける。
7. scriptでmedian/p95を再計算し、raw sampleと一致させる。
8. gate、外れ値をreviewして品質判定を記録する。代替比較を行った場合も、
   ADR変更は別の承認手続きとする。

## 8. 妥当性と停止条件

- background update、thermal throttling、antivirus scanが発生したrunは理由を残し、
  勝手に除外せず再測定する。
- dataset/outputが同じvolumeか、Defender除外、admin権限を候補間で変えない。
- screenshot/画面録画で正しく画像が出ていない高速なrunを無効とする。
- synthetic単色画像のdecode値だけで製品gateを確定しない。自由利用可能な写真的
  合成noise/gradient datasetもWindows generatorへ追加して再測定する。
- 実装がない指標は`0`ではなく`not_measured`にする。

## 9. 成果物

raw JSON/ETLは大容量ならrelease artifact、要約とmanifest/hashは
`docs/testing/performance-benchmark-results.md` と
`benchmarks/architecture-spike/results/`へ置く。個人pathや漫画原本名を含めない。
