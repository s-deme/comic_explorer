#!/usr/bin/env python3
"""Run the real CoDD consistency producer and its focused DAG gate."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from generate_codd_consistency import generate, validate_output


def _run_checked(arguments: list[str], project_root: Path) -> str:
    completed = subprocess.run(
        arguments,
        cwd=project_root,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if completed.stderr:
        sys.stderr.write(completed.stderr)
    if completed.returncode != 0:
        raise RuntimeError(f"command failed with exit code {completed.returncode}: {' '.join(arguments)}")
    return completed.stdout


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=Path("."))
    parser.add_argument("--json", action="store_true", help="print the focused CoDD JSON result")
    args = parser.parse_args(argv)
    root = args.project_root.expanduser().resolve()
    output = root / ".codd" / "propagation_results.json"

    try:
        generate(root, output)
        validate_output(root, output)
        raw = _run_checked(
            [
                sys.executable,
                "-X",
                "utf8",
                "-m",
                "codd",
                "dag",
                "verify",
                "--path",
                str(root),
                "--check",
                "depends_on_consistency",
                "--format",
                "json",
            ],
            root,
        )
        payload = json.loads(raw)
        matches = [
            item
            for item in payload
            if isinstance(item, dict)
            and item.get("check_name") == "depends_on_consistency"
        ]
        if len(matches) != 1:
            raise RuntimeError(f"expected exactly one depends_on_consistency result, found {len(matches)}")
        result = matches[0]
        if result.get("status") != "pass":
            raise RuntimeError(f"depends_on_consistency status is {result.get('status')!r}")
        if result.get("skipped") is not False:
            raise RuntimeError(f"depends_on_consistency skipped is {result.get('skipped')!r}")
        if result.get("violations") != []:
            raise RuntimeError(f"depends_on_consistency violations are {result.get('violations')!r}")
        for field in ("records_compared", "checked_count"):
            if type(result.get(field)) is not int or result[field] != 5:
                raise RuntimeError(f"depends_on_consistency {field} must equal 5: {result.get(field)!r}")
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(raw, end="" if raw.endswith("\n") else "\n")
    else:
        print("depends_on_consistency status=pass skipped=false violations=0 records_compared=5 checked_count=5")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
