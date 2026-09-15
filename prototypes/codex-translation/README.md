# LearnEnglish · Codex 翻譯原型

透過本機 `codex app-server`，將英文翻成台灣用語的繁體中文，附上重點單字及文法說明。使用 Node.js 內建模組，不需安裝 npm 套件。

## 執行

需求：Node.js 22 以上、可執行的 Codex CLI，以及已登入的 Codex 帳號。

```sh
cd /Users/bob/Documents/workspaces/LearnEnglish/prototypes/codex-translation

# 若尚未登入
codex login

# 檢查 App Server 連線與登入類型
npm run check

# 翻譯並顯示單字及文法
npm run translate -- "I've been learning English for three months."

# JSON 輸出，方便後續介面串接
node src/cli.mjs --json "I look forward to hearing from you."

# 從 stdin 讀取內容
printf '%s' 'Practice makes perfect.' | node src/cli.mjs

# 不會呼叫模型的本機測試
npm test
```

`CODEX_BIN` 可指定執行檔完整路徑；`CODEX_MODEL` 可指定帳號可用的模型。未指定模型時沿用 Codex 設定。純 JSON 管線請使用 `node src/cli.mjs --json`，避免 npm 自己的執行訊息混入 stdout；耗時與錯誤訊息寫入 stderr。

## 串接流程

1. 啟動 `codex app-server --listen stdio://`。
2. 傳送 `initialize`，等待成功後送出 `initialized`。
3. 透過 `account/read` 檢查登入狀態，不輸出帳號個資或憑證。
4. 以 `thread/start` 建立暫存對話，設定唯讀沙箱及翻譯指令。
5. 使用 `turn/start` 傳入英文與 `outputSchema`。
6. 收集 `item/completed` 的文字，在 `turn/completed` 成功時驗證 JSON。
7. 結束 App Server 子程序。

每次翻譯是獨立對話；`ephemeral` 不建立持久對話紀錄，但不代表服務端零資料保留。翻譯內容會送到所設定的 Codex 模型服務。此原型指示模型不呼叫工具，且不提供核准或工具執行功能；唯讀沙箱本身並不等同於完全停用所有工具。

主要程式：`src/codex.mjs` 是通訊與翻譯模組，`src/cli.mjs` 是命令列入口。每次最多接受 12,000 字元；RPC 預設等待 30 秒，翻譯等待最多 120 秒。

## 已驗證

2026-09-15，以本機 `codex-cli 0.154.0-alpha.6.2`、Node.js `v26.5.0`、ChatGPT 登入測試成功。

輸入：

> I've been learning English for three months, but I still find it hard to speak confidently.

實際翻譯：

> 我已經學英文三個月了，但我還是覺得很難有自信地開口說英文。

同次回覆包含三個重點詞語，以及現在完成進行式、形式受詞與轉折連接詞的說明。從建立翻譯對話到取得回覆約 14.5 秒；這是單次觀測，並非效能保證。完整範例在 `examples/translation.json`。

六項本機測試涵蓋事件先於 RPC 回覆、空的完成事件項目、最終回覆選取、不同對話事件、失敗／斷線、逾時中斷、輸入與輸出驗證、RPC 回覆配對及程序退出。

## 限制

- 這是命令列原型，尚未加入網頁介面。
- App Server 需要存取 Codex 狀態目錄與模型服務。在限制檔案或網路權限的執行環境中，需要允許這些存取；不需修改全域 Codex 設定。
- 使用現有 Codex 登入與相應用量限制；這次測試使用 ChatGPT 登入，未另設 API key。
- App Server 目前屬實驗性功能，官方不支援正式生產用途；升級 Codex 後應重跑連線及翻譯測試。

官方文件：[Codex App Server](https://learn.chatgpt.com/docs/app-server)。
