import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCodexBinary, codexSpawnError } from '../providers/codex/codex-binary.mjs';

test('finds bundled macOS Codex even when terminal PATH does not contain it', () => {
  const expected = '/Applications/ChatGPT.app/Contents/Resources/codex';
  assert.equal(resolveCodexBinary({ env: { PATH: '/usr/bin:/bin' }, platform: 'darwin', home: '/Users/test', isExecutable: path => path === expected }), expected);
});

test('explicit CODEX_BIN takes precedence, preserving spaces in its path', () => {
  const expected = '/Applications/Custom Codex.app/Contents/Resources/codex';
  assert.equal(resolveCodexBinary({ env: { CODEX_BIN: expected, PATH: '/bin' }, isExecutable: () => true }), expected);
  assert.throws(() => resolveCodexBinary({ env: { CODEX_BIN: '/missing/codex' }, isExecutable: path => path.includes('ChatGPT.app') }), /CODEX_BIN/);
});

test('PATH takes precedence over desktop fallbacks, with user Applications supported', () => {
  assert.equal(resolveCodexBinary({ env: { PATH: '/custom/bin:/bin' }, platform: 'darwin', isExecutable: path => path === '/custom/bin/codex' || path.includes('ChatGPT.app') }), '/custom/bin/codex');
  const expected = '/Users/test/Applications/Codex.app/Contents/Resources/codex';
  assert.equal(resolveCodexBinary({ env: {}, platform: 'darwin', home: '/Users/test', isExecutable: path => path === expected }), expected);
});

test('real filesystem checks reject non-executable files and directories', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-binary-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const binary = join(directory, 'codex');
  await writeFile(binary, '#!/bin/sh\nexit 0\n', { mode: 0o600 });
  assert.throws(() => resolveCodexBinary({ env: { CODEX_BIN: binary } }), /無法執行/);
  await chmod(binary, 0o700);
  assert.equal(resolveCodexBinary({ env: { CODEX_BIN: binary } }), binary);
  assert.throws(() => resolveCodexBinary({ env: { CODEX_BIN: directory } }), /無法執行/);
});

test('missing installations and failed launches produce actionable errors', () => {
  assert.throws(() => resolveCodexBinary({ env: {}, platform: 'linux', isExecutable: () => false }), /CODEX_BIN/);
  assert.match(codexSpawnError(Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' }), '/missing/codex').message, /完整路徑/);
});
