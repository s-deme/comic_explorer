#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
workspace_root="$(cd -- "${script_dir}/.." && pwd -P)"
project_root="${1:-${workspace_root}}"
codd_bin="${workspace_root}/.venv/bin/codd"

exec "${codd_bin}" dag verify \
  --path "${project_root}" \
  --check depends_on_consistency \
  --format json
