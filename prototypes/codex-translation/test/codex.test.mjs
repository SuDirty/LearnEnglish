import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { CodexClient, parseTranslation, translate } from '../src/codex.mjs';

const expected = { translation: '我正在學英文。', vocabulary: [], grammar: ['現在進行式。'] };

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
  assert.throws(() => parseTranslation('{"translation":"hi"}'), /invalid/);
  assert.throws(() => parseTranslation('not json'));
  await assert.rejects(translate(fakeClient(() => {}), '  '), /請輸入/);
});

test('JSON-RPC requests match IDs and server exit rejects pending requests', async () => {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill() {},
  });
  const client = new CodexClient({ spawnProcess: () => child });
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
