# Comic Explorer 合成テストフィクスチャ

## 目的と安全性

このディレクトリは、MVPの表示順、画像形状、ZIP／CBZ／EPUB、読書位置、原本非破壊、性能を実装前に固定する再生成可能なテストデータ仕様である。画像は固定シードから幾何模様と5×7ピクセル文字を描いて作り、ページ番号、フィクスチャID、寸法を目視できる。実作品、外部画像、生成AI画像、ネットワークを使用しない。

1×1の最小寸法画像だけは文字を収められないため、非対称の登録色ピクセルと
マニフェストの寸法をオラクルにする。それ以外の正常画像には文字ラベルがある。

生成物は `generated/` に置かれGit管理しない。危険ZIPを展開するツールは本ディレクトリに存在せず、検証器もエントリ名を列挙するだけである。

## 生成と検証

WindowsのPowerShellから、プロジェクトルートで実行する。

```powershell
.\.venv-windows\Scripts\python.exe tests/fixtures/generate_fixtures.py --force
.\.venv-windows\Scripts\python.exe tests/fixtures/validate_fixtures.py tests/fixtures/generated
```

性能版を含める場合:

```powershell
.\.venv-windows\Scripts\python.exe tests/fixtures/generate_fixtures.py --force --include-performance
.\.venv-windows\Scripts\python.exe tests/fixtures/validate_fixtures.py tests/fixtures/generated
```

Pythonの外部パッケージは使わない。PNGはPython標準ライブラリだけで生成する。JPEGはサポート対象Windowsに同梱される PowerShell と `System.Drawing` で、同じラベル付きPNGから変換する。WebPは固定の合成base64 payloadをPython標準ライブラリだけで復元し、encoder・download・外部画像を使わない。対応Windows以外でPowerShellを利用できない場合はJPEG生成を明示的に失敗させ、不完全なフィクスチャを成功扱いしない。

`--force` は指定した出力ディレクトリだけを置換する。既定はこのREADMEと同じ場所の `generated/` である。性能版は10,000個超のファイルを作るため通常実行から分離した。

## マニフェスト

`generated/manifest.json` は次を機械判定可能に保存する。

- フィクスチャID、固定シード、生成器名・版、Python版
- 相対ファイルパス、種別、画像形式・幅・高さ
- 期待ページ順、期待表紙、期待ページ数を導ける順序、成功／エラー
- 全ファイルおよびZIP／CBZ／EPUB本体のSHA-256、開始前サイズ、固定mtime
- ZIPエントリの相対名、サイズ、CRC、圧縮方式、暗号化フラグ
- 原本配下のディレクトリエントリ一覧

絶対パスは保存しない。生成物のmtimeは固定する。JPEGエンコーダのバージョン差でバイト列が変わる可能性があるため、異なるWindows環境間で固定SHAを共有するのではなく、各生成時のマニフェストと同一実行環境内で比較する。

## フィクスチャ一覧

| ID | 目的 | 期待ページ順／表紙 | 期待エラー・補足 |
| --- | --- | --- | --- |
| FIX-ORDER-001 | 基本自然順 | `1.jpg, 2.jpg, 10.jpg`／`1.jpg` | なし |
| FIX-ORDER-002 | 先頭ゼロと数値同値 | `001.png, 01.png, 1.png, 2.png`／`001.png` | 数値同値は正規化前UTF-16序数 |
| FIX-ORDER-003 | 大小文字と混在形式 | `2.PNG, PAGE3.JPEG, PAGE10.JPG`／`2.PNG` | `.txt`, `.webpx`はページ外 |
| FIX-ORDER-004 | 日本語、ASCII、全角数字、NFC/NFD | `ASCII2.png, é.png, é.png, 全角２.png, 日本語10.png`／`ASCII2.png` | Unicode正規化なし。Windowsで共存不能な組はUnit文字列入力としても利用 |
| FIX-NESTED-001 | 再帰相対パス | `1.png, chapter/2.png, chapter/10.png, chapter/deep/11.png`／`1.png` | `.hidden*`は除外 |
| FIX-IMAGE-001 | 縦JPEG/PNG、横JPEG/PNG、正方形、高解像度、1×1 | マニフェスト記載／`portrait.jpg` | 幅>高さだけ横長。EXIF Orientationは要件外で未収録 |
| FIX-IMAGE-ERROR-001 | 破損JPEG/PNG、0 byte、拡張子偽装、読取拒否手順 | なし | per-file decode/access error。ACLは同梱手順で設定 |
| FIX-ZIP-001 | Deflate/Stored、directory、日本語、大小文字、対象外、格納逆順 | `1.JPG, 章/2.PNG, 章/10.JPEG`／`1.JPG` | ZIP、CBZ、EPUBで同一 |
| FIX-ZIP-ERROR-001 | 空、画像なし、破損、暗号化フラグ、Zip Slip | なし | `empty`, `no-images`, `corrupt`, `encrypted`, `unsafe-entry`に分類 |
| FIX-LIBRARY-001 | 通常／漫画folder、ZIP/CBZ/EPUB、未対応書庫、空、深い階層、長名、同値metadata | 項目sort規則による | 漫画folderはEnterで移動、明示的な`読む`で閲覧 |
| FIX-READING-001 | 12ページのfolder/ZIP/CBZ/EPUB、保存・追加・削除 | `page1.png`〜`page12.png`／`page1.png` | 保存はpage7。同距離近傍は後方候補を優先 |
| FIX-WEBP-001 | static WebP folder/ZIP/CBZ/EPUB | `1-lossy.webp, 2-lossless.webp, 3-alpha.webp`／`1-lossy.webp` | fixed 1×1 lossy/lossless/alpha。正常系は`folder/`のみ、negativeは別の`errors/4-corrupt.webp`・`errors/5-animated.webp` |
| FIX-PERFORMANCE-001 | 1,000／10,000項目、300ページfolder/CBZ | 数字3桁の自然順 | `--include-performance`時だけ生成 |

## 原本改変検出

製品試験の直前に `manifest.json` と同じ項目（相対path、種別、size、SHA-256、mtime、Windows属性、directory一覧）を別の試験成果物へ記録する。フォルダ列挙、サムネイル生成／再利用、画像・書庫閲覧、ページ移動、表示モード・読み方向変更、読書位置保存、正常終了、異常終了相当の各操作後に再取得する。

合格条件は追加・削除・改名・内容・size・mtime差分がすべて0、ZIPエントリ差分0、ライブラリ配下のcache/DB/tempが0である。アプリ専用領域はライブラリの兄弟ではなく、試験が明示する別ルートに置く。

## 読取拒否の再現

`FIX-IMAGE-ERROR-001/unreadable.png` は生成時には読める。Windows試験ではテスト用コピーに対して試験ユーザーのRead権限だけを拒否し、必ず後処理でACLを復元する。権限変更ができない実行環境ではこのケースを `Blocked: ACL capability` とし、成功扱いしない。

## 隔離と並列実行

生成済み原本を直接変更するエラー注入は禁止する。各workerは生成物を `{run-id}/{worker-id}/{test-id}/library` へ複製し、別の `app-data`、`cache`、`temp` を使用する。性能、ACL、インストール、異常終了、通信監視は直列実行する。危険ZIP内の名前をホストファイルパスへ変換しない。
