# 開發設定

## 前置需求

- Node.js 22 LTS
- npm
- Docker（部署用）

## 本地開發

```bash
# 安裝依賴
npm install

# 複製並填寫環境變數
cp .env.example .env

# 開發模式（檔案變動自動重啟）
npm run dev
```

服務在 `http://localhost:3000` 啟動。

## 環境變數

所有變數在 `src/config/env.ts` 用 Zod schema 驗證，缺少任何必要變數會在啟動時 `process.exit(1)`。

| 變數 | 必要 | 說明 |
|------|------|------|
| `LINE_CHANNEL_SECRET` | ✅ | LINE channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINE channel access token |
| `NOTION_API_KEY` | ✅ | Notion Integration token |
| `NOTION_DB_USERS` | ✅ | USERS 資料庫 ID |
| `NOTION_DB_CALENDAR` | ✅ | 行事曆資料庫 ID |
| `NOTION_DB_PEOPLE` | ✅ | 人員清單資料庫 ID |
| `NOTION_DB_SEASON` | ✅ | 季租承租紀錄資料庫 ID |
| `NOTION_DB_ANNOUNCEMENT` | ✅ | 所有公告資料庫 ID |
| `LOGS_ACCESS_TOKEN` | ✅ | `/logs` 存取用的共享密鑰，需帶 `Authorization: Bearer <token>` 或 `?token=` query string 才能查看 |
| `PORT` | ❌ | 伺服器 port（預設 `3000`） |
| `NODE_ENV` | ❌ | `development` 或 `production` |
| `DOBBY_GROUP_ID` | ❌ | 每週打球推播訊息的目標 LINE 群組 ID，見 `docs/schedulers.md`。沒設定的話該排程會記一行 error log 並跳過，不會讓 app 啟動失敗 |
| `LOG_LEVEL` | ❌ | pino log level（`trace`/`debug`/`info`/`warn`/`error`/`fatal`，預設 `info`）。要臨時診斷正式環境問題（例如看 Notion API 完整 request/response）時，把 Zeabur 上的這個變數改成 `debug` 並重啟服務即可，不用改程式碼重新部署；診斷完記得改回 `info`，否則 debug log 會把 Notion 回傳的完整資料（含姓名、LINE user_id 等）持續寫進 `/logs` 可查到的檔案。 |

Notion 資料庫 ID 可從 Notion 頁面 URL 取得（32 字元的 UUID）。

## 測試

```bash
# 執行所有測試
npm test

# 執行測試並產生覆蓋率報告
npm run test:coverage

# 監看模式（開發時使用）
npm test -- --watch
```

測試框架：Vitest + supertest

### 測試結構

```
src/
├── __tests__/                    ← 整合測試 / E2E 測試
│   ├── webhook.test.ts
│   ├── command-integration.test.ts
│   ├── registration-flow.test.ts
│   └── auto-reply.test.ts
├── commands/__tests__/           ← 指令單元測試
├── services/__tests__/           ← 服務單元測試
└── utils/__tests__/              ← 工具函式測試
```

## 建置與部署

```bash
# 編譯 TypeScript
npm run build
# 輸出到 dist/index.cjs

# 啟動編譯後版本
npm start
```

### Docker

```bash
# 本地建置測試
docker build -t dobby .
docker run -p 3000:3000 --env-file .env dobby
```

使用 multi-stage build：
1. **builder**：安裝所有依賴、編譯 TypeScript
2. **runtime**：只複製 `dist/`、安裝 production 依賴

### 日誌

- 開發環境（`NODE_ENV=development`）：console 輸出（pino-pretty 格式）
- 生產環境：寫入 `logs/` 資料夾，每日輪替，自動保留 7 天
- 日誌查看器：`GET /logs`（開發用）

## 新增指令

1. 在 `src/types/commands.ts` 新增 `CommandType` 枚舉值
2. 在 `src/commands/command-parser.ts` 新增解析邏輯
3. 在 `src/commands/` 建立 handler 檔案
4. 在 `src/commands/command-router.ts` 新增路由
5. 更新 `docs/commands.md`

## Notion Rate Limit

Notion API 限制約 3 req/s。設計 Notion 查詢時注意：
- 避免不必要的查詢
- 需要快速回應的路徑使用 cache
- 排程任務（display-name-update）在 Notion 更新之間有 400ms delay
