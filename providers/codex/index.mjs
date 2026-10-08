import { randomUUID } from 'node:crypto';
import { vocabularyInstructions, vocabularySchema, parseVocabulary, wordTranslationInstructions, wordTranslationSchema, parseWordTranslation } from '../shared/vocabulary.mjs';
import { CodexClient, translate, generateStructured } from './codex.mjs';

export function createBackend({
  createClient = () => new CodexClient(), translateImpl = translate,
  model = process.env.CODEX_MODEL, effort = process.env.CODEX_REASONING_EFFORT || 'low',
  onEvent = () => {},
} = {}) {
  const instance = randomUUID();
  const cacheIdentity = () => JSON.stringify(['codex', instance, model || 'default', effort]);
  let connection = null;
  let stopped = false;
  const emit = event => { try { onEvent(event); } catch {} };
  async function checkAccount(client) {
    const { account, requiresOpenaiAuth } = await client.request('account/read', { refreshToken: false });
    if (!account && requiresOpenaiAuth) throw new Error('Codex 尚未登入，請在終端機執行 codex login。');
    return account;
  }
  function discard(entry) {
    if (connection === entry) connection = null;
    entry.client.close();
  }
  async function connect() {
    if (stopped) throw new Error('翻譯服務正在關閉。');
    let entry = connection;
    if (!entry) {
      entry = { client: createClient(), ready: null };
      connection = entry;
      emit({ type: 'connection.starting' });
      entry.client.once('disconnected', () => {
        if (!stopped) emit({ type: 'connection.disconnected' });
        discard(entry);
      });
      entry.ready = (async () => {
        try {
          await entry.client.initialize();
          await checkAccount(entry.client);
          if (stopped || entry.client.closed) throw new Error('Codex connection closed.');
          emit({ type: 'connection.ready' });
          return entry.client;
        } catch (error) { discard(entry); throw error; }
      })();
    }
    // Concurrent jobs share only the transport; each translation creates its own thread.
    return entry.ready;
  }
  return {
    configure(options) {
      model = options.model;
      effort = options.effort;
    },
    async listModels() {
      const client = await connect();
      const models = [];
      let cursor;
      do {
        const page = await client.request('model/list', { limit: 100, ...(cursor ? { cursor } : {}) });
        models.push(...page.data);
        cursor = page.nextCursor;
      } while (cursor);
      return models.filter(item => !item.hidden && (!item.inputModalities || item.inputModalities.includes('text')));
    },
    async status() {
      const client = await connect();
      const account = await checkAccount(client);
      return { connected: true, authType: account?.type ?? null, providerId: 'codex', provider: 'Codex (MCP)',
        model: model || 'default', cacheIdentity: cacheIdentity() };
    },
    translate: async text => translateImpl(await connect(), text, { model, effort, onEvent: emit }),
    async translateWord(text, context) {
      const identity = cacheIdentity();
      const selectedModel = model;
      const result = await generateStructured(await connect(), JSON.stringify({ text, context }), { model: selectedModel, effort, onEvent: emit,
        instructions: wordTranslationInstructions, schema: wordTranslationSchema, parse: parseWordTranslation });
      return { ...result, provider: 'Codex (MCP)', model: selectedModel || 'default', cacheIdentity: identity };
    },
    async analyzeVocabulary(entries) {
      const selectedModel = model;
      const result = await generateStructured(await connect(), JSON.stringify({ entries }), { model: selectedModel, effort, onEvent: emit,
        instructions: vocabularyInstructions, schema: vocabularySchema, parse: text => parseVocabulary(text, entries) });
      return { ...result, provider: 'Codex (MCP)', model: selectedModel || 'default' };
    },
    close() {
      stopped = true;
      if (connection) discard(connection);
    },
  };
}
