# AI Schema Update Guide

> **目標讀者**: AI Assistant
>
> **用途**: 當 AI 需要了解 Notion database schema 時的操作指南
>
> **格式**: JSON（結構化、模組化、易於解析）

---

## ⚡ 為什麼使用 JSON 格式？

1. **結構化資料**: JSON 格式易於 AI 精確解析，無需處理 Markdown 表格
2. **Token 節省**: 每個 database 獨立檔案，AI 只讀取需要的部分
3. **模組化**: 修改單一 database 不影響其他檔案
4. **程式化處理**: 容易被程式讀取和處理

---

## 何時需要更新 Schema

在以下情境下，AI **必須**主動更新 Notion database schema：

### 1. 開發新功能前（規劃階段）
- 使用者要求建立新的 n8n workflow node 來存取 Notion database
- 使用者要求新增/修改涉及 Notion 欄位的功能
- 使用者提到「新增欄位」、「修改 database」等關鍵字

**範例**：
```
使用者: 我想在 USERS 資料庫新增一個欄位來追蹤使用者的生日
AI 應該做:
  1. 執行 node scripts/update-notion-schema.js --db "USERS"
  2. 檢查 docs/notion/database-schema.md 中的 USERS schema
  3. 確認是否已有 birthday 欄位（若使用者已在 Notion 手動新增）
```

### 2. 發現文件與實際不符時
- n8n workflow 執行錯誤，提示欄位不存在或型別不符
- 使用者反饋「我在 Notion 已經新增欄位了，但 workflow 沒用」

**範例**：
```
使用者: 我已經在 Notion 新增了 is_premium 欄位，但 workflow 沒抓到
AI 應該做:
  1. 執行 node scripts/update-notion-schema.js --db "USERS"
  2. 檢查更新後的 schema，確認 is_premium 是否存在
  3. 根據實際 schema 調整 workflow
```

### 3. 長時間未更新時（主動維護）
- 距離上次更新超過 1 週，且即將開發涉及 Notion 的功能
- 檢查 `docs/notion/database-schema.md` 的 `最後更新時間` 欄位

---

## 如何更新 Schema

### 基本流程

```bash
# 1. 更新所有 databases（首次使用或全面檢查時）
node scripts/update-notion-schema.js

# 2. 更新特定 database（開發特定功能時）
node scripts/update-notion-schema.js --db "USERS"

# 3. 更新多個 databases（功能跨多個 database 時）
node scripts/update-notion-schema.js --db "USERS,TEXT_REPLY"
```

### Available Database Names
- `USERS`
- `TEXT_REPLY`
- `People List`
- `Season Rental Record`
- `Calendar`
- `All Announcements`

### AI 執行步驟範例

假設使用者要求：「新增一個功能，讓機器人可以查詢使用者的報名狀態」

**AI 應執行的步驟**：

1. **更新相關 schema**
   ```bash
   node scripts/update-notion-schema.js --db "USERS,People List,Season Rental Record"
   ```

2. **讀取更新後的 schema**
   ```bash
   # 使用 Read tool 讀取
   docs/notion/database-schema.md
   ```

3. **分析欄位關聯**
   - 檢查 `USERS` 是否有 `user_id` 欄位
   - 檢查 `People List` 是否有 relation 到 `USERS`
   - 檢查 `Season Rental Record` 是否有 relation 到 `People List`

4. **規劃實作策略**
   - 如果欄位齊全 → 直接實作
   - 如果缺少欄位 → 詢問使用者是否需要新增

---

## 環境變數設定

### 自動讀取（無需 AI 介入）
腳本會自動從 `.env` 讀取 `NOTION_TOKEN`，AI **不需要**也**不應該**直接讀取或顯示 token。

### 檢查 .env 是否存在
如果腳本執行失敗，提示「.env file not found」：

```bash
# 1. 檢查 .env 是否存在
ls -la .env

# 2. 如果不存在，提示使用者建立
echo "請建立 .env 檔案並加入 NOTION_TOKEN=secret_your_token"
```

**注意**: AI **絕對不可**直接讀取 `.env` 內容或顯示 token。

---

## 腳本輸出說明

### 成功執行範例
```
🚀 Starting Notion Database Schema Update...

✅ Loaded NOTION_TOKEN from .env

📊 Updating 1 database(s):

  • USERS (USERS)
    ✅ Updated successfully

✨ Schema update completed!

📄 Updated file: docs/notion/database-schema.md
```

### 錯誤處理

#### 錯誤 1: NOTION_TOKEN 未設定
```
❌ Error: NOTION_TOKEN not found in .env file.
```
**AI 應回應**: 「請確認 .env 檔案中包含 NOTION_TOKEN 環境變數」

#### 錯誤 2: Database ID 無效
```
❌ Failed to fetch database xxx: 404 ...
```
**AI 應回應**: 「Database ID 可能已變更，請檢查 scripts/update-notion-schema.js 中的 DATABASES 設定」

#### 錯誤 3: 網路問題
```
❌ Failed: fetch failed
```
**AI 應回應**: 「網路連線失敗，請檢查網路狀態後重試」

---

## 與其他文件的關係

### 1. docs/notion/schemas/*.json（JSON Schema 檔案）
- **內容**: 自動產生的 schema 定義（欄位名稱、型別、設定）
- **格式**: JSON（結構化、易解析）
- **檔案結構**:
  - `index.json`: 所有 databases 的索引
  - `users.json`: USERS database 的完整 schema
  - `people-list.json`: 人員清單 database 的完整 schema
  - ...（每個 database 一個檔案）
- **用途**: AI 在開發時參考，確保使用正確的欄位名稱與型別
- **更新頻率**: 視需求更新（開發前、發現不符時）

### 2. docs/notion/database-schema.md（導覽文件）
- **內容**: 導覽所有 JSON schema 檔案的入口
- **格式**: Markdown（方便閱讀）
- **用途**: 提供概覽、連結到各個 JSON 檔案
- **更新頻率**: 與 JSON 檔案同步更新（由腳本自動產生）

### 3. docs/project/context.md（商業邏輯與常數）
- **內容**:
  - Database 的**用途**與**商業邏輯**（如「USERS 用於追蹤使用者」）
  - System Constants（如 Manager ID、Commands 列表）
  - Event Handlers 的流程說明
- **用途**: AI 理解「為什麼這樣設計」、「資料如何流動」
- **更新頻率**: 當商業邏輯變更時（如新增 Command、修改事件處理流程）

### 4. 三者的分工
| 面向 | schemas/*.json | database-schema.md | context.md |
|------|---------------|-------------------|------------|
| Database ID | ✅ 有 | ✅ 有（導覽） | ✅ 有（索引） |
| 欄位名稱與型別 | ✅ 完整詳細（JSON） | ❌ 無（僅連結） | ❌ 無 |
| Select Options | ✅ 有 | ❌ 無 | ❌ 無 |
| Relation Target | ✅ 有 | ❌ 無 | ❌ 無 |
| Formula Expression | ✅ 有 | ❌ 無 | ❌ 無 |
| 商業邏輯 | ❌ 無 | ❌ 無 | ✅ 有 |
| Event Handlers | ❌ 無 | ❌ 無 | ✅ 有 |
| Commands 定義 | ❌ 無 | ❌ 無 | ✅ 有 |

---

## AI 開發工作流範例

### 情境：使用者要求「新增管理員專屬指令 !stats，顯示所有使用者的訊息數量統計」

#### Step 1: 更新 Schema
```bash
node scripts/update-notion-schema.js --db "USERS"
```

#### Step 2: 讀取 Schema JSON
```bash
# 讀取 USERS database schema（JSON 格式）
Read docs/notion/schemas/users.json

# 讀取 context（商業邏輯面）
Read docs/project/context.md

# 查看所有可用的 databases（可選）
Read docs/notion/schemas/index.json
```

#### Step 3: 分析需求
- **從 users.json確認**:
  - `USERS` 有 `message_counts` 欄位嗎？型別是 `number` 嗎？
  - `USERS` 有 `is_admin` 欄位嗎？型別是 `checkbox` 嗎？
  - 欄位的 `config` 包含什麼設定？（如 number format、relation target）

- **從 context.md 確認**:
  - Admin Checking 的流程是什麼？（動態查詢 vs 硬編碼）
  - Commands 的定義格式是什麼？（`!command` 格式）
  - 是否有現有的 stats 相關 command？

#### Step 4: 實作
根據 schema 與邏輯規劃，修改 `Line bot.json` 新增：
1. 新的 Command Controller case for `!stats`
2. Notion Query node 抓取所有使用者的 `message_counts`
3. Code node 計算統計（總數、平均、最高等）
4. LINE Reply node 回傳格式化訊息

#### Step 5: 文件維護
- 更新 `context.md` 的 Commands 列表，新增 `!stats`
- 若發現新的商業邏輯（如「統計只包含 message_counts > 0 的使用者」），記錄至 context.md

---

## 常見問題

### Q1: 什麼時候應該更新 schema？
**A**:
- 開發涉及 Notion 的新功能**之前**
- 使用者提到「我在 Notion 新增了欄位」**之後**
- 發現 n8n workflow 錯誤，提示欄位問題**時**

### Q2: 我應該讀取 .env 嗎？
**A**: **絕對不行**。腳本會自動讀取，AI 不需要也不應該接觸 token。

### Q3: 如果腳本執行失敗怎麼辦？
**A**:
1. 檢查錯誤訊息（404 → ID 錯誤；網路錯誤 → 連線問題）
2. 回報給使用者，請使用者檢查環境設定
3. **不要**嘗試修改 token 或硬編碼任何敏感資料

### Q4: JSON 檔案和 Markdown 檔案有什麼差別？
**A**:
- **JSON 檔案** (`schemas/*.json`): 結構化的 schema 資料，AI 讀取這個來取得欄位定義
- **Markdown 檔案** (`database-schema.md`): 導覽文件，幫助使用者瀏覽與理解，但 AI 應該讀取 JSON 檔案而非 Markdown

### Q5: 為什麼要模組化（每個 database 一個檔案）？
**A**:
- **Token 節省**: AI 只需讀取需要的 database schema，不用讀取所有內容
- **平行開發**: 修改不同 database 不會產生 git conflict
- **清晰度**: 每個檔案專注於一個 database，更容易理解

---

## 總結

**AI 的職責**:
1. ✅ 主動在需要時執行 `node scripts/update-notion-schema.js`
2. ✅ **讀取 JSON 檔案**（`docs/notion/schemas/*.json`）而非 Markdown
3. ✅ 根據最新 JSON schema 開發功能
4. ✅ 維護 `context.md` 的商業邏輯部分
5. ❌ **不要**直接讀取或顯示 `.env` 內容
6. ❌ **不要**手動編輯 JSON schema 檔案（應由腳本產生）
7. ❌ **不要**手動編輯 `database-schema.md`（應由腳本產生）

**檔案職責分工**:
- `schemas/*.json`（自動產生）：What fields exist? What are their types? (AI 讀這個)
- `database-schema.md`（自動產生）：Navigation and overview (使用者讀這個)
- `context.md`（人工維護）：Why do we use these fields? How does the data flow?
