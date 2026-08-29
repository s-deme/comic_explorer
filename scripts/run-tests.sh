#!/usr/bin/env bash
set -euo pipefail

bash scripts/run-codd-consistency.sh

python3 -B -m unittest discover -s tests -p 'test_*.py'

frontend_workers="${COMIC_EXPLORER_TEST_WORKERS:-2}"
if ! [[ "$frontend_workers" =~ ^[1-4]$ ]]; then
  echo "COMIC_EXPLORER_TEST_WORKERS must be an integer from 1 to 4." >&2
  exit 2
fi

if command -v npm >/dev/null 2>&1; then
  # A capped worker pool keeps the aggregate fast while retaining test isolation.
  exec env TMPDIR=/tmp TEMP=/tmp TMP=/tmp npm test -- \
    --pool=threads --maxWorkers="$frontend_workers" --minWorkers=1
fi

project_node_root="$(pwd)/.tools/node"
if [[ -x "$project_node_root/bin/node" ]]; then
  exec env \
    PATH="$project_node_root/bin:/usr/local/bin:/usr/bin:/bin" \
    TMPDIR=/tmp \
    TEMP=/tmp \
    TMP=/tmp \
    "$project_node_root/bin/npm" test -- \
      --pool=threads --maxWorkers="$frontend_workers" --minWorkers=1
fi

echo "npm was not found. Install Node.js 24 LTS or provision .tools/node." >&2
exit 127
