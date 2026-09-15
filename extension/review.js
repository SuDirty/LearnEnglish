(() => {
  const kinds = ['word', 'phrase', 'sentence'];
  const normalize = value => String(value || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  function settings(value = {}) {
    value = value && typeof value === 'object' ? value : {};
    return { enabled: value.enabled === true, hideChinese: value.hideChinese !== false,
      hideEnglish: value.hideEnglish === true, pause: value.pause === true,
      kinds: Array.isArray(value.kinds) ? kinds.filter(kind => value.kinds.includes(kind)) : [...kinds] };
  }
  function watchPath(value) {
    try { const url = new URL(value); return url.origin === 'https://www.netflix.com' && /^\/watch\/\d+$/.test(url.pathname) ? url.pathname : ''; }
    catch { return ''; }
  }
  const key = cue => cue.start + ':' + normalize(cue.text);
  // Anchor to the saved occurrence, not every appearance of the same word in a video.
  // Old entries have integer seconds and no end time; their full context supplies the span.
  function targets(rows, entries, path, selectedKinds) {
    // Match original English fragments, then mask their displayed (possibly grouped) row.
    const source = rows.flatMap((cue, row) => (cue.parts || [cue]).map(part => ({ ...part, row })));
    const cues = source;
    const matched = new Set();
    const texts = cues.map(cue => normalize(cue.text));
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || !path || watchPath(entry.url) !== path || !selectedKinds.includes(entry.kind)) continue;
      const context = normalize(entry.context || (entry.kind === 'sentence' ? entry.text : ''));
      const time = Number.isFinite(entry.cueStart) ? entry.cueStart : entry.time;
      if (!context || !Number.isFinite(time)) continue;
      const compatible = text => !!text && (context.includes(text) || text.includes(context));
      const anchors = cues.map((cue, i) => ({ cue, i })).filter(({ cue, i }) =>
        time >= cue.start - (Number.isFinite(entry.cueStart) ? .05 : 1) && time < cue.end && compatible(texts[i]));
      // Prefer a cue containing the actual saved time over the rounding tolerance.
      anchors.sort((a, b) => Number(time < a.cue.start) - Number(time < b.cue.start) || Math.abs(time - a.cue.start) - Math.abs(time - b.cue.start));
      const anchor = anchors[0];
      if (!anchor) continue;
      matched.add(source[anchor.i].row);
      let accumulated = texts[anchor.i];
      for (let i = anchor.i + 1; i < cues.length && accumulated.length < context.length; i++) {
        if (Number.isFinite(entry.cueEnd) && cues[i].start >= entry.cueEnd) break;
        const next = accumulated + ' ' + texts[i];
        if (!context.includes(next)) break;
        matched.add(source[i].row); accumulated = next;
      }
    }
    return matched;
  }
  function createPauseGate() {
    let handled = new Set();
    return {
      reset() { handled.clear(); },
      update(cues, matched, time, playing, enabled) {
        if (!enabled) { handled.clear(); return false; }
        const active = cues.filter((cue, i) => matched.has(i) && time >= cue.start && time < cue.end).map(key);
        handled = new Set([...handled].filter(id => active.includes(id)));
        if (!playing || !active.some(id => !handled.has(id))) return false;
        active.forEach(id => handled.add(id));
        return true;
      }
    };
  }
  globalThis.SubtitlePocketReview = { settings, targets, key, createPauseGate };
})();
