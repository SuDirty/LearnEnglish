import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechController } from '../extension/speech.js';

const voices = [
  { voiceName: 'Cloud', lang: 'en-US', remote: true },
  { voiceName: 'Other extension', lang: 'en-US', extensionId: 'other' },
  { voiceName: 'Chinese', lang: 'zh-TW' },
  { voiceName: 'UK', lang: 'en-GB' },
  { voiceName: 'US', lang: 'en-US', remote: false },
];
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}) {
  const calls = []; let stops = 0;
  const api = { tts: { getVoices: async () => voices,
    speak: async (text, config) => { calls.push({ text, ...config }); }, stop: () => { stops++; }, ...options } };
  return { controller: createSpeechController(api, 100), calls, get stops() { return stops; } };
}
test('uses native US English, exact selected spelling, slow rate, and waits for end', async () => {
  const { controller, calls } = setup();
  const done = controller.speak(' learning ', 0.7, 'page');
  await tick();
  assert.equal(calls[0].text, 'learning'); assert.equal(calls[0].voiceName, 'US');
  assert.equal(calls[0].rate, 0.7); assert.equal(calls[0].enqueue, false);
  calls[0].onEvent({ type: 'end' }); assert.deepEqual(await done, { status: 'end' });
});
test('switching pages interrupts old speech; stale events and another page stop cannot cancel the new word', async () => {
  const state = setup(), { controller, calls } = state;
  const first = controller.speak('one', 1, 'A'); await tick();
  const second = controller.speak('two', 1, 'B'); await tick();
  assert.equal((await first).status, 'cancelled');
  calls[0].onEvent({ type: 'error' }); controller.stop('A');
  assert.equal(state.stops, 1);
  calls[1].onEvent({ type: 'end' }); assert.equal((await second).status, 'end');
});
test('prefers the macOS reading voice over novelty voices, with other English locales as fallback', async () => {
  for (const [available, expected] of [
    [[{ voiceName: 'Albert', lang: 'en-US' }, { voiceName: 'Samantha', lang: 'en-US' }], 'Samantha'],
    [[{ voiceName: 'UK', lang: 'en-GB' }], 'UK'],
  ]) {
    const { controller, calls } = setup({ getVoices: async () => available });
    const done = controller.speak('hello', 1, 'A'); await tick();
    assert.equal(calls[0].voiceName, expected);
    calls[0].onEvent({ type: 'end' }); await done;
  }
});
test('stop while voice discovery is pending prevents late playback', async () => {
  let finish;
  const { controller, calls } = setup({ getVoices: () => new Promise(resolve => { finish = resolve; }) });
  const done = controller.speak('hello', 1, 'A'); await tick(); controller.stop('A');
  finish(voices); await tick();
  assert.equal((await done).status, 'cancelled'); assert.equal(calls.length, 0);
});
test('no local English voice gives a useful error without using cloud voices', async () => {
  const { controller, calls } = setup({ getVoices: async () => voices.slice(0, 3) });
  await assert.rejects(controller.speak('hello', 1, 'A'), /安裝英文語音/); assert.equal(calls.length, 0);
});
test('handles both immediate API failure and later synthesis failure', async () => {
  const broken = setup({ speak: async () => { throw new Error('engine unavailable'); } });
  await assert.rejects(broken.controller.speak('hello', 1, 'A'), /engine unavailable/);
  const { controller, calls } = setup();
  const done = controller.speak('hello', 1, 'A');
  const rejected = assert.rejects(done, /系統語音播放失敗/);
  await tick(); calls[0].onEvent({ type: 'error' }); await rejected;
});
test('bounds missing engine events and stops timed out audio', async () => {
  const state = setup();
  await assert.rejects(state.controller.speak('hello', 1, 'A'), /朗讀逾時/);
  assert.equal(state.stops, 1);
});
test('rejects markup, oversized input, unsupported rates, and missing permissions', async () => {
  const { controller, calls } = setup();
  for (const text of ['', '<speak>hello</speak>', 'a'.repeat(201), '中文']) {
    await assert.rejects(controller.speak(text, 1, 'A'));
  }
  await assert.rejects(controller.speak('hello', 3, 'A'));
  await assert.rejects(createSpeechController({}).speak('hello', 1, 'A'), /權限/);
  assert.equal(calls.length, 0);
});
