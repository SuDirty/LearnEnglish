import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const tokenPath = fileURLToPath(new URL('../.local/mcp-token', import.meta.url));
export async function getToken() {
  await mkdir(new URL('../.local/', import.meta.url), { recursive: true, mode: 0o700 });
  try { await writeFile(tokenPath, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const token = (await readFile(tokenPath, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('本機 MCP 權杖格式錯誤。');
  return token;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await getToken());
}
