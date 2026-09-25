# Dobby

羽球社 LINE bot。TypeScript + Express，Notion 為主要資料庫。詳細文件見 [`docs/README.md`](docs/README.md) — 不要在這裡重複那邊已有的內容。

## 開發前必讀

依任務內容找對應文件，不要全讀 → [`docs/README.md`](docs/README.md) 的目錄表有「什麼情境該讀」欄位。

另外開工前先看 `TODO.md`（已知問題 / 待確認事項），避免重複踩雷。

## 專案慣例

- **新增指令**：`types/commands.ts` 加枚舉 → `command-parser.ts` 解析 → `commands/` 建 handler → `command-router.ts` 掛路由 → 更新 `docs/commands.md`（5 步驟，見 `docs/development.md`）。
- **Notion 存取一律走 repository**（`src/services/notion/*-repository.ts`），不要在 handler 裡直接呼叫 Notion SDK。
- **新增 repository 的 export 入口函式**（會被 command handler 直接呼叫的那個，不是內部 helper）要用 `withPurpose('...')`（`src/utils/request-context.ts`）包住函式本體，`/logs` 頁面的事件時間軸才看得到這次 Notion 呼叫的目的。不用改函式簽名、不用改呼叫端。理由見 `docs/adr/0005-purpose-context-layered-on-reqid.md`。
- **讀取 → 計算 → 寫回的操作用 `withMutex`**（`src/services/mutex.ts`），key 用活動日期字串（例如 `2026-05-09`），不用 Notion 頁面 ID（避免多一次查詢才能知道 lock key）。報名、請假都遵循此模式。
- **環境變數只能加在 `src/config/env.ts` 的 zod schema**，缺值要 fail-fast，不要用 `?? fallback` 掩蓋。
- Notion API 有 rate limit（~3 req/s），批次操作間要加 delay（參考 `schedulers/display-name-update.ts` 的 400ms）。
- **回覆一律用 `replyMessage`，不用 `pushMessage`**：bot 用的是 LINE 免費方案，push 訊息每月有額度上限，而指令都是透過 webhook 觸發，用 replyToken 回覆就夠了。replyToken 用盡等邊界情況也不改用 push 補發。唯一例外是既有的 `schedulers/weekly-push.ts` 週報推播。

## 開發流程

- **TODO.md 項目完成後即刪除**：確認機制已落實且有對應文件記錄，直接從 `TODO.md` 移除該項目，不要留著打勾當紀錄（歷史脈絡交給 git commit / docs 保留）。
- **新增「問題／技術債觀察」類的 TODO 項目時**（非單純打勾清單，如「手動測試追蹤」那種），要讓全新、無背景的 session 只讀這條文字就能接手，不能預設讀者知道這次對話的來龍去脈。至少包含：(1) 具體檔案路徑＋行號，不是抽象描述問題；(2) 明講是否為 bug、有無不一致／出錯風險——「現在沒事」的理由要寫清楚，若有未來風險（例如之後改動忘記同步）要具體寫出風險情境會長怎樣，不能只停在「暫時沒事」；(3) 修復方向用條件句（「如果要處理...」）而非指令句，已知陷阱要明講（例如「不能無腦合併，因為兩處吃的資料形狀不同」），避免後續 agent 誤判成急件或做出超出範圍的修改。寫完可以派一個全新、無背景的 subagent 只讀這條 TODO 文字，驗證事實是否正確、單看文字是否足以理解範圍與風險，再依回饋修文字。
- **功能等級變更完成後用 subagent 做 code review**：新增指令、新增/修改 repository 方法、修改報名/請假/容量計算等核心邏輯，都要透過 Agent 工具（或 `/code-review`）審查後才算完成；純文件修正、typo、單純補測試不在此限。
- **功能確認完成後同步文件**：修正 `docs/` 對應文件（README 目錄表 + 相關 `docs/*.md`／ADR），避免產生新的文件/程式碼落差。
- **派 subagent 前備妥背景知識**：prompt 需包含相關檔案路徑/行號、已排除的方案與原因、既有慣例限制，不要只給任務標題，避免 subagent 重新摸索或做錯方向。

## 測試

用 `createTestBot`（`src/test-utils/`）一行驅動 bot 並斷言 LINE 回覆內容 + Notion 呼叫。測試檔開頭需 mock `notion-fetch.js`、`config/line.js`、`services/mutex.js`（見 `src/test-utils/README.md`）。不要用 `npm run record-fixtures` 覆蓋 `src/test-utils/fixtures/` 下手寫的合成 fixture。

## 永遠用繁體中文回應
