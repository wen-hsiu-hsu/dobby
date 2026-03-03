# Dobby 文件

## 目錄

| 文件 | 說明 |
|------|------|
| [overview.md](overview.md) | 專案用途、技術棧、部署方式、系統常數 |
| [architecture.md](architecture.md) | 系統架構圖、資料流、設計決策 |
| [commands.md](commands.md) | 所有 @Dobby 指令的說明與範例 |
| [registration.md](registration.md) | 報名系統詳解：容量計算、guest 命名、Mutex |
| [schedulers.md](schedulers.md) | 定時推播與顯示名稱更新排程說明 |
| [development.md](development.md) | 本地開發設定、環境變數、測試方式 |
| [notion/databases.md](notion/databases.md) | Notion 資料庫業務邏輯與欄位說明 |

## Notion Schema 參考

`notion/schemas/` 資料夾存放各 Notion 資料庫的欄位結構（JSON 格式），供程式碼開發參考：

- `users.json` — USERS 使用者資料庫
- `calendar.json` — 行事曆
- `people-list.json` — 人員清單
- `season-rental-record.json` — 季租承租紀錄
- `all-announcements.json` — 所有公告
- `text-reply.json` — 自動回覆規則
