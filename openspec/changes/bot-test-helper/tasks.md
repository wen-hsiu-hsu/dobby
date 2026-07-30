# Tasks

## Phase 1 — Fixture 建立

- [x] 建立 `scripts/record-fixtures.ts`，打 5 個 DB 的 query API 並存成 raw JSON
- [x] 手動執行一次，產生初始 fixture 檔（`src/test-utils/fixtures/*.json`）
- [x] 處理 announcement blocks：對每個 page 呼叫 `/blocks/<pageId>/children` 並存入 `fixtures/blocks/`
- [x] 在 `package.json` 加入 `record-fixtures` script

## Phase 2 — createTestBot helper

- [x] 建立 `src/test-utils/create-test-bot.ts`
- [x] 實作 `notionPost` mock：依 path 對應 fixture，支援 override
- [x] 實作 `notionPatch` mock：no-op + `vi.fn()` spy
- [x] 實作 `replyMessage` mock：捕捉 messages 到 array
- [x] 實作 `withMutex` mock：直接執行 callback
- [x] 實作 `run(text, userContext)` 方法：組 LINE event → 呼叫 `handleMessage` → 回傳 captured messages
- [x] 建立 `src/test-utils/index.ts` 統一 export

## Phase 3 — 測試改寫

- [x] 用 `createTestBot` 改寫 `command-integration.test.ts`
- [x] 用 `createTestBot` 改寫 `registration-flow.test.ts`
- [x] 確認所有測試通過

## Phase 4 — 文件

- [x] 在 `src/test-utils/` 加 README 說明使用方式與更新 fixture 流程
