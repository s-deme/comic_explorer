---
codd:
  node_id: "test:fr-b11-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:fr-b11"
      relation: "verifies"
      semantic: "input-customization-contract"
    - id: "design:screen-flow"
      relation: "verifies"
      semantic: "connected-app-boundary"
---

# FR-B11 入力拡張 — 最終受入結果（cmd_400）

## 判定

FR-B11のkeyboard部分はsemantic gateを受理する。FT-B11-001（remap/conflict/reset）、
FT-B11-004（keyboard fallback/focus/viewer boundary）、FT-B11-005（restart/accessibility/default
recovery）は、production Appと既存settings・viewer/navigation境界に接続したfocused exact3で
3 PASS / 0 FAIL / 0 SKIPである。FT-B11-002 touchとFT-B11-003 gamepadは実機観測ができず
`BLOCKED_UNMEASURED`であり、PASS/SKIPへ加算しない。

IMP-004でFT-B11-006をWindows WebView2 release executableで実行し、remap、conflict拒否、
Viewer command、restart復元、reset、原本差分0をPASSした。製品ゲートは既定`+`を無効と
判定して保存を拒否するRust validatorの欠陥を検出し、修正後はWindows Rust 79 unit +
1 processがPASSした。これにより`FUT-C-019`単体は `Implemented / PASS` とする。

したがってFR-B11の総合状態は、touch/gamepadのみが残るため `Partial / BLOCKED` である。
UIA/screen-reader/DPI、OS syscall、touch/gamepad hardwareの
測定済みPASSへ昇格しない。IMP-004のWindows-native CoDD scan/check/verifyはすべて
exit 0である。

## 実装範囲

keyboard command mappingは次の既存経路へ接続されている。

- `src/features/input/shortcuts.ts`: shortcut normalization、default/fallback、conflict拒否、reset、focus guard。
- `src/App.tsx`: shortcut settings/help UI、local settingsの復元・保存、production commandとの接続。
- `src/features/viewer/Viewer.tsx`: keyboard fallbackとViewer/navigation境界。
- `src/features/library/client.ts`、`src-tauri/src/application/mod.rs`、
  `src-tauri/src/state/repository.rs`、`src-tauri/src/lib.rs`: settings command・永続化・既定値復元。
- `src/App.fr-b11.test.tsx`: FT-B11-001/004/005の接続focused test。

touch/gamepadのproduct hardware sliceは今回の環境で観測していない。候補性を恒久Rejectedへ変更せず、
解除条件付きの `BLOCKED_UNMEASURED` として保持する。

## Accepted evidence

accepted evidence rootは次のとおりであり、rawとmanifestは不変参照する。

- focused exact3、App回帰39: `queue/reports/evidence/cmd_400/fr_b11_normal_canonical_measurement/`
- Windows offline Rust: `queue/reports/evidence/cmd_400/fr_b11_borrow_order_fix_resume/`
- typecheck、最終focused exact3、build: `queue/reports/evidence/cmd_400/fr_b11_branded_identity_type_resume/`

最終keyboard source manifestは
`fr_b11_branded_identity_type_resume/source-sha.tsv`で、manifest SHA-256は
`553b821a818756c1f260caef7443cd59968c23c776a2d9bee4743df84e426751`である。最終の機能/test
8 pathに対応するsource SHAは次のとおりである。

| Source path | Final source SHA-256 |
|---|---|
| `src-tauri/src/application/mod.rs` | `437577eda44eddfcc7814cd73bdd435d7475941ef9ecf180f935e04580a0911d` |
| `src-tauri/src/lib.rs` | `3af34e812b38549fecbaa367622a32d6e3eddf8af9327901b039d6cf22370f71` |
| `src-tauri/src/state/repository.rs` | `4723ad335c544a9e7c486ebd3e4dfbb930f37b802fa7c9971f928b939e7af6c0` |
| `src/App.tsx` | `7414ef03ff0157f5a93d389b425e53b4a08658737b6532fe5b08c56d63218865` |
| `src/features/library/client.ts` | `1bcb2cf89158be86ffdc3cddd27b46fe553b865131819a3278a06d797b6b3c76` |
| `src/features/viewer/Viewer.tsx` | `af6e4a53c371fc72fb08854d175c559c1b25805391f9cbf5575dfddca5d74fe7` |
| `src/features/input/shortcuts.ts` | `04d8fa0f8eef03ad49a8cabb171d9169aef3e53bfa3fe035de67ae52281319af` |
| `src/App.fr-b11.test.tsx` | `f58e45d04ddaab3d2e4c0ef376ee5b16f5208c7d66dc9fdd70fe6a6bef78633a` |

The accepted gate ledger is:

| Gate | Accepted raw | Result | Manifest SHA-256 | Stdout SHA-256 | Stderr SHA-256 | Source binding |
|---|---|---|---|---|---|---|
| focused exact3 | `fr_b11_branded_identity_type_resume/focused-exact3/focused.*` | 3 PASS / 0 FAIL / 0 SKIP | `5289f6bc4187fadd4cc6beed520d5e07bdd1e6c872700c9b19af5bb09e6eae34` | `cc184f06922bc9a4c4cd0ec2a9fad2a16978c006d305b85cbb839203122f6455` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | final source manifest `553b821a818756c1f260caef7443cd59968c23c776a2d9bee4743df84e426751` |
| App regression | `fr_b11_normal_canonical_measurement/app-regression/app.*` | 39 PASS / 0 FAIL / 0 SKIP | `1b48c4e3ac7f87c5f1a4caf48a9914bbefb0c33ba14489e755f667cf95313041` | `896da8cfa25a1272f7cd4fc4f744a1b85c3c5566be9f2d13aaa244c90cc18175` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | accepted normal-C0 source manifest `53f12fce74a3bb74dec5bc12d08bd8b20ec1b6aa1f4f74d00d34562eef80bab0` |
| Windows offline Rust | `fr_b11_borrow_order_fix_resume/windows-wrapper/wrapper.*` | 78 unit + 1 process PASS / failed 0 / ignored 0 / SKIP 0 | `daf27947e37490c9393b507bbdd7690fa23cd5a734ef3e20b4d81787ff18f45c` | `2d5e7e3236e9fa120e68b1de9176d246101ed7ebfd28441573d8918e47b5705d` | `ff512d60e44af0af84c4cc16e80c5f135498501739857d007878566f6af58f47` | accepted Rust source manifest `24a98d7c8f3d0d31865d7408a5bcbc9f464061f11c1fdcb6931299adb94d4aa7` |
| typecheck | `fr_b11_branded_identity_type_resume/typecheck/typecheck.*` | PASS / 0 SKIP | `9ba046b2db9067b49bfc9fe61325c67592fe3d6b90842b935febdf8ddbdc74be` | `d2297a8e6a87dc32114bcda90f5c007ec0f1b287e38f677de0314e929ea78294` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | final source manifest `553b821a818756c1f260caef7443cd59968c23c776a2d9bee4743df84e426751` |
| build | `fr_b11_branded_identity_type_resume/build/build.*` | PASS / 0 SKIP | `b5d702c4467bd4d863c79a115c73bbc4b4592b14eed0822e2485442e5092f5e8` | `e09e691a29cc48610b61d7137ef18f40301e089bd42f72a6a25c4b0173759bf5` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | final source manifest `553b821a818756c1f260caef7443cd59968c23c776a2d9bee4743df84e426751` |

The App regression raw was accepted from the normal-C0 source manifest before the final typing-only test
fix; it tests unchanged `src/App.test.tsx` and was not rerun. The Rust raw was accepted after the borrow-order
fix and before that same frontend typing-only fix; Rust sources are byte-invariant across the frontend fix.
The final focused/typecheck/build raw binds the final source manifest above. No stale or superseded raw is
treated as a final PASS.

## Feature contract matrix

| Test ID | Accepted contract | Result |
|---|---|---|
| FT-B11-001 | production App → shortcut mapping → settings command: remap, conflict rejection, reset, local-only behavior | semantic ACCEPT |
| FT-B11-002 | product touch input → viewer command: gesture and boundary behavior | `BLOCKED_UNMEASURED`; not counted |
| FT-B11-003 | product gamepad input → viewer command: mapping and disconnect recovery | `BLOCKED_UNMEASURED`; not counted |
| FT-B11-004 | App/viewer keydown → focus guard → navigation/viewer: fallback, focused input suppression, Viewer boundary | semantic ACCEPT |
| FT-B11-005 | settings persistence → restart → accessible help: persistence, safe default recovery, accessible name/label | semantic ACCEPT |
| FT-B11-006 | Windows WebView2 release executable → help UI → Viewer → restart | PASS（remap/conflict/Viewer/restart/reset、原本差分0） |

The focused exact3 output contains only FT-B11-001, FT-B11-004, and FT-B11-005. The unavailable device
slices are not represented as skipped tests and are not added to the PASS denominator.

## Rejected roots（履歴のみ）

The following attempts remain immutable history and are not accepted evidence:

- **false C0 / Feature Lane stop:** the C0 selected `cargo.exe` but fixed the canonical command to bare
  `cargo test`; the selected runnable path was not invoked and Rust exited 127. The focused/App output
  (`3 PASS / 0 FAIL / 0 SKIP`, `39 PASS / 0 FAIL / 0 SKIP`) lacked source binding and is rejected. Rejected
  manifests: focused `036511357e5bed42ef6ce7b092fd9ff65209d11527e38878ba7f8ab6359632e7`, App
  `12af4cde0a881b6d8c59c6782c8263bb42b4980c77a7f88576ca023a2e10d8b0`.
- **rustfmt failure:** `fr_b11_normal_canonical_measurement/windows-wrapper/wrapper.manifest.yaml`,
  manifest SHA `3546cc48abe9d5ea834558ba5aa8bfdb179365833de5339e929c34dbb393abc1`, exit 1 at
  `cargo_fmt_check`; cargo check/test did not start. It is not a Rust PASS.
- **E0382 borrow-order failure:** after rustfmt, `src-tauri/src/application/mod.rs` moved
  `settings.reading_direction` before borrowing `settings` for `shortcuts_for_settings(&settings)`.
  The failed wrapper raw had stdout SHA `806cbd7aa7cfc3c37e5ffaf3c038eddaddb5d7e2abd8c7bb4e69e876f15f2e65`
  and stderr SHA `c4f1ed403507e9570204c323c1471cf06fb6a4ab8f4288b348c064e3bd6cfd15`. The one-variable
  evaluation-order fix was required before the accepted Rust raw.
- **TS2322 branded identity failure:** the pre-fix metadata mock returned a plain string for the branded
  `ItemMetadata.itemIdentity` field. Its rejected typecheck raw had stdout SHA
  `719e86b9ddf8926bed08ed64ff1ec6e9553ab38c5e82ea0e81f3add97e684044`. The final type-only cast to the
  existing `ItemMetadata["itemIdentity"]` contract was accepted; no `as never`, production semantic, or
  assertion change was used.

Rejected roots are disclosed to preserve causal history. None is relabeled as PASS, and none is used to
inflate the accepted test counts.

## CoDD and environment boundary

The historical inherited structural reference is
`queue/reports/evidence/cmd_400/fr_b07_reject_codd_draft_restore_gate/`. It records CoDD verify as
`INCOMPLETE / NOT APPLICABLE` with raw values `3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`
and verification tests 0. The only exception is the approved structural trio
`deployment_completeness`, `user_journey_coherence`, and `environment_coverage`; `task_completion` VACUOUS
is disclosed separately, and functional-test SKIP has no exception. IMP-004 supersedes that historical
keyboard structural result with Windows-native scan/check/verify exit 0.

Windows WebView2 keyboard product UIはFT-B11-006でPASSした。UIA/screen-reader/DPI、OS syscall、
touch hardware、and gamepad hardware remain `UNMEASURED / BLOCKED`.

## Final path boundary

The final project inventory is exactly eight functional/test paths plus these four synchronized documents:

Functional/test paths:

1. `src-tauri/src/application/mod.rs`
2. `src-tauri/src/lib.rs`
3. `src-tauri/src/state/repository.rs`
4. `src/App.tsx`
5. `src/features/library/client.ts`
6. `src/features/viewer/Viewer.tsx`
7. `src/features/input/shortcuts.ts`
8. `src/App.fr-b11.test.tsx`

Synchronized documents:

1. `docs/testing/fr-b11-results.md`
2. `docs/product/feature-status.md`
3. `docs/product/feature-roadmap.md`
4. `docs/requirements/input-customization-requirements.md`

The resulting exact path count is 12. The task report records the post-sync SHA inventory, read-back,
`git diff --check`, untracked whitespace check, staged-path check, and unrelated-path check. Existing
functional paths remain owned by the implementation task; this task edits only the four documents above.
No commit or push is allowed before Gunshi complete diff QC ACCEPT.
