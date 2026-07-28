#!/usr/bin/env bash
set -euo pipefail

if command -v npm >/dev/null 2>&1; then
  exec npm run typecheck
fi

project_node_root="$(pwd)/.tools/node"
if [[ -x "$project_node_root/bin/node" ]]; then
  exec env \
    PATH="$project_node_root/bin:/usr/local/bin:/usr/bin:/bin" \
    "$project_node_root/bin/npm" run typecheck
fi

echo "npm was not found. Install Node.js 24 LTS or provision .tools/node." >&2
exit 127
