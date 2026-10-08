(() => {
  let current = null, last = null;
  async function send(payload) {
    const response = await chrome.runtime.sendMessage(payload);
    if (!response?.ok) throw new Error(response?.error || '朗讀失敗，請重新載入套件及頁面後重試。');
    return response;
  }
  function reset() {
    if (last) { last.stop.hidden = true; last.status.textContent = ''; last = null; }
    if (current) { current = null; void send({ type: 'stopSpeech' }).catch(() => {}); }
  }
  function mount(container, getText, beforeSpeak = () => {}) {
    const controls = document.createElement('div'); controls.className = 'speech-controls';
    controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', '系統英文朗讀');
    const status = document.createElement('span'); status.className = 'speech-status'; status.setAttribute('role', 'status');
    const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = '停止'; stop.hidden = true;
    stop.setAttribute('aria-label', '停止朗讀');
    for (const [label, rate] of [['🔊 朗讀', 1], ['慢速', 0.7]]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.setAttribute('aria-label', rate === 1 ? '朗讀英文' : '慢速朗讀英文');
      button.onclick = async () => {
        reset();
        const task = { stop, status }; current = last = task;
        stop.hidden = false; status.textContent = '朗讀中…';
        try {
          beforeSpeak();
          const result = await send({ type: 'speak', text: getText(), rate });
          if (current === task) status.textContent = result.status === 'end' ? '' : '已停止朗讀';
        } catch (error) {
          if (current === task) status.textContent = error.message;
        } finally {
          if (current === task) { current = null; stop.hidden = true; }
        }
      };
      controls.append(button);
    }
    stop.onclick = async () => {
      const task = current; current = null; stop.hidden = true;
      try { await send({ type: 'stopSpeech' }); if (last === task) status.textContent = '已停止朗讀'; }
      catch (error) { if (last === task) status.textContent = error.message; }
    };
    controls.append(stop, status); container.append(controls);
  }
  addEventListener('pagehide', reset);
  globalThis.SubtitlePocketSpeech = { mount, reset };
})();
