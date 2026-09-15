# AI 供應商模組

將 AI 供應商的連線、驗證與回覆轉換集中在此。`bridge/` 負責 MCP 協定、權杖驗證及翻譯佇列。

## 目錄與狀態

| 目錄 | 用途 | 狀態 |
| --- | --- | --- |
| `codex/` | 透過本機 Codex App Server 翻譯 | 已接入 |
| `openai/` | 直接呼叫 OpenAI API | 預留 |
| `anthropic/` | Anthropic 接入 | 預留 |
| `gemini/` | Gemini 接入 | 預留 |
| `ollama/` | Ollama 接入 | 預留 |

預留目錄只包含說明文件，沒有 SDK、金鑰或可執行的供應商實作。可依未來需求增加其他目錄。

## 現有介面

目前 `bridge/backend.mjs` 重新匯出 `codex/index.mjs` 的 `createBackend()`，預設行為維持 Codex。未加入供應商切換環境變數。

新增供應商時，在其目錄建立 `index.mjs` 並匯出 `createBackend()`，回傳以下方法：

```js
// 介面示意；不是可直接使用的供應商實作。
{
  async status() {
    // 檢查連線及驗證狀態，回傳不含憑證的結果。
    return { connected: true, authType: null };
  },
  async translate(text) {
    // 回傳 { translation: string }；可附 vocabulary 與 grammar。
    // translation 必須是非空的台灣用語繁體中文。
  },
  close() {
    // 關閉此實例持有的程序、連線，並取消尚未完成的請求。
  },
}
```

`status()` 與 `translate()` 失敗時應拋出可理解的錯誤，交由現有 MCP 錯誤流程處理。供應商自行管理請求逾時與資源清理；不得把金鑰或權杖放進回覆、日誌及版本控制。

## 後續接入步驟

1. 在 `providers/<provider>/` 實作上述介面，可參考 `codex/index.mjs`。供應商自己的 SDK、提示詞與格式轉換放在同目錄。
2. 在 `bridge/backend.mjs` 加入供應商選擇，對未實作或未知名稱明確回報錯誤。
3. 更新 MCP 的健康檢查資訊與工具描述，以及擴充功能的設定選項、來源標籤與快取識別。現在這些內容仍有 Codex 專用值，不能只換後端就視為接入完成。
4. 新增模擬供應商成功、驗證失敗、逾時與關閉請求的測試；實際 API 測試另外執行。

目前 Google Cloud Translation 由 `extension/translation.js` 直接呼叫，尚未搬進此層。`gemini/` 預留給 Gemini AI，與既有 Google 翻譯功能分開。
