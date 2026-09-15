# 字幕口袋 · LearnEnglish

Netflix 英文學習擴充功能：點字幕查翻譯、收藏單字與句子、使用逐字稿及複習模式。目前版本為 **0.9.2**。

## 快速開始

新安裝：在 Chrome 的 `chrome://extensions` 開啟開發人員模式，載入本專案的 `extension/` 資料夾，再重新整理 Netflix。

既有安裝：舊版名稱的資料夾已移除，請改載入根目錄的 `extension/`。新路徑可能產生不同的擴充功能 ID，既有收藏不一定會自動沿用；本次未修改 Chrome 設定或收藏資料。詳見 [搬移紀錄](docs/structure.md)。

離線字典與 Netflix 中文字幕可直接使用；Google 翻譯需自行設定金鑰。使用 Codex 翻譯時，需要 Node.js 22 以上與已登入的 Codex：

```sh
cd /Users/bob/Documents/workspaces/LearnEnglish
npm ci
npm run mcp
```

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
│   ├── gemini/                 # 預留
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

## AI 接入

目前本機 AI 翻譯仍使用 Codex。其他 AI 目錄僅預留位置，尚未實作，也未加入設定選項。

供應商的連線、驗證與翻譯邏輯放在 `providers/<provider>/`；MCP 與工作佇列留在 `bridge/`。既有 Google Cloud Translation 整合仍在 `extension/translation.js`。新增供應商請依 [共用介面與接入說明](providers/README.md) 擴充。

## 開發與文件

```sh
npm test                      # 主專案本機測試
npm run test:prototype        # 命令列原型測試
```

- [安裝與設定](docs/setup.md)
- [使用、翻譯資料與相容性](docs/usage.md)
- [開發與驗證](docs/development.md)
- [版本紀錄](docs/changelog.md)
- [資料夾職責與搬移紀錄](docs/structure.md)
- [命令列原型](prototypes/codex-translation/README.md)

`node_modules/`、`.local/`、`artifacts/`、`releases/` 與本機環境變數檔已列入 `.gitignore`。版本號記在 `package.json`、`extension/manifest.json` 與版本紀錄，日常開發路徑不再隨版本變動。
