# Blood WASM downstream runbook

This repository is the downstream native-source NBlood browser port. Work stays
on downstream branches; do not push, file issues, or otherwise contact the
upstream project. No existing third-party WebAssembly port is used.

## Legal and data boundary

Blood retail data is owner-supplied and must stay outside Git, image layers,
and public static artifacts. The tracked `nblood.pk3` is an engine resource,
not retail game data. The framework server validates the exact
`wasm-game-data.json` allowlist into persistent `/data` and exposes only valid
keys after the 24-file required set is complete. Browser downloads are cached
in origin-private IndexedDB and restored without another container transfer.

Optional entries do not block readiness. Selecting a complete installation on
first setup also accepts the 33 allowlisted optional demo, Cryptic Passage,
movie, and OGG files. The classic game remains playable with only the required
set.

## Architecture and current state

```text
wasm-game-framework 0.5.1 canonical document/server
        ↓
Blood wasm-game.json + game-adapter.js
        ↓
container /data → exact validation → browser IndexedDB
        ↓
traversal-safe preservePaths MEMFS mount at /game
        ↓
native NBlood + Build software renderer + SDL2/Web Audio
```

The downstream owns no HTML or CSS. The fixed classic backbuffer is 800×600
and the framework contains it as 4:3 without stretching. Native state reports
menu/gameplay/paused, so capture occurs only in gameplay and losing pointer
lock opens the native menu. Configuration and saves remain under NBlood's
normal IDBFS-backed user directory.

The browser classic control contract is applied after persisted setup loads:
WASD movement, mouse enabled, horizontal mouse turning, and no vertical look.
Mouse Y retains classic forward/back behavior. Native telemetry exposes this
as mask `31`.

## Exact owner-data contract

The manifest contains 57 exact size/SHA-256 entries:

- 24 required: `BLOOD.INI`, three RFF files, `SURFACE.DAT`, `VOXEL.DAT`, and
  `TILES000.ART` through `TILES017.ART`.
- 33 optional: four demos, Cryptic Passage maps/resources, startup movies, and
  `blood02.ogg` through `blood09.ogg`.

RFF entries additionally validate the `RFF\x1a` signature. Optional entries
use framework `required:false` semantics and are skipped cleanly when absent.

## Build and static verification

```bash
EMSDK_DIR=/home/ted/emsdk ./scripts/test-web.sh
```

Expected ignored output:

```text
build-web/dist/blood.js
build-web/dist/blood.wasm
build-web/dist/blood.data       # tracked nblood.pk3 only
build-web/dist/blood.ico
build-web/dist/wasm-game.json
build-web/dist/wasm-game-data.json
build-web/dist/game-adapter.js
build-web/dist/shared-shell/*
```

The test validates the WASM/JavaScript, exact framework 0.5.1 package copies,
manifest counts and digests, absence of downstream HTML, native classic input
seams, fixed 4:3 dimensions, and absence of retail files or names in the
preload bundle.

## Run

Local framework server:

```bash
./serve-web.sh 8007
```

Framework-backed container:

```bash
EMSDK_DIR=/home/ted/emsdk ./scripts/build-image.sh blood-wasm:dev
docker run --rm -p 127.0.0.1:8007:8088 -v blood-data:/data blood-wasm:dev
```

Open `http://127.0.0.1:8007/`. Do not use `file:` or a plain static server;
the framework document and provisioning endpoints are part of the runtime.

Useful query-driven checks:

- `?autostart=1`: E1M1.
- `?autostart=1&campaign=cryptic`: CP01, with optional Cryptic data installed.
- `?intro=1`: installed startup movies.
- `?demos=1`: installed attract demos.

## Serialized browser smoke

1. Confirm incomplete `/data` shows provisioning only; once complete, setup is
   hidden and Play is available.
2. Start with the 24 required files and verify the native menu renders at 4:3.
3. Start E1M1; verify WASD, horizontal mouse turn, classic mouse-Y movement,
   fire/use/jump, audio, Escape, capture loss, and return to gameplay.
4. Hard refresh and confirm no `/game-data/files/*` transfers on an IndexedDB
   cache hit.
5. Change a setting and create a save, reload, and verify IDBFS persistence.
6. With optional data provisioned, verify Cryptic Passage, movies, demos, and
   OGG playback independently.

Chrome is intentionally not started from unsynchronized test lanes.

## Modernized native profile

A separate Polymost/WebGL 2 profile is feasible from this native source. The
compile probe reached GLES code, then stopped at incomplete feature guards for
`r_detailmapping`, `r_glowmapping`, and `voxvboalloc`. Treat this as medium
native-port work: create a reusable Build-engine GLES abstraction suitable for
both Blood and a future Duke port, finish renderer/input/aspect review, and
ship it as a distinct dynamic-resolution profile. Do not replace or silently
alter the verified classic profile.

## Remaining work

1. Run the serialized physical Chrome capture/audio/save checklist against the
   canonical 0.5.1 image.
2. Implement and test the shared Build-engine GLES adapter before advertising
   a modernized renderer profile.
3. Add a reviewed browser network transport before claiming remote multiplayer.
