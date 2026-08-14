#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
port="${1:-8000}"

if [[ ! -f "$repo_dir/build-web/dist/index.html" ]]; then
    printf 'No browser build found. Run ./build-web.sh first.\n' >&2
    exit 1
fi

printf '[NBlood WASM] Serving http://127.0.0.1:%s/\n' "$port"
server_args=(
  --port "$port"
  --bind 127.0.0.1
  --directory "$repo_dir/build-web/dist"
)
if [[ -n ${BLOOD_DEV_DATA_ROOT:-} ]]; then
  server_args+=(--data-root "$BLOOD_DEV_DATA_ROOT")
fi
exec python3 "$repo_dir/tools/serve-web.py" "${server_args[@]}"
