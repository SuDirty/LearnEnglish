// Keep model output and error messages on one terminal line; never render escape codes.
export function cleanLine(value, limit = 160) {
  const text = String(value ?? '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(/Bearer\s+\S+/gi, 'Bearer [已隱藏]')
    .replace(/\b[a-f0-9]{64}\b/gi, '[權杖已隱藏]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[金鑰已隱藏]')
    .replace(/\s+/g, ' ').trim();
  const chars = [...text];
  return chars.length > limit ? chars.slice(0, limit).join('') + '…' : text;
}

export function createTerminalLog({ write = line => console.log(line), showText = true, now = () => new Date() } = {}) {
  let completed = 0, failed = 0, totalMs = 0, lastModel = '';
  const seconds = ms => (ms / 1000).toFixed(1) + ' 秒';
  const info = value => write(`[${now().toLocaleTimeString('zh-TW', { hour12: false })}] ${cleanLine(value, 600)}`);
  const summary = () => `本次累計：完成 ${completed} 筆／失敗 ${failed} 筆` +
    (completed ? `／平均翻譯 ${seconds(totalMs / completed)}` : '');
  const emit = event => {
    const id = event.jobId ? `#${event.jobId.slice(0, 8)} ` : '';
    const queue = `執行 ${event.active}／排隊 ${event.queued}`;
    switch (event.type) {
      case 'connection.starting': info('Codex 連線建立中…'); break;
      case 'connection.ready': info('Codex 已連線，登入檢查通過；連線將重複使用。'); break;
      case 'connection.disconnected': info('Codex 連線已中斷，下次請求會重新連線。'); break;
      case 'model.resolved': {
        const selection = `${event.model || 'Codex 預設'}／推理 ${event.effort}`;
        if (lastModel !== selection) { info(`實際模型：${selection}`); lastModel = selection; }
        break;
      }
      case 'job.queued':
        info(`${id}收到翻譯 · ${event.characters} 字元 · ${queue}`);
        if (showText) info(`${id}原文：${cleanLine(event.text)}`);
        break;
      case 'job.started': info(`${id}開始翻譯 · 排隊 ${seconds(event.waitMs)} · ${queue}`); break;
      case 'job.progress': info(`${id}翻譯中 · 已等待 ${seconds(event.elapsedMs)} · ${queue}`); break;
      case 'job.reused': info(`${id}重複請求，沿用既有工作。`); break;
      case 'job.completed':
        completed++; totalMs += event.elapsedMs;
        info(`${id}完成 · 翻譯 ${seconds(event.elapsedMs)} · 總耗時 ${seconds(event.elapsedMs + event.waitMs)} · ${queue}`);
        if (showText) info(`${id}譯文：${cleanLine(event.translation)}`);
        info(summary());
        break;
      case 'job.failed':
        failed++;
        info(`${id}失敗 · ${seconds(event.elapsedMs)} · ${showText ? cleanLine(event.error) : '請在擴充功能查看錯誤原因。'}`);
        info(summary());
        break;
      case 'request.rejected': info(`請求遭拒 · HTTP ${event.status} · ${event.message}`); break;
    }
  };
  return { info, emit, summary };
}
