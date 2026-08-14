const CACHE_NAME = 'blood-wasm-retail-v2';
const CACHE_PREFIX = '/__blood_local_data__/';
const VALIDATION_VERSION = '2';

const pathName = (value) => String(value || '').replaceAll('\\', '/').replace(/^\/+/, '');

function basename(assetPath) {
  return pathName(assetPath).split('/').pop();
}

function cacheRequest(assetPath) {
  const encoded = pathName(assetPath).split('/').map(encodeURIComponent).join('/');
  return new Request(new URL(CACHE_PREFIX + encoded, location.origin), { method: 'GET' });
}

function resolveDestination(file, assets) {
  const relative = pathName(file.relativePath || file.file?.webkitRelativePath || file.file?.name);
  const exact = assets.filter((asset) => relative === asset.path || relative.endsWith('/' + asset.path));
  if (exact.length === 1) return exact[0];

  const sameName = assets.filter((asset) => basename(asset.path).toLowerCase() === basename(relative).toLowerCase());
  return sameName.length === 1 ? sameName[0] : null;
}

async function readEntry(entry, prefix = '') {
  if (entry.isFile) {
    return new Promise((resolve, reject) => entry.file(
      (file) => resolve([{ file, relativePath: pathName(prefix + file.name) }]),
      reject,
    ));
  }
  if (!entry.isDirectory) return [];
  const reader = entry.createReader();
  const entries = [];
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    entries.push(...batch);
  }
  const files = [];
  for (const child of entries) files.push(...await readEntry(child, prefix + entry.name + '/'));
  return files;
}

async function filesFromDrop(dataTransfer) {
  const items = [...(dataTransfer?.items || [])];
  const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...(dataTransfer?.files || [])].map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
  const files = [];
  for (const entry of entries) files.push(...await readEntry(entry));
  return files;
}

function validSize(asset, size) {
  if (Number.isSafeInteger(asset.size)) return size === asset.size;
  if (Array.isArray(asset.sizes)) return asset.sizes.includes(size);
  return size >= (asset.minSize || 1) && size <= (asset.maxSize || Number.MAX_SAFE_INTEGER);
}

async function validateFile(asset, file) {
  if (!validSize(asset, file.size)) {
    throw new Error(`expected ${asset.size ?? asset.sizes?.join(' or ') ?? 'a valid non-empty file'} bytes, got ${file.size}`);
  }
  if (asset.magic?.length) {
    const actual = new Uint8Array(await file.slice(0, asset.magic.length).arrayBuffer());
    if (asset.magic.some((value, index) => actual[index] !== value)) {
      throw new Error('file signature does not match Blood data');
    }
  }
}

async function cachedAsset(cache, asset) {
  const response = await cache.match(cacheRequest(asset.path));
  if (!response) return false;
  const size = Number(response.headers.get('content-length'));
  const valid = response.headers.get('x-blood-validation') === VALIDATION_VERSION
    && response.headers.get('x-blood-path') === asset.path
    && validSize(asset, size);
  if (!valid) await cache.delete(cacheRequest(asset.path));
  return valid;
}

export async function loadAssetBytes(assetPath) {
  const normalized = pathName(assetPath);
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(cacheRequest(normalized));
  if (!response || response.headers.get('x-blood-validation') !== VALIDATION_VERSION) {
    throw new Error(`${normalized} is not stored in this browser`);
  }
  return response.arrayBuffer();
}

export function setupDataIngest({
  required,
  root = document.querySelector('[data-data-ingest]'),
  onChange = () => {},
}) {
  if (!root) throw new Error('data-ingest root is missing');
  const assets = required.map((asset) => ({
    ...asset,
    path: pathName(asset.path),
    label: asset.label || asset.path,
    optional: Boolean(asset.optional),
  }));
  const list = root.querySelector('[data-data-list]');
  const drop = root.querySelector('[data-data-drop]');
  const picker = root.querySelector('[data-data-picker]');
  const message = root.querySelector('[data-data-message]');
  const progress = root.querySelector('[data-data-progress]');
  const state = new Map();
  let current = { ready: false, present: [], missing: [], optionalMissing: [] };

  function render() {
    list.replaceChildren();
    for (const asset of assets) {
      const present = state.get(asset.path) === true;
      const item = document.createElement('li');
      item.dataset.state = present ? 'present' : 'missing';
      item.textContent = `${present ? '✓' : '○'} ${asset.label}${asset.optional ? ' (optional)' : ''}`;
      list.append(item);
    }
  }

  async function refresh() {
    const cache = await caches.open(CACHE_NAME);
    const results = await Promise.all(assets.map(async (asset) => [asset.path, await cachedAsset(cache, asset)]));
    state.clear();
    for (const [assetPath, present] of results) state.set(assetPath, present);
    const missing = assets.filter((asset) => !asset.optional && !state.get(asset.path));
    const optionalMissing = assets.filter((asset) => asset.optional && !state.get(asset.path));
    current = {
      ready: missing.length === 0,
      present: assets.filter((asset) => state.get(asset.path)).map((asset) => asset.path),
      missing: missing.map((asset) => asset.path),
      optionalMissing: optionalMissing.map((asset) => asset.path),
    };
    render();
    message.textContent = current.ready
      ? 'The required Blood files are validated and stored only in this browser.'
      : `Missing ${missing.length} required file${missing.length === 1 ? '' : 's'}. Drop or choose your legally installed Blood folder.`;
    root.dataset.ready = current.ready ? 'true' : 'false';
    try { onChange(current); } catch (error) { console.error(error); }
    window.dispatchEvent(new CustomEvent('game-data-status', { detail: current }));
    if (current.ready) window.dispatchEvent(new CustomEvent('game-data-ready', { detail: current }));
    return current;
  }

  function selectedFiles(fileList) {
    return [...fileList].map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }));
  }

  async function store(files) {
    const targets = [];
    const errors = [];
    for (const candidate of files) {
      const asset = resolveDestination(candidate, assets);
      if (!asset) continue;
      targets.push({ ...candidate, asset });
    }
    const unique = [...new Map(targets.map((candidate) => [candidate.asset.path, candidate])).values()];
    if (!unique.length) {
      message.textContent = 'No recognized Blood files were selected.';
      return refresh();
    }

    const cache = await caches.open(CACHE_NAME);
    progress.hidden = false;
    progress.max = unique.length;
    progress.value = 0;
    for (const [index, candidate] of unique.entries()) {
      const { asset, file } = candidate;
      message.textContent = `Validating ${asset.path} (${index + 1}/${unique.length})…`;
      try {
        await validateFile(asset, file);
        await cache.put(cacheRequest(asset.path), new Response(file, {
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': String(file.size),
            'x-blood-path': asset.path,
            'x-blood-validation': VALIDATION_VERSION,
          },
        }));
      } catch (error) {
        errors.push(`${asset.path}: ${error.message}`);
      }
      progress.value = index + 1;
    }
    progress.hidden = true;
    if (errors.length) message.textContent = `Some files were rejected: ${errors.join(' · ')}`;
    return refresh();
  }

  async function importLocalDevData() {
    if (new URLSearchParams(location.search).get('devdata') !== '1') return null;
    message.textContent = 'Importing owner data from the local-only Chromium test server…';
    const files = [];
    for (const asset of assets.filter((candidate) => !candidate.optional)) {
      const response = await fetch(`/dev-data/${encodeURIComponent(asset.path)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${asset.path}: HTTP ${response.status}`);
      const blob = await response.blob();
      files.push({ file: new File([blob], basename(asset.path)), relativePath: asset.path });
    }
    return store(files);
  }

  picker.addEventListener('change', () => store(selectedFiles(picker.files)));
  drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.dataset.dragging = 'true';
  });
  drop.addEventListener('dragleave', () => { delete drop.dataset.dragging; });
  drop.addEventListener('drop', async (event) => {
    event.preventDefault();
    delete drop.dataset.dragging;
    try { await store(await filesFromDrop(event.dataTransfer)); }
    catch (error) { message.textContent = `Could not read the dropped files: ${error.message}`; }
  });

  const ready = refresh().then(async (state) => {
    if (state.ready) return state;
    try { return await importLocalDevData() || state; }
    catch (error) {
      message.textContent = `Local test import failed: ${error.message}`;
      throw error;
    }
  });
  return { refresh, ready, state: () => current };
}
