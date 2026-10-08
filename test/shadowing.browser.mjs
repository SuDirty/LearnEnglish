import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = fileURLToPath(new URL('../', import.meta.url));
const extension = resolve(project, 'extension'), profile = await mkdtemp(join(tmpdir(), 'subtitle-shadowing-'));
const browser = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROME_BIN, channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const fixture = `<!doctype html><meta charset="utf-8"><title>Shadowing fixture</title>
<style>body{margin:0;background:#080f13}.watch-video{position:fixed;inset:0;background:linear-gradient(140deg,#22363e,#080f13)}video{width:100%;height:100%}.player-timedtext-text-container{position:absolute;bottom:16%;left:12%;color:white;font:28px system-ui}</style>
<div class="watch-video"><video preload="auto"></video><div class="player-timedtext-text-container">Keep going.</div></div>
<script>
const video = document.querySelector('video');
const mock = window.mock = {get time(){return video.currentTime;},get paused(){return video.paused;},get seeking(){return video.seeking;},get rate(){return video.playbackRate;},plays:0};
const nativePlay = video.play.bind(video);video.play=()=>{mock.plays++;return nativePlay();};
video.addEventListener('loadedmetadata',()=>{video.playbackRate=1.25;video.currentTime=1;});
fetch('/silence.wav').then(response=>response.blob()).then(blob=>{video.src=URL.createObjectURL(blob);});
for(const [language,texts] of (location.search.includes('approx') ? [] : [['en',['Keep going.','You can do it.','Keep learning.']],['zh-Hant',['繼續努力。','你做得到。','持續學習。']]])) {
 const track=video.addTextTrack('subtitles',language,language);track.mode='hidden';
 texts.forEach((text,i)=>track.addCue(new VTTCue(1+i*2,2.2+i*2,text)));
}
</script>`;
try {
  // Real media state is shared between the main and extension isolated worlds.
  const wav = Buffer.alloc(44 + 8000 * 2 * 60);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  await browser.route('https://www.netflix.com/**', route => route.request().url().endsWith('/silence.wav') ? route.fulfill({ contentType: 'audio/wav', body: wav }) : route.fulfill({ contentType: 'text/html', body: fixture }));
  const page = await browser.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://www.netflix.com/watch/123');
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  await page.locator('.cue-shadow').first().waitFor();
  const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
  const status = async text => {
    try { await page.waitForFunction(text => document.querySelector('#subtitle-pocket-host')?.shadowRoot.querySelector('#shadow-status')?.textContent.includes(text), text); }
    catch (error) { console.log(await page.evaluate(() => ({ mock: window.mock, panel: document.querySelector('#subtitle-pocket-host')?.shadowRoot.querySelector('#shadow-panel')?.innerText })), errors); throw error; }
  };
  const prepare = async (index = 0) => {
    await page.locator('.cue-shadow').nth(index).click(); await status('確認片段');
    await page.waitForFunction(() => !document.querySelector('#subtitle-pocket-host').shadowRoot.querySelector('#shadow-primary').disabled);
  };
  const end = async () => { await page.locator('#shadow-end').click(); await page.waitForFunction(() => window.mock.rate === 1.25); };

  await worker.evaluate(() => chrome.storage.local.set({
    entries: [{ kind: 'word', text: 'going', context: 'Keep going.', time: 1, url: 'https://www.netflix.com/watch/123' }],
    reviewSettings: { enabled: true, hideEnglish: true, hideChinese: true, pause: true },
  }));
  await page.waitForFunction(() => document.querySelector('#subtitle-pocket-host').shadowRoot.querySelector('.cue-text').hidden);
  await prepare();
  assert.equal(await page.locator('.cue-text').first().isVisible(), true, 'Shadowing overrides review masking');
  assert.equal(await page.locator('.cue-zh').first().isVisible(), false);
  await page.locator('#shadow-rounds').selectOption('1');
  await page.locator('#shadow-rate').selectOption('0.75');
  await page.locator('#shadow-settings').click();
  await page.locator('#shadow-demo').uncheck();
  await page.locator('#shadow-rest').selectOption('0.5');
  assert.equal(await page.locator('#shadow-echo-field').isVisible(), false);
  await page.locator('#shadow-dialog-done').click();
  await page.locator('#shadow-primary').click(); await status('跟著原音說');
  assert.equal(await page.evaluate(() => mock.rate), .75);
  await status('這段練習完成');
  const finish = await page.evaluate(() => ({ ...mock }));
  assert.equal(finish.paused, true); assert.equal(finish.plays, 1);
  assert.ok(finish.time >= 2.2 && finish.time < 2.45, 'Stops at sentence end within 250 ms in fixture');
  await end();
  assert.equal(await page.locator('.cue-text').first().isVisible(), false, 'Review mask restored');

  await prepare();
  await page.locator('#shadow-rounds').selectOption('2');
  await page.locator('#shadow-settings').click();
  await page.locator('#shadow-mode-echo').check();
  assert.equal(await page.locator('#shadow-rest-field').isVisible(), false);
  assert.match(await page.locator('#shadow-echo-hint').innerText(), /約 3 秒/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#shadow-dialog').isVisible(), false);
  await page.locator('#shadow-primary').click(); await status('換你說');
  const remaining = await page.locator('#shadow-status').innerText();
  await page.locator('#shadow-primary').click(); await status('已暫停');
  await page.waitForTimeout(1200); await page.locator('#shadow-primary').click(); await status('換你說');
  assert.equal(await page.locator('#shadow-status').innerText(), remaining, 'Learner timer stays frozen during pause');
  await page.locator('#shadow-done').click(); await status('第 2 / 2 輪');
  await page.locator('.cue-word').first().click(); await page.locator('#card').waitFor(); await status('已暫停');
  await page.locator('#close').click(); assert.ok((await page.locator('#shadow-status').innerText()).includes('已暫停'));
  await page.locator('#shadow-primary').click();
  await page.evaluate(() => { document.querySelector('video').currentTime = 20; }); await status('已暫停');
  await page.locator('#shadow-primary').click(); await status('先聽');
  assert.ok((await page.evaluate(() => mock.time)) < 2.2, 'Manual seek resumes from current round start');
  await page.locator('#transcript-close').click();
  await page.locator('#shadow-compact-pause').waitFor(); await page.locator('#shadow-compact-pause').click();
  await page.waitForFunction(() => mock.paused);
  await page.locator('#transcript-toggle').click();
  await page.locator('#shadow-rate').selectOption('0.9');
  await status('已暫停');
  assert.match(await page.locator('#shadow-message').innerText(), /設定已更新/);
  await page.locator('#shadow-primary').click(); await status('先聽');
  assert.equal(await page.evaluate(() => mock.rate), .9);
  await page.locator('#shadow-settings').click();
  await status('已暫停');
  await page.locator('#shadow-dialog-done').click();
  assert.equal(await page.evaluate(() => mock.paused), true, 'Closing settings never resumes unexpectedly');
  await page.locator('#shadow-rate').selectOption('0.75');
  await end();

  // Frozen selection uses full original cues, not a fake word-level timestamp.
  await worker.evaluate(() => chrome.storage.local.set({ reviewSettings: { enabled: false } }));
  const a = page.locator('.cue').nth(0).locator('.cue-word').first(), b = page.locator('.cue').nth(1).locator('.cue-word').last();
  const first = await a.boundingBox(), last = await b.boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2); await page.mouse.down();
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 10 }); await page.mouse.up();
  await page.locator('#selection-shadow').click(); await status('確認片段');
  assert.match(await page.locator('#shadow-text').innerText(), /Keep going\.\s+You can do it\./);
  assert.match(await page.locator('#shadow-message').innerText(), /3.2 秒/);
  await page.locator('#shadow-en').uncheck();
  assert.equal(await page.locator('#shadow-text').innerText(), '英文字幕已遮蔽');
  assert.equal(await page.locator('.cue-text').first().isVisible(), false);
  assert.ok(!(await page.locator('.cue-jump').first().getAttribute('aria-label')).includes('Keep'));
  await page.locator('#shadow-en').check();
  await mkdir(resolve(project, 'artifacts'), { recursive: true });
  await page.screenshot({ path: resolve(project, 'artifacts/shadowing-desktop.png') });
  await page.locator('#shadow-settings').click();
  await page.screenshot({ path: resolve(project, 'artifacts/shadowing-settings-desktop.png') });
  await page.setViewportSize({ width: 390, height: 600 });
  await page.screenshot({ path: resolve(project, 'artifacts/shadowing-settings-narrow.png') });
  const dialogBox = await page.locator('#shadow-dialog').boundingBox();
  assert.ok(dialogBox.width <= 390 && dialogBox.x >= 0);
  await page.locator('#shadow-dialog-done').click();
  await page.setViewportSize({ width: 520, height: 600 });
  await page.screenshot({ path: resolve(project, 'artifacts/shadowing-narrow.png') });
  assert.equal(await page.locator('#shadow-primary').isVisible(), true);
  await end();

  // Exercise Netflix API routing too, with rapid replay followed by navigation cleanup.
  await page.evaluate(() => {
    const video = document.querySelector('video');
    window.netflix = { appContext: { state: { playerApp: { getAPI: () => ({ videoPlayer: {
      getAllPlayerSessionIds: () => ['watch'], getVideoPlayerBySessionId: () => ({ seek: ms => { video.currentTime = ms / 1000; }, play: () => video.play(), pause: () => video.pause(), getCurrentTime: () => video.currentTime * 1000 }),
    } }) } } } };
  });
  await prepare(); await page.locator('#shadow-primary').click(); await status('先聽');
  const stale = await page.evaluate(() => new Promise(resolve => {
    const id = crypto.randomUUID();
    function receive(event) { if (event.data?.type === 'controlResult' && event.data.id === id) { window.removeEventListener('message', receive); resolve(event.data); } }
    window.addEventListener('message', receive);
    window.postMessage({ channel: 'subtitle-pocket-v2', from: 'extension', type: 'control', action: 'rate', rate: 1, sessionId: 'expired', path: location.pathname, id }, location.origin);
  }));
  assert.equal(stale.ok, false); assert.equal(await page.evaluate(() => mock.rate), .75, 'Expired sessions cannot change playback');
  await page.locator('#shadow-retry').evaluate(el => { el.click(); el.click(); el.click(); });
  await page.evaluate(() => history.pushState({}, '', '/watch/999'));
  await page.waitForFunction(() => document.querySelector('#subtitle-pocket-host').shadowRoot.querySelector('#shadow-panel').hidden);
  const count = await page.evaluate(() => mock.plays); await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => mock.plays), count, 'Old commands cannot play the next episode');
  await page.goto('https://www.netflix.com/watch/123?approx=1');
  await page.locator('.cue-shadow').first().waitFor(); await prepare();
  assert.match(await page.locator('#shadow-message').innerText(), /時間約略/);
  await page.locator('#shadow-primary').click(); await status('手動跟讀');
  await page.waitForTimeout(600); assert.equal(await page.evaluate(() => mock.paused), false);
  await end();
  assert.deepEqual(errors, []);
  console.log('PASS shadowing browser checks: HTML/Netflix player, timing, review, echo, lookup, seek, collapse, selection, masks, narrow layout and navigation');
} finally { await browser.close(); await rm(profile, { recursive: true, force: true }); }
