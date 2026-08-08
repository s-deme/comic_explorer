#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
workspace_root="$(cd -- "${script_dir}/.." && pwd -P)"
project_root="${1:-${workspace_root}}"
codd_bin="${workspace_root}/.venv/bin/codd"
codd_site="${workspace_root}/.venv/lib/python3.12/site-packages"

filesystem_type="$(stat -f -c %T "${workspace_root}" 2>/dev/null || true)"
verify_root="${project_root}"
mirror_root=""
runtime_root=""

if [[ "${filesystem_type}" == "9p" || "${filesystem_type}" == "v9fs" ]]; then
  mirror_root="$(mktemp -d /tmp/comic-explorer-codd-project.XXXXXX)"
  runtime_root="/tmp/comic-explorer-codd-runtime"
  trap 'rm -rf "${mirror_root}"' EXIT

  mkdir -p "${mirror_root}/.codd"
  cp "${project_root}/.codd/dag.json" "${mirror_root}/.codd/dag.json"
  cp "${project_root}/.codd/propagation_results.json" \
    "${mirror_root}/.codd/propagation_results.json"
  verify_root="${mirror_root}"

  if [[ ! -f "${runtime_root}/.ready" ]]; then
    runtime_staging="$(mktemp -d /tmp/comic-explorer-codd-runtime.XXXXXX)"
    cp -a "${codd_site}/codd" "${runtime_staging}/codd"
    touch "${runtime_staging}/.ready"
    if [[ -e "${runtime_root}" ]]; then
      rm -rf "${runtime_root}"
    fi
    mv "${runtime_staging}" "${runtime_root}"
  fi

  cd /tmp
  exec env PYTHONPATH="${runtime_root}" /usr/bin/python3 -c \
    'import sys; from codd.cli import main; main()' \
    dag verify --path "${verify_root}" \
    --check depends_on_consistency --format json
fi

exec "${codd_bin}" dag verify \
  --path "${verify_root}" \
  --check depends_on_consistency \
  --format json
