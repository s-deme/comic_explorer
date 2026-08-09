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
- The existing Linux/CI Bash runners remain available and unchanged in
  behavior.
