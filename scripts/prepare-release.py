#!/usr/bin/env python3
"""Prepare generated release metadata required by the Tauri bundle."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"


def run(*command: str, cwd: Path = ROOT, stdout=None) -> None:
    subprocess.run(command, cwd=cwd, check=True, stdout=stdout)


def main() -> None:
    DIST.mkdir(exist_ok=True)
    metadata = DIST / "cargo-metadata.json"
    with metadata.open("w", encoding="utf-8", newline="\n") as output:
        run(
            "cargo",
            "metadata",
            "--manifest-path",
            "src-tauri/Cargo.toml",
            "--locked",
            "--format-version",
            "1",
            stdout=output,
        )
    run(sys.executable, "scripts/generate-sbom.py")


if __name__ == "__main__":
    main()
