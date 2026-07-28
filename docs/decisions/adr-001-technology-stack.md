---
codd:
  node_id: "decision:technology-stack"
  type: decision
  status: accepted
  confidence: 0.86
  depends_on:
    - id: "research:technology-evaluation"
      relation: "derives_from"
      semantic: "governance"
    - id: "design:architecture"
      relation: "governs"
      semantic: "governance"
---

# ADR-001: Comic Explorer技術スタック

- 状態: Accepted
- 日付: 2026-07-28
- 最終決定日: 2026-07-29
- 根拠: `req:mvp-requirements`、`research:technology-evaluation`、
  `design:screen-flow`、`design:architecture`
- 文書内容承認: ユーザー、2026-07-29
- 承認範囲: 採用技術構成と実装後の品質gate。製造開始は含まない

## 背景

Comic ExplorerはWindows 10/11の一般ユーザー向けオフラインアプリである。1TB、
10,000ファイル、1,000作品、1冊300ページを扱い、起動、一覧、ページ送り、入力
feedbackを開発容易性より優先する。原本を変更せず、重い処理は取消可能な
background taskにし、古い結果を新画面へ混入させない必要がある。

Windows実機の製品相当値は未測定である。このリスクを明示したうえで、候補比較、
アーキテクチャ整合性、配布条件、保守性を総合し、Tauri構成を最終採用する。
未測定値は採否の保留条件ではなく、実装後の品質gateとして扱う。

## 決定

次を採用する。

| 項目 | 決定 |
| --- | --- |
| 基盤 | Tauri 2 + WebView2 Evergreen |
| UI | React + TypeScript + TanStack Virtual |
| native | Rust stable/MSVC + Tokio |
| page描画 | opaque custom URIから圧縮JPEG/PNG、WebView2 decode |
| thumbnail | WIC、長辺384px、JPEG quality 82 |
| ZIP/CBZ | Rust `zip`、Stored/Deflate、on-demand entry |
| legacy filename | UTF-8/CP437を標準、CP932 fallbackはcorpus実測後 |
| DB | bundled SQLite + rusqlite、WAL |
| cache | DB index + `%LOCALAPPDATA%` file cache、LRU |
| IPC | 小さいtyped command/channel、binaryはResponse/custom URI |
| cancel | bounded priority queue + CancellationToken + generation ID |
| tests | cargo test、Vitest、WebdriverIO Tauri、Windows perf harness |
| installer | NSIS setup + WebView2 Evergreen offline installer |

依存のmajor/minorは製品実装開始時にlock fileで固定する。不要な`zip` format feature、
network plugin、telemetryは入れない。

## 判断基準と比較

100点重み付き評価は Tauri+React 86、Electron+React 75、WinUI 3+C# 90。
WinUIの点数優位は未測定のnative UX推定に集中する。一方、TauriはRust処理層、
仮想化UI、配布、メモリ、クロス境界のテスト容易性を一つの構成で満たし、
既存のTypeScript/Rust設計とテスト契約を直接実装できる。推定点だけで全面的な
C#/XAML構成を選ぶ不確実性より、既存設計との整合性とリスクの局所化を優先した。

ElectronはChromium/Nodeを同梱する予測メモリ、起動、配布サイズが優先順位に
合わない。SolidJSは細粒度更新の利点があるが、Reactとの差が製品相当の実測で
示されていない。minimal UIはfocus、accessibility、state coherenceを独自保守
するリスクが大きい。JSON/KV永続化はSQLiteのtransaction/migration/queryを再実装
するため不採用。全ZIP展開、DB thumbnail BLOB、Base64/巨大JSON画像転送も不採用。

## 性能検証

WSL2で7回測った基礎処理は次のとおり。

| 操作 | median | p95 |
| --- | ---: | ---: |
| 1,000項目列挙/stat/sort | 22.968ms | 31.578ms |
| 10,000項目列挙/stat/sort | 253.150ms | 284.960ms |
| Deflate ZIPランダム30entry | 23.311ms | 33.769ms |
| SQLite WAL 10,000 insert + read | 126.245ms | 150.789ms |

これはWindowsアプリ、画像decode、実漫画の性能値ではない。コールド/ウォーム
起動、TTI、memory、300 thumbnail、page、scroll、input、long task、CPU/GPU、
installer sizeは未測定である。

## UXへの効果

- shellと最初の項目chunkを先に表示し、thumbnail完成を待たず操作できる。
- visible/near-visible jobを優先し、遠方taskはqueueから退避する。
- pageの次表示単位を先読みし、圧縮bytesをBase64化しない。
- 入力直後はUIだけでpressed/loadingを示し、backend完了をfeedback開始条件にしない。
- cancellationに加えgeneration照合を行い、取消不能区間の古い完了も表示しない。
- item/page単位のerrorでshellを生かし、安全な回復操作を示す。

## 欠点とリスク

- WebView2 runtime更新による表示/性能回帰を継続テストする必要がある。
- native WinUIよりfocus、selection、Windows visualを多く実装する。
- WIC COM adapterとRust async workerのthread apartment管理が必要である。
- ZIPのflagなしCP932名は標準化されておらず、推測fallbackに誤判定があり得る。
- offline WebView2 runtime同梱によりinstallerが大きくなる。
- custom URIでも最低1回はRust-owned bytesからWebView2へのcopyが起き得るため、
  実装後にETW/heapで検証する。

## ライセンス

Tauri/Tokio/windows crateはMITまたはApache-2.0系、React/TanStack Virtual/
rusqlite/zip/Vitest/WebdriverIOはMIT系、SQLiteはpublic domain、WebView2/WICは
Windows runtimeとしてMicrosoftの再配布条件に従う。これは法的助言ではない。
release時にlocked dependency全体をSBOM/THIRD-PARTY-NOTICESへ出し、WebView2
installer、NSIS、WIC以外のcodecを含む最終配布物を再監査する。

## 実装後の品質gateと技術変更手続き

release build、基準Windows PC、7回で次のいずれかをprofiling/改善後も2回連続で
外した場合は原因を記録し、Tauri構成内でprofilingと改善を行う。

- cold TTI > 3,000ms
- cached list ready > 1,000ms
- prefetched page switch p95 > 100ms
- input delay p95 > 100ms
- scroll frame interval p95 > 33.3ms
- idle working set > 250MiB
- CP932代表corpusの正しいpage名認識 < 99%
- Windows 10/11でoffline install/起動が安定しない

改善後も主要gateを満たさない場合は、同一domain coreを使うWinUI shell spikeを
比較材料として実施できる。ただしTauri決定を自動的に置換せず、WinUIが主要未達
指標を20%以上改善し、移行コスト、アクセシビリティ、テスト、配布を含む新しいADRを
ユーザーが承認した場合だけ変更する。SolidJS、WIC代替も同様に新しいADRで扱う。
