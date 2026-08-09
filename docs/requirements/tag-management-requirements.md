---
codd:
  node_id: "req:fr-b10"
  type: requirement
  status: approved
  confidence: 0.9
  depends_on:
    - id: "req:mvp-requirements"
      relation: "extends"
      semantic: "local-only-and-original-read-only-contract"
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "Q6-1-tag-adoption"
---

# FR-B10 タグ管理要件

## 採用範囲と境界

FR-B10では、候補 `FUT-C-022` のタグ付与・除去・検索・名称変更を一つの縦切りとして
採用する。対象は既存の作品・library item identityであり、タグは利用者がローカルに
分類を保持するためのmetadataである。

保存先は既存B06/B07と共有するlibrary root外のapp-local SQLiteだけとする。漫画folder、
ZIP/CBZ、画像、sidecar、library管理fileへ書き込まず、network、外部同期、外部書誌、
FUT-D-004（作品別表示設定）を実装しない。

## REQ-FR-B10-001: stable identity and normalized tag assignment

tag assignmentは入力itemの正規化relative pathから既存の決定的item identityを生成し、
`item_identity`と`tag_id`の組を一意に保存する。同じitemへのassignを繰り返しても一行だけ
を保持し、removeを繰り返しても成功する。absolute path、parent traversal、空のitem
identityは拒否する。

タグ名は前後空白を除去し、連続Unicode空白を一つへ畳み、ASCII互換の全角英数字・記号を
半角へ寄せ、Unicode小文字化したcanonical nameとして保存する。canonical nameが空、
NULを含む、または128 byteを超える入力は`INVALID_REQUEST`で拒否する。canonical nameが
同じ入力は同じtag recordを再利用する。

## REQ-FR-B10-002: query and empty-query behavior

queryはassign済み・未assignのtagをcanonical nameの部分一致で返し、結果をcanonical nameの
自然な決定順（name昇順、同名ならtag id昇順）で返す。大文字小文字、前後空白、全角互換表記、
Unicode文字を同一の正規化規則で扱う。空queryは全tagを返す（タグ管理UIの初期一覧として
利用可能）。外部通信やlibrary再走査を発行しない。

## REQ-FR-B10-003: rename, merge, and invalid input

既存tagのrenameは同一canonical nameへの再実行を冪等に扱う。rename先が既存tagなら、両者の
item assignmentを重複0でmergeし、rename元recordを削除する。rename元が存在しない場合、
またはnew nameが空・不正の場合はmetadataを変更せずエラーを返す。mergeは同一itemの既存
assignment、未assignのtag、その他tagのassignmentを壊さない。

## REQ-FR-B10-004: migration, restart persistence, and connected UI

schema v3からv4へのmigrationはtransaction内で`tags`、`item_tags`、tag query用indexを
作成し、既存settings、favorites、memo、history、rating、reading positionを保持する。
同じdatabaseを再openしてもmigrationは冪等で、tagとassignmentを復元する。

UIはproduction `App`からTypeScript client/Tauri commandへ、tagの一覧・query、selected item
へのassign/remove、renameを接続する。focused testは次を直接観測する。

| Test ID | 接続境界 | 観測契約 |
|---|---|---|
| FT-B10-001 | App → client → tag command → SQLite | assign/removeの冪等性とstable item identity |
| FT-B10-002 | tag query client/command → UI | query、Unicode normalization、空query、local-only |
| FT-B10-003 | rename UI/client/command → SQLite | rename、duplicate merge、empty/invalid拒否 |
| FT-B10-004 | StateStore migration/reopen → App | migration、restart persistence、SQLite局所性、原本/sidecar snapshot hash不変 |
| FT-B10-005 | Windows release WebView2 → App → command → SQLite | assign、正規化query、rename、製品restart復元、remove、library source tree差分0 |

Rust focused testsはFT-B10-001〜004の保存境界を、frontend focused testsはproduction Appから
client commandを呼ぶ接続境界を検査する。FT-B10-005はmockを使わないWindows release製品から同じ
command/SQLite境界へ接続する。機能testにSKIPが1件でもあればFR-B10を完了扱いにしない。

## C0/C1および検証境界

C0では上記exact4 ID、canonical frontend/App/Rust/typecheck/build command、toolchain選択、
owned path/SHA、raw destinationを固定する。focused exact4、App回帰、Windows offline Rust、
typecheck、build、CoDDを各一回だけ実測し、stdout/stderr/exit/SHAを外部evidenceへ保存する。
初回FAILは停止し、同一根因redoは一回までとする。CoDDは既存の限定 structural exceptionを
生値で開示するだけで、新plugin、contract、oracle、validator、capture、monitor、schema版を
追加しない。

## IMP-005 完了ゲート

`scripts/run-feature-verification-wsl.sh IMP-005 -RustMode Canonical`をWindows-native toolchainへ橋渡しする
正本コマンドとする。frontend FT-B10-001〜004、typecheck、SBOM/build、canonical Rust、release executableの
freshness、FT-B10-005、製品process cleanup、CoDD scan/check/verifyを同じsourceに束縛して実行する。

CoDDの任意profileに由来する構造的SKIP/VACUOUSは生値を開示し、機能testのPASSへ加算しない。一方、
canonical test command内で`depends_on_consistency`の実producerと比較5件を実行し、Windows-native CoDDの
exit 0・red 0を必須とする。これにより旧cmd_400の構造rawをPASSへ改称せず、現行sourceの実行証跡で
IMP-005を判定する。

## 履歴受入証跡（cmd_400）

最終frontend focused source SHA-256は
`6ee91612e6710ff20d97795110306324a14e584c8c9149ce18ffb90da1bc61ff`、Rust repository source SHA-256は
`dc56457520e18ed7b1e7a56e9257ee7e1d7a41417eadadf64d93ef5d88386913`である。accepted evidenceは次のrootに
保存され、今回の文書同期では再実行しない。

- focused exact4、typecheck、build: `queue/reports/evidence/cmd_400/fr_b10_byrole_exact_typing_resume/`
- App回帰39: `queue/reports/evidence/cmd_400/fr_b10_canonical_downstream_gates/`
- Windows offline Rust: `queue/reports/evidence/cmd_400/fr_b10_schema_v4_migration_repair/`
- CoDD structural reference: `queue/reports/evidence/cmd_400/fr_b07_reject_codd_draft_restore_gate/`

| Gate | 結果 | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 |
|---|---|---|---|---|
| focused exact4 | 4 PASS / 0 FAIL / 0 SKIP | `2db2a17536f98b81939a4870191f5c86d59062cd2c303b0eb563c4ccd4e61bf6` | `ded185e876df54dded256115aec5075ef92e9f237d9b4f94074b376c5d340929` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| App regression | 39 PASS / 0 FAIL / 0 SKIP | `c299cb40097e49e6e2a0fff46b3b6b6e5589d14a2789dde5395ea4cc835bfe1f` | `5dee4d2fec20a3c1d55e2b89dec48245cfdd0213682137d28c77766909ffd755` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Windows offline Rust | 78 unit + 1 process PASS / failed 0 / ignored 0 / SKIP 0 | `970bed84ac2e97e8bb6c77a11e100b797e532c441cfe146cb2a4955985fa2965` | `da40e8c015934b67ea6c753d402a2d16680407618e6c29f29bf3a98b15728673` | `91cbe9c7de4799ed426585b2b49a659728883508f54961d87fed8090bb77f624` |
| typecheck | PASS / 0 SKIP | `d322c1628d5a74d02fdf07fc8cc343257adc65a075683cbd8a3cee7a1c0dccea` | `d2297a8e6a87dc32114bcda90f5c007ec0f1b287e38f677de0314e929ea78294` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| build | PASS / 0 SKIP | `5e478cb1804143310dd386dd1123910fc4b53d0276566ace540e4c7bc9e38049` | `f92273bd530f6449e1204d665f6fc2d2c0945996f7c5ef7d788b3627d6db75d0` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The repository evidence records one-version-at-a-time transaction boundaries: v1 base metadata, v2 favorites,
v3 memo/history/rating, and v4 `tags`/`item_tags` plus query indexes. The accepted v1→v4 migration/restart
contract preserves the prior settings, reading-position, favorites, memo, history, and rating values, restores
tag assignments after reopen, and leaves original and sidecar bytes/SHA unchanged.

The accepted functional state does not imply all-gates PASS. The inherited CoDD raw is
`3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS` with verification tests 0, so it is disclosed as
`INCOMPLETE / NOT APPLICABLE` and not added to PASS counts. Only the approved structural checks
`deployment_completeness`, `user_journey_coherence`, and `environment_coverage` are excepted; functional test SKIP
has no exception. At cmd_400, Windows WebView2 native product UI and OS syscall observation were
`UNMEASURED / BLOCKED`; the WebView2 boundary is superseded by the IMP-005 gate above.

The initial fixture failure, selector failures, migration failure, and typing failure roots remain history-only
evidence. They are not relabeled as PASS and are listed in [FR-B10結果](../testing/fr-b10-results.md). The final
project boundary is exactly six functional/test paths plus these four synchronized documents, contamination 0,
staged path 0, and `git diff --check PASS`; commit and push are outside this task.
