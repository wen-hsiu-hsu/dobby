# Dobby

羽球社 LINE 機器人，管理每週打球的報名、請假與公告事務。以 TypeScript + Express 建置，使用 Notion 作為資料庫，部署於 Docker/Zeabur。

## 快速啟動

### 本地開發

```bash
# 安裝依賴
npm install

# 複製並填寫環境變數
cp .env.example .env

# 啟動（watch mode）
npm run dev
```

服務預設在 `http://localhost:3000` 啟動。

### Docker

```bash
# 建置並啟動
docker compose up --build

# 背景執行
docker compose up -d
```

## 環境變數

複製 `.env.example` 並填入以下值：

| 變數 | 說明 |
|------|------|
| `LINE_CHANNEL_SECRET_DOBBY` | Dobby bot 的 channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN_DOBBY` | Dobby bot 的 access token |
| `LINE_CHANNEL_SECRET_BATTING` | 球來就打 bot 的 channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN_BATTING` | 球來就打 bot 的 access token |
| `NOTION_API_KEY` | Notion Integration token |
| `NOTION_DB_USERS` | USERS 資料庫 ID |
| `NOTION_DB_CALENDAR` | 行事曆資料庫 ID |
| `NOTION_DB_PEOPLE` | 人員清單資料庫 ID |
| `NOTION_DB_SEASON` | 季租承租紀錄資料庫 ID |
| `NOTION_DB_ANNOUNCEMENT` | 所有公告資料庫 ID |
| `PORT` | 伺服器 port（預設 3000） |
| `NODE_ENV` | `development` 或 `production` |
| `LOG_LEVEL` | pino log level（預設 `info`），臨時診斷問題可改 `debug` |

## 常用指令

```bash
npm run dev          # 開發模式（watch）
npm run build        # 編譯 TypeScript
npm start            # 啟動編譯後的版本
npm test             # 執行測試
npm run test:coverage # 測試 + 覆蓋率報告
```

## 文件

詳細文件請見 [`docs/`](docs/README.md)：

- [專案概覽](docs/overview.md) — 架構概覽、技術棧、部署
- [系統架構](docs/architecture.md) — 資料流、設計決策
- [指令說明](docs/commands.md) — 所有 @Dobby 指令
- [報名系統](docs/registration.md) — 報名邏輯詳解
- [排程任務](docs/schedulers.md) — 定時推播與更新
- [開發設定](docs/development.md) — 詳細的開發指南
