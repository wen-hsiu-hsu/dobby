## 1. 專案骨架與基礎設施

- [x] 1.1 `npm init` + 安裝依賴（express, @line/bot-sdk, @notionhq/client, node-cron, pino, zod, typescript）
- [x] 1.2 安裝開發依賴（vitest, supertest, @types/*, tsx, tsup）
- [x] 1.3 設定 `tsconfig.json`（strict mode, ESM output）
- [x] 1.4 設定 `vitest.config.ts`
- [x] 1.5 建立 `src/config/env.ts`：zod schema 驗證所有必要環境變數，啟動時 fail-fast
- [x] 1.6 建立 `src/config/constants.ts`：COURTS_DENSITY=7、MANAGER_USER_ID 等業務常數
- [x] 1.7 建立 `src/utils/logger.ts`：pino logger
- [x] 1.8 建立 `src/config/line.ts`：Dobby 與 batting 兩個 MessagingApiClient 實例
- [x] 1.9 建立 `src/index.ts`：Express app 主入口，掛載 routes，啟動 cron（非 test 環境）
- [x] 1.10 建立 `src/routes/health.ts`：GET /health → 200 `{ status: "ok" }`
- [x] 1.11 建立 `src/middleware/line-signature.ts`：raw body 解析 + LINE signature 驗證，依 botId 選擇 channel secret
- [x] 1.12 建立 `src/routes/webhook.ts`：POST /webhook/:botId，立即 200，fire-and-forget processEvents
- [x] 1.13 建立 `Dockerfile`（multi-stage：builder + runtime）
- [x] 1.14 建立 `docker-compose.yml`（本地開發用）
- [x] 1.15 建立 `.env.example`

## 2. Auto-reply 資料轉換

- [x] 2.1 寫一次性轉換 script：將 `Dobby auto reply.csv` 轉換為 `src/data/auto-reply.json`（格式：`[{ trigger, reply }]`）
- [x] 2.2 執行 script，驗證 494 筆資料正確轉入 JSON（包含重複 trigger 的順序）

## 3. Notion Repository 層

- [x] 3.1 建立 `src/services/notion/notion-client.ts`：@notionhq/client singleton
- [x] 3.2 建立 `src/services/notion/property-helpers.ts`：所有 Notion property 讀寫轉換函式（getRichText, getTitle, getMultiSelect, getRelation, getNumber, getCheckbox, getDate, setRichText, setMultiSelect, setRelation）
- [x] 3.3 建立 `src/types/notion-models.ts`：NotionUser, CalendarEvent, SeasonRecord, PersonRecord 型別定義
- [x] 3.4 建立 `src/services/notion/users-repository.ts`：findByUserId, findByCustomName, create, update, incrementMessageCount
- [x] 3.5 建立 `src/services/notion/people-repository.ts`：findByPageIds, findByName
- [x] 3.6 建立 `src/services/notion/calendar-repository.ts`：findByDate, updateAbsentees（add/remove），updateGuests（零打 multi_select）
- [x] 3.7 建立 `src/services/notion/season-repository.ts`：findByName（季租時段 title）
- [x] 3.8 建立 `src/services/notion/announcement-repository.ts`：findByName + getBlocks（blocks.children）
- [x] 3.9 撰寫 property-helpers 單元測試（各 property 型別的讀寫轉換）

## 4. 核心服務層

- [x] 4.1 建立 `src/services/mutex.ts`：Map-based in-process mutex，`withMutex(key, fn)` API，10秒 timeout 自動釋放
- [x] 4.2 建立 `src/services/line/reply-service.ts`：Reply API wrapper，失敗時 fallback Push API
- [x] 4.3 建立 `src/services/line/push-service.ts`：Push API wrapper（Dobby / batting 客戶端）
- [x] 4.4 建立 `src/services/line/profile-service.ts`：getProfile(userId, groupId)，Dobby → batting fallback
- [x] 4.5 建立 `src/services/user-management.ts`：非阻塞使用者追蹤（新建/更新 USERS，groups/multi-chat merge）
- [x] 4.6 建立 `src/services/auto-reply.ts`：從 auto-reply.json 載入規則，`findReply(text)` case-sensitive includes
- [x] 4.7 建立 `src/services/welcome-message.ts`：textV2 builder（{USER} / {MANAGER} substitution）
- [x] 4.8 建立 `src/utils/date-utils.ts`：getNextSaturday(), getQuarter(), formatDate(), getNextSaturdayDateText()
- [x] 4.9 撰寫 mutex 單元測試（lock 取得、busy 回傳、10秒 timeout、finally 釋放）
- [x] 4.10 撰寫 date-utils 單元測試

## 5. 指令系統

- [x] 5.1 建立 `src/types/commands.ts`：CommandType enum、ParsedCommand、RegistrationTarget 型別
- [x] 5.2 建立 `src/commands/command-parser.ts`：解析 @Dobby 指令文字，識別 CommandType，支援全形 ＋／－
- [x] 5.3 建立 `src/commands/registration/registration-parser.ts`：解析 mentionees（手機版/電腦版差異），決定 isSelf / targetUserId / targetName
- [x] 5.4 建立 `src/commands/registration/target-resolver.ts`：三分支（self / mention userId / name）→ People List pageId
- [x] 5.5 建立 `src/commands/registration/capacity-calculator.ts`：零打名額計算，season member +N 的 "{Name}的朋友" 邏輯
- [x] 5.6 建立 `src/commands/registration/registration-handler.ts`：+N/-N 完整流程（mutex → 讀資料 → 計算 → 更新 → 回覆）
- [x] 5.7 建立 `src/commands/registration/leave-handler.ts`：假/銷假流程（season member 檢查 → idempotency → 更新 absentees → 回覆）
- [x] 5.8 建立 `src/commands/introduce.ts`：從 Notion 取 INTRODUCE 公告 blocks → 組 textV2 訊息
- [x] 5.9 建立 `src/commands/owe.ts`：查詢 People List 未繳費名單 → 回覆
- [x] 5.10 建立 `src/commands/command-list.ts`：hardcoded 指令列表文字 + QuickReply buttons
- [x] 5.11 建立 `src/commands/participants.ts`：查詢當季 Season 報名人 → 回覆
- [x] 5.12 建立 `src/commands/next-event.ts`：admin-only，查詢下週六資訊（支援 ?-=N&c=N query params）
- [x] 5.13 建立 `src/commands/news.ts`：查詢最新公告 blocks（11 個 placeholder 模板替換）
- [x] 5.14 建立 `src/commands/payment.ts`：查詢付款資訊 blocks → 回覆
- [x] 5.15 建立 `src/commands/command-router.ts`：依 CommandType 分派至對應 handler
- [x] 5.16 撰寫 command-parser 單元測試（所有指令匹配、全形字符、mentionee 解析）
- [x] 5.17 撰寫 capacity-calculator 單元測試（一般、超額、暫停、無 event 情境）
- [x] 5.18 撰寫 registration-parser 單元測試（self / mention / name / error 情境）

## 6. Event Handler 整合

- [x] 6.1 建立 `src/handlers/event-router.ts`：依 event.type 分派（message / join / memberJoined）
- [x] 6.2 建立 `src/handlers/message-handler.ts`：is command → command-router；否則 → auto-reply（admin skip）
- [x] 6.3 建立 `src/handlers/join-handler.ts`：join event → 歡迎訊息（textV2）
- [x] 6.4 建立 `src/handlers/member-joined-handler.ts`：memberJoined → 歡迎訊息（textV2 + mention）
- [x] 6.5 整合 user-management fire-and-forget 至 message-handler（從 event source 判斷 groups/multi-chat）

## 7. 排程任務

- [x] 7.1 建立 `src/schedulers/weekly-push.ts`：週日 09:00 Asia/Taipei，查詢下週六資訊，推播至 Dobby 群組
- [x] 7.2 建立 `src/schedulers/display-name-update.ts`：週一 04:00 Asia/Taipei，批次更新 USERS Custom Name
- [x] 7.3 在 `src/index.ts` 中於 `NODE_ENV !== 'test'` 條件下啟動兩個 cron jobs

## 8. Integration 測試

- [x] 8.1 撰寫 webhook endpoint 整合測試：valid/invalid signature，200 立即回應
- [x] 8.2 撰寫 command 整合測試：mock Notion + LINE API，驗證 @Dobby 各指令 end-to-end 回覆
- [x] 8.3 撰寫報名/請假完整流程測試：mock mutex、Notion 更新驗證
- [x] 8.4 撰寫 auto-reply 整合測試：keyword match、admin skip

## 9. 部署與切換

- [ ] 9.1 在 Zeabur 建立新 project，設定所有環境變數
- [ ] 9.2 部署 Docker image，驗證 GET /health → 200
- [ ] 9.3 以測試群組 shadow test：設定 LINE webhook → 新 server，驗證所有指令
- [ ] 9.4 正式切換：LINE Console 更新 Dobby webhook URL → 新 server
- [ ] 9.5 觀察 7 天後停用 n8n workflows
