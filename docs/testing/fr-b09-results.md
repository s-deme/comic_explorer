---
codd:
  node_id: "test:fr-b09-results"
  type: test
  status: active
  confidence: 0.95
  depends_on:
    - id: "req:fr-b09"
      relation: "verifies"
      semantic: "library-diagnostics-contract"
    - id: "design:screen-flow"
      relation: "verifies"
      semantic: "connected-app-boundary"
---

# FR-B09 Library Diagnostics — final accepted results

## 判定

FR-B09の機能semantic gateはGunshi QCで `ACCEPT` である。実装状態と検証状態の台帳は、
CoDD構造ゲートとWindows WebView2 native product UIが未完了・未測定のため
`Partial / BLOCKED` とする。frontend、App回帰、Windows Rust、typecheck、buildのaccepted rawは
不変参照であり、今回それらを再実行していない。

## 範囲と接続契約

- 対象は `FUT-C-030`（added/changed/missing変更検出）、`FUT-C-031`（duplicate identity）、
  `FUT-C-032`（corrupt ZIP/CBZ）である。
- 診断はread-onlyであり、library root、folder、ZIP/CBZ、画像、sidecar、管理fileへ書込み、
  delete、rename、extractを行わない。networkも機能契約に含めない。
- focused source `src/App.fr-b09.test.tsx` の最終SHAは
  `6701c3465e24a481e899a07d1aa5e41b8dd30881962c8f9ab68dead99626c0fe` である。
- Rust diagnostics source `src-tauri/src/diagnostics/mod.rs` のSHAは
  `55ffa76c9790b8df0589fbc9e0c43d14e632f01eae06e2b923fd59ff327275cc` である。
- App回帰の `src/App.test.tsx` は `1b23b6de8eff500101da99a480d39b604d24538e3ecfd5c9cceeaf71be4197ba`、
  package/tsconfigはそれぞれ `182ec81caf17b3302401c85f4e1fb4fefa956f400858a243d9cb9d062488e067`、
  `6d00d89c7b11aedea1e8861b32024f3202a95ffda62e506e5ea9c00b22b35891` である。

| Test ID | 直接観測した契約 | 結果 |
|---|---|---|
| FT-B09-001 | 二回目のscanがadded、changed、missingのpath identityを前回snapshotとの差分として報告する。 | PASS |
| FT-B09-002 | 同一contentのfolder/archiveはstable duplicate identityとして表示し、異なるcontentはduplicateにしない。 | PASS |
| FT-B09-003 | corrupt ZIP/CBZをerror findingへ隔離し、extractせずsource treeを変更しない。 | PASS |
| FT-B09-004 | production reportがAppへ接続され、mixed statusとseverityを一つの診断画面で表示する。 | PASS |
| FT-B09-005 | cancelled responseを受けたAppがloading=falseとなりcancel noticeを表示し、stale result 0で新世代retryだけを反映する。Rust側はreal folderとZIP/CBZについてpath、bytes、SHA、entry setをcancel/retry前後でexact equalityとして観測する。 | PASS |

FT-B09-005のfrontendでは、cancelled response、loading解除、cancel notice、旧世代stale結果の抑止、
retry後の新世代結果を同一接続テストで観測した。Rustではreal folderとZIP/CBZのpath、byte列、SHA、
archive entry setをsnapshotし、cancel/retry前後のexact equalityを確認した。

## Accepted raw ledger

各commandはattempt 1、run 1、retry 0である。manifest、stdout、stderrは受理済みrawのSHAを
そのまま参照する。App回帰はcallback typing-only修正前のsourceで受理済みであり、同修正後に
再実行していない。

| Gate | Accepted evidence root / command | exit / 件数 / SKIP | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 |
|---|---|---|---|---|---|
| frontend focused exact5 | `queue/reports/evidence/cmd_400/fr_b09_callback_typing_final_resume/focused-ft-b09-exact5.*` | 0 / 5 PASS、0 FAIL、0 SKIP、duplicate 0 | `88d8dd15f3fd1c81be344fbc6fcebeaba0af407c527b9b4a6f9f612f59c40587` | `768f6a0a53adc17991a10330344683aa616a3d1a56be03b192f97219c4189bfe` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| App regression | `queue/reports/evidence/cmd_400/fr_b09_ft005_normal_workflow_repair/app-regression.*` | 0 / 39 PASS、0 FAIL、0 SKIP | `b48e8bcc41b56a78eccd17c7a9f98c392639d3d9778487aed34709354a021f05` | `6d5de88aacf157bcddd42d42666130742ca20aea91a8b87dad45ee10b18f844a` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Windows offline Rust canonical wrapper | `queue/reports/evidence/cmd_400/fr_b09_diagnostics_rustfmt_resume/windows-full-canonical.*` | 0 / 74 unit + 1 process PASS、failed 0、ignored 0、SKIP 0 | `b7a5d353a0cfd2f644abd34149a981eb375229362e78d1c94ec674456c1218b3` | `ab2ac9e49fd58008d826665914faf8b7f21dd256dd6edb55469c1ca77d80ef6d` | `c3b80068c26dca16ac167f6e78bd7e8f233c03f70973b4c47145e54a5e50beab` |
| typecheck | `queue/reports/evidence/cmd_400/fr_b09_callback_typing_final_resume/typecheck.*` | 0 / executed、SKIP 0 | `837d3079151c3534f711234b9e9e35467377f46afbe15f51d8f33fe7a6e63a2f` | `fb100a56d0a368d58a22d86a65c113d01397c7923af4bfb6cfb941cc3c9bce3a` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| build | `queue/reports/evidence/cmd_400/fr_b09_callback_typing_final_resume/build.*` | 0 / executed、SKIP 0 | `5dca2635c63d5bfc9ae89bf439f3aacfca99658e3691d2cef3b3fa8ac837ebb2` | `eecee5cbb9f91cabc738d6047d78c1084b2056a44ec69cef955e6013cf0b8387` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Windows Rust rawではFT-B09-005 SourceStateのreal folder+CBZ path/bytes/SHA/entry-set exact equalityを
含む74 unitと1 processがPASSした。これはWindows Rust toolchainとoffline canonical wrapperの証跡であり、
Windows WebView2 native product UIの実機観測ではない。

## CoDD rawと限定例外

復元後の既存CoDD rawを参照し、scan/check/verifyをFR-B09のために再実行していない。実rawは
`queue/reports/evidence/cmd_400/fr_b07_reject_codd_draft_restore_gate/` に保存されたcmd_400の
approved structural exception referenceである。

| command | status | exit | raw summary | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 |
|---|---|---:|---|---|---|---|
| codd scan | PASS process | 0 | red 0、58 nodes、120 edges | `d5b843479ee8a5635bd6aa92678144b67813c6f87c1141177f61d2dec2554384` | `428e31b7481958f2c90a66a3d8ed04b4a681834a9f886951e20db732106f9fc4` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| codd check | PASS process | 0 | red gate failures 0、advisory 4 | `a1cf36608fe80076dce202252b0dbd6387f1b717711afb914a635ed32681de6f` | `0c264281dd7e2b56db04817e83ebe28b851f000b8f4e643f62348967f59715b7` | `ff63d03aa6cd827fa8efdda2b33e28428e263010bce88bd89b3a9b8bae719b37` |
| codd verify | INCOMPLETE / NOT APPLICABLE（非PASS） | 0 | 3 PASS、0 red FAIL、1 amber WARN、3 SKIP、1 VACUOUS、verification tests 0 | `93f6aeef90bfacde5a7f1f76eddbbdb1510dc83adb7f97fd3739069acb7685a6` | `a316eb93fd73616896c371b3debd777400e5a77db2ff97366f4b8461f6f4231c` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

CoDD verifyの3 SKIPは `deployment_completeness`、`user_journey_coherence`、`environment_coverage`、
1 VACUOUSは `task_completion` である。これらはLord承認済みのcmd_400構造例外として生値を開示する
だけであり、PASS数へ加算しない。verification tests 0も非PASSである。functional focused testの
SKIPを例外扱いしていない。

## Feature Lane fallbackと却下証跡の履歴

次のrootはFR-B09の受理rawではない。Feature Lane fallback、wrapper起動失敗、typing failureを
履歴として保持し、最終PASS証跡へ再利用しない。

- `queue/reports/evidence/cmd_400/fr_b09_library_diagnostics/` — Feature Lane fallbackのraw。
  canonical manifestがなくguard rejectされたため、機能受入証拠ではない。
- `queue/reports/evidence/cmd_400/fr_b09_ft005_normal_workflow_repair/windows-full-canonical.manifest.yaml`
  — quoted wrapper修正前の起動失敗記録。最終Windows rawではない。
- `queue/reports/evidence/cmd_400/fr_b09_diagnostics_rustfmt_resume/typecheck.manifest.yaml`
  — callback typing修正前のTS2322 failure記録。最終typecheck rawではない。
- `queue/reports/evidence/cmd_400/fr_b09_windows_canonical_resume/` — canonical resumeの停止履歴。

## 未完了の外部境界と保存方針

- Windows WebView2 native product UIは `BLOCKED_UNMEASURED` のままであり、offline RustからPASSへ
  昇格しない。
- OS syscall完全観測は `UNMEASURED / BLOCKED` の別gateであり、今回のlocal functional PASSへ含めない。
- rejected CoDD contract/plugin/deploy/smoke草稿は製品成果へ採用していない。
- 受理済みfunctional raw、CoDD raw、frontend/Rust/typecheck/buildの再実行、retry、commit、pushは
  行わない。最終docs同期後は四文書だけが追加変更対象であり、Gunshi complete diff QCを待つ。
