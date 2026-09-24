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

## 用 Docker + ngrok 本地開發（固定網址接真實 LINE）

要用 docker 跑本地服務、並讓 LINE webhook 能打進來測試，用 `docker-compose.dev.yml`（純本地開發用，跟 production 的 `docker-compose.yml` 分開）：

```bash
# 1. 複製並填寫環境變數（若還沒做過）
cp .env.example .env

# 2. 複製並填寫 ngrok 設定
cp .env.ngrok.example .env.ngrok
# NGROK_AUTHTOKEN: https://dashboard.ngrok.com/get-started/your-authtoken
# NGROK_DOMAIN: 到 https://dashboard.ngrok.com/domains 申請一個免費 static domain
#   （每個帳號可以申請一個永久固定的網域，不會因為重啟而換掉）

# 3. 啟動（app 用 volume mount + tsx watch，改檔案會自動重啟；ngrok 建好固定網址的 tunnel）
npm run dev:docker
```

啟動後：
- app 本身在 `http://localhost:3000`
- ngrok 面板在 `http://localhost:4040`（可以看到每次 webhook 的原始 request/response，比對簽章驗證失敗時很好用）
- 把 `https://<NGROK_DOMAIN>/webhook` 填到 LINE Developers Console 的 Webhook URL 欄位，設定一次之後網址不會變，不用每次重啟都重新貼

`docker-compose.dev.yml` 的 `app` service 只把 `npm ci` 的結果 bake 進 image（`Dockerfile` 的 `dev` stage），原始碼是 bind mount 進去的，所以改 TypeScript 檔案會即時重啟，不用重建 image；只有改 `package.json` 才需要 `npm run dev:docker` 重新 `--build`。

`docker-compose.dev.yml` 跟正式的 `docker-compose.yml` 各自用 `name:` 指定了不同的 compose project 名稱（`dobby-dev` / `dobby`）。兩者預設都會用資料夾名稱當 project 名稱，沒特別指定的話會撞名——`up` 其中一個會把另一個正在跑的 container 悄悄換掉，`down -v` 打錯檔案也會把對方的 volume 一起清掉。改指令時不要拿掉這個 `name:`。

`app` 在 dev 模式（`NODE_ENV=development`）只會把 log 印到 console，不會寫進 `logs/` 資料夾（見 `src/utils/logger.ts` 的 `isDev` 分支），所以 `/logs` 頁面在這個 flow 下看不到即時新進的 log，只能看到已經存在 `logs/` 資料夾裡的歷史檔案。

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
| `DOBBY_GROUP_IDS` | ❌ | 每週打球推播訊息的目標 LINE 群組 ID，可用逗號分隔多個群組 ID，見 `docs/schedulers.md`。沒設定的話該排程會記一行 error log 並跳過，不會讓 app 啟動失敗 |
| `LOG_LEVEL` | ❌ | pino log level（`trace`/`debug`/`info`/`warn`/`error`/`fatal`，預設 `info`）。要臨時診斷正式環境問題（例如看 Notion API 完整 request/response）時，把 Zeabur 上的這個變數改成 `debug` 並重啟服務即可，不用改程式碼重新部署；診斷完記得改回 `info`，否則 debug log 會把 Notion 回傳的完整資料（含姓名、LINE user_id 等）持續寫進 `/logs` 可查到的檔案。 |
| `R2_ACCOUNT_ID` | ❌ | Cloudflare R2 帳號 ID，跟下面三個變數必須「全部有值」或「全部沒值」（`src/config/env.ts` 有驗證，中間狀態會讓服務啟動失敗），見 `docs/adr/0006-log-r2-sync-is-periodic-full-directory-not-rotation-hook.md` |
| `R2_ACCESS_KEY_ID` | ❌ | R2 S3 相容 API 的 access key ID |
| `R2_SECRET_ACCESS_KEY` | ❌ | R2 S3 相容 API 的 secret access key |
| `R2_BUCKET_NAME` | ❌ | 存放 log 備份的 R2 bucket 名稱 |
| `R2_LOG_PREFIX` | ❌ | R2 上 log 物件 key 的前綴（`logs/<prefix>/<檔名>`），沒設定時預設用 `NODE_ENV` |
| `R2_LOG_SYNC_INTERVAL_MINUTES` | ❌ | log 同步到 R2 的週期（分鐘），沒設定時預設 `15` |

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
1. **builder**：安裝所有依賴、編譯 TypeScript、`npm prune --omit=dev` 就地清掉 devDependencies
2. **runtime**：只複製 `dist/` 跟 builder 已經 prune 過的 `node_modules`，不再自己另外 `npm ci`（避免 production 依賴被裝兩次）

兩個 `npm ci` 都掛了 BuildKit 的 `--mount=type=cache,target=/root/.npm`，讓 npm cache 能跨次 build 保留，加速重複部署（例如 Pi 每次 push 都會重新 build）。這個語法需要 BuildKit（`# syntax=docker/dockerfile:1`），較舊版本的 Docker / `docker-compose` v1 如果沒開 BuildKit 會直接 build 失敗，不是靜默降級。

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
