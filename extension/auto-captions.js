(() => {
  const channel = 'subtitle-pocket-v2';
  const pathNow = () => /^\/watch\/\d+$/.test(location.pathname) ? location.pathname : '';
  const send = data => window.postMessage({ channel, from: 'player', ...data }, location.origin);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const available = new Map();
  let job = null, requestedPath = '', enabled = false;
  const getPlayer = () => {
    try {
    const api = window.netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
    const ids = api?.getAllPlayerSessionIds?.() || [];
    return ids.length ? api.getVideoPlayerBySessionId(ids.find(id => String(id).includes('watch')) || ids[0]) : null;
    } catch { return null; }
  };
  const key = track => track == null || track.isNoneTrack ? 'off' : String(track.id ?? track.trackId ?? track.trackID ?? JSON.stringify([track.bcp47, track.language, track.displayName, track.rawTrackType]));
  const language = track => String(track?.bcp47 || track?.language || '').toLowerCase();
  const kind = track => /^en(?:-|$)/.test(language(track)) ? 'english' : /^(?:zh|cmn)(?:-|$)/.test(language(track)) ? 'chinese' : '';
  const rank = track => /hant|tw|hk|mo/.test(language(track)) ? 3 : /hans|cn|sg/.test(language(track)) ? 1 : 2;
  const status = (task, message, retry = false) => { if (task.path === pathNow()) send({ type: 'autoCaptionStatus', path: task.path, message, retry }); };
  const stopped = task => task.cancel || task.path !== pathNow();
  async function run(task) {
    let player, names, original, expected, setter, getter, wrapper, descriptor, changed = false, userChanged = false;
    let message = '', retry = false;
    try {
      status(task, '正在準備自動載入中英文字幕…');
      const until = Date.now() + 20000;
      while (!stopped(task) && Date.now() < until) {
        if (available.get(task.path)?.has('english') && available.get(task.path)?.has('chinese')) {
          message = '中英文字幕已載入，已保留目前字幕設定。'; return;
        }
        try {
          player = getPlayer();
          names = [['getTimedTextTrackList', 'getTimedTextTrack', 'setTimedTextTrack'], ['getTextTrackList', 'getTextTrack', 'setTextTrack']].find(group => group.every(name => typeof player?.[name] === 'function'));
          if (names && player[names[0]]()?.length) break;
        } catch { names = null; }
        await sleep(500);
      }
      if (stopped(task)) return;
      if (!names) throw new Error('此播放器尚未提供可用的字幕控制，稍後可重試。');
      const tracks = player[names[0]]();
      if (!Array.isArray(tracks) || !tracks.length) throw new Error('字幕軌尚未就緒，稍後可重試。');
      getter = player[names[1]].bind(player); setter = player[names[2]];
      original = getter();
      if (original === undefined) throw new Error('無法確認原本字幕設定，已保留原設定。');
      if (original === null) original = tracks.find(track => track.isNoneTrack) || null;
      expected = original;
      const english = kind(original) === 'english' && !original.isForcedNarrative ? original : tracks.find(track => !track.isNoneTrack && !track.isForcedNarrative && kind(track) === 'english');
      const chinese = tracks.filter(track => !track.isNoneTrack && !track.isForcedNarrative && kind(track) === 'chinese').sort((a, b) => rank(b) - rank(a))[0];
      const targets = [english, chinese].filter(Boolean);
      // Observe user changes through the same public player object; our calls bypass this wrapper.
      descriptor = Object.getOwnPropertyDescriptor(player, names[2]);
      wrapper = function (...args) { userChanged = true; task.cancel = true; return Reflect.apply(setter, this, args); };
      try { player[names[2]] = wrapper; } catch { /* Getter checks below also detect a changed selection. */ }
      for (const target of targets) {
        if (stopped(task)) break;
        if (available.get(task.path)?.has(kind(target))) continue;
        const previous = getter();
        if (key(previous) !== key(expected)) { userChanged = true; break; }
        expected = target;
        status(task, '正在取得' + (kind(target) === 'english' ? '英文' : '中文') + '字幕，完成後還原原設定…');
        if (key(previous) !== key(target)) {
          changed = true;
          const result = Reflect.apply(setter, player, [target]);
          if (result?.then) await Promise.race([result, sleep(2000).then(() => { throw new Error('播放器切換字幕逾時。'); })]);
        }
        window.postMessage({ channel, from: 'extension', type: 'requestCaptions' }, location.origin);
        const deadline = Date.now() + 5000;
        while (!stopped(task) && Date.now() < deadline) {
          const current = getter();
          if (key(current) !== key(target) && key(current) !== key(previous)) { userChanged = true; task.cancel = true; break; }
          if (available.get(task.path)?.has(kind(target))) break;
          await sleep(100);
        }
        if (!stopped(task) && key(getter()) !== key(target)) throw new Error('播放器未完成字幕切換。');
      }
      const got = available.get(task.path) || new Set();
      if (userChanged) message = '已保留你新選擇的字幕，停止自動切換。';
      else if (!english || !chinese) message = !english ? '此影片未提供可用的英文字幕軌。' : '此影片未提供可用的中文字幕，翻譯會使用 Google 翻譯（需設定金鑰）。';
      else if (got.has('english') && got.has('chinese')) message = '中英文字幕已載入。';
      else { message = '已嘗試載入字幕，但尚未收到完整資料。'; retry = true; }
    } catch (error) { message = error.message || '自動載入字幕失敗。'; retry = true; }
    finally {
      // Restore on errors/disable as well. Never overwrite a newer user selection or a new episode.
      if (changed && !userChanged && task.path === pathNow() && player === getPlayer()) {
        try {
          const current = getter();
          if (key(current) === key(expected) || key(current) === key(original)) {
            for (let attempt = 0; (attempt === 0 || key(getter()) !== key(original)) && attempt < 3; attempt++) {
              const result = Reflect.apply(setter, player, [original]);
              if (result?.then) await Promise.race([result, sleep(1000)]);
              for (let i = 0; i < 10 && key(getter()) !== key(original) && !userChanged; i++) await sleep(100);
              if (userChanged) break;
            }
            if (!userChanged && key(getter()) !== key(original)) throw new Error('未能還原字幕設定，請在 Netflix 字幕選單確認。');
            if (!userChanged) message += ' 已還原原本字幕設定。';
          } else userChanged = true;
        } catch { message = '未能還原字幕設定，請在 Netflix 字幕選單確認。'; retry = true; }
      }
      if (player && names && player[names[2]] === wrapper) {
        try { if (descriptor) Object.defineProperty(player, names[2], descriptor); else delete player[names[2]]; } catch { /* Preserve a newer player implementation. */ }
      }
      if (userChanged) { message = '已保留你新選擇的字幕，停止自動切換。'; retry = true; }
      if (message) status(task, message, retry);
      if (job === task) job = null;
    }
  }
  window.addEventListener('message', async event => {
    const m = event.data;
    if (event.source !== window || event.origin !== location.origin || m?.channel !== channel || m.from !== 'extension') return;
    if (m.type === 'captionAvailable' && m.path === pathNow() && ['english', 'chinese'].includes(m.kind)) {
      if (!available.has(m.path)) available.set(m.path, new Set());
      available.get(m.path).add(m.kind); while (available.size > 6) available.delete(available.keys().next().value);
    }
    if (m.type !== 'autoCaptions') return;
    if (!m.enabled) { enabled = false; requestedPath = ''; if (job) job.cancel = true; return; }
    if (!m.path || m.path !== pathNow()) return;
    if (enabled && requestedPath === m.path && !m.retry) return;
    enabled = true; requestedPath = m.path;
    if (job) { job.cancel = true; await job.promise; }
    if (!enabled || requestedPath !== m.path || m.path !== pathNow()) return;
    const task = { path: m.path, cancel: false }; job = task; task.promise = run(task);
  });
})();
