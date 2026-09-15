# 安裝與設定

以下指令均在專案根目錄執行。舊版本名稱的資料夾已移除；Chrome 若仍載入舊路徑，請先參考 [搬移紀錄](structure.md)，改載入根目錄的 `extension/`。

## 安裝擴充功能（不用編譯）

1. 在 Chrome 網址列輸入 `chrome://extensions`。
2. 打開右上角的「開發人員模式」。
3. 按「載入未封裝項目」，選擇本專案裡的 **`extension` 資料夾**，不是整個專案。
4. 開啟或重新整理 Netflix，播放影片；套件會嘗試自動取得中英文字幕並還原原設定。
5. 建議把「字幕口袋」釘選到 Chrome 工具列。

下載 ZIP 的使用者請先解壓縮，再載入其中的 `extension` 資料夾。這是本機開發版本，尚未上架 Chrome 線上應用程式商店。

## Codex／MCP 翻譯

現在可在「字典／翻譯設定」選擇 **Codex（本機 MCP）**。擴充功能經由本機 MCP 橋接呼叫 Codex App Server；使用現有 Codex 登入，不需另填 OpenAI API key。

### 啟動與設定

需要 Node.js 22 以上及可執行的 Codex CLI。先在終端機執行：

```sh
# 先切換到包含 package.json 的專案根目錄
npm ci
codex login   # 若已登入可略過
npm run mcp
```

保持服務執行，另開終端機在同一個資料夾執行 `npm run mcp:token`，複製產生的權杖。

1. 在 `chrome://extensions` **重新載入既有套件**，再重新整理 Netflix，保留原有收藏。
2. 開啟「字典／翻譯設定」，選擇 **Codex（本機 MCP）**。
3. 網址預設為 `http://127.0.0.1:8765/mcp`；貼上權杖。
4. 按「儲存並測試連線」，允許 Chrome 存取本機服務。看到「連線成功」即可使用。
5. 點字幕查翻譯。字典命中時可按「改用所選翻譯服務」比較 Codex 譯文。

此工作區沿用原有套件；重新下載或移到別台電腦請先執行 `npm ci`。只有選用 Codex 時需要本機服務，原有 Google 翻譯不需要 Node.js。

### 行為與資料

- 保留離線字典、Netflix 中文字幕的優先順序；需要線上翻譯時使用所選服務。既有使用者預設仍為 Google。
- Codex 卡片及收藏來源標示 `Codex (MCP)`；獨立保留最多 300 筆本機翻譯快取，可在設定頁清除。
- 僅傳送所選英文，不傳送影片名稱、網址或另外的原句上下文。不會自動翻譯整份逐字稿。
- MCP 失敗時顯示錯誤，不會自動改用 Google。Codex 用量依登入帳號計算，不受 Google 的本機字元上限控制。
- 本機 MCP 僅監聽 `127.0.0.1`，需 Bearer 權杖；拒絕一般網站 Origin 和不符的 Host。權杖在 `.local/mcp-token`（僅目前使用者可讀寫），勿放入分享檔案；套件另存於 `chrome.storage.local`，不包含於收藏匯出。
- 服務不保存字幕檔；翻譯工作與結果在記憶體中保留最多十分鐘。Codex 使用暫存對話，但這不等同於模型服務端零資料保留。
- 本機服務需保持執行。單次翻譯可能需要數十秒；擴充功能透過短請求輪詢結果。最多同時處理兩筆，佇列含執行中最多八筆。
- 改模型可在啟動時指定 `CODEX_MODEL`，未指定時使用 Codex 設定。改連接埠可用 `MCP_PORT`，並同步修改套件設定網址。`CODEX_BIN` 可指定 Codex 執行檔。

### MCP 相容範圍

本版使用官方 `@modelcontextprotocol/sdk`，提供 **Streamable HTTP、無 session、JSON 回覆**；套件用 MCP 初始化、工具探索和工具呼叫連接。支援的協定修訂為 2025-11-25、2025-06-18、2025-03-26。此版不直接啟動 stdio MCP，也不是可接任意第三方工具的通用 MCP 客戶端。

| 工具 | 參數 | 回覆 |
| --- | --- | --- |
| `translation_health` | 無 | Codex 連線與登入類型，不呼叫模型 |
| `translate` | `text`（1～2,000 字元）、`requestId`（UUID） | `jobId` 與初始狀態 |
| `translation_result` | `jobId` | queued／running／completed／failed；完成時有 `result.translation` |

同一 `requestId` 與相同文字在工作保留期間不會重複呼叫模型。其他支援相同 HTTP 傳輸的 MCP 客戶端也能使用這些工具；已用官方 SDK 客戶端驗證。App Server 使用另一套 JSON-RPC 協定，由 `bridge/` 負責轉接。**Codex App Server 仍為實驗性功能，官方不支援正式生產用途。**

程式位置：`extension/mcp.js` 是套件 MCP 客戶端，`extension/translation.js` 管理來源選擇與快取，`bridge/server.mjs` 提供 MCP 工具，`providers/codex/codex.mjs` 連接 App Server。

