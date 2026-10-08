(() => {
  const { normalize, normalizeCueText, parseCaptions, cleanCues, trackKind, chineseRank, alignTranslation, groupByChineseCue } = globalThis.SubtitlePocketTranscript;
  globalThis.SubtitlePocketTranscript.createPanel = (root, lookup, closeTranslation, layout) => {
    const style = document.createElement('style');
    style.textContent = `
      .cue-text,.cue-zh{white-space:pre-line}
      #review-settings{margin-top:10px;border-top:1px solid #365046;padding-top:8px;font-size:12px}#review-settings summary{cursor:pointer;color:#b7efcd}#review-settings label{display:flex;align-items:center;gap:7px;margin:7px 0}#review-settings input{accent-color:#b7efcd}#review-options{border:0;margin:0;padding:0}#review-kinds{display:flex;flex-wrap:wrap;gap:9px}#review-kinds label{margin:4px 0}#review-status{font-size:11px;color:#a9c2b4}.review-mask{display:block;color:#9abdaa;font-size:12px;padding:5px 0;user-select:none}.cue-review{background:#294b3c;border-radius:6px;padding:6px;margin:5px;color:#b7efcd;font-size:11px}.cue.review-target{border-right:2px solid #789d88}

      .cue-text,.cue-word{user-select:text;-webkit-user-select:text}.cue-text ::selection{background:#8ed5b0;color:#11231f}.cue-actions{display:flex;flex-direction:column;flex-shrink:0}.cue-save{background:transparent;color:#b7d9c5;padding:5px 8px;font-size:16px}.cue-actions .cue-translate{padding-bottom:4px}
      #selection-tools{padding:0 0 10px}#selection-preview{margin:0 0 8px;font-size:12px;color:#ceeedb;max-height:58px;overflow:auto;white-space:pre-line;overflow-wrap:anywhere}#selection-tools button{padding:7px 10px;border-radius:7px;background:#b7efcd;color:#142d22;font-size:12px}#selection-tools #selection-cancel{background:transparent;color:#a9c2b4}
      #side-region{position:fixed;right:0;top:0;bottom:0;width:var(--subtitle-pocket-sidebar,400px);display:flex;flex-direction:column;pointer-events:auto;background:#11231f;border-left:1px solid #45685a;overflow:hidden;color:#ecf4ee;font:14px/1.6 system-ui}
      #transcript{display:flex;flex:1;min-height:0;flex-direction:column;overflow:hidden}#transcript header{flex-shrink:0}
      #transcript header{padding:18px 18px 12px;border-bottom:1px solid #365046}#transcript h2{font-size:19px;margin:3px 0 5px;display:flex;justify-content:space-between;align-items:center}#transcript .caption{font-size:11px;color:#99b6a8}
      #transcript-toggle,#transcript-close{background:#203f33;border-radius:8px;padding:5px 10px;font-size:12px}#transcript-toggle{align-self:center;margin-top:18px;writing-mode:vertical-rl;padding:12px 7px;pointer-events:auto;color:#bcebd5}
      #transcript-track,#chinese-track{width:100%;margin-top:8px;background:#1a3229;border:1px solid #486253;border-radius:6px;color:#cce4d6;padding:5px;font:12px system-ui}#chinese-info{margin-top:6px;line-height:1.6}
      #transcript-list{overflow:auto;overscroll-behavior:contain;flex:1;min-height:0;scrollbar-color:#567564 #14291f;padding:8px;outline-offset:-3px;position:relative}
      .cue{display:flex;align-items:stretch;border-left:3px solid transparent;border-radius:9px;margin:3px 0;background:transparent}.cue.active{background:#294b3c;border-left-color:#b7efcd}.cue:hover{background:#213c30}
      .cue-jump{align-self:flex-start;background:transparent;padding:12px 6px;color:#8db5a0;font:11px/2.2 ui-monospace,monospace;flex-shrink:0}.cue-main{flex:1;min-width:0;padding:12px 0;color:#d1e1d6;font:14px/1.65 system-ui}.cue.active .cue-main{color:#d9f8df}.cue-text{overflow-wrap:anywhere}.cue-word{background:transparent;padding:0;border-radius:3px;color:inherit;font:inherit}.cue-word:hover,.cue-word:focus-visible{background:#4c765a;color:#e1ffd9;text-decoration:underline;text-underline-offset:3px}.cue-zh{font-size:12px;color:#9fc4af;margin-top:7px;overflow-wrap:anywhere}.cue-translate{background:transparent;padding:8px;color:#9abdaa;font:11px system-ui;align-self:flex-start;margin-top:10px}
      #transcript-empty{padding:25px 15px;color:#9ab3a4;font-size:13px;line-height:1.9}#transcript footer{padding:10px 16px;border-top:1px solid #365046;flex-shrink:0}#transcript-feedback{font:11px/1.5 system-ui;color:#a9c2b4;min-height:17px}#resume-follow{width:100%;border-radius:9px;background:#b7efcd;color:#142d22;font-size:13px;padding:9px;margin-bottom:8px}
      #side-region #card{position:relative;inset:auto;width:100%;max-height:50%;min-height:0;flex:0 1 auto;margin:0;border:0;border-top:1px solid #45685a;border-radius:0;box-shadow:none;padding:18px;background:#192f26;overscroll-behavior:contain}
      #side-region #source{font-size:21px;margin:12px 0 8px}#side-region #context{margin:12px 0}#side-region #chinese-context{margin:8px 0 12px}#side-region #note{margin-top:8px}
      .sidebar-tools{display:flex;gap:8px;align-items:center;margin-top:8px}#side-region #status{position:static;font:11px/1.5 system-ui;padding:0;background:none;border:0;color:#a9c2b4;text-align:left}#side-region #sentence{margin:0;font-size:11px;padding:4px 8px}
      .panel-resize{position:absolute;z-index:4;touch-action:none}.panel-resize:focus-visible{outline:2px solid #b7efcd;outline-offset:-2px}.resize-n,.resize-s{left:8px;right:8px;height:7px;cursor:ns-resize}.resize-n{top:0}.resize-s{bottom:0}.resize-e,.resize-w{top:8px;bottom:8px;width:7px;cursor:ew-resize}.resize-e{right:0}.resize-w{left:0}.resize-ne,.resize-nw,.resize-se,.resize-sw{width:12px;height:12px}.resize-ne{top:0;right:0;cursor:nesw-resize}.resize-nw{top:0;left:0;cursor:nwse-resize}.resize-se{bottom:0;right:0;cursor:nwse-resize}.resize-sw{bottom:0;left:0;cursor:nesw-resize}
      #panel-drag{background:transparent;border-radius:6px;color:#b7efcd;font-size:22px;padding:0 7px;margin-right:5px;flex-shrink:0}#transcript h2 span{flex:1}#auto-caption-retry{margin-top:5px;background:#294b3c;border-radius:6px;font-size:11px;padding:5px 8px}#dock-preview{position:fixed;z-index:2;pointer-events:none;background:#8de0b52b;border:2px solid #b7efcd;border-radius:10px;color:#e4ffef;padding:14px;font:14px system-ui}#side-region.dragging #transcript header{overflow:visible}#side-region.dragging{user-select:none}
      .layout-tools{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;color:#b5d3c2}.layout-tools select{flex:1;min-width:0;background:#203f33;color:#d9efdf;border:1px solid #486253;border-radius:6px;padding:5px;font:inherit}
      #floating-tools{margin-top:8px;display:flex;flex-wrap:wrap;gap:7px;align-items:center;font-size:11px;color:#b5d3c2}#floating-tools button{background:#294b3c;border-radius:6px;padding:5px 8px;font-size:11px}#panel-drag{cursor:grab;touch-action:none}#panel-drag:active{cursor:grabbing}#floating-tools label{display:flex;align-items:center;gap:5px;width:100%}#panel-opacity{flex:1;min-width:40px;accent-color:#b7efcd}#layout-feedback{font-size:11px;color:#eec29d}
      #side-region:not(.horizontal) #transcript header{max-height:55%;overflow:auto;flex-shrink:1}#side-region:not(.horizontal) #transcript footer{max-height:45%;overflow:auto;flex-shrink:1}#side-region:not(.horizontal) #transcript-list{min-height:60px}
      #side-region[data-layout="left"]{border-left:0;border-right:1px solid #45685a}
      #side-region.horizontal{flex-direction:row;border-left:0;border-top:1px solid #45685a;border-bottom:1px solid #45685a}
      #side-region.horizontal #transcript{min-width:0;display:grid;grid-template-columns:210px minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto}
      #side-region.horizontal #transcript header{grid-row:1 / 3;overflow:auto;padding:12px;border-bottom:0;border-right:1px solid #365046}
      #side-region.horizontal #transcript-list{grid-column:2;grid-row:1}#side-region.horizontal #transcript footer{grid-column:2;grid-row:2;padding:8px 12px}
      #side-region.horizontal #card{height:100%;max-height:100%;width:35%;max-width:380px;flex:0 0 auto;border-top:0;border-left:1px solid #45685a}
      #side-region.horizontal #transcript-toggle,#side-region[data-layout="floating"] #transcript-toggle{writing-mode:horizontal-tb;margin:0;padding:8px 16px}
      #side-region.collapsed{justify-content:center;align-items:center}
      #side-region[data-layout="floating"]{background:rgb(17 35 31 / var(--panel-alpha,.78));border:1px solid #72968280;border-radius:14px;box-shadow:0 12px 38px #0005}
      #side-region[data-layout="floating"] #card{background:rgb(25 47 38 / .35)}#side-region[data-layout="floating"] .cue.active{background:#467d5859}#side-region[data-layout="floating"] .cue:hover{background:#467d5840}
      @media(max-width:850px){#side-region.horizontal #transcript{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(50px,1fr) auto}#side-region.horizontal #transcript header{grid-column:1;grid-row:1;max-height:135px;padding:6px 10px;border-right:0;border-bottom:1px solid #365046}#side-region.horizontal #transcript header .caption,#side-region.horizontal #transcript header .eyebrow,#side-region.horizontal .sidebar-tools{display:none}#side-region.horizontal #transcript h2{font-size:15px;margin:0}#side-region.horizontal .layout-tools{margin-top:4px}#side-region.horizontal #transcript-list{grid-column:1;grid-row:2}#side-region.horizontal #transcript footer{grid-column:1;grid-row:3}#side-region.horizontal #card{width:44%;padding:12px}}
    `;
    const panel = document.createElement('aside'); panel.id = 'transcript'; panel.setAttribute('aria-label', '逐字稿'); panel.hidden = true;
    panel.innerHTML = `<header><div class="eyebrow">SUBTITLE POCKET</div><h2><button id="panel-drag" aria-label="拖曳面板" title="拖開變成浮動；拖到視窗邊緣放開即可停靠。方向鍵移動，Shift＋方向鍵停靠。">⠿</button><span>逐字稿</span> <button id="transcript-close" aria-label="收合逐字稿">收合 ›</button></h2><div id="transcript-info" class="caption"></div><select id="transcript-track" aria-label="選擇英文字幕軌" hidden></select><div id="chinese-info" class="caption"></div><select id="chinese-track" aria-label="選擇中文字幕軌" hidden></select></header><div id="transcript-list" tabindex="0" role="region" aria-label="字幕列表"></div><footer><button id="resume-follow" hidden>↓ 恢復跟隨</button><div id="transcript-feedback" role="status">點單字查詞 · 拖曳選片語 · ☆ 收藏整句 · 點時間跳轉</div></footer>`;
    const toggle = document.createElement('button'); toggle.id = 'transcript-toggle'; toggle.textContent = '逐字稿 ‹'; toggle.hidden = true;
    const region = document.createElement('section'); region.id = 'side-region'; region.setAttribute('aria-label', '字幕學習區'); region.hidden = true;
    root.append(style, region); region.append(panel, root.getElementById('card'), toggle);
    const tools = document.createElement('div'); tools.className = 'sidebar-tools'; tools.append(root.getElementById('sentence'), root.getElementById('status')); panel.querySelector('header').append(tools);
    const preferences = document.createElement('div');
    preferences.innerHTML = '<div id="floating-tools" hidden><button id="panel-reset">重設浮動位置</button><label>背景不透明度<input id="panel-opacity" type="range" min="25" max="95" step="1" aria-label="背景不透明度"><output id="opacity-value"></output></label></div><div id="layout-feedback" role="status"></div><div id="auto-caption-status" class="caption" role="status"></div><button id="auto-caption-retry" hidden>重試載入字幕</button>';

    panel.querySelector('header').append(preferences);
    const reviewControls = document.createElement('details'); reviewControls.id = 'review-settings';
    reviewControls.innerHTML = `<summary>複習模式</summary><label><input id="review-enabled" type="checkbox" role="switch">啟用複習模式</label><fieldset id="review-options"><label><input id="review-chinese" type="checkbox">遮蔽中文字幕</label><label><input id="review-english" type="checkbox">遮蔽該句英文字幕</label><div>依收藏種類（可複選）</div><div id="review-kinds"><label><input type="checkbox" value="word">單字</label><label><input type="checkbox" value="phrase">片語</label><label><input type="checkbox" value="sentence">句子／段落</label></div><label><input id="review-pause" type="checkbox">播放到目標對話時暫停</label></fieldset><div id="review-status" role="status"></div>`;
    panel.querySelector('header').append(reviewControls);
    // Keep the reading surface compact; detailed status and preferences stay available on demand.
    const header = panel.querySelector('header');
    const infoDialog = document.createElement('dialog'); infoDialog.id = 'panel-info';
    infoDialog.setAttribute('aria-labelledby', 'panel-info-title');
    infoDialog.innerHTML = '<div class="info-heading"><h2 id="panel-info-title">設定與資訊</h2><button id="panel-info-close" aria-label="關閉設定與資訊">×</button></div><p class="caption">點單字查詞 · 拖曳選片語 · ☆ 收藏整句 · 點時間跳轉</p>';
    for (const child of [...header.children]) if (child.tagName !== 'H2') infoDialog.append(child);
    const infoButton = document.createElement('button'); infoButton.id = 'panel-info-open'; infoButton.textContent = '設定與資訊';
    infoButton.setAttribute('aria-haspopup', 'dialog');
    header.querySelector('h2').insertBefore(infoButton, root.getElementById('transcript-close'));
    header.append(infoDialog.querySelector('#sentence'));
    root.append(infoDialog);
    infoButton.onclick = () => infoDialog.showModal();
    root.getElementById('panel-info-close').onclick = () => infoDialog.close();
    infoDialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); infoDialog.close(); });
    infoDialog.addEventListener('keydown', event => event.stopPropagation());
    style.textContent += `
      #transcript header{padding:10px 14px}#transcript h2{font-size:16px;gap:6px;margin:0;flex-wrap:wrap}#transcript h2 span{min-width:60px}#panel-drag{margin:0;padding:0 4px}
      #panel-info-open{background:#203f33;border-radius:8px;padding:5px 8px;font-size:11px;white-space:nowrap}
      #transcript header #sentence{margin:5px 0 0}#transcript-feedback:empty{display:none}#transcript footer:has(#selection-tools[hidden]):has(#resume-follow[hidden]):has(#transcript-feedback:empty){display:none}
      #panel-info{position:fixed;inset:0;margin:auto;width:min(440px,calc(100vw - 32px));max-height:calc(100dvh - 40px);overflow:auto;border:1px solid #567564;border-radius:14px;padding:20px;background:#142b23;color:#ecf4ee;font:14px/1.6 system-ui;pointer-events:auto;box-shadow:0 20px 70px #0008}
      #panel-info::backdrop{background:#0007}#panel-info .info-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}#panel-info h2{font-size:18px;margin:0}#panel-info-close{background:transparent;font-size:24px}#panel-info .caption{font-size:12px;color:#a9c2b4}#panel-info .eyebrow{display:none}#panel-info #status{position:static;background:none;border:0;padding:0;font-size:12px;text-align:left}
      #side-region #card{height:var(--card-height,40%);max-height:none;flex:0 0 auto}
      #card-resize{flex:0 0 10px;cursor:ns-resize;touch-action:none;background:#1b372b;display:flex;align-items:center;justify-content:center;z-index:1;outline-offset:-2px}
      #card-resize::after{content:'';width:42px;height:3px;border-radius:3px;background:#6c9680}#card-resize:hover,#card-resize:focus-visible{background:#315b46}#side-region.card-resizing{user-select:none}
      #side-region.horizontal #transcript{display:flex;flex-direction:column}#side-region.horizontal #transcript header{padding:8px 14px;max-height:none;border-right:0;border-bottom:1px solid #365046}
      #side-region.horizontal #card{width:var(--card-width,35%);max-width:none;height:100%;max-height:100%}
      #side-region.horizontal #card-resize{cursor:ew-resize}#side-region.horizontal #card-resize::after{width:3px;height:42px}
      #side-region:not(.horizontal) #transcript header{max-height:none;flex-shrink:0}#side-region:not(.horizontal) #transcript-list{min-height:0}
    `;
    layout.attach(region, value => { collapsed = value; if (collapsed) closeTranslation(); show(); });
    const $ = id => root.getElementById(id);
    const list = $('transcript-list');
    $('transcript-feedback').textContent = '';
    const card = $('card');
    const divider = document.createElement('div'); divider.id = 'card-resize'; divider.hidden = true; divider.tabIndex = 0;
    divider.setAttribute('role', 'separator'); divider.setAttribute('aria-label', '調整單字區大小'); divider.setAttribute('aria-controls', 'card transcript-list');
    divider.title = '拖曳調整單字區大小；也可使用方向鍵';
    region.insertBefore(divider, card);
    let cardSizes = { height: null, width: null }, cardDrag = null;
    const horizontalCard = () => region.classList.contains('horizontal');
    function syncCardSize() {
      const horizontal = horizontalCard(), axis = horizontal ? 'width' : 'height';
      const available = horizontal ? region.clientWidth : region.clientHeight;
      const reserve = horizontal ? Math.min(200, available * .5) : Math.max(160, header.offsetHeight + panel.querySelector('footer').offsetHeight + 70);
      const min = Math.min(horizontal ? 160 : 120, available * .35, Math.max(40, available - reserve));
      const max = Math.max(min, available - reserve);
      const size = Math.min(max, Math.max(min, cardSizes[axis] ?? available * (horizontal ? .35 : .4)));
      region.style.setProperty('--card-' + axis, Math.round(size) + 'px');
      divider.hidden = card.hidden || panel.hidden;
      divider.setAttribute('aria-orientation', horizontal ? 'vertical' : 'horizontal');
      divider.setAttribute('aria-valuemin', Math.round(min)); divider.setAttribute('aria-valuemax', Math.round(max)); divider.setAttribute('aria-valuenow', Math.round(size));
      return { axis, size, min, max };
    }
    function resizeCard(delta) {
      const { axis, size, min, max } = syncCardSize();
      cardSizes[axis] = Math.min(max, Math.max(min, size + delta)); syncCardSize();
    }
    function saveCardSize() {
      chrome.storage.local.set({ panelCardSize: cardSizes }).catch(() => { $('layout-feedback').textContent = '單字區大小未儲存，請重試。'; });
    }
    function endCardResize(cancel = false) {
      if (!cardDrag) return;
      if (cancel) cardSizes = cardDrag.original;
      cardDrag = null; region.classList.remove('card-resizing'); syncCardSize();
      if (!cancel) saveCardSize();
    }
    divider.onpointerdown = event => {
      if (event.button !== 0) return;
      event.preventDefault(); divider.setPointerCapture(event.pointerId);
      cardDrag = { id: event.pointerId, coordinate: horizontalCard() ? event.clientX : event.clientY, original: { ...cardSizes } };
      region.classList.add('card-resizing');
    };
    divider.onpointermove = event => {
      if (cardDrag?.id !== event.pointerId) return;
      const coordinate = horizontalCard() ? event.clientX : event.clientY;
      resizeCard(cardDrag.coordinate - coordinate); cardDrag.coordinate = coordinate;
    };
    divider.onpointerup = () => endCardResize(); divider.onpointercancel = divider.onlostpointercapture = () => endCardResize(true);
    divider.onkeydown = event => {
      if (event.key === 'Escape' && cardDrag) { event.preventDefault(); event.stopPropagation(); endCardResize(true); return; }
      const keys = horizontalCard() ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
      if (!keys.includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); resizeCard((event.key === keys[0] ? 1 : -1) * (event.shiftKey ? 50 : 20)); saveCardSize();
    };
    chrome.storage.local.get({ panelCardSize: {} }).then(data => {
      for (const axis of ['width', 'height']) if (Number.isFinite(data.panelCardSize?.[axis]) && data.panelCardSize[axis] > 0) cardSizes[axis] = data.panelCardSize[axis];
      syncCardSize();
    }).catch(() => {});
    new ResizeObserver(syncCardSize).observe(region);
    new MutationObserver(() => { if (card.hidden) endCardResize(true); syncCardSize(); }).observe(card, { attributes: true, attributeFilter: ['hidden'] });
    const selectionTools = document.createElement('div'); selectionTools.id = 'selection-tools'; selectionTools.hidden = true;
    selectionTools.innerHTML = '<p id="selection-preview"></p><button id="selection-lookup">翻譯並準備收藏</button> <button id="selection-shadow">練習這段</button> <button id="selection-cancel">取消選取</button>';
    panel.querySelector('footer').prepend(selectionTools);
    let selectionDraft = null, gesture = null, suppressClick = false, renderPending = false;
    const textSelection = () => root.getSelection ? root.getSelection() : document.getSelection();
    function clearSelection(flush = true) {
      selectionDraft = null; gesture = null; selectionTools.hidden = true;
      const selection = textSelection();
      if (selection?.anchorNode && root.contains(selection.anchorNode)) selection.removeAllRanges();
      if (flush && renderPending) { renderPending = false; render(); }
    }
    function captureSelection() {
      const selection = textSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return null;
      const range = selection.getRangeAt(0), pieces = [], contexts = [], selectedCues = [];
      rows.forEach((row, i) => {
        const node = row.querySelector('.cue-text');
        if (node.hidden || !range.intersectsNode(node)) return;
        // Clip each row separately so a cross-row selection never saves Chinese or controls.
        const clipped = document.createRange(); clipped.selectNodeContents(node);
        if (range.compareBoundaryPoints(Range.START_TO_START, clipped) > 0) clipped.setStart(range.startContainer, range.startOffset);
        if (range.compareBoundaryPoints(Range.END_TO_END, clipped) < 0) clipped.setEnd(range.endContainer, range.endOffset);
        const text = normalizeCueText(clipped.toString());
        if (text) { pieces.push(text); contexts.push(cues[i].text); selectedCues.push(cues[i]); }
      });
      if (!pieces.length) return null;
      let text = pieces.join('\n');
      const context = contexts.join('\n');
      const withoutEdgePunctuation = value => normalize(value).replace(/^[“"'(]+|[.!?…”"')]+$/g, '');
      // When all words are selected, retain the original sentence's closing punctuation.
      if (withoutEdgePunctuation(text) === withoutEdgePunctuation(context)) text = context;
      const kind = normalize(text) === normalize(context) ? 'sentence' : /^[A-Za-z]+(?:['’\-][A-Za-z]+)*$/.test(text) ? 'word' : 'phrase';
      return { text, context, kind, lastStart: selectedCues.at(-1).start, metadata: { time: selectedCues[0].start, cueEnd: selectedCues.at(-1).end, url: location.origin + path } };
    }
    list.addEventListener('pointerdown', event => {
      suppressClick = false;
      if (event.button !== 0 || !event.target.closest('.cue-text')) return;
      clearSelection();
      const word = event.target.closest('.cue-word');
      gesture = { x: event.clientX, y: event.clientY, moved: false, word };
      if (word) { event.preventDefault(); word.focus({ preventScroll: true }); }
    });
    root.addEventListener('pointermove', event => {
      if (!gesture || !(event.buttons & 1)) return;
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4) {
        if (!gesture.moved) void shadow.pause('選取文字中，完成後按繼續。');
        gesture.moved = true; manualScroll();
        const word = event.target.closest('.cue-word');
        if (gesture.word && word) {
          // Select whole words explicitly: Chromium can suppress native dragging in player shadows.
          const backwards = !!(gesture.word.compareDocumentPosition(word) & Node.DOCUMENT_POSITION_PRECEDING);
          const first = backwards ? word : gesture.word, last = backwards ? gesture.word : word;
          const range = document.createRange(); range.setStart(first.firstChild, 0); range.setEnd(last.firstChild, last.textContent.length);
          const selection = textSelection(); selection.removeAllRanges(); selection.addRange(range);
        }
      }
    });
    document.addEventListener('pointerup', () => {
      if (!gesture) return;
      const moved = gesture.moved; gesture = null;
      if (moved) {
        suppressClick = true; selectionDraft = captureSelection();
        if (selectionDraft) {
          manualScroll(); selectionTools.hidden = false;
          $('selection-preview').textContent = '已選取：' + selectionDraft.text;
        }
      }
      if (!selectionDraft && renderPending) { renderPending = false; render(); }
    }, true);
    root.addEventListener('pointercancel', () => { suppressClick = true; clearSelection(); });
    list.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; } }, true);
    $('selection-lookup').onpointerdown = event => event.preventDefault();
    $('selection-lookup').onclick = () => {
      const draft = selectionDraft; clearSelection();
      if (draft) lookup(draft.text, draft.kind, draft.context, draft.metadata);
    };
    $('selection-cancel').onclick = () => clearSelection();
    $('selection-shadow').onpointerdown = event => event.preventDefault();
    $('selection-shadow').onclick = () => {
      const draft = selectionDraft;
      if (draft) shadow.prepare(draft.metadata.time, draft.lastStart);
      clearSelection();
    };
    root.addEventListener('keydown', event => { if (event.key === 'Escape') clearSelection(); });
    let listHeight = list.clientHeight;
    let path = location.pathname, tracks = [], selectedTrack = null, history = [], cues = [], rows = [];
    let chineseTracks = [], selectedChinese = null, manualChinese = false, nativeSeen = new WeakMap();
    let following = true, collapsed = false, active = [], lastText = '', lastTime = 0, observed = null, expectedScroll = null, visible = false;
    let seekId = '', seekTimer, autoTrack = true, autoActive = false;
    const review = globalThis.SubtitlePocketReview;
    let reviewSettings = review.settings(), entries = [], reviewTargets = new Set(), revealed = new Set();
    const pauseGate = review.createPauseGate();
    let reviewVideo = null;
    const shadow = globalThis.SubtitlePocketShadowing.createUI(root, {
      getCues: () => cues, precise: () => !!selectedTrack,
      changed: () => { clearSelection(false); pauseGate.reset(); applyReview(); },
      selected: cue => { closeTranslation(); collapsed = false; show(); following = true; $('resume-follow').hidden = true; const index = cues.findIndex(c => c.start === cue.start); if (index >= 0) centerRow(rows[index]); },
      translate: cue => alignTranslation(cue, selectedChinese),
    });
    function resetReviewPlayback() { pauseGate.reset(); revealed.clear(); applyReview(); }
    function syncReviewControls() {
      $('review-enabled').checked = reviewSettings.enabled;
      $('review-chinese').checked = reviewSettings.hideChinese;
      $('review-english').checked = reviewSettings.hideEnglish;
      $('review-pause').checked = reviewSettings.pause;
      $('review-options').disabled = !reviewSettings.enabled;
      reviewControls.querySelector('summary').textContent = '複習模式' + (reviewSettings.enabled ? ' · 已開啟' : '');
      for (const input of $('review-kinds').querySelectorAll('input')) input.checked = reviewSettings.kinds.includes(input.value);
    }
    function rebuildReview() {
      reviewTargets = review.targets(cues, entries, path, reviewSettings.kinds);
      applyReview();
    }
    function applyReview() {
      const shadowMask = shadow.mask();
      rows.forEach((row, i) => {
        const target = !shadowMask && reviewSettings.enabled && reviewTargets.has(i);
        const answer = revealed.has(review.key(cues[i]));
        row.classList.toggle('review-target', target);
        const en = shadowMask ? shadowMask.hideEnglish : target && !answer && reviewSettings.hideEnglish;
        const zh = shadowMask ? shadowMask.hideChinese : target && !answer && reviewSettings.hideChinese;
        row.querySelector('.cue-text').hidden = en;
        const chinese = row.querySelector('.cue-zh'); if (chinese) chinese.hidden = zh;
        row.querySelector('.review-mask-en').hidden = !en;
        row.querySelector('.review-mask-zh').hidden = !zh || !chinese;
        const reveal = row.querySelector('.cue-review');
        reveal.hidden = !target || !(reviewSettings.hideEnglish || reviewSettings.hideChinese);
        reveal.textContent = answer ? '重新遮蔽' : '顯示答案';
        reveal.setAttribute('aria-pressed', String(answer));
        // Hidden answers must not leak through accessible labels or selection previews.
        row.querySelector('.cue-jump').setAttribute('aria-label', '跳到 ' + format(cues[i].start) + (en ? '（英文已遮蔽）' : '：' + cues[i].text));
        row.querySelector('.cue-translate').setAttribute('aria-label', en ? '翻譯整句' : '翻譯：' + cues[i].text);
        row.querySelector('.cue-save').setAttribute('aria-label', en ? '收藏整句' : '收藏整句：' + cues[i].text);
      });
      $('review-status').textContent = !reviewSettings.enabled ? '只複習這部影片中有收藏的句子。' : !reviewSettings.kinds.length ? '請至少勾選一種收藏類型。' : `本片符合 ${reviewTargets.size} 句 · 顯示答案後可手動繼續播放。`;
    }
    reviewControls.onchange = async () => {
      reviewSettings = review.settings({ enabled: $('review-enabled').checked, hideChinese: $('review-chinese').checked, hideEnglish: $('review-english').checked, pause: $('review-pause').checked,
        kinds: [...$('review-kinds').querySelectorAll('input:checked')].map(input => input.value) });
      clearSelection(false); closeTranslation(); revealed.clear(); pauseGate.reset(); syncReviewControls(); rebuildReview();
      try { await chrome.storage.local.set({ reviewSettings }); }
      catch { $('review-status').textContent = '設定儲存失敗；目前分頁仍可使用，請重試。'; }
    };
    chrome.storage.local.get({ reviewSettings: {}, entries: [] }).then(data => {
      reviewSettings = review.settings(data.reviewSettings); entries = data.entries; syncReviewControls(); rebuildReview();
    }).catch(() => { $('review-status').textContent = '複習資料讀取失敗，請重新整理。'; });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || (!changes.reviewSettings && !changes.entries)) return;
      if (changes.entries) { entries = changes.entries.newValue || []; if (reviewSettings.enabled) clearSelection(false); }
      if (changes.reviewSettings) { reviewSettings = review.settings(changes.reviewSettings.newValue); clearSelection(false); closeTranslation(); revealed.clear(); pauseGate.reset(); }
      syncReviewControls(); rebuildReview();
    });
    syncReviewControls();
    const emit = data => window.postMessage({ channel: 'subtitle-pocket-v2', from: 'extension', ...data }, location.origin);
    const format = time => {
      const seconds = Math.floor(time);
      return (seconds >= 3600 ? Math.floor(seconds / 3600) + ':' : '') + String(Math.floor(seconds / 60) % 60).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    };
    function manualScroll() { following = false; expectedScroll = null; $('resume-follow').hidden = false; }
    function followCurrent() {
      const practice = shadow.current();
      const index = practice ? cues.findIndex(c => practice.start >= c.start && practice.start < c.end) : active[0];
      centerRow(rows[index]);
    }
    function centerRow(row) {
      if (!row || !following || collapsed) return;
      // Use the visible list viewport after the card and header have taken their space.
      const rowTop = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      const top = Math.min(Math.max(0, rowTop - Math.max(0, (list.clientHeight - row.offsetHeight) / 2)), Math.max(0, list.scrollHeight - list.clientHeight));
      expectedScroll = top;
      list.scrollTo({ top, behavior: 'instant' });
    }
    list.addEventListener('wheel', manualScroll, { passive: true });
    list.addEventListener('touchmove', manualScroll, { passive: true });
    list.addEventListener('pointerdown', event => { if (event.target === list) manualScroll(); });
    list.addEventListener('keydown', event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) manualScroll(); });
    list.addEventListener('scroll', () => {
      if (listHeight !== list.clientHeight) { listHeight = list.clientHeight; expectedScroll = list.scrollTop; followCurrent(); return; }
      if (expectedScroll !== null && Math.abs(list.scrollTop - expectedScroll) < 2) return;
      if (list.scrollHeight > list.clientHeight) manualScroll();
    });
    new ResizeObserver(() => { listHeight = list.clientHeight; expectedScroll = list.scrollTop; followCurrent(); }).observe(list);
    $('resume-follow').onclick = () => { clearSelection(); following = true; $('resume-follow').hidden = true; followCurrent(); };
    function show() {
      if ((!visible || collapsed) && (selectionDraft || gesture)) clearSelection();
      layout.update(visible, collapsed);
      region.hidden = !visible;
      panel.hidden = !visible || collapsed; toggle.hidden = !visible || !collapsed;
      if ((!visible || collapsed) && infoDialog.open) infoDialog.close();
      syncCardSize();
      root.host.toggleAttribute('data-transcript-open', visible && !collapsed);
    }
    $('transcript-close').onclick = () => { closeTranslation(); collapsed = true; show(); };
    toggle.onclick = () => { collapsed = false; show(); followCurrent(); };
    function updateHighlight(time) {
      const next = [];
      cues.forEach((cue, i) => { if (time >= cue.start && time < cue.end) next.push(i); });
      if (next.join() === active.join()) return;
      active.forEach(i => { rows[i]?.classList.remove('active'); rows[i]?.querySelector('.cue-jump').removeAttribute('aria-current'); });
      active = next;
      active.forEach(i => { rows[i]?.classList.add('active'); rows[i]?.querySelector('.cue-jump').setAttribute('aria-current', 'true'); });
      followCurrent();
    }
    function jump(cue) {
      void shadow.pause('影片位置已變更，按繼續從本輪開頭重播。', true);
      clearSelection();
      closeTranslation(); resetReviewPlayback();
      seekId = crypto.randomUUID(); clearTimeout(seekTimer);
      $('transcript-feedback').textContent = '正在跳到 ' + format(cue.start) + '…';
      emit({ type: 'seek', time: cue.start, path, id: seekId });
      seekTimer = setTimeout(() => { seekId = ''; $('transcript-feedback').textContent = '跳轉未完成，請重新整理 Netflix 後再試。'; }, 4500);
    }
    function render() {
      if (gesture || selectionDraft) { renderPending = true; return; }
      renderPending = false;
      const scroll = list.scrollTop;
      cues = groupByChineseCue(selectedTrack?.cues || history, selectedChinese);
      rows = []; active = [];
      list.replaceChildren();
      if (!cues.length) {
        const empty = document.createElement('div'); empty.id = 'transcript-empty';
        empty.textContent = '等待英文字幕… 正在嘗試自動載入；若播放器不支援，列表會先收集播放中的英文字幕。'; list.append(empty);
      }
      const fragment = document.createDocumentFragment();
      cues.forEach(cue => {
        const row = document.createElement('div'); row.className = 'cue';
        const button = document.createElement('button'); button.className = 'cue-jump'; button.title = '跳到 ' + format(cue.start) + ' 並播放';
        button.setAttribute('aria-label', '跳到 ' + format(cue.start) + '：' + cue.text);
        const time = document.createElement('span'); time.className = 'cue-time'; time.textContent = format(cue.start);
        const main = document.createElement('div'); main.className = 'cue-main';
        const text = document.createElement('span'); text.className = 'cue-text';
        for (const part of cue.text.split(/([A-Za-z]+(?:['’\-][A-Za-z]+)*)/g)) {
          if (!/^[A-Za-z]/.test(part)) { text.append(document.createTextNode(part)); continue; }
          const word = document.createElement('span'); word.className = 'cue-word'; word.textContent = part;
          word.setAttribute('role', 'button'); word.tabIndex = 0; word.style.cursor = 'pointer';
          word.title = '翻譯單字「' + part + '」';
          word.onclick = event => { event.stopPropagation(); lookup(part, 'word', cue.text, { time: cue.start, cueEnd: cue.end, url: location.origin + path }); };
          word.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); word.click(); } };
          text.append(word);
        }
        button.append(time); button.onclick = () => jump(cue); main.append(text);
        const maskEn = document.createElement('span'); maskEn.className = 'review-mask review-mask-en'; maskEn.textContent = '英文字幕已遮蔽'; maskEn.hidden = true; main.append(maskEn);
        const aligned = cue.alignment || alignTranslation(cue, selectedChinese);
        if (aligned) { const zh = document.createElement('div'); zh.className = 'cue-zh'; zh.textContent = aligned.text; zh.title = 'Netflix 中文字幕 · ' + (aligned.language || '語言未標示'); main.append(zh); }
        const maskZh = document.createElement('span'); maskZh.className = 'review-mask review-mask-zh'; maskZh.textContent = '中文字幕已遮蔽'; maskZh.hidden = true; main.append(maskZh);
        row.onclick = event => { if (!event.target.closest('button')) jump(cue); };
        const translate = document.createElement('button'); translate.className = 'cue-translate'; translate.textContent = '翻譯'; translate.setAttribute('aria-label', '翻譯：' + cue.text);
        translate.onclick = () => lookup(cue.text, 'sentence', cue.text, { time: cue.start, cueEnd: cue.end, url: location.origin + path });
        const save = document.createElement('button'); save.className = 'cue-save'; save.textContent = '☆'; save.title = '收藏整句'; save.setAttribute('aria-label', '收藏整句：' + cue.text);
        save.onclick = translate.onclick;
        const actions = document.createElement('div'); actions.className = 'cue-actions'; actions.append(translate, save);
        const practice = document.createElement('button'); practice.className = 'cue-translate cue-shadow'; practice.textContent = '跟讀'; practice.setAttribute('aria-label', '練習 ' + format(cue.start) + ' 的完整片段');
        practice.onclick = () => shadow.prepare(cue.start); actions.append(practice);
        const reveal = document.createElement('button'); reveal.className = 'cue-review'; reveal.hidden = true;
        reveal.onclick = () => { const id = review.key(cue); if (revealed.has(id)) revealed.delete(id); else revealed.add(id); applyReview(); };
        actions.append(reveal);
        row.append(button, main, actions); rows.push(row); fragment.append(row);
      });
      list.append(fragment); rebuildReview();
      $('transcript-info').textContent = selectedTrack ? `字幕軌已載入 · ${cues.length} 句` : `播放中收集 · ${cues.length} 句 · 時間約略`;
      $('chinese-info').textContent = selectedChinese ? `優先採用 Netflix 中文字幕 · ${selectedChinese.label}` : '等待自動取得中文字幕。';
      expectedScroll = Math.min(scroll, Math.max(0, list.scrollHeight - list.clientHeight)); list.scrollTop = expectedScroll;
      updateHighlight(document.querySelector('video')?.currentTime || 0);
      shadow.refresh();
    }
    function trackOptions() {
      $('transcript-track').replaceChildren();
      for (const track of tracks) {
        const option = document.createElement('option'); option.value = track.id; option.textContent = track.label + ' · ' + track.cues.length + ' 句'; $('transcript-track').append(option);
      }
      $('transcript-track').hidden = tracks.length < 2;
      if (selectedTrack) $('transcript-track').value = selectedTrack.id;
    }
    function addTrack(track) {
      if (!track?.cues.length) return;
      const kind = trackKind(track);
      if (kind === 'english' || kind === 'chinese') emit({ type: 'captionAvailable', path: location.pathname, kind });
      if (kind === 'other') return;
      const key = JSON.stringify(track.cues);
      if (kind === 'chinese') {
        if (chineseTracks.some(t => t.key === key && t.language === track.language)) return;
        const item = { ...track, key, id: crypto.randomUUID(), label: track.language || '中文字幕（未標示語系）' };
        chineseTracks.push(item); if (chineseTracks.length > 6) chineseTracks.shift();
        if (!selectedChinese || !chineseTracks.includes(selectedChinese) || (!manualChinese && chineseRank(item.language) > chineseRank(selectedChinese.language))) selectedChinese = item;
        $('chinese-track').replaceChildren();
        for (const t of chineseTracks) { const option = document.createElement('option'); option.value = t.id; option.textContent = t.label; $('chinese-track').append(option); }
        $('chinese-track').value = selectedChinese.id; $('chinese-track').hidden = chineseTracks.length < 2;
        render(); return;
      }
      if (tracks.some(t => t.key === key)) return;
      const item = { ...track, key, id: crypto.randomUUID(), label: track.language || '字幕軌 ' + (tracks.length + 1) };
      tracks.push(item); if (tracks.length > 6) tracks.shift();
      // Prefer a track matching the subtitle currently on screen; never merge tracks.
      const text = normalize(lastText), now = document.querySelector('video')?.currentTime || 0;
      if (!selectedTrack || !tracks.includes(selectedTrack) || (!shadow.active() && autoTrack && item.cues.some(c => normalize(c.text) === text && now >= c.start && now < c.end))) {
        if (shadow.active()) void shadow.stop();
        selectedTrack = item;
      }
      trackOptions(); render();
    }
    $('transcript-track').onchange = () => { void shadow.stop(); clearSelection(false); autoTrack = false; selectedTrack = tracks.find(t => t.id === $('transcript-track').value); render(); };
    $('chinese-track').onchange = () => { clearSelection(false); manualChinese = true; selectedChinese = chineseTracks.find(t => t.id === $('chinese-track').value); render(); };
    function reset() {
      void shadow.stop();
      clearSelection(false); renderPending = false; autoActive = false; pauseGate.reset(); revealed.clear();
      $('auto-caption-status').textContent = ''; $('auto-caption-retry').hidden = true;
      path = location.pathname; tracks = []; history = []; cues = []; selectedTrack = null; observed = null; lastText = ''; lastTime = 0; nativeSeen = new WeakMap();
      chineseTracks = []; selectedChinese = null; manualChinese = false; $('chinese-track').replaceChildren(); $('chinese-track').hidden = true;
      following = true; autoTrack = true; $('resume-follow').hidden = true; clearTimeout(seekTimer); seekId = '';
      $('transcript-feedback').textContent = ''; trackOptions(); render();
      emit({ type: 'requestCaptions' });
    }
    window.addEventListener('message', event => {
      const m = event.data;
      if (event.source !== window || event.origin !== location.origin || m?.channel !== 'subtitle-pocket-v2' || m.from !== 'player' || m.path !== location.pathname) return;
      if (path !== location.pathname) reset();
      if (m.type === 'captions') {
        try { addTrack(parseCaptions(m.text)); } catch { /* Unsupported tracks fall back to observed subtitles. */ }
      } else if (m.type === 'autoCaptionStatus') {
        $('auto-caption-status').textContent = String(m.message || '').slice(0, 200);
        $('auto-caption-retry').hidden = !m.retry;
      } else if (m.type === 'seekResult' && m.id === seekId) {
        clearTimeout(seekTimer); seekId = '';
        $('transcript-feedback').textContent = m.ok ? '已跳轉播放 · 點「翻譯」查中文' : String(m.error || '跳轉失敗，請重試。').slice(0, 200);
      }
    });
    function tick(text, enabled) {
      if (path !== location.pathname) reset();
      visible = enabled && /^\/watch\/\d+$/.test(path); show();
      if (autoActive !== visible) { autoActive = visible; emit({ type: 'autoCaptions', path, enabled: visible }); }
      if (!visible) { void shadow.stop(); pauseGate.reset(); if (revealed.size) { revealed.clear(); applyReview(); } return; }
      const video = document.querySelector('video'), now = video?.currentTime || 0;
      if (video !== reviewVideo) {
        reviewVideo?.removeEventListener('seeking', resetReviewPlayback);
        reviewVideo = video; pauseGate.reset(); revealed.clear(); applyReview();
        video?.addEventListener('seeking', resetReviewPlayback);
      }
      for (const native of [...(video?.textTracks || [])].filter(t => t.mode !== 'disabled' && t.cues?.length)) {
        const signature = native.language + ':' + native.cues.length;
        if (signature !== nativeSeen.get(native)) {
          nativeSeen.set(native, signature);
          addTrack({ language: native.language, cues: cleanCues([...native.cues].map(c => ({ start: c.startTime, end: c.endTime, text: c.text.replace(/<[^>]*>/g, '') }))) });
        }
      }
      const normalized = normalize(text);
      if (!shadow.active() && autoTrack && normalized && tracks.length > 1) {
        const match = tracks.find(t => t.cues.some(c => normalize(c.text) === normalized && now >= c.start && now < c.end));
        if (match && match !== selectedTrack) { selectedTrack = match; trackOptions(); render(); }
      }
      if (!selectedTrack) {
        const continuous = Math.abs(now - lastTime) < 1;
        if (!continuous || video?.seeking) observed = null;
        if (observed && continuous && !video?.seeking) observed.end = Math.max(observed.start + .01, normalized === lastText ? now + .25 : now);
        if (normalized !== lastText) {
          observed = null;
          if (normalized && trackKind({ language: '', cues: [{ text: normalized }] }) === 'english' && !seekId && !video?.seeking) {
            observed = history.find(c => normalize(c.text) === normalized && now >= c.start - .5 && now < c.end + .5);
            if (!observed) {
              history = cleanCues([...history, { start: now, end: now + .25, text: normalizeCueText(text) }]);
              observed = history.find(c => Math.round(c.start * 1000) === Math.round(now * 1000));
              render();
            }
          }
        }
      }
      // History cue ends grow during playback; keep grouped row timing current too.
      if (!selectedTrack && selectedChinese) for (const cue of cues) if (cue.parts) cue.end = Math.max(...cue.parts.map(part => part.end));
      lastText = normalized; lastTime = now; updateHighlight(now);
      if (pauseGate.update(cues, reviewTargets, now, !!video && !video.paused && !video.seeking, !shadow.active() && reviewSettings.enabled && reviewSettings.pause)) {
        video.pause();
        $('transcript-feedback').textContent = '複習暫停 · 回想這句對話，顯示答案後按播放繼續。';
      }
    }
    $('auto-caption-retry').onclick = () => emit({ type: 'autoCaptions', path, enabled: true, retry: true });
    render(); emit({ type: 'requestCaptions' });
    function getTranslation(context, time, end) {
      if (path !== location.pathname) return null;
      const source = cues.find(c => normalize(c.text) === normalize(context) && time >= c.start - .5 && time < c.end + .5);
      return source?.alignment || alignTranslation(source || { start: time, end: Number.isFinite(end) && end > time ? end : time + .2 }, selectedChinese);
    }
    function getReviewState(time) {
      if (visible && shadow.active()) return shadow.mask();
      const targets = cues.filter((cue, i) => visible && reviewSettings.enabled && reviewTargets.has(i) && time >= cue.start && time < cue.end);
      const hidden = targets.some(cue => !revealed.has(review.key(cue)));
      return { hideEnglish: hidden && reviewSettings.hideEnglish, hideChinese: hidden && reviewSettings.hideChinese };
    }
    function getCueMetadata(context, time) {
      const cue = cues.find(c => normalize(c.text) === normalize(context) && time >= c.start && time < c.end);
      return cue ? { time: cue.start, cueEnd: cue.end } : {};
    }
    return { tick, getTranslation, getReviewState, getCueMetadata, pausePractice: () => shadow.pause('查詞中，完成後按繼續。'), hasEnglish: () => !!selectedTrack?.cues.length, open: () => { clearSelection(); collapsed = false; show(); followCurrent(); } };
  };
})();
