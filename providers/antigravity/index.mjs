import { vocabularyPrompt, parseVocabulary, wordTranslationPrompt, parseWordTranslation } from '../shared/vocabulary.mjs';
import { randomUUID } from 'node:crypto';
import { createRunner, translationPrompt, validateTranslation } from '../shared/cloud-cli.mjs';
import { agyBin, prepareAntigravity } from './runtime.mjs';

export function createBackend({ model = process.env.ANTIGRAVITY_MODEL,
  runner = createRunner({ binary: agyBin, label: 'Antigravity', loginProvider: 'antigravity' }), prepare = prepareAntigravity } = {}) {
  const identity = `antigravity:${model || 'default'}:${randomUUID()}`;
  let executable;
  async function runPrompt(prompt) {
    const args = ['--print', prompt, '--output-format', 'json', '--disable-slash-commands', '--print-timeout', '110s'];
    if (model) args.push('--model', model);
    const output = await runner.run(args, await prepare());
    let data;
    try { data = JSON.parse(output); } catch { throw new Error('Antigravity JSON 回覆格式錯誤。'); }
    if (data.status !== 'SUCCESS' || data.error) throw new Error('Antigravity 雲端翻譯失敗，請檢查登入或免費額度。');
    return data.response;
  }
  return {
    async status() {
      const options = await prepare();
      await (executable ||= runner.run(['--help'], options).catch(error => { executable = null; throw error; }));
      return { connected: true, provider: 'Antigravity (MCP)', providerId: 'antigravity', model: model || '帳號預設',
        cacheIdentity: identity, authType: 'google-oauth', verified: false,
        message: 'CLI 已就緒；雲端登入與免費額度會在翻譯時確認。' };
    },
    async translate(text) {
      return { translation: validateTranslation(await runPrompt(translationPrompt(text)), 'Antigravity'), provider: 'Antigravity (MCP)', cacheIdentity: identity };
    },
    async translateWord(text, context) {
      return { ...parseWordTranslation(await runPrompt(wordTranslationPrompt(text, context))), provider: 'Antigravity (MCP)', model: model || 'default', cacheIdentity: identity };
    },
    async analyzeVocabulary(entries) {
      return { ...parseVocabulary(await runPrompt(vocabularyPrompt(entries)), entries), provider: 'Antigravity (MCP)', model: model || 'default' };
    },
    close: () => runner.close(),
  };
}
