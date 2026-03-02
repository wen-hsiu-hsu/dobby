## 1. Setup

- [x] 1.1 安裝 `pino-pretty` 為 devDependency

## 2. Logger 設定

- [x] 2.1 更新 `src/utils/logger.ts`：開發環境使用 pino-pretty transport，生產環境保持 JSON

## 3. Notion API Logging

- [x] 3.1 在 `src/services/notion/notion-fetch.ts` 的 `notionGet`、`notionPost`、`notionPatch` 加入 request logging（method、path）
- [x] 3.2 在 `notion-fetch.ts` 的 `assertOk` 加入 error logging（status、error body）

## 4. LINE API Logging

- [x] 4.1 在 `src/services/line/reply-service.ts` 加入 `replyMessage` 呼叫前的 info log（botId、replyToken 前幾字）
- [x] 4.2 在 `src/services/line/push-service.ts` 加入 `pushMessage` 呼叫前的 info log（botId、to）

## 5. Webhook & Event Logging

- [x] 5.1 在 `src/routes/webhook.ts` 加入 incoming request info log（botId、event 數量）
- [x] 5.2 在 `src/handlers/event-router.ts` 加入每個 event 處理前的 debug log（event type、source type）
