# 未実装・非採用機能

最終更新: 2026-08-22

「コードがない」「別方式で目的を満たす」「安全上採用しない」「実装済みだが製品検証が残る」を
同じ未完了として扱わないための一覧である。状態の正本は
[status.md](current/status.md)、[requirements.md](current/requirements.md)、
[leeyes-feature-tracker.csv](current/leeyes-feature-tracker.csv)とする。

## 未実装・将来候補

| 対象 | 現在の境界 |
|---|---|
| AVIF完全デコード | 拡張子分類、metadata、MIME、unsupported/parser境界のみ実装済み。画像デコードと製品受入は未完了。 |
| touch操作 | 実機契約と直接観測がないため未採用（`FUT-R-006`）。 |
| gamepad操作 | 実機契約と直接観測がないため未採用（`FUT-R-007`）。 |
| OS shell全体の操作履歴を使うundo | 安全性と再現性を保証できないため未採用（`FUT-C-052`）。Comic Explorer内で検証可能な直近1操作のundoは実装済み。 |

これらは候補であり、実装予定や納期を意味しない。採用時は先に要件と受入条件を更新する。

## 参照ソフトと異なる代替仕様（21件）

次の機能は単純な「未実装」ではない。Comic Explorerでは、安全性、非破壊性、資源上限、
Windows現行APIとの整合を優先し、別の機能または方式で目的の一部を満たしている。

| ID | 参照機能 | Comic Explorerでの扱い |
|---|---|---|
| `LEY-FILER-013` | 書庫サブフォルダ平坦化 | 書庫内pathを保持し、path traversalを防止する。 |
| `LEY-FILER-020` | Explorerシェルメニュー | shell拡張をプロセス内実行せず、検証済みの組込み操作を提供する。 |
| `LEY-MEDIA-006` | メディア情報更新 | snapshotの暗黙更新をせず、再登録で一貫性を保つ。 |
| `LEY-MEDIA-007` | 差分確認 | snapshot比較は未提供。保存済みsnapshotのオフライン閲覧を提供する。 |
| `LEY-SEARCH-008` | 全ファイルキャッシュ | boundedな都度検索を採用する。 |
| `LEY-SEARCH-009` | キャッシュ保存・破棄 | 永続的な全ファイル検索cacheを持たない。 |
| `LEY-CATALOG-004` | ファイラ単位の表示保持 | profileと現行workspace単位の表示状態を使う。 |
| `LEY-CATALOG-012` | スクロール先行生成 | 表示近傍に限定したbounded thumbnail生成を使う。 |
| `LEY-CATALOG-013` | サムネイル保存方針 | app-local cacheと明示保存を使い、原本側へ自動保存しない。 |
| `LEY-CATALOG-014` | キャッシュ管理 | app-localの上限付きcacheと保守機能を使う。 |
| `LEY-FILE-015` | 親単位削除 | 誤削除を避け、明示選択と確認を必要とする。 |
| `LEY-FILE-021` | 削除設定 | 安全境界を固定し、危険な削除方式の任意切替を提供しない。 |
| `LEY-VIEWER-002` | 先頭・末尾移動 | シークと既存page移動で到達する。専用互換commandはない。 |
| `LEY-VIEWER-005` | ページ番号ジャンプ | シーク直接移動を使う。専用番号dialogはない。 |
| `LEY-VIEWER-017` | シーク左原点切替 | 読書方向と統一したシーク規則を使う。 |
| `LEY-VIEWER-024` | 補間方式 | WebViewの現行描画を使い、旧algorithmの選択互換は提供しない。 |
| `LEY-SETTING-007` | ポータブル・レジストリ非依存 | 実行folderへ書かず、app-local領域へ設定を保存する。 |
| `LEY-PLUGIN-001` | 組込みBMP対応 | BMPは組込みdecoderで対応済み。plugin方式は使わない。 |
| `LEY-PLUGIN-002` | Susie画像SPI | 任意DLLをloadせず、組込みdecoderを使う。 |
| `LEY-PLUGIN-003` | Susie書庫SPI | 任意DLLをloadせず、対応書庫readerを組み込む。 |
| `LEY-PLUGIN-006` | BMPをプラグイン優先 | 決定的な組込みdecode順を使う。 |

## 安全方針により非採用（4件）

| ID | 非採用機能 | 理由 |
|---|---|---|
| `LEY-FILE-008` | 実行ファイル起動 | 任意コード実行をアプリ内機能にしない。 |
| `LEY-PLUGIN-004` | プラグイン検索パス | DLL sideloadingを避ける。 |
| `LEY-PLUGIN-005` | プラグイン順序・有効化・個別設定 | native ABI、crash、security riskを導入しない。 |
| `LEY-PLUGIN-007` | MacBinary処理 | 利用範囲に対してlegacy attack surfaceが大きい。 |

次の製品方針も恒久的な対象外である。

- cloud同期
- 外部書誌の自動取得
- telemetryや漫画データ、path、読書情報の外部送信
- 閲覧時のlibrary原本への自動変更

## 実装済みだがrelease検証が残るもの

ここは未実装一覧ではない。コードと自動テストが存在する一方、実機・環境依存の受入が残る。

- Windows 10 22H2 / Windows 11 clean VMでのinstall、offline WebView2、launch、uninstall
- VM外部からのDNS/TCP/UDP監視による外部通信0の確認
- 基準PCでの起動時間、10,000項目、scroll/FPS、入力・page latency、working set、cache測定
- UIA、screen reader、high contrast、100/150/200% DPI
- WebView2 custom protocolの実Origin/Referer header
- animated GIFのrelease WebView2直接観測とcorrupt fallback
- tray、native file picker、ごみ箱、Explorerとのpaste、外部アプリ選択などWindows shell統合の実操作
- フィルター画質、色管理、大規模画像、長時間利用時のCPU・memory

最新の件数と個別証跡は[verification.md](current/verification.md)を参照する。未測定をPASSへ推定しない。
