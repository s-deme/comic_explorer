---
codd:
  node_id: "design:test-strategy"
  type: design
  status: approved
  depends_on:
    - id: "req:mvp-requirements"
      relation: "derives_from"
      semantic: "governance"
    - id: "design:screen-flow"
      relation: "depends_on"
      semantic: "governance"
    - id: "design:architecture"
      relation: "depends_on"
      semantic: "governance"
---

# Comic Explorer MVP テスト戦略

## 承認記録

- 内容承認者：ユーザー
- 内容承認日：2026-07-29
- 承認範囲：テスト方針、オラクル、合否基準、トレーサビリティ
- 制約：製造開始は別途指示があるまで行わない
- 留保：第19章の要件ギャップは2026-07-29に解消済み。製品待ちの`Blocked`は残す

## 1. 目的と対象範囲

本書は `REQ-MVP-001`〜`REQ-MVP-019`、`NFR-MVP-001`〜`NFR-MVP-005`、`E2E-MVP-001`〜`E2E-MVP-003` を、実装詳細ではなく利用者とファイルシステムから観測可能な振る舞いとして検証する方針を定める。要件の優先資料は `docs/requirements/mvp-requirements.md`、操作オラクルは矛盾しない範囲で `docs/design/screen-flow.md` とする。

対象はテスト戦略、フレームワーク非依存のテストケース、合成フィクスチャ生成・検証、非破壊スナップショットである。製品コードがない現在、全製品テストは `Specified` または技術構成・配布物待ちの `Blocked` とし、合格とは報告しない。

`design:architecture` と ADR-001 は Tauri 2／React・TypeScript／Rust、Vitest、
cargo test、WebdriverIO Tauriを確定採用している。Windows製品相当の未測定値は
採否の保留理由ではなく実装後の品質gateとして追跡する。本書のContractとケースは
観測可能な挙動を正とし、フィクスチャ生成は既存ベンチマークと同じプロジェクト内
Python環境を使って製品依存を追加しない。

## 2. MVP対象外

RAR／CBR、7z、PDF、EPUB、WebP、GIF、AVIF、動画、検索、タグ、メモ、ファイル変更、自動監視、表示形式切替、ズーム、フルスクリーン、ショートカット編集は試験対象外である。`NFR-MVP-002-AC4` の検索性能は要件自身の指定どおり `DEFERRED` とする。漫画項目の移動・改名後の読書位置継承も将来試験とする。

## 3. 品質リスク

| リスク | 影響 | 優先度 | 主な防御 |
| --- | --- | --- | --- |
| 原本、書庫、更新日時の変更 | 利用者データ損失 | P0 | 全読取り操作の前後スナップショット |
| Zip Slip／ルート外参照 | 任意ファイル書込み・情報露出 | P0 | 正規化Unit、危険エントリ列挙、書込み監視 |
| 自然順の不一致 | 読む順序・表紙・次巻が誤る | P0 | Unit／Folder／ZIPで共通マニフェスト |
| 読書位置の混線 | 別作品のページを開く | P0 | 項目ID分離、再起動、ルート再登録試験 |
| 破損データで全体停止 | 他作品も利用不能 | P0 | 局所エラーと回復E2E |
| 非同期の古い結果 | 三領域不整合・誤表示 | P1 | 要求IDとキャンセル競合試験 |
| 大規模データで停止・肥大 | 操作不能 | P1 | 1,000／10,000項目、300ページ性能試験 |
| 外部通信 | プライバシー侵害 | P0 | オフライン完走とOSレベル通信観測 |
| OS／配布差 | インストール不能 | P1 | Windows 10／11実機マトリクス |

## 4. テストレベルと種別

- **Unit**: 自然順、拡張子、パス、項目・ページ判定、表紙、横長、読書位置、ソート、次項目、境界拒否、キャッシュ判定。
- **Contract**: ファイル列挙、画像デコード、ZIP、サムネイル、読書位置ストア、UI・バックエンド境界の入力、出力、分類済みエラー、キャンセル。API名は技術決定後に追記する。
- **Integration**: 実ファイルと書庫、キャッシュ領域、永続ストアの組合せを合成フィクスチャで検証する。
- **UI**: 表示状態、フォーカス、操作結果、エラーと復帰をプロセス内またはアクセシビリティ経由で検証する。
- **E2E**: インストール済みアプリを再起動して主要利用シナリオと原本不変を検証する。
- **Non-functional**: 性能、セキュリティ、アクセシビリティ、互換性、配布、ライセンスを独立した合否として測る。

正常系、境界値、異常系、回復、永続化、並行・キャンセル、非破壊を含む。破損画像は画面設計に従い自動スキップせず、そのページ位置の局所エラーと前後移動を期待する。書庫一覧を確定できない破損ではビューワを開始しない。

### 自動化テストの実装言語と重複防止

実装言語は検証対象の所有境界に合わせる。Reactの表示、アクセシブル状態、入力と
TypeScript client呼出しはVitest／Testing Library、domain、SQLite、ファイル、書庫、
Tauri境界はRustの`cargo test`、fixture・CoDD・release補助ツールはPythonの
`unittest`を正本とする。UI文言は日本語を完全一致で検証し、テスト名は既存規約どおり
feature IDと簡潔な英語の振る舞い名を使う。

同じ組合せを全レイヤーで反復しない。純粋な分類・分岐の全表はUnitで一度だけ網羅し、
UIは代表値で配線、表示、回復操作を検証する。SQLite永続化、migration、原本非破壊は
mock済みclientのUIテストでは合格にせず、実Storeまたは製品境界で検証する。上位テストに
残すのは、下位テストでは観測できない接続だけとする。

portable toolingとfrontendの集約入口は、CoDD `depends_on_consistency`を先頭で一度だけ
実行してからPython unitとVitestを実行する。Python unitから同じ実CoDD chainを再帰的に
起動しない。RustはWindows toolchain、fixture、Cargo cacheを要する独立laneであり、
CIまたは最終Windows canonical gateで一度実行する。

Windows filesystem上のVitestは、2026-08-09の同一suite比較でsingle-threadが17.56秒、
既定並列が21.41秒だったため、Windows canonical runnerはsingle-threadを維持する。
純粋TypeScript unitは`node`環境、DOMを観測するtestだけ`jsdom`環境を使う。並列数の変更は
同一platformで複数回測定し、速度とflakeの両方を満たす場合だけ採用する。

同日の監査修正前後を同じWindows hostで各一回測定した参考値では、集約wall timeは
31.63秒から24.29秒（23.2%短縮）、Pythonは27件・7.351秒から25件・1.069秒、Vitestは
111件・17.56秒から104件・15.58秒となった。単発値は性能合否には使わず、重複chainと
不要なApp renderを除去できたことの回帰基準として保持する。

## 5. テスト環境と Windows マトリクス

テストごとにライブラリ、アプリ専用データ、キャッシュ、一時領域を別の一意な作業ディレクトリへ置く。時刻、ロケール、DPI、ストレージ、CPU、メモリ、アプリ版、依存版を結果に記録する。ネットワーク試験ではテストプロセスを遮断し、DNS、TCP、UDPの送信をOSレベルで記録する。

| 環境 | アーキテクチャ | DPI | ストレージ | 必須試験 |
| --- | --- | --- | --- | --- |
| Windows 10 サポート最終対象ビルド（TBD） | x64 | 100%、150% | ローカルSSD | install/start/E2E/uninstall/non-destructive |
| Windows 11 サポート対象ビルド（TBD） | x64 | 100%、150%、200% | ローカルSSD | 全P0/P1、性能、アクセシビリティ |
| Windows 11 | x64 | 100% | ローカルHDD相当または調整I/O | 暫定性能の感度測定 |

Windows 10の具体的エディション・ビルド、基準PC、HDDをリリース阻止対象にするかは配布・性能設計待ちである。仮想環境のみの合格で実機合格を代替しない。

## 6. テストデータ方針

`tests/fixtures/generate_fixtures.py` が固定シード `20260728` から著作権上問題のない幾何模様と5×7ピクセル文字を描く。外部画像・実作品・生成AI画像は使わない。通常生成は機能用の小規模セット、`--include-performance` は1,000／10,000項目と300ページを追加する。出力は `tests/fixtures/generated/` としGit対象外にする。ここでいう「同一入力」は、内部で定義された固定seed、同一generator version、同一command（fixture optionsを含む）の組合せであり、CLIに存在しない `--seed` を捏造して指定しない。

`manifest.json` は相対パス、形式、寸法、期待順、表紙、ページ数、成功／エラー、SHA-256、サイズ、固定mtime、ディレクトリエントリを保持する。絶対パスは保存しない。`validate_fixtures.py` は再計算値、ZIPの構造、危険エントリが作業領域外へ生成されていないことを検証する。

`NFR-MVP-006-AC6` は、fixture generatorのContract（固定seed `20260728`）と
Integration（malformed ZIP／image／security corpus）で検証する。test modalityは
Contractで内部seed・同一generator version・同一command（fixture optionsを含む）を
「同一入力」として決定性を検証し、Integrationで生成物と非破壊境界を検証する。
実行環境はWindowsと通常のLinux CIを各1ケースとして記録し、各ケースで同一入力
からmanifest、SHA-256、サイズ、固定mtime、ディレクトリエントリが一致することを
expected evidenceとする。同一入力は内部seed、同一generator version、同一command
（fixture optionsを含む）の組合せであり、CLIに存在しない`--seed`を捏造しない。platform
固有のpath変換は行わず、各環境の通常の絶対pathをそのまま使用する。これは
PowerShell/System.DrawingによるPNG→JPEG生成とは別責務である。
通常生成（非force）で既存outputがある場合はnonzeroで拒否し、生成前後のoutput hashと
mtimeを比較して不変であることを要求する。Pythonの`--force`は既定の
`tests/fixtures/generated` directory、またはbasenameが`comic-explorer-fixtures*`の
fixture output directoryに対してだけ受け付け、許可外directoryはforceでもnonzeroで
拒否し、内容・hash・mtimeを不変に保つ。force再生成は内部seed、同一generator version、
同一commandの入力条件とmanifest／SHA-256／サイズ／固定mtime／ディレクトリエントリが
一致することを検証し、再生成後のhashが必ず変化することは要求しない（同一hashは決定性
の証拠になり得る）。明示的なreplace指定がない限り、既存outputの無断変更は失敗とする。
PowerShell/System.Drawingを利用できない通常のLinux環境は、PNG→JPEG生成についての
環境別`Blocked`（未実行を`PASS`へ変更しない）とする。interfaceを検出できた実行済み
分岐で期待する拒否・不変性・決定性に違反した場合は`FAIL`とする。実装済みgeneratorと
各環境が揃わない場合も`Blocked`として、原因と環境情報を報告する。停止条件は、許可外
force、非force既存outputの上書き、または実行済み分岐のmanifest／hash／mtime不一致を
検出した時点で当該ケースをFAILとして中断し、環境未整備はFAILへ変換せずBLOCKEDとして
記録することである。

## 7. 原本非破壊のオラクル

`REQ-MVP-017` はP0かつリリース阻止条件である。各操作前にライブラリルートを `lstat` し、相対パス、種別、サイズ、SHA-256、mtime（Windowsでは100ns値を取得可能なAPIの生値）、属性を記録する。操作後に同一APIで再取得し、次をすべて要求する。

1. 追加、削除、改名、種別変更、内容・サイズ変更が0件。
2. ファイルとディレクトリのmtime変更が0件。ファイルシステム精度を丸めて隠さず、同一環境の生値で比較する。
3. ZIP／CBZ本体のハッシュとエントリ一覧が不変。
4. キャッシュ、DB、設定、一時ファイルがライブラリ配下に0件。
5. 一時展開が必要な実装でもアプリ専用一時領域だけを使い、正常・キャンセル・異常終了後の方針どおりに回収される。

フォルダ列挙、サムネイル生成・再利用、画像／書庫閲覧、ページ移動、表示・方向切替、位置保存、正常終了、強制終了相当を個別に挟んで比較する。アクセス時刻は製品要件の比較対象外だが環境情報として記録する。

## 8. 自然順のオラクル

確定規則は、数字列を整数比較し、相対パスの各部分を自然順で比較し、対応拡張子を大小文字非区別で認識し、対応外と隠しファイルを除外することである。

| 入力 | 確定した期待順／状態 |
| --- | --- |
| `1.jpg, 10.jpg, 2.jpg` | `1.jpg, 2.jpg, 10.jpg` |
| `chapter/10.png, chapter/2.png, 1.png` | `1.png, chapter/2.png, chapter/10.png` |
| `.JPG, .JPEG, .PNG, .txt, .webp` | 先の3形式だけを大小文字非区別でページ認識 |
| 同一相対パスを持つFolderとZIP | 同一ページ順・同一表紙 |
| ZIP格納順を逆転 | 格納順に関係なく同一結果 |

`1.png`、`01.png`、`001.png` の数値同値は正規化前UTF-16序数で
`001.png, 01.png, 1.png`と決着する。Unicode正規化は行わず、Windows上の
パス同一性はOSへ委ね、表示順の最終決着は正規化前UTF-16序数とする。

## 9. 読書位置保存・復元のオラクル

未読は先頭ページ。表示に成功した現在の先頭ページを、正規化した漫画項目パスとページ相対パスを主キー情報、自然順位置を補助情報として直後に保存し、終了・次項目遷移前にも確定する。フォルダとZIP／CBZは同じ契約とする。

同じ相対ページが残るならページ追加で順位が変わっても同じページを復元する。
消失時は旧自然順位置から距離が最小の利用可能ページを選び、前後が同距離なら
旧位置以後の後方候補を優先する。異常終了相当では、表示成功が観測された直近
ページまでを期待し、要求中で未表示のページは保存しない。単ページ／見開き・
読み方向変更は先頭ページを維持する。

漫画項目ごとの位置は混線せず、別ルートを同じ相対構造で再登録しても誤適用しない。DBなし／空は未読扱い、破損／旧スキーマは原本を変えず分類済みエラーまたは安全な再初期化案内を要求するが、移行方針は技術設計待ちである。

## 10. ZIP／CBZ検証

Deflate、Stored、内部ディレクトリ、日本語名、大文字拡張子、対応外ファイル、格納逆順を検証する。空、画像なし、破損、暗号化フラグ、未対応圧縮を分類して対象名・理由・回復操作を要求する。

`../escape.png`、`/absolute.png`、`C:\absolute.png`、`dir\..\escape.png` を含む危険ZIPは列挙だけに使う。正規化後に仮想書庫ルート外となるエントリを拒否し、絶対に抽出しない。テストはライブラリとアプリ一時領域の親も監視し、新規ファイル0件を要求する。

## 11. UI状態と操作フロー

画面状態は `screen-flow.md` の SCR/OP IDをオラクルにする。特に `tree.selectedPath == address.displayedPath == list.parentPath == currentFolder`、一覧選択とステータス項目IDの一致、読み方向の配置・キー・クリック領域の一括反映を不変条件とする。非同期要求には世代IDを与え、移動・キャンセル後の旧結果が現在画面へ反映されないことを検証する。

初回登録、ツリー、三領域同期、履歴、直接入力、選択とフォーカス、遅延サムネイル、漫画の開閉、単／見開き、左右方向、横長、各入力、位置復元、巻末、各エラー回復をUIとE2Eへ分ける。スクリーンショット比較は補助に限定し、アクセシブル状態、表示ページID、現在パス、永続値も検証する。

## 12. アクセシビリティ

キーボードのみでルート登録から閲覧、モード・方向切替、終了、エラー復帰まで完了する。Tab/F6順、固定キー、フォーカスと選択の独立、文字またはアクセシブル名による状態伝達、完全名、エラー見出しへの通知を検証する。Windowsのハイコントラスト、100〜200% DPIでフォーカス欠落、切れ、操作不能がないことを実機確認する。

## 13. 性能

基準PC確定後、各条件をウォームアップと5回以上の独立試行で測り、中央値、p95、最大、初回値を保存する。コールド起動はOSキャッシュ条件を記録し、ウォームと分離する。

- 1,000／10,000項目: 最初の一覧操作可能時間、完全列挙時間、スクロール入力遅延、メモリ、サムネイル保持数、キャッシュ容量。
- Folder／ZIP各300ページ: 初回ページ、先読み済み切替（100ms以内）、連続移動p95、デコード失敗時応答。
- 起動: コールドで操作可能まで3秒以内。
- キャッシュ済み一覧: 操作可能まで1秒以内。
- UIスレッド: 50ms超の停止件数・最大値を別記録し、navigation中p95を100ms以下とする。
- メモリ: ピークと一覧離脱・漫画終了後の回収を記録し、idle working setを250MiB以下とする。
- サムネイルcache: 10GiB hard cap、LRU回収、使用中entry非削除を検証する。

検索1秒はMVP対象外で `DEFERRED`。基準PC、画像解像度、書庫サイズ、メモリ、
cache上限は確定済みであり、製品実装後に該当性能ケースを実行する。

## 14. エラーと回復

アクセス拒否、処理中の消失、ルート消失、破損／0バイト／偽装画像、空／画像なし／破損／暗号化／未対応ZIP、破損DBを注入する。エラーは対象、利用者向け理由、再試行または戻る等の実行可能操作を示し、別フォルダ・別漫画を利用できること、確定済み状態を壊さないこと、原本を修復・削除・上書きしないことを合否とする。

## 15. 再現性、隔離、並列安全性

固定シード、固定mtime、相対パス、生成器バージョンをマニフェスト化する。各テストは `{run-id}/{worker-id}/{test-id}` のライブラリ、データ、キャッシュ、tempを専有し、共有DB・共有キャッシュ・固定ポートを使わない。環境変数でアプリ専用領域を明示し、テスト終了時にその領域だけを削除する。性能、インストール、OS通信監視、強制終了試験は排他キューで直列実行する。危険ZIP名をホストパスへ結合しない。

## 16. 合否基準と未実装テスト

リリースには全P0成功、Must要件へのP0/P1対応、P1の既知失敗0（承認済み例外を除く）、非破壊差分0、外部送信0、Zip Slip書込み0、位置混線0、Folder/ZIP順序一致、Windows 10/11起動成功、直接依存ライセンス確認を要求する。

実装前は仕様の完全性とフィクスチャ検証だけを評価する。`Specified` は手順と
オラクルが確定、`Blocked` は製品・実機・配布物待ち、`Automated` は製品に対する
実行可能な検証が存在する状態である。未実行、skip、空テスト、無条件成功を
合格へ数えない。

## 17. CI導入後の実行レイヤー

| レイヤー | 契機 | 内容 |
| --- | --- | --- |
| L0 | 全変更 | fixture validator、文書・トレーサビリティlint |
| L1 | PR | Unit、Contract、軽量Integration、非破壊 |
| L2 | PR／nightly Windows 11 | UI主要経路、軽量E2E、通信遮断 |
| L3 | nightly | 全Integration/E2E、1,000項目、アクセシビリティ |
| L4 | weekly／release | Windows 10/11実機、10,000項目、性能、install/uninstall、ライセンス |

失敗時はログ、環境、マニフェスト、差分スナップショットを成果物にする。原本そのものや利用者データは収集しない。

採用技術構成ではL1をRust `cargo test` とReactのVitest/Testing Library、
L2/L3のUI・E2EをWebdriverIO Tauriへ割り当てる。Windows性能ハーネスは既存の
`performance-benchmark-plan.md` のイベント契約に従う。

## 18. 要件トレーサビリティ

| 要件 | テストID |
| --- | --- |
| REQ-MVP-001 | TC-UI-001, TC-E2E-001, TC-ERR-001 |
| REQ-MVP-002 | TC-INT-001, TC-UI-002 |
| REQ-MVP-003 | TC-UI-002, TC-UI-003, TC-ERR-002 |
| REQ-MVP-004 | TC-UT-012, TC-UI-003, TC-UI-004 |
| REQ-MVP-005 | TC-INT-009, TC-UI-005 |
| REQ-MVP-006 | TC-UT-005, TC-CT-004, TC-INT-004, TC-INT-005, TC-UI-006 |
| REQ-MVP-007 | TC-UT-009, TC-UI-007 |
| REQ-MVP-008 | TC-UT-002, TC-INT-001, TC-INT-006 |
| REQ-MVP-009 | TC-UT-013, TC-CT-003, TC-INT-002, TC-INT-007, TC-SEC-001 |
| REQ-MVP-010 | TC-UT-004, TC-UI-008, TC-E2E-001 |
| REQ-MVP-011 | TC-UI-009, TC-UI-010 |
| REQ-MVP-012 | TC-UT-006, TC-UI-010, TC-UI-011 |
| REQ-MVP-013 | TC-UI-012, TC-E2E-001 |
| REQ-MVP-014 | TC-UI-013, TC-A11Y-001 |
| REQ-MVP-015 | TC-UT-007, TC-CT-005, TC-INT-008, TC-E2E-001 |
| REQ-MVP-016 | TC-UT-010, TC-UI-014, TC-E2E-003 |
| REQ-MVP-017 | TC-INT-010, TC-E2E-002, TC-DIST-002 |
| REQ-MVP-018 | TC-SEC-002, TC-E2E-004 |
| REQ-MVP-019 | TC-INT-006, TC-INT-007, TC-ERR-001〜005 |
| NFR-MVP-001 | TC-PERF-001〜003 |
| NFR-MVP-002 | TC-PERF-004〜006; DEFERRED: AC4（検索はMVP対象外） |
| NFR-MVP-003 | TC-A11Y-001〜003 |
| NFR-MVP-004 | TC-DIST-001 |
| NFR-MVP-005 | TC-DIST-002, TC-DIST-003 |
| E2E-MVP-001 | TC-E2E-001 |
| E2E-MVP-002 | TC-E2E-002 |
| E2E-MVP-003 | TC-E2E-003 |
| AC-001 | TC-E2E-001 |
| AC-002 | TC-INT-001, TC-INT-002, TC-UI-008 |
| AC-003 | TC-UI-009〜013 |
| AC-004 | TC-E2E-001 |
| AC-005 | TC-INT-010, TC-E2E-002 |
| AC-006 | TC-UI-007 |
| AC-007 | TC-E2E-003 |

`NFR-MVP-006` のAC6は上記のfixture Contract／Integrationで追跡する。Windowsと
通常のLinux CIの実機・CI結果が揃わない間は`Blocked`であり、未実行、skip、環境不足を
成功扱いにしない。技術候補比較・採否はアーキテクチャ作業のため本書では判定しない。

## 19. 解決済み要件ギャップ

次の規則は2026-07-29にユーザー依頼を受けてMVP要件へ確定反映した。

| ID | 要件／設計 | 確定規則 |
| --- | --- | --- | --- |
| GAP-TEST-001 | REQ-MVP-007,008 / 自然順 | 数値同値は正規化前UTF-16序数、さらに相対パスのUTF-16序数 |
| GAP-TEST-002 | REQ-MVP-008 / Unicode | OSへパス同一性を委ね、表示順はUnicode正規化なしのUTF-16序数 |
| GAP-TEST-003 | REQ-MVP-015 / 近傍 | 同距離は後方（旧位置以後）を優先 |
| GAP-TEST-004 | REQ-MVP-005 / 漫画フォルダ操作 | Enterは移動、`読む`／Ctrl+Enterは閲覧 |
| GAP-TEST-005 | REQ-MVP-007,016 / 同値ソート | 名前自然順、正規化済み絶対パスのUTF-16序数で最終決着 |
| GAP-TEST-006 | REQ-MVP-015 / DB障害 | 元DBをアプリ専用recoveryへ隔離し、空DBで継続して通知 |
| GAP-TEST-007 | NFR-MVP-002 | 性能計画の代表PC、データセット、250MiB、long-task閾値を採用 |
| GAP-TEST-008 | NFR-MVP-005 | Windows 10 22H2 x64、既定データ保持、明示選択時だけ専用領域削除 |
