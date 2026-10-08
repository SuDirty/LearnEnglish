(() => {
  if (document.getElementById('subtitle-pocket-host')) return;
  const host = document.createElement('div');
  host.id = 'subtitle-pocket-host';
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial;color:#fff;font-family:system-ui,sans-serif}*{box-sizing:border-box}
    [hidden]{display:none!important}button{font:inherit;cursor:pointer;border:0;color:inherit}
    button:focus-visible{outline:3px solid #7ce3bd;outline-offset:3px}
    #subtitles{position:fixed;text-align:center;pointer-events:auto;line-height:1.3;color:white;text-shadow:0 2px 4px #000,0 0 5px #000;font-weight:600}
    #subtitles[data-review-mask]{font-size:16px!important;background:#172c28ed;border:1px solid #567d6c;border-radius:10px;padding:9px 14px;text-shadow:none;line-height:1.5}
    .word{background:transparent;padding:0 1px;border-radius:4px;text-shadow:inherit;font-weight:inherit}
    .word:hover,.word:focus-visible{background:#153f35;color:#a2f3cf}
    #sentence{display:block;margin:7px auto 0;background:#172c28ed;border:1px solid #567d6c;border-radius:20px;padding:5px 13px;font:12px system-ui;text-shadow:none;color:#bcebd5}
    #status{position:fixed;bottom:28px;left:24px;background:#13251ee8;color:#c4dece;padding:9px 13px;border:1px solid #3c594c;border-radius:20px;font-size:12px;pointer-events:auto}
    #card{position:fixed;right:28px;top:16%;width:min(380px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:#12221ff7;border:1px solid #45685a;border-radius:20px;padding:24px;pointer-events:auto;box-shadow:0 18px 60px #0009;color:#f1f6f1;font:14px/1.65 system-ui}
    .eyebrow{font-size:10px;letter-spacing:2px;color:#8fbaa8}#close{float:right;background:transparent;font-size:22px;line-height:1;padding:0 2px}
    #source{font-size:25px;line-height:1.3;margin:18px 0 12px;overflow-wrap:anywhere}#translation{font-size:19px;color:#adf0cd;white-space:pre-wrap;overflow-wrap:anywhere}
    #context{border-left:2px solid #45685a;padding-left:12px;color:#a6bdb3;font-size:13px;margin:20px 0;overflow-wrap:anywhere;white-space:pre-line}
    #source,#chinese-context{white-space:pre-line}
    #chinese-context{border-left:2px solid #8fbaa8;padding:0 0 0 12px;margin:12px 0 20px;font-size:13px;color:#add5bc;overflow-wrap:anywhere}
    .actions{display:flex;gap:8px;flex-wrap:wrap}.actions button{border-radius:10px;padding:10px 14px;background:#293f36;font-size:13px}.actions .primary{background:#b7efcd;color:#142d22;font-weight:650}button:disabled{opacity:.5;cursor:default}
    #note{color:#8fa99c;font-size:11px;margin:16px 0 0}#feedback{color:#b7efcd;font-size:12px;min-height:18px;margin-top:8px}
    .save-kind{display:flex;align-items:center;gap:10px;margin:12px 0;color:#b4cebf;font-size:12px}#save-kind{background:#293f36;color:#ecf4ee;border:1px solid #567564;border-radius:6px;padding:6px;font:inherit}
    #learning-score{margin:12px 0;padding:12px;border:1px solid #426451;border-radius:9px;background:#243e30;font-size:12px;line-height:1.7}#learning-score p{margin:4px 0}#learning-score-summary{font-weight:650;color:#d3f0b6}#learning-score-tags{color:#b5d3c2}
    .speech-controls{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.speech-controls button{background:#293f36;border-radius:8px;padding:6px 10px;font-size:12px}.speech-status{flex-basis:100%;font-size:12px;color:#b7efcd;overflow-wrap:anywhere}.speech-status:empty{display:none}
  </style>
  <div id="subtitles" hidden><div id="words"></div><button id="sentence">翻譯整句 ↗</button></div>
  <button id="status" hidden title="開啟收藏">字幕口袋 · 正在取得英文字幕</button>
  <section id="card" role="dialog" aria-label="字幕翻譯" hidden>
    <button id="close" aria-label="關閉翻譯">×</button><div class="eyebrow">SUBTITLE POCKET · 字幕口袋</div>
    <h2 id="source"></h2><div id="speech" hidden></div><p id="dictionary-meta" style="font-size:12px;color:#b5d3c2" hidden></p><div id="translation" role="status" aria-live="polite"></div><p id="context"></p><p id="chinese-context" hidden></p>
    <section id="learning-score" aria-label="AI 單字評分" hidden><p id="learning-score-summary"></p><p id="learning-score-tags"></p><p id="learning-score-reason"></p></section>
    <label class="save-kind">收藏類型<select id="save-kind"><option value="word">單字</option><option value="phrase">片語</option><option value="sentence">句子／段落</option></select></label>
    <div class="actions"><button id="save" class="primary" disabled>＋ 收藏</button><button id="whole">翻譯整句</button><button id="retry" hidden>重新翻譯</button><button id="online-translate" hidden>改用所選翻譯服務</button><button id="translation-settings">翻譯設定</button><button id="library">我的收藏 ↗</button></div>
    <div id="feedback" role="status"></div><p id="note">離線字典優先；線上查詢使用所選翻譯服務。收藏保存在本機。關閉後請按播放繼續。</p>
  </section>`;
  const $ = id => root.getElementById(id);
  let enabled = true, pauseOnLookup = true, current = '', selected = null, requestId = 0;
  let originals = [], lastUrl = location.href, currentMask = '';
  const originalStyle = new Map();
  async function send(message) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      if (!response?.ok) throw new Error(response?.error || '操作失敗，請重試。');
      return response;
    } catch (error) {
      if (/Extension context invalidated/i.test(error.message)) throw new Error('擴充功能已更新，請重新整理 Netflix。');
      throw error;
    }
  }
  function restore() {
    for (const el of originals) {
      const style = originalStyle.get(el);
      if (style) {
        if (style.value) el.style.setProperty('opacity', style.value, style.priority);
        else el.style.removeProperty('opacity');
      }
    }
    originals = []; originalStyle.clear();
    $('subtitles').hidden = true; current = ''; currentMask = '';
  }
  function close() { globalThis.SubtitlePocketSpeech.reset(); requestId++; selected = null; $('card').hidden = true; }
  const layout = globalThis.SubtitlePocketLayout(host);
  const transcript = globalThis.SubtitlePocketTranscript.createPanel(root, lookup, close, layout);
  globalThis.SubtitlePocketSpeech.mount($('speech'), () => selected?.text, () => {
    void transcript.pausePractice();
    document.querySelector('video')?.pause();
  });
  function mount() {
    const parent = document.fullscreenElement || document.documentElement;
    if (host.parentElement !== parent) parent.append(host);
  }
  function scan() {
    mount();
    if (lastUrl !== location.href) { lastUrl = location.href; close(); restore(); }
    if (!enabled || !/^\/watch\/\d+/.test(location.pathname)) { restore(); $('status').hidden = true; $('sentence').hidden = true; transcript.tick('', false); return; }
    const candidates = [...document.querySelectorAll('.player-timedtext-text-container')].filter(el => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden' && el.innerText.trim();
    });
    const text = candidates.map(el => el.innerText.trim()).join('\n');
    transcript.tick(text, enabled);
    $('status').textContent = transcript.hasEnglish() ? '字幕已載入 · 我的收藏 ↗' : '字幕口袋 · 正在取得英文字幕';
    const reviewState = transcript.getReviewState(document.querySelector('video')?.currentTime || 0);
    const language = globalThis.SubtitlePocketTranscript.trackKind({ language: '', cues: [{ text }] });
    const mask = (language === 'english' && reviewState.hideEnglish) || (language === 'chinese' && reviewState.hideChinese)
      ? (language === 'english' ? '英文字幕已遮蔽' : '中文字幕已遮蔽') : '';
    if (!text || (!/[A-Za-z]/.test(text) && !mask)) { restore(); $('status').hidden = false; $('sentence').hidden = true; return; }
    $('status').hidden = true;
    $('sentence').hidden = !!mask;
    const rects = candidates.map(el => el.getBoundingClientRect());
    const left = Math.max(8, Math.min(...rects.map(r => r.left)));
    const right = Math.min(innerWidth - 8, Math.max(...rects.map(r => r.right)));
    const top = Math.min(...rects.map(r => r.top));
    if (text !== current || mask !== currentMask || candidates.some((el, i) => el !== originals[i]) || candidates.length !== originals.length) {
      restore(); current = text; currentMask = mask;
      originals = candidates;
      for (const el of originals) {
        originalStyle.set(el, { value: el.style.getPropertyValue('opacity'), priority: el.style.getPropertyPriority('opacity') });
        el.style.setProperty('opacity', '0', 'important');
      }
      $('words').replaceChildren();
      for (const [lineIndex, line] of (mask || text).split('\n').entries()) {
        if (lineIndex) $('words').append(document.createElement('br'));
        for (const part of line.split(/([A-Za-z]+(?:['’\-][A-Za-z]+)*)/g)) {
          if (/^[A-Za-z]/.test(part)) {
            const button = document.createElement('button'); button.className = 'word'; button.textContent = part;
            button.title = '翻譯「' + part + '」';
            button.addEventListener('click', () => lookup(part, 'word', text));
            $('words').append(button);
          } else $('words').append(document.createTextNode(part));
        }
      }
    }
    $('subtitles').toggleAttribute('data-review-mask', !!mask);
    const fontEl = candidates[0].querySelector('span') || candidates[0];
    const fontSize = parseFloat(getComputedStyle(fontEl).fontSize) || 26;
    Object.assign($('subtitles').style, { left: left + 'px', top: Math.max(8, top) + 'px', width: Math.min(innerWidth - left - 8, Math.max(mask ? 180 : 120, right - left)) + 'px', fontSize: Math.min(48, Math.max(18, fontSize)) + 'px' });
    $('subtitles').hidden = false;
  }
  function decodeEntities(value) {
    // Only decode character entities; text is always rendered through textContent.
    const textarea = document.createElement('textarea');
    return String(value).replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi, entity => { textarea.innerHTML = entity; return textarea.value; });
  }
  async function lookup(text, kind, context, metadata, forceOnline = false) {
    globalThis.SubtitlePocketSpeech.reset();
    $('speech').hidden = kind !== 'word';
    void transcript.pausePractice();
    transcript.open();
    const video = document.querySelector('video');
    if (pauseOnLookup && video && !video.paused) video.pause();
    const token = ++requestId;
    selected = { text, kind, context, forceOnline, title: document.querySelector('[data-uia="video-title"]')?.textContent || document.title.replace(/\s*[-|]\s*Netflix.*$/, ''), url: location.href, time: video?.currentTime || 0, ...transcript.getCueMetadata(context, video?.currentTime || 0), ...metadata };
    $('card').hidden = false; $('source').textContent = text; $('context').textContent = context;
    $('translation').textContent = '翻譯中…'; $('save').disabled = true; $('save').textContent = '＋ 收藏';
    $('save-kind').value = kind; $('online-translate').hidden = true; $('dictionary-meta').hidden = true; $('learning-score').hidden = true;
    const completeContext = globalThis.SubtitlePocketTranscript.normalize(text) === globalThis.SubtitlePocketTranscript.normalize(context);
    $('feedback').textContent = ''; $('retry').hidden = true; $('whole').hidden = completeContext;
    const chinese = transcript.getTranslation(context, selected.time, selected.cueEnd);
    selected.chineseContext = chinese?.text || '';
    selected.chineseLanguage = chinese?.language || '';
    const fromSubtitle = !forceOnline && kind === 'sentence' && completeContext && chinese;
    $('chinese-context').hidden = !!fromSubtitle || !chinese;
    $('chinese-context').textContent = chinese ? '對應 Netflix 中文字幕：' + chinese.text : '';
    $('note').textContent = fromSubtitle
      ? '來源：Netflix 中文字幕（' + (chinese.language || '未標示語系') + '）· 依時間對齊，未呼叫外部翻譯服務。'
      : '優先查詢離線字典；無詞條時使用所選翻譯服務。';
    try {
      const result = fromSubtitle ? { translation: chinese.text } : await send({ type: 'translate', text, kind, forceOnline, context });
      if (token !== requestId) return;
      selected.translation = result.provider === 'Google Cloud Translation' ? decodeEntities(result.translation) : result.translation;
      selected.translationSource = fromSubtitle ? 'Netflix 中文字幕' : result.provider;
      if (kind === 'word' && result.learningScore) {
        const score = result.learningScore;
        selected.learningScore = score;
        $('learning-score-summary').textContent = `AI 估計 ${score.score} / 100 · 常用度 ${score.frequency} · 實用性 ${score.usefulness}`;
        $('learning-score-tags').textContent = score.tags.join(' · ');
        $('learning-score-reason').textContent = score.reason;
        $('learning-score').hidden = false;
      }
      selected.dictionaryHeadword = result.headword || ''; selected.phonetic = result.phonetic || '';
      $('online-translate').hidden = result.provider !== 'ECDICT';
      $('dictionary-meta').hidden = result.provider !== 'ECDICT';
      $('dictionary-meta').textContent = [result.headword, result.phonetic && '/' + result.phonetic + '/'].filter(Boolean).join(' · ');
      if (!fromSubtitle) $('note').textContent = result.provider === 'ECDICT'
        ? '來源：ECDICT 離線英中字典（繁體轉換）· 未送出網路請求。以下為一般詞義，請搭配原句判斷。'
        : '來源：' + result.provider + (result.cached ? '（本機快取）' : '') + (result.learningScore ? ' · 已送出單字與部分原句，同步取得譯文、評分和標籤。' : ' · 只送出所選文字；中文字幕供上下文參考。');
      $('translation').textContent = selected.translation; $('save').disabled = false;
    } catch (error) {
      if (token !== requestId) return;
      $('translation').textContent = error.message; $('retry').hidden = false;
    }
  }
  $('translation-settings').onclick = () => send({ type: 'openTranslationSettings' });
  $('online-translate').onclick = () => { if (selected) lookup(selected.text, selected.kind, selected.context, { title: selected.title, url: selected.url, time: selected.time, cueEnd: selected.cueEnd }, true); };
  $('sentence').onclick = () => lookup(current, 'sentence', current);
  $('save-kind').onchange = () => { if (selected) lookup(selected.text, $('save-kind').value, selected.context, { title: selected.title, url: selected.url, time: selected.time, cueEnd: selected.cueEnd }); };
  $('whole').onclick = () => { if (selected) lookup(selected.context, 'sentence', selected.context, { title: selected.title, url: selected.url, time: selected.time, cueEnd: selected.cueEnd }); };
  $('retry').onclick = () => { if (selected) lookup(selected.text, selected.kind, selected.context, { title: selected.title, url: selected.url, time: selected.time, cueEnd: selected.cueEnd }, selected.forceOnline); };
  $('close').onclick = close;
  $('save').onclick = async () => {
    if (!selected?.translation) return;
    const token = requestId; $('save').disabled = true;
    try {
      const result = await send({ type: 'save', entry: selected });
      if (token !== requestId) return;
      $('save').textContent = '✓ 已收藏'; $('feedback').textContent = result.updated ? '已更新收藏內容。' : result.duplicate ? '這筆內容已經在收藏裡。' : '已存入你的字幕口袋。';
    } catch (error) { if (token === requestId) { $('feedback').textContent = error.message; $('save').disabled = false; } }
  };
  const openLibrary = () => send({ type: 'openLibrary' }).catch(error => { $('status').textContent = error.message; });
  $('library').onclick = openLibrary; $('status').onclick = openLibrary;
  for (const event of ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'keydown', 'keyup']) {
    root.addEventListener(event, e => { e.stopPropagation(); if (event === 'keydown' && e.key === 'Escape') { e.preventDefault(); close(); } });
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('card').hidden) close(); });
  document.addEventListener('fullscreenchange', () => { mount(); scan(); });
  chrome.storage.local.get({ enabled: true, pauseOnLookup: true }).then(settings => { enabled = settings.enabled; pauseOnLookup = settings.pauseOnLookup; scan(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.enabled) { enabled = changes.enabled.newValue !== false; if (!enabled) close(); }
    if (changes.pauseOnLookup) pauseOnLookup = changes.pauseOnLookup.newValue !== false;
    scan();
  });
  // A bounded poll also detects SPA navigation and changes in subtitle geometry.
  const timer = setInterval(() => { if (!chrome.runtime?.id) { restore(); layout.restore(); host.remove(); clearInterval(timer); return; } scan(); }, 250);
  scan();
})();
