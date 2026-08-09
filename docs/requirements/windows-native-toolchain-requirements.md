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
  `IMP-007`, `FUT-R-004`, and `HistoryOnly` resolve to the history lane.
  `IMP-008`, `FUT-R-005`, and `RatingOnly` resolve to the rating lane.
  `IMP-012`, `FUT-C-010`, and `SearchOnly` resolve to the name-search lane.
  `IMP-013`, `FUT-C-011`, and `QuickAccessOnly` resolve to the quick-access lane.
  `IMP-014`, `FUT-C-021`, and `FavoritePersistenceOnly` resolve to the favorite-
  persistence lane.
  Each lane selects its own focused frontend file, optional exact test-name
  pattern, Rust filter, and product harness switch while sharing typecheck,
  frontend/SBOM generation, focused or
  final canonical Rust verification, release-executable freshness, cleanup,
  and CoDD gates. The development-focused lane runs `scan`/`check`; the formal
  canonical lane also runs `verify`, whose configured test command already
  executes the full canonical frontend suite and typecheck.
  When a test-name pattern is supplied, the focused runner parses its
  machine-readable result and fails unless the lane's configured
  `ExpectedFrontendPasses` count passes with zero failures. Atomic lanes configure
  one selected test; SearchOnly configures the five `FT-B05-*` tests, QuickAccessOnly
  configures `FT-B06-001`/`FT-B06-002` (two tests), and FavoritePersistenceOnly configures
  `FT-B06-003`/`FT-B06-004`/`FT-B06-005` (three tests). Tests excluded
  by the feature pattern are reported separately from selected functional skips.
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
  The history product lane must open successful items through the release UI,
  prove identity deduplication and deterministic order, prove a corrupt-open
  failure is not recorded, restore the same rows after restart, and leave the
  library source tree byte-identical.
  The rating product lane must save rating 1, update it to 5, restore 5 after
  restart, clear it to unset, reopen the viewer to prove the unset value, and
  leave the library source tree byte-identical. Invalid 0/6 requests remain a
  Rust contract and are not injected through the product UI.
  The name-search product lane must run an explicit search against an isolated
  fixture, prove normalized mixed-kind results, result navigation, empty and
  clear behavior, and a subsequent explicit rescan after a harness-only probe
  is added. It must remove the probe, restore the fixture, and leave the source
  tree byte-identical. Cleared in-flight generation suppression remains a
  deterministic deferred frontend contract. This is not a filesystem watcher
  lane.
  The quick-access product lane must add/remove available folder, comic-folder,
  and archive targets through the release UI, prove exact available rows, open
  the folder through the catalog/navigation boundary and a comic through the
  existing viewer boundary, settle removal to the empty state without a stale
  refresh leaving the dialog loading, and leave the library file and directory tree
  byte-identical. Restart, migration, missing/moved, and re-resolution belong
  to the later persistence lane and are not inferred from this product result.
  The favorite-persistence product lane must restore the same favorite IDs and
  available rows after a normal restart, observe a harness-only same-name archive
  move as strict `moved`, require an explicit re-resolution that preserves the ID,
  observe a missing comic folder with open disabled, prove a successful explicit
  rescan completes while it remains missing, persist the resolved record
  across another restart, and restore the isolated library file/directory tree
  byte-identically. Schema-v1 migration and ambiguous/invalid candidates remain
  deterministic Rust contracts rather than product-UI injection.
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
