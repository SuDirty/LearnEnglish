const $ = id => document.getElementById(id);
const origins = ['http://127.0.0.1/*'];
async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || '設定讀取失敗。');
  return result;
}
function showProvider() {
  $('google-settings').hidden = $('provider').value !== 'google';
  $('mcp-settings').hidden = $('provider').value === 'google';
}
async function refresh() {
  const data = await send({ type: 'translationSettings' });
  $('provider').value = data.provider;
  $('mcp-endpoint').value = data.mcpEndpoint;
  $('mcp-state').textContent = data.mcpConfigured ? '已儲存本機權杖。留空會保留原值。' : '尚未設定本機權杖。請先依下方步驟啟動服務。';
  $('mcp-cache-state').textContent = `AI 翻譯快取 ${data.mcpCached} 筆`;
  $('key-state').textContent = data.configured ? '已儲存金鑰。留空會保留原金鑰，填入新值可替換。' : '尚未設定 Google 金鑰。';
  $('monthly-limit').value = data.limit;
  $('usage').textContent = `本機 ${data.usage.month}（UTC）\n已嘗試送出 ${data.usage.characters.toLocaleString()} 字元／${data.limit.toLocaleString()} 字元上限 · ${data.usage.requests} 次請求\nGoogle 快取 ${data.cached} 筆`;
  showProvider();
}
async function update(message, { check = false } = {}) {
  try {
    // Start permission request directly from the button's user gesture.
    if (['mcp', 'antigravity', 'copilot'].includes(message.provider)) {
      if (!await chrome.permissions.request({ origins })) throw new Error('需要允許連線本機翻譯服務，才能使用雲端 AI。');
    }
    await send({ type: 'saveTranslationSettings', ...message });
    $('api-key').value = ''; $('mcp-token').value = '';
    await refresh();
    $('status').textContent = '已儲存。下一次查詢會使用新設定。';
    if (check) {
      $('test-mcp').disabled = true;
      $('status').textContent = '設定已儲存，正在檢查 MCP 服務與帳號狀態…';
      const result = await send({ type: 'testMcpConnection' });
      $('status').textContent = `連線成功！${result.provider || 'Codex (MCP)'}（${result.model || result.authType || '已就緒'}）。${result.message || ''}`;
    }
  } catch (error) { $('status').textContent = error.message; }
  finally { $('test-mcp').disabled = false; }
}
function values() {
  return { provider: $('provider').value, apiKey: $('api-key').value,
    limit: Number($('monthly-limit').value), mcpEndpoint: $('mcp-endpoint').value, mcpToken: $('mcp-token').value };
}
$('provider').onchange = () => {
  const ports = { mcp: 8765, antigravity: 8768, copilot: 8767 };
  if (ports[$('provider').value]) $('mcp-endpoint').value = `http://127.0.0.1:${ports[$('provider').value]}/mcp`;
  showProvider();
};
$('settings').onsubmit = event => { event.preventDefault(); update(values()); };
$('test-mcp').onclick = () => update(values(), { check: true });
$('clear-key').onclick = () => update({ clearKey: true });
$('clear-cache').onclick = () => update({ clearCache: true });
$('clear-mcp-token').onclick = () => update({ clearMcpToken: true });
$('clear-mcp-cache').onclick = () => update({ clearMcpCache: true });
refresh().catch(error => { $('status').textContent = error.message; });
