import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { CodexClient, parseTranslation, translate } from '../providers/codex/codex.mjs';

const expected = { translation: '我正在學英文。' };

function fakeClient(onTurn) {
  const client = new EventEmitter();
  client.request = async (method, params) => {
    if (method === 'thread/start') return { thread: { id: 'test-thread' } };
    if (method === 'turn/start') {
      queueMicrotask(() => onTurn(client, params));
      return { turn: { id: 'test-turn' } };
    }
    return {};
  };
  return client;
}

function completed(client, status = 'completed', items = []) {
  client.emit('notification', { method: 'turn/completed', params: {
    threadId: 'test-thread', turn: { id: 'test-turn', status, items },
  } });
}

test('collects final message when completion has no items, including early notifications', async () => {
  const client = fakeClient(client => {
    client.emit('notification', { method: 'item/completed', params: {
      threadId: 'test-thread', turnId: 'test-turn',
      item: { id: 'answer', type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(expected) },
    } });
    completed(client);
  });
  assert.deepEqual(await translate(client, 'I am learning English.'), expected);
  assert.equal(client.listenerCount('notification'), 0);
});

test('uses final answer rather than commentary and ignores other threads', async () => {
  const client = fakeClient(client => {
    client.emit('notification', { method: 'turn/completed', params: {
      threadId: 'unrelated', turn: { status: 'failed' },
    } });
    completed(client, 'completed', [
      { id: '1', type: 'agentMessage', phase: 'commentary', text: 'Working...' },
      { id: '2', type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(expected) },
    ]);
  });
  assert.deepEqual(await translate(client, 'Hello'), expected);
});

test('failed turns and disconnects reject instead of producing a translation', async () => {
  await assert.rejects(translate(fakeClient(c => completed(c, 'failed')), 'Hello'), /failed/);
  await assert.rejects(translate(fakeClient(c => c.emit('disconnected', new Error('connection lost'))), 'Hello'), /connection lost/);
});

test('timeouts remove listeners and interrupt a started turn', async () => {
  const client = fakeClient(() => {});
  const request = client.request;
  let interrupted = false;
  client.request = (...args) => {
    if (args[0] === 'turn/interrupt') interrupted = true;
    return request(...args);
  };
  await assert.rejects(translate(client, 'Hello', { timeoutMs: 10 }), /逾時/);
  assert.equal(interrupted, true);
  assert.equal(client.listenerCount('notification'), 0);
});

test('validates malformed output and blank input', async () => {
  assert.throws(() => parseTranslation('{"translation":" "}'), /invalid/);
  assert.throws(() => parseTranslation('not json'));
  await assert.rejects(translate(fakeClient(() => {}), '  '), /請輸入/);
});

test('JSON-RPC requests match IDs and server exit rejects pending requests', async () => {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill() {},
  });
  const client = new CodexClient({ binary: '/fake/codex', spawnProcess: () => child });
  const first = client.request('first');
  const second = client.request('second');
  child.stdout.write('{"id":2,"result":{"value":2}}\n{"id":1,"result":{"value":1}}\n');
  assert.deepEqual(await first, { value: 1 });
  assert.deepEqual(await second, { value: 2 });
  const pending = client.request('pending');
  child.emit('exit', 1, null);
  await assert.rejects(pending, /exited/);
  client.close();
});

test('requests translation only with explicit effort and releases its temporary thread', async () => {
  const calls = [];
  const client = fakeClient(c => completed(c, 'completed', [
    { id: 'a', type: 'agentMessage', text: JSON.stringify(expected) },
  ]));
  const request = client.request;
  client.request = (method, params) => { calls.push({ method, params }); return request(method, params); };
  assert.deepEqual(await translate(client, 'Hello', { model: 'chosen-model', effort: 'medium' }), expected);
  const thread = calls.find(c => c.method === 'thread/start').params;
  assert.equal(thread.ephemeral, true);
  assert.equal(thread.model, 'chosen-model');
  const turn = calls.find(c => c.method === 'turn/start').params;
  assert.equal(turn.effort, 'medium');
  assert.deepEqual(turn.outputSchema.required, ['translation']);
  assert.deepEqual(Object.keys(turn.outputSchema.properties), ['translation']);
  assert.ok(calls.some(c => c.method === 'thread/unsubscribe' && c.params.threadId === 'test-thread'));
});

test('concurrent translations on one client keep results and cleanup isolated', async () => {
  const client = new EventEmitter();
  let threads = 0;
  const starts = [];
  const released = [];
  client.request = async (method, params) => {
    if (method === 'thread/start') return { thread: { id: `thread-${++threads}` } };
    if (method === 'thread/unsubscribe') { released.push(params.threadId); return {}; }
    if (method === 'turn/start') {
      starts.push(params);
      if (starts.length === 2) queueMicrotask(() => {
        for (const start of starts.toReversed()) client.emit('notification', {
          method: 'turn/completed', params: { threadId: start.threadId, turn: {
            id: `turn-${start.threadId}`, status: 'completed', items: [{
              id: 'a', type: 'agentMessage', text: JSON.stringify({ translation: start.threadId }),
            }],
          } },
        });
      });
      return { turn: { id: `turn-${params.threadId}` } };
    }
  };
  assert.deepEqual(await Promise.all([translate(client, 'one'), translate(client, 'two')]),
    [{ translation: 'thread-1' }, { translation: 'thread-2' }]);
  assert.equal(client.listenerCount('notification'), 0);
  assert.deepEqual(released.sort(), ['thread-1', 'thread-2']);
});

test('late turn acknowledgement after timeout still interrupts the model', async () => {
  const client = new EventEmitter();
  let acknowledge;
  const interrupted = [];
  client.request = async (method, params) => {
    if (method === 'thread/start') return { thread: { id: 'late-thread' } };
    if (method === 'turn/start') return new Promise(resolve => { acknowledge = resolve; });
    if (method === 'turn/interrupt') interrupted.push(params);
    return {};
  };
  await assert.rejects(translate(client, 'hello', { timeoutMs: 10 }), /逾時/);
  acknowledge({ turn: { id: 'late-turn' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(interrupted, [{ threadId: 'late-thread', turnId: 'late-turn' }]);
  assert.equal(client.listenerCount('notification'), 0);
});
