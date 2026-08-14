#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="$repo_dir/build-web/dist"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"

"$repo_dir/build-web.sh"

for required in blood.js blood.wasm blood.data duke3d.js duke3d.wasm \
    blood.ico duke3d.ico blood-192.png blood-512.png duke3d-192.png duke3d-512.png \
    game-adapter.js adapters/blood.js adapters/duke3d.js wasm-game.json wasm-game-data.json \
    shared-shell/wasm-game-framework.js shared-shell/wasm-game-framework.css \
    shared-shell/wasm-game-bootstrap.js shared-shell/wasm-game-framework.json; do
    [[ -f "$dist_dir/$required" ]] || { printf 'Missing Build-family artifact: %s\n' "$required" >&2; exit 1; }
done

for forbidden in index.html index.js index.wasm index.data data-ingest.js owner-data.js \
    service-worker.js app.webmanifest wasm-game-config.js \
    wolfwasm-shell.js wolfwasm-shell.css wolfwasm-bootstrap.js duke3d.data; do
    [[ ! -e "$dist_dir/$forbidden" ]] || { printf 'Downstream owns forbidden shell/data artifact: %s\n' "$forbidden" >&2; exit 1; }
done

for source in "$dist_dir/blood.js" "$dist_dir/duke3d.js" "$dist_dir/game-adapter.js" \
    "$dist_dir/adapters/blood.js" "$dist_dir/adapters/duke3d.js" \
    "$dist_dir/shared-shell/wasm-game-framework.js" "$dist_dir/shared-shell/wasm-game-bootstrap.js"; do
    node --check "$source"
done
node "$repo_dir/scripts/test-family-adapter.js"
node "$repo_dir/scripts/test-variant-adapters.js"
if command -v wasm-validate >/dev/null 2>&1; then
    wasm-validate "$dist_dir/blood.wasm"
    wasm-validate "$dist_dir/duke3d.wasm"
else
    for wasm in "$dist_dir/blood.wasm" "$dist_dir/duke3d.wasm"; do
        [[ "$(od -An -tx1 -N4 "$wasm" | tr -d ' \n')" == "0061736d" ]]
    done
fi

cmp "$repo_dir/web/game-adapter.js" "$dist_dir/game-adapter.js"
cmp "$repo_dir/web/blood-adapter.js" "$dist_dir/adapters/blood.js"
cmp "$repo_dir/web/duke3d-adapter.js" "$dist_dir/adapters/duke3d.js"
cmp "$repo_dir/web/wasm-game.json" "$dist_dir/wasm-game.json"
cmp "$repo_dir/web/wasm-game-data.json" "$dist_dir/wasm-game-data.json"
cmp "$framework_dir/dist/wasm-game-framework.js" "$dist_dir/shared-shell/wasm-game-framework.js"
cmp "$framework_dir/dist/wasm-game-framework.css" "$dist_dir/shared-shell/wasm-game-framework.css"
cmp "$framework_dir/dist/wasm-game-bootstrap.js" "$dist_dir/shared-shell/wasm-game-bootstrap.js"

for marker in CONFIG_SetDefaultKeys 'gSetup.xdim = 800' 'gMouseAim = 0' \
    NBlood_WasmRuntimeState NBlood_WasmCaptureIntent NBlood_WasmEnsureMenu NBlood_WasmSetPointerLock NBlood_WasmControlsMask; do
    rg -Fq "$marker" "$repo_dir/source/blood/src" || { printf 'Missing Blood native seam: %s\n' "$marker" >&2; exit 1; }
done
for marker in 'emscripten_set_main_loop(Duke_WasmFrame' Duke_WasmEnterFrontend Duke_WasmDrawFrontend \
    'does not return until a game starts' 'ud.setup.xdim = 800' 'ud.setup.ydim = 600' \
    'ud.setup.bpp = 8' 'ud.mouseaiming = 0' Duke_WasmRuntimeState Duke_WasmEnsureMenu \
    Duke_WasmSetPointerLock Duke_WasmControlsMask; do
    rg -Fq "$marker" "$repo_dir/source/duke3d/src/game.cpp" || { printf 'Missing Duke native seam: %s\n' "$marker" >&2; exit 1; }
done
for marker in _NBlood_WasmRuntimeState _NBlood_WasmCaptureIntent _NBlood_WasmEnsureMenu _NBlood_WasmSetPointerLock _NBlood_WasmControlsMask; do
    rg -Fq "$marker" "$dist_dir/blood.js" || { printf 'Blood native hook is not exported: %s\n' "$marker" >&2; exit 1; }
done
for marker in _Duke_WasmRuntimeState _Duke_WasmEnsureMenu _Duke_WasmSetPointerLock _Duke_WasmControlsMask; do
    rg -Fq "$marker" "$dist_dir/duke3d.js" || { printf 'Duke native hook is not exported: %s\n' "$marker" >&2; exit 1; }
done
rg -Fq '#define DUKE13_CRC  (int32_t)0xBBC9CE44' "$repo_dir/source/duke3d/src/grpscan.h"
rg -Fq 'DUKE13_CRC,  26524524' "$repo_dir/source/duke3d/src/grpscan.cpp"
for adapter in "$dist_dir/adapters/blood.js" "$dist_dir/adapters/duke3d.js"; do
    for marker in 'ctx.framework.createOwnerDataSet' 'ctx.dataClient.load' \
        'ctx.framework.mountOwnerFiles' 'preservePaths: true' "engine.FS.chmod('/game', 0o555)"; do
        rg -Fq "$marker" "$adapter" || { printf 'Missing adapter data-boundary marker: %s (%s)\n' "$marker" "$adapter" >&2; exit 1; }
    done
done

if strings "$dist_dir/blood.data" | rg -i 'BLOOD\.(RFF|INI)|TILES[0-9]{3}\.ART|SOUNDS\.RFF' >/dev/null; then
    printf 'Retail Blood data leaked into the preload bundle.\n' >&2
    exit 1
fi
rg -Fq '/game/nblood.pk3' "$dist_dir/blood.js" || { printf 'Tracked NBlood engine resource is absent from preload metadata.\n' >&2; exit 1; }
if find "$dist_dir" -type f \( -iname '*.rff' -o -iname '*.art' -o -iname '*.grp' -o -iname '*.rts' \
    -o -iname '*.map' -o -iname '*.smk' -o -iname '*.ogg' \) -print -quit | rg -q .; then
    printf 'Game data was found under the public document root.\n' >&2
    exit 1
fi
if rg -n '/home/ted/|/local-data/' "$dist_dir" "$repo_dir/web" "$repo_dir/build-web.sh"; then
    printf 'Generated site contains a workstation path or obsolete data loader.\n' >&2
    exit 1
fi
if rg -n 'WolfWasmShell|wolfwasm-' "$dist_dir" "$repo_dir/web"; then
    printf 'Generated site contains a legacy framework API.\n' >&2
    exit 1
fi
if git -C "$repo_dir" ls-files | rg -i '(^|/)(DUKE3D\.GRP|DUKE\.RTS|BLOOD\.RFF|BLOOD\.INI|TILES[0-9]{3}\.ART)$|\.(wasm|data)$'; then
    printf 'Tracked generated binary or game data found.\n' >&2
    exit 1
fi

node "$repo_dir/scripts/verify-site-contract.js"
file "$dist_dir/blood.wasm" "$dist_dir/duke3d.wasm" "$dist_dir/blood.data"
git -C "$repo_dir" diff --check
printf 'Blood and Duke Nukem 3D builds passed native, framework, data-boundary, input, audio, state, and PWA checks.\n'
