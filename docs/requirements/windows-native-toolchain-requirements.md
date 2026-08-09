---
codd:
  node_id: "req:windows-native-toolchain"
  type: requirement
  status: approved
  confidence: 0.95
  depends_on:
    - id: "req:mvp-requirements"
      relation: "derives_from"
      semantic: "supported-windows-development-environment"
---

# Windows Native Development Toolchain

The project shall provide a Windows-native verification path for development
on the Windows filesystem. The path must use a Windows Python virtual
environment and Windows Node.js/npm, and must not depend on mounted-path
translation, a Linux virtual environment, or an ext4 mirror.

Toolchain discovery and feature verification are part of this path. Cargo,
Node.js, Python, Visual Studio, and the Windows SDK must be resolved by one
shared bootstrap without embedding a user name, Python version, or Node.js
installation directory. A missing tool must fail before build/test work starts
and report both the missing capability and the locations that were searched.

## Acceptance criteria

- A PowerShell CoDD runner invokes the Windows Python interpreter with UTF-8
  mode and forwards `scan`, `check`, `verify`, and `dag verify` arguments.
- The PowerShell runners default to the Windows virtual environment
  `.venv-windows`; a Linux virtual environment is never selected implicitly.
- A PowerShell consistency runner executes the existing producer and validates
  the `depends_on_consistency` JSON result without a Bash pipeline.
- A PowerShell test runner executes the Python tests and the frontend test
  command with Windows Python and npm, and separate typecheck/build commands
  use the same Windows Node.js toolchain.
- The Windows path preserves non-zero exit codes and does not report a pass
  when a subprocess fails.
- Release and Rust compatibility wrappers use the shared bootstrap and return
  the exact child exit code; frontend, SBOM, and Rust release work cannot
  continue after an earlier failed child command.
- The feature-verification pipeline generates the frontend bundle and SBOM
  before any Cargo check or test that resolves Tauri bundle resources. A clean
  workspace must not rely on a stale `dist/SBOM.json` from an earlier run.
- One Windows-native PowerShell feature-verification command accepts a feature
  or management ID. `IMP-004`, `FUT-C-019`, and `ShortcutOnly` resolve to the
  shortcut lane; `IMP-005`, `FUT-C-022`, and `TagsOnly` resolve to the tag lane.
  `IMP-006`, `FUT-C-023`, and `MemoOnly` resolve to the memo lane.
  Each lane selects its own focused frontend file, optional exact test-name
  pattern, Rust filter, and product harness switch while sharing typecheck,
  frontend/SBOM generation, focused or
  final canonical Rust verification, release-executable freshness, cleanup,
  and CoDD gates. The development-focused lane runs `scan`/`check`; the formal
  canonical lane also runs `verify`, whose configured test command already
  executes the full canonical frontend suite and typecheck.
  When a test-name pattern is supplied, the focused runner parses its
  machine-readable result and fails unless exactly one selected test passes
  with zero failures. Tests excluded by the atomic feature pattern are reported
  separately from selected functional skips.
- Every verification run emits a final JSON result on success and failure. It
  records each stage's UTC start/end, elapsed seconds, and exit code, plus the
  failed stage and total elapsed seconds.
- A product gate must prove that the release executable matches a deterministic
  manifest of its production source/build inputs. Frontend test-only files do
  not invalidate a production executable. A stale or unbound executable is
  rebuilt or rejected before the product process starts; unchanged warm runs
  reuse it.
- Product automation observes accessible or stable product state instead of a
  fixed save delay, treats restored reading position as the relative starting
  point, bounds all process/socket/UI waits, emits stage/DOM/process/port
  diagnostics on timeout, and leaves no product process, port, or SQLite lock.
  The tag product lane must wait across React-controlled selection/menu state,
  prove normalization by filtering a nonmatching tag, verify restart
  persistence and removal, and leave the library source tree byte-identical.
  The memo product lane must open a real comic through the release UI, wait for
  metadata operations to finish, prove save/edit/restart restoration and clear,
  reopen the item to prove the cleared state, and leave the library source tree
  byte-identical.
- Development verification runs focused Rust coverage before the final change;
  the full canonical Rust gate runs once for final acceptance. Timings for
  focused tests, release compilation, canonical tests, product automation, and
  CoDD are retained so cold/warm regressions can be compared without weakening
  the canonical gate.
- For a repository stored on the Windows filesystem, including invocation from
  WSL, the Windows-native runner is selected first. A WSL bridge follows the
  Windows completion result/sentinel and final JSON instead of trusting the
  initial interop process return, and the same change is not re-run through the
  Linux CoDD runner.
- The existing Linux/CI Bash runners remain available and unchanged in
  behavior.
