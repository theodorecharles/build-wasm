#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'web/wasm-game.json'), 'utf8'));
const dataManifest = JSON.parse(fs.readFileSync(path.join(repo, 'web/wasm-game-data.json'), 'utf8'));

assert.equal(manifest.identity, false);
assert.equal(manifest.fullscreen, true);
assert.equal(manifest.pointerLock, true);
for (const variant of ['blood', 'duke3d']) {
  const config = manifest.variants[variant];
  assert.equal(config.displayMode, '4:3');
  assert.equal(config.canvasWidth / config.canvasHeight, 4 / 3);
  assert.equal(config.graphics, false, `${variant} must not advertise unavailable renderer profiles`);
  assert.equal(config.advanced, false);
  assert.doesNotMatch(config.description, /files?|data|cache|container|directory|folder/i,
    `${variant} ready copy must describe the game rather than provisioning`);
  assert.ok(config.provisioningText, `${variant} missing-data copy is required`);
  assert.ok(config.pwa?.icons?.length, `${variant} needs PWA metadata`);
}

async function exercise(variant) {
  const isBlood = variant === 'blood';
  const source = fs.readFileSync(path.join(repo, `web/${isBlood ? 'blood' : 'duke3d'}-adapter.js`), 'utf8');
  const events = new Map();
  const canvasEvents = new Map();
  const calls = [];
  const transitions = [];
  const timers = [];
  let createdPolicy;
  let loadedPolicy;
  let module;

  const canvas = { addEventListener(type, listener) { canvasEvents.set(type, listener); } };
  const document = {
    visibilityState: 'visible',
    documentElement: { dataset: {} },
    addEventListener(type, listener) { events.set(type, listener); },
    createElement(type) { assert.equal(type, 'script'); return {}; },
    head: {
      appendChild(script) {
        assert.equal(script.src, isBlood ? '/blood.js' : '/duke3d.js');
        module = sandbox.Module;
        module.FS = {
          filesystems: { IDBFS: {} }, mkdirTree() {}, mount() {}, syncfs(_populate, callback) { callback(); }, chmod() {}
        };
        module.addRunDependency = () => {};
        module.removeRunDependency = () => {};
        module.callMain = arguments_ => calls.push(['callMain', Array.from(arguments_)]);
        const prefix = isBlood ? '_NBlood_Wasm' : '_Duke_Wasm';
        module[`${prefix}RuntimeState`] = () => 1;
        module[`${prefix}EnsureMenu`] = () => calls.push(['menu']);
        module[`${prefix}SetPointerLock`] = value => calls.push(['capture', value]);
        module[`${prefix}ControlsMask`] = () => 31;
        module[`${prefix}FlushPersistence`] = () => calls.push(['flush']);
        queueMicrotask(() => module.onRuntimeInitialized());
      }
    }
  };
  const window = {
    addEventListener(type, listener) { events.set(type, listener); },
    setInterval(callback) { timers.push(callback); return timers.length; },
    clearInterval() {}
  };
  const sandbox = {
    console, document, window, URLSearchParams, location: { search: '' },
    crypto: { subtle: { digest: async () => new ArrayBuffer(32) } },
    fetch: async request => {
      assert.equal(request, '/wasm-game-data.json');
      return { ok: true, json: async () => dataManifest };
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: `${variant}-adapter.js` });
  const adapter = sandbox.WasmGameAdapter;
  const context = {
    variant,
    elements: { canvas },
    framework: {
      createOwnerDataSet(policy) { createdPolicy = policy; return policy; },
      async mountOwnerFiles(currentModule, data, options) {
        assert.equal(currentModule, module);
        assert.equal(data.policy, createdPolicy);
        assert.equal(options.root, '/game');
        calls.push(['mount']);
      }
    },
    dataClient: {
      async load(policy) {
        loadedPolicy = policy;
        return {
          policy,
          entries: policy.files.map(file => ({ cached: true, policy: { path: file.mountName } }))
        };
      }
    },
    shell: { resumeAudio() {}, engineState() { return transitions.at(-1) || 'launcher'; } },
    setLoading() {}, log() {},
    showRuntime(state) { transitions.push(state); },
    setEngineState(state) { transitions.push(state); }
  };

  assert.equal(adapter.readEngineState(), 'menu');
  await adapter.init(context);
  assert.equal(createdPolicy.namespace, dataManifest.variants[variant].namespace || dataManifest.namespace);
  await adapter.start(context);
  assert.equal(loadedPolicy, createdPolicy);
  assert.equal(adapter.readEngineState(), 'gameplay');
  assert.equal(transitions.at(-1), 'gameplay');
  assert.ok(calls.some(call => call[0] === 'mount'));
  const launch = calls.find(call => call[0] === 'callMain');
  assert.ok(launch);
  assert.ok(launch[1].includes('/game') || launch[1].includes('-game_dir=/game'));
  adapter.inputCaptureChanged(true);
  assert.deepEqual(calls.at(-1), ['capture', 1]);
  adapter.captureLost();
  assert.deepEqual(calls.at(-1), ['menu']);
  assert.ok(timers.length, 'native state telemetry must remain active');
  timers[0]();
  assert.equal(document.documentElement.dataset[isBlood ? 'bloodControlsValid' : 'dukeControlsValid'], 'true');
}

(async () => {
  await exercise('blood');
  await exercise('duke3d');
  console.log('Build-family state, capture, mount, display, profile, and manifest contracts passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
