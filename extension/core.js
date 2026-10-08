import { currentScore, bindInlineScore } from './vocabulary.js';
export const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizeLines = value => String(value ?? '').split(/\r?\n/).map(normalize).filter(Boolean).join('\n');
export function validateText(value) {
  const text = normalize(value);
  if (!text) throw new Error('請先選擇英文單字或句子。');
  if (text.length > 2000) throw new Error('每次最多查詢 2,000 字元，請選短一點的段落。');
  return text;
}
export function safeWatchUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://www.netflix.com' && /^\/watch\/\d+$/.test(url.pathname)
      ? url.origin + url.pathname : '';
  } catch { return ''; }
}
export function makeEntry(input) {
  const text = normalizeLines(input.text);
  if (!text || text.length > 2000) throw new Error('收藏文字不可空白或超過 2,000 字元。');
  const translation = normalizeLines(input.translation).slice(0, 4000);
  if (!translation) throw new Error('尚未取得翻譯，請稍後再收藏。');
  const entry = {
    id: crypto.randomUUID(), text, translation,
    kind: ['word', 'phrase', 'sentence'].includes(input.kind) ? input.kind : 'sentence',
    translationSource: ['Netflix 中文字幕', 'MyMemory', 'ECDICT', 'Google Cloud Translation', 'Codex (MCP)', 'Antigravity (MCP)', 'GitHub Copilot (MCP)'].includes(input.translationSource) ? input.translationSource : '',
    dictionaryHeadword: normalize(input.dictionaryHeadword).slice(0, 120),
    phonetic: normalize(input.phonetic).slice(0, 200),
    chineseContext: normalizeLines(input.chineseContext).slice(0, 4000),
    chineseLanguage: normalize(input.chineseLanguage).slice(0, 40),
    context: normalizeLines(input.context).slice(0, 2000),
    title: normalize(input.title).slice(0, 300) || 'Netflix',
    url: safeWatchUrl(input.url),
    time: Number.isFinite(input.time) ? Math.max(0, Math.floor(input.time)) : 0,
    ...(Number.isFinite(input.time) && Number.isFinite(input.cueEnd) && input.cueEnd > input.time
      ? { cueStart: Math.max(0, input.time), cueEnd: input.cueEnd } : {}),
    createdAt: new Date().toISOString()
  };
  const score = bindInlineScore(entry, input.learningScore);
  if (score) entry.learningScore = score;
  return entry;
}
export function entryKey(entry) { return [entry.kind, normalize(entry.text).toLowerCase(), entry.url, normalize(entry.context)].join('\u0000'); }
export function toCsv(entries) {
  const cell = value => {
    let s = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows = [['類型', '英文', '中文', '原句', '影片', '秒數', '網址', '收藏時間', '翻譯來源', '對應中文字幕', '中文字幕語系', 'AI 綜合評分', 'AI 常用度', 'AI 實用性', 'AI 評分理由', '評分來源', '評分模型', '評分時間', 'AI 標籤'], ...entries.map(e => [{ word: '單字', phrase: '片語', sentence: '句子' }[e.kind] || '句子', e.text, e.translation, e.context, e.title, e.time, e.url, e.createdAt, e.translationSource, e.chineseContext, e.chineseLanguage, ...['score', 'frequency', 'usefulness', 'reason', 'provider', 'model', 'analyzedAt'].map(key => currentScore(e)?.[key]), currentScore(e)?.tags.join(' / ')])];
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
