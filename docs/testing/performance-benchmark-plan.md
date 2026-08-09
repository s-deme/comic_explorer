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

Windowsのdataset生成は `benchmarks/architecture-spike/windows/Generate-Dataset.ps1`
（既存出力を明示置換する場合だけ `-Force`）を用い、manifestとdataset SHA-256一覧を
保存する。Pythonのfixture生成は `tests/fixtures/generate_fixtures.py` を用い、seed
`20260728` はgenerator内部の固定値として使用し、生成したmanifestにも記録する（`--seed`
入力は存在しない）。Pythonで既存の許可対象出力を明示置換する場合だけ `--force` を使う。

malformed ZIP/image/security corpusを含む同一fixtureをWindowsと通常のLinux CIで
再現できることを確認する。ただし現行Python generatorのPNG→JPEG変換はPowerShell/
System.Drawingに依存するため、通常Linuxでそのinterfaceが利用できず成功実測できない間は
fixture再現を `not_measured`/`BLOCKED` とし、性能測定へ進まない。
生成前に出力先は実行環境の通常の絶対pathをそのまま使用し、別環境向けのpath変換を
推測・代替実行しない。
既存出力はmanifest、dataset、logを含めて明示的な置換指定がない限り上書きせず、既存出力が
ある場合は停止して再生成しない。明示的な置換指定を受けた場合だけ、対象を記録してから
置換する。

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

1. Pythonは `tests/fixtures/generate_fixtures.py` を実行し、generator内部の固定seed
   `20260728` とmanifest記録を確認する。Windows用datasetは
   `Generate-Dataset.ps1` を実行する。各generatorの既存出力を明示置換する場合だけ、
   Pythonは `--force`、PowerShellは `-Force` を使う（対象directory制限を守る）。
   Windowsと通常のLinux CIで同じmanifest/hashを用い、各環境で再現できることを記録する。
   出力先は各環境の通常の絶対pathを使用する。
   既存出力を検出したら、明示的な置換指定がない限り生成を停止する。
2. dataset生成、hash保存、PC再起動、環境情報採取。
3. candidateをrelease buildしSHA-256、依存lock、WebView2 versionを記録。
4. WPR traceを開始し、warm-upを1回実行して破棄。
5. `Run-DesktopBenchmark.ps1` で7回。各run間にapp終了とhandle解放を確認。
6. cold条件を作り直してcold 7回、warm条件でwarm 7回。
7. ETL、JSONL、summary JSON、screenshot/errorをrun IDで関連付ける。
8. scriptでmedian/p95を再計算し、raw sampleと一致させる。
9. gate、外れ値をreviewして品質判定を記録する。代替比較を行った場合も、
   ADR変更は別の承認手続きとする。

## 8. 妥当性と停止条件

- generator内部の固定seed `20260728` とmanifest記録、Windowsと通常のLinux CIでの再現
  interfaceの有無を確認できない場合はfixtureの妥当性を判定せず停止する。通常Linuxで
  PowerShell/System.Drawingが利用できずPNG→JPEG成功実測がない場合は
  `not_measured`/`BLOCKED` とし、PowerShell/System.Drawing依存が解消されない場合も停止する。
- 明示的な置換指定なしに既存出力のhashまたはmtimeが変化した場合、fixture生成を失敗とし、
  既存出力を復元して原因を記録する。明示的な置換指定がある場合も対象と指定を記録する。
- background update、thermal throttling、antivirus scanが発生したrunは理由を残し、
  勝手に除外せず再測定する。
- dataset/outputが同じvolumeか、Defender除外、admin権限を候補間で変えない。
- screenshot/画面録画で正しく画像が出ていない高速なrunを無効とする。
- synthetic単色画像のdecode値だけで製品gateを確定しない。自由利用可能な写真的
  合成noise/gradient datasetもWindows generatorへ追加して再測定する。
- 実装がない指標は`0`ではなく`not_measured`にする。
- Windows製品UIの実測がない指標は`not_measured`のままとし、foundationまたは他環境の値を
  Windows gateのPASSへ置き換えない。fixtureの再現確認だけでは性能gateの合格根拠としない。

## 9. 成果物

期待結果は、Windowsと通常のLinux CIでgenerator内部の固定seed `20260728` から同一manifest/hashのfixtureを
生成でき、seedがmanifestへ記録されることである。通常LinuxのPowerShell/System.Drawing依存が未実測
なら成功扱いにせず `not_measured`/`BLOCKED` とする。置換指定なし
では既存出力のhash/mtimeが不変で、置換指定時だけ対象出力が更新されることをfixture生成の
failure oracleとする。いずれかを満たさない場合は性能測定へ進まず停止する。

raw JSON/ETLは大容量ならrelease artifact、要約とmanifest/hashはWindows native測定結果へ
記録する。個人pathや漫画原本名を含めない。
