# Project workflow

This project uses CoDD (Coherence-Driven Development) as the source of truth
for keeping requirements, design, implementation, and tests coherent.
These instructions apply to work in this repository. Keep changes scoped to
the user's request and preserve unrelated working-tree changes.

## CoDD commands

Run CoDD from the project-local environment:

```bash
.venv/bin/codd <command>
```

On Windows, use the native PowerShell runners instead of the Linux environment.
They default to the project-local `.venv-windows` environment:

```powershell
.\scripts\run-codd-windows.ps1 scan
.\scripts\run-codd-windows.ps1 check
.\scripts\run-codd-windows.ps1 verify
```

When the repository is on a Windows filesystem, including a `/mnt/<drive>/...`
path invoked from WSL, select the Windows-native runner first. Do not probe the
Linux CoDD runner and then repeat the same gate on Windows. For `IMP-004`,
`FUT-C-019`, and `ShortcutOnly`, the formal final command is:

```powershell
.\scripts\verify-feature-windows.ps1 -Feature IMP-004 -RustMode Canonical
```

From WSL, use `scripts/run-feature-verification-wsl.sh IMP-004 -RustMode
Canonical`. The bridge waits for the Windows runner's final JSON sentinel and
uses its recorded exit code; do not treat the initial WSL interop process return
as completion while Windows child processes remain active. During development,
omit `-RustMode Canonical` to use the focused Rust lane with CoDD scan/check but
without the full-suite CoDD verify. Run the canonical lane, including CoDD
verify, once after the final source change.

Before implementing or changing user-visible behavior:

1. Record or update the applicable requirement in `docs/current/requirements.md`.
2. Run `.venv/bin/codd scan`.
3. Inspect the affected artifacts with `.venv/bin/codd impact`.

For documentation, design, code, configuration, or test-only changes, update
the relevant artifact first; do not create a new requirement unless behavior
or acceptance criteria changed. After any tracked artifact change, run scan
and check. For a source or test change, also run the focused test that exercises
the changed behavior:

1. Run `.venv/bin/codd scan`.
2. Run `.venv/bin/codd check`.
3. Run the canonical `.venv/bin/codd verify` once after the final executable
   source or test change in the release batch. Do not separately run the full
   platform test runner immediately before that command: CoDD verify already
   invokes the configured aggregate test command.

## Release batches and verification

A single user request that explicitly lists multiple related implementation
tasks is one release batch. Keep its worktree changes together and publish one
commit after the batch's final verification. A later request starts a new batch
after a completed handoff; only combine later requests when the user explicitly
asks to combine them or while the current batch remains in progress.

During a release batch, use focused tests and type checks after each affected
area. After the final source or test change, run the build and the canonical
CoDD scan, check, and verify sequence exactly once. If a gate is retried, record
the reason (a repair or a diagnosed intermittent failure) in the handoff. This
keeps feedback quick without weakening the final release gate.

Do not report a change as complete when a relevant CoDD red gate fails. If a
gate is intentionally not applicable (for example, before CI or tests exist),
state that explicitly in the handoff.

Use the repository's canonical verification entry points where applicable:

- React/TypeScript tests: `scripts/run-tests.sh` (or `npm test` for the
  frontend-only suite).
- TypeScript type checking: `scripts/run-typecheck.sh` (or `npm run typecheck`).
- Rust checks/tests: use the locked Cargo commands documented by the affected
  test or CI workflow.

For Windows-native verification, use `scripts/run-tests-windows.ps1`,
`scripts/run-typecheck-windows.ps1`, and `scripts/run-build-windows.ps1`.

Do not commit generated outputs such as `codd/scan/`, `node_modules/`,
`dist/`, `target/`, or generated fixtures. Commit requirements, design
documents, CoDD configuration, source, and tests when they are part of the
scoped change.

## Automatic publish workflow

When the user explicitly requests an implementation/change to this repository,
the request also authorizes publishing that scoped change after successful
verification:

1. Inspect `git status` before editing and do not include pre-existing unrelated
   changes in the commit.
2. Run the applicable tests, type checks, and CoDD gates. Do not publish when
   a relevant red gate or test failure remains.
3. Review the staged diff for secrets, generated artifacts, and unrelated files.
4. Commit the scoped change on the current branch and push it to its configured
   upstream remote. Never amend or rewrite unrelated commits.

If the change cannot be verified, the working tree contains unrelated changes
that cannot be separated safely, or no upstream is configured, stop before
commit/push and report the exact reason. A request to explain, review, or
diagnose without asking for a change does not authorize publishing. If a
required external environment (for example Windows-only validation) is
unavailable, report it as blocked/not run rather than treating it as passed.
