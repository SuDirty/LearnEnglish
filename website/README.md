# 字幕口袋官網

官網：<https://sudirty.github.io/LearnEnglish/>

## 預覽

在此目錄執行 `python3 -m http.server 4173 --directory dist`，再開啟 `http://localhost:4173`。

## 內容

- `dist/index.html`：介紹、互動示意、安裝教學與常見問題。
- `dist/styles.css`：響應式版面與視覺樣式。
- `dist/site.js`：查字／收藏示意和安裝網址複製；示意資料僅存在當頁記憶體。

純 HTML/CSS/JavaScript，無需安裝依賴或編譯。官網原始碼與擴充功能保存在同一個 GitHub 儲存庫。

## 發布

GitHub Pages 使用 GitHub Actions，設定於 `../.github/workflows/pages.yml`。將 `website/dist/` 或工作流程的變更推送到 `main` 後，會自動發布；亦可在 Actions 頁手動執行「Deploy website to GitHub Pages」。只會上傳 `website/dist/` 的公開靜態檔案。

## 維護

發布擴充功能新版時，同步修改安裝區版本號、功能介紹及 FAQ。GitHub ZIP 下載連結指向 main 分支。官網沒有追蹤碼、外部字型、表單或網站帳號系統。
