#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dist_dir="$repo_dir/build-web/dist"

if ! command -v emcc >/dev/null 2>&1; then
    emsdk_dir="${EMSDK_DIR:-${EMSDK:-}}"
    if [[ -z "$emsdk_dir" || ! -f "$emsdk_dir/emsdk_env.sh" ]]; then
        printf 'Activate Emscripten first, or set EMSDK_DIR to an emsdk checkout.\n' >&2
        exit 1
    fi
    # shellcheck source=/dev/null
    source "$emsdk_dir/emsdk_env.sh" >/dev/null 2>&1
fi

mkdir -p "$dist_dir"

# The link output is regenerated so changes to the non-retail engine resource
# cannot leave a stale preload bundle while preserving the object build.
rm -f \
    "$dist_dir/index.data" \
    "$dist_dir/index.html" \
    "$dist_dir/index.js" \
    "$dist_dir/index.wasm" \
    "$dist_dir/data-ingest.js" \
    "$dist_dir/blood.data" \
    "$dist_dir/blood.js" \
    "$dist_dir/blood.wasm"

common_flags=(
    -Wno-unsupported-floating-point-opt
    -sUSE_SDL=2
    -sUSE_VORBIS=1
)

link_flags=(
    -sUSE_SDL=2
    -sUSE_VORBIS=1
    -sALLOW_MEMORY_GROWTH=1
    -sASYNCIFY=1
    -sASYNCIFY_STACK_SIZE=64KB
    -sENVIRONMENT=web
    -sEXIT_RUNTIME=0
    -sEXPORTED_RUNTIME_METHODS=callMain,FS,addRunDependency,removeRunDependency
    -sSTACK_SIZE=1MB
    --preload-file "$repo_dir/nblood.pk3@/game/nblood.pk3"
    -lidbfs.js
)

printf '[NBlood WASM] Building browser target with %s\n' "$(emcc --version | head -n 1)"

make -C "$repo_dir" -f GNUmakefile -j"$(nproc)" blood \
    PRETTY_OUTPUT=1 \
    PLATFORM=EMSCRIPTEN \
    ARCH=wasm32 \
    CC=emcc \
    CXX=em++ \
    CLANGNAME=emcc \
    CLANGXXNAME=em++ \
    L_CC=emcc \
    L_CXX=em++ \
    AR=emar \
    RANLIB=emranlib \
    STRIP= \
    SDLCONFIG= \
    EXESUFFIX=.js \
    obj=build-web/obj \
    blood_game=build-web/dist/blood \
    NETCODE=0 \
    STARTUP_WINDOW=0 \
    USE_OPENGL=0 \
    POLYMER=0 \
    USE_LIBVPX=0 \
    HAVE_VORBIS=1 \
    HAVE_FLAC=0 \
    HAVE_XMP=0 \
    USE_MIMALLOC=0 \
    RELEASE=1 \
    LTO=0 \
    CUSTOMOPT="${common_flags[*]}" \
    CFLAGS="-sUSE_SDL=2" \
    LDFLAGS="${link_flags[*]}"

printf '[NBlood WASM] Framework-ready engine build: %s/blood.js\n' "$dist_dir"
cp -f "$repo_dir/web/game-adapter.js" "$dist_dir/game-adapter.js"
cp -f "$repo_dir/web/wasm-game.json" "$dist_dir/wasm-game.json"
cp -f "$repo_dir/web/wasm-game-data.json" "$dist_dir/wasm-game-data.json"
cp -f "$repo_dir/source/blood/rsrc/game_icon.ico" "$dist_dir/blood.ico"

framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
if [[ ! -x "$framework_dir/scripts/install-browser-package.sh" ]]; then
    printf 'WASM framework browser package not found at %s\n' "$framework_dir" >&2
    exit 1
fi
"$framework_dir/scripts/install-browser-package.sh" "$dist_dir/shared-shell" copy
