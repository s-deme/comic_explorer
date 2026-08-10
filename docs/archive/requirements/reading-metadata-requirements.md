---
codd:
  node_id: "req:fr-b07"
  type: requirement
  status: approved
  confidence: 0.91
  depends_on:
    - id: "req:mvp-requirements"
      relation: "extends"
      semantic: "local-only-and-original-read-only-contract"
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "Q6-1-candidate-adoption"
---

# FR-B07 読書情報要件

## 採用範囲

FR-B07では、同じ作品を後から開いたときに読書文脈を復元できるよう、候補ID
`FUT-C-023`（メモ）、`FUT-R-004`（閲覧履歴）、`FUT-R-005`（評価）を採用する。
未読・読書中・読了の読書状態ラベルは未決定の別トラックであり、本要件、
API、SQLite schema、focused testへ混入させない。

保存先は既存のlibrary root外にあるapp-local SQLiteだけとする。library root、漫画folder、
ZIP/CBZ、画像、sidecar、管理ファイルへ書き込まず、cloud sync、外部書誌、telemetry、
ネットワーク送信も行わない。

## REQ-FR-B07-001: 作品identityとmemo

metadataの主キーは、既存の`RelativePath`で正規化した作品relative item keyとする。absolute
path、parent traversal、空のkey、library root外を表す値は拒否する。同じ作品の保存は一件の
upsertとし、UTF-8本文を保存して再取得できる。空文字列または空白だけの本文はclearとして行を
削除し、再取得結果を未設定（`null`）に戻す。

memo tableは作品identity、本文、更新時刻を保持し、ユーザー入力をHTML、URL、file operation
として解釈しない。

## REQ-FR-B07-002: 成功した閲覧のhistory

作品を開く処理がページ列を正常に列挙し、generationが有効な成功境界へ到達した場合だけ、
作品identityと`lastViewedAtMs`をhistoryへupsertする。失敗、キャンセル、空ページでは記録しない。
同じ作品を何度開いてもhistory rowは一件だけとする。履歴一覧の順序は
`lastViewedAtMs DESC, itemIdentity ASC`で決定し、同時刻でも決定的である。

historyは作品単位の閲覧履歴であり、page keyやnatural ordinalを複製しない。既存の
`reading_positions` table/APIは読書位置だけを保持し、historyの更新で変更しない。

## REQ-FR-B07-003: rating

評価は未設定（`null`）または整数1〜5を受け付け、1と5を含む。0、6、非整数、NaN、Infinity、
絶対path等の不正入力は`INVALID_REQUEST`または`INVALID_PATH`で拒否し、既存値を破壊しない。
未設定へ戻す操作はrating rowを削除し、再取得結果を`null`にする。ratingは作品identity単位で
upsertし、SQLite reopen後も同じ値を返す。

## REQ-FR-B07-004: schema v3 migrationと再起動

schema version 2から3へのmigrationをtransaction内で行い、専用のmemo、history、rating table
および必要なindexを作成する。既存のsettings、reading_positions、source_fingerprints、
thumbnail_index、schema_migrations、favoritesとその値を失わない。v3 databaseをreopenしても
migrationは再実行で壊れず、旧設定・favorite・読書位置と全metadataを復元できる。

migration failure時は既存のrecovery契約を使い、library rootや原本を変更しない。

## REQ-FR-B07-005: 接続境界と非破壊性

Rust StateStore、Tauri command、TypeScript client、App UIを一つの接続境界として実装し、次の
focused testで直接観測する。

| Test ID | 観測する契約 | 必須の接続証跡 |
|---|---|---|
| FT-B07-001 | memo保存、編集、clear、再表示 | App → client → metadata command → SQLite |
| FT-B07-002 | historyの決定順序と作品row重複0 | open成功境界 → history API → App履歴表示 |
| FT-B07-003 | rating 1/5、未設定、invalid拒否 | App入力 → rating command → SQLite reopen |
| FT-B07-004 | v2→v3 migrationと再起動後の全値 | StateStore migration/reopen → metadata API |
| FT-B07-005 | reading positionとの分離、library/original差分0 | position API + metadata API + snapshot |
| FT-B07-006 | Windows製品でのmemo保存、編集、再起動復元、clear | release WebView2 → App → client → SQLite + library source tree差分0 |
| FT-B07-007 | Windows製品で成功openだけをhistoryへ記録し、重複排除・順序・restart復元 | release WebView2 → open境界 → SQLite → history UI + library source tree差分0 |
| FT-B07-008 | Windows製品でrating 1/5、再起動復元、未設定clear | release WebView2 → App → rating command → SQLite + library source tree差分0 |

選択対象のfocused testはSKIP 0でなければ完了扱いにしない。Rust側の`fr_b07` selectorは上記5契約を
個別に検査する。frontend側はAppからclientへの接続を観測できる`FT-B07-001`〜
`FT-B07-004`の4件を選択し、`FT-B07-005`は実Storeと実ファイルを使うRust testを正本とする。
clientを全mockしたfrontend testで原本やlibrary fileの不変性を合格に数えない。
`FT-B07-006`はmockを使わないWindows release製品で`FUT-C-023`だけを原子的に判定し、historyと
ratingの未測定product gateをmemoのPASSへ含めない。原子feature runnerのtest-name patternで非対象に
なったtestは`excluded-by-pattern`として生値を開示し、選択対象の機能SKIPへ数えない。runnerは選択対象が
exact 1 PASS・0 FAILでなければexit 0でも失敗させる。

## 非採用・境界

- 読書状態ラベル（未読・読書中・読了）は未決定のため別トラックで扱う。
- 読書位置のpage key、natural ordinal、保存タイミング、既存APIをmetadataの代替にしない。
- library root内のファイル操作、rename、move、copy、delete、sidecar書込みを行わない。
- network、install、外部同期、外部サービス、秘密情報を機能の前提にしない。
- Windows WebView2のproduct実機gateは非native環境の測定で代替せず、未実測ならBLOCKEDとして残す。

## 受入ゲート

実装後、frontend focused、Rust focused、canonical Rust、typecheck、buildを各一回、選択対象SKIP 0で測定し、
stdout/stderrをraw保存してSHA-256で束縛する。CoDD scan/check/verifyも各一回測定してrawを束縛するが、
承認済みの構造的3 SKIP以外の実test SKIPは許容せず、CoDDのexit 0だけではSKIPをPASSへ昇格できない。
verification tests 0やVacuousも完了扱いにしない。独立command-manifest oracleとv3 scope oracleが
exit 0で、Gunshiの軽量review ACCEPTを得るまで測定結果をPASSへ昇格せず、commitも行わない。全gate後に
roadmap、feature-status、test resultsを実測状態へ同期する。

### IMP-006 memo完了ゲート

`scripts/run-feature-verification-wsl.sh IMP-006 -RustMode Canonical`をWindows-native toolchainへ橋渡しする
正本コマンドとする。現行frontendから`FT-B07-001`だけを選択し、typecheck、SBOM/build、canonical Rust、
release freshness、`FT-B07-006`、製品process cleanup、CoDD scan/check/verifyを同じsourceへ束縛する。

`FT-B07-006`では`comic-folder`を製品UIから開き、保存中はmemo入力を含む操作を無効化して、memoを
保存・編集し、製品再起動後に同じ作品へ
復元されることを確認してからclearする。保存完了はinput値だけでなく操作中状態の解除後に判定し、
再表示でも空であることを確認する。前後のlibrary file集合、bytes、SHA-256は一致しなければならない。
このgateのPASSは`FUT-C-023`だけを完了させ、`FUT-R-004`と`FUT-R-005`を自動的にPASSへ昇格しない。

### IMP-007 history完了ゲート

`scripts/run-feature-verification-wsl.sh IMP-007 -RustMode Canonical`をWindows-native toolchainへ橋渡しする
正本コマンドとする。現行frontendから`FT-B07-002`だけを選択し、typecheck、SBOM/build、canonical Rust、
release freshness、`FT-B07-007`、製品process cleanup、CoDD scan/check/verifyを同じsourceへ束縛する。

`FT-B07-007`はrelease製品UIから異なる2作品を正常openし、一方を再openしてもidentityごとのrowが
1件であることと、最終成功時刻の降順で表示されることを確認する。corrupt archiveのopen失敗はrowを
追加せず、製品restart後も同じ集合・順序を復元しなければならない。cancel、empty、stale generationは
製品UIで決定的に発生させず、Rustの`fr_b07_history_deterministic_order_and_dedup`を正本とする。
前後のlibrary file集合、bytes、SHA-256は一致しなければならない。このgateのPASSは`FUT-R-004`だけを
完了させ、`FUT-R-005`を自動的にPASSへ昇格しない。履歴行から作品を開く操作は承認済み要件に含まれず、
本IMPへ追加しない。

### IMP-008 rating完了ゲート

`scripts/run-feature-verification-wsl.sh IMP-008 -RustMode Canonical`をWindows-native toolchainへ橋渡しする
正本コマンドとする。現行frontendから`FT-B07-003`だけを選択し、typecheck、SBOM/build、canonical Rust、
release freshness、`FT-B07-008`、製品process cleanup、CoDD scan/check/verifyを同じsourceへ束縛する。

`FT-B07-008`はrelease製品UIから実comicを開き、rating 1を保存してから5へ更新し、製品restart後も5が
復元されることを確認する。その後未設定へclearし、viewer再openで未設定のままであることを確認する。
保存完了は選択値だけでなく非同期operationの完了後に判定する。0/6などの不正値拒否は製品UIで注入せず、
Rustの`fr_b07_rating_boundaries_and_invalid_rejection`を正本とする。前後のlibrary file集合、bytes、
SHA-256は一致しなければならない。このgateのPASSは`FUT-R-005`だけを完了させる。`FUT-C-023`、
`FUT-R-004`、`FUT-R-005`の3 atomic product gateがすべてPASSした後にのみ、FR-B07 aggregateを
`Done`へ遷移する。

## cmd_400 履歴実測状態

2026-08-03 JSTのcmd_400では、Gunshiが受理した機能rawを再実行せずSHA参照した。frontend focusedは
source SHA `f7031d69365005301961896db87da20ace8b9c5086531c6ad7501e9b68aa9c83`に束縛した
`FT-B07-001`〜`FT-B07-005` exact5、5 PASS、0 FAIL、0 SKIP、duplicate 0、App回帰は1 file・39 PASS・
0 FAIL・0 SKIP（direct web adapter calls 0）である。Windows offline RustはFR-B07 exact5を5 PASS、
0 failed、0 ignored、0 SKIP、canonical wrapperを66 unit + 1 process PASS、0 failed、0 ignored、
0 SKIPで完了し、typecheck/buildも各exit 0である。Rust exact5は
`fr_b07_memo_crud_clear_and_reopen`、`fr_b07_history_deterministic_order_and_dedup`、
`fr_b07_rating_boundaries_and_invalid_rejection`、
`fr_b07_v2_migration_preserves_old_values_and_is_idempotent`、
`fr_b07_reading_position_separation_survives_metadata_crud` である。

| Gate | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 | 判定 |
|---|---|---|---|---|
| frontend focused exact5 | `e8b2f80dc8a888d6b1d30d77a92de91a37924666d70ae6b0ab1ce41acb5f96e5` | `fa650fbaf4ff41c316ece825d4eb854c158ac34186792fb7b108e082bc50c82c` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | ACCEPTED immutable reference |
| App regression 39 | `61e315c69353832f1c5bd0d3654946ef00f9e3282c50b0ca34ea44589ec9ef22` | `08a87b125f0e0a53a0bd2e2c716e6f758e344ff6b1906c2bbc244c725354c840` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | ACCEPTED immutable reference |
| Rust exact5 | `cfda35406b78a9f54b9802e778742662bd8e52cb84db23949891f1e6a1b89233` | `183e3903947eb258abe21709870766315345cf246b5b78479fed95e509303a10` | `ae905bcf7333addf0b0de89c426235ed167ef5e4292bd2cf66e3430236751265` | PASS |
| Rust full canonical 66 unit + 1 process | `8570b03c8b8906d4f7a4abc80ddb0f62e2169aacbcdc42aa1ef2b9ce35813a36` | `d61c8d92af8474b90aa2d4aa39adbc8f0f1b383e025a4d7b2306be3128c2312c` | `ada375b0eba1d9560e9bfaf926b522177d4d257295c7aeea8c15d4f8ce3f4734` | PASS |
| typecheck | `f9e29543ebc74c92a00c457eec8d972600407e264670331143f4a09153b0948d` | `d2297a8e6a87dc32114bcda90f5c007ec0f1b287e38f677de0314e929ea78294` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | PASS |
| build | `54fccdea2a0a31370659e48ad9d605bcf45c7a560e8c8a35c1cbe9b8edd97954` | `5145cd83897a30cbd37916d882fffa259f125353c0115cf3d3a3b774d733eedc` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | PASS |
| CoDD scan | `d5b843479ee8a5635bd6aa92678144b67813c6f87c1141177f61d2dec2554384` | `428e31b7481958f2c90a66a3d8ed04b4a681834a9f886951e20db732106f9fc4` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | exit 0 / red 0 |
| CoDD check | `a1cf36608fe80076dce202252b0dbd6387f1b717711afb914a635ed32681de6f` | `0c264281dd7e2b56db04817e83ebe28b851f000b8f4e643f62348967f59715b7` | `ff63d03aa6cd827fa8efdda2b33e28428e263010bce88bd89b3a9b8bae719b37` | exit 0 / red 0 |
| CoDD verify | `93f6aeef90bfacde5a7f1f76eddbbdb1510dc83adb7f97fd3739069acb7685a6` | `a316eb93fd73616896c371b3debd777400e5a77db2ff97366f4b8461f6f4231c` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | INCOMPLETE / NOT APPLICABLE |

FT-B07-002はproduction `open_comic`に接続したopen-history seamで、成功したcurrent-generation・非空
openだけを一行記録し、failed、empty、cancelledは0行とする境界、historyの決定順序、重複0を観測した。
FT-B07-005は実一時original/library fixtureのmetadata・history・rating・reading-position操作前後を
byte/SHA snapshotし、original、library、`library.index`の差分0を観測した。これはApp回帰39とRust
exact5/fullのaccepted compositeに含まれる。

2026-08-09のsuite監査以後、上記accepted rawは履歴参照として保持し、現行frontend suiteの
合格件数には使わない。現行の`FT-B07-005`はRustの
`fr_b07_reading_position_separation_survives_metadata_crud`が実ファイルのbyte不変を検証する。
SHAはbyte一致から導けるが、mtime、完全なdirectory tree、製品WebView2境界はこのRust testの
観測範囲外である。cmd_400では別product gateが未完了だったため、過大にPASSを主張しなかった。

CoDD verifyの生値は `3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、verification
testsは `0 PASS / 0 FAIL / 0 SKIP / 0 total` である。3 SKIP（`deployment_completeness`、
`user_journey_coherence`、`environment_coverage`）と1 VACUOUS（`task_completion`）はPASSへ加算せず、
cmd_400のCoDD gateおよびFR-B07 aggregateは `INCOMPLETE / NOT APPLICABLE` だった。当時のWindows
WebView2 native product UIとOS syscall完全観測は `UNMEASURED / BLOCKED` であり、local evidenceで
代替しなかった。後続のIMP-006はmemo、IMP-007はhistory、IMP-008はratingのWebView2境界をそれぞれ
実測し、3 atomic product gateの完了後にFR-B07 aggregateを`Done`へ遷移した。cmd_400の生値は履歴のまま
保持する。最終結果と不採用CoDD草稿の履歴は [FR-B07結果](../testing/fr-b07-results.md) に集約する。
