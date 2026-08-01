# Project workflow

This project uses CoDD (Coherence-Driven Development) as the source of truth
for keeping requirements, design, implementation, and tests coherent.

## CoDD commands

Run CoDD from the project-local environment:

```bash
.venv/bin/codd <command>
```

Before implementing a requested behavior:

1. Record or update the requirement under `docs/requirements/`.
2. Run `.venv/bin/codd scan`.
3. Inspect the affected artifacts with `.venv/bin/codd impact`.

After changing requirements, design, code, configuration, or tests:

1. Run `.venv/bin/codd scan`.
2. Run `.venv/bin/codd check`.
3. Run `.venv/bin/codd verify` once executable code and tests exist.

Do not report a change as complete when a relevant CoDD red gate fails. If a
gate is intentionally not applicable (for example, before CI or tests exist),
state that explicitly in the handoff.

Keep generated scan data under `codd/scan/` out of version control as configured
by `codd/.gitignore`. Commit requirements, design documents, CoDD configuration,
and project source alongside their tests.

## Automatic publish workflow

When the user explicitly requests a change to this repository, treat a successful
implementation and verification as permission to publish the resulting change:

1. Inspect `git status` before editing and do not include pre-existing unrelated
   changes in the commit.
2. Run the applicable tests and CoDD gates. Do not publish when a relevant red
   gate or test failure remains.
3. Review the staged diff for secrets, generated artifacts, and unrelated files.
4. Commit the scoped change on the current branch and push that branch to its
   configured upstream remote.

If the change cannot be verified, the working tree contains unrelated changes
that cannot be separated safely, or no upstream is configured, stop before
commit/push and report the exact reason. A request to explain, review, or
diagnose without asking for a change does not authorize publishing.
