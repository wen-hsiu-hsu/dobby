## Context

目前 Pino logger 僅輸出到 stdout，以 Docker 部署的環境中，容器重啟後 logs 即消失。需要在不破壞現有 stdout 輸出的前提下，新增 file transport 並提供 Web UI 查閱介面。

## Goals / Non-Goals

**Goals:**
- Pino 同時寫入 stdout 與本地 JSON 檔（`logs/YYYY-MM-DD.json`，按天 rotation）
- 7 天 log retention，超過自動刪除
- `GET /logs` endpoint 回傳 HTML 頁面，可瀏覽、篩選近 7 天 log
- Docker volume mount 確保 log 持久化

**Non-Goals:**
- 認證保護（`/logs` 為公開 endpoint）
- Real-time streaming（手動 refresh 即可）
- 集中式 log 管理（ELK、Loki 等）

## Decisions

### D1：Log Rotation — 使用 `pino-roll`

**選擇**：`pino-roll` 套件，提供 Pino-native 的 file rotation，支援按日切割（`frequency: 'daily'`）。

**替代方案**：
- `pino-rotating-file-stream`：較舊，社群維護較少
- 手動 `pino.destination()`：不支援 rotation，需自己實作

**理由**：`pino-roll` 為 Pino 官方生態，API 簡潔，支援 `dateFormat` 命名模板，直接輸出 `logs/2026-03-02.json`。

### D2：同時保留 stdout — 使用 `pino.multistream`

**選擇**：`pino.multistream([stdout, fileStream])` 同時輸出到兩個目標。

**理由**：不破壞現有 Docker log 收集行為；開發環境 pino-pretty 仍走 stdout。

### D3：7 天清除 — app 啟動時 + 每日 cron

**選擇**：在 `src/utils/log-cleanup.ts` 實作清除邏輯，app 啟動時執行一次，並以 `setInterval` 每 24 小時執行。

**替代方案**：
- OS-level cron / logrotate：不依賴 app，但增加部署複雜度
- Docker healthcheck：不適合此用途

**理由**：保持 app self-contained，無需額外 infra。

### D4：HTML Viewer — Server-side render，純 HTML/CSS/JS

**選擇**：`GET /logs` 讀取近 7 天 JSON log 檔，server-side 組裝 HTML 字串回傳。

**理由**：
- 不需要前端 build pipeline
- 單一 endpoint，無靜態檔案服務複雜度
- JSON log 逐行解析（NDJSON），記憶體友善

**UI 功能**：
- Level filter（error/warn/info/debug）
- reqId 搜尋
- 時間範圍選擇（今天、昨天、近 7 天）
- 全文搜尋（msg 欄位）
- 依 time 排序（最新在上）

## Risks / Trade-offs

- [Risk] Log 檔在高流量下可能快速成長 → 未來可加 max size rotation，目前 bot 流量低，7 天可接受
- [Risk] `/logs` 無認證，log 內容可能包含敏感資訊 → replyToken 已截斷，reqId 為隨機 hex，可接受；若未來需要保護再加 middleware
- [Risk] `pino.multistream` 在 pino-pretty 模式（dev）下，file stream 仍為 JSON，stdout 為 pretty → 此為預期行為，兩者格式各自獨立

## Migration Plan

1. 加入 `pino-roll` 依賴
2. 修改 `logger.ts`：production 使用 multistream，development 沿用 pino-pretty（不寫檔）
3. 新增 `log-cleanup.ts` 並在 `index.ts` 啟動
4. 新增 `logs/` 到 `.gitignore`
5. 更新 `docker-compose.yml` 加入 volume
6. 新增 `/logs` route 與 HTML renderer
