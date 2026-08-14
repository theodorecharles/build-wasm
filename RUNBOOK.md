# Blood WASM downstream runbook

This repository is the downstream `theodorecharles/blood-wasm` port of NBlood.
It is maintained for the portfolio in `/home/ted/Development/wasm/RUNBOOK.md`.
The downstream branch is `devel`; `master` is the stable downstream branch when
it is promoted. The `upstream` remote is read-only reference material.

## Non-negotiable boundaries

- Keep all implementation, branches, tags, and releases in
  `theodorecharles/blood-wasm`.
- Never push to NBlood upstream or open upstream pull requests, issues,
  discussions, comments, or other maintainer contact.
- Blood retail data is user-owned. It must stay ignored and outside Git, Docker
  layers, exported images, and public artifacts.
- Retail files are selected locally and persisted in the user's private browser
  Cache Storage. They must never be uploaded to this server. All HTTP `PUT`
  requests are rejected and `/data/*` is not exposed by the public image.
- `nblood.pk3` is the tracked downstream resource pack used by the port. It is
  not a Blood retail data substitute and must remain separately reviewed from
  the proprietary files staged by `setup-assets.sh`.

## Current baseline

The starting downstream checkpoint is `f398fa63a`, `feat: add playable NBlood
WebAssembly port`, based on NBlood `f86390315`. The inherited browser work
already includes:

- SDL2 software rendering in a single-threaded Emscripten build;
- Web Audio through SDL2 and OGG CD-audio replacements when supplied;
- Asyncify around browser-hostile cutscene/fade waits;
- a user-gesture launch overlay with optional Cryptic Passage, intro movies,
  and demo playback;
- IndexedDB-backed configuration and saves;
- ignored local retail-data staging through `setup-assets.sh`.

The browser build was reproduced on 2026-08-14 with Emscripten 6.0.6 using
`./build-web.sh`. The earlier ignored build preloaded retail data; the current
assetless build replaces that with validated, browser-local ingestion.

## Required Blood data

The browser launcher lists and validates these required files from the user's
legal local installation:

```text
BLOOD.INI
BLOOD.RFF
GUI.RFF
SOUNDS.RFF
SURFACE.DAT
VOXEL.DAT
TILES000.ART through TILES017.ART
```

Optional files are accepted into the same browser-local cache when present:

```text
BLOOD000.DEM through BLOOD003.DEM
CP01.MAP through CP09.MAP
CPART07.AR_, CPART15.AR_
CPBB01.MAP through CPBB04.MAP, CPSL.MAP
CRYPTIC.INI, CRYPTIC.SMK, CRYPTIC.WAV
LOGO.SMK, GTI.SMK
blood02.ogg through blood09.ogg
movie/**
```

The user can drop the Blood installation directory onto the launcher or use
the directory picker. The launcher maps recognized files to exact destinations,
checks the Steam release's sizes plus RFF signatures, reports every missing or
invalid required file, and enables **Play Blood** only after the set is stored
locally and loaded into the Emscripten runtime filesystem.

`setup-assets.sh` remains a local native-development helper. It may copy files
from a legally installed Blood directory into ignored `web/assets/`; it must
never be used as a Docker build input or checked-in release artifact.

## Build and local runtime

Activate Emscripten first or set `$EMSDK_DIR` to an emsdk checkout:

```bash
./build-web.sh
./serve-web.sh 8007
```

The build emits `build-web/dist/index.html`, `index.js`, `index.wasm`, the
small non-retail preload bundle, and `data-ingest.js`. The local server serves
only that assetless bundle and rejects writes. Chromium tests provide Steam
files through the directory picker; no server-side data directory is needed.
The optional `BLOOD_DEV_DATA_ROOT` automation helper is hard-limited to a
loopback bind; `tools/serve-web.py` refuses to expose it on a non-loopback
address.

The page must remain useful with an empty data directory: the WASM runtime can
initialize, the file list remains visible, and the page explains how to supply
the files. Do not auto-start the game or claim a playable level until the
required data has been loaded.

## Docker contract

The image is a `linux/amd64` assetless browser checkpoint built reproducibly in
a pinned Emscripten stage and served by Nginx. It serves TCP 8088, exposes
`/health`, rejects non-GET/HEAD requests, and contains no retail files. A
typical smoke test is:

```bash
docker build --build-arg VCS_REF=$(git rev-parse HEAD) \
  -t theodorecharles/blood-wasm:dev .
docker run --rm --name blood-wasm-test -p 8007:8088 \
  theodorecharles/blood-wasm:dev
```

Verify `/health`, an empty-data browser state, `PUT` returning 403/405, and
`/data/<file>` returning 404. Then use Chromium's local file chooser to prove
browser-local persistence without adding retail files to the container.

## Milestone ladder

1. Source/legal baseline: downstream branch, GPL/copyright collateral, and
   ignored retail staging are documented.
2. Substantial Emscripten compile: NBlood game and engine objects link to a
   real WASM artifact.
3. Assetless browser artifact: the launcher and WASM load without retail data.
4. Data ingestion: required files are listed, validated, persisted only in the
   browser, and loaded into `/game` without an HTTP upload.
5. Engine initialization: SDL video/audio and the authentic NBlood startup
   path produce actionable browser logs.
6. Authentic menu: the Blood menu renders with keyboard/mouse focus and
   pointer-lock transitions.
7. Single-player level: E1M1 starts, renders, accepts input, and saves/loads.
8. Campaign coverage: Cryptic Passage and optional movies/demos are tested
   when the owner supplies their files.
9. Multiplayer: investigate a browser-safe network boundary separately; the
   current port is single-player only.
10. Docker release: a clean image is built and smoke-tested with no retail
    files in exported layers.

Do not promote a milestone based on a build exit code alone. Record the exact
command, artifact sizes, browser URL, data volume, visible result, and console
logs in the checkpoint commit or its test notes.

## Focused checkpoint convention

Use small downstream commits such as:

```text
docs: add Blood downstream runbook
feat: add browser Blood data ingestion
build: publish assetless Blood container checkpoint
```

Push only the downstream `devel` branch. Keep Docker tags local until the
portfolio owner explicitly authorizes publication to Docker Hub.
