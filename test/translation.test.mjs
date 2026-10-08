import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startServer } from '../bridge/server.mjs';
import { translate, translationSettings, saveTranslationSettings } from '../extension/translation.js';
import { makeEntry, toCsv } from '../extension/core.js';

let storage = {}, googleCalls = 0;
const actualFetch = globalThis.fetch;
globalThis.chrome = {
  runtime: { getURL: path => 'https://extension.test/' + path },
  storage: { local: {
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in storage).map(key => [key, structuredClone(storage[key])])); },
    async set(values) { Object.assign(storage, structuredClone(values)); },
  } },
};
globalThis.fetch = async (url, options) => {
  if (url.startsWith('https://extension.test/dictionary/')) {
    const name = new URL(url).pathname.split('/').at(-1);
    return new Response(await readFile(new URL('../extension/dictionary/' + name, import.meta.url)));
  }
  if (url.startsWith('https://translation.googleapis.com/')) {
    googleCalls++;
    return Response.json({ data: { translations: [{ translatedText: 'Google 譯文' }] } });
  }
  return actualFetch(url, options);
};

test('existing Google default, dictionary priority and force-online remain functional', async () => {
  storage = { googleApiKey: 'a'.repeat(30) }; googleCalls = 0;
  assert.equal((await translationSettings()).provider, 'google');
  assert.equal((await translate('hello', 'word')).provider, 'ECDICT');
  assert.equal(googleCalls, 0);
  assert.equal((await translate('hello', 'word', true)).provider, 'Google Cloud Translation');
  assert.equal(googleCalls, 1);
  assert.equal((await translate('hello', 'word', true)).cached, true);
  assert.equal(googleCalls, 1);
});

test('MCP selection uses real transport, deduplicates and caches without charging Google', async t => {
  let codexCalls = 0;
  const server = await startServer({ port: 0, token: 'b'.repeat(64), backend: {
    status: async () => ({ connected: true }),
    translate: async text => { codexCalls++; return { translation: 'Codex 譯文：' + text }; },
  } });
  t.after(() => server.close());
  storage = { googleApiKey: 'a'.repeat(30) }; googleCalls = 0;
  await saveTranslationSettings({ provider: 'mcp', mcpEndpoint: server.endpoint, mcpToken: 'b'.repeat(64) });
  assert.equal((await translate('hello', 'word')).provider, 'ECDICT');
  const [a, b] = await Promise.all([translate('Keep learning', 'sentence'), translate('Keep learning', 'sentence')]);
  assert.deepEqual(a, b); assert.equal(a.provider, 'Codex (MCP)'); assert.equal(codexCalls, 1);
  assert.equal((await translate('Keep learning', 'sentence')).cached, true);
  assert.equal(googleCalls, 0); assert.equal(storage.googleUsage, undefined);
  const settings = await translationSettings();
  assert.equal(settings.mcpCached, 1); assert.equal(settings.mcpConfigured, true);
  assert.equal(settings.mcpToken, undefined); assert.equal(settings.googleApiKey, undefined);
  await saveTranslationSettings({ provider: 'mcp', mcpEndpoint: server.endpoint, mcpToken: '' });
  assert.equal((await translationSettings()).mcpCached, 1, 'saving unchanged settings preserves cache');
  await saveTranslationSettings({ clearMcpCache: true });
  assert.equal((await translationSettings()).mcpCached, 0);
  await saveTranslationSettings({ clearMcpToken: true });
  await assert.rejects(translate('not cached', 'sentence'), /權杖/);
  assert.equal(googleCalls, 0, 'MCP failure must not fall back to Google');
});

test('provider and endpoint validation reject invalid settings without writes', async () => {
  storage = {};
  await assert.rejects(saveTranslationSettings({ provider: 'unknown' }), /不支援/);
  await assert.rejects(saveTranslationSettings({ mcpEndpoint: 'http://evil.example/mcp' }), /127.0.0.1/);
  await assert.rejects(saveTranslationSettings({ mcpToken: 'short' }), /權杖/);
  assert.deepEqual(storage, {});
});

test('Codex source survives normalization for saved entries and CSV export', () => {
  const entry = makeEntry({ text: 'Hello', translation: '你好', translationSource: 'Codex (MCP)' });
  assert.equal(entry.translationSource, 'Codex (MCP)');
  assert.match(toCsv([entry]), /Codex \(MCP\)/);
});

test('cloud provider selection isolates models at the same endpoint and never falls back to Google', async t => {
  let identity = 'antigravity:model-a', calls = 0;
  const server = await startServer({ port: 0, token: 'c'.repeat(64), backend: {
    status: async () => ({ connected: true, provider: 'Antigravity (MCP)', providerId: 'antigravity', cacheIdentity: identity }),
    translate: async () => { calls++; return { translation: identity, provider: 'Antigravity (MCP)', cacheIdentity: identity }; },
  } });
  t.after(() => server.close());
  storage = {}; googleCalls = 0;
  await saveTranslationSettings({ provider: 'antigravity', mcpEndpoint: server.endpoint, mcpToken: 'c'.repeat(64) });
  assert.equal((await translate('Model check', 'sentence')).translation, 'antigravity:model-a');
  assert.equal((await translate('Model check', 'sentence')).cached, true);
  identity = 'antigravity:model-b';
  assert.equal((await translate('Model check', 'sentence')).translation, 'antigravity:model-b');
  assert.equal(calls, 2);
  await saveTranslationSettings({ provider: 'copilot' });
  await assert.rejects(translate('Model check', 'sentence'), /不符/);
  assert.equal(googleCalls, 0);
});

test('cloud AI sources survive saved entry normalization and CSV export', () => {
  for (const source of ['Antigravity (MCP)', 'GitHub Copilot (MCP)']) {
    const entry = makeEntry({ text: 'Hello', translation: '你好', translationSource: source });
    assert.equal(entry.translationSource, source);
    assert.ok(toCsv([entry]).includes(source));
  }
});

test('MCP word lookup translates and scores in one request, caches by context, and saves portable scores', async t => {
  const { currentScore } = await import('../extension/vocabulary.js');
  let wordCalls = 0, plainCalls = 0;
  const contexts = [];
  const server = await startServer({ port: 0, token: 'd'.repeat(64), backend: {
    status: async () => ({ connected: true, cacheIdentity: 'inline-model' }),
    translate: async () => { plainCalls++; return { translation: '普通翻譯' }; },
    translateWord: async (text, context) => { wordCalls++; contexts.push(context); return { translation: '銀行', provider: 'Codex (MCP)', model: 'inline-model',
      learningScore: { frequency: 85, usefulness: 90, tags: ['日常', '商用'], reason: '日常理財常用。' } }; },
  } });
  t.after(() => server.close());
  storage = {}; googleCalls = 0;
  await saveTranslationSettings({ provider: 'mcp', mcpEndpoint: server.endpoint, mcpToken: 'd'.repeat(64) });
  assert.equal((await translate('bank', 'word', false, 'Visit the bank.')).provider, 'ECDICT');
  assert.equal(wordCalls, 0);
  const [a, b] = await Promise.all([translate('bank', 'word', true, 'Visit the bank.'), translate('bank', 'word', true, 'Visit the bank.')]);
  assert.deepEqual(a, b); assert.equal(wordCalls, 1); assert.equal(plainCalls, 0);
  assert.equal(a.learningScore.score, 88);
  const saved = makeEntry({ text: 'bank', kind: 'word', context: 'Visit the bank.', translation: a.translation, translationSource: a.provider, learningScore: a.learningScore });
  assert.equal(currentScore(saved).score, 88);
  assert.equal(currentScore(makeEntry({ ...saved, context: 'Changed context', learningScore: a.learningScore })), null);
  assert.equal(currentScore(makeEntry({ ...saved, translation: '變更譯文', learningScore: a.learningScore })), null);
  assert.equal((await translate('bank', 'word', true, 'Visit the bank.')).cached, true);
  await translate('bank', 'word', true, 'Sit on the river bank.');
  assert.equal(wordCalls, 2); assert.deepEqual(contexts, ['Visit the bank.', 'Sit on the river bank.']);
  await translate('bank', 'sentence', true);
  assert.equal(plainCalls, 1, 'plain translation cache stays separate');
  assert.equal(googleCalls, 0);
});

test('old MCP backends clearly require restart for inline scores', async t => {
  const server = await startServer({ port: 0, token: 'e'.repeat(64), backend: {
    status: async () => ({ connected: true }), translate: async () => ({ translation: '你好' }),
  } });
  t.after(() => server.close()); storage = {};
  await saveTranslationSettings({ provider: 'mcp', mcpEndpoint: server.endpoint, mcpToken: 'e'.repeat(64) });
  await assert.rejects(translate('hello', 'word', true), /重新啟動 MCP/);
});
