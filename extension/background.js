import { translate, translationSettings, saveTranslationSettings, testMcpConnection } from './translation.js';
import { makeEntry, entryKey } from './core.js';
import { McpTranslationClient } from './mcp.js';
import { ANALYSIS_BATCH_SIZE, currentScore, scoreInput, mergeScores, scoreFingerprint } from './vocabulary.js';
import { createSpeechController } from './speech.js';
const speech = createSpeechController(chrome);

let analyzing = false;
async function analyzeWords(message) {
  if (analyzing) throw new Error('另一批單字正在分析，請稍後再試。');
  if (!Array.isArray(message.ids) || !message.ids.length || message.ids.length > ANALYSIS_BATCH_SIZE
    || new Set(message.ids).size !== message.ids.length || message.ids.some(id => typeof id !== 'string')) throw new Error('評分批次格式錯誤。');
  analyzing = true;
  try {
    await writes;
    const data = await chrome.storage.local.get(['entries', 'translationProvider', 'mcpEndpoint', 'mcpToken']);
    const provider = { mcp: 'codex', antigravity: 'antigravity', copilot: 'copilot' }[data.translationProvider];
    if (!provider) throw new Error('請先在翻譯設定選擇 Codex、Antigravity 或 GitHub Copilot，才能使用 AI 評分。');
    const inputs = (data.entries || []).filter(entry => message.ids.includes(entry.id) && entry.kind === 'word'
      && (message.force === true || !currentScore(entry))).map(scoreInput);
    if (!inputs.length) return { updated: 0 };
    const client = new McpTranslationClient({ endpoint: data.mcpEndpoint, token: data.mcpToken, expectedProvider: provider });
    const result = await client.analyzeVocabulary(inputs, { onPoll: () => chrome.storage.local.get('translationProvider') });
    return await mutate(async () => {
      const { entries = [] } = await chrome.storage.local.get('entries');
      const merged = mergeScores(entries, inputs, result);
      await chrome.storage.local.set({ entries: merged.entries });
      return { updated: merged.updated };
    });
  } finally { analyzing = false; }
}


let writes = Promise.resolve();
function mutate(fn) {
  const result = writes.then(fn);
  writes = result.catch(() => {});
  return result;
}
async function handle(message, sender) {
  switch (message.type) {
    case 'speak': return speech.speak(message.text, message.rate, sender.documentId || `${sender.tab?.id}:${sender.frameId}:${sender.url}`);
    case 'stopSpeech': return speech.stop(sender.documentId || `${sender.tab?.id}:${sender.frameId}:${sender.url}`);
    case 'analyzeVocabulary': return analyzeWords(message);
    case 'translate': return translate(message.text, message.kind, message.forceOnline === true || message.forceGoogle === true, message.context);
    case 'testMcpConnection': return testMcpConnection();
    case 'translationSettings': return translationSettings();
    case 'saveTranslationSettings': return saveTranslationSettings(message);
    case 'openTranslationSettings': await chrome.tabs.create({ url: chrome.runtime.getURL('translation-settings.html') }); return {};
    case 'list': { await writes; const { entries = [] } = await chrome.storage.local.get('entries'); return { entries }; }
    case 'save': return mutate(async () => {
      const entry = makeEntry(message.entry);
      const { entries = [] } = await chrome.storage.local.get('entries');
      const existing = entries.find(item => entryKey(item) === entryKey(entry));
      if (existing) {
        let updated = false;
        // Backfill precise review timing when an older entry is saved again.
        if (entry.cueEnd && !existing.cueEnd) {
          Object.assign(existing, { cueStart: entry.cueStart, cueEnd: entry.cueEnd });
          updated = true;
        }
        if ((entry.translationSource === 'Netflix 中文字幕' || (existing.translationSource !== 'Netflix 中文字幕' && ['ECDICT', 'Google Cloud Translation', 'Codex (MCP)', 'Antigravity (MCP)', 'GitHub Copilot (MCP)'].includes(entry.translationSource))) && (existing.translationSource !== entry.translationSource || existing.translation !== entry.translation)) {
          Object.assign(existing, { translation: entry.translation, translationSource: entry.translationSource, chineseContext: entry.chineseContext, chineseLanguage: entry.chineseLanguage, dictionaryHeadword: entry.dictionaryHeadword, phonetic: entry.phonetic });
          updated = true;
        }
        if (currentScore(entry) && entry.translation === existing.translation && entry.translationSource === existing.translationSource) {
          existing.learningScore = { ...entry.learningScore, fingerprint: scoreFingerprint(existing) };
          updated = true;
        }
        if (updated) await chrome.storage.local.set({ entries });
        return { entry: existing, ...(updated ? { updated: true } : { duplicate: true }) };
      }
      await chrome.storage.local.set({ entries: [entry, ...entries] });
      return { entry };
    });
    case 'delete': return mutate(async () => {
      const { entries = [] } = await chrome.storage.local.get('entries');
      await chrome.storage.local.set({ entries: entries.filter(e => e.id !== message.id) });
      return {};
    });
    case 'openLibrary': await chrome.runtime.openOptionsPage(); return {};
    default: throw new Error('不支援的操作。');
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (['translationSettings', 'saveTranslationSettings', 'testMcpConnection', 'analyzeVocabulary'].includes(message.type) && !sender.url?.startsWith(chrome.runtime.getURL(''))) { respond({ ok: false, error: '請從套件設定頁操作。' }); return false; }
  handle(message, sender).then(result => respond({ ok: true, ...result }), error => respond({ ok: false, error: error.message || '操作失敗，請重試。' }));
  return true;
});
