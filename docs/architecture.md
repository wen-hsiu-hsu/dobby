# 系統架構

## 整體架構

```
LINE → POST /webhook/:botId → Signature Verification（per-bot secret）→ Event Router
```

Event Router 依事件類型分派：

- **message** → Message Handler：是否以 `@Dobby` 開頭？是 → Command Parser → Command Router → 對應 Command Handler；否 → Auto-Reply 比對 → LINE Reply API
- **join** → Welcome Message Handler
- **memberJoined** → Member Joined Handler（@mention 替換為新成員）

## 指令系統

```
parseCommand(text)
    │
    ├── '@Dobby'           → INTRODUCE
    ├── '@Dobby +N / -N'   → REGISTRATION
    ├── '@Dobby @Name +N'  → REGISTRATION（代他人）
    ├── '@Dobby 假'        → LEAVE
    ├── '@Dobby 銷假'      → CANCEL_LEAVE
    ├── '@Dobby owe/欠'    → OWE
    ├── '@Dobby command/指令' → COMMAND_LIST
    ├── '@Dobby participants/people/報名人' → PARTICIPANTS
    ├── '@Dobby next'      → NEXT_EVENT（管理員）
    ├── '@Dobby news/公告' → NEWS
    └── '@Dobby payment/付款' → PAYMENT
```

全形字元（＋／－）在解析前統一轉換為半形。

## Notion 資料層

採用 Repository Pattern，每個資料庫對應一個 repository：

```
src/services/notion/
├── notion-client.ts        ← Notion SDK 實例
├── notion-fetch.ts         ← REST API 底層封裝（notionPost, notionGet）
├── property-helpers.ts     ← 讀寫各種 Notion property 型別的 helper
├── users-repository.ts     ← USERS 資料庫
├── people-repository.ts    ← 人員清單
├── calendar-repository.ts  ← 行事曆
├── season-repository.ts    ← 季租承租紀錄
└── announcement-repository.ts ← 所有公告
```

## 自動回覆

`src/services/auto-reply.ts` 讀取**靜態 JSON 檔**（`src/data/auto-reply.json`），非 Notion 資料庫。規則以 `scripts/convert-auto-reply.mjs` 從 CSV 轉換產生。管理員訊息不觸發自動回覆。

## 關鍵設計決策

### Fire-and-Forget Webhook 處理

Webhook 收到 LINE 事件後，立即回傳 200，再非同步處理事件。

**原因：** LINE Reply Token 有效期約 1 分鐘，且 LINE 平台在收不到 200 時會重試，導致重複處理。非同步處理確保回應夠快。

### In-Process Mutex

使用 Map-based 的記憶體 mutex，以活動日期字串為 key（不是 Notion 頁面 ID，避免多一次查詢才能知道要鎖哪個 key），TTL 10 秒自動釋放。

**原因：** 單一 server 不需要 Redis。報名和請假操作需要「讀取 → 計算 → 寫回」的原子性，避免並發覆蓋。

**限制：** 重啟後 mutex 狀態遺失（接受，10 秒視窗）。多 instance 部署需改用 Redis。

### Zod 環境變數驗證

`src/config/env.ts` 在啟動時驗證所有必要環境變數，任何缺失立即 `process.exit(1)`。

**原因：** Fail-fast 比執行到一半才爆炸好排查。

### Request Correlation ID + quoteToken 透傳

`src/utils/request-context.ts` 用同一個 AsyncLocalStorage（`runWithContext`，在 `event-router.ts` 對每個事件呼叫一次）注入兩樣東西：

- `reqId`：唯一 correlation ID，所有 log 自動帶上，用來追蹤單一事件的完整日誌。
- `quoteToken`：inbound 文字訊息的 quoteToken（若 LINE webhook 事件有帶）。`reply-service.ts` 的 `replyMessage` 會自動從這個 context 取出並附加到送出的文字訊息上，讓使用者能看到自己的訊息被回應（LINE 的「引用回覆」效果）。

這兩者都靠同一個 context 統一處理，**新增/修改 command handler 不需要逐一手動傳遞 `reqId`/`quoteToken`**——只要最終呼叫的是 `reply-service.ts` 的 `replyMessage`，就會自動帶上；不要繞過它直接呼叫 LINE SDK 送訊息，否則會漏掉這個機制。

**原因：** Webhook 處理是非同步的，沒有 correlation ID 很難追蹤單一事件的完整日誌；quoteToken 若不使用，使用者在群組裡容易搞不清楚機器人是在回應哪一則訊息。

### 雙 Bot 支援

路由基於 URL 的 `:botId`（`dobby` 或 `batting`），每個 bot 有自己的 channel secret 和 access token。Profile 查詢時先試 Dobby，失敗再試 batting。

## 目錄結構

```
src/
├── index.ts              ← Express app 入口，啟動排程
├── config/               ← 環境變數、常數、LINE client
├── middleware/           ← LINE signature 驗證
├── routes/               ← webhook, health, logs
├── handlers/             ← Event router, message/join handler
├── commands/             ← 指令解析與各指令 handler
│   └── registration/     ← 報名子系統（parser, resolver, handler, calculator）
├── services/
│   ├── notion/           ← Notion 資料層
│   └── line/             ← Reply, Push, Profile 服務
├── schedulers/           ← 排程任務
├── types/                ← TypeScript 型別定義
└── utils/                ← 日誌、日期、文字工具
```
