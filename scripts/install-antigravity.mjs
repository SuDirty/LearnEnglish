import { mkdir, writeFile, chmod, access, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const directory = fileURLToPath(new URL('../.local/ai-tools/antigravity/', import.meta.url));
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('此固定版本安裝器適用 Apple Silicon Mac；其他平台請依 https://antigravity.google/docs/cli/install/ 安裝，並設定 ANTIGRAVITY_BIN。');
}
await mkdir(directory, { recursive: true });
const binary = join(directory, 'antigravity');
let exists = false;
try { await access(binary); exists = true; } catch {}
if (exists) console.log('Antigravity CLI 已安裝在 .local/ai-tools/antigravity/。');
else {
  const url = 'https://storage.googleapis.com/antigravity-public/antigravity-cli/1.2.3-5101874907578368/darwin-arm/cli_mac_arm64.tar.gz';
  const digest = '9d0b6e891960ddff7c1a2d532a08eab25b5eebd1e4953423f1a564c26164ee22b4f4e27a141fe31f95827f5924e04a4aea10422305e1ddd9374f4bff5124d996';
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: 'error' });
  if (!response.ok) throw new Error(`Google 官方 CLI 下載失敗：${response.status}`);
  const payload = Buffer.from(await response.arrayBuffer());
  if (createHash('sha512').update(payload).digest('hex') !== digest) throw new Error('SHA512 不符，已停止安裝。');
  const archive = join(directory, 'cli.tar.gz');
  await writeFile(archive, payload);
  try { execFileSync('tar', ['-xzf', archive, '-C', directory, 'antigravity']); await chmod(binary, 0o755); }
  finally { await rm(archive, { force: true }); }
  console.log('已安裝 Antigravity CLI 1.2.3，SHA512 校驗通過；未更改 shell 設定。');
}
