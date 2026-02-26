# Notion Database Schema Reference

> **⚠️ Auto-Generated File**: 此檔案為導覽文件，實際 schema 資料儲存在 JSON 檔案中。
>
> **最後更新時間**: 2026-01-18T14:54:26.665Z

此檔案提供所有 Notion Database Schema 的導覽。每個 database 的詳細 schema 儲存在獨立的 JSON 檔案中。

---

## 為什麼使用 JSON 格式？

1. **結構化資料**: JSON 格式易於 AI 解析，提升閱讀準確度
2. **模組化**: 每個 database 獨立檔案，AI 只讀取需要的部分，節省 token
3. **程式化處理**: 容易被程式讀取和處理
4. **版本控制友好**: Git diff 更清晰

---

## 使用指南

### 1. 更新 Database Schema
當需要取得最新的 database schema 時，執行以下指令：

```bash
# 更新所有 databases
node scripts/update-notion-schema.js

# 更新特定 database（透過 database name）
node scripts/update-notion-schema.js --db "USERS"

# 更新多個特定 databases
node scripts/update-notion-schema.js --db "USERS,TEXT_REPLY"
```

### 2. 讀取 Schema（AI 使用）

```javascript
// 使用 Read tool 讀取特定 database 的 schema
Read docs/notion/schemas/users.json

// 讀取 index 查看所有可用的 databases
Read docs/notion/schemas/index.json
```

### 3. 環境變數設定
腳本會從 `.env` 讀取 `NOTION_TOKEN`，確保以下變數存在：

```env
NOTION_TOKEN=secret_your_notion_integration_token
```

---

## Database 清單

以下是所有 Notion Databases 的索引：

| Database Name | 檔案位置 | 用途 |
|--------------|---------|------|
| 人員清單 (People List) | [`people-list.json`](schemas/people-list.json) | 管理羽球社團成員名單，追蹤繳費狀態 |
| 季租承租紀錄 (Season Rental Record) | [`season-rental-record.json`](schemas/season-rental-record.json) | 記錄每季的場地承租資訊、報名人數、費用計算 |
| 行事曆 (Calendar) | [`calendar.json`](schemas/calendar.json) | 記錄每次打球的日期、請假人、場地數量 |
| 所有公告 (All Announcements) | [`all-announcements.json`](schemas/all-announcements.json) | 儲存公告模板與歡迎訊息的 Child Blocks |
| TEXT_REPLY (TEXT_REPLY) | [`text-reply.json`](schemas/text-reply.json) | 自動回覆規則 |
| USERS (USERS) | [`users.json`](schemas/users.json) | 使用者追蹤 |


---

## JSON Schema 格式說明

每個 database 的 JSON 檔案包含以下欄位：

```json
{
  "id": "database_id",               // Notion Database ID
  "name": "人員清單",                 // 中文名稱
  "name_en": "People List",          // 英文名稱
  "purpose": "管理羽球社團成員...",   // 用途說明
  "last_updated": "2026-01-18...",   // 最後更新時間
  "properties": {                    // 所有欄位定義
    "Name": {
      "type": "title",               // 欄位型別
      "config": null                 // 型別特定設定（可為 null）
    },
    "結清": {
      "type": "formula",
      "config": {
        "expression": "..."          // Formula expression
      }
    }
  }
}
```

### Property Types
- `title`: 標題欄位
- `rich_text`: 富文本
- `number`: 數字
- `select`: 單選（config 包含 options）
- `multi_select`: 多選（config 包含 options）
- `checkbox`: 勾選框
- `relation`: 關聯（config 包含 database_id）
- `formula`: 公式（config 包含 expression）
- `rollup`: 彙總
- `date`: 日期
- `created_time`: 建立時間
- `files`: 檔案

---

## 相關文件

- **AI 操作指南**: [`AI-SCHEMA-UPDATE-GUIDE.md`](AI-SCHEMA-UPDATE-GUIDE.md)
- **腳本說明**: [`../../../scripts/README.md`](../../../scripts/README.md)
- **商業邏輯**: [`../project/context.md`](../project/context.md)

---

## 注意事項

1. **不要手動編輯 JSON 檔案**: 所有 schema 檔案由腳本自動產生
2. **不要手動編輯此導覽檔**: `database-schema.md` 也由腳本自動產生
3. **商業邏輯分離**: 欄位的用途說明請記錄在 `context.md`
4. **定期更新**: 在 Notion 中修改 database 後，記得執行更新腳本
