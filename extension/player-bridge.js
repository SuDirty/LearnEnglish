(() => {
  // This page-world bridge only observes subtitle responses and controls playback.
  // It has no extension storage or translation access.
  const channel = 'subtitle-pocket-v2';
  const maxBytes = 4 * 1024 * 1024;
  const cached = new Map();
  const emit = data => window.postMessage({ channel, from: 'player', ...data }, location.origin);
  const watch = () => /^\/watch\/\d+$/.test(location.pathname) ? location.pathname : '';
  // Fullscreen the workspace so the native player and the sidebar remain siblings.
  // Do not move/recreate a playing video element or its React-managed ancestors.
  const nativeFullscreen = Element.prototype.requestFullscreen;
  if (nativeFullscreen) Element.prototype.requestFullscreen = function (...args) {
    const split = document.documentElement.hasAttribute('data-subtitle-pocket-split');
    const target = split && watch() && this !== document.documentElement && (this.matches('video') || this.querySelector('video')) ? document.documentElement : this;
    return Reflect.apply(nativeFullscreen, target, args);
  };
  function accept(value, path) {
    if (!path || path !== watch()) return;
    let text;
    if (typeof value === 'string') text = value;
    else if (value instanceof ArrayBuffer && value.byteLength <= maxBytes) {
      const prefix = new TextDecoder().decode(value.slice(0, 512));
      if (!/WEBVTT|<(?:\w+:)?tt[\s>]/.test(prefix)) return;
      text = new TextDecoder().decode(value);
    } else return;
    if (text.length > maxBytes || !/^(?:\s|\uFEFF)*(?:WEBVTT|<\?xml|<(?:\w+:)?tt[\s>])/.test(text)) return;
    if (!text.includes('-->') && !/<(?:\w+:)?tt[\s>]/.test(text.slice(0, 1000))) return;
    const key = path + ':' + text.length + ':' + text.slice(0, 200);
    if (cached.get(key)?.text === text) return;
    cached.set(key, { text, path });
    while (cached.size > 6) cached.delete(cached.keys().next().value);
    emit({ type: 'captions', text, path });
  }
  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    const path = watch();
    this.addEventListener('load', () => {
      try {
        if (!this.responseType || this.responseType === 'text') accept(this.responseText, path);
        else if (this.responseType === 'arraybuffer') accept(this.response, path);
        else if (this.responseType === 'blob' && this.response?.size <= maxBytes) {
          const blob = this.response;
          blob.slice(0, 512).text().then(prefix => {
            if (/WEBVTT|<(?:\w+:)?tt[\s>]/.test(prefix)) return blob.text().then(text => accept(text, path));
          }).catch(() => {});
        }
      } catch { /* A non-text response must never affect playback. */ }
    }, { once: true });
    return Reflect.apply(nativeOpen, this, args);
  };
  const nativeFetch = window.fetch;
  window.fetch = async function (...args) {
    const path = watch();
    const response = await Reflect.apply(nativeFetch, this, args);
    const mime = response.headers.get('content-type') || '';
    // Avoid cloning media segments or examining arbitrary API/JSON responses.
    if (path && (/xml|vtt|text\/plain/.test(mime) || /\.(ttml|dfxp|vtt)(?:[?#]|$)/i.test(response.url))) {
      const copy = response.clone();
      (async () => {
        const reader = copy.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder(); let size = 0, text = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) { await reader.cancel(); return; }
            text += decoder.decode(value, { stream: true });
          }
          accept(text + decoder.decode(), path);
        } finally { reader.releaseLock(); }
      })().catch(() => {});
    }
    return response;
  };
  let seekSerial = 0;
  window.addEventListener('message', async event => {
    const m = event.data;
    if (event.source !== window || event.origin !== location.origin || m?.channel !== channel || m.from !== 'extension') return;
    if (m.type === 'requestCaptions') {
      for (const item of cached.values()) if (item.path === watch()) emit({ type: 'captions', ...item });
      return;
    }
    if (m.type !== 'seek' || !watch() || m.path !== watch() || !Number.isFinite(m.time) || m.time < 0 || m.time > 86400 || typeof m.id !== 'string') return;
    const serial = ++seekSerial;
    try {
      const video = document.querySelector('video');
      if (!video) throw new Error('找不到播放器，請先播放影片。');
      const api = window.netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
      const sessions = api?.getAllPlayerSessionIds?.() || [];
      const player = sessions.length ? api?.getVideoPlayerBySessionId?.(sessions.find(id => String(id).includes('watch')) || sessions[0]) : null;
      if (player?.seek) { player.seek(Math.round(m.time * 1000)); player.play?.(); }
      else {
        if (!Number.isFinite(video.duration) || m.time > video.duration) throw new Error('影片尚未就緒，請稍後再試。');
        video.currentTime = m.time;
        await video.play();
      }
      const started = Date.now();
      while (Date.now() - started < 3000) {
        if (serial !== seekSerial || m.path !== watch()) return;
        const time = player?.getCurrentTime ? player.getCurrentTime() / 1000 : video.currentTime;
        if (Math.abs(time - m.time) < 2) { emit({ type: 'seekResult', id: m.id, path: m.path, ok: true }); return; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('播放器沒有跳到指定時間，請稍後重試。');
    } catch (error) { emit({ type: 'seekResult', id: m.id, path: m.path, ok: false, error: error.message }); }
  });
})();
