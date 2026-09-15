# 開發與驗證

需要 Node.js 22 以上。指令均在專案根目錄執行。

```sh
npm ci
npm test
npm run test:prototype
npm run test:layout
npm run test:mcp:browser
node scripts/browser-smoke.mjs
```

`npm test` 為主專案的本機測試；`test:prototype` 測試獨立的命令列原型。瀏覽器測試需要額外可用的 Playwright 與 Chromium，可透過 `PLAYWRIGHT_MODULE` 與 `CHROME_BIN` 指定既有安裝。`browser-smoke.mjs` 直接使用 Chrome，無需 Playwright。

新增 AI 供應商請參考 [providers/README.md](../providers/README.md)。

## MCP 驗證與排錯



```sh
npm test             # 模擬模型，測試 MCP、快取與既有複習功能
npm run test:live    # 使用已登入的 Codex，實際翻譯一句英文，會使用額度
```

2026-09-15 已透過完整 MCP → Codex 流程翻譯「I've been learning English for three months.」，取得「我已經學英文三個月了。」，耗時約 12.1 秒；這是單次觀測。

本次 20 項本機測試全數通過。真實 Chromium 擴充功能測試亦通過，涵蓋設定儲存、MCP 連線、35 秒模擬翻譯等待、來源顯示、收藏、快取與 390px 設定頁寬度。未登入 Netflix 實片測試。截圖為 `artifacts/mcp-settings.png` 與 `artifacts/mcp-translation.png`。

瀏覽器測試為 `test/mcp.browser.mjs`，需 Playwright 與支援擴充功能的 Chromium。可透過 `PLAYWRIGHT_MODULE` 指定 Playwright 模組，`CHROME_BIN` 指定瀏覽器。測試在暫存設定檔使用模擬 Netflix 頁面及翻譯；本機權限只在暫存副本預先授予，真實安裝仍由使用者同意 Chrome 權限提示。

- 無法連線：確認 `npm run mcp` 正在執行、網址連接埠一致、套件已允許本機存取。
- 權杖錯誤：重新執行 `npm run mcp:token`，將內容貼到設定頁。
- Codex 未登入／額度不足：在終端機檢查 `codex login status`，依錯誤訊息處理。
- 模型切換後仍見舊譯文：清除 Codex 快取後重試。
- 受限執行環境需允許 loopback 監聽、Codex 狀態目錄及模型服務存取。

參考：[MCP HTTP 傳輸](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)、[官方 SDK 範例](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/simpleStatelessStreamableHttp.ts)、[Codex App Server](https://learn.chatgpt.com/docs/app-server)、[Chrome 背景程序生命週期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)。

