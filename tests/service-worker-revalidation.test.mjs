import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function observe(promise) {
  const state = { status: 'pending' };
  promise.then(
    value => { state.status = 'fulfilled'; state.value = value; },
    error => { state.status = 'rejected'; state.error = error; },
  );
  return state;
}

function dispatch({
  path = '/time.json', cached, network = async () => new Response('fresh'),
  put = async () => {}, openGate = Promise.resolve(), match,
} = {}) {
  const listeners = new Map();
  const calls = { opened: [], fetched: [], writes: [] };
  const cache = {
    match: match || (async () => cached),
    put: (request, response) => { calls.writes.push({ request, response }); return put(); },
  };
  const context = vm.createContext({
    URL,
    console: { log() {}, error() {} },
    self: { addEventListener: (name, callback) => listeners.set(name, callback) },
    caches: { open: async name => { calls.opened.push(name); await openGate; return cache; } },
    fetch: request => { calls.fetched.push(request); return network(); },
  });
  vm.runInContext(source, context);
  const request = { url: `https://example.test${path}`, cache: 'default', mode: 'cors' };
  const lifetimes = [];
  let dispatching = true;
  let response;
  listeners.get('fetch')({
    request,
    respondWith(promise) {
      assert.ok(dispatching, 'respondWith must be registered during dispatch');
      response = Promise.resolve(promise);
    },
    waitUntil(promise) {
      assert.ok(dispatching, 'initial waitUntil must be registered during dispatch');
      lifetimes.push(Promise.resolve(promise));
    },
  });
  dispatching = false;
  const lifetime = Promise.all(lifetimes);
  return {
    request, response, lifetime, lifetimes, calls,
    responseState: observe(response), lifetimeState: observe(lifetime),
  };
}

for (const [path, family] of [['/time.json', 'data'], ['/styles.css', 'static'], ['/script.js', 'static']]) {
  test(`${path} registers background lifetime synchronously before opening the cache completes`, async () => {
    const open = deferred();
    const run = dispatch({ path, openGate: open.promise });
    assert.equal(run.lifetimes.length, 1);
    assert.match(run.calls.opened[0], new RegExp(`^sandai-bus-${family}-v`));
    assert.equal(run.calls.fetched.length, 0);
    await nextTurn();
    assert.equal(run.lifetimeState.status, 'pending');
    open.resolve();
    assert.equal((await run.response).status, 200);
    await run.lifetime;
  });
}

test('a cached response is immediate while lifetime covers both deferred fetch and cache write', async () => {
  const cached = new Response('cached');
  const network = deferred();
  const write = deferred();
  const fresh = new Response('fresh');
  const run = dispatch({ cached, network: () => network.promise, put: () => write.promise });
  await nextTurn();
  assert.equal(run.responseState.value, cached);
  assert.equal(run.lifetimeState.status, 'pending');
  assert.equal(run.calls.fetched.length, 1);
  assert.equal(run.calls.fetched[0], run.request);
  assert.equal(run.calls.writes.length, 0);
  network.resolve(fresh);
  await nextTurn();
  assert.equal(run.lifetimeState.status, 'pending');
  assert.equal(run.calls.writes.length, 1);
  assert.equal(run.calls.writes[0].request, run.request);
  assert.notEqual(run.calls.writes[0].response, fresh);
  assert.equal(await run.calls.writes[0].response.text(), 'fresh');
  assert.equal(fresh.bodyUsed, false);
  write.resolve();
  await run.lifetime;
  assert.equal(await run.response, cached);
});

test('a cache miss returns the network response without waiting for a deferred cache write', async () => {
  const network = deferred();
  const write = deferred();
  const fresh = new Response('fresh');
  const run = dispatch({ network: () => network.promise, put: () => write.promise });
  await nextTurn();
  assert.equal(run.responseState.status, 'pending');
  assert.equal(run.lifetimeState.status, 'pending');
  network.resolve(fresh);
  await nextTurn();
  assert.equal(run.responseState.value, fresh);
  assert.equal(run.calls.writes.length, 1);
  assert.equal(run.lifetimeState.status, 'pending');
  write.resolve();
  await run.lifetime;
  assert.equal(await fresh.text(), 'fresh');
});

for (const cached of [undefined, new Response('cached')]) {
  const scenario = cached ? 'cache hit' : 'cache miss';
  test(`offline ${scenario} keeps the existing response/failure behavior and handles background rejection`, async () => {
    const failure = new Error('offline');
    const run = dispatch({ cached, network: async () => { throw failure; } });
    if (cached) assert.equal(await run.response, cached);
    else await assert.rejects(run.response, error => error === failure);
    await run.lifetime;
    await nextTurn();
    assert.equal(run.calls.writes.length, 0);
  });

  test(`rejected cache.put on ${scenario} does not replace the response or leave an unhandled rejection`, async () => {
    const fresh = new Response('fresh');
    const write = deferred();
    const run = dispatch({ cached, network: async () => fresh, put: () => write.promise });
    await nextTurn();
    assert.equal(run.responseState.value, cached || fresh);
    write.reject(new Error('quota exceeded'));
    await run.lifetime;
    await nextTurn(); // node:test reports any detached rejection as a test failure.
    assert.equal(await run.response, cached || fresh);
    assert.equal(run.calls.writes.length, 1);
  });

  for (const status of [404, 503]) {
    test(`HTTP ${status} on ${scenario} is not cached and preserves the correct response`, async () => {
      const errorResponse = new Response('unavailable', { status });
      const run = dispatch({ cached, network: async () => errorResponse });
      assert.equal(await run.response, cached || errorResponse);
      await run.lifetime;
      assert.equal(run.calls.writes.length, 0);
    });
  }
}

for (const stage of ['open', 'match']) {
  test(`cache ${stage} failure still rejects the response and does not start a fetch`, async () => {
    const failure = new Error(`cache ${stage} failed`);
    const options = stage === 'open'
      ? { openGate: Promise.reject(failure) }
      : { match: async () => { throw failure; } };
    const run = dispatch(options);
    await assert.rejects(run.response, error => error === failure);
    await run.lifetime;
    await nextTurn();
    assert.equal(run.calls.fetched.length, 0);
    assert.equal(run.calls.writes.length, 0);
  });
}
