---
codd:
  node_id: "test:fr-b10-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:fr-b10"
      relation: "verifies"
      semantic: "tag-management-contract"
    - id: "design:screen-flow"
      relation: "verifies"
      semantic: "connected-app-boundary"
---

# FR-B10 タグ管理 — 最終受入結果（cmd_400）

## 判定

FR-B10のsemantic gateは受理する。focused exact4、App回帰、Windows offline Rust、typecheck、buildは
accepted rawによりPASSである。一方、CoDD structural exceptionの生値は
`INCOMPLETE / NOT APPLICABLE`であり、Windows WebView2 native product UIは
`UNMEASURED / BLOCKED`のため、FR-B10の総合状態は `Partial / BLOCKED` とする。offline Rustの成功を
native Windows product UIの測定済みPASSへ昇格しない。

今回の作業はこの文書と関連する三文書のaccepted evidence同期だけであり、機能、focused test、App回帰、
Rust、typecheck、build、CoDDの再実行、commit、pushは行っていない。

## 実装範囲

- B06/B07と共有するapp-local SQLiteへschema v4の`tags`、`item_tags`、検索indexを追加した。
- `StateStore`からTauri command、TypeScript client、production `App`のタグ管理UIへ接続した。
- タグの正規化、assign/remove/query/rename/merge、空・不正入力拒否をlocal metadata境界へ限定した。
- 漫画folder、ZIP/CBZ、画像、sidecar、library管理fileへの書込み、network、外部同期、
  `FUT-D-004`は範囲外のまま保持した。

## Accepted evidence

accepted evidence rootは次のとおりである。

- focused exact4、typecheck、build: `queue/reports/evidence/cmd_400/fr_b10_byrole_exact_typing_resume/`
- App回帰39: `queue/reports/evidence/cmd_400/fr_b10_canonical_downstream_gates/`
- Windows offline Rust: `queue/reports/evidence/cmd_400/fr_b10_schema_v4_migration_repair/`
- CoDD structural reference: `queue/reports/evidence/cmd_400/fr_b07_reject_codd_draft_restore_gate/`

最終source bindingは、frontend focused test `src/App.fr-b10.test.tsx` SHA-256
`6ee91612e6710ff20d97795110306324a14e584c8c9149ce18ffb90da1bc61ff`、Rust repository
`src-tauri/src/state/repository.rs` SHA-256
`dc56457520e18ed7b1e7a56e9257ee7e1d7a41417eadadf64d93ef5d88386913`である。App回帰は変更されていない
`src/App.test.tsx` SHA-256 `1b23b6de8eff500101da99a480d39b604d24538e3ecfd5c9cceeaf71be4197ba`を束縛した
accepted rawを再利用した。focused testのtyping-only変更後にApp回帰を再実行していない。

| Gate | Accepted raw | 結果 | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 |
|---|---|---|---|---|---|
| focused exact4 | `fr_b10_byrole_exact_typing_resume/focused-exact4.*` | 4 PASS / 0 FAIL / 0 SKIP | `2db2a17536f98b81939a4870191f5c86d59062cd2c303b0eb563c4ccd4e61bf6` | `ded185e876df54dded256115aec5075ef92e9f237d9b4f94074b376c5d340929` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| App regression | `fr_b10_canonical_downstream_gates/app-regression.*` | 39 PASS / 0 FAIL / 0 SKIP | `c299cb40097e49e6e2a0fff46b3b6b6e5589d14a2789dde5395ea4cc835bfe1f` | `5dee4d2fec20a3c1d55e2b89dec48245cfdd0213682137d28c77766909ffd755` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Windows offline Rust | `fr_b10_schema_v4_migration_repair/windows-offline-canonical.*` | 78 unit + 1 process PASS / failed 0 / ignored 0 / SKIP 0 | `970bed84ac2e97e8bb6c77a11e100b797e532c441cfe146cb2a4955985fa2965` | `da40e8c015934b67ea6c753d402a2d16680407618e6c29f29bf3a98b15728673` | `91cbe9c7de4799ed426585b2b49a659728883508f54961d87fed8090bb77f624` |
| typecheck | `fr_b10_byrole_exact_typing_resume/typecheck.*` | PASS / 0 SKIP | `d322c1628d5a74d02fdf07fc8cc343257adc65a075683cbd8a3cee7a1c0dccea` | `d2297a8e6a87dc32114bcda90f5c007ec0f1b287e38f677de0314e929ea78294` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| build | `fr_b10_byrole_exact_typing_resume/build.*` | PASS / 0 SKIP | `5e478cb1804143310dd386dd1123910fc4b53d0276566ace540e4c7bc9e38049` | `f92273bd530f6449e1204d665f6fc2d2c0945996f7c5ef7d788b3627d6db75d0` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The typecheck/build/focused manifests each record source SHA `6ee91612`; Rust records repository SHA
`dc564575`. All accepted commands ran once in their own immutable raw base, with exit 0 and retry 0.

## Feature contract matrix

| Test ID | Accepted contract |
|---|---|
| FT-B10-001 | assign/remove through App → client → command → SQLite, stable item identity and idempotence |
| FT-B10-002 | canonical query, Unicode normalization, partial match, empty query, and local-only behavior |
| FT-B10-003 | rename, duplicate merge, idempotence, and empty/invalid rejection without metadata corruption |
| FT-B10-004 | v1→v2→v3→v4 migration, reopen/restart persistence, tag restoration, and original/sidecar separation |

The repository migration advances one version per transaction: v1 creates the base metadata tables, v2 adds
favorites, v3 adds memo/history/rating, and v4 adds `tags`, `item_tags`, and their indexes. The accepted Rust
evidence confirms the v1/v2/v3 data-preservation expectation, v3-to-v4 tag migration, repeated open, restored
assignment, and original/sidecar byte equality. No migration step promotes a lower marker directly to v4.

## CoDD and environment boundary

The inherited approved structural reference is recorded without rerun:

| Raw | Result | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 |
|---|---|---|---|---|
| CoDD scan | process PASS, 58 nodes / 120 edges | `d5b843479ee8a5635bd6aa92678144b67813c6f87c1141177f61d2dec2554384` | `428e31b7481958f2c90a66a3d8ed04b4a681834a9f886951e20db732106f9fc4` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| CoDD check | process PASS, red failures 0 | `a1cf36608fe80076dce202252b0dbd6387f1b717711afb914a635ed32681de6f` | `0c264281dd7e2b56db04817e83ebe28b851f000b8f4e643f62348967f59715b7` | `ff63d03aa6cd827fa8efdda2b33e28428e263010bce88bd89b3a9b8bae719b37` |
| CoDD verify | `INCOMPLETE / NOT APPLICABLE`（非PASS） | `93f6aeef90bfacde5a7f1f76eddbbdb1510dc83adb7f97fd3739069acb7685a6` | `a316eb93fd73616896c371b3debd777400e5a77db2ff97366f4b8461f6f4231c` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

CoDD verifyの生値は `3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、verification tests
`0 PASS / 0 FAIL / 0 SKIP / 0 total`である。Lord承認範囲の例外は
`deployment_completeness`、`user_journey_coherence`、`environment_coverage`の構造的SKIPだけであり、
`task_completion`のVacuousは別途開示し、PASS数へ加算しない。functional testのSKIPを例外扱いしていない。

## Rejected roots（履歴のみ）

次の失敗rawは全て不変保存し、accepted PASS証跡として再利用していない。

- Feature Laneは初回FAIL停止とredo上限1でfallbackし、normal workflowへ移行した。Feature Laneの状態・時刻を
  accepted PASSへ読み替えていない。
- `fr_b10_tag_management/measurement/frontend-focused.*`: 初回 `0 PASS / 4 FAIL / 0 SKIP`（thumbnail fixture `data:null`）。
- `fr_b10_tag_management/measurement/frontend-focused-redo1.*`: `2 PASS / 2 FAIL / 0 SKIP`（非スコープ`findByText`重複）。
- `fr_b10_exact4_normal_workflow_rca/measurement/frontend-focused-exact4.*`: `0 PASS / 4 FAIL / 0 SKIP`（implicit listitem name誤認）。
- `fr_b10_exact_named_controls_repair/measurement/frontend-focused-exact4.*`: `3 PASS / 1 FAIL / 0 SKIP`（禁止されたcount-only assertion）。
- `fr_b10_canonical_downstream_gates/windows-offline-canonical.*`: `77 PASS / 1 FAIL / 0 SKIP`（FR-B07 v2 marker期待値）。
- `fr_b10_schema_v4_migration_repair/typecheck.*`: exit 2、`exact` propertyに関するTS2769が9件。
- `fr_b07_reject_codd_draft_restore_gate/draft_*`: REJECTED_UNCOMMITTED_DRAFTの捕捉・撤回記録であり、CoDD verify raw自体も
  structural non-PASSとしてのみ参照する。

`fr_b10_ft004_persistence_semantic_repair/`のsource SHA `7703e916`に束縛された中間focused PASSは、
typing-only変更後の最終source SHA `6ee91612`によりsupersededとなった。最終受入値には使用していない。

旧rootの失敗をPASSへ書き換えず、最終focused sourceのtyping-only修正後に取得したaccepted rawだけを
最終値として扱う。

## 最終差分境界

project diffは機能/test 6 pathと本四文書4 pathのexact 10 path、contamination 0、staged path 0である。
`git diff --check`を確認し、commitとpushは行わず、Gunshiのcomplete diff QCを依頼する。
