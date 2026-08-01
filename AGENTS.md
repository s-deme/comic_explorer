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

Before implementing or changing user-visible behavior:

1. Record or update the applicable requirement under `docs/requirements/`.
2. Run `.venv/bin/codd scan`.
3. Inspect the affected artifacts with `.venv/bin/codd impact`.

For documentation, design, code, configuration, or test-only changes, update
the relevant artifact first; do not create a new requirement unless behavior
or acceptance criteria changed. After any tracked artifact change:

1. Run `.venv/bin/codd scan`.
2. Run `.venv/bin/codd check`.
3. Run `.venv/bin/codd verify` when executable code and tests are present and
   the change can affect them.

Do not report a change as complete when a relevant CoDD red gate fails. If a
gate is intentionally not applicable (for example, before CI or tests exist),
state that explicitly in the handoff.

Use the repository's canonical verification entry points where applicable:

- React/TypeScript tests: `scripts/run-tests.sh` (or `npm test` for the
  frontend-only suite).
- TypeScript type checking: `scripts/run-typecheck.sh` (or `npm run typecheck`).
- Rust checks/tests: use the locked Cargo commands documented by the affected
  test or CI workflow.

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
