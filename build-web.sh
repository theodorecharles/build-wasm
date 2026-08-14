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

# The link output is regenerated so changes to the shell or preloaded game data
# cannot leave a stale .data bundle while preserving the expensive object build.
rm -f \
    "$dist_dir/index.data" \
    "$dist_dir/index.html" \
    "$dist_dir/index.js" \
    "$dist_dir/index.wasm"

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
    --shell-file "$repo_dir/web/shell.html"
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
    EXESUFFIX=.html \
    obj=build-web/obj \
    blood_game=build-web/dist/index \
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

printf '[NBlood WASM] Browser build ready: %s\n' "$dist_dir/index.html"
cp -f "$repo_dir/web/data-ingest.js" "$dist_dir/data-ingest.js"
printf '[NBlood WASM] Browser data-ingest module copied to %s/data-ingest.js\n' "$dist_dir"
