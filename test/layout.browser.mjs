import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = fileURLToPath(new URL('../', import.meta.url));
const extension = resolve(project, 'extension');
const profile = await mkdtemp(join(tmpdir(), 'subtitle-layout-'));
const browser = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROME_BIN,
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  await browser.route('https://www.netflix.com/**', route => route.fulfill({ contentType: 'text/html', body: `
    <style>body{margin:0;background:#080f13}.watch-video{position:fixed;inset:0;background:linear-gradient(140deg,#22363e,#080f13)}video{width:100%;height:100%}.player-timedtext{position:absolute;bottom:12%;left:15%;width:70%;text-align:center;color:white;font:28px sans-serif}</style>
    <div class="watch-video"><video></video><div class="player-timedtext"><div class="player-timedtext-text-container">Keep learning every day.</div></div></div>` }));
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://www.netflix.com/watch/123');
  await page.locator('#transcript').waitFor();
  const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
  async function loadCues() {
    await page.evaluate(() => {
      document.querySelector('video').currentTime = 102;
      window.postMessage({ channel: 'subtitle-pocket-v2', from: 'player', type: 'captions', path: location.pathname,
        text: '<tt xml:lang="en"><body><div>' + Array.from({ length: 50 }, (_, i) => `<p begin="${i * 5}s" end="${i * 5 + 5}s">Keep learning every day. This is sentence ${i + 1}.</p>`).join('') + '</div></body></tt>' }, location.origin);
    });
    await page.locator('.cue.active').waitFor();
  }
  async function settle() { await page.waitForTimeout(350); }
  async function geometry() {
    return page.evaluate(() => {
      const root = document.querySelector('#subtitle-pocket-host').shadowRoot;
      const box = id => { const r = root.querySelector(id).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      return { list: box('#transcript-list'), row: box('.cue.active'), card: box('#card'), header: box('#transcript header') };
    });
  }
  async function centered() {
    await settle();
    const { row, list } = await geometry();
    if (row.height <= list.height) assert.ok(Math.abs(row.y + row.height / 2 - list.y - list.height / 2) < 3, JSON.stringify({ row, list }));
    else assert.ok(Math.abs(row.y - list.y) < 3, 'Tall current cue starts at the visible list top');
  }
  async function lookup() {
    await page.locator('.cue.active .cue-word').first().click();
    await page.locator('#card').waitFor(); await page.locator('#card-resize').waitFor(); await centered();
  }
  async function drag(dx, dy) {
    const b = await page.locator('#card-resize').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 }); await page.mouse.up(); await centered();
  }
  await loadCues(); await centered();
  assert.ok((await geometry()).header.height < 100);
  assert.equal(await page.locator('#transcript header #sentence').isVisible(), true);
  assert.ok(!(await page.locator('#transcript header').innerText()).includes('null'));
  assert.equal(await page.locator('#panel-info').isVisible(), false);
  await page.locator('#panel-info-open').click();
  assert.equal(await page.locator('#transcript-info').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#panel-info').isVisible(), false);
  await lookup();
  await page.locator('#panel-info-open').click(); await page.keyboard.press('Escape');
  assert.equal(await page.locator('#card').isVisible(), true, 'Closing settings preserves the dictionary card');
  const before = (await geometry()).card.height;
  await drag(0, -110);
  assert.ok((await geometry()).card.height > before + 100);
  await page.locator('#card-resize').focus(); await page.keyboard.press('ArrowDown'); await centered();
  const savedHeight = (await geometry()).card.height;
  await page.locator('#close').click(); await centered();
  assert.equal(await page.locator('#card-resize').isVisible(), false);
  await lookup(); assert.ok(Math.abs((await geometry()).card.height - savedHeight) < 2);
  await page.reload(); await page.locator('#transcript').waitFor(); await loadCues(); await lookup();
  assert.ok(Math.abs((await geometry()).card.height - savedHeight) < 2, 'Card size persists across reload');
  for (const mode of ['left', 'top', 'bottom', 'floating', 'right']) {
    await worker.evaluate(mode => chrome.storage.local.set({ panelPosition: mode }), mode);
    await settle(); await centered();
    const horizontal = ['top', 'bottom'].includes(mode);
    await drag(horizontal ? -50 : 0, horizontal ? 0 : -30);
    const { list, card } = await geometry();
    assert.ok(horizontal ? list.right <= card.x : list.bottom <= card.y, 'Card never covers list in ' + mode);
  }
  // Manual scrolling must remain manual when the dictionary is resized.
  await page.locator('#transcript-list').hover(); await page.mouse.wheel(0, 200); await settle();
  assert.equal(await page.locator('#resume-follow').isVisible(), true);
  await page.locator('#card-resize').focus(); await page.keyboard.press('ArrowDown'); await settle();
  assert.equal(await page.locator('#resume-follow').isVisible(), true);
  await page.locator('#resume-follow').click(); await centered();
  await mkdir(resolve(project, 'artifacts'), { recursive: true });
  await page.screenshot({ path: resolve(project, 'artifacts/layout-right.png') });
  for (const mode of ['right', 'bottom', 'floating']) {
    await worker.evaluate(mode => chrome.storage.local.set({ panelPosition: mode }), mode);
    await page.setViewportSize({ width: 520, height: 600 }); await centered();
    const { list, card } = await geometry();
    assert.ok(list.height >= 45 && list.width >= 100, 'Readable list remains in ' + mode);
    assert.ok(card.bottom <= 601 && card.right <= 521);
    await page.locator('#panel-info-open').click();
    const dialog = await page.locator('#panel-info').boundingBox();
    assert.ok(dialog.x >= 0 && dialog.y >= 0 && dialog.x + dialog.width <= 521);
    await page.keyboard.press('Escape');
  }
  await page.screenshot({ path: resolve(project, 'artifacts/layout-narrow.png') });
  await worker.evaluate(() => chrome.storage.local.set({ enabled: false }));
  await settle();
  assert.equal(await page.locator('#side-region').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS: compact header, settings dialog, card mouse/keyboard resize, persistence, active cue centering, all five layouts, manual follow, and small viewports.');
} finally {
  await browser.close(); await rm(profile, { recursive: true, force: true });
}
