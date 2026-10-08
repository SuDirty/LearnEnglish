import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiRoot, cloudEnvironment } from '../shared/cloud-cli.mjs';

export const agyBin = process.env.ANTIGRAVITY_BIN || fileURLToPath(new URL('../../.local/ai-tools/antigravity/antigravity', import.meta.url));
export const deniedActions = ['read_file', 'write_file', 'read_url', 'execute_url', 'command', 'unsandboxed', 'mcp'].map(action => `${action}(*)`);
export async function prepareAntigravity({ configDir = join(homedir(), '.gemini', 'antigravity-cli') } = {}) {
  const path = join(configDir, 'settings.json');
  let settings;
  try { settings = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Antigravity 設定無法讀取，請檢查 settings.json。');
    await mkdir(configDir, { recursive: true, mode: 0o700 });
    settings = { useG1Credits: false, permissions: { deny: deniedActions } };
    // Never overwrite an existing CLI configuration.
    try { await writeFile(path, JSON.stringify(settings, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; settings = JSON.parse(await readFile(path, 'utf8')); }
  }
  if (settings.useG1Credits !== false || settings.modelProvider
    || !deniedActions.every(rule => settings.permissions?.deny?.includes(rule))) {
    throw new Error('Antigravity 需停用 Use G1 Credits／API key 模式並套用翻譯工具限制，請參考 docs/cloud-ai.md；未修改既有設定。');
  }
  const cwd = join(aiRoot, 'antigravity', 'work');
  await mkdir(cwd, { recursive: true, mode: 0o700 });
  return { cwd, env: { ...cloudEnvironment('antigravity'), AGY_CLI_DISABLE_AUTO_UPDATE: 'true', AGY_CLI_MODEL_API_MAX_RETRIES: '1' } };
}
