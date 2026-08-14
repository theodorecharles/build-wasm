(() => {
  'use strict';

  let engine = null;
  let ownerData = null;
  let started = false;
  let runtimePromise = null;
  let telemetryTimer = 0;
  let lastEscapeAt = 0;

  function diagnostics() {
    return globalThis.__bloodWasmDiagnostics = globalThis.__bloodWasmDiagnostics || {
      level: null,
      simulationFrames: 0,
      inputSeen: false,
      lastInput: null,
      inputMode: null,
      gameplayInput: false,
      playerPosition: null,
      running: false
    };
  }

  function nativeState() {
    if (!started || typeof engine?._NBlood_WasmRuntimeState !== 'function') return 'menu';
    return ['menu', 'gameplay', 'paused', 'debrief', 'loading'][engine._NBlood_WasmRuntimeState()] || 'menu';
  }

  function captureIntent() {
    return Boolean(started && typeof engine?._NBlood_WasmCaptureIntent === 'function' &&
      engine._NBlood_WasmCaptureIntent());
  }

  function synchronizeState(ctx, event, captureGameplay) {
    const state = nativeState();
    const shouldCapture = captureGameplay && (state === 'gameplay' || (state === 'loading' && captureIntent()));
    if (state !== ctx.shell.engineState() || shouldCapture) {
      ctx.setEngineState(state, shouldCapture
        ? { capture: true, event }
        : undefined);
    }
    return state;
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
        preRun: [() => {
          const persistentDirectory = '/home/web_user/.config/nblood';
          const dependency = 'nblood-idbfs';
          let dependencyAdded = false;
          document.documentElement.dataset.persistence = 'loading';
          try {
            engine.FS.filesystems.IDBFS.onAutoPersistStateChanged = active => {
              document.documentElement.dataset.persistence = active ? 'saving' : 'ready';
            };
            engine.FS.mkdirTree(persistentDirectory);
            engine.FS.mount(engine.FS.filesystems.IDBFS, { autoPersist: true }, persistentDirectory);
            engine.addRunDependency(dependency);
            dependencyAdded = true;
            engine.FS.syncfs(true, error => {
              document.documentElement.dataset.persistence = error ? 'unavailable' : 'ready';
              if (error) ctx.log(`Persistent storage unavailable: ${error}`);
              else ctx.log('Persistent saves and configuration loaded.');
              engine.removeRunDependency(dependency);
            });
          } catch (error) {
            if (dependencyAdded) engine.removeRunDependency(dependency);
            document.documentElement.dataset.persistence = 'unavailable';
            ctx.log(`Could not initialize persistent storage: ${error}`);
          }
        }],
        print: (...args) => { console.log('[NBlood WASM]', ...args); ctx.log(args.join(' ')); },
        printErr: (...args) => { console.error('[NBlood WASM]', ...args); ctx.log(`ERROR: ${args.join(' ')}`); },
        setStatus: message => { if (message) ctx.setLoading('Loading Blood engine…'); },
        monitorRunDependencies: remaining => {
          if (remaining) ctx.setLoading('Loading Blood engine…', `${remaining} dependencies remaining`);
        },
        onRuntimeInitialized: () => resolve(engine),
        onAbort: reason => {
          ctx.log(`Blood stopped: ${reason}`);
          ctx.showRuntime('crashed');
          reject(new Error(`Blood stopped: ${reason}`));
        }
      };
      loadScript('/blood.js').catch(reject);
    });
    return runtimePromise;
  }

  async function mountOwnerData(ctx, data) {
    await ctx.framework.mountOwnerFiles(engine, data, {
      root: '/game',
      mode: 'memfs',
      preservePaths: true,
      onProgress(detail) {
        if (detail.phase !== 'mounting' || !detail.total) return;
        ctx.setLoading('Preparing Blood…', `${Math.floor(detail.copied * 100 / detail.total)}%`, 60 + detail.copied * 35 / detail.total);
      }
    });
    engine.FS.chmod('/game', 0o555);
  }

  function launchArguments(data) {
    const parameters = new URLSearchParams(location.search);
    const campaign = parameters.get('campaign') === 'cryptic' ? 'cryptic' : 'blood';
    const intro = parameters.get('intro') === '1';
    const demos = parameters.get('demos') === '1';
    const autostart = parameters.get('autostart') === '1';
    const paths = new Set(data.entries.map(entry => String(entry.policy.path || '').toLowerCase()));
    if (campaign === 'cryptic' && !paths.has('cryptic.ini')) {
      throw new Error('Cryptic Passage was requested but its optional data is not installed in this container.');
    }
    const args = ['-game_dir=/game', '-noautoload', '-nosetup'];
    if (campaign === 'cryptic') args.push('-ini=CRYPTIC.INI');
    if (!intro || autostart) args.push('-quick');
    if (!demos || autostart) args.push('-nodemo');
    if (autostart) args.push(campaign === 'cryptic' ? '-map=CP01.MAP' : '-map=E1M1.MAP');
    document.documentElement.dataset.campaign = campaign;
    document.documentElement.dataset.intro = String(intro);
    document.documentElement.dataset.demos = String(demos && !autostart);
    return args;
  }

  function startTelemetry(ctx) {
    window.clearInterval(telemetryTimer);
    telemetryTimer = window.setInterval(() => {
      const state = nativeState();
      if (state !== ctx.shell.engineState()) synchronizeState(ctx, null, false);
      if (typeof engine?._NBlood_WasmControlsMask === 'function') {
        const mask = engine._NBlood_WasmControlsMask();
        document.documentElement.dataset.bloodControlsMask = String(mask);
        document.documentElement.dataset.bloodControlsValid = String(mask === 31);
      }
      const audioContext = engine?.SDL2?.audioContext;
      if (audioContext) document.documentElement.dataset.audioState = audioContext.state;
    }, 250);
  }

  function flushPersistence() {
    if (!started) return;
    try { engine?._NBlood_WasmFlushPersistence?.(); }
    catch (error) { console.warn('[NBlood WASM] Could not flush configuration', error); }
  }

  globalThis.WasmGameAdapter = Object.freeze({
    async init(ctx) {
      diagnostics();
      document.documentElement.dataset.audioState = 'not-created';
      document.documentElement.dataset.persistence = 'not-started';
      const manifest = await fetch('/wasm-game-data.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Blood data policy failed with HTTP ${response.status}.`);
        return response.json();
      });
      const policy = manifest.variants?.blood || manifest;
      ownerData = ctx.framework.createOwnerDataSet({
        namespace: policy.namespace || manifest.namespace,
        version: policy.version || manifest.version,
        files: policy.files.map(spec => ({
          ...spec,
          mountName: spec.path,
          validateCached: false,
          validate: async file => {
            ctx.setLoading('Preparing Blood…');
            if (await sha256Hex(file) !== spec.sha256) throw new Error(`${spec.path} failed SHA-256 verification.`);
          }
        }))
      });
      ctx.elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
      document.addEventListener('keyup', event => {
        if (!started || (event.key !== 'Enter' && event.key !== 'Escape')) return;
        queueMicrotask(() => synchronizeState(ctx, event, true));
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') lastEscapeAt = performance.now();
      }, true);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPersistence();
        else void ctx.shell.resumeAudio();
      });
      window.addEventListener('pagehide', flushPersistence);
      window.addEventListener('nblood-exit', () => {
        diagnostics().running = false;
        ctx.setEngineState('crashed');
        ctx.log('Blood exited; reload the page to start another session.');
      });
    },

    async start(ctx) {
      if (started) return;
      void ctx.shell.resumeAudio();
      ctx.setLoading('Preparing Blood…', '', 5);
      const data = await ctx.dataClient.load(ownerData, {
        onProgress(detail) {
          if (detail.phase === 'checking-cache') ctx.setLoading('Preparing Blood…');
          if (detail.phase === 'downloading') {
            const percent = detail.total ? Math.floor(detail.received * 100 / detail.total) : 0;
            ctx.setLoading('Preparing Blood…', `${percent}%`, Math.min(50, 5 + percent * 0.45));
          }
          if (detail.phase === 'restored') ctx.setLoading('Preparing Blood…');
        }
      });
      document.documentElement.dataset.wasmDataSource = data.entries.every(entry => entry.cached) ? 'cache' : 'container';
      const args = launchArguments(data);
      ctx.setLoading('Loading Blood engine…', '', 55);
      await loadEngine(ctx);
      await mountOwnerData(ctx, data);
      started = true;
      diagnostics().running = true;
      ctx.setLoading('Starting Blood…', '', 98);
      try { engine.callMain(args); }
      catch (error) { if (error !== 'unwind') throw error; }
      ctx.showRuntime(nativeState());
      startTelemetry(ctx);
    },

    readEngineState() { return nativeState(); },
    readCaptureIntent() { return captureIntent(); },
    captureLost(_detail, ctx) {
      if (started && performance.now() - lastEscapeAt > 750 &&
          typeof engine?._NBlood_WasmEnsureMenu === 'function') engine._NBlood_WasmEnsureMenu();
      if (started) synchronizeState(ctx, null, false);
    },
    inputCaptureChanged(captured) {
      document.documentElement.dataset.pointerLocked = String(captured);
      if (started && typeof engine?._NBlood_WasmSetPointerLock === 'function') {
        engine._NBlood_WasmSetPointerLock(captured ? 1 : 0);
      }
    }
  });
})();
