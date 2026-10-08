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

## 系統朗讀驗證

`npm test` 包含語音選擇、正常／慢速、取消競態、跨頁擁有權、缺少語音、播放失敗及逾時測試。`npm run test:speech:browser` 在暫存 Chrome 設定檔驗證收藏庫與模擬 Netflix 頁面的按鈕、切換、停止、錯誤提示和 390px 版面；有本機英文語音時也會透過收藏庫實際播放一個單字並等待完成事件。其餘異常情境只替換語音引擎，沿用真實擴充功能訊息流程。

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


## 收藏庫分析驗證

`npm test` 包含評分與標籤驗證、資料合併保護、CSV 匯出、Codex 結構化回覆與兩個 CLI 供應商的 MCP 測試。

`npm run test:vocabulary:browser` 使用暫存 Chrome 設定檔與模擬 AI，驗證未設定 AI、分批分析、部分失敗後接續、排序、多標籤篩選、搜尋、儲存、停止、刪除、匯出、文字安全及 390px 排版。與其他瀏覽器測試相同，可指定 `PLAYWRIGHT_MODULE` 與 `CHROME_BIN`。截圖位於 `artifacts/vocabulary-*.png`。這些測試不會使用真實帳號額度，也不驗證模型實際評分品質。

## v0.10.0 同步評分與打包

`npm test` 的 66 項測試涵蓋單次模型翻譯＋評分、上下文快取隔離、可攜評分轉為收藏資料、過期上下文拒絕，以及舊 MCP 更新提示。`npm run test:mcp:browser` 加入實際擴充功能的離線詞義 → MCP 同步評分 → 收藏／重複收藏 → 快取 → 收藏庫顯示流程；AI 使用模擬回覆。`npm run test:vocabulary:browser` 持續驗證批次分析與篩選。

`npm run package:release` 產生版本化 CRX、完整 ZIP 及 SHA-256 校驗檔。使用根目錄 `extension.pem`，並驗證它的公開金鑰符合既有根目錄 `extension.crx`；可用 `EXTENSION_SIGNING_KEY` 指定相同身分的金鑰，用 `CHROME_BIN` 指定 Chrome。腳本會比對 CRX 與 ZIP 的封裝內容，保留前一份 CRX 到 `releases/backups/`，再更新根目錄 `extension.crx`。私鑰、本機權杖與帳號資料不包含在發行包。
