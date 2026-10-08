import { createInterface } from 'node:readline/promises';
import { createBackend } from './backend.mjs';
import { getToken, tokenPath } from './token.mjs';
import { cleanLine, createTerminalLog } from './terminal-log.mjs';

export async function selectConfiguration({ models, env, interactive, ask, write }) {
  if (!models.length) throw new Error('Codex 沒有提供可用的文字模型，請檢查登入及帳號權限。');
  let model = env.CODEX_MODEL?.trim() || undefined;
  const choices = [...models].sort((a, b) => Number(b.model === 'gpt-5.6-luna') - Number(a.model === 'gpt-5.6-luna'));
  if (!model && interactive) {
    const suggested = choices.find(m => m.model === 'gpt-5.6-luna') || choices.find(m => m.isDefault) || choices[0];
    write('\n選擇字幕翻譯模型：');
    choices.forEach((item, index) => write(`  ${index + 1}. ${cleanLine(item.displayName || item.model)} (${cleanLine(item.model)})${item === suggested ? '  ← 預設' : ''}`));
    while (!model) {
      const answer = (await ask(`輸入編號或模型名稱，Enter 使用 ${cleanLine(suggested.model)}：`)).trim();
      const selected = !answer ? suggested : /^\d+$/.test(answer) ? choices[Number(answer) - 1]
        : choices.find(item => item.model === answer || item.id === answer);
      if (selected) model = selected.model;
      else write('找不到這個選項，請重新輸入清單中的編號或模型名稱。');
    }
  }
  const selected = model ? models.find(item => item.model === model || item.id === model) : null;
  if (model && !selected) throw new Error(`目前帳號的模型清單沒有 ${cleanLine(model)}，請移除 CODEX_MODEL 後從選單選擇。`);
  const supported = selected?.supportedReasoningEfforts?.map(item => item.reasoningEffort) || [];
  const effort = env.CODEX_REASONING_EFFORT?.trim() || (supported.length && !supported.includes('low')
    ? selected.defaultReasoningEffort || supported[0] : 'low');
  if (supported.length && !supported.includes(effort)) {
    throw new Error(`${selected.model} 不支援推理等級 ${cleanLine(effort)}；可選：${supported.join('、')}。`);
  }
  return { model: selected?.model, effort };
}

export async function runTerminal({
  startServer, input = process.stdin, output = process.stdout, env = process.env,
  args = process.argv.slice(2), signals = process, createBackendImpl = createBackend, readToken = getToken,
} = {}) {
  const write = line => output.write(line + '\n');
  if (args.includes('--help')) {
    write('用法：npm run mcp [-- --no-prompt]\n互動終端機啟動時選擇模型；CODEX_MODEL 可直接指定模型。\nCODEX_REASONING_EFFORT：推理等級，預設 low。\nMCP_LOG_TEXT=0：隱藏原文、譯文及可能包含原文的錯誤內容。\n無互動輸入或 --no-prompt：沿用 CODEX_MODEL／Codex 模型設定，不等待選單。');
    return;
  }
  const unknown = args.find(arg => arg !== '--no-prompt');
  if (unknown) throw new Error(`未知參數：${cleanLine(unknown)}；使用 --help 查看用法。`);
  const port = Number(env.MCP_PORT || 8765);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('MCP_PORT 需介於 1024～65535。');
  const log = createTerminalLog({ write, showText: env.MCP_LOG_TEXT !== '0' });
  const controller = new AbortController();
  const backend = createBackendImpl({ model: env.CODEX_MODEL, effort: env.CODEX_REASONING_EFFORT || 'low', onEvent: log.emit });
  let server, reader, closing;
  const stop = () => {
    if (closing) return closing;
    controller.abort();
    closing = (async () => {
      reader?.close();
      try { if (server) await server.close(); else backend.close(); }
      finally {
        signals.off('SIGINT', onSignal); signals.off('SIGTERM', onSignal);
        log.info('服務已停止。' + log.summary());
      }
    })();
    return closing;
  };
  const onSignal = () => { stop().catch(error => log.info(`關閉失敗：${cleanLine(error.message)}`)); };
  signals.once('SIGINT', onSignal); signals.once('SIGTERM', onSignal);
  try {
    write('\n字幕口袋 · Codex 翻譯服務\n');
    log.info('正在取得帳號可用模型…');
    const models = await backend.listModels();
    controller.signal.throwIfAborted();
    const interactive = !!(input.isTTY && output.isTTY && !args.includes('--no-prompt'));
    let readerClosed = false;
    const ask = async prompt => {
      controller.signal.throwIfAborted();
      if (readerClosed) throw new Error('終端機輸入已關閉；請重新啟動或使用 --no-prompt。');
      if (!reader) {
        reader = createInterface({ input, output });
        reader.once('close', () => { readerClosed = true; controller.abort(); });
      }
      return reader.question(prompt, { signal: controller.signal });
    };
    const options = await selectConfiguration({ models, env, interactive, ask, write });
    controller.signal.throwIfAborted();
    // Detach the EOF handler before closing our completed menu.
    reader?.removeAllListeners('close');
    reader?.close();
    backend.configure(options);
    log.info(`模型：${options.model || '沿用 Codex 設定（首筆翻譯時顯示實際模型）'} · 推理：${options.effort}`);
    const health = await backend.status();
    controller.signal.throwIfAborted();
    log.info(`登入方式：${health.authType || '已通過驗證'} · 同時翻譯上限：2 · 佇列容量：8`);
    const token = await readToken();
    controller.signal.throwIfAborted();
    server = await startServer({ token, port, backend, onEvent: log.emit });
    if (controller.signal.aborted) { await server.close(); return; }
    log.info(`服務已就緒：${server.endpoint}`);
    log.info(`權杖檔案：${tokenPath}（使用 npm run mcp:token 查看）`);
    log.info(`文字摘要：${env.MCP_LOG_TEXT === '0' ? '隱藏' : '顯示前 160 字；MCP_LOG_TEXT=0 可隱藏'} · Ctrl+C 停止服務`);
    log.info('等待字幕翻譯請求。擴充功能的快取或離線字典命中不會送到此服務。');
    return { close: stop, endpoint: server.endpoint };
  } catch (error) {
    const cancelled = controller.signal.aborted;
    await stop();
    if (!cancelled) {
      if (error.code === 'EADDRINUSE') throw new Error(`連接埠 ${port} 已被使用；請先停止原本的 MCP 服務，再重新啟動。`);
      throw error;
    }
  }
}
