import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { selectConfiguration, runTerminal } from '../bridge/terminal.mjs';
import { cleanLine, createTerminalLog } from '../bridge/terminal-log.mjs';
import { TranslationJobs } from '../bridge/jobs.mjs';

const models = ['gpt-6-astra', 'gpt-5.6-luna'].map((model, i) => ({ model, id: model,
  displayName: model, isDefault: i === 0,
  supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'medium' }], defaultReasoningEffort: 'medium' }));

test('interactive model picker defaults to Luna and retries invalid input', async () => {
  const answers = ['999', ''];
  const lines = [];
  const result = await selectConfiguration({ models, env: {}, interactive: true,
    ask: async () => answers.shift(), write: line => lines.push(line) });
  assert.deepEqual(result, { model: 'gpt-5.6-luna', effort: 'low' });
  assert.ok(lines.some(line => line.includes('重新輸入')));
  assert.match(lines.find(line => line.includes('1.')), /luna/);
  const byName = await selectConfiguration({ models, env: {}, interactive: true,
    ask: async () => 'gpt-6-astra', write: () => {} });
  assert.equal(byName.model, 'gpt-6-astra');
});

test('environment override skips prompt; noninteractive mode preserves Codex default', async () => {
  const noPrompt = () => { throw new Error('must not prompt'); };
  assert.deepEqual(await selectConfiguration({ models, env: { CODEX_MODEL: 'gpt-6-astra', CODEX_REASONING_EFFORT: 'medium' },
    interactive: true, ask: noPrompt, write: () => {} }), { model: 'gpt-6-astra', effort: 'medium' });
  assert.deepEqual(await selectConfiguration({ models, env: {}, interactive: false,
    ask: noPrompt, write: () => {} }), { model: undefined, effort: 'low' });
  await assert.rejects(selectConfiguration({ models, env: { CODEX_MODEL: 'missing' } }), /模型清單沒有/);
  await assert.rejects(selectConfiguration({ models, env: { CODEX_MODEL: 'gpt-5.6-luna', CODEX_REASONING_EFFORT: 'ultra' } }), /不支援推理等級/);
});

function terminalFixture(overrides = {}) {
  const lines = [];
  const signals = new EventEmitter();
  const counts = { backendClosed: 0, serverClosed: 0, started: 0 };
  const backend = { listModels: async () => models, configure: value => { counts.selection = value; },
    status: async () => ({ connected: true, authType: 'chatgpt' }), close: () => { counts.backendClosed++; } };
  const options = { signals, input: { isTTY: false }, output: { isTTY: false, write: line => lines.push(line) },
    args: [], env: { CODEX_MODEL: 'gpt-5.6-luna' }, createBackendImpl: () => backend,
    readToken: async () => 'f'.repeat(64),
    startServer: async () => { counts.started++; return { endpoint: 'http://127.0.0.1:8765/mcp', close: async () => { counts.serverClosed++; backend.close(); } }; },
    ...overrides };
  return { lines, signals, counts, backend, options };
}

test('terminal startup displays configuration without token; graceful close releases resources', async () => {
  const fixture = terminalFixture();
  const server = await runTerminal(fixture.options);
  assert.equal(fixture.counts.selection.model, 'gpt-5.6-luna');
  const output = fixture.lines.join('');
  assert.match(output, /gpt-5.6-luna/);
  assert.match(output, /服務已就緒/);
  assert.match(output, /chatgpt/);
  assert.ok(!output.includes('f'.repeat(64)));
  await server.close();
  await server.close();
  assert.equal(fixture.counts.serverClosed, 1);
  assert.equal(fixture.signals.listenerCount('SIGINT'), 0);
});

test('startup failures and interruption during model discovery close the warm backend', async () => {
  const failure = terminalFixture({ startServer: async () => { throw Object.assign(new Error('busy'), { code: 'EADDRINUSE' }); } });
  await assert.rejects(runTerminal(failure.options), /連接埠 8765 已被使用/);
  assert.equal(failure.counts.backendClosed, 1);
  assert.equal(failure.signals.listenerCount('SIGTERM'), 0);
  const interrupted = terminalFixture();
  let release;
  interrupted.backend.listModels = () => new Promise(resolve => { release = resolve; });
  const pending = runTerminal(interrupted.options);
  interrupted.signals.emit('SIGINT');
  release(models);
  await pending;
  assert.equal(interrupted.counts.started, 0);
  assert.equal(interrupted.counts.backendClosed, 1);
});

test('diagnostics redact credentials and terminal escapes, and can hide source and output', () => {
  assert.ok(!cleanLine(`Bearer ${'a'.repeat(64)}\n\x1b[31mtest`).includes('a'.repeat(64)));
  assert.ok(!cleanLine('\x1b[31mtest\nnext').includes('\x1b'));
  assert.equal(cleanLine('sk-sensitive-key'), '[金鑰已隱藏]');
  const lines = [];
  const log = createTerminalLog({ write: line => lines.push(line), showText: false });
  const base = { jobId: 'abcdef12-1234', characters: 5, text: 'private-source', translation: 'private-output', active: 1, queued: 0, elapsedMs: 1500, waitMs: 20 };
  log.emit({ ...base, type: 'job.queued' });
  log.emit({ ...base, type: 'job.completed' });
  log.emit({ ...base, type: 'job.failed', error: 'private-source' });
  assert.ok(!lines.join('').includes('private-'));
  assert.match(log.summary(), /完成 1 筆／失敗 1 筆／平均翻譯 1.5 秒/);
});

test('job diagnostics report queue, progress, completion and failure without logging polls', async () => {
  const events = [];
  const resolvers = [];
  const jobs = new TranslationJobs({ translate: () => new Promise((resolve, reject) => resolvers.push({ resolve, reject })) },
    { concurrency: 1, progressMs: 5, onEvent: event => events.push(event) });
  try {
    const first = jobs.start('first', 'r1');
    const second = jobs.start('second', 'r2');
    jobs.get(first.jobId); jobs.get(first.jobId);
    await delay(15);
    assert.ok(events.some(e => e.type === 'job.progress' && e.jobId === first.jobId));
    resolvers[0].resolve({ translation: '第一句' });
    await delay(0);
    resolvers[1].reject(new Error('test failure'));
    await delay(0);
    assert.equal(events.filter(e => e.type === 'job.completed').length, 1);
    assert.equal(events.find(e => e.type === 'job.completed').translation, '第一句');
    assert.equal(events.find(e => e.type === 'job.failed').jobId, second.jobId);
    assert.ok(events.find(e => e.type === 'job.started' && e.jobId === second.jobId).waitMs >= 0);
    assert.equal(events.filter(e => e.type === 'job.queued').length, 2);
  } finally { jobs.close(); }
});
