---
codd:
  node_id: "req:fr-b09"
  type: requirement
  status: approved
  confidence: 0.90
  depends_on:
    - id: "req:mvp-requirements"
      relation: "derives_from"
      semantic: "scope"
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "priority"
---

# FR-B09 Library Diagnostics

FR-B09 is a local, read-only diagnostic vertical slice. It reports changes,
duplicate works, and corrupt ZIP/CBZ archives without writing to the library
root, an archive, an image, or a sidecar file. The report is held by the
connected application boundary and is safe to discard and recreate.

## Executable C0

The focused contract is exactly five cases. A focused run must select all five
IDs once; duplicate IDs, an omitted ID, and a skipped case are failures.

```yaml
schema: fr-b09-c0/v1
selected_count: 5
focused_ids:
  - FT-B09-001
  - FT-B09-002
  - FT-B09-003
  - FT-B09-004
  - FT-B09-005
canonical_commands:
  windows_rust: "cmd.exe /d /s /c E:\\script\\comic_explorer\\scripts\\run-rust-check.cmd"
  frontend: "npm run test -- --run src/App.fr-b09.test.tsx"
  typecheck: "npm run typecheck"
  build: "npm run build"
raw_destination: "/home/yaman/tools/multi-agent-shogun/queue/reports/evidence/cmd_400/fr_b09_callback_typing_final_resume"
accepted_evidence_roots:
  - "/home/yaman/tools/multi-agent-shogun/queue/reports/evidence/cmd_400/fr_b09_callback_typing_final_resume"
  - "/home/yaman/tools/multi-agent-shogun/queue/reports/evidence/cmd_400/fr_b09_ft005_normal_workflow_repair"
  - "/home/yaman/tools/multi-agent-shogun/queue/reports/evidence/cmd_400/fr_b09_diagnostics_rustfmt_resume"
```

The Windows Rust command is the existing project wrapper; it remains the
canonical source of the Windows offline `cargo fmt --check`, `cargo check
--locked`, and `cargo test --locked` sequence. The frontend command is the
dedicated connected App slice. Typecheck and production build are run once at
the batch gate after the focused and App checks. No network, install, decoder,
or dependency change is part of this contract.

## Result model and hash policy

Each scan returns a versioned in-memory snapshot and findings. An entry's path
identity is its normalized library-relative path. Its content hash is a stable
read-only FNV-1a pair rendered as 32 lowercase hexadecimal characters; folder
hashes are deterministic hashes of sorted child names, kinds, sizes, and child
hashes. The hash is used for duplicate identity and change comparison, while
mtime and size remain observable metadata. The scanner never persists a
snapshot beside the source tree.

Finding statuses are `added`, `changed`, `missing`, `duplicate`, and `corrupt`.
Severities are `info`, `warning`, and `error`. Added entries are informational,
changed/missing/duplicate entries are warnings, and corrupt ZIP/CBZ entries are
errors. A corrupt archive is isolated to its own finding and does not prevent
other entries from being scanned.

## Focused acceptance

| ID | Connected observation |
|---|---|
| FT-B09-001 | A second scan reports added, changed, and missing path identities against the prior snapshot. |
| FT-B09-002 | Two equivalent archive/folder contents share a stable content identity and are reported as duplicates; distinct content is not reported. |
| FT-B09-003 | Existing ZIP/CBZ enumeration classifies a corrupt archive as an error without extraction or source-tree mutation. |
| FT-B09-004 | The production report reaches the App and renders mixed findings with their status and severity. |
| FT-B09-005 | Cancellation returns a cancelled response; the connected App leaves loading=false, renders the cancelled notice, suppresses stale results (stale=0), and retry uses a new generation. A real folder and ZIP/CBZ fixture has exact equality for path, bytes, SHA, and archive entry set before and after cancel/retry. |

Diagnostics has no file write, delete, rename, extraction, network, or sidecar
operation. Existing ZIP/CBZ parsing is reused; future archive formats remain
outside FR-B09.

## Final accepted evidence (cmd_400)

The final focused source SHA is
`6701c3465e24a481e899a07d1aa5e41b8dd30881962c8f9ab68dead99626c0fe`.
The diagnostics Rust source SHA is
`55ffa76c9790b8df0589fbc9e0c43d14e632f01eae06e2b923fd59ff327275cc`.
The accepted functional evidence is referenced without rerunning any focused,
regression, Rust, typecheck, build, or CoDD command.

| Gate | Evidence root/file | Result | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 |
|---|---|---|---|---|---|
| frontend exact5 | `queue/reports/evidence/cmd_400/fr_b09_callback_typing_final_resume/focused-ft-b09-exact5.*` | 5 PASS / 0 FAIL / 0 SKIP | `88d8dd15f3fd1c81be344fbc6fcebeaba0af407c527b9b4a6f9f612f59c40587` | `768f6a0a53adc17991a10330344683aa616a3d1a56be03b192f97219c4189bfe` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| App regression | `queue/reports/evidence/cmd_400/fr_b09_ft005_normal_workflow_repair/app-regression.*` | 39 PASS / 0 FAIL / 0 SKIP | `b48e8bcc41b56a78eccd17c7a9f98c392639d3d9778487aed34709354a021f05` | `6d5de88aacf157bcddd42d42666130742ca20aea91a8b87dad45ee10b18f844a` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Windows full canonical | `queue/reports/evidence/cmd_400/fr_b09_diagnostics_rustfmt_resume/windows-full-canonical.*` | 74 unit + 1 process PASS / failed0 / ignored0 / SKIP0 | `b7a5d353a0cfd2f644abd34149a981eb375229362e78d1c94ec674456c1218b3` | `ab2ac9e49fd58008d826665914faf8b7f21dd256dd6edb55469c1ca77d80ef6d` | `c3b80068c26dca16ac167f6e78bd7e8f233c03f70973b4c47145e54a5e50beab` |
| typecheck | `queue/reports/evidence/cmd_400/fr_b09_callback_typing_final_resume/typecheck.*` | PASS / SKIP0 | `837d3079151c3534f711234b9e9e35467377f46afbe15f51d8f33fe7a6e63a2f` | `fb100a56d0a368d58a22d86a65c113d01397c7923af4bfb6cfb941cc3c9bce3a` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| build | `queue/reports/evidence/cmd_400/fr_b09_callback_typing_final_resume/build.*` | PASS / SKIP0 | `5dca2635c63d5bfc9ae89bf439f3aacfca99658e3691d2cef3b3fa8ac837ebb2` | `eecee5cbb9f91cabc738d6047d78c1084b2056a44ec69cef955e6013cf0b8387` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The accepted Rust raw includes the real folder+CBZ SourceState assertion for
FT-B09-005: path, bytes, SHA, and entry set are exactly equal before and after
cancel/retry. The frontend FT-B09-005 raw includes cancelled response,
loading=false, notice, stale=0, and retry-generation observations.

## Structural and platform boundary

The approved cmd_400 CoDD structural exception remains non-PASS. The existing
raw reports `3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`, with
verification tests `0 PASS / 0 FAIL / 0 SKIP / 0 total`. The three structural
SKIP checks are `deployment_completeness`, `user_journey_coherence`, and
`environment_coverage`; `task_completion` is VACUOUS. These raw values are
disclosed as `INCOMPLETE / NOT APPLICABLE` and are not added to PASS counts.

Native Windows WebView2 product UI remains `BLOCKED_UNMEASURED`; offline Rust
evidence does not promote it to PASS. OS syscall-complete observation remains
a separate `UNMEASURED / BLOCKED` gate. The former Feature Lane fallback and
rejected evidence roots are historical records only, not accepted PASS evidence.
