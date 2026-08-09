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
    local_npm = ROOT / ".tools" / "node" / "bin" / "npm"
    return str(local_npm) if local_npm.is_file() else (shutil.which("npm") or "npm")


def run(command: list[str]) -> int:
    if os.name != "nt":
        completed = subprocess.run(command, cwd=ROOT, check=False)
        return completed.returncode

    completed = subprocess.run(
        command,
        cwd=ROOT,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if completed.returncode != 0:
        configured_root = os.environ.get("COMIC_EXPLORER_VERIFICATION_LOG_ROOT")
        diagnostic_root = (
            Path(configured_root)
            if configured_root
            else ROOT / "src-tauri" / "target" / "verification"
        )
        diagnostic_root.mkdir(parents=True, exist_ok=True)
        stdout_path = diagnostic_root / "canonical-tests.stdout.log"
        stderr_path = diagnostic_root / "canonical-tests.stderr.log"
        stdout_path.write_bytes(completed.stdout)
        stderr_path.write_bytes(completed.stderr)
        sys.stderr.write(
            "Windows canonical test failure output: "
            f"{stdout_path} (stdout), {stderr_path} (stderr)\n"
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
        return run(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(ROOT / "scripts" / "run-tests-windows.ps1"),
            ]
        )

    python = sys.executable
    unit_rc = run([python, "-X", "utf8", "-B", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"])
    if unit_rc != 0:
        return unit_rc
    return run([npm_command(), "test", "--", "--pool=threads", "--poolOptions.threads.singleThread=true"])


if __name__ == "__main__":
    raise SystemExit(main())
