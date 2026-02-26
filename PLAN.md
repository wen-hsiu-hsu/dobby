# 遷移計畫：n8n LINE Bot → TypeScript + Express Server

## Context

現有的羽球社 LINE Bot (Dobby) 架設在 n8n 上（4 個 workflows、92+ 節點）。本計畫將整個 Bot 遷移至獨立的 TypeScript + Express 伺服器，部署於 Zeabur (Docker)，保留 Notion 作為資料庫，以 in-process mutex 取代 Redis。

---

## 技術棧

| 類別       | 選擇                     | 理由                        |
| ---------- | ------------------------ | --------------------------- |
| Runtime    | Node.js 20 LTS           | LINE SDK 官方支援           |
| Language   | TypeScript 5.x           | 型別安全、重構友善          |
| Framework  | Express 4.x              | 輕量、生態成熟              |
| LINE SDK   | `@line/bot-sdk` 9.x      | 官方 SDK，含 signature 驗證 |
| Notion SDK | `@notionhq/client` 2.x   | 官方 SDK                    |
| 排程       | `node-cron`              | 輕量 cron 表達式            |
| 鎖定       | In-process mutex (`Map`) | 單 server 不需 Redis        |
| 測試       | Vitest + supertest       | ESM 原生支援                |
| 日誌       | pino                     | 高效能 JSON logger          |
| 驗證       | zod                      | Runtime 環境變數驗證        |
| 容器       | Docker multi-stage       | Zeabur 部署                 |

---

## 資料流總覽

```
LINE Platform
  │
  ▼
[POST /webhook/dobby]  [POST /webhook/batting]
  │                      │
  ▼                      ▼
Signature Verification (middleware, per bot channel secret)
  │
  ▼
Event Router ─────────────────────────────────────────┐
  │                                                    │
  ├── message event ──┐                   ┌── join/memberJoined
  │                   │                   │     │
  │    ┌──────────────┤                   │     ▼
  │    │              │                   │  Welcome Message Handler
  │    ▼              ▼                   │  (textV2 + mention substitution)
  │  Command       Auto-Reply            │
  │  Parser        Handler               │
  │    │              │                   │
  │    ▼              ▼                   │
  │  Command       Keyword Match         │
  │  Router        + Reply               │
  │    │                                  │
  │    ├── info commands ──> Notion Query │
  │    ├── registration ──> Mutex Lock   │
  │    └── leave ─────────> Mutex Lock   │
  │                                       │
  ▼ (async, fire-and-forget)              │
User Management Service                  │
  │                                       │
  ▼                                       │
Notion USERS DB                           │
                                          │
[node-cron] ──────────────────────────────┘
  │
  ▼
Scheduled Push Service ──> LINE Push API (Dobby + batting)
```

---

## 專案結構

```
dobby-line-bot/
├── src/
│   ├── index.ts                          # Entry point: Express app + cron
│   ├── config/
│   │   ├── env.ts                        # zod 環境變數驗證（fail-fast）
│   │   ├── constants.ts                  # 業務常數 (COURTS_DENSITY=7 等)
│   │   └── line.ts                       # LINE client 實例 (Dobby + batting)
│   │
│   ├── middleware/
│   │   ├── line-signature.ts             # LINE webhook signature 驗證 (raw body)
│   │   ├── error-handler.ts              # 全域錯誤處理
│   │   └── request-logger.ts             # 請求日誌
│   │
│   ├── routes/
│   │   ├── webhook.ts                    # POST /webhook/:botId
│   │   └── health.ts                     # GET /health
│   │
│   ├── handlers/
│   │   ├── event-router.ts               # event.type 分派
│   │   ├── message-handler.ts            # message -> command or auto-reply
│   │   ├── join-handler.ts               # join event -> 歡迎訊息
│   │   └── member-joined-handler.ts      # memberJoined -> 歡迎 + mention
│   │
│   ├── commands/
│   │   ├── command-parser.ts             # 解析 @Dobby 指令文字
│   │   ├── command-router.ts             # 依指令類型分派至 handler
│   │   ├── introduce.ts                  # @Dobby (自我介紹)
│   │   ├── owe.ts                        # @Dobby owe/欠
│   │   ├── command-list.ts               # @Dobby command/指令
│   │   ├── participants.ts               # @Dobby participants/people/報名人
│   │   ├── next-event.ts                 # @Dobby next (admin only)
│   │   ├── news.ts                       # @Dobby news/公告
│   │   ├── payment.ts                    # @Dobby payment/付款
│   │   └── registration/
│   │       ├── registration-parser.ts    # 報名/請假指令 + mentionees 解析
│   │       ├── target-resolver.ts        # self/mention/name 三分支
│   │       ├── registration-handler.ts   # +N/-N 邏輯
│   │       ├── leave-handler.ts          # 假/銷假邏輯
│   │       └── capacity-calculator.ts    # 零打名額計算
│   │
│   ├── services/
│   │   ├── notion/
│   │   │   ├── notion-client.ts          # Notion client wrapper
│   │   │   ├── property-helpers.ts       # Notion property 讀寫轉換
│   │   │   ├── users-repository.ts       # USERS CRUD
│   │   │   ├── people-repository.ts      # 人員清單 queries
│   │   │   ├── calendar-repository.ts    # 行事曆 queries + updates
│   │   │   ├── season-repository.ts      # 季租承租紀錄 queries
│   │   │   ├── announcement-repository.ts# 公告 + block children
│   │   │   └── text-reply-repository.ts  # TEXT_REPLY queries (with cache)
│   │   │
│   │   ├── line/
│   │   │   ├── reply-service.ts          # Reply API (fallback to Push)
│   │   │   ├── push-service.ts           # Push API wrapper
│   │   │   └── profile-service.ts        # 取得 profile (雙 bot fallback)
│   │   │
│   │   ├── user-management.ts            # 非阻塞使用者追蹤 (fire-and-forget)
│   │   ├── auto-reply.ts                 # 關鍵字匹配 (admin skip, case-sensitive)
│   │   ├── welcome-message.ts            # textV2 + substitution builder
│   │   └── mutex.ts                      # In-process mutex (Map-based)
│   │
│   ├── schedulers/
│   │   ├── weekly-push.ts                # 每週推播 (2 bot accounts)
│   │   └── display-name-update.ts        # 批次更新顯示名稱
│   │
│   ├── types/
│   │   ├── commands.ts                   # 指令型別
│   │   ├── notion-models.ts              # Notion 資料模型
│   │   └── registration.ts               # 報名系統型別
│   │
│   └── utils/
│       ├── date-utils.ts                 # getNextSaturday, getQuarter, formatDate
│       ├── text-utils.ts                 # 文字處理
│       └── logger.ts                     # pino logger
│
├── tests/
│   ├── unit/                             # command parser, mutex, calculator...
│   ├── integration/                      # webhook endpoint, command flow
│   ├── e2e/                              # 報名/請假完整流程
│   └── fixtures/                         # mock webhook events, Notion responses
│
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

---

## 環境變數

```bash
# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# LINE Bot: Dobby
LINE_DOBBY_CHANNEL_SECRET=<secret>
LINE_DOBBY_CHANNEL_ACCESS_TOKEN=<token>

# LINE Bot: batting (球來就打)
LINE_BATTING_CHANNEL_SECRET=<secret>
LINE_BATTING_CHANNEL_ACCESS_TOKEN=<token>

# Notion
NOTION_API_KEY=<token>
NOTION_DB_USERS=2e44dbf2-e21c-80d1-af81-c3b61579b3bb
NOTION_DB_PEOPLE_LIST=252f388d-4ac7-49a4-82ae-a7f18044f701
NOTION_DB_SEASON_RENTAL=7deede34-579d-4c77-b79b-20b9f4f000e7
NOTION_DB_CALENDAR=0fd76b77-9f07-4aa3-a3c9-12ba18dbe32e
NOTION_DB_ANNOUNCEMENTS=2e24dbf2-e21c-80b7-83f6-ef99c1dd9425
NOTION_DB_TEXT_REPLY=2e34dbf2-e21c-8047-8ac5-fccfc5c02729

# Push Target Groups
LINE_DOBBY_GROUP_ID=<group_id>
LINE_BATTING_GROUP_ID=<group_id>

# Scheduler (cron expressions)
WEEKLY_PUSH_CRON=0 20 * * 3
DISPLAY_NAME_CRON=0 4 * * 1
```

使用 zod schema 啟動時驗證，缺少必要變數立即 fail-fast。

---

## 實作階段

### Phase 1: 專案骨架與基礎設施

**交付**: Express server 接收 webhook、回傳 200、Docker 可部署。

| Step | 內容                                               | 檔案                                   |
| ---- | -------------------------------------------------- | -------------------------------------- |
| 1.1  | npm init + 安裝依賴 + tsconfig                     | `package.json`, `tsconfig.json`        |
| 1.2  | zod 環境變數驗證 + 業務常數                        | `config/env.ts`, `config/constants.ts` |
| 1.3  | pino logger + LINE client 實例                     | `utils/logger.ts`, `config/line.ts`    |
| 1.4  | Express app + webhook route + signature middleware | `index.ts`, `routes/`, `middleware/`   |
| 1.5  | Dockerfile (multi-stage) + docker-compose (dev)    | `Dockerfile`, `docker-compose.yml`     |

**關鍵設計**: LINE webhook 需在 ~1 秒內收到 200，事件處理 fire-and-forget：

```typescript
router.post("/webhook/:botId", lineSignature, (req, res) => {
    res.status(200).json({ status: "ok" });
    processEvents(req.body.events, req.params.botId).catch(logError);
});
```

**注意**: Signature 驗證需要 raw body，在 Express JSON parser 之前處理：

```typescript
app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
```

---

### Phase 2: Notion Repository 層

**交付**: 6 個 Repository + property helpers。

| Repository                | Notion DB    | 主要操作                                                              |
| ------------------------- | ------------ | --------------------------------------------------------------------- |
| `users-repository`        | USERS        | findByUserId, findByCustomName, create, update, incrementMessageCount |
| `people-repository`       | 人員清單     | findByPageIds, findByName                                             |
| `calendar-repository`     | 行事曆       | findByDate, findNextEvent, updateAbsentees, updateGuests              |
| `season-repository`       | 季租承租紀錄 | findByName, findCurrent                                               |
| `announcement-repository` | 所有公告     | findByName + blocks.children.list                                     |
| `text-reply-repository`   | TEXT_REPLY   | findAll (in-memory TTL cache, 5 分鐘)                                 |

**核心型別** (`types/notion-models.ts`):

```typescript
interface NotionUser {
    pageId: string;
    userId: string; // title (user_id)
    isAdmin: boolean; // checkbox (is_admin)
    groups: string[]; // multi_select
    multiChat: string[]; // multi_select (multi-chat)
    messageCounts: number; // number
    customName: string | null; // rich_text (Custom Name)
    registeredNameIds: string[]; // relation (Registered name) page IDs
}

interface CalendarEvent {
    pageId: string;
    name: string; // title
    date: string | null; // date (時間)
    type: string | null; // select: 打球/打球暫停
    courts: number | null; // number (場地數)
    absenteeIds: string[]; // relation (請假人) page IDs
    guests: string[]; // multi_select (零打) names
    seasonIds: string[]; // relation (季度) page IDs
}

interface SeasonRecord {
    pageId: string;
    seasonName: string; // title (e.g. "2026-Q1")
    memberIds: string[]; // relation (報名人) page IDs
    courts: number | null; // number (場地數)
    guestPrice: number | null; // number (零打費用)
}
```

**注意**: Notion property 讀寫格式不同，需在 `property-helpers.ts` 統一處理。

---

### Phase 3: 核心服務層

**交付**: LINE API wrapper、mutex、使用者管理、自動回覆。

#### 3.1 LINE Reply & Push Service

- Reply 失敗 fallback Push API
- `unsend` 事件沒有 replyToken，用 Push
- `textV2` 中 `{}` 被視為 placeholder

#### 3.2 LINE Profile Service

- 雙 Bot fallback：Dobby → batting

#### 3.3 In-Process Mutex（取代 Redis SET NX + TTL=10s）

```typescript
async function withMutex<T>(key: string, fn: () => Promise<T>): Promise<Result<T>> {
    if (locks.has(key)) return { success: false }; // 「系統繁忙」
    // acquire → execute → release in finally (10s timeout auto-release)
}
```

#### 3.4 User Management（非阻塞 fire-and-forget）

- 新使用者 → create
- 既有 → increment message_counts, merge groups/multi-chat
- Source: `group` → groups, `room` → multi-chat, `user` → skip

#### 3.5 Auto-Reply

- In-memory cache (TTL 5min)
- Case-sensitive `includes()`
- Admin 跳過

---

### Phase 4: 指令系統（最複雜）

#### 4.1 Command Parser

| 指令                                        | Type                |
| ------------------------------------------- | ------------------- |
| `@Dobby` (alone)                            | `introduce`         |
| `@Dobby owe` / `欠`                         | `owe`               |
| `@Dobby command` / `指令`                   | `command-list`      |
| `@Dobby participants` / `people` / `報名人` | `participants`      |
| `@Dobby next`                               | `next` (admin only) |
| `@Dobby news` / `公告`                      | `news`              |
| `@Dobby payment` / `付款`                   | `payment`           |
| `@Dobby +N` (含全形 ＋)                     | `register`          |
| `@Dobby -N` (含全形 －)                     | `unregister`        |
| `@Dobby 假`                                 | `leave`             |
| `@Dobby 銷假`                               | `cancel-leave`      |

#### 4.2 Registration Parser（高風險 — 跨平台差異）

- **規則: 一律取最後一個 type=user 的 mentionee**
- 手機版 `@Dobby @Target +1`: mentionees = `[@Dobby, @Target]` → 取 @Target
- 電腦版 `@Dobby @Target +1`: mentionees = `[@Target]` → 取 @Target
- 自己 `@Dobby +1`: mentionees = `[]` or `[@Dobby]` → isSelf = true

#### 4.3 Target Resolver（三分支）

- **isSelf**: USERS(actorUserId) → Registered name → People page
- **targetUserId**: USERS(targetUserId) → Registered name → People page
- **targetName**: USERS(Custom Name) → Registered name → People page

#### 4.4 Registration Handler (+N/-N)

1. 取得本週六事件頁面
2. `withMutex(eventPageId)` 鎖定
3. Lock 內重新讀取最新資料
4. 容量: `guestCapacity = (courts × 7) - (seasonMembers - absentees)`
5. 季租球員 +N → 加「{Name}的朋友」(+2, +3 suffix)
6. 非 admin 超額 → partial add
7. 更新 Calendar 零打 multi_select → 釋放 lock → 回覆

#### 4.5 Leave Handler (假/銷假)

- 只有季租球員能請假
- Idempotency 檢查
- 更新 Calendar 請假人 relation → 重新計算名額

#### 4.6 Info Commands

- `introduce`: textV2 + `{USER}` / `{MANAGER}` substitution
- `news`: 11 placeholder 模板替換
- `payment`: block children (bulleted_list_item)
- `owe`: People List 查未繳
- `participants`: Season Rental 報名人
- `command-list`: 硬編碼 + Quick Reply
- `next` (admin): Calendar + Season → 名額計算

---

### Phase 5: Event Handler + 歡迎訊息

- **Event Router**: message → command/auto-reply, join/memberJoined → 歡迎訊息
- **User tracking**: fire-and-forget
- **Welcome Message**: textV2 (`{NEW_FRIEND}` → 新成員, `{MANAGER}` → 管理員)

---

### Phase 6: 排程任務

#### Weekly Push

1. 下週六 + 季度 → 季度資訊 → 打球日 → 人員 + 請假 → 名額 → Push 至 2 群組

#### Display Name Update

1. 有 groups 的使用者 → LINE API (Dobby → batting fallback) → 更新 Notion

#### Cron

- `NODE_ENV !== 'test'` 時啟動

---

### Phase 7: 整合、部署與切換

**Docker**:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Zeabur**: 建立新 project → 設定環境變數 → webhook URL → LINE Console 更新

---

## n8n → TypeScript 對照表

| n8n                 | TypeScript                                |
| ------------------- | ----------------------------------------- |
| Webhook Trigger     | Express route + `@line/bot-sdk` signature |
| HTTP Request (LINE) | `@line/bot-sdk` MessagingApiClient        |
| Notion Node         | `@notionhq/client` + Repository pattern   |
| Code Node           | TypeScript 函式                           |
| IF / Switch         | if / switch                               |
| Redis SET NX        | In-process mutex (`Map`)                  |
| Schedule Trigger    | node-cron                                 |
| Sub-Workflow        | 直接函式呼叫                              |
| Data Table          | In-memory cache                           |

---

## 風險與緩解

| 風險                        | 緩解                                    |
| --------------------------- | --------------------------------------- |
| Notion Rate Limit (3 req/s) | TTL cache + p-limit + exponential retry |
| Reply Token 過期 (~1min)    | 立即 200 + fallback push                |
| 切換漏事件                  | 先測試 webhook → 一次性切換 → 保留 n8n  |
| Mutex 重啟遺失              | 原 Redis TTL=10s 等價                   |
| Notion 延遲 (200-500ms)     | 快取 + 非阻塞 tracking                  |

---

## 驗證清單

- [ ] `GET /health` → 200
- [ ] Webhook signature 驗證
- [ ] 11 個 @Dobby 指令全部正常
- [ ] `@Dobby @Target +1` 代操作
- [ ] 並發報名 → mutex（系統繁忙）
- [ ] 自動回覆（admin 跳過）
- [ ] 歡迎訊息 (textV2 mention)
- [ ] 排程推播（雙 bot）
- [ ] 顯示名稱批次更新
- [ ] n8n workflow 停用保留

---

## 需要從 n8n 取出的資料

1. **LINE Channel Secret & Access Token** (Dobby + batting) — n8n Credentials
2. **Notion Integration Token** — `.env`
3. **LINE Group IDs** — 排程推播目標群組
4. **Auto-reply 規則** — Notion TEXT_REPLY 或 n8n Data Table 匯出


