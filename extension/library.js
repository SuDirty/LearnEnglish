import { toCsv, safeWatchUrl } from './core.js';
import { ANALYSIS_BATCH_SIZE, VOCABULARY_TAGS, currentScore, priorityLabel } from './vocabulary.js';
const $ = id => document.getElementById(id);
let entries = [], filter = 'all', tagFilter = '', analyzing = false, stopRequested = false;
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
  globalThis.SubtitlePocketSpeech.reset();
  $('total').textContent = entries.length;
  const query = $('search').value.trim().toLocaleLowerCase();
  const shown = entries.filter(e => (filter === 'all' || e.kind === filter) && (!tagFilter || currentScore(e)?.tags.includes(tagFilter)) && [e.text, e.translation, e.context, e.chineseContext, e.title].join(' ').toLocaleLowerCase().includes(query));
  $('tag-filters').replaceChildren();
  for (const tag of ['', ...VOCABULARY_TAGS]) {
    const count = tag ? entries.filter(entry => currentScore(entry)?.tags.includes(tag)).length : entries.length;
    if (tag && !count && tag !== tagFilter) continue;
    const button = el('button', tag ? `${tag} ${count}` : '全部標籤', tagFilter === tag ? 'active' : '');
    button.setAttribute('aria-pressed', String(tagFilter === tag));
    button.onclick = () => { tagFilter = tag; render(); };
    $('tag-filters').append(button);
  }
  const sort = $('sort').value;
  const metric = sort === 'priority' ? 'score' : sort;
  if (['score', 'frequency', 'usefulness'].includes(metric)) shown.sort((a, b) => (currentScore(b)?.[metric] ?? -1) - (currentScore(a)?.[metric] ?? -1));
  if (sort === 'unrated') shown.sort((a, b) => Number(b.kind === 'word' && !currentScore(b)) - Number(a.kind === 'word' && !currentScore(a)));
  const words = entries.filter(entry => entry.kind === 'word');
  const rated = words.filter(currentScore).length;
  $('analysis-summary').textContent = `${words.length} 個單字 · 已評分 ${rated} · 待分析 ${words.length - rated}`;
  $('analyze').disabled = analyzing || rated === words.length;
  $('reanalyze').disabled = analyzing || !words.length;
  $('stop-analysis').hidden = !analyzing;
  $('entries').setAttribute('aria-busy', String(analyzing));
  $('entries').replaceChildren(); $('empty').hidden = !!shown.length;
  $('empty').querySelector('h2').textContent = entries.length ? '這裡還沒有符合的收藏。' : '第一個單字，從下一集開始。';
  $('empty').querySelector('p').textContent = entries.length ? '試試其他關鍵字、收藏類型或標籤。' : '在 Netflix 開啟英文字幕，點選不懂的字，翻譯後按「＋ 收藏」，它就會出現在這裡。';
  for (const entry of shown) {
    const card = el('article', '', 'entry');
    card.append(el('span', { word: 'WORD · 單字', phrase: 'PHRASE · 片語', sentence: 'SENTENCE · 句子' }[entry.kind] || 'SENTENCE · 句子', 'tag'), el('h2', entry.text), el('p', entry.translation, 'translation'), el('blockquote', entry.context));
    if (entry.translationSource !== 'Netflix 中文字幕' && entry.chineseContext) card.append(el('blockquote', 'Netflix 中文字幕：' + entry.chineseContext));
    if (entry.phonetic) card.append(el('p', [entry.dictionaryHeadword, '/' + entry.phonetic + '/'].filter(Boolean).join(' · '), 'tag'));
    if (entry.translationSource) card.append(el('p', '翻譯來源：' + entry.translationSource, 'tag'));
    if (entry.kind === 'word') {
      const speech = el('div', '');
      card.querySelector('h2').after(speech);
      globalThis.SubtitlePocketSpeech.mount(speech, () => entry.text);
      const score = currentScore(entry);
      if (score) {
        const tags = el('div', '', 'word-tags');
        for (const tag of score.tags) {
          const button = el('button', tag);
          button.title = '篩選「' + tag + '」單字';
          button.onclick = () => { filter = 'all'; tagFilter = tag; document.querySelectorAll('[data-filter]').forEach(b => {
            b.classList.toggle('active', b.dataset.filter === 'all'); b.setAttribute('aria-pressed', String(b.dataset.filter === 'all'));
          }); render(); };
          tags.append(button);
        }
        card.append(tags);
        const rating = el('section', '', 'word-score');
        rating.setAttribute('aria-label', entry.text + ' 的學習評分');
        const heading = el('div', '', 'score-heading');
        heading.append(el('strong', `${score.score}`, 'score-number'), el('span', '/ 100'), el('span', priorityLabel(score.score), 'score-label'));
        rating.append(heading, el('p', `常用度 ${score.frequency} · 實用性 ${score.usefulness}`, 'score-metrics'), el('p', score.reason, 'score-reason'));
        const date = new Date(score.analyzedAt);
        rating.append(el('p', ['AI 估計', score.provider, score.model, Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString('zh-TW')].filter(Boolean).join(' · '), 'score-meta'));
        card.append(rating);
      } else card.append(el('p', '尚未評分 · 分析後顯示學習優先順序', 'score-pending'));
    }
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
  ({ entries } = await message({ type: 'list' })); render();
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
async function analyze(force = false) {
  if (analyzing) return;
  analyzing = true; stopRequested = false;
  $('stop-analysis').disabled = false;
  let updated = 0, completed = 0, total = 0;
  try {
    await refresh();
    const ids = entries.filter(entry => entry.kind === 'word' && (force || !currentScore(entry))).map(entry => entry.id);
    total = ids.length;
    for (let index = 0; index < ids.length && !stopRequested; index += ANALYSIS_BATCH_SIZE) {
      const batch = ids.slice(index, index + ANALYSIS_BATCH_SIZE);
      $('analysis-status').textContent = `AI 分析中：${completed} / ${total} 個單字已處理，正在分析接下來 ${batch.length} 個…`;
      const result = await message({ type: 'analyzeVocabulary', ids: batch, force });
      updated += result.updated;
      completed += batch.length;
      await refresh();
    }
    $('analysis-status').textContent = `${stopRequested ? '已停止' : '分析完成'}：已處理 ${completed} / ${total} 個，儲存 ${updated} 個單字評分。`;
    if (updated && !stopRequested) $('sort').value = 'priority';
  } catch (error) {
    $('analysis-status').textContent = `分析中斷：${error.message} 已儲存 ${updated} 個評分；${force ? '其餘既有評分仍保留，可再次全部重新評分。' : '可再次分析未評分單字。'}`;
  } finally { analyzing = false; render(); }
}
$('analyze').onclick = () => analyze();
$('reanalyze').onclick = () => analyze(true);
$('stop-analysis').onclick = () => {
  stopRequested = true; $('stop-analysis').disabled = true;
  $('analysis-status').textContent = '將在目前這批完成並儲存後停止。';
};
$('sort').onchange = render;
$('search').oninput = render;
$('csv').onclick = () => download('csv'); $('json').onclick = () => download('json');
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.entries) refresh().catch(error => { $('status').textContent = error.message; }); });
refresh().catch(error => { $('status').textContent = error.message; });
