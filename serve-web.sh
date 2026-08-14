#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
port="${1:-8007}"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
data_root="${BLOOD_CONTAINER_DATA_ROOT:-$repo_dir/build-web/container-data}"

if [[ ! -f "$repo_dir/build-web/dist/wasm-game.json" ]]; then
    printf 'No browser build found. Run ./build-web.sh first.\n' >&2
    exit 1
fi
if [[ ! -f "$framework_dir/server/static-server.js" ]]; then
    printf 'WASM framework server not found at %s\n' "$framework_dir" >&2
    exit 1
fi

mkdir -p "$data_root"
printf '[NBlood WASM] Serving canonical launcher at http://127.0.0.1:%s/\n' "$port"
printf '[NBlood WASM] Persistent owner-data root: %s\n' "$data_root"
exec env \
    WASM_GAME_SITE_ROOT="$repo_dir/build-web/dist" \
    WASM_GAME_SHELL_ROOT="$framework_dir/dist" \
    WASM_GAME_DATA_ROOT="$data_root" \
    WASM_GAME_HTTP_PORT="$port" \
    WASM_GAME_VARIANT=blood \
    node "$framework_dir/server/static-server.js"
