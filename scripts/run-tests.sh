#!/usr/bin/env bash
set -euo pipefail

bash scripts/run-codd-consistency.sh

python3 -B -m unittest discover -s tests -p 'test_*.py'

if command -v npm >/dev/null 2>&1; then
  # Windows Node running through WSL can share mocked module state between
  # parallel Vitest workers. Keep the canonical aggregate deterministic.
  exec env TMPDIR=/tmp TEMP=/tmp TMP=/tmp npm test -- \
    --pool=threads --poolOptions.threads.singleThread=true
fi

project_node_root="$(pwd)/.tools/node"
if [[ -x "$project_node_root/bin/node" ]]; then
  exec env \
    PATH="$project_node_root/bin:/usr/local/bin:/usr/bin:/bin" \
    TMPDIR=/tmp \
    TEMP=/tmp \
    TMP=/tmp \
    "$project_node_root/bin/npm" test -- \
      --pool=threads --poolOptions.threads.singleThread=true
fi

echo "npm was not found. Install Node.js 24 LTS or provision .tools/node." >&2
exit 127
