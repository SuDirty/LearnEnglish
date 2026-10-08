import { validateScores, prepareInlineScore } from './vocabulary.js';
export const DEFAULT_MCP_ENDPOINT = 'http://127.0.0.1:8765/mcp';
export function validateMcpEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('MCP 網址格式不正確。'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password
    || url.pathname !== '/mcp' || url.search || url.hash) {
    throw new Error('MCP 網址需為 http://127.0.0.1:連接埠/mcp。');
  }
  return url.href;
}

// Supports the bundled stateless Streamable HTTP JSON transport and tool contract.
export class McpTranslationClient {
  constructor({ endpoint = DEFAULT_MCP_ENDPOINT, token, expectedProvider, fetchImpl = fetch }) {
    this.endpoint = validateMcpEndpoint(endpoint);
    this.expectedProvider = expectedProvider;
    if (!token) throw new Error('請先在翻譯設定填入本機 MCP 權杖。');
    // Browser fetch must retain its global receiver when called as a class method.
    Object.assign(this, { token, fetch: fetchImpl.bind(globalThis), id: 0, version: null });
  }
  async rpc(method, params, notification = false) {
    const id = notification ? undefined : ++this.id;
    let response;
    try {
      response = await this.fetch(this.endpoint, {
        method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${this.token}`,
          ...(this.version ? { 'MCP-Protocol-Version': this.version } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }),
      });
    } catch { throw new Error('無法連線本機 MCP，請確認所選 AI 的 MCP 啟動指令正在執行，並檢查套件的本機存取權限。'); }
    if (response.status === 401) throw new Error('MCP 權杖不正確，請重新貼上本機服務的權杖。');
    if (!response.ok) throw new Error(`MCP 連線失敗（HTTP ${response.status}）。`);
    if (notification && response.status === 202) return;
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('此 MCP 服務不是字幕口袋支援的 JSON 傳輸格式。');
    const data = await response.json();
    if (data.jsonrpc !== '2.0' || data.id !== id) throw new Error('MCP 回覆識別碼不符。');
    if (data.error) throw new Error(data.error.message || 'MCP 操作失敗。');
    return data.result;
  }
  async connect() {
    const info = await this.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'subtitle-pocket', version: '0.10.0' } });
    if (!['2025-11-25', '2025-06-18', '2025-03-26'].includes(info?.protocolVersion)) throw new Error('MCP 協定版本不相容。');
    this.version = info.protocolVersion;
    await this.rpc('notifications/initialized', {}, true);
    return info;
  }
  async call(name, args = {}) {
    const result = await this.rpc('tools/call', { name, arguments: args });
    if (result?.isError) throw new Error(result.content?.find(item => item.type === 'text')?.text || 'MCP 翻譯失敗。');
    if (result?.structuredContent) return result.structuredContent;
    try { return JSON.parse(result.content.find(item => item.type === 'text').text); }
    catch { throw new Error('MCP 工具回覆格式錯誤。'); }
  }
  async check() {
    await this.connect();
    const list = await this.rpc('tools/list', {});
    for (const name of ['translate', 'translation_result', 'translation_health']) {
      if (!list?.tools?.some(tool => tool.name === name)) throw new Error(`MCP 缺少必要工具：${name}`);
    }
    const health = await this.call('translation_health');
    if (health.connected !== true) throw new Error('AI 服務尚未就緒。');
    if (this.expectedProvider && (health.providerId || 'codex') !== this.expectedProvider) throw new Error('此網址的 AI 服務與選項不符，請檢查服務網址。');
    return health;
  }
  async analyzeVocabulary(entries, { interval = 500, timeoutMs = 180_000, onPoll = async () => {} } = {}) {
    await this.check();
    const list = await this.rpc('tools/list', {});
    if (!list?.tools?.some(tool => tool.name === 'analyze_vocabulary')) throw new Error('請更新並重新啟動 MCP，才能使用收藏評分。');
    const job = await this.call('analyze_vocabulary', { entries, requestId: crypto.randomUUID() });
    if (typeof job?.jobId !== 'string') throw new Error('MCP 未傳回評分工作識別碼。');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await onPoll();
      const state = await this.call('translation_result', { jobId: job.jobId });
      if (state.status === 'failed') throw new Error(state.error || 'AI 評分失敗。');
      if (state.status === 'completed') return { scores: validateScores(state.result, entries),
        provider: typeof state.result.provider === 'string' ? state.result.provider.slice(0, 100) : 'AI (MCP)',
        model: typeof state.result.model === 'string' ? state.result.model.slice(0, 100) : '' };
      if (!['queued', 'running'].includes(state.status)) throw new Error('MCP 評分工作狀態錯誤。');
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('AI 評分逾時，請稍後重試。');
  }
  async translate(text, { kind, context = '', interval = 250, timeoutMs = 180_000, onPoll = async () => {} } = {}) {
    await this.connect();
    if (kind === 'word') {
      const list = await this.rpc('tools/list', {});
      if (!list?.tools?.some(tool => tool.name === 'translate_word')) throw new Error('請更新並重新啟動 MCP，以使用翻譯同步評分。');
    }
    const job = await this.call(kind === 'word' ? 'translate_word' : 'translate', { text, ...(kind === 'word' ? { context } : {}), requestId: crypto.randomUUID() });
    if (typeof job?.jobId !== 'string') throw new Error('MCP 未傳回翻譯工作識別碼。');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await onPoll();
      const state = await this.call('translation_result', { jobId: job.jobId });
      if (state.status === 'failed') throw new Error(state.error || 'AI 翻譯失敗。');
      if (state.status === 'completed') {
        const translation = state.result?.translation;
        if (typeof translation !== 'string' || !translation.trim() || translation.length > 10000) throw new Error('MCP 未傳回可用譯文。');
        const result = { translation, provider: state.result.provider || 'Codex (MCP)', ...(state.result.cacheIdentity ? { cacheIdentity: state.result.cacheIdentity } : {}) };
        if (kind === 'word') result.learningScore = prepareInlineScore({ ...result, model: state.result.model, learningScore: state.result.learningScore }, text, context);
        return result;
      }
      if (!['queued', 'running'].includes(state.status)) throw new Error('MCP 翻譯工作狀態錯誤。');
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('AI 翻譯逾時，請稍後重試。');
  }
}
