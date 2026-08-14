#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="$repo_dir/build-web/dist"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"

"$repo_dir/build-web.sh"

for required in blood.js blood.wasm blood.data blood.ico blood-192.png blood-512.png game-adapter.js wasm-game.json wasm-game-data.json \
    shared-shell/wasm-game-framework.js shared-shell/wasm-game-framework.css \
    shared-shell/wasm-game-bootstrap.js shared-shell/wasm-game-framework.json; do
    [[ -f "$dist_dir/$required" ]] || { printf 'Missing Blood web artifact: %s\n' "$required" >&2; exit 1; }
done

for forbidden in index.html index.js index.wasm index.data data-ingest.js; do
    if [[ -e "$dist_dir/$forbidden" ]]; then
        printf 'Blood downstream retains obsolete webapp artifact: %s\n' "$forbidden" >&2
        exit 1
    fi
done

node --check "$dist_dir/blood.js"
node --check "$dist_dir/game-adapter.js"
node --check "$dist_dir/shared-shell/wasm-game-bootstrap.js"
wasm-validate "$dist_dir/blood.wasm"
cmp "$repo_dir/web/game-adapter.js" "$dist_dir/game-adapter.js"
cmp "$repo_dir/web/wasm-game.json" "$dist_dir/wasm-game.json"
cmp "$framework_dir/dist/wasm-game-framework.js" "$dist_dir/shared-shell/wasm-game-framework.js"
cmp "$framework_dir/dist/wasm-game-framework.css" "$dist_dir/shared-shell/wasm-game-framework.css"
cmp "$framework_dir/dist/wasm-game-bootstrap.js" "$dist_dir/shared-shell/wasm-game-bootstrap.js"

node -e '
const fs=require("fs");
const c=JSON.parse(fs.readFileSync(process.argv[1]));
const m=JSON.parse(fs.readFileSync(process.argv[2]));
const p=JSON.parse(fs.readFileSync(process.argv[3]));
const required=m.files.filter(f=>f.required!==false), optional=m.files.filter(f=>f.required===false);
if(c.id!=="blood"||c.displayMode!=="4:3"||c.canvasWidth!==800||c.canvasHeight!==600||c.syncBackbuffer!==false||c.fullscreen!==true||c.pwa?.icons?.length!==2)process.exit(1);
if(m.namespace!=="blood-retail"||required.length!==24||optional.length!==33||m.files.some(f=>!f.sha256))process.exit(1);
if(p.package!=="@wasm-game-framework/browser"||p.version!=="0.7.0"||!p.bootstrapSha256)process.exit(1);
' "$dist_dir/wasm-game.json" "$dist_dir/wasm-game-data.json" "$dist_dir/shared-shell/wasm-game-framework.json"

for marker in \
    'globalThis.WasmGameAdapter' \
    'ctx.framework.createOwnerDataSet' \
    'ctx.dataClient.load' \
    'ctx.framework.mountOwnerFiles' \
    'preservePaths: true' \
    "engine.callMain(args)" \
    '_NBlood_WasmRuntimeState' \
    '_NBlood_WasmEnsureMenu' \
    '_NBlood_WasmSetPointerLock'; do
    grep -Fq "$marker" "$dist_dir/game-adapter.js" || { printf 'Missing Blood adapter marker: %s\n' "$marker" >&2; exit 1; }
done

grep -Fq 'CONFIG_SetDefaultKeys(keydefaults)' "$repo_dir/source/blood/src/blood.cpp"
grep -Fq 'gSetup.xdim = 800' "$repo_dir/source/blood/src/blood.cpp"
grep -Fq 'gMouseAim = 0' "$repo_dir/source/blood/src/controls.cpp"
grep -Fq 'NBlood_WasmControlsMask' "$repo_dir/source/blood/src/blood.cpp"

if strings "$dist_dir/blood.data" | grep -E 'BLOOD\.(RFF|INI)|TILES[0-9]{3}\.ART|SOUNDS\.RFF' >/dev/null; then
    printf 'Retail Blood data leaked into the preload bundle.\n' >&2
    exit 1
fi
if ! grep -F '/game/nblood.pk3' "$dist_dir/blood.js" >/dev/null; then
    printf 'Tracked non-retail NBlood resource is missing from preload metadata.\n' >&2
    exit 1
fi
if find "$dist_dir" -maxdepth 1 -type f \
    \( -iname '*.rff' -o -iname '*.art' -o -iname '*.dat' -o -iname '*.dem' -o -iname '*.ogg' -o -iname '*.smk' \) \
    -print -quit | grep -q .; then
    printf 'Retail-like Blood file found under the public document root.\n' >&2
    exit 1
fi
if grep -R -F '/home/ted/' "$dist_dir" "$repo_dir/web" "$repo_dir/build-web.sh" >/dev/null; then
    printf 'A workstation-specific path leaked into the Blood browser build.\n' >&2
    exit 1
fi

git -C "$repo_dir" diff --check
printf 'Blood web build passed framework 0.7.0, classic controls/aspect, PWA, persistence, and owner-data checks.\n'
