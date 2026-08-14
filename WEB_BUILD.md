# NBlood WebAssembly build

This branch builds native-source NBlood for a single-threaded Emscripten
runtime. The current `classic` browser profile uses SDL2, the 8-bit software
renderer, a fixed 800×600 4:3 backbuffer, SDL/Web Audio, and Asyncify around
the remaining browser-hostile cutscene and fade waits.

The downstream does not own an HTML document or CSS shell. It emits
`wasm-game.json`, `game-adapter.js`, the exact owner-data manifest, the native
engine artifacts, and an authentic tracked icon. wasm-game-framework 0.5.2
owns the canonical launcher/loading/runtime document and container server.

## Owner data

Blood retail files must never be committed, copied into the image, or exposed
as arbitrary static files. `wasm-game-data.json` is the exact allowlist for One
Unit Whole Blood: 24 required base files plus 33 optional demo, Cryptic Passage,
movie, and OGG files. The framework validates uploads into persistent `/data`;
each browser then downloads each valid file once and caches it in origin-private
IndexedDB.

`setup-assets.sh` remains an optional local native-development helper. It may
copy a legal installation into ignored `web/assets/`, but the browser build
never reads that directory.

## Build, verify, and run

Set `EMSDK_DIR` when Emscripten is not already active:

```bash
EMSDK_DIR=/home/ted/emsdk ./scripts/test-web.sh
./serve-web.sh 8007
```

The local server uses `build-web/container-data` as its persistent provisioning
directory by default. Override it with `BLOOD_CONTAINER_DATA_ROOT`.

For a container image:

```bash
EMSDK_DIR=/home/ted/emsdk ./scripts/build-image.sh blood-wasm:dev
docker run --rm -p 127.0.0.1:8007:8088 -v blood-data:/data blood-wasm:dev
```

Open <http://127.0.0.1:8007/> and provision the legal installation folder once.
The default launch uses `-quick -nodemo -noautoload -nosetup`. Optional launch
parameters remain available for deterministic checks:

- `?autostart=1` starts E1M1.
- `?autostart=1&campaign=cryptic` starts CP01 when Cryptic data is installed.
- `?intro=1` enables installed startup movies.
- `?demos=1` enables installed attract demos.

Configuration and saves under `/home/web_user/.config/nblood` are restored and
automatically synchronized through IDBFS.

## Browser profile

- Classic 8-bit software renderer at 800×600, contained as 4:3 with no stretch.
- WASD defaults are reapplied after persisted configuration loads.
- Mouse X turns; classic mouse Y moves forward/back. Vertical mouse look is
  deliberately disabled for this profile.
- Pointer lock is allowed only during gameplay. Losing capture opens the native
  menu; menu/paused state releases capture.
- SDL stereo and optional owner-supplied OGG music use Web Audio.
- Single player and loopback only; remote networking is not implemented.

## Modernized renderer feasibility

The native source includes Polymost and extensive GLES conditionals, so a
separate modernized WebGL 2 profile is feasible without borrowing another WASM
port. A compile probe reached the renderer but exposed incomplete GLES feature
gates in `menu.cpp` (`r_detailmapping`, `r_glowmapping`) and `tile.cpp`
(`voxvboalloc`). This is medium-sized native adaptation work, not a safe flag
flip. It should be implemented as a reviewed Build-engine GLES adapter shared
with a future Duke browser port, then exposed as a distinct dynamic-resolution
profile. The verified classic profile remains software-rendered.
