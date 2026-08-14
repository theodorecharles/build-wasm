#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
image="${1:-blood-wasm:dev}"

"$repo_dir/build-web.sh"
"$framework_dir/scripts/build-static-image.sh" "$repo_dir/build-web/dist" "$image" blood
