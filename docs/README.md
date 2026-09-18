# Dobby 文件

## 目錄

| 文件 | 說明 | 什麼情境該讀 |
|------|------|------|
| [overview.md](overview.md) | 專案用途、技術棧、部署方式、系統常數 | 第一次接觸專案、確認部署方式 |
| [architecture.md](architecture.md) | 系統架構圖、資料流、設計決策 | 改動跨模組的流程（webhook 處理、事件路由） |
| [commands.md](commands.md) | 所有 @Dobby 指令的說明與範例 | 新增/修改指令行為 |
| [registration.md](registration.md) | 報名系統詳解：容量計算、guest 命名、Mutex | 改報名、請假、容量計算相關邏輯 |
| [schedulers.md](schedulers.md) | 定時推播與顯示名稱更新排程說明 | 改排程任務、推播訊息格式 |
| [development.md](development.md) | 本地開發設定、環境變數、測試方式 | 建置、部署、加新指令的步驟、環境變數 |
| [notion/databases.md](notion/databases.md) | Notion 資料庫業務邏輯與欄位說明 | 改動任何讀寫 Notion 的邏輯 |
| [logging.md](logging.md) | `/logs` 頁面的檢視模式、合併顯示、endpoint 顯示說明 | 要用 `/logs` 除錯、不確定這個頁面有什麼功能 |

只針對特定功能開發時，不需要全部讀完——依上表挑對應文件即可。

## Notion Schema 參考

`notion/schemas/` 資料夾存放各 Notion 資料庫的欄位結構（JSON 格式），供程式碼開發參考：

- `users.json` — USERS 使用者資料庫
- `calendar.json` — 行事曆
- `people-list.json` — 人員清單
- `season-rental-record.json` — 季租承租紀錄
- `all-announcements.json` — 所有公告
