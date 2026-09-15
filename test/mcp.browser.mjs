import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../bridge/server.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const work = await mkdtemp(join(tmpdir(), 'subtitle-mcp-browser-'));
const extension = join(work, 'extension');
await cp(new URL('../extension/', import.meta.url), extension, { recursive: true });
// Pregrant optional loopback access only in this disposable test extension.
// Chrome's own permission dialog still needs the user's approval in normal use.
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*');
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
const token = randomBytes(32).toString('hex');
let calls = 0, googleCalls = 0;
const server = await startServer({ port: 0, token, backend: {
  status: async () => ({ connected: true, authType: 'chatgpt' }),
  translate: async text => { calls++; if (calls === 1) await delay(35_000); return { translation: '持續每天學習。' }; },
} });
let context;
try {
  context = await chromium.launchPersistentContext(join(work, 'profile'), {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    args: ['--no-proxy-server', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const settings = await context.newPage();
  const errors = [], network = [];
  context.on('requestfailed', request => network.push(`${request.url()}: ${request.failure()?.errorText}`));
  context.on('response', response => { if (response.url() === server.endpoint) network.push(`MCP HTTP ${response.status()}`); });
  settings.on('pageerror', error => errors.push(error.message));
  await settings.goto(`chrome-extension://${extensionId}/translation-settings.html`);
  await settings.waitForFunction(() => document.querySelector('#mcp-state').textContent.length > 0);
  await settings.selectOption('#provider', 'mcp');
  await settings.fill('#mcp-endpoint', server.endpoint);
  await settings.fill('#mcp-token', token);
  await settings.click('#test-mcp');
  try { await settings.waitForFunction(() => document.querySelector('#status').textContent.includes('連線成功')); }
  catch (error) {
    const permission = await settings.evaluate(() => chrome.permissions.contains({ origins: ['http://127.0.0.1/*'] }));
    throw new Error(`Settings check failed: ${await settings.locator('#status').textContent()}; permission=${permission}; network=${network.join('; ')}; page errors: ${errors.join('; ')}`);
  }
  assert.equal(await settings.inputValue('#mcp-token'), '');
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await settings.screenshot({ path: new URL('../artifacts/mcp-settings.png', import.meta.url).pathname, fullPage: true });
  await settings.setViewportSize({ width: 390, height: 844 });
  assert.equal(await settings.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await settings.setViewportSize({ width: 1440, height: 1000 });

  await context.route('https://translation.googleapis.com/**', route => { googleCalls++; return route.abort(); });
  await context.route('https://www.netflix.com/**', route => route.fulfill({ contentType: 'text/html', body: `
    <style>body{margin:0;background:#080f13}.watch-video{position:fixed;inset:0;background:linear-gradient(140deg,#22363e,#080f13)}video{width:100%;height:100%}.player-timedtext{position:absolute;bottom:12%;left:15%;width:70%;text-align:center;color:white;font:28px sans-serif}</style>
    <div class="watch-video"><video></video><div class="player-timedtext"><div class="player-timedtext-text-container">Keep learning every day.</div></div></div>` }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://www.netflix.com/watch/123');
  await page.locator('#sentence').click();
  await page.waitForFunction(() => document.querySelector('#subtitle-pocket-host')?.shadowRoot.querySelector('#translation').textContent === '持續每天學習。', null, { timeout: 60_000 });
  assert.match(await page.locator('#note').textContent(), /Codex \(MCP\)/);
  await page.locator('#save').click();
  await page.waitForFunction(() => document.querySelector('#subtitle-pocket-host').shadowRoot.querySelector('#save').textContent.includes('已收藏'));
  const saved = await settings.evaluate(async () => (await chrome.storage.local.get('entries')).entries);
  assert.equal(saved[0].translationSource, 'Codex (MCP)');
  await page.screenshot({ path: new URL('../artifacts/mcp-translation.png', import.meta.url).pathname });
  await page.locator('#sentence').click();
  await page.waitForFunction(() => document.querySelector('#subtitle-pocket-host').shadowRoot.querySelector('#note').textContent.includes('本機快取'));
  assert.equal(calls, 1);
  assert.equal(googleCalls, 0);
  assert.deepEqual(errors, []);
  console.log('PASS: real extension settings, MCP health, 35-second translation, source display, saved source, cache, mobile settings width, no Google fallback.');
} finally {
  await context?.close();
  await server.close();
  await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
