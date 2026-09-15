import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { TranslationJobs } from './jobs.mjs';
import { createBackend } from './backend.mjs';
import { getToken, tokenPath } from './token.mjs';

const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
const toolError = error => ({ isError: true, content: [{ type: 'text', text: error.message || '翻譯服務發生錯誤。' }] });

function createTools(backend, jobs) {
  const mcp = new McpServer({ name: 'subtitle-pocket-codex', version: '0.9.2' });
  mcp.registerTool('translation_health', {
    description: 'Check the local Codex App Server connection and login without sending text to a model.',
    inputSchema: {},
  }, async () => { try { return result(await backend.status()); } catch (error) { return toolError(error); } });
  mcp.registerTool('translate', {
    description: 'Translate selected English into Traditional Chinese with Codex. Returns a jobId immediately; poll translation_result until completed or failed.',
    inputSchema: { text: z.string().trim().min(1).max(2000), requestId: z.string().uuid() },
  }, async ({ text, requestId }) => { try { return result(jobs.start(text, requestId)); } catch (error) { return toolError(error); } });
  mcp.registerTool('translation_result', {
    description: 'Read the status and translation of a job returned by translate. Results expire after ten minutes.',
    inputSchema: { jobId: z.string().uuid() },
  }, async ({ jobId }) => { try { return result(jobs.get(jobId)); } catch (error) { return toolError(error); } });
  return mcp;
}

export async function startServer({ token, port = 8765, backend = createBackend() } = {}) {
  if (!token || token.length < 32) throw new Error('MCP token must contain at least 32 characters.');
  const jobs = new TranslationJobs(backend);
  const transports = new Set();
  const http = createServer(async (req, res) => {
    const reply = (status, message) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: message }));
    };
    // Only the literal loopback host is supported, preventing DNS rebinding.
    if (req.headers.host !== `127.0.0.1:${http.address().port}`) return reply(403, 'Host not allowed');
    const origin = req.headers.origin;
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return reply(403, 'Origin not allowed');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id');
      res.setHeader('Access-Control-Expose-Headers', 'MCP-Session-Id');
    }
    if (req.url !== '/mcp') return reply(404, 'Not found');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const auth = Buffer.from(req.headers.authorization || '');
    const wanted = Buffer.from(`Bearer ${token}`);
    if (auth.length !== wanted.length || !timingSafeEqual(auth, wanted)) return reply(401, 'Invalid MCP token');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, 'Method not allowed'); }
    if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, 'Expected application/json');
    const mcp = createTools(backend, jobs);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    transports.add(mcp);
    res.setHeader('Cache-Control', 'no-store');
    res.once('close', () => { transports.delete(mcp); mcp.close().catch(() => {}); });
    try {
      let body = '', bytes = 0;
      const decoder = new StringDecoder('utf8');
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 32_768) return reply(413, 'Request too large');
        body += decoder.write(chunk);
      }
      body += decoder.end();
      let parsed;
      try { parsed = JSON.parse(body); } catch { return reply(400, 'Invalid JSON'); }
      await mcp.connect(transport);
      await transport.handleRequest(req, res, parsed);
    } catch (error) {
      if (!res.headersSent) reply(500, 'MCP request failed');
      else res.end();
    }
  });
  http.requestTimeout = 15_000;
  await new Promise((resolve, reject) => { http.once('error', reject); http.listen(port, '127.0.0.1', resolve); });
  return {
    endpoint: `http://127.0.0.1:${http.address().port}/mcp`,
    async close() {
      jobs.close();
      await Promise.allSettled([...transports].map(server => server.close()));
      http.closeAllConnections();
      await new Promise(resolve => http.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const port = Number(process.env.MCP_PORT || 8765);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('MCP_PORT 需介於 1024～65535。');
    const server = await startServer({ token: await getToken(), port });
    console.log(`字幕口袋 MCP 已啟動：${server.endpoint}\n權杖檔案：${tokenPath}\n執行 npm run mcp:token 取得權杖，貼到套件翻譯設定。`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
