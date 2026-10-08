(() => {
  const api = globalThis.SubtitlePocketShadowing;
  api.createUI = (root, { getCues, precise, changed, selected, translate }) => {
    const $ = id => root.getElementById(id), pending = new Map();
    let preferences = api.settings(), edited = false, sessionId = '', sessionPath = '', sessionVideo = null, timer = null, boundVideo = null, lastMask = '', lastSegment = '';
    const style = document.createElement('style');
    style.textContent = `
      #shadow-open{background:#b7efcd;color:#142d22;border-radius:7px;padding:5px 9px;font-size:12px;margin:5px 6px 0 0}
      #transcript header #sentence{display:inline-block}
      #shadow-panel{border-bottom:1px solid #567564;background:#1b352b;padding:10px 14px;flex:0 1 auto;max-height:55%;overflow:auto;min-height:0;font-size:12px}
      #shadow-heading,#shadow-controls,#shadow-languages{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#shadow-heading strong{flex:1}#shadow-panel button,#shadow-compact button{background:#2b5140;border-radius:8px;padding:8px 10px;font-size:12px;color:#deefdf}#shadow-panel button:disabled{opacity:.45;cursor:default}
      #shadow-panel #shadow-primary{background:#b7efcd;color:#142d22}#shadow-text{font-size:15px;white-space:pre-line;margin:12px 0;max-height:100px;overflow:auto;overflow-wrap:anywhere}#shadow-chinese{white-space:pre-line;color:#a9c2b4;margin:8px 0}#shadow-message{color:#f3d3a9;margin:8px 0;overflow-wrap:anywhere}#shadow-status{color:#b7efcd;margin:8px 0}#shadow-languages{margin:8px 0}#shadow-languages label{display:flex;align-items:center;gap:5px;min-height:30px}
      #shadow-quick{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}#shadow-quick label{display:grid;gap:5px;color:#b7d9c5}#shadow-quick select{width:100%;min-width:0;padding:8px;background:#142b23;border:1px solid #567564;border-radius:8px;color:#ecf4ee;font:13px system-ui}#shadow-panel #shadow-settings{display:block;text-align:left;margin:0;background:transparent;border:1px solid #45685a;color:#b7d9c5}
      #shadow-dialog{position:fixed;inset:0;margin:auto;width:min(460px,calc(100vw - 24px));max-height:calc(100dvh - 24px);border:1px solid #567564;border-radius:18px;padding:0;background:#142b23;color:#ecf4ee;font:14px/1.6 system-ui;pointer-events:auto;overflow:auto;box-shadow:0 20px 70px #0008}#shadow-dialog[open]{display:flex;flex-direction:column}#shadow-dialog::backdrop{background:#0009}#shadow-dialog header,#shadow-dialog-intro,#shadow-dialog footer{flex-shrink:0}
      #shadow-dialog header{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 8px;gap:12px}#shadow-dialog h2{font-size:19px;margin:0}#shadow-dialog-close{background:transparent;color:#b7d9c5;border-radius:8px;padding:4px 10px;font-size:24px}#shadow-dialog-intro{margin:0;padding:0 22px 16px;color:#a9c2b4;font-size:12px}
      #shadow-options{border:0;padding:0 22px 20px;margin:0;min-width:0;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:#567564 #142b23}#shadow-options legend{padding:0;margin:0 0 8px;font-weight:650}#shadow-methods{border:0;margin:0 0 18px;padding:0;min-width:0;display:grid;gap:8px}.shadow-method{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid #45685a;border-radius:10px;cursor:pointer}.shadow-method:has(input:checked){background:#254a39;border-color:#a7dfbd}.shadow-method span{display:grid;gap:3px}.shadow-method small{color:#b1cbbb;font-size:12px}.shadow-method input{margin-top:6px;accent-color:#b7efcd}
      .shadow-field{display:grid;gap:5px;margin:16px 0}.shadow-field>span{font-weight:600}#shadow-options select{width:100%;padding:10px;border:1px solid #567564;border-radius:8px;background:#0f241d;color:#ecf4ee;font:14px system-ui}#shadow-options small{font-size:12px;color:#a9c2b4}.shadow-check{display:flex;gap:10px;align-items:flex-start;padding:14px 0;border-top:1px solid #365046}.shadow-check input{margin-top:6px;accent-color:#b7efcd}.shadow-check span{display:grid;gap:2px}#shadow-dialog footer{background:#142b23;padding:12px 22px 18px;border-top:1px solid #365046}#shadow-dialog-done{width:100%;padding:11px;border-radius:9px;background:#b7efcd;color:#142d22;font:600 14px system-ui}#shadow-options:disabled{opacity:.65}#shadow-settings-note{font-size:12px;color:#b7d9c5;margin:0 0 10px}
      #shadow-compact{pointer-events:auto;font-size:11px;display:flex;gap:3px;align-items:center;flex-wrap:wrap;overflow:auto;max-height:100%;max-width:100%}#shadow-compact[hidden]{display:none}#side-region.collapsed:has(#shadow-compact:not([hidden])){flex-direction:row;gap:4px}#shadow-compact span{overflow-wrap:anywhere}#side-region.collapsed #shadow-compact button{padding:3px;font-size:11px}
    `;
    root.append(style);
    const open = document.createElement('button'); open.id = 'shadow-open'; open.textContent = '跟讀';
    $('transcript').querySelector('header').insertBefore(open, $('sentence'));
    const panel = document.createElement('section'); panel.id = 'shadow-panel'; panel.hidden = true; panel.setAttribute('aria-label', '跟讀練習');
    panel.innerHTML = `<div id="shadow-heading"><strong>跟讀練習</strong><button id="shadow-end">結束練習</button></div>
      <div id="shadow-status" role="status" aria-live="polite"></div><div id="shadow-text"></div><div id="shadow-chinese" hidden></div>
      <div id="shadow-languages"><label><input id="shadow-en" type="checkbox" checked>英文</label><label><input id="shadow-zh" type="checkbox">中文</label></div>
      <div id="shadow-message" role="status"></div>
      <div id="shadow-controls"><button id="shadow-prev">上一句</button><button id="shadow-primary">開始練習</button><button id="shadow-retry">重來</button><button id="shadow-next">下一句</button><button id="shadow-done" hidden>說完了</button></div>
      <div id="shadow-quick"><label>語速<select id="shadow-rate"><option value="0.75">慢速 · 0.75×</option><option value="0.9">稍慢 · 0.9×</option><option value="1">原速 · 1.0×</option></select></label>
      <label id="shadow-rounds-field">每句練幾次<select id="shadow-rounds">${[1, 2, 3, 4, 5].map(n => `<option value="${n}">${n} 次</option>`).join('')}</select></label></div>
      <button id="shadow-settings" aria-haspopup="dialog">練習方式與更多設定 ›</button>`;
    const dialog = document.createElement('dialog'); dialog.id = 'shadow-dialog'; dialog.setAttribute('aria-labelledby', 'shadow-dialog-title');
    dialog.innerHTML = `<header><h2 id="shadow-dialog-title">調整跟讀練習</h2><button id="shadow-dialog-close" aria-label="關閉跟讀設定">×</button></header>
      <p id="shadow-dialog-intro">選擇舒服的練習節奏，設定會自動記住。</p>
      <fieldset id="shadow-options"><fieldset id="shadow-methods"><legend>怎麼練？</legend>
      <label class="shadow-method"><input type="radio" name="shadow-mode" value="shadow" id="shadow-mode-shadow"><span><strong>跟著原音說</strong><small>影子跟讀 · 原音播放時，稍晚一點跟著說。</small></span></label>
      <label class="shadow-method"><input type="radio" name="shadow-mode" value="echo" id="shadow-mode-echo"><span><strong>聽完再自己說</strong><small>聽後複誦 · 先聽一句，影片暫停後換你說。</small></span></label></fieldset>
      <label class="shadow-field" id="shadow-rest-field"><span>每次練完，休息多久？</span><select id="shadow-rest"><option value="0.5">快速接續 · 0.5 秒</option><option value="1">稍作休息 · 1 秒</option><option value="2">多喘口氣 · 2 秒</option></select></label>
      <label class="shadow-field" id="shadow-echo-field"><span>留多少時間讓我說？</span><select id="shadow-echoFactor"><option value="1">一般</option><option value="1.5">多留一點時間</option><option value="2">慢慢說</option></select><small id="shadow-echo-hint"></small></label>
      <label class="shadow-check"><input id="shadow-demo" type="checkbox"><span>先聽一次示範<small>每句開始前先聽原音，這次不算練習次數。</small></span></label>
      <label class="shadow-check"><input id="shadow-autoNext" type="checkbox"><span>練完自動接下一句<small>關閉時，每句完成後等你按「下一句」。</small></span></label>
      </fieldset><footer><p id="shadow-settings-note"></p><button id="shadow-dialog-done">完成設定</button></footer>`;
    panel.querySelector('#shadow-heading').insertBefore(panel.querySelector('#shadow-settings'), panel.querySelector('#shadow-end'));
    root.append(dialog);
    $('transcript').querySelector('header').after(panel);
    const compact = document.createElement('div'); compact.id = 'shadow-compact'; compact.hidden = true;
    compact.innerHTML = '<span id="shadow-compact-status"></span><button id="shadow-compact-pause">暫停</button><button id="shadow-compact-end">結束</button>';
    $('side-region').append(compact);
    function sample() {
      const video = document.querySelector('video');
      return { valid: video === sessionVideo && location.pathname === sessionPath, time: video?.currentTime || 0, paused: video?.paused !== false, seeking: !!video?.seeking, rate: video?.playbackRate || 1 };
    }
    function command(action, args = {}) {
      if (action === 'claim' && !sessionId) {
        sessionId = crypto.randomUUID(); sessionPath = location.pathname; sessionVideo = document.querySelector('video');
      }
      const id = crypto.randomUUID(), path = sessionPath, session = sessionId;
      if (action === 'release') sessionId = '';
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error('播放器回應逾時，請重試或重新整理 Netflix。')); }, 4200);
        pending.set(id, { resolve, reject, timeout, path, session });
        window.postMessage({ channel: 'subtitle-pocket-v2', from: 'extension', type: 'control', action, id, sessionId: session, path, ...args }, location.origin);
      });
    }
    window.addEventListener('message', event => {
      const m = event.data;
      if (event.source !== window || event.origin !== location.origin || m?.channel !== 'subtitle-pocket-v2' || m.from !== 'player' || m.type !== 'controlResult') return;
      const request = pending.get(m.id);
      if (!request || request.path !== m.path || request.session !== m.sessionId) return;
      pending.delete(m.id); clearTimeout(request.timeout);
      if (m.ok) request.resolve(m); else request.reject(new Error(String(m.error || '播放失敗。').slice(0, 200)));
    });
    const engine = api.create({ command, sample, onChange: paint });
    function syncSettings() {
      for (const key of ['rate', 'rounds', 'rest', 'echoFactor']) $('shadow-' + key).value = preferences[key];
      for (const key of ['demo', 'autoNext']) $('shadow-' + key).checked = preferences[key];
      $('shadow-mode-' + preferences.mode).checked = true;
      $('shadow-en').checked = !preferences.hideEnglish; $('shadow-zh').checked = !preferences.hideChinese;
    }
    function paint(state = engine.snapshot()) {
      const active = state.phase !== 'idle', cue = state.queue[state.index];
      panel.hidden = !active;
      if (!active && dialog.open) dialog.close();
      if (!active && state.message) $('transcript-feedback').textContent = state.message;
      if (active && !timer) timer = setInterval(() => engine.tick(), 50);
      if (!active && timer) { clearInterval(timer); timer = null; }
      if (boundVideo !== (active ? sessionVideo : null)) {
        boundVideo?.removeEventListener('seeking', externalSeek);
        boundVideo = active ? sessionVideo : null;
        boundVideo?.addEventListener('seeking', externalSeek);
      }
      const phase = { ready: '確認片段後開始', seeking: '正在定位', demo: '先聽示範', playing: state.settings.mode === 'echo' ? '先聽' : '跟著原音說', stopping: '句尾暫停', between: '準備跟讀', rest: '休息', echo: '換你說', paused: '已暫停', complete: '這段練習完成', error: '播放未完成', manual: '手動跟讀 · 按重來再次播放' }[state.phase] || '';
      const countdown = ['rest', 'echo'].includes(state.phase) ? ` · ${Math.ceil(state.remaining)} 秒` : '';
      const progress = state.approximate ? '' : state.phase === 'demo' ? ' · 示範' : ` · 第 ${state.round || 1} / ${state.settings.rounds} 輪`;
      $('shadow-status').textContent = active ? `第 ${state.index + 1} / ${state.queue.length} 段${progress} · ${phase}${countdown}` : '';
      $('shadow-text').textContent = cue ? state.settings.hideEnglish ? '英文字幕已遮蔽' : cue.text : '';
      const chinese = cue && translate(cue);
      $('shadow-chinese').textContent = chinese?.text || '這段尚無對應中文字幕。';
      $('shadow-chinese').hidden = state.settings.hideChinese;
      const duration = cue ? (cue.end - cue.start).toFixed(1) : '';
      $('shadow-message').textContent = state.message || (state.approximate ? '字幕時間約略：提供手動重播，不會自動在句尾停止。' : state.phase === 'ready' ? `完整片段 ${duration} 秒。${cue.end - cue.start > 15 ? '片段較長，可重新選取較短的句子。' : ''}下一句接續本集字幕。` : '');
      const primary = $('shadow-primary');
      primary.textContent = state.phase === 'ready' ? '開始練習' : state.phase === 'paused' ? '繼續' : state.phase === 'complete' ? '再練一次' : state.phase === 'error' ? '重試' : '暫停';
      primary.disabled = state.busy && ['ready', 'paused', 'complete', 'error'].includes(state.phase);
      $('shadow-retry').disabled = state.phase === 'ready';
      $('shadow-prev').disabled = state.index === 0;
      $('shadow-next').disabled = state.index + 1 >= state.queue.length;
      $('shadow-done').hidden = state.phase !== 'echo';
      $('shadow-options').disabled = state.busy || state.approximate;
      $('shadow-rate').disabled = state.busy;
      $('shadow-rounds').disabled = state.busy || state.approximate;
      $('shadow-rounds-field').hidden = state.approximate;
      $('shadow-settings').hidden = state.approximate;
      $('shadow-rest-field').hidden = state.settings.mode !== 'shadow';
      $('shadow-echo-field').hidden = state.settings.mode !== 'echo';
      $('shadow-echo-hint').textContent = cue ? `這段會留約 ${Math.ceil((cue.end - cue.start) / state.settings.rate * state.settings.echoFactor + 1)} 秒讓你說；說完也能提前繼續。` : '';
      $('shadow-settings-note').textContent = state.phase === 'ready' ? '設定會自動儲存，完成後就能開始練習。' : '修改設定後會暫停；按「繼續」從本輪開頭練習。';
      $('shadow-heading').querySelector('strong').textContent = state.approximate ? '手動跟讀' : state.settings.mode === 'echo' ? '聽完再自己說' : '跟著原音說';
      $('shadow-settings').textContent = '設定';
      $('shadow-settings').setAttribute('aria-label', '調整跟讀練習設定');
      $('shadow-compact-status').textContent = phase;
      $('shadow-compact-pause').textContent = primary.textContent; $('shadow-compact-pause').disabled = primary.disabled;
      syncCollapsed();
      const maskKey = JSON.stringify([active, state.settings.hideEnglish, state.settings.hideChinese]);
      if (lastMask !== maskKey) { lastMask = maskKey; changed(); }
      const segmentKey = active ? `${cue?.start}:${cue?.end}` : '';
      if (lastSegment !== segmentKey) { lastSegment = segmentKey; if (cue && active) selected(cue); }
    }
    function externalSeek() { void engine.externalSeek(); }
    function syncCollapsed() { compact.hidden = !engine.active() || !$('side-region').classList.contains('collapsed'); }
    new MutationObserver(syncCollapsed).observe($('side-region'), { attributes: true, attributeFilter: ['class'] });
    function prepare(start, end = start) {
      const items = api.queue(getCues(), start, end);
      if (!items.length) { $('transcript-feedback').textContent = '請先從逐字稿選一句，再開始跟讀。'; return; }
      void engine.prepare(items, preferences, !precise());
    }
    open.onclick = () => {
      if (engine.active()) { panel.scrollIntoView({ block: 'nearest' }); return; }
      const time = document.querySelector('video')?.currentTime || 0, cue = getCues().find(c => time >= c.start && time < c.end);
      if (cue) prepare(cue.start); else $('transcript-feedback').textContent = '目前沒有播放中的句子，請點逐字稿每列的「跟讀」。';
    };
    $('shadow-primary').onclick = () => {
      const phase = engine.snapshot().phase;
      if (phase === 'ready') void engine.start();
      else if (phase === 'paused') void engine.resume();
      else if (phase === 'complete') void engine.retry(true);
      else if (phase === 'error') void engine.retry();
      else void engine.pause();
    };
    $('shadow-retry').onclick = () => void engine.retry();
    $('shadow-prev').onclick = () => void engine.move(-1);
    $('shadow-next').onclick = () => void engine.move(1);
    $('shadow-done').onclick = () => void engine.advance();
    $('shadow-end').onclick = () => void engine.stop();
    $('shadow-compact-pause').onclick = () => $('shadow-primary').click();
    $('shadow-compact-end').onclick = () => $('shadow-end').click();
    panel.addEventListener('keydown', event => event.stopPropagation());
    compact.addEventListener('keydown', event => event.stopPropagation());
    function changeSettings() {
      edited = true;
      preferences = api.settings({ mode: $('shadow-mode-echo').checked ? 'echo' : 'shadow', rate: Number($('shadow-rate').value), rounds: Number($('shadow-rounds').value), rest: Number($('shadow-rest').value), echoFactor: Number($('shadow-echoFactor').value), demo: $('shadow-demo').checked, autoNext: $('shadow-autoNext').checked, hideEnglish: !$('shadow-en').checked, hideChinese: !$('shadow-zh').checked });
      void engine.update(preferences);
      chrome.storage.local.set({ shadowingSettings: preferences }).catch(() => { $('shadow-message').textContent = '跟讀設定未能儲存，目前仍可使用。'; });
    }
    panel.addEventListener('change', changeSettings);
    dialog.addEventListener('change', changeSettings);
    $('shadow-settings').onclick = () => {
      if (!['ready', 'paused', 'complete', 'error'].includes(engine.snapshot().phase)) void engine.pause('調整設定中，完成後按繼續。');
      dialog.showModal();
    };
    $('shadow-dialog-close').onclick = $('shadow-dialog-done').onclick = () => dialog.close();
    dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); dialog.close(); });
    dialog.addEventListener('keydown', event => event.stopPropagation());
    chrome.storage.local.get({ shadowingSettings: {} }).then(data => { if (!edited && !engine.active()) { preferences = api.settings(data.shadowingSettings); syncSettings(); } }).catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.hidden) void engine.pause('分頁已切到背景，回來後按繼續。'); });
    window.addEventListener('pagehide', () => void engine.stop());
    syncSettings();
    return { prepare, active: engine.active, pause: engine.pause, stop: engine.stop, refresh: paint, mask: engine.mask, current: engine.current };
  };
})();
