import { RUBRIC_VERSION, inlineContext, bindInlineScore } from './vocabulary.js';
import { validateText } from './core.js';
import { lookupDictionary } from './dictionary.js';
import { McpTranslationClient, DEFAULT_MCP_ENDPOINT, validateMcpEndpoint } from './mcp.js';
let queue = Promise.resolve();
const pending = new Map();
const serial = fn => { const request = queue.then(fn); queue = request.catch(() => {}); return request; };
const month = () => new Date().toISOString().slice(0, 7);
export const usageNow = value => value?.month === month() ? value : { month: month(), characters: 0, requests: 0 };
export async function translationSettings() {
  await queue;
  const data = await chrome.storage.local.get(['googleApiKey', 'googleUsage', 'googleMonthlyLimit', 'googleCache', 'translationProvider', 'mcpEndpoint', 'mcpToken', 'mcpCache']);
  return { configured: !!data.googleApiKey, usage: usageNow(data.googleUsage), limit: data.googleMonthlyLimit ?? 450000, cached: Object.keys(data.googleCache || {}).length,
    provider: data.translationProvider || 'google', mcpEndpoint: data.mcpEndpoint || DEFAULT_MCP_ENDPOINT, mcpConfigured: !!data.mcpToken, mcpCached: Object.keys(data.mcpCache || {}).length };
}
export async function saveTranslationSettings(message) {
  return serial(async () => {
    const value = {};
    if (message.provider !== undefined) {
      if (!['google', 'mcp', 'antigravity', 'copilot'].includes(message.provider)) throw new Error('不支援的翻譯來源。');
      value.translationProvider = message.provider;
    }
    if (message.mcpEndpoint !== undefined) value.mcpEndpoint = validateMcpEndpoint(message.mcpEndpoint);
    if (message.clearMcpToken) value.mcpToken = '';
    else if (typeof message.mcpToken === 'string' && message.mcpToken.trim()) {
      if (!/^[a-f0-9]{64}$/.test(message.mcpToken.trim())) throw new Error('MCP 權杖需為本機服務產生的 64 位十六進位文字。');
      value.mcpToken = message.mcpToken.trim();
    }
    const existing = await chrome.storage.local.get(['mcpEndpoint', 'mcpToken']);
    if (message.clearMcpCache || (value.mcpEndpoint !== undefined && value.mcpEndpoint !== (existing.mcpEndpoint || DEFAULT_MCP_ENDPOINT))
      || (value.mcpToken !== undefined && value.mcpToken !== existing.mcpToken)) value.mcpCache = {};
    if (message.clearKey) value.googleApiKey = '';
    else if (typeof message.apiKey === 'string' && message.apiKey.trim()) {
      const key = message.apiKey.trim();
      if (!/^[A-Za-z0-9_-]{20,200}$/.test(key)) throw new Error('API 金鑰格式不正確，請貼上 Google Cloud API 金鑰。');
      value.googleApiKey = key;
    }
    if (message.limit !== undefined) {
      if (!Number.isSafeInteger(message.limit) || message.limit < 0 || message.limit > 5000000) throw new Error('每月上限需介於 0～5,000,000 字元；0 表示停用 Google 查詢。');
      value.googleMonthlyLimit = message.limit;
    }
    if (message.clearCache) value.googleCache = {};
    await chrome.storage.local.set(value); return {};
  });
}
async function googleTranslate(text) {
  const cacheKey = 'nmt:en:zh-TW:' + text;
  if (pending.has(cacheKey)) return pending.get(cacheKey);
  const request = (async () => {
    const state = await serial(async () => {
      const data = await chrome.storage.local.get(['googleApiKey', 'googleUsage', 'googleMonthlyLimit', 'googleCache']);
      const cached = data.googleCache?.[cacheKey];
      if (typeof cached === 'string' && cached) return { cached };
      if (!data.googleApiKey) throw new Error('此內容需要 Google 翻譯。請在「翻譯設定」填入 API 金鑰，才能翻譯此內容。');
      const usage = usageNow(data.googleUsage), characters = [...text].length;
      if (usage.characters + characters > (data.googleMonthlyLimit ?? 450000)) throw new Error('已達本機設定的 Google 每月字元上限；離線字典與中文字幕仍可使用。');
      // Count before dispatch so concurrent requests and uncertain network failures cannot bypass the local cap.
      await chrome.storage.local.set({ googleUsage: { month: usage.month, characters: usage.characters + characters, requests: usage.requests + 1 } });
      return { key: data.googleApiKey };
    });
    if (state.cached) return { translation: state.cached, provider: 'Google Cloud Translation', cached: true };
    let response;
    try {
      response = await fetch('https://translation.googleapis.com/language/translate/v2', {
        method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': state.key },
        body: JSON.stringify({ q: text, source: 'en', target: 'zh-TW', format: 'text', model: 'nmt' })
      });
    } catch { throw new Error('Google 翻譯連線失敗或逾時，請檢查網路後重試。'); }
    if ([400, 401, 403].includes(response.status)) throw new Error('Google 拒絕查詢，請確認 API 金鑰、Cloud Translation API、帳單與金鑰限制設定。');
    if (response.status === 429) throw new Error('Google 查詢額度或速率已達上限，請稍後重試或檢查 Google Cloud 配額。');
    if (!response.ok) throw new Error('Google 翻譯暫時無法使用，請稍後重試。');
    let data;
    try { data = await response.json(); } catch { throw new Error('Google 翻譯回應格式錯誤，請重試。'); }
    const translation = data?.data?.translations?.[0]?.translatedText;
    if (typeof translation !== 'string' || !translation.trim() || translation.length > 10000) throw new Error('Google 未傳回可用的譯文，請重試。');
    await serial(async () => {
      const { googleCache = {} } = await chrome.storage.local.get('googleCache');
      googleCache[cacheKey] = translation;
      while (Object.keys(googleCache).length > 300) delete googleCache[Object.keys(googleCache)[0]];
      await chrome.storage.local.set({ googleCache });
    });
    return { translation, provider: 'Google Cloud Translation' };
  })();
  pending.set(cacheKey, request);
  try { return await request; } finally { pending.delete(cacheKey); }
}
export async function testMcpConnection() {
  await queue;
  const data = await chrome.storage.local.get(['mcpEndpoint', 'mcpToken', 'translationProvider']);
  return new McpTranslationClient({ endpoint: data.mcpEndpoint, token: data.mcpToken, expectedProvider: expectedProvider(data.translationProvider) }).check();
}
const expectedProvider = provider => ({ mcp: 'codex', antigravity: 'antigravity', copilot: 'copilot' })[provider];
async function mcpTranslate(text, kind, sourceContext) {
  const context = kind === 'word' ? inlineContext(sourceContext) : '';
  const taskKey = kind === 'word' ? ['word-score', RUBRIC_VERSION, context] : [];
  const settings = await chrome.storage.local.get(['mcpEndpoint', 'mcpToken', 'translationProvider']);
  const endpoint = settings.mcpEndpoint || DEFAULT_MCP_ENDPOINT;
  const pendingKey = JSON.stringify(['mcp', endpoint, settings.translationProvider, text, taskKey, settings.mcpToken]);
  if (pending.has(pendingKey)) return pending.get(pendingKey);
  const request = (async () => {
    const client = new McpTranslationClient({ endpoint, token: settings.mcpToken, expectedProvider: expectedProvider(settings.translationProvider) });
    const health = await client.check();
    // Resolve provider/model identity before reading cache: a port can be reused by another AI.
    const identity = health.cacheIdentity || health.provider || 'Codex (MCP)';
    const keyFor = id => JSON.stringify([endpoint, id, 'en', 'zh-TW', text, ...taskKey]);
    const key = keyFor(identity);
    const { mcpCache = {} } = await chrome.storage.local.get('mcpCache');
    const cached = mcpCache[key];
    if (cached?.translation && typeof cached.translation === 'string' && cached.provider
      && (kind !== 'word' || bindInlineScore({ id: 'cache', kind, text, context, translation: cached.translation, translationSource: cached.provider }, cached.learningScore))) return { ...cached, cached: true };
    const result = await client.translate(text, { kind, context,
      onPoll: () => chrome.storage.local.get('translationProvider'),
    });
    await serial(async () => {
      const current = await chrome.storage.local.get(['mcpCache', 'mcpEndpoint', 'mcpToken', 'translationProvider']);
      if ((current.mcpEndpoint || DEFAULT_MCP_ENDPOINT) !== endpoint || current.mcpToken !== settings.mcpToken
        || current.translationProvider !== settings.translationProvider) return;
      const cache = current.mcpCache || {};
      cache[keyFor(result.cacheIdentity || identity)] = result;
      while (Object.keys(cache).length > 300) delete cache[Object.keys(cache)[0]];
      await chrome.storage.local.set({ mcpCache: cache });
    });
    return result;
  })();
  pending.set(pendingKey, request);
  try { return await request; } finally { pending.delete(pendingKey); }
}

export async function translate(value, kind, forceOnline = false, context = '') {
  const text = validateText(value);
  if (!forceOnline && ['word', 'phrase'].includes(kind)) {
    const entry = await lookupDictionary(text);
    if (entry) return entry;
  }
  await queue;
  const { translationProvider = 'google' } = await chrome.storage.local.get('translationProvider');
  if (translationProvider === 'google') return googleTranslate(text);
  if (expectedProvider(translationProvider)) return mcpTranslate(text, kind, context);
  throw new Error('不支援的翻譯來源，請重新儲存翻譯設定。');
}
