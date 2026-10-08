import { vocabularyPrompt, parseVocabulary, wordTranslationPrompt, parseWordTranslation } from '../shared/vocabulary.mjs';
import { randomUUID } from 'node:crypto';
import { cliBin, createRunner, prepareCloud, translationPrompt, validateTranslation } from '../shared/cloud-cli.mjs';

export function createBackend({ model = process.env.COPILOT_MODEL,
  binary = cliBin('copilot'), runner = createRunner({ binary, label: 'Copilot' }), prepare = () => prepareCloud('copilot') } = {}) {
  let preparation;
  const options = () => preparation ||= prepare();
  const identity = `copilot:${model || 'default'}:${randomUUID()}`;
  async function runPrompt(prompt) {
    const args = ['--prompt', prompt, '--silent', '--output-format', 'text', '--no-color',
      '--available-tools=', '--disable-builtin-mcps', '--no-custom-instructions', '--no-auto-update',
      '--no-ask-user', '--no-remote', '--no-remote-export', '--deny-tool', 'shell,write,read,url,memory'];
    if (model) args.push('--model', model);
    const output = await runner.run(args, await options());
    return output;
  }
  return {
    async status() {
      await runner.run(['--version'], await options());
      return { connected: true, provider: 'GitHub Copilot (MCP)', providerId: 'copilot', model: model || '帳號預設',
        cacheIdentity: identity, authType: 'github-oauth', verified: false,
        message: 'CLI 已就緒；請先執行 npm run ai:login:copilot。雲端授權與免費額度會在翻譯時確認。' };
    },
    async translate(text) {
      return { translation: validateTranslation(await runPrompt(translationPrompt(text)), 'Copilot'), provider: 'GitHub Copilot (MCP)', cacheIdentity: identity };
    },
    async translateWord(text, context) {
      return { ...parseWordTranslation(await runPrompt(wordTranslationPrompt(text, context))), provider: 'GitHub Copilot (MCP)', model: model || 'default', cacheIdentity: identity };
    },
    async analyzeVocabulary(entries) {
      return { ...parseVocabulary(await runPrompt(vocabularyPrompt(entries)), entries), provider: 'GitHub Copilot (MCP)', model: model || 'default' };
    },
    close: () => runner.close(),
  };
}
