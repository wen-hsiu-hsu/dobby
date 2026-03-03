# 專案概覽

## 用途

Dobby 是羽球社的 LINE 機器人，負責：

- 管理每週打球的零打（補位）報名與取消
- 處理季租球員的請假與銷假
- 發送每週打球資訊推播
- 回應 @Dobby 指令（查詢欠費、公告、付款資訊等）
- 自動回覆設定的關鍵字訊息

系統支援兩個 LINE bot（Dobby、球來就打），共用同一套邏輯。

## 技術棧

| 類別 | 選擇 | 說明 |
|------|------|------|
| Runtime | Node.js 22 LTS | |
| 語言 | TypeScript 5.x（strict mode） | |
| 框架 | Express 5.x | |
| LINE SDK | `@line/bot-sdk` 10.x | 官方 SDK，含 signature 驗證 |
| 資料庫 | Notion（`@notionhq/client`） | 透過 REST API 操作 |
| 排程 | `node-cron` | cron 表達式 |
| 日誌 | `pino` + `pino-roll` | JSON 日誌，每日輪替 |
| 環境驗證 | `zod` | 啟動時 fail-fast 驗證 |
| 測試 | Vitest + supertest | |
| 容器 | Docker multi-stage build | |

## 系統常數

| 常數 | 值 | 說明 |
|------|----|------|
| `COURTS_DENSITY` | 7 | 每場地最多人數 |
| `MAX_GUESTS_PER_MEMBER` | 1 | 每位季租成員最多帶幾位朋友（預留，目前未強制限制） |

## Webhook 端點

| 路徑 | 用途 |
|------|------|
| `POST /webhook/dobby` | Dobby bot 的 LINE webhook |
| `POST /webhook/batting` | 球來就打 bot 的 LINE webhook |
| `GET /health` | 健康檢查 |
| `GET /logs` | 日誌查看器（開發用） |

## 部署

### Docker（建議）

```bash
# 建置
docker build -t dobby .

# 啟動（搭配 .env）
docker compose up -d
```

### Zeabur

專案使用 Docker multi-stage build，可直接部署至 Zeabur。將 `.env` 中的變數設定為 Zeabur 的環境變數即可。

### 日誌

啟動後日誌會寫入 `logs/` 資料夾，每日輪替，自動保留最近 7 天。開發模式下同時輸出至 console（pino-pretty 格式）。
