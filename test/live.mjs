import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startServer } from '../bridge/server.mjs';
import { McpTranslationClient } from '../extension/mcp.js';

// Explicit opt-in: this test sends one sentence to the logged-in Codex model.
const token = randomBytes(32).toString('hex');
const server = await startServer({ port: 0, token });
try {
  const client = new McpTranslationClient({ endpoint: server.endpoint, token });
  console.log('MCP / Codex health:', await client.check());
  const start = Date.now();
  const result = await client.translate("I've been learning English for three months.");
  assert.equal(result.provider, 'Codex (MCP)');
  assert.match(result.translation, /[\u3400-\u9fff]/);
  console.log(JSON.stringify({ ...result, seconds: (Date.now() - start) / 1000 }, null, 2));
} finally { await server.close(); }
