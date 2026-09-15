import { CodexClient, translate } from './codex.mjs';

async function readStdin() {
  process.stdin.setEncoding('utf8');
  let text = '';
  for await (const chunk of process.stdin) {
    text += chunk;
    if (text.length > 12_000) throw new Error('請輸入 1～12,000 字元的英文。');
  }
  return text;
}

const args = process.argv.slice(2);
if (args.includes('--help') || (!args.length && process.stdin.isTTY)) {
  console.log('用法：npm run translate -- "英文句子"\n      npm run translate -- --json "英文句子"\n      npm run check\n可用 CODEX_BIN 指定 Codex 執行檔，CODEX_MODEL 指定模型。');
} else {
  let client;
  try {
    const check = args.includes('--check');
    const json = args.includes('--json');
    const inputArgs = args.filter(arg => !['--check', '--json'].includes(arg));
    const text = check ? '' : inputArgs.length ? inputArgs.join(' ') : await readStdin();
    if (!check && (!text.trim() || text.length > 12_000)) throw new Error('請輸入 1～12,000 字元的英文。');
    client = new CodexClient();
    const onSignal = () => { client.close(); process.exit(130); };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    const info = await client.initialize();
    const { account, requiresOpenaiAuth } = await client.request('account/read', { refreshToken: false });
    if (!account && requiresOpenaiAuth) throw new Error('尚未登入 Codex，請先執行 codex login。');
    if (check) {
      console.log(JSON.stringify({ connected: true, authType: account?.type ?? null, userAgent: info.userAgent }, null, 2));
    } else {
      const started = Date.now();
      const result = await translate(client, text, { model: process.env.CODEX_MODEL });
      if (json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`\n繁中翻譯\n${result.translation}\n\n重點單字`);
        for (const v of result.vocabulary) console.log(`• ${v.term}：${v.meaning}`);
        console.log('\n文法說明');
        for (const point of result.grammar) console.log(`• ${point}`);
      }
      console.error(`\n完成，耗時 ${((Date.now() - started) / 1000).toFixed(1)} 秒。`);
    }
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  } catch (error) {
    console.error(`錯誤：${error.message}`);
    process.exitCode = 1;
  } finally {
    client?.close();
  }
}
