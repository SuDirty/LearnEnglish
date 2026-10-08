(() => {
  const oneOf = (value, values, fallback) => values.includes(value) ? value : fallback;
  function settings(value = {}) {
    value = value && typeof value === 'object' ? value : {};
    return {
      mode: oneOf(value.mode, ['shadow', 'echo'], 'shadow'), demo: value.demo !== false,
      rounds: oneOf(value.rounds, [1, 2, 3, 4, 5], 3), rate: oneOf(value.rate, [.75, .9, 1], 1),
      rest: oneOf(value.rest, [.5, 1, 2], 1), echoFactor: oneOf(value.echoFactor, [1, 1.5, 2], 1),
      hideEnglish: value.hideEnglish === true, hideChinese: value.hideChinese !== false,
      autoNext: value.autoNext === true,
    };
  }
  // Freeze original English timing even when the visible rows are grouped by Chinese cues.
  function segments(rows) {
    return rows.map(row => {
      const parts = row.parts?.length ? row.parts : [row];
      return { start: Math.min(...parts.map(p => p.start)), end: Math.max(...parts.map(p => p.end)), text: row.text };
    }).filter(row => Number.isFinite(row.start) && Number.isFinite(row.end) && row.start >= 0 && row.end > row.start && row.text);
  }
  function queue(rows, start, end = start) {
    const source = segments(rows), chosen = source.filter(cue => cue.start >= start && cue.start <= end);
    if (!chosen.length) return [];
    const first = { start: chosen[0].start, end: Math.max(...chosen.map(c => c.end)), text: chosen.map(c => c.text).join('\n') };
    return [first, ...source.slice(source.indexOf(chosen.at(-1)) + 1)];
  }
  function create({ command, sample, now = () => performance.now(), onChange = () => {} }) {
    let state = { phase: 'idle', index: 0, round: 0, remaining: 0, message: '', queue: [], settings: settings(), approximate: false };
    let epoch = 0, preparation = 0, internalSeekEpoch = -1, busy = false, resumePhase = '', restart = false, deadline = 0, lastRemaining = -1, expectedTime = null;
    const snapshot = () => ({ ...state, settings: { ...state.settings }, busy });
    const emit = () => onChange(snapshot());
    const set = (phase, values = {}) => { Object.assign(state, values, { phase }); emit(); };
    const active = () => state.phase !== 'idle';
    const current = () => state.queue[state.index];
    async function run(work) {
      const token = ++epoch; busy = true; emit();
      const send = async (action, args = {}) => {
        if (token !== epoch) throw new Error('cancelled');
        if (action === 'seek') internalSeekEpoch = token;
        const result = await command(action, args);
        if (token !== epoch) throw new Error('cancelled');
        if (action === 'seek') internalSeekEpoch = -1;
        return result;
      };
      try { await work(send, () => token === epoch); }
      catch (error) {
        if (token === epoch) {
          // A failed play or seek must not leave the video running outside the exercise.
          try { await command('pause'); } catch { /* Preserve the original actionable error. */ }
          if (token === epoch) set('error', { message: error.message || '播放失敗，請重試。' });
        }
      } finally { if (token === epoch) { busy = false; emit(); } }
    }
    async function prepare(items, preferences, approximate = false) {
      const serial = ++preparation;
      if (active()) await stop(false);
      if (serial !== preparation) return;
      const frozen = segments(items);
      if (!frozen.length) return;
      state = { phase: 'ready', index: 0, round: 0, remaining: 0, message: '', queue: Object.freeze(frozen.map(Object.freeze)), settings: settings(preferences), approximate };
      restart = false; expectedTime = null; emit();
      await run(async send => { await send('claim'); });
    }
    async function playRound(demo = false) {
      if (!active() || !current()) return;
      restart = false; expectedTime = null;
      await run(async send => {
        set('seeking', { remaining: 0, message: '' });
        await send('claim');
        await send('pause');
        const result = await send('rate', { rate: state.settings.rate });
        if (result?.warning) state.message = result.warning;
        await send('seek', { time: current().start });
        await send('play');
        expectedTime = sample().time;
        set(state.approximate ? 'manual' : demo ? 'demo' : 'playing');
      });
    }
    function start() {
      if (!active() || busy) return;
      state.round = 1;
      return playRound(state.settings.demo && !state.approximate);
    }
    function pause(message = '', fromSeek = false) {
      if (!active() || state.phase === 'error') return;
      if (state.phase === 'paused' && !busy) { if (fromSeek) restart = true; return; }
      resumePhase = state.phase; restart = fromSeek || busy || state.phase === 'seeking';
      if (state.phase === 'rest' || state.phase === 'echo') state.remaining = Math.max(0, (deadline - now()) / 1000);
      return run(async send => { set('paused', { message }); await send('pause'); });
    }
    function resume() {
      if (busy || state.phase !== 'paused') return;
      if (restart) return playRound(resumePhase === 'demo');
      if (resumePhase === 'rest' || resumePhase === 'echo') {
        deadline = now() + state.remaining * 1000; set(resumePhase, { message: '' }); return;
      }
      if (['ready', 'complete'].includes(resumePhase)) { set(resumePhase, { message: '' }); return; }
      return run(async send => {
        await send('play'); expectedTime = sample().time;
        set(resumePhase === 'manual' ? 'manual' : resumePhase === 'demo' ? 'demo' : 'playing', { message: '' });
      });
    }
    async function finishPlayback() {
      const demo = state.phase === 'demo';
      await run(async send => {
        // Change phase before awaiting the pause acknowledgement, so repeated ticks cannot advance twice.
        set('stopping'); await send('pause');
        if (demo) { set('between'); return; }
        const rate = sample().rate || 1;
        state.remaining = state.settings.mode === 'echo' ? (current().end - current().start) / rate * state.settings.echoFactor + 1 : state.settings.rest;
        deadline = now() + state.remaining * 1000; lastRemaining = -1;
        set(state.settings.mode === 'echo' ? 'echo' : 'rest');
      });
    }
    function advance() {
      if (busy || !['rest', 'echo'].includes(state.phase)) return;
      if (state.round < state.settings.rounds) { state.round++; return playRound(); }
      set('complete', { remaining: 0 });
      if (state.settings.autoNext && state.index + 1 < state.queue.length) return move(1);
    }
    function move(delta) {
      if (!active()) return;
      const index = state.index + delta;
      if (index < 0 || index >= state.queue.length) return;
      state.index = index;
      if (state.phase === 'ready') { state.round = 0; emit(); return; }
      state.round = 1;
      return playRound(state.settings.demo && !state.approximate);
    }
    function retry(all = false) {
      if (!active()) return;
      if (all) state.round = 1;
      else state.round = Math.max(1, state.round);
      return playRound(all && state.settings.demo && !state.approximate);
    }
    function update(preferences) {
      const next = settings(preferences);
      const playbackChanged = ['mode', 'rate', 'rounds', 'rest', 'echoFactor', 'demo', 'autoNext'].some(key => next[key] !== state.settings[key]);
      state.settings = next;
      if (active() && playbackChanged && state.phase !== 'ready') {
        state.round = state.phase === 'complete' ? 1 : Math.min(Math.max(1, state.round), next.rounds);
        const message = '設定已更新。按繼續，從本輪開頭練習。';
        if (state.phase === 'error') { restart = true; resumePhase = 'playing'; set('paused', { message }); return; }
        const result = pause(message, true);
        if (!next.demo && resumePhase === 'demo') resumePhase = 'playing';
        state.message = message; emit(); return result;
      }
      emit();
    }
    function externalSeek() {
      const internal = internalSeekEpoch === epoch && Math.abs(sample().time - current()?.start) <= .2;
      if (active() && !internal) return pause('影片位置已變更，按繼續從本輪開頭重播。', true);
    }
    function tick() {
      if (!active() || busy) return;
      const video = sample();
      if (!video.valid) { void stop(); return; }
      if (['playing', 'demo', 'manual'].includes(state.phase)) {
        if (video.seeking || (expectedTime !== null && (video.time < expectedTime - .3 || video.time > expectedTime + 1.5))) { void externalSeek(); return; }
        expectedTime = video.time;
        if (state.phase !== 'manual' && video.time >= current().end) { void finishPlayback(); return; }
        if (video.paused) { void pause('已暫停，按繼續練習。'); return; }
      } else {
        // Netflix's play key never silently skips the learner's turn or a paused exercise.
        if (!video.paused) {
          if (state.phase === 'paused') void run(send => send('pause'));
          else void pause('已暫停，請使用跟讀的繼續按鈕。', true);
          return;
        }
        if (state.phase === 'between') { void playRound(); return; }
        if (state.phase === 'rest' || state.phase === 'echo') {
          state.remaining = Math.max(0, (deadline - now()) / 1000);
          if (state.remaining <= 0) { void advance(); return; }
          if (Math.ceil(state.remaining) !== lastRemaining) { lastRemaining = Math.ceil(state.remaining); emit(); }
        }
      }
    }
    async function stop(invalidate = true) {
      if (invalidate) preparation++;
      if (!active()) return;
      ++epoch; busy = false; state.phase = 'idle'; state.message = ''; expectedTime = null; emit();
      try { await command('release'); }
      catch { if (sample().valid && state.phase === 'idle') { state.message = '練習已結束，但播放器未確認還原，請檢查暫停狀態與速度。'; emit(); } }
    }
    const mask = () => active() ? { hideEnglish: state.settings.hideEnglish, hideChinese: state.settings.hideChinese } : null;
    return { prepare, start, pause, resume, retry, move, advance, update, externalSeek, tick, stop, active, snapshot, mask, current: () => active() ? current() : null };
  }
  globalThis.SubtitlePocketShadowing = { settings, segments, queue, create };
})();
