#!/usr/bin/env python3
"""Run the project test suites with the current platform's toolchain."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def npm_command() -> str:
    if os.name == "nt":
        return shutil.which("npm.cmd") or shutil.which("npm") or "npm.cmd"
    local_npm = ROOT / ".tools" / "node" / "bin" / "npm"
    return str(local_npm) if local_npm.is_file() else (shutil.which("npm") or "npm")


def run(command: list[str]) -> int:
    completed = subprocess.run(command, cwd=ROOT, check=False)
    return completed.returncode


def main() -> int:
    python = sys.executable
    unit_rc = run([python, "-X", "utf8", "-B", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"])
    if unit_rc != 0:
        return unit_rc
    return run([npm_command(), "test", "--", "--pool=threads", "--poolOptions.threads.singleThread=true"])


if __name__ == "__main__":
    raise SystemExit(main())
