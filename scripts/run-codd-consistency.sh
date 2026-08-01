#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
project_root="$(cd -- "${script_dir}/.." && pwd -P)"
python_bin="${project_root}/.venv/bin/python"
codd_bin="${project_root}/.venv/bin/codd"
producer="${project_root}/scripts/generate_codd_consistency.py"
output="${project_root}/.codd/propagation_results.json"

"${python_bin}" "${producer}" \
  --project-root "${project_root}" \
  --output "${output}"

"${python_bin}" "${producer}" \
  --project-root "${project_root}" \
  --output "${output}" \
  --validate

"${codd_bin}" dag verify \
  --path "${project_root}" \
  --check depends_on_consistency \
  --format json |
  "${python_bin}" -c '
import json
import sys


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


try:
    payload = json.load(sys.stdin)
except (json.JSONDecodeError, UnicodeDecodeError) as exc:
    fail(f"CoDD verify did not return valid JSON: {exc}")

if not isinstance(payload, list):
    fail("CoDD verify JSON must be a list")

matches = [
    item
    for item in payload
    if isinstance(item, dict)
    and item.get("check_name") == "depends_on_consistency"
]
if len(matches) != 1:
    fail(
        "expected exactly one depends_on_consistency result, "
        f"found {len(matches)}"
    )

result = matches[0]
if result.get("status") != "pass":
    fail(f"depends_on_consistency status is {result.get('status')!r}")
if result.get("skipped") is not False:
    fail(f"depends_on_consistency skipped is {result.get('skipped')!r}")
if result.get("violations") != []:
    fail(f"depends_on_consistency violations are not empty: {result.get('violations')!r}")
for field in ("records_compared", "checked_count"):
    if type(result.get(field)) is not int or result[field] != 5:
        fail(f"depends_on_consistency {field} must equal 5: {result.get(field)!r}")

print(
    "depends_on_consistency status=pass skipped=false violations=0 "
    "records_compared=5 checked_count=5"
)
'
