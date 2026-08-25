# 実装済み機能

最終更新: 2026-08-26

Comic Explorerで現在利用できる機能の一覧である。Leeyes互換機能台帳の
`delivery_status=Existing` 61件と`Published` 106件、合計167件を分野別に掲載する。
`Existing`は比較調査前から存在した機能、`Published`は要件・実装・自動検証・公開まで完了した
機能を表す。個別の実装箇所と検証証跡は
[leeyes-feature-tracker.csv](current/leeyes-feature-tracker.csv)を正とする。

実装済みでも、実機UI、DPI、性能などのrelease gateが残る場合がある。検証状態は
[status.md](current/status.md)と[verification.md](current/verification.md)を参照する。

## 集計

| 分野 | 件数 |
|---|---:|
| Viewer | 30 |
| シェル | 14 |
| ファイラ | 18 |
| ファイル操作 | 20 |
| フィルター | 16 |
| ヘルプ | 2 |
| メディア | 7 |
| 一覧 | 12 |
| 検索 | 11 |
| 設定 | 6 |
| 入出力 | 9 |
| 入力 | 13 |
| 本棚 | 9 |
| **合計** | **167** |

## アプリ固有機能（Leeyes台帳外）

- `FR-B24` アプリテーマ: システム連動、ライト、ダーク、ペーパー、ミッドナイト、OLED、フォレスト、ハイコントラスト。
- `FR-B24` カスタムテーマ: 16個のsemantic color tokenを用いた作成・複製・編集、preview付きJSON import/export、最大32件、設定profile・named profile・SQLiteへの永続化。

この2項目はLeeyes互換167件の集計には加えない。検証状態と未測定の製品直接観測は
[status.md](current/status.md)と[verification.md](current/verification.md)を正とする。

## Viewer（30件）

- `LEY-VIEWER-001` 順次ページ移動
- `LEY-VIEWER-003` 表示単位移動
- `LEY-VIEWER-004` 1ファイル単位移動
- `LEY-VIEWER-006` ランダム移動
- `LEY-VIEWER-007` スライドショー
- `LEY-VIEWER-008` スライド詳細設定
- `LEY-VIEWER-009` 境界動作
- `LEY-VIEWER-010` しおり
- `LEY-VIEWER-011` 画像をクリップボードへコピー
- `LEY-VIEWER-012` 一覧選択同期
- `LEY-VIEWER-013` 自動・単ページ・見開き
- `LEY-VIEWER-014` 見開き条件
- `LEY-VIEWER-015` 綴じ方向
- `LEY-VIEWER-016` シーク直接移動
- `LEY-VIEWER-018` フィットモード
- `LEY-VIEWER-019` フィット詳細
- `LEY-VIEWER-020` 倍率直接入力
- `LEY-VIEWER-021` ピクセル寸法指定
- `LEY-VIEWER-022` 一時・段階ズーム
- `LEY-VIEWER-023` 原寸表示
- `LEY-VIEWER-025` 背景・余白・間隔
- `LEY-VIEWER-026` スクロール・パン・アニメーション
- `LEY-VIEWER-027` N字・Z字スクロール
- `LEY-VIEWER-028` カーソル自動非表示
- `LEY-VIEWER-029` ルーペ
- `LEY-VIEWER-030` 回転・反転
- `LEY-VIEWER-031` グリッド
- `LEY-VIEWER-032` 先読み
- `LEY-VIEWER-033` 全画面終了・スクリーンセーバー制御
- `LEY-VIEWER-034` 分離Viewer操作

## シェル（14件）

- `LEY-SHELL-001` 3ペイン画面
- `LEY-SHELL-002` メインバー
- `LEY-SHELL-003` イメージバー
- `LEY-SHELL-004` シークバー
- `LEY-SHELL-005` ステータスバー
- `LEY-SHELL-006` アドレスバー
- `LEY-SHELL-007` 一覧位置変更
- `LEY-SHELL-008` Viewer分離
- `LEY-SHELL-009` 全画面表示
- `LEY-SHELL-010` 全画面端UI
- `LEY-SHELL-011` ペイン表示切替
- `LEY-SHELL-012` バー・メニュー表示切替
- `LEY-SHELL-013` 常に手前
- `LEY-SHELL-014` タスクトレイ

## ファイラ（18件）

- `LEY-FILER-001` Desktop起点ツリー
- `LEY-FILER-002` 書庫をツリー表示
- `LEY-FILER-003` 書庫内階層閲覧
- `LEY-FILER-004` 入れ子書庫閲覧
- `LEY-FILER-005` アドレス移動
- `LEY-FILER-006` 戻る・進む履歴
- `LEY-FILER-007` 特殊フォルダ移動
- `LEY-FILER-008` 親階層へ
- `LEY-FILER-009` 手動更新
- `LEY-FILER-010` 自動更新
- `LEY-FILER-011` 隠しファイル表示
- `LEY-FILER-012` 未対応ファイル表示
- `LEY-FILER-014` インクリメンタル検索
- `LEY-FILER-015` ツリー詳細動作
- `LEY-FILER-016` 移動後初期選択
- `LEY-FILER-017` フォルダ・画像を開く規則
- `LEY-FILER-018` 一覧配色
- `LEY-FILER-019` 一覧罫線・詳細書式

## ファイル操作（20件）

- `LEY-FILE-001` ファイルダイアログで開く
- `LEY-FILE-002` 全画面で開く
- `LEY-FILE-003` スライドショーで開く
- `LEY-FILE-004` Explorer・関連付け起動
- `LEY-FILE-005` 外部アプリ登録
- `LEY-FILE-006` 外部起動詳細
- `LEY-FILE-007` アプリ選択履歴
- `LEY-FILE-009` 最近使った項目
- `LEY-FILE-010` 画像を閉じる
- `LEY-FILE-011` 削除
- `LEY-FILE-012` 名前変更
- `LEY-FILE-013` プロパティ
- `LEY-FILE-014` 新規フォルダ
- `LEY-FILE-016` 元に戻す
- `LEY-FILE-017` 切取・コピー・貼付
- `LEY-FILE-018` 指定先へコピー・移動
- `LEY-FILE-019` パス・親パスコピー
- `LEY-FILE-020` ドラッグ＆ドロップ
- `LEY-FILE-022` 名前変更設定
- `LEY-FILE-023` 選択コマンド

## フィルター（16件）

- `LEY-FILTER-001` フィルターセット管理
- `LEY-FILTER-002` 順序付きチェーン
- `LEY-FILTER-003` グレースケール
- `LEY-FILTER-004` レベル補正
- `LEY-FILTER-005` ガンマ補正
- `LEY-FILTER-006` コントラスト
- `LEY-FILTER-007` 明るさ
- `LEY-FILTER-008` ヒストグラム均等化
- `LEY-FILTER-009` ポスタリゼーション
- `LEY-FILTER-010` 色反転
- `LEY-FILTER-011` トーンカーブ
- `LEY-FILTER-012` シャープ
- `LEY-FILTER-013` アンシャープマスク
- `LEY-FILTER-014` ぼかし
- `LEY-FILTER-015` トリミング
- `LEY-FILTER-016` 余白追加

## ヘルプ（2件）

- `LEY-HELP-001` オフラインヘルプ
- `LEY-HELP-002` バージョン情報

## メディア（7件）

- `LEY-MEDIA-001` メディア情報保存
- `LEY-MEDIA-002` キャンセル時一括破棄
- `LEY-MEDIA-003` オフライン閲覧
- `LEY-MEDIA-004` メディアサムネイル
- `LEY-MEDIA-005` 媒体有無アイコン
- `LEY-MEDIA-008` メディア識別規則
- `LEY-MEDIA-009` メディア独自アイコン

## 一覧（12件）

- `LEY-CATALOG-001` 一覧表示
- `LEY-CATALOG-002` 詳細表示
- `LEY-CATALOG-003` サムネイル表示
- `LEY-CATALOG-005` 並べ替え
- `LEY-CATALOG-006` ファイルマスク
- `LEY-CATALOG-007` マスク詳細条件
- `LEY-CATALOG-008` 画像サムネイル生成
- `LEY-CATALOG-009` フォルダ・書庫表紙
- `LEY-CATALOG-010` サイズ・生成方式
- `LEY-CATALOG-011` 種別アイコン・情報
- `LEY-CATALOG-015` 表示中サムネイル保存
- `LEY-CATALOG-016` 再帰一括読込

## 検索（11件）

- `LEY-SEARCH-001` 複数ソース横断検索
- `LEY-SEARCH-002` 複数場所指定
- `LEY-SEARCH-003` ワイルドカード論理式
- `LEY-SEARCH-004` 下位階層検索
- `LEY-SEARCH-005` 種別フィルター
- `LEY-SEARCH-006` 検索結果保持
- `LEY-SEARCH-007` 固定検索場所
- `LEY-SEARCH-010` サイズ条件
- `LEY-SEARCH-011` 日付条件
- `LEY-SEARCH-012` 結果とツリーの並行利用
- `LEY-SEARCH-013` 検索再実行

## 設定（6件）

- `LEY-SETTING-001` 統合設定画面
- `LEY-SETTING-002` 名前付き設定保存
- `LEY-SETTING-003` 設定読込
- `LEY-SETTING-004` 使用設定ファイル切替
- `LEY-SETTING-005` 起動場所・初期選択
- `LEY-SETTING-006` 前回画像再表示

## 入出力（9件）

- `LEY-IO-001` CSV出力プリセット
- `LEY-IO-002` CSV項目・順序
- `LEY-IO-003` CSVヘッダー
- `LEY-IO-004` CSV単位
- `LEY-IO-005` CSV対象
- `LEY-IO-006` ファイル名分割
- `LEY-IO-007` CLIパス指定
- `LEY-IO-008` CLI `-f`
- `LEY-IO-009` CLI `-s`

## 入力（13件）

- `LEY-INPUT-001` 複数キー割当
- `LEY-INPUT-002` グローバル・Viewer優先順位
- `LEY-INPUT-003` 綴じ方向キー交換
- `LEY-INPUT-004` キー割当初期化
- `LEY-INPUT-005` キースクロール設定
- `LEY-INPUT-006` 一覧マウス割当
- `LEY-INPUT-007` Viewerマウス割当
- `LEY-INPUT-008` 4象限クリック
- `LEY-INPUT-009` 右クリック割当
- `LEY-INPUT-010` ドラッグ係数
- `LEY-INPUT-011` 5ボタン対応
- `LEY-INPUT-012` ホイール不感帯
- `LEY-INPUT-013` ドラッグ矩形ズーム

## 本棚（9件）

- `LEY-SHELF-001` 名前付き本棚作成
- `LEY-SHELF-002` フォルダ・書庫登録
- `LEY-SHELF-003` DnD登録
- `LEY-SHELF-004` テキスト入出力
- `LEY-SHELF-005` 仮想階層閲覧
- `LEY-SHELF-006` 登録解除と実体操作の分離
- `LEY-SHELF-007` 消失登録の整理
- `LEY-SHELF-008` 起動時本棚
- `LEY-SHELF-009` 本棚並べ替え・独自アイコン
