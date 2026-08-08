---
codd:
  node_id: "doc:archive-cmd-391-task-plan"
  type: archive
  status: archived
---

# Archived cmd-391 C2a task completion evidence

> **Archive status:** `cancelled`
> **Release status:** `non-release`
> **Completion-evidence status:** `non-current`
>
> This file preserves the former uncommitted `cmd-391` task plan for historical
> traceability. It is not an active CoDD plan, current command completion
> evidence, or release-readiness evidence. The scope-limited `checked_count=1`
> and `completion_rate=1.0` values must not be reused as evidence for any
> current command.
>
> - Original path: `docs/plan/cmd-391-task-plan.md`
> - Active CoDD reference: none; `codd/codd.yaml` intentionally has no
>   `dag.node_extraction.plan_path`.
> - Archived at: `2026-08-01T22:43:41+09:00`
>
> The original plan content follows unchanged.

# cmd-391 C2a task completion evidence plan

This plan is intentionally scoped to the one completed implementation task
accepted by Gunshi. It is not a completion or release plan for `cmd_391`.

## subtask_391_sync_e09_2 — completed E09 test-case synchronization

Task population contains exactly this real producer task. Design, read-only,
future, dummy, and report-maintenance tasks are excluded.

- parent_cmd: `cmd_391`
- source_task_yaml: `queue/tasks/ashigaru5.yaml`
- source_task_sha256_raw_bytes: `7362f18b5d4e122f454f2600fdb94f895132cb7cb73be153d6d435d7439d8641`
- acceptance: `docs/testing/test-cases.md` only; fixed internal SEED `20260728` and manifest `fixtureSeed`; refusal without replace preserves hash/mtime; `--force`/`-Force` is deterministic for permitted fixture directories; missing PowerShell on Linux is `Blocked`, executed failures remain `FAIL`; P0=48, P1=25, total=73; diff-check and duplicate-ID checks pass.
- report: `queue/reports/ashigaru5_report.yaml`
- report_sha256_raw_bytes: `6d82473c79367178d307cc19277c78ad6171b8161ae59cb7d7c2a479f28237fc`
- qc_authority: `karo`
- qc_persistent_message_id: `msg_20260801_150952_820236df`
- qc_acceptance: `Persistent Karo QC confirms the named task is done, only test-cases changed, the seed/manifest and refusal/force/environment rules are accurate, counts are P0=48/P1=25/total=73, and CoDD/baseline/ack/commit/push/build were not run.`
- c1_checkpoint_commit: `079faf78c0d4142e083f8a2717ca3c3600bf0fc3`
- c1_binary_diff_sha256: `b21c364e48bcaaa5e534f69f83d6345d574b23729e6f82c63e3afdfe7a21f3d3`
- output_sha256_raw_bytes: `ad194ea84ce91b794eb7263c77d3a5cd8af3ad8f1344487e7b3080cf694ed2d8`
- status: `done`

Outputs (one project-root file only):

- `docs/testing/test-cases.md`

The expected task-completion result is `checked_count=1`, `total_tasks=1`,
`completed_tasks=1`, `completion_rate=1.0`, nonvacuous `PASS`, and zero red
findings. This scope-limited result does not mean that `cmd_391`, C2a/C2b, or
release readiness is complete.
