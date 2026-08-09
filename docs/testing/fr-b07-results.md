---
codd:
  node_id: "test:fr-b07-results"
  type: test
  status: active
  confidence: 0.95
  depends_on:
    - id: "req:fr-b07"
      relation: "verifies"
      semantic: "reading-metadata-contract"
    - id: "design:screen-flow"
      relation: "verifies"
      semantic: "connected-app-boundary"
---

# FR-B07 読書情報 最終結果

## 判定

機能証跡は `ACCEPTED` としてSHA参照する。frontend focused、App回帰、Windows offline Rust、
typecheck、buildは受理済みrawを再実行していない。CoDD scan/check/verifyは復元後の既存rawを各一回
だけ参照し、exit 0・red 0を記録するが、verifyの構造値に3 SKIP・1 VACUOUS・verification tests 0
があるため、CoDDとcmd_400 aggregateは `INCOMPLETE / NOT APPLICABLE` であり、PASSへ加算しない。
Windows WebView2 native product gateは `BLOCKED_UNMEASURED` のままであり、local evidenceで
代替しない。したがってFR-B07の台帳状態は `Partial / BLOCKED` とする。

## 実測範囲と接続境界

- 採用対象は `FUT-C-023`（memo）、`FUT-R-004`（閲覧履歴）、`FUT-R-005`（評価）。
- `FUT-D-005`（未読・読書中・読了）は未決定の別トラックであり、本結果に含めない。
- metadataはlibrary root外のapp-local SQLiteだけへ保存し、原本、書庫、画像、sidecar、管理fileへ
  書き込まない。cloud sync、外部書誌、telemetry、network送信は機能の前提にしない。
- accepted frontend exact5/typecheck/build evidence root:
  `queue/reports/evidence/cmd_400/fr_b07_node_fs_type_final_resume`。
- accepted App regression evidence root:
  `queue/reports/evidence/cmd_400/fr_b07_production_open_seam_semantic_redo`。
- accepted Rust exact5/full evidence root:
  `queue/reports/evidence/cmd_400/fr_b07_rustfmt_final_resume`。
- restored CoDD evidence root:
  `queue/reports/evidence/cmd_400/fr_b07_reject_codd_draft_restore_gate`。

## Connected evidence matrix

| Test ID | 契約 | 実測状態 |
|---|---|---|
| FT-B07-001 | memo保存、編集、clear、再表示 | PASS |
| FT-B07-002 | production open成功境界からhistory APIへ接続し、failed/empty/cancelledを記録せず、決定順序と作品row重複0 | PASS |
| FT-B07-003 | rating 1/5、未設定、invalid拒否 | PASS |
| FT-B07-004 | v2→v3 migrationと再起動後の全値 | PASS |
| FT-B07-005 | reading position分離、実original/library snapshot・hash差分0、`library.index`不変 | PASS |

frontend focusedは変更後source SHA
`f7031d69365005301961896db87da20ace8b9c5086531c6ad7501e9b68aa9c83`の上記exact5を一回選択し、
5 PASS、0 FAIL、0 SKIP、duplicate 0、exit 0である。App回帰は1 file・39 PASS、0 FAIL、0 SKIP、
direct web adapter calls 0、exit 0である。FT-B07-002はproduction `open_comic`へ接続した
open-history seamで、成功したcurrent-generation・非空openだけを一行記録し、failed/empty/cancelledは
0行となることを履歴表示まで観測した。FT-B07-005は実一時original/library fixtureを用い、metadata、
history、rating、reading-position操作の前後でbyte/SHA snapshotを比較し、original、library、
`library.index`の差分0を観測した。

## Accepted raw ledger

受理済みrawのSHAは測定時点の不変参照である。各行の `run_count` は1、retryは0であり、accepted
frontend rawは再実行していない。

| command | status | exit | 件数 / SKIP | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 |
|---|---|---:|---|---|---|---|
| frontend_ft_b07_focused_json | ACCEPTED_IMMUTABLE_REFERENCE | 0 | FT-B07-001〜005 exact5; 5 passed; 0 failed; 0 skipped; duplicate 0; source SHA `f7031d69365005301961896db87da20ace8b9c5086531c6ad7501e9b68aa9c83` | `e8b2f80dc8a888d6b1d30d77a92de91a37924666d70ae6b0ab1ce41acb5f96e5` | `fa650fbaf4ff41c316ece825d4eb854c158ac34186792fb7b108e082bc50c82c` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| frontend_app_regression_console | ACCEPTED_IMMUTABLE_REFERENCE | 0 | 1 file; 39 passed; 0 failed; 0 skipped; direct web adapter calls 0 | `61e315c69353832f1c5bd0d3654946ef00f9e3282c50b0ca34ea44589ec9ef22` | `08a87b125f0e0a53a0bd2e2c716e6f758e344ff6b1906c2bbc244c725354c840` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| rust_fr_b07_exact5 | PASS | 0 | FR-B07 exact5; 5 passed; 0 failed; 0 ignored; 0 skipped | `cfda35406b78a9f54b9802e778742662bd8e52cb84db23949891f1e6a1b89233` | `183e3903947eb258abe21709870766315345cf246b5b78479fed95e509303a10` | `ae905bcf7333addf0b0de89c426235ed167ef5e4292bd2cf66e3430236751265` |
| canonical_windows_offline_rust_wrapper | PASS | 0 | 66 unit + 1 process; 67 passed; 0 failed; 0 ignored; 0 skipped | `8570b03c8b8906d4f7a4abc80ddb0f62e2169aacbcdc42aa1ef2b9ce35813a36` | `d61c8d92af8474b90aa2d4aa39adbc8f0f1b383e025a4d7b2306be3128c2312c` | `ada375b0eba1d9560e9bfaf926b522177d4d257295c7aeea8c15d4f8ce3f4734` |
| typecheck | PASS | 0 | executed; 0 skipped | `f9e29543ebc74c92a00c457eec8d972600407e264670331143f4a09153b0948d` | `d2297a8e6a87dc32114bcda90f5c007ec0f1b287e38f677de0314e929ea78294` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| build | PASS | 0 | executed; 0 skipped | `54fccdea2a0a31370659e48ad9d605bcf45c7a560e8c8a35c1cbe9b8edd97954` | `5145cd83897a30cbd37916d882fffa259f125353c0115cf3d3a3b774d733eedc` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Rust exact5のテスト名は次のとおりである。

- `fr_b07_memo_crud_clear_and_reopen`
- `fr_b07_history_deterministic_order_and_dedup`
- `fr_b07_rating_boundaries_and_invalid_rejection`
- `fr_b07_v2_migration_preserves_old_values_and_is_idempotent`
- `fr_b07_reading_position_separation_survives_metadata_crud`

canonical Rust wrapperは `CARGO_NET_OFFLINE=true` で実行され、cargo fmt check、cargo check locked、
cargo test lockedをPASSとした。これはWindows Rust toolchainの証跡であり、Windows WebView2 native
product UIの実機gateを満たすものではない。

## CoDD raw ledger

CoDD 3.37.0の復元後rawを参照した。scan/check/verifyは各 `attempt=1`、`run_count=1`、retryなし、
overwriteなしである。exit 0とred 0はプロセス・red gateの事実であり、構造的SKIP/VACUOUSをPASSへ
昇格する根拠ではない。

| command | status | exit | raw summary | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 |
|---|---|---:|---|---|---|---|
| codd_scan | PASS process | 0 | 58 nodes; 120 edges; red 0 | `d5b843479ee8a5635bd6aa92678144b67813c6f87c1141177f61d2dec2554384` | `428e31b7481958f2c90a66a3d8ed04b4a681834a9f886951e20db732106f9fc4` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| codd_check | PASS process | 0 | red gate failures 0; advisory 4; task_completion vacuous | `a1cf36608fe80076dce202252b0dbd6387f1b717711afb914a635ed32681de6f` | `0c264281dd7e2b56db04817e83ebe28b851f000b8f4e643f62348967f59715b7` | `ff63d03aa6cd827fa8efdda2b33e28428e263010bce88bd89b3a9b8bae719b37` |
| codd_verify | INCOMPLETE / NOT APPLICABLE | 0 | 3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS; verification tests 0 PASS / 0 FAIL / 0 SKIP / 0 total | `93f6aeef90bfacde5a7f1f76eddbbdb1510dc83adb7f97fd3739069acb7685a6` | `a316eb93fd73616896c371b3debd777400e5a77db2ff97366f4b8461f6f4231c` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

verifyの3 SKIPは `deployment_completeness`、`user_journey_coherence`、`environment_coverage`、
1 VACUOUSは `task_completion` である。verification node totalは0であり、3 SKIPと1 VACUOUSは
`INCOMPLETE / NOT APPLICABLE` の生値として開示する。これは機能focused testのSKIP例外ではない。
CoDD rawは `codd/codd.yaml` 復元後の既存測定であり、最終文書同期後に再実行していない。raw scan時点では
文書同期前のため `docs/testing/fr-b07-results.md` のCoDD frontmatter欠落警告を含むが、今回のfrontmatter
追加は文書同期であり、CoDD再実行や構造値のPASS化を意味しない。

## 不採用CoDD草稿の履歴

過剰CoDD contract草稿は製品出力へ採用せず、project外証跡へ保存したうえで撤回した。

- disposition: `REJECTED_UNCOMMITTED_DRAFT`
- capture manifest SHA-256: `d82880b1c2d9381e3f445b6ba0f45d81341cb046d12b43c72f34597017e0b7f3`
- disposition SHA-256: `1e0f67db1baa14b409b3c035f57e15927c50528c33a9fa738503a3cbbe0febf6`
- `codd/codd.yaml` task-before/after SHA-256: `4221c7a45d6a74e62ee469000262addda4450fea433fe9ed35ed3e2c59348ccd`（一致）
- removed draft paths: 6; never-present `tests/e2e` candidates: 2; post-restore draft paths: 0
- accepted functional path setにはdraft、plugin、contract、deploy、smoke、e2e成果物を含めない。

## Scope and safety ledger

最終worktreeの機能pathは11件であり、draft contaminationは0、staged pathは0である。

1. `docs/product/feature-roadmap.md`
2. `docs/product/feature-status.md`
3. `src-tauri/src/application/mod.rs`
4. `src-tauri/src/lib.rs`
5. `src-tauri/src/state/repository.rs`
6. `src/App.test.tsx`
7. `src/App.tsx`
8. `src/features/library/client.ts`
9. `docs/requirements/reading-metadata-requirements.md`
10. `docs/testing/fr-b07-results.md`
11. `src/App.fr-b07.test.tsx`

今回の最終同期で編集する文書は1、2、9、10の4 pathだけである。上記以外の7機能pathはbyte不変
保全する。原本/library snapshot差分、library管理file、network、commit、pushは0である。
OS syscall monitorは別gateとして `NOT_RUN_SEPARATE_GATE` と開示し、local-only境界の証跡を過大主張しない。

## 最終diff QC handoff

同期後の11path exact diff/hash/statusは
`/home/yaman/tools/multi-agent-shogun/queue/reports/evidence/cmd_400/fr_b07_final_docs_sync_diff_qc`
へ保存し、Gunshiの最終diff QCへ提出する。機能raw、Rust、typecheck、build、CoDDの再実行、retry、
commit、pushは行わない。
