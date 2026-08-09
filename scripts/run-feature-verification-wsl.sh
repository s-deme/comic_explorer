#!/usr/bin/env bash
set -uo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
feature=${1:-IMP-004}
shift || true
result_root="$project_root/src-tauri/target/verification"
mkdir -p "$result_root"
run_id=$(date -u +%Y%m%dT%H%M%SZ)-$$
result_path="$result_root/wsl-$run_id.json"
launcher_log="$result_root/wsl-$run_id.launcher.log"
windows_root=$(wslpath -w "$project_root")
windows_result=$(wslpath -w "$result_path")

powershell.exe -NoProfile -ExecutionPolicy Bypass \
  -File "$windows_root\\scripts\\verify-feature-windows.ps1" \
  -Feature "$feature" -OutputPath "$windows_result" "$@" \
  >"$launcher_log" 2>&1 &
launcher_pid=$!

deadline=$((SECONDS + 7200))
while [[ ! -f "$result_path" ]]; do
  if (( SECONDS >= deadline )); then
    echo "Timed out waiting for Windows verification JSON: $result_path" >&2
    echo "Launcher log: $launcher_log" >&2
    exit 124
  fi
  sleep 1
done
wait "$launcher_pid" 2>/dev/null || true
tr -d '\r' <"$result_path"
exit_code=$(tr -d '\r' <"$result_path" | sed -n 's/.*"exitCode"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -1)
if [[ -z "$exit_code" ]]; then exit_code=1; fi
exit "$exit_code"
