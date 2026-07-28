---
codd:
  node_id: "research:technology-evaluation"
  type: research
  status: approved
  confidence: 0.78
  depends_on:
    - id: "req:mvp-requirements"
      relation: "derives_from"
      semantic: "governance"
---

# Comic Explorer 技術構成評価

## 承認記録

- 内容承認者：ユーザー
- 内容承認日：2026-07-29
- 承認範囲：比較方法、調査結果、採用案、品質gate
- 制約：製造開始は別途指示があるまで行わない
- 留保：Windows実機の未測定項目は実装後の品質gateとして残す

## 1. 結論と証拠の扱い

ADR-001で **Tauri 2 + WebView2 + React/TypeScript + Rust** を最終採用した。メタデータは
SQLite、サムネイル本体はアプリ専用領域のJPEGファイル、ZIP/CBZは Rust の
`zip`、サムネイル生成は Windows Imaging Component (WIC)、漫画ページは
カスタムURI経由で圧縮済みJPEG/PNGをWebView2へ渡して描画する。

この結論は一次情報と WSL 上の基礎I/O実測には基づくが、候補アプリを同一
Windows実機で比較した値はまだない。したがって、点数のうちUX、起動、メモリ、
描画、配布サイズは推定である。これらは採用決定後も未測定として保持し、
Windows release buildの品質gateで検証する。gate未達だけで基盤を自動変更せず、
代替比較と新しいADRの承認を必要とする。

表記は次の通り。

- **実測**: 本リポジトリのハーネスで得た値。
- **一次情報**: 公式文書・公式リポジトリが明記する能力。
- **推定**: アーキテクチャからの予測。採用判定には使うが保証値ではない。
- **未測定**: Windows実機の製品相当ハーネスが必要。

## 2. 一次情報

2026-07-28に確認した。安定版の細かな番号は実装開始時にロックファイルで固定し、
直接・推移依存のライセンスを再監査する。

| 対象 | 確認事項 | 一次情報 |
| --- | --- | --- |
| Tauri 2 | Webフロント＋Rust、WindowsはWebView2、MIT/Apache-2.0 | [Tauri crate](https://docs.rs/tauri/latest/tauri/)、[公式リポジトリ](https://github.com/tauri-apps/tauri) |
| Tauri IPC | async command、大きいバイナリ向け`ipc::Response`、Channel | [Calling Rust from the Frontend](https://v2.tauri.app/develop/calling-rust/) |
| Tauri URI | 非同期カスタムURIプロトコルを登録可能 | [tauri::Builder](https://docs.rs/tauri/latest/tauri/struct.Builder.html) |
| Tauri配布 | MSI(WiX)/NSIS、WebView2の複数配布モード、固定版は約180MB増 | [Windows Installer](https://v2.tauri.app/distribute/windows-installer/) |
| WebView2 | Windows 10/11対応、Evergreen推奨、固定版も選択可 | [WebView2概要](https://learn.microsoft.com/en-us/microsoft-edge/webview2/)、[開発ベストプラクティス](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/developer-guide) |
| Electron | ChromiumとNode.jsを同梱、main/rendererの複数プロセス、MIT | [Electron概要](https://www.electronjs.org/docs/latest/)、[Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)、[LICENSE](https://github.com/electron/electron/blob/main/LICENSE) |
| WinUI 3 | 新規Windowsアプリに推奨、Windows 10 1809+、C#/C++/XAML | [Windows app development](https://learn.microsoft.com/en-us/windows/apps/)、[WinUI 3](https://learn.microsoft.com/en-us/windows/apps/winui/winui3/) |
| React | Transitionを非ブロッキング更新として扱える | [startTransition](https://react.dev/reference/react/startTransition) |
| 仮想化 | React/Solid/Svelte/vanillaに対応し、grid-like仮想化とoverscanを提供 | [TanStack Virtual](https://tanstack.com/virtual/v3/docs/introduction)、[Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer) |
| SQLite | ACIDとクラッシュ耐性、WALはread/write並行性を向上 | [Transactional](https://www.sqlite.org/transactional.html)、[WAL](https://www.sqlite.org/wal.html) |
| rusqlite | bundled SQLite対応、rusqliteはMIT、SQLiteはpublic domain | [rusqlite公式リポジトリ](https://github.com/rusqlite/rusqlite) |
| zip | ZIP64、Stored/Deflate、暗号化検出、MIT | [zip crate](https://docs.rs/zip/latest/zip/) |
| ZIP安全性 | `enclosed_name`は絶対パス、NUL、領域外への解決を拒否 | [ZipFile](https://docs.rs/zip/latest/zip/read/struct.ZipFile.html) |
| WIC | JPEG/PNGのOS内蔵codec、画像・メタデータAPI | [WIC overview](https://learn.microsoft.com/en-us/windows/win32/wic/-wic-about-windows-imaging-codec)、[WIC metadata](https://learn.microsoft.com/en-us/windows/win32/wic/-wic-about-metadata) |
| image-rs | JPEG/PNG、リサイズ、EXIF orientation、decode limits | [image crate](https://docs.rs/crate/image/latest)、[Orientation](https://docs.rs/image/latest/image/metadata/enum.Orientation.html)、[Limits](https://docs.rs/image/latest/image/struct.Limits.html) |
| E2E | TauriはWindowsでWebDriverIO/tauri-driverを利用可能 | [Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/) |

### 2.1 評価時の安定系列とライセンス

日付時点の比較対象を再現するための系列であり、製品の採用versionは実装開始時に
lockする。preview/betaは候補点へ含めない。

| 候補/依存 | 評価系列 | ライセンス/配布上の扱い |
| --- | --- | --- |
| Tauri | 2系（API docs 2.11.x） | MIT/Apache-2.0、noticeを同梱 |
| Electron | 43.2.x stable（Chromium 150/Node 24） | MIT、Chromium等のthird-party noticesも必要。[公式stable一覧](https://releases.electronjs.org/?channel=stable) |
| Windows App SDK/WinUI 3 | 2.2 stable | Windows 10 1809+、Microsoftのruntime配布条件。[version一覧](https://learn.microsoft.com/en-us/windows/apps/get-started/versioning-overview) |
| React | 19.2 stable系列 | MIT。[公式リポジトリ](https://github.com/facebook/react) |
| SolidJS | 1.9 stable系列（2.0 betaは除外） | MIT。[公式release](https://github.com/solidjs/solid/releases) |
| Svelte | 5 stable系列 | MIT。[公式リポジトリ](https://github.com/sveltejs/svelte) |
| TanStack Virtual | 3系 | MIT。[公式リポジトリ](https://github.com/TanStack/virtual) |
| Tokio/tokio-util | 1系/0.7系 | MIT。[公式リポジトリ](https://github.com/tokio-rs/tokio) |
| zip | 8系 | MIT。repository同梱test corpusの別licenseは製品へ含めない |
| encoding_rs | 0.8系 | Apache-2.0/MIT。[公式リポジトリ](https://github.com/hsivonen/encoding_rs) |
| rusqlite/SQLite | 0.39系/3系 | rusqlite MIT、SQLite public domain |
| windows crate/WIC | windows 0.6x系/OS component | crate MIT/Apache-2.0、WICはWindows component |
| Vitest/WebdriverIO | 採用時stable | MIT。Tauri E2E pluginもlocked dependency監査対象 |
| NSIS/WebView2 runtime | Tauri同梱tool/runtime | NSIS zlib系license、WebView2再配布条件とEULAをinstaller reviewで確認 |

「MIT系」と記して終わらせず、release buildからSBOMを生成し、推移依存、codec、
installer toolのnotice/source-offer義務を法務確認する。ここでの記載は法的助言では
ない。

### 2.2 開発ツールチェーン確認

2026-07-29にWindows側で次を実体確認した。Tauriの公式Windows前提である
Microsoft C++ Build Tools、WebView2、Rust stable-msvc、Node.js LTSを満たす。

| 項目 | 確認結果 |
| --- | --- |
| OS | Windows 11 Home x64、build 26200 |
| Node.js / npm | Node.js 24.18.0 LTS、npm 11.16.0。ユーザーPATH登録済み |
| Rust / Cargo | 1.97.1、`stable-x86_64-pc-windows-msvc`をdefaultに設定 |
| MSVC | Visual Studio Build Tools 2022、MSVC 14.44 x64 `cl.exe`／`link.exe` |
| Windows SDK | 10.0.26100.0、x64 library確認済み |
| WebView2 | Evergreen Runtime 150.0.4078.99 |

製品の`package.json`、`Cargo.toml`、lockfileは製造物なので、製造開始指示までは
生成しない。開始時はこのtoolchain上でmanifestを作成し、直接・推移依存の正確な
versionとlicenseをlockする。

## 3. アプリケーション基盤

点数は 5=最良、1=不適。括弧内は証拠区分。

| 観点 | Tauri 2/WebView2/Rust | Electron/Chromium/Node | WinUI 3/C# |
| --- | ---: | ---: | ---: |
| 起動 | 4（推定、OS runtime再利用） | 2（推定、Chromium同梱） | 5（推定） |
| 初期/ピークメモリ | 4（推定） | 2（推定） | 5（推定） |
| 10,000項目 | 4（仮想化前提、未測定） | 4（同左） | 5（ItemsRepeater想定、未測定） |
| ページ描画 | 4（WebView decode/GPU、未測定） | 4（Chromium、未測定） | 5（WIC/XAML、未測定） |
| 非同期/キャンセル | 5（Rust task/token） | 4（utility process/worker） | 4（Task/CTS） |
| Windowsらしさ/DPI/フォーカス | 4（作り込み必要） | 3（作り込み必要） | 5（ネイティブ） |
| ZIP/画像/SQLite統合 | 5（Rust、WIC FFI） | 4（Node native addonリスク） | 4（.NET/WIC） |
| 障害分離 | 4（WebView複数process） | 5（Chromium multi-process） | 3（単一process中心） |
| テスト/保守 | 4 | 4 | 4 |
| 配布サイズ/更新 | 4（runtime条件あり） | 2（同梱で大） | 4（Windows App SDK条件あり） |

Tauriは軽量性とRustの安全なバックグラウンド処理、Web UIの仮想化資産の均衡を
評価した。ElectronはWebView2のバージョン差を排除でき、E2Eも成熟しているが、
Chromium/Node同梱のメモリ・起動・配布コストが本製品の優先順位に合わない。
WinUI 3は純粋なWindows UXの上限が最も高いが、仮想グリッド、ツリー、非同期の
世代管理、ZIPストリームからの画像表示を統合した実測がなく、Tauriとの差を
断定できない。Windows実測でTauriが目標未達ならWinUI 3を再スパイクする。

## 4. UI候補

すべて固定寸法セル、行/列仮想化、表示領域±2行のoverscan、安定キー、画像遅延
読込みを前提とする。仮想化なしの10,000 DOM要素は候補外である。

| 候補 | 長所 | 弱点 | 暫定評価 |
| --- | --- | --- | ---: |
| React + TanStack Virtual | エコシステム、Transition、テスト資産、採用例 | 再render境界とmemo設計が必要 | 88 |
| SolidJS + TanStack Virtual | 細粒度更新、DOM更新量を抑えやすい | チーム/検証資産がReactより小さい | 86 |
| Svelte + TanStack Virtual | compile中心、記述量が少ない | major移行と高度な仮想UIの知見を要確認 | 83 |
| vanilla TS + virtual-core | 最小bundle、挙動を完全制御 | フォーカス/状態/再利用を独自保守 | 76 |
| WinUI 3/XAML | native focus/DPI/Automation、ItemsRepeater | 基盤ごと変更、Windows実機のみ | 87 |

Reactを採用する。ただし「Reactだから速い」のではなく、DOM数を可視範囲に限定し、
selection/focus/thumbnailの状態を項目単位に分離し、フォルダ変更をTransitionに
する設計が条件である。Solidの同一ハーネスがp95入力遅延を20%以上改善し、保守
コストが許容範囲なら再評価する。

## 5. ローカル永続化

| 候補 | 異常終了 | 移行/照会 | 並行性 | バックアップ | 判定 |
| --- | --- | --- | --- | --- | --- |
| SQLite + rusqlite | ACID、WAL | versioned migration、索引/制約 | 1 writer + readers | online backup/ファイル | 採用 |
| 組込みKV | 製品依存 | 複合照会/移行を自作 | 製品依存 | 製品依存 | 却下 |
| JSON | rename/fsync規約を自作 | 全読込、schema検証を自作 | 競合しやすい | 容易 | 設定exportだけ |

SQLiteにはライブラリルート、読書位置、方向、表示モード、並べ替え、原本fingerprint、
サムネイル索引を保存する。`user_version`とトランザクションで前方向migrationを
行い、`busy_timeout`を設定する。WALは同一ローカル端末のアプリ専用領域だけで
使う。読書位置はバックアップ対象、再構築可能な索引は対象外に分ける。

サムネイルBLOBはDB肥大、WAL増加、eviction/ファイル配信の不便があるため不採用。
DBにはhash、相対キャッシュパス、寸法、byte数、last_access、fingerprintだけを
置く。本体はファイルなので原子的renameとLRU削除が容易である。

## 6. ZIP/CBZ

| 方式 | ZIP64/Stored/Deflate | 日本語名 | random access | 安全性/ライセンス | 判定 |
| --- | --- | --- | --- | --- | --- |
| Rust `zip` | 対応（一次情報） | UTF-8は可。legacyは要実機corpus | central directoryからentry読込 | `enclosed_name`、MIT | 採用 |
| Node `yauzl`等 | 候補ごとに差 | 候補ごとに差 | JS/stream設計 | Electron限定 | 基盤不採用 |
| .NET `ZipArchive` | 対応 | `entryNameEncoding`選択可 | entry stream | MIT/.NET | WinUI代替 |

`zip`はdefault featuresを切り、`deflate`だけを有効にする。暗号化、未知compression、
破損は対象名と理由を返し、パスは抽出しない場合も絶対/NUL/領域外を拒否する。
UTF-8 flagを優先し、flagなしはCP437を標準解釈、CP932はユーザー設定ではなく
「UTF-8→CP437→CP932の妥当性スコア」という限定fallbackをスパイクする。文字化け
を推測で確定しない。raw nameと表示名を分ける。

全ページ一括展開は起動遅延、ディスク増加、原本近傍への漏出、cleanup失敗がある
ため不採用。central directoryを一度読んでページ一覧を作り、現在ページと次の
1表示単位だけentryをオンデマンド展開する。展開先はメモリまたはアプリcacheで、
原本の隣には書かない。300ページでarchive handleを保持する場合の同時handle上限を
Windowsで測る。

## 7. 画像処理とキャッシュ

| 方式 | 利点 | 欠点 | 用途 |
| --- | --- | --- | --- |
| WebView2 decode | 圧縮bytesを`img`へ渡しGPU合成、page用コピーを抑制 | runtime差、decode制御/計測が必要 | 採用: 読書ページ |
| WIC | OS内蔵JPEG/PNG、metadata、resize/encode、Windows最適化 | COM/FFIとthread apartment管理 | 採用: サムネイル |
| image-rs | Rust完結、limits/orientation、テスト容易 | WICとの実性能未測定、全pixel buffer | fallback/spike |
| Skia | 描画統合と高品質 | 大きい依存/配布/独自surface統合 | 却下 |
| libvips | 大画像/streamingに強い | native DLLと再配布、MVPには重い | 将来 |

漫画ページは、folderならread-only file、ZIPなら対象entryを、認可済みopaque IDを
持つ非同期custom URIから `image/jpeg`/`image/png` として返す。パスをURLへ直接
露出しない。Base64、巨大JSON、data URIは禁止。WebView側でblob URLを使った場合は
表示入替直後に旧URLをrevokeする。

サムネイルはWICでEXIF Orientation適用後、長辺384px（DPI非依存のsource）、
sRGB、背景を不透明化しJPEG quality 82で保存する。PNG透明が一覧上重要と判明
した場合だけPNG/WebP併用を再評価する。keyは
`sha256(schema|canonical-path|size|mtime|archive-entry-crc|thumb-spec)`。
二段階ディレクトリ、tempへの書込み＋atomic rename、既定2GiB/20,000件LRUを採る。
上限は性能スパイクで調整する。

decode済みページcacheは最大3表示単位（現在、前、次）かつ512MiBの小さい方、
圧縮entry cacheは128MiBを初期値とする。現在ページをpinし、次、前、遠方の順に
破棄する。高解像度画像はpixel数/寸法上限を検査し、必要なら縮小decodeを使う。

## 8. 実測結果

実行環境は WSL2/Linux、Python 3.12.3、`/tmp`、7回。合成PNGは単色に近く、
Windows/実漫画の絶対性能を代表しない。値は基礎I/Oパイプラインが再現可能で
あることと桁の確認にだけ使う。

| 操作 | median | p95 | Python peak allocation | 区分 |
| --- | ---: | ---: | ---: | --- |
| 1,000項目列挙＋stat＋sort | 22.968ms | 31.578ms | 129,321 B | 実測/WSL |
| 10,000項目列挙＋stat＋sort | 253.150ms | 284.960ms | 1,733,666 B | 実測/WSL |
| Deflate ZIPからランダム30件 | 23.311ms | 33.769ms | 249,108 B | 実測/WSL |
| Stored ZIPからランダム30件 | 21.151ms | 29.965ms | 181,366 B | 実測/WSL |
| SQLite WAL 10,000 insert＋100 read | 126.245ms | 150.789ms | 13,264 B | 実測/WSL |

10,000件を一括列挙しても基礎処理は1秒未満だったが、これをUI応答目標達成の証拠
にはしない。段階的に最初のchunkを返す設計は維持する。生データは
`benchmarks/architecture-spike/results/foundation-wsl.json` にある。

### 未測定

コールド/ウォーム起動、TTI、process memory、JPEG/PNG decode、300 thumbnails、
cache済み一覧、通常/先読みpage、WebView2/WinUI scroll FPS、input delay、long task、
CPU/GPU、installer size、CP932/ZIP64/encrypted corpusは未測定である。Windows
ハーネスと条件は `docs/testing/performance-benchmark-plan.md` に定義する。

## 9. 重み付き評価

5段階を重みへ線形換算した暫定値。`M`=一部実測、`E`=推定、`P`=一次情報のみ。

| 評価項目（重み） | Tauri+React | Electron+React | WinUI 3+C# |
| --- | ---: | ---: | ---: |
| 操作応答性と体感速度 (20) | 17 E | 15 E | 18 E |
| ページ切り替え性能 (15) | 13 E | 13 E | 14 E |
| 一覧・スクロール性能 (15) | 13 E | 13 E | 14 E |
| メモリ効率 (10) | 8 E | 5 E | 9 E |
| 起動時間 (10) | 8 E | 5 E | 9 E |
| 読込み中・エラー時UX (10) | 9 P | 9 P | 8 P |
| ZIP・画像処理との統合 (5) | 5 M/P | 4 P | 4 P |
| Windowsらしい操作性 (5) | 4 E | 3 E | 5 P |
| 安定性とテスト容易性 (5) | 4 P | 4 P | 4 P |
| ライセンスと配布 (5) | 5 P | 4 P | 5 P |
| **合計 / 100** | **86** | **75** | **90** |

WinUIの推定点が高い一方、点差は未測定領域に集中する。TauriはRust処理層、
Web仮想化、配布、テスト契約を既存設計のまま一体化できるため最終採用した。
Windows gate未達時はTauri内で原因分析と改善を行い、基盤変更が必要なら
代替実測、新しいADR、ユーザー承認を必須とする。

## 10. リスクと再評価条件

| リスク | 対策 | 再評価条件 |
| --- | --- | --- |
| WebView2 Evergreen更新で回帰 | Stable/Beta E2E、feature detection | 同一操作p95が2 release連続20%以上悪化 |
| Tauri/WebView2のTTI・memory | startupをDB migrationから分離 | TTI>3s、idle>250MiB、WinUI比>30% |
| 10k gridのblank/jank | 固定セル、virtual lanes、overscan適応 | p95 frame>33.3msまたはinput p95>100ms |
| page streamのcopy/decode | custom URI、compressed bytes、prefetch | prefetched p95>100ms |
| CP932名の誤判定 | raw名保持、corpus test、明示error | 代表corpus成功率<99% |
| WIC FFIの複雑性 | 狭いadapter、COM thread test | image-rsが同等品質でp95差<10% |
| thumbnail cache肥大 | byte/entry LRU、再構築可能 | 通常libraryで2GiB超またはhit率<80% |
| Windows 10/WebView2欠落 | offline runtime同梱installer | install失敗またはinstaller許容サイズ超 |
