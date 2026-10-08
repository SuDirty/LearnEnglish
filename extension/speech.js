// One utterance across all extension pages; only its owning document may stop it.
export function createSpeechController(api, timeoutMs = 25_000) {
  let active = null;
  function stop(owner) {
    if (!active || (owner !== undefined && active.owner !== owner)) return {};
    const previous = active;
    previous.finish({ status: 'cancelled' });
    api.tts.stop();
    return {};
  }
  function speak(text, rate, owner) {
    if (typeof text !== 'string' || !text.trim() || text.length > 200 || /[<>]/.test(text)
      || !/[a-z]/i.test(text) || ![1, 0.7].includes(rate)) {
      return Promise.reject(new Error('請選擇 200 字元以內的英文文字朗讀。'));
    }
    if (!api.tts) return Promise.reject(new Error('朗讀權限尚未啟用，請重新載入擴充功能。'));
    stop();
    return new Promise((resolve, reject) => {
      const task = { owner, finish(result, error) {
        if (active !== task) return;
        active = null; clearTimeout(timer);
        if (error) reject(error); else resolve(result);
      } };
      active = task;
      const timer = setTimeout(() => {
        task.finish(null, new Error('朗讀逾時，請確認系統英文語音可用後重試。'));
        api.tts.stop();
      }, timeoutMs);
      Promise.resolve().then(() => api.tts.getVoices()).then(voices => {
        if (active !== task) return;
        const local = voices.filter(voice => !voice.remote && !voice.extensionId && voice.voiceName && /^en(?:[-_]|$)/i.test(voice.lang || ''));
        const american = local.filter(voice => /^en[-_]US$/i.test(voice.lang));
        // macOS lists novelty voices first; prefer its standard reading voice when installed.
        const voice = american.find(voice => /^Samantha\b/i.test(voice.voiceName)) || american[0] || local[0];
        if (!voice) throw new Error('找不到本機英文語音，請在系統設定安裝英文語音後重試。');
        return api.tts.speak(text.trim(), {
          voiceName: voice.voiceName, lang: voice.lang, rate, enqueue: false,
          onEvent(event) {
            if (event.type === 'error') task.finish(null, new Error('系統語音播放失敗，請確認英文語音可用後重試。'));
            else if (['end', 'interrupted', 'cancelled'].includes(event.type)) task.finish({ status: event.type });
          },
        });
      }).catch(error => task.finish(null, new Error(error.message || '系統語音播放失敗，請重試。')));
    });
  }
  return { speak, stop };
}
