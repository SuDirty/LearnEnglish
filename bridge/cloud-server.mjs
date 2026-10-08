import { startServer } from './server.mjs';
import { getToken } from './token.mjs';
import { createBackend as antigravity } from '../providers/antigravity/index.mjs';
import { createBackend as copilot } from '../providers/copilot/index.mjs';

const provider = process.argv[2];
try {
  if (!['antigravity', 'copilot'].includes(provider)) throw new Error('請使用 npm run mcp:antigravity 或 npm run mcp:copilot。');
  const port = Number(process.env.MCP_PORT || (provider === 'antigravity' ? 8768 : 8767));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('MCP_PORT 需介於 1024～65535。');
  const backend = provider === 'antigravity' ? antigravity() : copilot();
  const server = await startServer({ token: await getToken(), port, backend });
  console.log(`字幕口袋 ${provider} 雲端 AI MCP：${server.endpoint}\n執行 npm run mcp:token 取得擴充功能權杖。\n使用免費帳號額度；請先執行 npm run ai:login:${provider} 完成登入。`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
} catch (error) { console.error(error.message); process.exitCode = 1; }
