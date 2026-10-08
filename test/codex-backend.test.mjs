import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createBackend } from '../providers/codex/index.mjs';

class Client extends EventEmitter {
  initialized = 0;
  accountReads = 0;
  closed = false;
  async initialize() { this.initialized++; }
  async request() {
    this.accountReads++;
    return { account: { type: 'chatgpt' }, requiresOpenaiAuth: true };
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.emit('disconnected', new Error('closed'));
  }
}

test('concurrent and subsequent translations reuse one initialized connection', async () => {
  const clients = [];
  const seen = [];
  const backend = createBackend({
    createClient: () => { const c = new Client(); clients.push(c); return c; },
    translateImpl: async (client, text, options) => {
      seen.push({ client, text, options });
      return { translation: text };
    },
    model: 'configured-model', effort: 'low',
  });
  try {
    assert.deepEqual(await Promise.all([backend.translate('one'), backend.translate('two')]),
      [{ translation: 'one' }, { translation: 'two' }]);
    await backend.translate('three');
    assert.equal(clients.length, 1);
    assert.equal(clients[0].initialized, 1);
    assert.equal(clients[0].accountReads, 1);
    assert.equal(clients[0].closed, false);
    assert.ok(seen.every(x => x.client === clients[0]));
    assert.equal(seen[0].options.model, 'configured-model');
    assert.equal(seen[0].options.effort, 'low');
    const health = await backend.status();
    assert.equal(health.connected, true); assert.equal(health.authType, 'chatgpt');
    assert.equal(health.providerId, 'codex'); assert.equal(health.model, 'configured-model');
    assert.equal(clients[0].accountReads, 2);
  } finally { backend.close(); }
  assert.equal(clients[0].closed, true);
  await assert.rejects(backend.translate('after close'), /關閉/);
});

test('model discovery paginates and shares the translation connection', async () => {
  const c = new Client();
  const base = c.request.bind(c);
  const pages = [];
  c.request = async (method, params) => {
    if (method !== 'model/list') return base(method, params);
    pages.push(params.cursor);
    return params.cursor ? { data: [{ model: 'text', inputModalities: ['text'] }, { model: 'image', inputModalities: ['image'] }], nextCursor: null }
      : { data: [{ model: 'legacy' }, { model: 'hidden', hidden: true }], nextCursor: 'page2' };
  };
  let options;
  const backend = createBackend({ createClient: () => c, translateImpl: async (_, text, config) => { options = config; return { translation: text }; } });
  try {
    assert.deepEqual((await backend.listModels()).map(m => m.model), ['legacy', 'text']);
    assert.deepEqual(pages, [undefined, 'page2']);
    backend.configure({ model: 'text', effort: 'low' });
    await backend.translate('hello');
    assert.equal(c.initialized, 1);
    assert.equal(options.model, 'text');
  } finally { backend.close(); }
});

test('disconnect is recovered on the next request without replaying failed work', async () => {
  const clients = [];
  let calls = 0;
  const backend = createBackend({
    createClient: () => { const c = new Client(); clients.push(c); return c; },
    translateImpl: async client => {
      if (++calls === 1) { client.close(); throw new Error('connection lost'); }
      return { translation: '成功' };
    },
  });
  try {
    await assert.rejects(backend.translate('first'), /connection lost/);
    assert.equal(calls, 1);
    assert.deepEqual(await backend.translate('second'), { translation: '成功' });
    assert.equal(clients.length, 2);
  } finally { backend.close(); }
});

test('failed initialization or missing login releases the client and permits retry', async () => {
  for (const failure of ['initialize', 'account']) {
    const clients = [];
    const backend = createBackend({
      createClient: () => {
        const c = new Client();
        if (!clients.length) {
          if (failure === 'initialize') c.initialize = () => { throw new Error('initialization failed'); };
          else c.request = async () => ({ account: null, requiresOpenaiAuth: true });
        }
        clients.push(c);
        return c;
      },
      translateImpl: async () => ({ translation: '成功' }),
    });
    try {
      await assert.rejects(backend.translate('first'), /initialization failed|尚未登入/);
      assert.equal(clients[0].closed, true);
      assert.deepEqual(await backend.translate('retry'), { translation: '成功' });
      assert.equal(clients.length, 2);
    } finally { backend.close(); }
  }
});

test('closing during initialization prevents a new translation from starting', async () => {
  let resume;
  const c = new Client();
  c.initialize = () => new Promise(resolve => { resume = resolve; });
  let started = false;
  const backend = createBackend({ createClient: () => c, translateImpl: async () => { started = true; } });
  const pending = backend.translate('hello');
  backend.close();
  resume();
  await assert.rejects(pending, /closed/);
  assert.equal(started, false);
});


test('Codex health cache identity changes with model settings and server instance', async () => {
  const backend = createBackend({ createClient: () => new Client(), model: 'first-model' });
  const other = createBackend({ createClient: () => new Client(), model: 'first-model' });
  try {
    const first = (await backend.status()).cacheIdentity;
    assert.equal((await backend.status()).cacheIdentity, first);
    assert.notEqual((await other.status()).cacheIdentity, first);
    backend.configure({ model: 'second-model', effort: 'low' });
    assert.notEqual((await backend.status()).cacheIdentity, first);
  } finally { backend.close(); other.close(); }
});
