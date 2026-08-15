(() => {
  'use strict';

  let engine = null;
  let ownerData = null;
  let started = false;
  let runtimePromise = null;
  let telemetryTimer = 0;
  let context = null;

  function nativeState() {
    if (!started || typeof engine?._Duke_WasmRuntimeState !== 'function') return 'menu';
    return ['menu', 'gameplay', 'paused'][engine._Duke_WasmRuntimeState()] || 'menu';
  }

  async function sha256Hex(file) {
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256 verification requires HTTPS or localhost.');
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${source}.`));
      document.head.appendChild(script);
    });
  }

  async function loadEngine(ctx) {
    if (runtimePromise) return runtimePromise;
    runtimePromise = new Promise((resolve, reject) => {
      engine = globalThis.Module = {
        canvas: ctx.elements.canvas,
        noInitialRun: true,
        print: (...args) => { console.log('[Duke WASM]', ...args); ctx.log(args.join(' ')); },
        printErr: (...args) => {
          const line = args.join(' ');
          if (/\b(error|fatal|abort|unreachable)\b/i.test(line)) {
            console.error('[Duke WASM]', ...args);
            ctx.log(`ERROR: ${line}`);
          } else {
            console.log('[Duke WASM]', ...args);
            ctx.log(line);
          }
        },
        setStatus: message => { if (message) ctx.setLoading('Preparing Duke Nukem 3D…'); },
        monitorRunDependencies: remaining => {
          if (remaining) ctx.setLoading('Preparing Duke Nukem 3D…');
        },
        onRuntimeInitialized: () => resolve(engine),
        onAbort: reason => {
          ctx.log(`Duke Nukem 3D stopped: ${reason}`);
          ctx.showRuntime('crashed');
          reject(new Error(`Duke Nukem 3D stopped: ${reason}`));
        }
      };
      loadScript('/duke3d.js').catch(reject);
    });
    return runtimePromise;
  }

  function startTelemetry(ctx) {
    window.clearInterval(telemetryTimer);
    telemetryTimer = window.setInterval(() => {
      const state = nativeState();
      if (state !== ctx.shell.engineState()) ctx.setEngineState(state);
      if (typeof engine?._Duke_WasmControlsMask === 'function') {
        const mask = engine._Duke_WasmControlsMask();
        document.documentElement.dataset.dukeControlsMask = String(mask);
        document.documentElement.dataset.dukeControlsValid = String(mask === 31);
      }
      const audioContext = engine?.SDL2?.audioContext;
      if (audioContext) document.documentElement.dataset.audioState = audioContext.state;
    }, 250);
  }

  function flushPersistence() {
    if (!started) return;
    try { engine?._Duke_WasmFlushPersistence?.(); }
    catch (error) { console.warn('[Duke WASM] Could not flush configuration', error); }
    context?.persistence?.markDirty();
    void context?.persistence?.save();
  }

  function controllerFrame(detail) {
    if (!started || typeof engine?._Build_WasmControllerFrame !== 'function') return;
    const actions = detail.actions || {};
    const menu = nativeState() !== 'gameplay';
    let keys = 0;
    const held = (name, threshold = 0.4) => Number(actions[name]) > threshold;
    if (menu) {
      if (held('forward') || held('up')) keys |= 1 << 11;
      if (held('backward') || held('down')) keys |= 1 << 12;
      if (held('left')) keys |= 1 << 13;
      if (held('right')) keys |= 1 << 14;
      if (held('jump') || held('attack')) keys |= 1 << 7;
      if (held('crouch') || held('menu')) keys |= 1 << 10;
    } else {
      if (held('forward')) keys |= 1 << 0;
      if (held('backward')) keys |= 1 << 1;
      if (held('left')) keys |= 1 << 2;
      if (held('right')) keys |= 1 << 3;
      if (held('jump')) keys |= 1 << 4;
      if (held('crouch')) keys |= 1 << 5;
      if (held('reload')) keys |= 1 << 6;
      if (held('sprint')) keys |= 1 << 8;
      if (held('scoreboard')) keys |= 1 << 9;
      if (held('menu')) keys |= 1 << 10;
      if (held('melee')) keys |= 1 << 15;
    }
    let mouse = 0;
    if (!menu && held('attack')) mouse |= 1;
    if (!menu && held('altAttack')) mouse |= 2;
    if (!menu && held('previousWeapon')) mouse |= 16;
    if (!menu && held('nextWeapon')) mouse |= 32;
    const scale = Math.max(1, detail.deltaMs || 16);
    engine._Build_WasmControllerFrame(keys,
      menu ? 0 : Math.round(Number(actions.lookX || 0) * scale),
      menu ? 0 : Math.round(Number(actions.lookY || 0) * scale), mouse);
  }

  function releaseController() {
    engine?._Build_WasmControllerFrame?.(0, 0, 0, 0);
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(ctx) {
      context = ctx;
      document.documentElement.dataset.audioState = 'not-created';
      document.documentElement.dataset.persistence = 'not-started';
      const manifest = await fetch('/wasm-game-data.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Duke Nukem 3D data policy failed with HTTP ${response.status}.`);
        return response.json();
      });
      const policy = manifest.variants?.duke3d || manifest;
      ownerData = ctx.framework.createOwnerDataSet({
        namespace: policy.namespace || manifest.namespace,
        version: policy.version || manifest.version,
        files: policy.files.map(spec => ({
          ...spec,
          mountName: spec.path,
          validateCached: false,
          validate: async file => {
            ctx.setLoading('Preparing Duke Nukem 3D…');
            if (await sha256Hex(file) !== spec.sha256) throw new Error(`${spec.path} failed SHA-256 verification.`);
          }
        }))
      });
      ctx.elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPersistence();
        else void ctx.shell.resumeAudio();
      });
      window.addEventListener('pagehide', flushPersistence);
    },

    async start(ctx) {
      if (started) return;
      void ctx.shell.resumeAudio();
      ctx.setLoading('Preparing Duke Nukem 3D…', '', 5);
      const data = await ctx.dataClient.load(ownerData, {
        onProgress(detail) {
          if (detail.phase === 'checking-cache') ctx.setLoading('Preparing Duke Nukem 3D…');
          if (detail.phase === 'downloading') {
            const percent = detail.total ? Math.floor(detail.received * 100 / detail.total) : 0;
            ctx.setLoading('Preparing Duke Nukem 3D…', `${percent}%`, Math.min(50, 5 + percent * 0.45));
          }
          if (detail.phase === 'restored') ctx.setLoading('Preparing Duke Nukem 3D…');
        }
      });
      document.documentElement.dataset.wasmDataSource = data.entries.every(entry => entry.cached) ? 'cache' : 'container';
      ctx.setLoading('Preparing Duke Nukem 3D…', '', 55);
      await loadEngine(ctx);
      document.documentElement.dataset.persistence = 'loading';
      await ctx.persistence.attach(engine.FS, { root: ctx.persistence.root });
      document.documentElement.dataset.persistence = 'ready';
      await ctx.framework.mountOwnerFiles(engine, data, {
        root: '/game',
        mode: 'memfs',
        preservePaths: true,
        onProgress(detail) {
          if (detail.phase !== 'mounting' || !detail.total) return;
          ctx.setLoading('Preparing Duke Nukem 3D…', `${Math.floor(detail.copied * 100 / detail.total)}%`, 60 + detail.copied * 35 / detail.total);
        }
      });
      engine.FS.chmod('/game', 0o555);
      started = true;
      ctx.setLoading('Starting Duke Nukem 3D…', '', 98);
      const args = ['-game_dir', '/game', '-gamegrp', 'DUKE3D.GRP', '-noautoload', '-nosetup', '-nologo'];
      try { engine.callMain(args); }
      catch (error) { if (error !== 'unwind') throw error; }
      ctx.showRuntime(nativeState());
      startTelemetry(ctx);
    },

    readEngineState() { return nativeState(); },
    controllerFrame(detail) { controllerFrame(detail); },
    controllerChanged(detail) { if (detail.activeIndex == null || detail.selection === 'disabled') releaseController(); },
    captureLost() {
      if (started && typeof engine?._Duke_WasmEnsureMenu === 'function') engine._Duke_WasmEnsureMenu();
    },
    inputCaptureChanged(captured) {
      document.documentElement.dataset.pointerLocked = String(captured);
      if (started && typeof engine?._Duke_WasmSetPointerLock === 'function') {
        engine._Duke_WasmSetPointerLock(captured ? 1 : 0);
      }
    }
  });
})();
