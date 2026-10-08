# Chrome Web Store 上架資料

目前狀態：本機素材與打包流程已備妥；尚未上傳或送審。工作區另有跟讀功能持續開發，正式送審前需等待修改完成、重新測試並打包。

## 上傳檔案

執行 `node scripts/package-store.mjs`。輸出為 `releases/chrome-web-store/subtitle-pocket-v0.10.0-chrome-web-store.zip`。

此 ZIP 最外層為 manifest.json，只含 extension 的執行檔、圖示、字典與授權。不要上傳根目錄的 CRX，或包含 bridge、providers 等檔案的完整專案發行 ZIP。打包程式檢查版本、Manifest 資源、圖示尺寸、ZIP 檔案清單與每個檔案的內容，並產生 SHA-256。

## 商店素材

- 名稱、簡短／完整說明：[listing.zh-TW.md](listing.zh-TW.md)。
- 單一用途、權限理由、資料揭露：[privacy-disclosures.md](privacy-disclosures.md)。
- 隱私政策：[../extension/privacy.html](../extension/privacy.html)；仍需公開 HTTPS URL。
- 商店圖示：`assets/store-icon-128.png`。
- 小型宣傳圖：`assets/promo-small-440x280.png`。
- 截圖：`assets/screenshot-library-1280x800.png`、`assets/screenshot-collections-1280x800.png`。由實際收藏庫 HTML/CSS/JS 搭配標示為「教學示範資料」的本機 fixture 產生，不是 Netflix 實片畫面或實際 AI 回覆。

圖示沿用既有綠色 S↗ 品牌，來源為 SVG。若需重建：安裝或指定 Sharp 模組，執行 `SHARP_MODULE=/absolute/path/to/sharp-entry node scripts/generate-store-assets.mjs`。截圖 fixture：`node scripts/preview-store.mjs`；僅供本機素材預覽，不在商店 ZIP 內。

## 送審前剩餘步驟

1. 完成 Google 重新登入／身分驗證。若尚未註冊開發者帳號，依後台完成一次性註冊費與所需帳戶設定。
2. 公開託管隱私政策，確認任何人無需登入即可開啟；設定開發者聯絡及支援資料。選用 AI 橋接的下載／安裝說明也須可供使用者取得。
3. 在開發者後台新增項目、上傳商店 ZIP、填入文案與素材、完成隱私和發行範圍欄位。
4. 以商店套件在實際 Netflix 影片確認字幕取得、查詞、收藏、逐字稿跳轉及複習。現有測試沒有替代這項實片驗證。
5. 依後台提示提交審查，保留項目 ID、版本與送審結果；審查結果由 Google 決定。

## 審查人員測試說明草稿

需要可觀看 Netflix 的測試帳號及有英文字幕的影片。安裝後重新整理 Netflix，選擇英文字幕，點一個常見英文單字（例如 hello）檢查離線字典，再按收藏並從工具列開啟收藏庫。離線字典和已有中文字幕無需 Google API 或 AI 帳號。沒有字幕的影片不適合測試。

Google 翻譯需自行設定有效 Cloud Translation API 金鑰。AI 翻譯／評分是選用進階功能，需另外安裝及啟動本機 Node.js 橋接與供應商 CLI；啟動步驟見專案 docs/cloud-ai.md 與 docs/setup.md。上架前須將這些步驟的公開網址補進商店支援頁。不得把個人 Netflix 密碼或個人 API 金鑰寫入公開商店說明。

## 驗證紀錄（2026-09-15）

- npm test：73 項通過（包含模擬供應商的本機 MCP 整合）。
- 打包內容逐檔一致、沒有本機金鑰／帳號資料、Manifest V3。
- 圖示 16／32／48／128px，宣傳圖 440×280px，截圖 1280×800px。
- Google 商店後台停在重新驗證身分頁；尚未取得項目 ID 或審查狀態。
- 本輪沒有登入 Netflix 實片驗證，也沒有呼叫真實付費翻譯服務。

官方參考：[準備擴充功能](https://developer.chrome.com/docs/webstore/prepare)、[商店圖片規格](https://developer.chrome.com/docs/webstore/images)、[開發者註冊](https://developer.chrome.com/docs/webstore/register)、[發布流程](https://developer.chrome.com/docs/webstore/publish)。
