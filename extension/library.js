import { toCsv, safeWatchUrl } from './core.js';
const $ = id => document.getElementById(id);
let entries = [], filter = 'all';
async function message(payload) {
  const response = await chrome.runtime.sendMessage(payload);
  if (!response?.ok) throw new Error(response?.error || '操作失敗，請重試。');
  return response;
}
function el(tag, text, className) {
  const node = document.createElement(tag); node.textContent = text;
  if (className) node.className = className;
  return node;
}
function render() {
  $('total').textContent = entries.length;
  const query = $('search').value.trim().toLocaleLowerCase();
  const shown = entries.filter(e => (filter === 'all' || e.kind === filter) && [e.text, e.translation, e.context, e.chineseContext, e.title].join(' ').toLocaleLowerCase().includes(query));
  $('entries').replaceChildren(); $('empty').hidden = !!shown.length;
  $('empty').querySelector('h2').textContent = entries.length ? '這裡還沒有符合的收藏。' : '第一個單字，從下一集開始。';
  $('empty').querySelector('p').textContent = entries.length ? '試試其他關鍵字或切換收藏類型。' : '在 Netflix 開啟英文字幕，點選不懂的字，翻譯後按「＋ 收藏」，它就會出現在這裡。';
  for (const entry of shown) {
    const card = el('article', '', 'entry');
    card.append(el('span', { word: 'WORD · 單字', phrase: 'PHRASE · 片語', sentence: 'SENTENCE · 句子' }[entry.kind] || 'SENTENCE · 句子', 'tag'), el('h2', entry.text), el('p', entry.translation, 'translation'), el('blockquote', entry.context));
    if (entry.translationSource !== 'Netflix 中文字幕' && entry.chineseContext) card.append(el('blockquote', 'Netflix 中文字幕：' + entry.chineseContext));
    if (entry.phonetic) card.append(el('p', [entry.dictionaryHeadword, '/' + entry.phonetic + '/'].filter(Boolean).join(' · '), 'tag'));
    if (entry.translationSource) card.append(el('p', '翻譯來源：' + entry.translationSource, 'tag'));
    const bottom = el('div', '', 'bottom');
    const time = Math.floor(entry.time / 60) + ':' + String(entry.time % 60).padStart(2, '0');
    const url = safeWatchUrl(entry.url);
    const source = el(url ? 'a' : 'span', `${entry.title} · ${time}`);
    if (url) { source.href = url; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.title = '開啟影片（時間為收藏位置，請手動跳轉）'; }
    const remove = el('button', '刪除', 'delete'); remove.setAttribute('aria-label', '刪除 ' + entry.text);
    remove.onclick = async () => {
      remove.disabled = true;
      try { await message({ type: 'delete', id: entry.id }); await refresh(); $('status').textContent = '已刪除收藏。'; }
      catch (error) { $('status').textContent = error.message; remove.disabled = false; }
    };
    bottom.append(source, remove); card.append(bottom); $('entries').append(card);
  }
  $('csv').disabled = $('json').disabled = !entries.length;
}
async function refresh() {
  try { ({ entries } = await message({ type: 'list' })); render(); }
  catch (error) { $('status').textContent = error.message; }
}
function download(format) {
  const content = format === 'csv' ? toCsv(entries) : JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries }, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `subtitle-pocket-${new Date().toISOString().slice(0, 10)}.${format}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('status').textContent = `已匯出全部 ${entries.length} 筆收藏。`;
}
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  render();
});
$('search').oninput = render;
$('csv').onclick = () => download('csv'); $('json').onclick = () => download('json');
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.entries) refresh(); });
refresh();
