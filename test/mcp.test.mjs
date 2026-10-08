import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../bridge/server.mjs';
import { TranslationJobs } from '../bridge/jobs.mjs';
import { McpTranslationClient, validateMcpEndpoint } from '../extension/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const token = 'a'.repeat(64);
const backend = () => ({ status: async () => ({ connected: true, authType: 'chatgpt' }), translate: async text => ({ translation: `繁中：${text}` }) });

test('bundled client performs MCP handshake, tool discovery, health check and translation', async t => {
  const server = await startServer({ port: 0, token, backend: backend() });
  t.after(() => server.close());
  const client = new McpTranslationClient({ endpoint: server.endpoint, token });
  assert.equal((await client.check()).authType, 'chatgpt');
  const result = await client.translate('Keep learning.', { interval: 1 });
  assert.deepEqual(result, { translation: '繁中：Keep learning.', provider: 'Codex (MCP)' });
});

test('official MCP SDK client can discover and invoke the bridge tools', async t => {
  const server = await startServer({ port: 0, token, backend: backend() });
  t.after(() => server.close());
  const client = new Client({ name: 'compatibility-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(server.endpoint), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  assert.deepEqual((await client.listTools()).tools.map(tool => tool.name).sort(), ['analyze_vocabulary', 'translate', 'translate_word', 'translation_health', 'translation_result']);
  const job = await client.callTool({ name: 'translate', arguments: { text: 'Hello', requestId: randomUUID() } });
  assert.equal(typeof job.structuredContent.jobId, 'string');
  const done = await client.callTool({ name: 'translation_result', arguments: { jobId: job.structuredContent.jobId } });
  assert.equal(done.structuredContent.status, 'completed');
  const invalid = await client.callTool({ name: 'translate', arguments: { text: 'x'.repeat(2001), requestId: randomUUID() } });
  assert.equal(invalid.isError, true);
});

test('bridge rejects bad credentials, non-extension origins, rebinding hosts and malformed requests', async t => {
  const server = await startServer({ port: 0, token, backend: backend() });
  t.after(() => server.close());
  const post = headers => fetch(server.endpoint, { method: 'POST', headers, body: '{}' });
  assert.equal((await post({ Authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await post({ Authorization: `Bearer ${token}`, Origin: 'https://evil.example' })).status, 403);
  const rebound = await new Promise((resolve, reject) => {
    const req = httpRequest(server.endpoint, { method: 'POST', headers: { Host: 'evil.example', Authorization: `Bearer ${token}` } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end('{}');
  });
  assert.equal(rebound, 403);
  assert.equal((await post({ Authorization: `Bearer ${token}` })).status, 415);
  const options = await fetch(server.endpoint, { method: 'OPTIONS', headers: { Origin: `chrome-extension://${'a'.repeat(32)}` } });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), `chrome-extension://${'a'.repeat(32)}`);
  await assert.rejects(new McpTranslationClient({ endpoint: server.endpoint, token: 'wrong' }).check(), /權杖/);
});

test('translation errors are returned as failed jobs, not silently sent to another provider', async t => {
  const server = await startServer({ port: 0, token, backend: { ...backend(), translate: async () => { throw new Error('Account limit'); } } });
  t.after(() => server.close());
  await assert.rejects(new McpTranslationClient({ endpoint: server.endpoint, token }).translate('Hello', { interval: 1 }), /Account limit/);
});

test('job queue bounds concurrency, rejects overload and deduplicates retries', async () => {
  const resolvers = [];
  let active = 0, maximum = 0;
  const jobs = new TranslationJobs({ translate: async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => resolvers.push(resolve)); active--; return { translation: '你好' }; } }, { concurrency: 1, capacity: 2 });
  const requestId = randomUUID();
  const first = jobs.start('Hello', requestId);
  assert.equal(jobs.start('Hello', requestId).jobId, first.jobId);
  assert.throws(() => jobs.start('Different', requestId), /不一致/);
  const second = jobs.start('Next', randomUUID());
  assert.equal(second.status, 'queued');
  assert.throws(() => jobs.start('Overflow', randomUUID()), /已滿/);
  await delay(0); resolvers.shift()(); await delay(0); resolvers.shift()(); await delay(0);
  assert.equal(jobs.get(second.jobId).status, 'completed');
  assert.equal(maximum, 1);
  jobs.close();
});

test('MCP endpoint is confined to literal loopback and does not allow credentials or redirects', () => {
  assert.equal(validateMcpEndpoint('http://127.0.0.1:8765/mcp'), 'http://127.0.0.1:8765/mcp');
  for (const endpoint of ['https://example.com/mcp', 'http://localhost:8765/mcp', 'http://user:password@127.0.0.1/mcp', 'http://127.0.0.1/mcp?token=x']) {
    assert.throws(() => validateMcpEndpoint(endpoint));
  }
});
