# AI 供應商模組

將 AI 供應商的連線、驗證與回覆轉換集中在此。`bridge/` 負責 MCP 協定、權杖驗證及翻譯佇列。

## 目錄與狀態

| 目錄 | 用途 | 狀態 |
| --- | --- | --- |
| `codex/` | 透過本機 Codex App Server 翻譯 | 已接入 |
| `openai/` | 直接呼叫 OpenAI API | 預留 |
| `anthropic/` | Anthropic 接入 | 預留 |
| `antigravity/` | 官方 Antigravity CLI，Google OAuth 雲端翻譯 | 已接入 |
| `gemini/` | 舊 Gemini CLI 個人方案已停用 | 不提供免費選項 |
| `copilot/` | 官方 Copilot CLI，GitHub OAuth 雲端翻譯 | 已接入 |
| `ollama/` | Ollama 接入 | 預留 |

預留目錄只包含說明文件，沒有 SDK、金鑰或可執行的供應商實作。可依未來需求增加其他目錄。

Antigravity／Copilot 共用 `shared/cloud-cli.mjs` 的程序管理與專用環境，透過 `bridge/cloud-server.mjs` 啟動；不影響 Codex 的互動模型選單。詳細指令見 [雲端 AI 設定](../docs/cloud-ai.md)。

## 現有介面

目前 `bridge/backend.mjs` 重新匯出 `codex/index.mjs` 的 `createBackend()`，預設行為維持 Codex。未加入供應商切換環境變數。

Codex 後端重用已初始化的 App Server 程序，每句仍建立獨立暫存對話並在結束時取消訂閱。翻譯預設採 `low` 推理，僅回傳譯文；可用 `CODEX_REASONING_EFFORT` 調整。詳見 [效能與驗證](../docs/performance.md)。

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
  async translateWord(text, context) {
    // 同一次模型請求回傳 { translation, learningScore: { frequency, usefulness, tags, reason }, provider, model }。
    // 使用 shared/vocabulary.mjs 的 wordTranslationSchema 與 parseWordTranslation。
  },
  async analyzeVocabulary(entries) {
    // entries: [{ id, text, translation, context }]，每批 1–10 字。
    // 回傳 { scores: [{ id, frequency, usefulness, tags, reason }], provider, model }。
    // 使用 shared/vocabulary.mjs 的共同評分規則、JSON schema 與結果驗證。
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
3. 更新設定選項，回傳 `providerId`、`provider` 與 `cacheIdentity`；翻譯結果亦應回傳 `provider` 與 `cacheIdentity`。MCP 和快取會沿用實際來源。
4. 新增模擬供應商成功、驗證失敗、逾時與關閉請求的測試；實際 API 測試另外執行。

目前 Google Cloud Translation 由 `extension/translation.js` 直接呼叫，尚未搬進此層。Google 雲端 AI 改用 `antigravity/`，與既有 Google 翻譯功能分開。

收藏分析經由 `analyze_vocabulary` MCP 工具派送，與翻譯共用有界佇列，使用 `translation_result` 輪詢。未實作 `analyzeVocabulary()` 的供應商會明確回報不支援；不會切換其他服務。

`translate_word` 工具將單字及最多 500 字元原句交給 `translateWord()`，與一般翻譯使用相同佇列／結果輪詢，但快取按用途與上下文隔離。
