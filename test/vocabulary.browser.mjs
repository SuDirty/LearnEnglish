import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../bridge/server.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const work = await mkdtemp(join(tmpdir(), 'subtitle-vocabulary-browser-'));
const extension = join(work, 'extension');
await cp(new URL('../extension/', import.meta.url), extension, { recursive: true });
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*');
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
const token = randomBytes(32).toString('hex');
const words = ['negotiate', 'hello', 'awesome', 'itinerary', 'budget', 'collaborate', 'deadline', 'commute', 'serendipity', 'brunch', 'chill'];
const entries = words.map((text, index) => ({ id: randomUUID(), kind: 'word', text,
  translation: ['協商', '你好', '很棒', '行程', '預算'][index % 5], context: `We talked about ${text} yesterday.`,
  title: 'English stories', time: 63, url: 'https://www.netflix.com/watch/123', createdAt: new Date().toISOString() }));
entries.push({ ...entries[0], id: randomUUID(), kind: 'sentence', text: 'Keep learning every day.' });
const batches = [];
let failSecond = true;
const server = await startServer({ port: 0, token, backend: {
  status: async () => ({ connected: true, providerId: 'codex' }),
  translate: async () => ({ translation: '你好' }),
  analyzeVocabulary: async batch => {
    batches.push(batch); await delay(700);
    if (batches.length === 2 && failSecond) throw new Error('測試暫時額度不足');
    return { provider: 'Codex (MCP)', model: 'test-model', scores: batch.map(item => ({
      id: item.id, frequency: item.text === 'hello' ? 100 : 70, usefulness: item.text === 'hello' ? 100 : 80,
      reason: item.text === 'chill' ? '<img src=x onerror=alert(1)>' : '在日常溝通與工作場合常見，可優先練習搭配原句使用。',
      tags: item.text === 'awesome' || item.text === 'chill' ? ['日常', '俚語'] : item.text === 'hello' ? ['日常'] : ['商用', '正式'],
    })) };
  },
} });
let context;
try {
  context = await chromium.launchPersistentContext(join(work, 'profile'), {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 1050 },
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/library.html`);
  await page.waitForFunction(() => document.querySelector('#analysis-summary').textContent.includes('0 個單字'));
  assert.equal(await page.locator('#analyze').isDisabled(), true);
  await page.evaluate(async ({ entries, token, endpoint }) => chrome.storage.local.set({ entries, mcpToken: token, mcpEndpoint: endpoint }), { entries, token, endpoint: server.endpoint });
  await page.waitForFunction(() => document.querySelectorAll('.entry').length === 12);
  await page.click('#analyze');
  await page.waitForFunction(() => document.querySelector('#analysis-status').textContent.includes('請先在翻譯設定'));
  assert.equal(batches.length, 0);
  await page.evaluate(() => chrome.storage.local.set({ translationProvider: 'mcp' }));
  await page.click('#analyze');
  await page.waitForFunction(() => document.querySelector('#analysis-status').textContent.includes('額度不足'));
  assert.equal(await page.locator('.word-score').count(), 10);
  assert.deepEqual(batches.map(batch => batch.length), [10, 1]);
  failSecond = false;
  await page.click('#analyze');
  await page.waitForFunction(() => document.querySelector('#analysis-status').textContent.startsWith('分析完成'));
  assert.deepEqual(batches.map(batch => batch.length), [10, 1, 1]);
  assert.equal(await page.locator('.word-score').count(), 11);
  assert.equal(await page.locator('.entry h2').first().textContent(), 'hello');
  assert.equal(await page.locator('.word-score img').count(), 0);
  assert.equal(await page.locator('#analyze').isDisabled(), true);
  await page.getByRole('button', { name: '商用 8', exact: true }).click();
  assert.equal(await page.locator('.entry').count(), 8);
  await page.getByRole('button', { name: '俚語 2', exact: true }).click();
  assert.equal(await page.locator('.entry').count(), 2);
  await page.fill('#search', 'awesome');
  assert.equal(await page.locator('.entry').count(), 1);
  await page.fill('#search', '');
  await page.getByRole('button', { name: '全部標籤', exact: true }).click();
  await page.click('[data-filter="sentence"]');
  assert.equal(await page.locator('.entry').count(), 1);
  assert.equal(await page.locator('.word-score').count(), 0);
  await page.click('[data-filter="word"]');
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../artifacts/vocabulary-desktop.png', import.meta.url).pathname });
  await page.locator('#entries').scrollIntoViewIfNeeded();
  await page.screenshot({ path: new URL('../artifacts/vocabulary-cards.png', import.meta.url).pathname });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: new URL('../artifacts/vocabulary-mobile.png', import.meta.url).pathname });
  await page.locator('.word-score').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: new URL('../artifacts/vocabulary-mobile-card.png', import.meta.url).pathname });
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.word-score').length === 11);
  await page.click('#reanalyze');
  await page.click('#stop-analysis');
  await page.waitForFunction(() => document.querySelector('#analysis-status').textContent.startsWith('已停止'));
  assert.equal(batches.length, 4);
  assert.equal(batches[3].length, 10);
  const download = page.waitForEvent('download');
  await page.click('#csv');
  const csv = await readFile(await (await download).path(), 'utf8');
  assert.match(csv, /AI 標籤/); assert.match(csv, /商用 \/ 正式/);
  const deletion = page.locator('.entry').filter({ has: page.locator('h2', { hasText: /^hello$/ }) });
  await deletion.getByRole('button', { name: '刪除 hello', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.word-score').length === 10);
  assert.deepEqual(errors, []);
  console.log('PASS: real extension: setup errors, batched scores/tags, partial failure/resume, ranking, combined filters/search, safe text rendering, persistence, stop, CSV, deletion and 390px layout.');
} finally {
  await context?.close(); await server.close();
  await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
