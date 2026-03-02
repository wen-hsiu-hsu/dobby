## Context

目前專案使用 `pino` 做為 logger，但只有零散的 log 呼叫，缺乏系統性覆蓋。主要問題：
- Notion API request/response 完全沒有 log
- LINE API 呼叫只有失敗時的 error log，成功時無任何記錄
- Webhook 入口只有錯誤 log，正常流程無 log
- 開發環境 pino 預設輸出 JSON，難以閱讀

## Goals / Non-Goals

**Goals:**
- 在所有 I/O 邊界（Notion API、LINE API、Webhook）加入 structured logging
- 開發環境使用 `pino-pretty` 讓 log 易讀（production 保持 JSON）
- 統一 log level 使用策略

**Non-Goals:**
- 不引入新的 logging library（保持 pino）
- 不加入 log aggregation 服務（Datadog、Sentry 等）
- 不做 log rotation 或儲存

## Decisions

### 1. pino-pretty 僅用於開發環境

**決定**：`NODE_ENV !== 'production'` 時，動態使用 pino-pretty transport。

**理由**：Production 需要 JSON 格式供系統解析；開發時需要人類可讀格式。pino 原生支援 transport，不需額外封裝。

**替代方案**：使用 `pino-pretty` 的 CLI pipe（`node app | pino-pretty`）— 但需要改 npm scripts，較麻煩。

### 2. Log level 策略

| Level | 使用時機 |
|-------|----------|
| `info` | 正常流程關鍵點（收到 webhook、API 呼叫成功） |
| `debug` | 詳細資料（request body、response 內容） |
| `warn` | 可恢復的錯誤（LINE reply 失敗） |
| `error` | 嚴重錯誤（需要人工介入） |

**理由**：生產環境預設 `info`，不暴露 debug 資料；開發環境 `debug` 顯示所有資訊。

### 3. 敏感資料處理

Notion API body 和 LINE message 內容可能含個資。**決定**：在 debug level log，info level 只記錄 metadata（路徑、狀態碼、token 前幾字元）。

### 4. 不修改 logger.ts 介面

保持 `export const logger` 的介面不變，只在內部加入 transport 設定，讓所有現有 import 不需修改。

## Risks / Trade-offs

- **pino-pretty 效能**：開發環境可接受，production 不使用，無影響。
- **Log 量增加**：debug level 會有大量輸出，但只在開發環境。生產環境 info level 增加的 log 量可控。
- **pino-pretty 為 devDependency**：production build 不應包含，需確認 build 設定。
