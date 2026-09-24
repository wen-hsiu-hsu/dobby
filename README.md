# Dobby

羽球社 LINE 機器人，管理每週打球的報名、請假與公告事務。以 TypeScript + Express 建置，使用 Notion 作為資料庫，正式環境跑在自架 Raspberry Pi 上的 Docker Compose（詳見 [docs/overview.md](docs/overview.md)）。

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

複製 `.env.example` 為 `.env` 後填入各項值。完整清單（哪些必填、預設值與用途）統一維護在 [`docs/development.md` 的環境變數表](docs/development.md#環境變數)，這裡不重複列出，避免兩份表不同步。

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
