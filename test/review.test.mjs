import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/review.js';
import { makeEntry } from '../extension/core.js';
const { targets, settings, createPauseGate } = globalThis.SubtitlePocketReview;
const cues = [
  { start: 1.4, end: 3, text: 'Keep going.' },
  { start: 3, end: 5, text: 'You can do it.' },
  { start: 7, end: 9, text: 'Keep going.' },
];
const entry = { kind: 'word', text: 'going', context: 'Keep going.', time: 1, url: 'https://www.netflix.com/watch/123?track=1' };
const match = (entries, kinds = ['word', 'phrase', 'sentence'], source = cues) => [...targets(source, entries, '/watch/123', kinds)];
test('review defaults are off; empty kinds remain empty', () => {
  assert.equal(settings().enabled, false);
  assert.equal(settings().hideChinese, true);
  assert.deepEqual(settings({ kinds: [] }).kinds, []);
  assert.deepEqual(settings({ kinds: ['word', 'invalid'] }).kinds, ['word']);
  assert.equal(settings(null).enabled, false);
});
test('old integer timestamps match only the saved occurrence and video', () => {
  assert.deepEqual(match([entry]), [0]);
  assert.deepEqual(match([{ ...entry, url: 'https://www.netflix.com/watch/999' }]), []);
  assert.deepEqual(match([{ ...entry, url: 'https://example.com/watch/123' }]), []);
  assert.deepEqual(match([{ ...entry, time: 7 }]), [2]);
});
test('kinds filter uses OR and no selection means no targets', () => {
  assert.deepEqual(match([entry], []), []);
  assert.deepEqual(match([entry], ['phrase', 'sentence']), []);
  assert.deepEqual(match([entry], ['phrase', 'word']), [0]);
});
test('old and new paragraphs cover all contextual sentences but no later repetitions', () => {
  const paragraph = { ...entry, kind: 'sentence', context: 'Keep going.\nYou can do it.' };
  assert.deepEqual(match([paragraph]), [0, 1]);
  assert.deepEqual(match([{ ...paragraph, cueStart: 1.4, cueEnd: 5 }]), [0, 1]);
});
test('a saved original sentence still matches a row grouped by Chinese captions', () => {
  assert.deepEqual(match([entry], ['word'], [{ start: 1.4, end: 5, text: 'Keep going.\nYou can do it.' }]), [0]);
});
test('invalid entries and unknown context do not mask unrelated words', () => {
  assert.deepEqual(match([null, {}, { ...entry, context: '' }, { ...entry, context: 'Another sentence.' }]), []);
});
test('pause only once while inside a target, including after resuming', () => {
  const gate = createPauseGate(); const matched = new Set([0, 2]);
  assert.equal(gate.update(cues, matched, 1.5, true, true), true);
  assert.equal(gate.update(cues, matched, 1.5, false, true), false);
  assert.equal(gate.update(cues, matched, 1.6, true, true), false);
  assert.equal(gate.update(cues, matched, 5, true, true), false);
  assert.equal(gate.update(cues, matched, 7, true, true), true);
});
test('seeking, replay and disabling reset pause state; manual paused arrival waits for play', () => {
  const gate = createPauseGate(); const matched = new Set([0]);
  assert.equal(gate.update(cues, matched, 2, false, true), false);
  assert.equal(gate.update(cues, matched, 2, true, true), true);
  gate.reset();
  assert.equal(gate.update(cues, matched, 2, true, true), true);
  gate.update(cues, matched, 2, true, false);
  assert.equal(gate.update(cues, matched, 2, true, true), true);
});
test('new saves retain precise ranges without changing legacy integer time', () => {
  const saved = makeEntry({ ...entry, translation: '繼續', time: 1.4, cueEnd: 5 });
  assert.equal(saved.time, 1);
  assert.equal(saved.cueStart, 1.4);
  assert.equal(saved.cueEnd, 5);
  assert.equal(makeEntry({ ...entry, translation: '繼續', cueEnd: -1 }).cueEnd, undefined);
});

test('paragraphs still match when Chinese grouping includes adjacent unsaved fragments', () => {
  const earlier = { start: 0, end: 1.4, text: 'Ready?' };
  const later = { start: 5, end: 6, text: 'Right now.' };
  const rows = [
    { start: 0, end: 3, text: 'Ready? Keep going.', parts: [earlier, cues[0]] },
    { start: 3, end: 6, text: 'You can do it. Right now.', parts: [cues[1], later] },
    cues[2]
  ];
  assert.deepEqual(match([{ ...entry, kind: 'sentence', context: 'Keep going. You can do it.' }], ['sentence'], rows), [0, 1]);
});
