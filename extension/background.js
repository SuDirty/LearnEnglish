import { translate, translationSettings, saveTranslationSettings, testMcpConnection } from './translation.js';
import { makeEntry, entryKey } from './core.js';

let writes = Promise.resolve();
function mutate(fn) {
  const result = writes.then(fn);
  writes = result.catch(() => {});
  return result;
}
async function handle(message) {
  switch (message.type) {
    case 'translate': return translate(message.text, message.kind, message.forceOnline === true || message.forceGoogle === true);
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
        // Backfill precise review timing when an older entry is saved again.
        if (entry.cueEnd && !existing.cueEnd) {
          Object.assign(existing, { cueStart: entry.cueStart, cueEnd: entry.cueEnd });
          await chrome.storage.local.set({ entries });
        }
        if ((entry.translationSource === 'Netflix 中文字幕' || (existing.translationSource !== 'Netflix 中文字幕' && ['ECDICT', 'Google Cloud Translation', 'Codex (MCP)'].includes(entry.translationSource))) && (existing.translationSource !== entry.translationSource || existing.translation !== entry.translation)) {
          Object.assign(existing, { translation: entry.translation, translationSource: entry.translationSource, chineseContext: entry.chineseContext, chineseLanguage: entry.chineseLanguage, dictionaryHeadword: entry.dictionaryHeadword, phonetic: entry.phonetic });
          await chrome.storage.local.set({ entries });
          return { entry: existing, updated: true };
        }
        return { entry: existing, duplicate: true };
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
  if (['translationSettings', 'saveTranslationSettings', 'testMcpConnection'].includes(message.type) && !sender.url?.startsWith(chrome.runtime.getURL(''))) { respond({ ok: false, error: '請從套件設定頁操作。' }); return false; }
  handle(message).then(result => respond({ ok: true, ...result }), error => respond({ ok: false, error: error.message || '操作失敗，請重試。' }));
  return true;
});
