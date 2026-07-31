# Notion 資料庫說明

Dobby 使用 6 個 Notion 資料庫。欄位的詳細型別定義請參考 `schemas/` 資料夾的 JSON 檔案。

---

## USERS（使用者）

**環境變數：** `NOTION_DB_USERS`
**Repository：** `src/services/notion/users-repository.ts`

記錄所有曾與 bot 互動過的 LINE 使用者。

| 欄位 | 用途 |
|------|------|
| `user_id` | LINE userId（主鍵） |
| `Custom Name` | 從 LINE API 同步的 displayName |
| `is_admin` | 管理員權限，`true` 可執行管理員指令、代他人操作 |
| `groups` | 使用者所在的 LINE 群組 ID 清單（multi-select） |
| `multi-chat` | 使用者所在的 LINE 聊天室 ID 清單（multi-select） |
| `message_counts` | 累積訊息數量 |
| `Registered name` | 關聯至「人員清單」，確認此 LINE 使用者是否為正式季租球員 |

**設定管理員：** 在 Notion 將該使用者的 `is_admin` 勾選為 true 即可。

---

## 人員清單（People List）

**環境變數：** `NOTION_DB_PEOPLE`
**Repository：** `src/services/notion/people-repository.ts`

所有球員的名冊，是整個系統的「人員資料中心」。

| 欄位 | 用途 |
|------|------|
| `Name` | 球員姓名（主鍵，用於報名顯示） |
| 繳費相關 | 追蹤費用繳納狀態 |

USERS 的 `Registered name` 關聯至此資料庫，建立 LINE 帳號與球員名單的對應。

---

## 季租承租紀錄（Season Rental Record）

**環境變數：** `NOTION_DB_SEASON`
**Repository：** `src/services/notion/season-repository.ts`

每季（如 2025-Q1）的承租合約資料。

| 欄位 | 用途 |
|------|------|
| 季度名稱 | 如 `2025-Q1`（用於 participants 指令） |
| `報名人` | Relation，關聯至「人員清單」，定義該季的固定成員 |
| `courts` | 場地數，用於容量計算 |
| `零打定價` | 當季零打價格 |

`findAll()` 回傳的第一筆為當前有效季度。

---

## 行事曆（Calendar）

**環境變數：** `NOTION_DB_CALENDAR`
**Repository：** `src/services/notion/calendar-repository.ts`

每週打球活動的紀錄，是報名系統的核心。

| 欄位 | 用途 |
|------|------|
| 日期 | 活動日期（通常是週六），用於查詢 |
| `請假人` | Relation，關聯至「人員清單」，記錄本週請假的季租球員 |
| `零打` | Multi-select，記錄本週補位名單（guest 名稱字串） |
| `類型` | 若為「打球暫停」，報名和推播都會顯示暫停 |

`零打` 欄位的命名規則見 [registration.md](../registration.md#guest-命名規則)。

---

## 所有公告（All Announcements）

**環境變數：** `NOTION_DB_ANNOUNCEMENT`
**Repository：** `src/services/notion/announcement-repository.ts`

儲存各種公告和訊息模板。

| 頁面標題 | 用途 |
|---------|------|
| `NEWS_TEMPLATE` | `@Dobby news` 指令顯示的內容 |
| `PAYMENT` | `@Dobby payment` 指令顯示的內容（支援 bulleted list） |
| `WELCOME_MESSAGE` | 機器人加入群組時發送的歡迎訊息 |
| `INTRODUCE` | `@Dobby` 自我介紹的內容 |

### Placeholder 替換規則

`WELCOME_MESSAGE` 和 `INTRODUCE` 支援以下 placeholder，系統會在發送時替換為 LINE textV2 mention：

| Placeholder | 替換為 |
|-------------|--------|
| `{NEW_FRIEND}` | 新加入群組的成員（memberJoined 事件） |
| `{USER}` | 觸發指令的使用者 |
| `{MANAGER}` | `is_admin = true` 的管理員 |

---

## TEXT_REPLY（自動回覆規則）— Notion 中存在，但程式碼未使用

Notion 有此資料庫（schema 見 `schemas/text-reply.json`），但**目前自動回覆不從 Notion 讀取**。實際來源是靜態 JSON 檔 `src/data/auto-reply.json`（由 `scripts/convert-auto-reply.mjs` 從 CSV 轉換）。若要改回 Notion 驅動，需新建 repository 並接上 `src/services/auto-reply.ts`。

**比對邏輯：** 字串 `includes()`，區分大小寫。管理員訊息不觸發。

---

## 更新 Schema

`schemas/` 下的 JSON 是 Notion 資料庫欄位的快照，供開發參考。repo 內**沒有**自動產生腳本（曾有 `update-notion-schema.js` 的說法但不存在）；欄位變動時需手動比對 Notion 頁面與 JSON 並更新。
