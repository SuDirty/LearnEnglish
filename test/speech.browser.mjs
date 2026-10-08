import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const profile = await mkdtemp(join(tmpdir(), 'subtitle-speech-'));
const extension = new URL('../extension/', import.meta.url).pathname;
let browser;
try {
  browser = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, executablePath: process.env.CHROME_BIN,
    viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
  const base = `chrome-extension://${new URL(worker.url()).host}`;
  const voices = await worker.evaluate(() => chrome.tts.getVoices());
  const native = voices.filter(v => !v.remote && !v.extensionId && /^en(?:[-_]|$)/i.test(v.lang || ''));
  console.log('Native English voices:', native.map(v => v.voiceName).join(', ') || '(none)');
  const errors = [], library = await browser.newPage();
  library.on('pageerror', error => errors.push(error.message));
  await library.goto(`${base}/library.html`);
  await worker.evaluate(() => chrome.storage.local.set({ entries: ['hello', 'learning'].map((text, i) => ({
    id: String(i), text, kind: 'word', translation: i ? '學習' : '你好', context: 'Hello, keep learning.',
    title: 'English practice', time: 12, url: 'https://www.netflix.com/watch/123',
  })) }));
  await library.locator('.speech-controls').nth(1).waitFor();
  if (native.length) {
    await library.getByRole('button', { name: '朗讀英文', exact: true }).first().click();
    await library.waitForFunction(() => document.querySelector('.speech-status').textContent === ''
      && document.querySelector('.speech-controls button[aria-label="停止朗讀"]').hidden);
    console.log('PASS: native system speech completed through the library UI.');
  }
  // Keep real extension messaging; replace only the engine to exercise deterministic failures/races.
  await worker.evaluate(() => {
    globalThis.speechCalls = []; globalThis.speechStops = 0;
    chrome.tts.getVoices = async () => [{ voiceName: 'Test English', lang: 'en-US', remote: false }];
    chrome.tts.speak = async (text, options) => { globalThis.speechCalls.push({ text, ...options }); };
    chrome.tts.stop = () => { globalThis.speechStops++; };
  });
  await library.getByRole('button', { name: '慢速朗讀英文' }).first().click();
  await library.getByRole('button', { name: '停止朗讀' }).waitFor();
  // Waiting on a worker condition via page polling avoids assuming engine scheduling order.
  async function calls(count) {
    for (let i = 0; i < 100; i++) {
      if (await worker.evaluate(count => globalThis.speechCalls.length >= count, count)) return;
      await library.waitForTimeout(20);
    }
    throw new Error('Speech engine did not receive the request');
  }
  await calls(1);
  assert.deepEqual(await worker.evaluate(() => ({ text: speechCalls[0].text, rate: speechCalls[0].rate })), { text: 'hello', rate: 0.7 });
  await library.getByRole('button', { name: '朗讀英文', exact: true }).nth(1).click(); await calls(2);
  assert.equal(await library.locator('.speech-controls').first().getByRole('button', { name: '停止朗讀' }).isVisible(), false);
  await library.getByRole('button', { name: '停止朗讀' }).click();
  await library.locator('.speech-status').filter({ hasText: '已停止朗讀' }).waitFor();
  await worker.evaluate(() => { chrome.tts.getVoices = async () => []; });
  await library.getByRole('button', { name: '朗讀英文', exact: true }).first().click();
  await library.getByText('找不到本機英文語音', { exact: false }).waitFor();
  await worker.evaluate(() => { chrome.tts.getVoices = async () => [{ voiceName: 'Test English', lang: 'en-US' }]; });
  await browser.route('https://www.netflix.com/**', route => route.fulfill({ contentType: 'text/html', body:
    '<style>body{background:#12221f}.player-timedtext-text-container{position:fixed;bottom:20%;left:25%;color:white;font:28px sans-serif}</style><video></video><div class="player-timedtext-text-container">Keep learning every day.</div>' }));
  const netflix = await browser.newPage(); netflix.on('pageerror', error => errors.push(error.message));
  await netflix.goto('https://www.netflix.com/watch/123');
  await netflix.locator('#words .word').first().click();
  await netflix.getByRole('button', { name: '朗讀英文', exact: true }).click(); await calls(3);
  assert.equal(await worker.evaluate(() => speechCalls[2].text), 'Keep');
  assert.equal(await netflix.locator('video').evaluate(video => video.paused), true);
  await netflix.getByRole('button', { name: '關閉翻譯', exact: true }).click();
  await netflix.locator('#card').waitFor({ state: 'hidden' });
  await netflix.locator('#words .word').nth(1).click();
  assert.equal(await netflix.locator('#speech .speech-status').textContent(), '');
  await netflix.getByRole('button', { name: '慢速朗讀英文' }).click(); await calls(4);
  // New speech in the library supersedes Netflix; closing the old card must not stop it.
  await library.getByRole('button', { name: '朗讀英文', exact: true }).first().click(); await calls(5);
  const stops = await worker.evaluate(() => speechStops);
  await netflix.getByRole('button', { name: '關閉翻譯', exact: true }).click();
  assert.equal(await worker.evaluate(() => speechStops), stops);
  await worker.evaluate(() => speechCalls[4].onEvent({ type: 'error' }));
  await library.getByText('系統語音播放失敗', { exact: false }).waitFor();
  await library.getByRole('button', { name: '朗讀英文', exact: true }).first().click(); await calls(6);
  await library.fill('#search', '你好');
  assert.equal(await library.locator('.entry').count(), 1);
  await library.fill('#search', '');
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await library.locator('.entry').first().scrollIntoViewIfNeeded();
  await library.screenshot({ path: new URL('../artifacts/speech-library.png', import.meta.url).pathname });
  await library.setViewportSize({ width: 390, height: 844 });
  assert.equal(await library.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await library.locator('.entry').first().scrollIntoViewIfNeeded();
  await library.screenshot({ path: new URL('../artifacts/speech-mobile.png', import.meta.url).pathname });
  await netflix.locator('#words .word').first().click();
  await netflix.screenshot({ path: new URL('../artifacts/speech-netflix.png', import.meta.url).pathname });
  assert.deepEqual(errors, []);
  console.log('PASS: normal/slow speech, switching, stop, missing voice, engine failure, card close, cross-page ownership, filtering, 390px layout.');
} finally {
  await browser?.close(); await rm(profile, { recursive: true, force: true });
}
