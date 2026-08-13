# NBlood WebAssembly build

This branch builds NBlood for a single-threaded browser runtime using Emscripten's SDL2 port. It selects the classic software renderer, maps SDL video to a 960×600 browser canvas, maps SDL audio to Web Audio, and schedules the native game loop with `emscripten_set_main_loop`.

## Game data

The build requires a legal Blood 1.21 installation. The staging script checks the common Linux Steam library locations for `One Unit Whole Blood`.

Stage the required files with:

```bash
./setup-assets.sh
```

To use a different installation:

```bash
./setup-assets.sh /path/to/Blood
```

You can also set `BLOOD_STEAM_DIR` to that directory.

The script copies `BLOOD.INI`, the three RFF files, `SURFACE.DAT`, `VOXEL.DAT`, and `TILES000.ART` through `TILES017.ART` into `web/assets/`. That directory is ignored by git. Never commit or redistribute its contents.

## Build and run

Emscripten is expected at `$HOME/emsdk` by default. Set `EMSDK_DIR` if it lives elsewhere.

```bash
./build-web.sh
./serve-web.sh
```

Then open <http://127.0.0.1:8000/> in Chrome. Click the canvas to focus keyboard input, capture the pointer, and unlock browser audio; press Escape to release the pointer. The browser build is emitted to `build-web/dist/`; serve it over HTTP rather than opening the HTML file directly.

For a direct E1M1 smoke test, open <http://127.0.0.1:8000/?autostart=1>.

The launch page starts with `-quick -nodemo -noautoload -nosetup` and mounts the staged game files at `/game`. Configuration and saves are currently ephemeral MEMFS files; IndexedDB persistence is not enabled yet.

## Current browser scope

- Single-player NBlood with the classic 8-bit software renderer
- Keyboard and mouse input through SDL2
- SDL stereo output through Web Audio; the first canvas click resumes the browser audio context
- DOM fullscreen button with pixelated scaling from the 960×600 internal canvas
- No networking, OpenGL renderer, video cutscenes, or persistent saves yet
