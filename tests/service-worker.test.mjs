import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function activate(cacheNames, { remove = async () => true } = {}) {
  const listeners = new Map();
  const deleted = [];
  let claims = 0;
  const context = vm.createContext({
    console: { log() {}, error() {} },
    self: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      clients: { claim: async () => { claims += 1; } },
    },
    caches: {
      keys: async () => cacheNames,
      delete: async name => { deleted.push(name); return remove(name); },
    },
  });
  vm.runInContext(source, context);
  const current = vm.runInContext('[STATIC_CACHE, DATA_CACHE]', context);
  let lifetime;
  listeners.get('activate')({ waitUntil: promise => { lifetime = promise; } });
  return { lifetime, deleted, current: Array.from(current), claims: () => claims };
}

test('activation removes only older static/data caches owned by sandai-bus', async () => {
  const unrelated = ['other-app-v1', 'workbox-precache-v2', 'sandai-bus-custom',
    'sandai-bus-static', 'sandai-bus-data', 'prefix-sandai-bus-data-v0'];
  const run = activate(['sandai-bus-static-v0.9', 'sandai-bus-data-v1.0', ...unrelated]);
  await run.lifetime;
  assert.deepEqual(run.deleted, ['sandai-bus-static-v0.9', 'sandai-bus-data-v1.0']);
  assert.equal(run.claims(), 1);
});

test('activation preserves current caches as well as unrelated caches', async () => {
  const probe = activate([]);
  await probe.lifetime;
  const run = activate([...probe.current, 'another-app-cache']);
  await run.lifetime;
  assert.deepEqual(run.deleted, []);
  assert.equal(run.claims(), 1);
});

test('activation still cleans both owned families while keeping their current versions', async () => {
  const probe = activate([]);
  await probe.lifetime;
  const run = activate([...probe.current, 'sandai-bus-static-v1.1.0', 'sandai-bus-data-v1.1.1']);
  await run.lifetime;
  assert.deepEqual(run.deleted, ['sandai-bus-static-v1.1.0', 'sandai-bus-data-v1.1.1']);
});

test('empty cache storage is safe', async () => {
  const run = activate([]);
  await run.lifetime;
  assert.deepEqual(run.deleted, []);
  assert.equal(run.claims(), 1);
});

test('activation lifetime covers owned-cache deletion before claiming clients', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const run = activate(['sandai-bus-data-v0'], { remove: () => pending });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(run.deleted, ['sandai-bus-data-v0']);
  assert.equal(run.claims(), 0);
  release(true);
  await run.lifetime;
  assert.equal(run.claims(), 1);
});

test('owned-cache deletion failure rejects activation and does not claim clients', async () => {
  const failure = new Error('cache unavailable');
  const run = activate(['sandai-bus-static-v0'], { remove: async () => { throw failure; } });
  await assert.rejects(run.lifetime, error => error === failure);
  assert.equal(run.claims(), 0);
});

