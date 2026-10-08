# 字幕口袋 · LearnEnglish

Netflix 英文學習擴充功能：點字幕查翻譯、收藏單字與句子、使用逐字稿及複習模式。目前版本為 **0.10.0**。

## 快速開始

新安裝：在 Chrome 的 `chrome://extensions` 開啟開發人員模式，載入本專案的 `extension/` 資料夾，再重新整理 Netflix。

既有安裝：舊版名稱的資料夾已移除，請改載入根目錄的 `extension/`。新路徑可能產生不同的擴充功能 ID，既有收藏不一定會自動沿用；本次未修改 Chrome 設定或收藏資料。詳見 [搬移紀錄](docs/structure.md)。

離線字典與 Netflix 中文字幕可直接使用；Google 翻譯需自行設定金鑰。使用 Codex 翻譯時，需要 Node.js 22 以上與已登入的 Codex：

```sh
cd /Users/bob/Documents/workspaces/LearnEnglish
npm ci
npm run mcp
```

啟動後輸入模型編號，或按 Enter 選 Luna（若帳號可用）。終端機會顯示連線、翻譯進度、原文與譯文摘要及耗時。使用 `CODEX_MODEL` 可略過選單，`MCP_LOG_TEXT=0` 可隱藏文字摘要；詳見 [終端機使用說明](docs/terminal.md)。

另開終端機，在同一目錄執行 `npm run mcp:token`，將權杖填入擴充功能的翻譯設定。完整步驟見 [安裝與設定](docs/setup.md)。

## 專案結構

```text
LearnEnglish/
├── extension/                  # Chrome 擴充功能與離線字典
├── bridge/                     # MCP 傳輸、工作佇列與本機權杖
├── providers/                  # AI 供應商模組
│   ├── codex/                  # 已接入
│   ├── openai/                 # OpenAI API，預留
│   ├── anthropic/              # 預留
│   ├── antigravity/            # Google OAuth 雲端翻譯
│   ├── gemini/                 # 個人 CLI 方案已停用
│   ├── copilot/                # GitHub OAuth 雲端翻譯
│   └── ollama/                 # 預留
├── test/                       # 主專案測試
├── scripts/                    # 測試輔助程式與頁面
├── docs/                       # 使用、開發與版本文件
├── prototypes/
│   └── codex-translation/      # 獨立的命令列翻譯原型
├── releases/                   # 既有 ZIP 與整理前備份
├── artifacts/                  # 測試截圖
└── .local/                     # 本機執行資料
```

## 系統單字朗讀

開發版的單字翻譯卡片與收藏庫支援「🔊 朗讀」、慢速及停止播放，使用本機英文系統語音，無需 AI 或 API 金鑰。更新後重新載入擴充功能與頁面以啟用新增的 `tts` 權限；詳見 [朗讀使用說明](docs/usage.md#系統單字朗讀)。

## 單字翻譯同步評分

使用 MCP 翻譯單字時，同一次 AI 請求取得繁中詞義、常用度、實用性、中文理由與標籤，直接顯示在翻譯卡片；按收藏一併儲存。支援 Codex、Antigravity 與 GitHub Copilot。原句不同時快取分開；字典命中仍優先使用離線詞義，可按「改用所選翻譯服務」取得同步評分。

更新 v0.10.0 時請重新載入套件、重新整理 Netflix，並重新啟動 MCP。打包指令為 `npm run package:release`，預設使用根目錄既有簽章金鑰；產物在 `releases/`。

## 收藏庫 AI 分析

收藏頁可批次分析單字的常用度、實用性與學習優先順序，附中文理由及日常／商用／俚語等多重標籤，支援標籤篩選與評分排序。更新套件後需重新啟動 MCP；詳見 [收藏庫使用說明](docs/usage.md#收藏庫-ai-評分與標籤)。

## AI 接入

已接入 **Google Antigravity、GitHub Copilot 和 Codex**，經由 MCP 使用雲端模型。新增 Antigravity／Copilot 使用帳號登入，不使用付費 API 金鑰；免費用量依帳號方案限制。先執行 `npm run ai:install`，再按 [免費雲端 AI 設定](docs/cloud-ai.md) 完成登入與啟動。Ollama、OpenAI API 與 Anthropic API 仍為預留。

供應商的連線、驗證與翻譯邏輯放在 `providers/<provider>/`；MCP 與工作佇列留在 `bridge/`。既有 Google Cloud Translation 整合仍在 `extension/translation.js`。新增供應商請依 [共用介面與接入說明](providers/README.md) 擴充。

## 開發與文件

```sh
npm test                      # 主專案本機測試
npm run test:prototype        # 命令列原型測試
```

- [免費雲端 AI／MCP 設定](docs/cloud-ai.md)
- [安裝與設定](docs/setup.md)
- [使用、翻譯資料與相容性](docs/usage.md)
- [影子跟讀：逐句循環與聽後複誦](docs/shadowing.md)
- [開發與驗證](docs/development.md)
- [Codex 翻譯速度與實測](docs/performance.md)
- [終端機模型選單與紀錄](docs/terminal.md)
- [版本紀錄](docs/changelog.md)
- [資料夾職責與搬移紀錄](docs/structure.md)
- [命令列原型](prototypes/codex-translation/README.md)

`node_modules/`、`.local/`、`artifacts/`、`releases/` 與本機環境變數檔已列入 `.gitignore`。版本號記在 `package.json`、`extension/manifest.json` 與版本紀錄，日常開發路徑不再隨版本變動。

## Chrome Web Store 上架

執行 `npm run package:store` 產生僅含擴充功能的商店 ZIP。商店文案、圖示、截圖、權限與隱私聲明，以及送審前剩餘步驟見 [上架資料](store/README.md)。公開隱私政策 URL 與商店後台送審需另外完成。
