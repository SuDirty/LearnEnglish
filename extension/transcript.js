(() => {
  const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
  const normalizeCueText = text => String(text || '').split(/\r?\n/).map(normalize).filter(Boolean).join('\n');
  function parseTime(value, rates = {}) {
    const s = String(value || '').trim();
    const clock = /^(?:(\d+):)?(\d{2}):(\d{2})(?:[.,](\d+))?$/.exec(s);
    if (clock) return Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) + Number('0.' + (clock[4] || '0'));
    const frames = /^(\d+):(\d{2}):(\d{2}):(\d+)(?:\.(\d+))?$/.exec(s);
    if (frames) return Number(frames[1]) * 3600 + Number(frames[2]) * 60 + Number(frames[3]) + (Number(frames[4]) + Number(frames[5] || 0) / (rates.subFrameRate || 1)) / (rates.frameRate || 30);
    const offset = /^(\d+(?:\.\d+)?)(h|m|s|ms|f|t)$/.exec(s);
    if (!offset) return NaN;
    return Number(offset[1]) * ({ h: 3600, m: 60, s: 1, ms: .001, f: 1 / (rates.frameRate || 30), t: 1 / (rates.tickRate || 1) })[offset[2]];
  }
  function cleanCues(cues) {
    const groups = new Map();
    for (const cue of cues) {
      const text = normalizeCueText(cue.text).slice(0, 2000);
      if (!text || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || cue.end > 86400) continue;
      // Group within a track by millisecond onset, not the rounded MM:SS label.
      // Some simultaneous lines have different end times. Keep the longest interval.
      const key = Math.round(cue.start * 1000);
      let group = groups.get(key);
      if (!group) { group = { start: cue.start, end: cue.end, fragments: [], seen: new Set() }; groups.set(key, group); }
      group.start = Math.min(group.start, cue.start); group.end = Math.max(group.end, cue.end);
      const contentKey = normalize(text);
      if (!group.seen.has(contentKey)) { group.seen.add(contentKey); group.fragments.push(text); }
    }
    return [...groups.values()].sort((a, b) => a.start - b.start).slice(0, 15000)
      .map(g => ({ start: g.start, end: g.end, text: g.fragments.join('\n').slice(0, 2000) }));
  }
  function trackKind(track) {
    const language = String(track.language || '').toLowerCase();
    if (/^(zh|cmn|yue)(?:-|$)/.test(language)) return 'chinese';
    if (/^en(?:-|$)/.test(language)) return 'english';
    if (language && language !== 'und') return 'other';
    const sample = track.cues.slice(0, 30).map(c => c.text).join('');
    // Unlabelled VTT often has no language metadata. Do not mistake Japanese for Chinese.
    if (/[\u3040-\u30ff\uac00-\ud7af]/.test(sample)) return 'other';
    const han = (sample.match(/\p{Script=Han}/gu) || []).length;
    const latin = (sample.match(/[a-z]/gi) || []).length;
    return han > 0 && han > latin / 2 ? 'chinese' : latin ? 'english' : 'other';
  }
  function chineseRank(language) {
    return /(?:hant|tw|hk|mo)/i.test(language) ? 3 : /(?:hans|cn|sg)/i.test(language) ? 1 : 2;
  }
  function alignTranslation(cue, track) {
    if (!cue || !track || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start) return null;
    const matches = track.cues.filter(c => {
      const overlap = Math.min(cue.end, c.end) - Math.max(cue.start, c.start);
      return overlap > 0 && overlap / Math.min(cue.end - cue.start, c.end - c.start) >= .35;
    });
    // Measure the union of overlapping intervals, not their sum.
    let covered = 0, until = cue.start;
    for (const c of matches) {
      const start = Math.max(cue.start, c.start, until), end = Math.min(cue.end, c.end);
      if (end > start) covered += end - start;
      until = Math.max(until, end);
    }
    if (!matches.length || covered / (cue.end - cue.start) < .45) return null;
    // Equal text at different times can be intentional repetition within a saved paragraph.
    return { text: matches.map(c => c.text).join(' '), language: track.language || '', source: 'Netflix 中文字幕', matches };
  }
  function groupByChineseCue(cues, track) {
    if (!track) return cues;
    const groups = [];
    const sameMatches = (a, b) => a && b && a.matches.length === b.matches.length && a.matches.every((cue, i) => cue === b.matches[i]);
    for (const cue of cues) {
      const alignment = alignTranslation(cue, track);
      const previous = groups.at(-1);
      const text = previous ? previous.text + '\n' + cue.text : cue.text;
      // Source cue identity/time matters: equal Chinese strings elsewhere are unrelated.
      if (previous && cue.start >= previous.start && cue.start - previous.end <= 1 && text.length <= 2000 && sameMatches(previous.alignment, alignment)) {
        const combined = { start: previous.start, end: Math.max(previous.end, cue.end), text };
        const combinedAlignment = alignTranslation(combined, track);
        // Do not bridge a gap containing another Chinese cue.
        if (sameMatches(combinedAlignment, alignment)) {
          Object.assign(previous, combined, { alignment: combinedAlignment });
          previous.parts.push(cue);
          continue;
        }
      }
      groups.push({ ...cue, parts: [cue], alignment });
    }
    return groups;
  }
  function parseCaptions(text) {
    if (typeof text !== 'string' || text.length > 4 * 1024 * 1024) return null;
    let cues = [], language = '';
    if (/^\s*WEBVTT/.test(text.replace(/^\uFEFF/, ''))) {
      for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
        const lines = block.split('\n');
        if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0])) continue;
        const index = lines.findIndex(line => line.includes('-->'));
        if (index < 0) continue;
        const [start, end] = lines[index].split('-->').map(s => s.trim().split(/\s/)[0]);
        const value = lines.slice(index + 1).join('\n').replace(/<[^>]*>/g, '');
        const decoded = new DOMParser().parseFromString('<body>' + value.replaceAll('<', '&lt;') + '</body>', 'text/html').body.textContent;
        cues.push({ start: parseTime(start), end: parseTime(end), text: decoded });
      }
    } else {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'tt') return null;
      const attr = (el, name) => [...el.attributes].find(a => a.localName === name)?.value;
      const tt = doc.documentElement;
      language = attr(tt, 'lang') || [...tt.getElementsByTagNameNS('*', 'body')].map(el => attr(el, 'lang')).find(Boolean) || '';
      const multiplier = (attr(tt, 'frameRateMultiplier') || '1 1').split(/\s+/).map(Number);
      const frameRate = (Number(attr(tt, 'frameRate')) || 30) * multiplier[0] / multiplier[1];
      const rates = { frameRate, subFrameRate: Number(attr(tt, 'subFrameRate')) || 1, tickRate: Number(attr(tt, 'tickRate')) || (attr(tt, 'frameRate') ? frameRate * (Number(attr(tt, 'subFrameRate')) || 1) : 1) };
      const timing = (el, parentStart = 0, parentEnd = Infinity) => {
        const begin = el.getAttribute('begin');
        const start = parentStart + (begin ? parseTime(begin, rates) : 0);
        const endValue = el.getAttribute('end'), duration = el.getAttribute('dur');
        const end = Math.min(parentEnd, endValue ? parentStart + parseTime(endValue, rates) : Infinity, duration ? start + parseTime(duration, rates) : Infinity);
        if (el.localName === 'p') {
          const copy = el.cloneNode(true);
          for (const br of [...copy.getElementsByTagNameNS('*', 'br')]) br.replaceWith('\uE000');
          cues.push({ start, end, text: normalize(copy.textContent).replaceAll('\uE000', '\n') });
        } else for (const child of el.children) if (['body', 'div', 'p'].includes(child.localName)) timing(child, start, end);
      };
      timing(tt);
    }
    cues = cleanCues(cues);
    return cues.length ? { cues, language } : null;
  }
  globalThis.SubtitlePocketTranscript = { parseTime, parseCaptions, cleanCues, normalize, normalizeCueText, trackKind, chineseRank, alignTranslation, groupByChineseCue };
})();
