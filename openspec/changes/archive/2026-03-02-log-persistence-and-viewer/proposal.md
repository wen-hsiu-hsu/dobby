## Why

目前 logs 僅輸出到 stdout，容器重啟後即消失，無法回溯問題。需要將 logs 持久化保留至少 7 天，並提供易讀的 Web UI 以便查閱。

## What Changes

- Pino 同時寫入 stdout 與按日切割的 JSON log 檔（`logs/YYYY-MM-DD.json`）
- Docker Compose 加入 volume mount，確保 log 檔在容器重啟後仍存在
- 每天自動清除 7 天前的 log 檔
- 新增 `GET /logs` HTTP endpoint，以 HTML 頁面呈現近 7 天的 log

## Capabilities

### New Capabilities
- `log-persistence`: 將 Pino logs 寫入按日切割的 JSON 檔，並支援 7 天自動清除
- `log-viewer`: `GET /logs` endpoint，以 HTML 頁面呈現 log，支援按 level、reqId 篩選與全文搜尋

### Modified Capabilities
- `structured-logging`: logger 需同時支援 file transport（目前僅 stdout）

## Impact

- `src/utils/logger.ts`：加入 pino file transport（`pino.destination` 或 `pino-roll`）
- `src/routes/`：新增 `/logs` route
- `docker-compose.yml`：加入 `logs/` volume mount
- 新增依賴：`pino-roll`（log rotation）
- 新增 `src/utils/log-cleanup.ts`：定期刪除舊 log 檔的 cron job
