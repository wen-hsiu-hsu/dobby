## Why

Dobby LINE Bot 目前架設在 n8n（4 個 workflows、92+ 節點），維護困難、難以版控、無法本地測試，且依賴 n8n 平台的持續運行。遷移至 TypeScript + Express 可帶來型別安全、可測試性、版本控制與更低的運營成本。

## What Changes

- **新增** TypeScript + Express 獨立伺服器，取代 n8n 作為 LINE Bot runtime
- **新增** 所有指令邏輯以 TypeScript 函式實作（@Dobby 11 種指令）
- **新增** In-process mutex 取代 n8n 的序列執行保證（報名/請假並發保護）
- **新增** node-cron 排程取代 n8n Schedule Trigger（週日 09:00 推播）
- **新增** `src/data/auto-reply.json` hardcode 取代 n8n Data Table（494 筆關鍵字回覆）
- **保留** Notion 作為資料庫（Repository 層 wrapping `@notionhq/client`）
- **保留** 雙 bot 架構：Dobby（正式群組）、球來就打（排程測試用）
- **移除** n8n workflows 依賴（遷移完成後停用）
- **BREAKING** Bot webhook URL 從 n8n URL 切換至新 Express server URL

## Capabilities

### New Capabilities

- `webhook-handler`: LINE webhook 接收、signature 驗證、事件分派（200 立即回應 + fire-and-forget）
- `command-system`: @Dobby 指令解析與路由（11 種指令，含 admin-only `next`）
- `registration`: 零打報名/取消報名邏輯，含 mutex 並發保護與容量計算
- `leave-management`: 季租成員請假/銷假邏輯，含 idempotency 檢查
- `auto-reply`: 關鍵字匹配自動回覆（admin skip，case-sensitive includes，JSON 資料源）
- `notion-repositories`: Notion 6 個 DB 的 Repository 層（USERS、人員清單、行事曆、季租、公告、TEXT_REPLY 移除）
- `scheduled-push`: 每週日 09:00 (Asia/Taipei) 推播下次打球資訊至 Dobby 正式群組
- `display-name-updater`: 批次更新使用者 LINE 顯示名稱至 Notion USERS（每週一 04:00，雙 bot fallback）
- `welcome-message`: join/memberJoined 事件歡迎訊息（textV2 + mention substitution）
- `user-management`: 非阻塞使用者追蹤（新用戶建立、message_count 累加、groups 合併）

### Modified Capabilities

（無現有 specs）

## Impact

- **新增依賴**: `@line/bot-sdk`, `@notionhq/client`, `express`, `node-cron`, `pino`, `zod`, `typescript`, `vitest`
- **部署**: 從 n8n cloud 改為 Zeabur Docker container
- **LINE Console**: webhook URL 需在切換時更新
- **環境變數**: 需從 n8n Credentials 取出 LINE Channel Secret / Access Token / Notion API Key / Group IDs
