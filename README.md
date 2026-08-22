# Comic Explorer

Comic Explorerは、Windows上のローカルな漫画・画像コレクションをExplorer風に整理して閲覧する、
オフライン志向のデスクトップアプリです。フォルダー、画像、PDF、各種書庫を同じcatalogから扱い、
原本を変更しない閲覧を基本にしています。

現在のバージョンは`0.1.0`です。中核機能と選択済みのLeeyes互換機能は実装・自動検証済みですが、
clean VM、アクセシビリティ、DPI、実機性能など一部のrelease受入は未完了です。

## 主な機能

- Windowsのドライブ・フォルダーをたどるtree、アドレス移動、履歴、検索
- 詳細、サムネイル、表紙グリッド、カードなど5種類のcatalog表示
- 単ページ、見開き、連続表示、全画面、分離Viewer、スライドショー
- 表示倍率、フィット、回転・反転、ルーペ、グリッド、非破壊画像フィルター
- しおり、読書位置、お気に入り、タグ、メモ、履歴、評価、名前付き本棚
- ZIP/CBZ/EPUB、RAR/CBR、7z/CB7、LZHと入れ子書庫の閲覧
- ファイル操作、drag & drop、外部アプリ連携、CSV出力、CLI起動
- app-localの設定、thumbnail cache、オフラインメディア台帳、オフラインヘルプ

詳細は[実装済み機能一覧](docs/implemented-features.md)を参照してください。未実装、代替仕様、
安全上の非採用、検証待ちは[未実装・非採用機能](docs/unimplemented-features.md)で分けています。

## 対応形式

| 種別 | 対応範囲 |
|---|---|
| 画像 | BMP、JPEG/JPG、GIF、TIFF/TIF、PNG、ICO、SVG、静止WebP |
| 文書 | PDF |
| 書庫 | ZIP/CBZ/EPUB、RAR/CBR、7z/CB7、LZH |

EPUBはZIP互換書庫として画像を閲覧し、HTML本文の組版は行いません。AVIFは安全な分類・拒否境界のみで、
画像デコードは未対応です。animated GIFはdecode済みですが、release WebView2でのanimation受入が残っています。

## 安全性とプライバシー

- 通常の閲覧、thumbnail生成、フィルター適用ではlibrary原本や書庫を変更しません。
- 原本を変更する操作は、利用者が明示したファイル操作と確認に限定します。
- 設定、DB、cache、temp、recovery、logはlibrary外のapp-local領域へ保存します。
- 漫画データ、path、読書情報、利用状況を外部送信せず、通常利用はofflineで完結します。
- 書庫entry、filesystem path、画像サイズ、件数、memory使用量に上限と検証境界を設けています。

## 開発

Windows、Node.js、Rust、Tauri 2のWindows build環境が必要です。依存関係を取得して開発版を起動します。

```powershell
npm ci
npm run tauri dev
```

release installerを作成します。

```powershell
npm run tauri build
```

主要な検証コマンドは次のとおりです。

```powershell
.\scripts\run-tests-windows.ps1
.\scripts\run-typecheck-windows.ps1
.\scripts\run-build-windows.ps1
.\scripts\run-codd-windows.ps1 scan
.\scripts\run-codd-windows.ps1 check
```

## ドキュメント

- [ドキュメント案内](docs/README.md)
- [実装済み機能](docs/implemented-features.md)
- [未実装・非採用機能](docs/unimplemented-features.md)
- [現行要件](docs/current/requirements.md)
- [現在状態](docs/current/status.md)
- [アーキテクチャ](docs/current/architecture.md)
- [検証結果](docs/current/verification.md)

要件、設計、実装、テストの整合性はCoDDで管理しています。状態の判定では、未実行、未測定、
`BLOCKED`を`PASS`として扱いません。
