# 免費帳號的雲端 AI／MCP 翻譯

新增 **Google Antigravity** 與 **GitHub Copilot**。模型在雲端運行，電腦只執行官方 CLI 和 MCP 橋接，不下載本機模型，不使用付費 API 金鑰。

| 設定頁選項 | 帳號 | 啟動指令 | MCP 網址 |
| --- | --- | --- | --- |
| Antigravity | Google 個人免費帳號 | `npm run mcp:antigravity` | `http://127.0.0.1:8768/mcp` |
| GitHub Copilot | GitHub Copilot Free | `npm run mcp:copilot` | `http://127.0.0.1:8767/mcp` |
| Codex | 既有帳號與方案 | `npm run mcp` | `http://127.0.0.1:8765/mcp` |

MCP 是擴充功能與本機橋接的介面；官方 CLI 再呼叫雲端 AI。這不是 Google／GitHub 提供的遠端推論 MCP 端點。

## 安裝及登入

本次已在此工作區安裝 CLI。新電腦請先執行：

```sh
npm run ai:install                 # Copilot CLI 1.0.83
npm run ai:install:antigravity     # Antigravity CLI 1.2.3，Apple Silicon Mac
```

Antigravity 安裝器使用官方下載檔並檢查固定 SHA512，不修改 shell 設定。其他平台請依 [官方安裝說明](https://antigravity.google/docs/cli/install/) 安裝，並以 `ANTIGRAVITY_BIN` 指定執行檔。

Google 帳號：

```sh
npm run ai:login:antigravity
# 選 Google OAuth，在瀏覽器親自完成授權；登入後輸入 /quit
npm run mcp:antigravity
```

GitHub 帳號：

```sh
npm run ai:login:copilot
# 在瀏覽器親自完成授權，請使用 Copilot Free
npm run mcp:copilot
```

保持要使用的 MCP 服務執行。兩個服務可同時開啟，使用不同連接埠。

### Chrome

1. 在 `chrome://extensions` 重新載入本專案擴充功能，再重新整理 Netflix。
2. 在「字典與翻譯設定」選 Antigravity 或 GitHub Copilot，會填入對應連接埠。
3. 執行 `npm run mcp:token`，貼入權杖，按「儲存並測試連線」。
4. 點英文字幕翻譯；離線字典命中時可按「改用所選翻譯服務」。

測試連線只確認 MCP 及 CLI 可執行，不消耗模型額度。介面明確標示雲端授權與免費額度尚未驗證；實際成功翻譯一句才算端到端連線成功。

## 不使用付費 API

- Antigravity 使用 Google OAuth，清除 API keys／自訂模型端點等子程序環境變數；強制檢查 `useG1Credits: false`，禁止免費／方案額度耗盡後改用額外 AI Credits。[官方額度與 Credits 設定](https://antigravity.google/docs/cli/credits/)
- Copilot 使用帳號登入，請使用 **Copilot Free**。不讀取 BYOK API key，不開通帳單、不購買 credits。帳戶方案與額外用量設定由 GitHub 管理，橋接不會修改或驗證帳戶帳單設定。[官方方案](https://github.com/features/copilot/cli)
- 兩者仍有帳號額度與模型限制。錯誤時不自動切換服務，也不呼叫既有 Google Cloud Translation API。

## Antigravity 翻譯設定

Antigravity 目前使用官方的全域 CLI 設定位置 `~/.gemini/antigravity-cli/settings.json`。

新安裝、設定檔不存在時，登入／啟動會建立以下設定，這些限制適用該 CLI 的其他工作階段。既有設定不會被覆寫：若不符合要求，橋接會拒絕啟動翻譯並提示處理。

```json
{
  "useG1Credits": false,
  "permissions": {
    "deny": ["read_file(*)", "write_file(*)", "read_url(*)", "execute_url(*)", "command(*)", "unsandboxed(*)", "mcp(*)"]
  }
}
```

若已有設定，將上述限制合併到原設定，並移除 API key 模式的 `modelProvider`。不要把此 CLI 的全域限制當作所有程式的作業系統沙箱。官方 CLI 本身仍需儲存登入與工作記錄。

## 資料與快取

- CLI 安裝在 `.local/ai-tools/`；Copilot 設定使用 `.local/cloud-ai/copilot/`；Antigravity 的登入與記錄依官方位置及系統鑰匙圈管理。
- 翻譯從專案產生的空工作資料夾啟動，不主動附加影片網址、標題或專案檔案；只將所選英文放入提示詞。Copilot 不提供模型工具並停用專案指令與遠端匯出；Antigravity 禁止檔案、指令、網頁與 MCP 工具操作，並停用提示詞的斜線命令展開。
- CLI 可能保存本機診斷／工作資料，雲端資料處理由供應商條款管理。`.local/` 已忽略版本控制，勿分享其中資料。
- 翻譯卡片、收藏和 CSV 使用實際來源標籤。快取按服務個體及模型區分，雲端橋接重啟後不沿用舊個體快取；最多 300 筆。讀取快取前會檢查 MCP，服務需保持執行。
- 每筆 CLI 請求最多 120 秒。MCP 同時最多兩筆，佇列含執行中最多八筆。

## 模型及驗證

`ANTIGRAVITY_MODEL`／`COPILOT_MODEL` 可指定帳號目前可用的模型；未指定時沿用官方 CLI 預設。`MCP_PORT` 可改連接埠，需同步修改擴充功能網址。

`npm test` 檢查格式、錯誤、逾時、關閉程序、來源與快取，以及真實 MCP 傳輸；使用模擬 AI 回覆。`test/mcp.browser.mjs` 支援 `TEST_AI_PROVIDER=antigravity`／`copilot`，驗證設定、來源顯示、收藏、快取及窄螢幕；需 Playwright 與 Chromium。

## 為何不使用舊 Gemini CLI

本次實際 Google 登入被回報個人方案已停用。Google 已於 **2026-06-18** 停止 Gemini CLI 的個人 Google 登入方案，並指示轉移到 Antigravity；因此 Gemini CLI 未列入可用免費選項。[官方停用公告](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals)
