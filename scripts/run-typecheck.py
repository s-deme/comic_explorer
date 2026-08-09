#!/usr/bin/env python3
"""Run the TypeScript typecheck with the current platform's npm."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    if os.name == "nt":
        npm = shutil.which("npm.cmd") or shutil.which("npm") or "npm.cmd"
    else:
        local_npm = ROOT / ".tools" / "node" / "bin" / "npm"
        npm = str(local_npm) if local_npm.is_file() else (shutil.which("npm") or "npm")
    return subprocess.run([npm, "run", "typecheck"], cwd=ROOT, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
