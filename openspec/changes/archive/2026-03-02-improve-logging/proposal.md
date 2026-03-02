## Why

目前的 log 資訊不足，難以追蹤 webhook 事件、API 呼叫參數與回傳值，導致調整與除錯耗時。需要增加關鍵位置的 structured logging，並改善 log 的可讀性。

## What Changes

- 升級 pino logger 設定，開發環境使用 `pino-pretty` 提升可讀性
- 在 `notion-fetch.ts` 加入 request/response logging（方法、路徑、body、回傳狀態）
- 在 `reply-service.ts` 和 `push-service.ts` 加入 LINE API 呼叫 logging（參數、成功/失敗結果）
- 在 `webhook.ts` 加入 incoming webhook event logging（botId、event 數量、event 類型）
- 在 `event-router.ts` 加入每個 event 處理前後的 logging
- 在 `message-handler.ts` 補充更多 context logging（userId、text、command/auto-reply 判斷）
- 統一 log level 策略：info 用於正常流程、warn 用於可恢復錯誤、error 用於嚴重錯誤、debug 用於詳細資料

## Capabilities

### New Capabilities
- `structured-logging`: 統一的 structured logging 設定，含 pino-pretty 開發模式支援

### Modified Capabilities
（無現有 spec 需變更）

## Impact

- `src/utils/logger.ts`：增加 pino-pretty transport 設定
- `src/services/notion/notion-fetch.ts`：加入 API logging
- `src/services/line/reply-service.ts`：加入 LINE reply logging
- `src/services/line/push-service.ts`：加入 LINE push logging
- `src/routes/webhook.ts`：加入 webhook incoming logging
- `src/handlers/event-router.ts`：加入 event 處理 logging
- `src/handlers/message-handler.ts`：補充 message handling logging
- `package.json`：新增 `pino-pretty` dev dependency
