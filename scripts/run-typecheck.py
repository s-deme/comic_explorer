#!/usr/bin/env python3
"""Run the TypeScript typecheck with the current platform's npm."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run_windows(command: list[str]) -> int:
    completed = subprocess.run(
        command,
        cwd=ROOT,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    for raw, target in ((completed.stdout, sys.stdout), (completed.stderr, sys.stderr)):
        if not raw:
            continue
        try:
            rendered = raw.decode("utf-8")
        except UnicodeDecodeError:
            rendered = raw.decode("mbcs", errors="replace")
        target.write(rendered)
        target.flush()
    return completed.returncode


def main() -> int:
    if os.name == "nt":
        powershell = shutil.which("powershell.exe") or "powershell.exe"
        return run_windows(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(ROOT / "scripts" / "run-typecheck-windows.ps1"),
            ]
        )

    local_npm = ROOT / ".tools" / "node" / "bin" / "npm"
    npm = str(local_npm) if local_npm.is_file() else (shutil.which("npm") or "npm")
    return subprocess.run([npm, "run", "typecheck"], cwd=ROOT, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
