---
codd:
  node_id: "design:implementation-plan"
  type: design
  status: approved
  confidence: 0.86
  depends_on:
    - id: "req:mvp-requirements"
      relation: "implements"
      semantic: "governance"
    - id: "design:architecture"
      relation: "refines"
      semantic: "governance"
    - id: "design:screen-flow"
      relation: "refines"
      semantic: "governance"
    - id: "design:test-strategy"
      relation: "refines"
      semantic: "governance"
    - id: "test:test-cases"
      relation: "executes"
      semantic: "behavioral"
---

# Comic Explorer 製造実装計画

## 0. 評価記録

- 評価日: 2026-07-29
- 評価対象: MVP要件、アーキテクチャ、画面フロー、テスト戦略、テストケースとの整合性
- 文書状態: Approved。2026-07-29の製造開始指示およびPhase 6までの実装承認を反映
- 要件への影響: 既存要件の変更は不要。本修正は実装順序と検証時点を明確化する
- 製造承認: Phase 6までの実装と適宜のコミットが承認済み

## 1. 目的と前提

本計画は、承認済みのComic Explorer MVPを実装し、Windows 10/11向けのオフライン
デスクトップアプリとして検証・配布可能な状態へ到達させるための製造順序を定める。

採用構成はTauri 2、React、TypeScript、TanStack Virtual、Rust、Tokio、SQLite WALで
ある。漫画原本は読み取り専用とし、ZIP/CBZは原本の隣へ展開しない。

現在の実装はReactの最小シェル、Tauriの最小起動処理、基礎スパイクテストのみである。
したがって、以下のフェーズは上から順に実施する。後続フェーズに依存しない探索的な
作業は並行できるが、各フェーズの完了条件を満たすまで、その成果を前提とする後続機能を
完了扱いにしない。製品全体、Windows実機、インストーラーを必要とする試験はPhase 6で
実行し、それ以前のフェーズを不可能な試験でブロックしない。

## 2. 製造ルール

- 要件を変更する場合は、先に`docs/requirements/`を更新する。
- 要件、設計、コード、設定、テストを変更する前後にCoDDを実行する。
- 各変更前に`.venv/bin/codd scan`と`.venv/bin/codd impact`を実行する。
- 各変更後に`.venv/bin/codd scan`、`.venv/bin/codd check`を実行する。
- 実行可能なコードとテストが揃ったフェーズでは`.venv/bin/codd verify`を実行する。
- 関連するCoDDのred gateが残っている状態では、フェーズ完了と報告しない。
- 生成物の`codd/scan/`はバージョン管理へ追加しない。
- ライブラリルートにはDB、キャッシュ、temp、ログを作成しない。
- テストは空実装、無条件成功、skipで完了扱いにせず、対象機能と同じ変更で追加する。
- 各フェーズの「主な検証」はそのフェーズで自動化する範囲を示す。製品全体に対する
  E2E、アクセシビリティ、外部通信、性能、配布の最終判定はPhase 6で行う。

## 3. フェーズ一覧

### Phase 0: 基盤と契約

実装の境界を固定し、RustとReactの間で共有する型とテストfixtureを用意する。

実装内容:

- Rustのdomain型、構造化エラー、識別子、path型を定義
- Tauri command/channelのrequest/response型を定義
- Reactの画面状態、操作状態、generation IDの型を定義
- Rust/TypeScript境界のversion、serialization、上限値、cancel契約を固定
- Rust/Nodeの依存関係、lockfile、不要feature、ネットワーク機能の不採用を確定
- Tauri capability、CSP、custom protocolの最小権限baselineを定義
- 正常系・破損系・大規模系のfixtureとvalidatorを整理
- Unit/Contract/Integrationテストを実装先へ追加するための配置と命名を固定

主な成果物:

- `src-tauri/src/domain/`
- `src-tauri/src/api/`
- `src/types/`
- `tests/fixtures/`
- Rust/TypeScriptのテスト基盤

完了条件:

- UI、application core、adapterの責務境界がコンパイル可能である
- 不正なpath、画像、書庫、DB状態を表現できる
- fixture生成とvalidatorを再現可能に実行できる
- `cargo check`、TypeScript typecheck、既存テストが成功する

### Phase 1: Rustドメインコア

ファイルシステムと書庫を安全に読み取り、画面へ渡す項目・ページ情報を生成する。

実装内容:

- ライブラリルート配下のpath検証とroot越境拒否
- 自然順ソートとUTF-16序数tie-break
- フォルダ、漫画フォルダ、ZIP、CBZ、対応外項目の分類
- JPEG/JPG/PNGの大文字小文字を区別しない判定
- 漫画フォルダ配下の再帰的なページ列挙、隠し項目除外、相対path順序の確定
- junction、symlink、reparse pointを含むcanonical containmentと列挙中の消失処理
- ZIP/CBZのcentral directory解析とentry列挙
- Stored/DeflateとZIP64の読込み、entry名の安全な表示・比較
- 暗号化、破損、Stored/Deflate以外のcompression、危険entryの拒否
- 画像の寸法・形式検証とdecode前のメモリ上限確認
- 原本に対するread-only adapter

主な検証:

- TC-UT-001〜TC-UT-006、TC-UT-009、TC-UT-012、TC-UT-013、TC-UT-015、TC-UT-016
- TC-CT-001〜TC-CT-003
- TC-INT-001〜TC-INT-003、TC-INT-009、TC-SEC-001

完了条件:

- フォルダとZIP/CBZで同一ページ集合を同一順序で得られる
- 再帰列挙でもpath traversal、junctionによるroot越境、未対応形式を安全に拒否できる
- 原本のmtime、サイズ、内容、隣接ファイルに差分がない

### Phase 2: 永続化、fingerprint、キャッシュ

アプリ再起動後も設定・読書位置を復元し、サムネイルを再利用する。

実装内容:

- bundled SQLite、WAL、migration管理
- `%LOCALAPPDATA%\\ComicExplorer`配下へのDB、WAL/SHM、cache、temp、recoveryの分離
- `settings`、`reading_positions`、`source_fingerprints`、`thumbnail_index`
  のrepository
- ライブラリルート、sort、view mode、directionの保存
- 相対page keyを中心にした読書位置の保存・復元
- page追加・削除時の位置解決
- `%LOCALAPPDATA%\\ComicExplorer\\cache\\v1`のcache adapter
- 長辺384px、JPEG quality 82のthumbnail pipeline
- atomic rename、stale判定、negative cache、LRU回収
- migration失敗、DB破損、非対応schema時のrecovery隔離と再初期化通知

主な検証:

- TC-UT-007、TC-UT-008、TC-UT-011、TC-UT-014
- TC-CT-004、TC-CT-005、TC-CT-007
- TC-INT-004、TC-INT-005、TC-INT-008、TC-INT-012

完了条件:

- 再起動後に設定と最後の成功pageを復元できる
- 原本変更・削除時に古いthumbnailを利用しない
- cache/DB/WAL/SHM/temp/recoveryがライブラリルート外にのみ作成される
- cacheの10GiB hard cap、pin、LRU回収を再現可能なclock/容量で検証できる

### Phase 3: 非同期処理、世代管理、Tauri境界

重いI/Oや画像処理をUIスレッドから分離し、古い処理結果の混入を防ぐ。

実装内容:

- navigation generation、viewer session generation、shutdown cancellation
- Tokio task、bounded priority queue、I/O/WIC/DB worker境界
- 表示範囲に応じたthumbnail優先度制御
- フォルダ列挙、thumbnail、page先読みの取消処理
- typed Tauri commands/channels
- server-side page tokenとopaque custom URI
- origin、CORS、MIME、`nosniff`、Content-Length、最大byte数、CSP、token期限の検証
- Tauri capability/command allowlistと、任意path・任意ZIP entry accessの拒否
- 構造化errorのUI向け変換
- 終了要求時の新規受付停止、task cancel、読書位置flush、DB/handle closeの順序

主な検証:

- TC-CT-006
- TC-INT-011

完了条件:

- AからBへ移動した後、Aの完了結果をUIへ反映しない
- cancel後に未開始タスクと不要な結果をcommitしない
- UI/main threadでfilesystem、ZIP、WIC、SQLiteを実行しない
- custom URIに絶対pathや任意entry accessを公開しない
- 正常終了時に確定済み読書位置をflushし、archive/DB/file handleを解放する

### Phase 4: Explorerシェル

承認済みの画面フローに従い、漫画を探すためのExplorer風UIを実装する。

実装内容:

- 初回ライブラリルート登録と再起動復元
- 左側のフォルダツリー、展開、折りたたみ、選択
- アドレスバー、戻る、進む、上へ、直接path入力
- 仮想化フォルダツリーと中央の仮想化サムネイルグリッド
- フォルダ、漫画フォルダ、ZIP/CBZの表示と分類アイコン
- 表紙生成中、失敗、空一覧、列挙失敗の状態表示
- 名前、更新日時、サイズ、種類のsortと方向切替
- 長名、省略、tooltip、status bar、selection、focus表示
- フォルダのEnter移動と、漫画フォルダの明示的な読む操作の分離
- keyboard navigation、ARIA、focus復元
- メニュー、ドラッグ可能splitter、最小client size、100〜200% DPI対応
- ネットワーク不要のキー操作ヘルプと呼出元へのfocus復元

主な成果物:

- `src/features/library/`
- `src/features/navigation/`
- `src/features/catalog/`
- `src/components/`
- `src/App.tsx`
- `src/styles.css`

主な検証:

- TC-UI-001〜TC-UI-007
- TC-ERR-001、TC-ERR-002

完了条件:

- tree、address、list、current folderが常に同じpathを示す
- 10,000項目でも仮想化によりDOM数と操作性を維持できる
- 読み込み中でもナビゲーション、選択、終了が可能である
- 一覧単体のkeyboard/focus/ARIA検証が自動化され、ビューワを含む総合A11Yは
  Phase 6の実機試験へ引き継がれている

### Phase 5: 漫画ビューワ

画像フォルダとZIP/CBZを単ページ・見開きで閲覧できる状態にする。

実装内容:

- viewer sessionとpage model
- 単ページの全体fit、原寸下限、100%上限
- 見開きの最大2ページ配置
- 横長画像の単独表示
- 右開き・左開きによる配置、クリック領域、矢印の反転
- PageUp/PageDown、Space、矢印、ホイール、クリック、Esc
- `1`、`2`、`R`による切替
- 先読みと現在/前/次ページのmemory管理
- 読書位置のdebounce保存とviewer終了時flush
- 破損画像・書庫エラー・0ページ表示
- 巻末時の次漫画項目への遷移
- 元フォルダ、選択、scroll、sortを含む一覧復帰context
- 横長・末尾1ページを含む見開き履歴と前移動の可逆性

主な成果物:

- `src/features/viewer/`
- `src/features/reading/`
- `src-tauri/src/media/`
- `src-tauri/src/prefetch/`

主な検証:

- TC-UT-010
- TC-INT-006、TC-INT-007
- TC-UI-008〜TC-UI-014
- TC-ERR-003〜TC-ERR-005

完了条件:

- 単ページ/見開き切替時に先頭page IDを維持する
- 横長page、末尾1page、前後移動でpageを飛ばさない
- 再起動後に最後に表示が確定したpageから再開する
- ビューワ終了時に元の一覧contextを復元し、項目消失時も安全に一覧へ戻る

### Phase 6: 品質、性能、配布

製品相当環境でMVPの受入条件と配布条件を確認する。

実装・検証内容:

- Rust、React、Tauri E2Eの全テスト実行
- malformed ZIP/image corpus、fuzz、security検証
- 原本tree hash、mtime、サイズのbefore/after比較
- OSレベル監視による外向きDNS/TCP/UDP 0件の確認
- Windows 10 22H2 x64およびサポート中のWindows 11 x64のclean VM/実機で
  install/start/uninstall
- WebView2 Evergreen offline installer同梱確認
- NSIS設定、user data保持・削除動作確認
- 1,000/10,000項目、300ページ規模の性能測定
- cold TTI、一覧ready、page switch、input delay、scroll、working set測定
- SBOM、THIRD-PARTY-NOTICES、ライセンス監査

主な検証:

- TC-E2E-001〜TC-E2E-004
- TC-INT-010
- TC-SEC-002
- TC-PERF-001〜TC-PERF-006
- TC-A11Y-001〜TC-A11Y-003
- TC-DIST-001〜TC-DIST-003

完了条件:

- 関連CoDD gateにredがない
- P0テストがすべて合格する
- P1に未承認の既知失敗がなく、72件すべてに実行結果が記録されている
- Windows 10/11でオフラインinstall、起動、閲覧、uninstallが成功する
- 原本への意図しない差分がない
- 性能目標未達時はprofiling結果と改善結果を記録する

## 4. 推奨する実装単位

機能を次の単位で小さくcommitし、各単位のテストを同じ変更へ含める。

1. API/domain契約、fixture、test harness
2. `path`、`natural_sort`、`item classification`
3. folder/archive page enumeration
4. SQLite repositories and reading-position resolver
5. thumbnail cache and image pipeline
6. navigation coordinator and cancellation/generation
7. Tauri commands and custom media URI
8. Explorer shell and catalog grid
9. viewer layout and input reducer
10. prefetch, next-item navigation, and error recovery
11. Windows E2E, performance harness, and installer

各単位では、実装・テスト・CoDD検証を完了してから次へ進む。

## 5. フェーズ別トレーサビリティ

| フェーズ | 主に実装する要件・品質 |
| --- | --- |
| Phase 0 | 全要件に共通する型、境界、fixture、最小権限 |
| Phase 1 | REQ-MVP-002、005〜009、017、019、NFR-MVP-001 |
| Phase 2 | REQ-MVP-001、006、007、012、013、015、017、019 |
| Phase 3 | REQ-MVP-006、008、009、015、018、019、NFR-MVP-001、002 |
| Phase 4 | REQ-MVP-001〜007、019、NFR-MVP-003 |
| Phase 5 | REQ-MVP-008〜016、019 |
| Phase 6 | REQ-MVP-017〜019、NFR-MVP-001〜006、E2E-MVP-001〜003 |

要件は複数フェーズにまたがる。表は主担当を示すもので、最終的な適合判定は
`docs/testing/test-strategy.md`のトレーサビリティとPhase 6の全件結果を正とする。

## 6. MVP完了判定

次のすべてを満たした場合にのみ、MVP製造完了とする。

- REQ-MVP-001〜019の受入条件を満たす
- NFR-MVP-001〜006を満たす。ただし検索がMVP対象外である
  NFR-MVP-002-AC4は要件どおり`DEFERRED`とする
- テストケース72件を`Automated`または承認済みの`Manual`として実行し、
  全P0と未承認例外のないP1が合格する
- 製品、Windows実機、配布物待ちの`Blocked`を解消し、実行結果を記録する
- CoDDの`scan`、`check`、`verify`が関連範囲で合格する
- 原本非破壊、外部通信ゼロ、ZIP非展開を確認する
- 未達の性能値、既知の制限、残課題をリリース記録へ明記する
