# NBlood WebAssembly build

This branch builds NBlood for a single-threaded browser runtime using Emscripten's SDL2 port. It selects the classic software renderer, maps SDL video to a 960×600 browser canvas, maps SDL audio to Web Audio, schedules the native game loop with `emscripten_set_main_loop`, and cooperatively yields from native cutscene/fade waits with Asyncify.

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

The helper copies `BLOOD.INI`, the three RFF files, `SURFACE.DAT`, `VOXEL.DAT`, and `TILES000.ART` through `TILES017.ART` into ignored `web/assets/` for local native inspection. When present, it also stages the retail demos, Cryptic Passage files, `LOGO.SMK`/`GTI.SMK` cutscenes, the complete `movie/` directory, and `blood02.ogg` through `blood09.ogg` CD-audio replacements. Never commit or redistribute those files.

The public browser build does not preload `web/assets/`. The launcher lists the required files and accepts a directory drop or picker selection, validates them, and persists them only in the user's private browser cache. It never uploads retail files to the web server. Only after the required set is present does it write the files into the Emscripten `/game` filesystem.

## Build and run

Emscripten is expected at `$HOME/emsdk` by default. Set `EMSDK_DIR` if it lives elsewhere.

```bash
./build-web.sh
./serve-web.sh
```

Then open <http://127.0.0.1:8000/> in Chrome. Drop or choose the Blood installation folder, then click **Play Blood** once the required list is complete. The click starts the game and unlocks audio without capturing the pointer in the menu. Gameplay canvas clicks capture the pointer; engine menus release it. The browser build is emitted to `build-web/dist/`, including the non-retail `data-ingest.js` module; serve it over HTTP rather than opening the HTML file directly.

For a direct E1M1 smoke test, open <http://127.0.0.1:8000/?autostart=1>.

For a direct Cryptic Passage CP01 smoke test, open <http://127.0.0.1:8000/?autostart=1&campaign=cryptic>.

When Cryptic Passage files are available, the start overlay offers a campaign selector. It can also be preselected with <http://127.0.0.1:8000/?campaign=cryptic>.

When the retail logo movies are available, the overlay also offers the original startup sequence. It can be preselected with <http://127.0.0.1:8000/?intro=1>.

When the retail demos are available, the overlay offers the original attract-mode playback. It can be preselected with <http://127.0.0.1:8000/?demos=1>.

The launch page starts with `-quick -nodemo -noautoload -nosetup` by default and mounts the staged game files at `/game`. Configuration and saves under `/home/web_user/.config/nblood` are loaded from and automatically synchronized to IndexedDB. Settings are flushed when a menu closes and when the page is hidden.

## Current browser scope

- Single-player NBlood with the classic 8-bit software renderer
- Keyboard and mouse input through SDL2
- SDL stereo output through Web Audio; the **Play Blood** click resumes the browser audio context
- OGG CD-audio replacements through Emscripten's Vorbis port, enabled by default with automatic MIDI fallback
- Retail Smacker cutscenes when the matching legal files are available
- DOM fullscreen button with pixelated scaling from the 960×600 internal canvas
- IndexedDB-backed settings and save games under NBlood's normal per-user configuration directory
- No networking or OpenGL renderer yet
