# 資料夾職責與搬移紀錄

整理日期：2026-09-15。此次整理保留 0.9.2 版本，沒有新增其他 AI 的可用功能。

## 搬移對照

| 原位置 | 新位置 |
| --- | --- |
| 根目錄的 `src/`、`test/`、`examples/`、`package.json`、`README.md` | `prototypes/codex-translation/` |
| `subtitle-pocket-v0.8.0/` 的主程式、套件與測試截圖 | 專案根目錄對應位置 |
| `subtitle-pocket-v0.9.1/` 的重複程式 | 與主程式逐檔比對後合併；整理前原始碼另有 ZIP 備份 |
| `bridge/backend.mjs` 的 Codex 實作 | `providers/codex/index.mjs` |
| `bridge/codex.mjs`、`bridge/codex-binary.mjs` | `providers/codex/` |
| 根目錄的版本 ZIP | `releases/` |
| `subtitle-pocket-v0.8.0/.local/` | 根目錄 `.local/`，保留原權杖 |
| 主專案長篇 README | `docs/setup.md`、`usage.md`、`development.md`、`changelog.md` |

`bridge/backend.mjs` 保留為供應商選擇入口，目前直接匯出 Codex 實作。

## Chrome 載入位置

依使用者指示，已移除 `subtitle-pocket-v0.8.0/` 與 `subtitle-pocket-v0.9.1/`，不保留相容入口。

整理時 Chrome Default 設定檔記錄的路徑為 `subtitle-pocket-v0.9.1/extension`。後續請在 Chrome 的 `chrome://extensions` 載入以下新位置：

```text
/Users/bob/Documents/workspaces/LearnEnglish/extension
```

本次沒有修改 Chrome 設定或收藏資料，也沒有操作瀏覽器重新載入。新載入位置可能產生不同的擴充功能 ID，原本收藏不一定會自動轉移。若需取回舊安裝中的收藏，可暫時重建原路徑的連結，從原擴充功能匯出備份後再處理遷移；本版本尚未提供 JSON 匯入介面。

本機 MCP 的執行位置改為專案根目錄：

```sh
cd /Users/bob/Documents/workspaces/LearnEnglish
npm run mcp
```

如仍有舊服務執行，請在原終端機停止後再從新位置啟動。原權杖已保留，不需重新產生。

## 備份與產物

- `releases/` 保留原本三個版本的 ZIP，內容未改動。
- `releases/backups/before-folder-reorganization-v0.9.2.zip` 保存搬移前主程式與完整原 README；已逐檔驗證內容。它是整理備份，未包含 `node_modules/`、`.local/` 及測試產物。
- `artifacts/` 保存原有測試截圖，可由瀏覽器測試重新產生。
- `.local/` 保存本機權杖，不放入發行檔。
- 整理期間新增的 `extension.crx` 已移到 `releases/extension.crx`；簽章私鑰移到 `.local/signing/extension.pem`，保留給後續打包使用。

## 之後的整理原則

程式依職責放入 `extension/`、`bridge/` 與 `providers/`；實驗性命令列工具留在 `prototypes/`。發行檔使用版本號，主要原始碼目錄維持固定名稱。未來使用 Git 時可用 tag 記錄發行版本。
