import { accessSync, constants, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

function executable(path) {
  try { accessSync(path, constants.X_OK); return statSync(path).isFile(); }
  catch { return false; }
}

export function resolveCodexBinary({ env = process.env, platform = process.platform, home = homedir(), isExecutable = executable } = {}) {
  const configured = env.CODEX_BIN?.trim();
  const searchPath = (env.PATH || '').split(delimiter).filter(path => isAbsolute(path));
  // Explicit overrides take priority and must not silently select another binary.
  if (configured) {
    const candidates = /[/\\]/.test(configured)
      ? [resolve(configured)] : searchPath.map(path => join(path, configured));
    const found = candidates.find(isExecutable);
    if (found) return found;
    throw new Error(`CODEX_BIN 指定的 Codex 執行檔不存在或無法執行：${configured}。請設定正確的完整路徑後重啟 npm run mcp。`);
  }
  const candidates = searchPath.map(path => join(path, 'codex'));
  if (platform === 'darwin') {
    for (const root of ['/Applications', join(home, 'Applications')]) {
      for (const app of ['Codex.app', 'ChatGPT.app']) candidates.push(join(root, app, 'Contents', 'Resources', 'codex'));
    }
    candidates.push('/opt/homebrew/bin/codex', '/usr/local/bin/codex');
  }
  const found = [...new Set(candidates)].find(isExecutable);
  if (found) return found;
  throw new Error('找不到 Codex 執行檔。請安裝 Codex CLI，或以 CODEX_BIN="/完整路徑/codex" npm run mcp 指定位置。macOS 若已安裝 ChatGPT／Codex app，請確認它位於 Applications。');
}

export function codexSpawnError(error, binary) {
  if (['ENOENT', 'EACCES'].includes(error.code)) {
    return new Error(`無法啟動 Codex：${binary}（${error.code}）。請確認執行檔存在且可執行，或設定 CODEX_BIN 完整路徑後重啟 npm run mcp。`, { cause: error });
  }
  return error;
}
