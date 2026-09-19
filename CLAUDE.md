# Dobby

羽球社 LINE bot。TypeScript + Express，Notion 為主要資料庫。詳細文件見 [`docs/README.md`](docs/README.md) — 不要在這裡重複那邊已有的內容。

## 開發前必讀

依任務內容找對應文件，不要全讀 → [`docs/README.md`](docs/README.md) 的目錄表有「什麼情境該讀」欄位。

另外開工前先看 `TODO.md`（已知問題 / 待確認事項），避免重複踩雷。

## 專案慣例

- **新增指令**：`types/commands.ts` 加枚舉 → `command-parser.ts` 解析 → `commands/` 建 handler → `command-router.ts` 掛路由 → 更新 `docs/commands.md`（5 步驟，見 `docs/development.md`）。
- **Notion 存取一律走 repository**（`src/services/notion/*-repository.ts`），不要在 handler 裡直接呼叫 Notion SDK。
- **新增 repository 的 export 入口函式**（會被 command handler 直接呼叫的那個，不是內部 helper）要用 `withPurpose('...')`（`src/utils/request-context.ts`）包住函式本體，`/logs` 頁面的流程表模式才看得到這次 Notion 呼叫的目的。不用改函式簽名、不用改呼叫端。理由見 `docs/adr/0005-purpose-context-layered-on-reqid.md`。
- **讀取 → 計算 → 寫回的操作用 `withMutex`**（`src/services/mutex.ts`），key 用活動日期字串（例如 `2026-05-09`），不用 Notion 頁面 ID（避免多一次查詢才能知道 lock key）。報名、請假都遵循此模式。
- **環境變數只能加在 `src/config/env.ts` 的 zod schema**，缺值要 fail-fast，不要用 `?? fallback` 掩蓋。
- Notion API 有 rate limit（~3 req/s），批次操作間要加 delay（參考 `schedulers/display-name-update.ts` 的 400ms）。
- **不要用 `pushMessage`**，回覆一律用 `replyMessage`（含 replyToken 用盡等邊界情況也不要用 push 當 fallback）。唯一例外是既有的 `schedulers/weekly-push.ts` 週報推播，其他地方新增功能都不要引入新的 push 用法。

## 測試

用 `createTestBot`（`src/test-utils/`）一行驅動 bot 並斷言 LINE 回覆內容 + Notion 呼叫。測試檔開頭需 mock `notion-fetch.js`、`config/line.js`、`services/mutex.js`（見 `src/test-utils/README.md`）。不要用 `npm run record-fixtures` 覆蓋 `src/test-utils/fixtures/` 下手寫的合成 fixture。

## 已知的文件/程式碼落差（勿假設文件一定對）

- 自動回覆是**靜態 JSON**（`src/data/auto-reply.json`），不是 Notion 驅動。

## 永遠用繁體中文回應
