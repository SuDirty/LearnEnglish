import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/shadowing.js';

const { create, settings, queue } = globalThis.SubtitlePocketShadowing;
const cues = [{ start: 2, end: 4, text: 'Keep going.' }, { start: 5, end: 7, text: 'Try again.' }];
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  let clock = 0, fail = '', delayed;
  const video = { valid: true, time: 0, paused: true, seeking: false, rate: 1.25 }, calls = [];
  const engine = create({ sample: () => video, now: () => clock, command: async (action, args = {}) => {
    calls.push([action, args]);
    if (delayed?.action === action) { const wait = delayed; delayed = null; await wait.promise; }
    if (action === fail) { fail = ''; throw new Error('test failure'); }
    if (['pause', 'claim', 'release'].includes(action)) video.paused = true;
    if (action === 'release') video.rate = 1.25;
    if (action === 'play') video.paused = false;
    if (action === 'seek') video.time = args.time;
    if (action === 'rate') video.rate = args.rate;
    return { rate: video.rate };
  } });
  return { engine, video, calls, fail: action => { fail = action; },
    delay(action) { let resolve; const promise = new Promise(r => { resolve = r; }); delayed = { action, promise }; return resolve; },
    async endCue() { for (let i = 0; i < 4; i++) { video.time += .5; engine.tick(); await flush(); } },
    async time(ms) { clock += ms; engine.tick(); await flush(); },
  };
}

test('settings reject invalid values; queue freezes English parts and includes only the selected occurrence', () => {
  assert.deepEqual(settings(null), settings());
  assert.equal(settings({ rounds: 99, rate: 9 }).rounds, 3);
  const rows = [{ start: 0, end: 20, text: 'Keep going.', parts: [cues[0]] }, cues[1], { start: 9, end: 10, text: 'Keep going.' }];
  const result = queue(rows, 2, 5);
  assert.deepEqual(result, [{ start: 2, end: 7, text: 'Keep going.\nTry again.' }, rows[2]]);
  rows[2].start = 99;
  assert.equal(result[1].start, 9);
  assert.equal(queue([cues[0], { start: 3.8, end: 5, text: 'Overlapping reply.' }], 2).length, 2, 'Next never drops an overlapping subtitle');
});

test('demo does not count as a round; precisely three rounds complete and remain paused', async () => {
  const h = harness(), e = h.engine;
  await e.prepare(cues, { rounds: 3 }); await e.start();
  assert.equal(e.snapshot().phase, 'demo');
  await h.endCue(); assert.equal(e.snapshot().phase, 'between');
  e.tick(); await flush();
  for (let round = 1; round <= 3; round++) {
    assert.equal(e.snapshot().round, round);
    await h.endCue(); assert.equal(e.snapshot().phase, 'rest');
    await h.time(1000);
  }
  assert.equal(e.snapshot().phase, 'complete'); assert.equal(h.video.paused, true);
  assert.equal(h.calls.filter(([a]) => a === 'play').length, 4);
  await e.stop(); assert.equal(h.video.rate, 1.25);
});

test('echo uses actual speed; countdown freezes during pause; early completion advances once', async () => {
  const h = harness(), e = h.engine;
  await e.prepare(cues, { demo: false, mode: 'echo', rate: .75, rounds: 2 }); await e.start(); await h.endCue();
  assert.equal(e.snapshot().phase, 'echo');
  assert.ok(Math.abs(e.snapshot().remaining - (2 / .75 + 1)) < .001);
  await h.time(1000); await e.pause(); const remaining = e.snapshot().remaining;
  await h.time(9000); assert.equal(e.snapshot().remaining, remaining);
  await e.resume(); await h.time(500); assert.ok(Math.abs(e.snapshot().remaining - remaining + .5) < .001);
  const first = e.advance(); e.advance(); await first;
  assert.equal(e.snapshot().round, 2);
  assert.equal(e.snapshot().phase, 'playing');
});

test('buffering and manual pause never count rounds; external seek restarts the current round', async () => {
  const h = harness(), e = h.engine;
  await e.prepare(cues, { demo: false }); await e.start();
  await h.time(20000); assert.equal(e.snapshot().phase, 'playing');
  h.video.paused = true; e.tick(); await flush();
  assert.equal(e.snapshot().phase, 'paused'); assert.equal(e.snapshot().round, 1);
  h.video.time = 20; await e.externalSeek(); await e.resume();
  assert.equal(h.video.time, 2); assert.equal(e.snapshot().round, 1);
});

test('seek failure is recoverable and stop invalidates a delayed seek before any play', async () => {
  const h = harness(), e = h.engine;
  await e.prepare(cues, { demo: false }); h.fail('seek'); await e.start();
  assert.equal(e.snapshot().phase, 'error'); assert.equal(h.video.paused, true);
  await e.retry(); assert.equal(e.snapshot().phase, 'playing');
  const release = h.delay('seek'); const replay = e.retry(); await flush();
  await e.stop(); const count = h.calls.filter(([a]) => a === 'play').length;
  release(); await replay;
  assert.equal(e.snapshot().phase, 'idle'); assert.equal(h.calls.filter(([a]) => a === 'play').length, count);
});

test('latest selection wins when previous release is delayed', async () => {
  const h = harness(), e = h.engine;
  await e.prepare(cues, {});
  const release = h.delay('release'); const older = e.prepare([cues[0]], {}); await flush();
  await e.prepare([cues[1]], {}); release(); await older;
  assert.equal(e.snapshot().queue[0].start, 5);
});

test('a user seek while resume is awaiting playback cancels that resume', async () => {
  const h = harness(), e = h.engine;
  await e.prepare(cues, { demo: false }); await e.start(); await e.pause();
  const release = h.delay('play'), resuming = e.resume(); await flush();
  h.video.time = 20; await e.externalSeek(); release(); await resuming;
  assert.equal(e.snapshot().phase, 'paused');
  e.tick(); await flush(); assert.equal(h.video.paused, true);
  await e.resume(); assert.equal(h.video.time, 2); assert.equal(e.snapshot().phase, 'playing');
});

test('preview navigation does not play and visibility settings do not mutate the frozen queue', async () => {
  const h = harness(), e = h.engine;
  await e.prepare(cues, {}); await e.move(1);
  assert.equal(e.snapshot().phase, 'ready'); assert.equal(h.video.paused, true);
  assert.equal(h.calls.filter(([action]) => action === 'play').length, 0);
  e.update({ ...settings(), hideEnglish: true });
  assert.deepEqual(e.mask(), { hideEnglish: true, hideChinese: true });
  assert.equal(e.current().start, 5); assert.equal(Object.isFrozen(e.snapshot().queue[0]), true);
  await e.stop(); assert.equal(e.mask(), null);
});

test('editing playback settings mid-practice pauses and applies the latest choices on resume', async () => {
  const h = harness(), e = h.engine;
  await e.prepare(cues, { demo: false, rounds: 3 }); await e.start();
  await h.endCue(); await h.time(1000); assert.equal(e.snapshot().round, 2);
  await e.update({ ...e.snapshot().settings, rate: .75, rounds: 1, mode: 'echo' });
  assert.equal(e.snapshot().phase, 'paused'); assert.equal(h.video.paused, true);
  assert.equal(e.snapshot().round, 1);
  await e.resume(); assert.equal(h.video.rate, .75); assert.equal(h.video.time, 2);
  await h.endCue(); assert.equal(e.snapshot().phase, 'echo');
  await e.update({ ...e.snapshot().settings, echoFactor: 2 });
  assert.equal(e.snapshot().phase, 'paused');
  await e.resume(); await h.endCue();
  assert.ok(Math.abs(e.snapshot().remaining - (2 / .75 * 2 + 1)) < .001);
});

test('automatic next advances once; approximate captions only replay manually; missing video ends session', async () => {
  const h = harness(), e = h.engine;
  await e.prepare(cues, { demo: false, rounds: 1, autoNext: true }); await e.start(); await h.endCue(); await h.time(1000);
  assert.equal(e.snapshot().index, 1); assert.equal(h.video.time, 5);
  await e.prepare(cues, {}, true); await e.start(); await h.endCue();
  assert.equal(e.snapshot().phase, 'manual'); assert.equal(h.video.paused, false);
  h.video.valid = false; e.tick(); await flush(); assert.equal(e.snapshot().phase, 'idle');
});
