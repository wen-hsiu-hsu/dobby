# Dobby 文件

## 目錄

| 文件 | 說明 | 什麼情境該讀 |
|------|------|------|
| [overview.md](overview.md) | 專案用途、技術棧、部署方式、從 n8n 遷移的背景與回滾方式、系統常數 | 第一次接觸專案、確認部署方式、需要回滾到 n8n |
| [architecture.md](architecture.md) | 系統架構圖、資料流、設計決策 | 改動跨模組的流程（webhook 處理、事件路由） |
| [commands.md](commands.md) | 所有 @Dobby 指令的說明與範例 | 新增/修改指令行為 |
| [registration.md](registration.md) | 報名系統詳解：容量計算、guest 命名、Mutex（含逾時時回覆什麼）、報名／請假的決策摘要 log | 改報名、請假、容量計算相關邏輯 |
| [schedulers.md](schedulers.md) | 定時推播與顯示名稱更新排程說明 | 改排程任務、推播訊息格式 |
| [development.md](development.md) | 本地開發設定、環境變數、測試方式 | 建置、部署、加新指令的步驟、環境變數、本機 `.env` 該接哪個 LINE channel、寫或改 Flex 卡片（真機才看得出的渲染陷阱） |
| [notion/databases.md](notion/databases.md) | Notion 資料庫業務邏輯與欄位說明 | 改動任何讀寫 Notion 的邏輯 |
| [logging.md](logging.md) | `/logs` 頁面的事件列表/時間軸版面、合併顯示、狀態判定（完成／降級／警告／失敗）、R2 同步折疊、遮蔽 ID 說明 | 要用 `/logs` 除錯、不確定這個頁面有什麼功能、看不懂某個事件為什麼是這個狀態 |
| [performance-observations.md](performance-observations.md) | 從真實 log 分析出的效能待辦（逐筆查詢、鎖內組回覆訊息、Notion 長尾造成連鎖逾時） | 要處理效能、改 Notion 呼叫模式或鎖內流程 |
| [rejected-proposals.md](rejected-proposals.md) | 已評估、不採納的提案（SQLite、表格驅動路由、分頁等），各附重新評估條件 | 提出重構、效能優化、新機制之前，先 grep 確認沒被否決過 |
| [achievements-rulebook.md](achievements-rulebook.md) | 成就系統（含賽季彩蛋）的遊戲規則，**尚未實作** | 要開發或討論成就系統；開工前先看 `TODO.md`「規劃中功能」 |

只針對特定功能開發時，不需要全部讀完——依上表挑對應文件即可。

## Notion Schema 參考

`notion/schemas/` 資料夾存放各 Notion 資料庫的欄位結構（JSON 格式），供程式碼開發參考：

- `users.json` — USERS 使用者資料庫
- `calendar.json` — 行事曆
- `people-list.json` — 人員清單
- `season-rental-record.json` — 季租承租紀錄
- `all-announcements.json` — 所有公告
