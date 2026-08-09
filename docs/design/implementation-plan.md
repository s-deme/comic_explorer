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
    - id: "req:windows-native-toolchain"
      relation: "implements"
      semantic: "windows-feature-verification-workflow"
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

2026-08-01時点で、Phase 0〜5の実装とPhase 6の大部分の検証は完了している。
主要機能の実装状況と証跡は`docs/testing/mvp-implementation-status.md`、個別ケースの
判定は`docs/testing/phase6-case-results.md`を正とする。Phase 6にはWindows clean VM、
OSレベル通信監視、製品UI性能、実機アクセシビリティなど12件のBLOCKEDが残っているため、
実装済みとリリース判定済みを分けて扱う。

GitHub Actionsでは`main`へのpushを配布ビルドの契機とし、Windows runner上でTauriの
NSISインストーラーを生成してArtifactへ保存する。タグ発行やGitHub Releaseの作成は
MVPの自動化範囲に含めず、Actions実行からの取得を配布ビルドの完了条件とする。

## 2. 製造ルール

- 要件を変更する場合は、先に`docs/requirements/`を更新する。
- 要件、設計、コード、設定、テストを変更する前後にCoDDを実行する。
- Linux/CIでは各変更前に`.venv/bin/codd scan`と`.venv/bin/codd impact`を実行する。
- Windows filesystem上のrepositoryでは、WSLからの呼び出しを含めWindows-native runnerを
  最初から選び、同じ変更をLinux runnerで重複実行しない。
- 各変更後に選択済みplatformのCoDD `scan`、`check`を実行する。
- 実行可能なコードとテストが揃ったフェーズでは`.venv/bin/codd verify`を実行する。
- 関連するCoDDのred gateが残っている状態では、フェーズ完了と報告しない。
- 生成物の`codd/scan/`はバージョン管理へ追加しない。
- ライブラリルートにはDB、キャッシュ、temp、ログを作成しない。
- テストは空実装、無条件成功、skipで完了扱いにせず、対象機能と同じ変更で追加する。
- 各フェーズの「主な検証」はそのフェーズで自動化する範囲を示す。製品全体に対する
  E2E、アクセシビリティ、外部通信、性能、配布の最終判定はPhase 6で行う。

### Windows feature verification

Windows product featureは`verify-feature-windows.ps1 -Feature <ID>`を単一入口とする。
IMP-004/FUT-C-019はfocused frontend、typecheck、frontend/SBOM、focused Rust、hashで鮮度を
保証したrelease executable、ShortcutOnly product gate、CoDD scan/checkの順で開発検証する。
Tauriのbundle resourceである`dist/SBOM.json`をCargoが解決する前に生成し、過去runの
staleな`dist`へ依存しない。
最終source変更後だけ`-RustMode Canonical`でRust fmt/check/full testとCoDD verifyを一回実行する。
CoDD verifyの設定済みtest/typecheckがfull canonical frontendとtypecheckを再実行するため、開発用
focused laneではCoDD verifyを重複実行しない。各child processはPIDと実exit codeを追跡し、最終
JSONへ工程開始・終了・秒数・exit codeを残す。WSL bridgeはこのJSONの生成を完了sentinelとして待機する。

release executableはsource/build inputのSHA-256 manifestとexe自身のhashが一致する場合だけ
product gateへ渡す。入力不変のwarm再実行はrelease compileを省略し、stale、manifest欠損、
exe差替えはいずれもproduct起動前に停止または再buildする。production bundleに入らない
frontend `*.test.ts(x)`はrelease入力から除外する。product harnessはaccessibleな
保存状態と相対reading positionを観測し、socket/UI/process/port/cleanupを有限時間で終了する。

#### IMP-004 workflow timing record (2026-08-09)

「cold-process」はWindows childを新規起動した初回測定、「rebuild」はrelease入力hashを意図的に
不一致にした測定、「warm」は同一入力・同一target cacheでの直後の再実行を表す。Cargo targetと
OS file cacheは削除していないため、完全な空cache測定とは区別する。変更前の手動pipelineは失敗後も
後続工程を実行しており、合計時間とともに赤だった工程を明記する。

| 構成 | Frontend focused | Typecheck | Rust | Release | Product | CoDD scan/check/verify | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| 変更前 cold-process | 2.048s (FAIL) | 1.074s (FAIL) | 594.160s canonical | 25.683s (FAIL) | 25.289s (FAIL) | 3.049 / 33.341 / 6.081s | 690.765s |
| 変更前 warm-cache | 2.054s (FAIL) | 3.084s | 390.260s canonical | 332.231s rebuild | 13.368s | 6.092 / 39.474 / 7.100s | 793.707s |
| 変更後 rebuild/canonical | 8.598s | 6.384s | 96.528s canonical | 84.810s rebuild + 1.574s freshness | 33.619s + 1.126s cleanup | 3.140 / 35.980 / 45.967s | 329.706s |
| 変更後 warm/focused (重複整理前) | 7.280s | 5.967s | 14.778s focused | 1.269s hash reuse + 1.291s freshness | 14.659s + 1.336s cleanup | 2.378 / 36.895 / 45.703s | 147.010s |
| 最終 warm/canonical | 5.222s | 4.115s | 55.545s canonical | 1.004s hash reuse + 1.022s freshness | 25.956s + 1.053s cleanup | 1.677 / 25.000 / 37.462s | 166.289s |
| 最終 warm/focused (重複整理後) | 6.508s | 4.358s | 9.433s focused | 1.117s hash reuse + 1.096s freshness | 13.333s + 0.994s cleanup | 2.107 / 24.574 / — | 72.202s |

Rust候補の分離測定ではdebug focusedが初回66.053秒、warm 12.591秒、同じfocused testの
`cargo test --release`は201.983秒だった。変更前canonicalは初回594.160秒、直後390.260秒である。
このため開発laneはdebug focusedと共有target cacheを採用し、release test profileへの統合は採用
しない。正確性を保つcanonical laneは最終source変更後に一度実行し、release profileの重複は
入力hash一致時のbuild省略で短縮する。focused laneからfull-suite CoDD verifyを除いたことで、
warm全体は147.010秒から72.202秒へ短縮した。最終JSONは成功・失敗にかかわらずignoredな
`src-tauri/target/verification/`へ保存し、生成物はcommitしない。

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
