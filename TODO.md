# TODO

> 時區：Asia/Taipei ｜ 季度定義：Q1=1~3月, Q2=4~6月, Q3=7~9月, Q4=10~12月
>
> 前身為 `openspec/changes/bot-logic-fixes`，已改用純 Markdown TODO 追蹤，不再使用 OpenSpec 流程。
>
> 已完成且有文件記錄的項目已從這裡移除，機制細節記錄在 `docs/registration.md`、`docs/commands.md`、`docs/architecture.md`、`docs/notion/databases.md`、`docs/schedulers.md`、`docs/adr/`。開工前先看這裡＋對應文件，避免重複踩雷。

---

## 手動測試追蹤（ngrok 接真實 LINE 帳號測試）

> dobby / batting 兩個 bot 需各測一輪（webhook 路徑與 channel secret 不同）。每項測完打勾，機器人實際回應貼進該項下方的 code block（原文照貼、保留換行），有問題另加「備註：」說明差異。

- [ ] 全形 `＋`/`－` 符號 —— 程式碼已支援（`command-parser.ts`／`registration-parser.ts` 的 `normalizeFullWidth()`），只需要實際傳 `@Dobby ＋1` 這種全形指令驗證一次即可，不需要改 code
- [ ] 清除測試產生的 Notion 假資料

---

## 已評估、不採納

- **表格驅動指令解析與路由**（`/improve-codebase-architecture` 報告候選 3，Speculative）— 評估後不採納。理由：(1) 各 command handler 簽名不一致（7 種不同形狀，從 `(replyToken, botId)` 到 `(event, delta, botId, isAdmin)`），單一表格 row 形狀塞不下這些差異；(2) 報告自己也承認 deletion test 不明確，拆掉 `command-parser.ts`/`command-router.ts` 可能只是把 switch 搬位置，不會真正集中複雜度；(3) 唯一有具體壞味道支撐的症狀（courtOverride 解析邏輯被拆到兩個 module）已用小範圍修法解決，`next?c=N` what-if 預覽見 `docs/commands.md`。若未來新增指令的頻率明顯提高、且 handler 簽名先被拉齊，可重新評估。

---

## 程式碼審查待修問題（2026-09-17 分模組審查）

> 全專案依模組（Notion 資料層 / LINE 整合 / 指令系統 / 報名請假核心 / 排程與基礎設施）分開派 subagent 審查。**完整技術細節、程式碼片段、每個模組「確認沒問題」的部分見 [`docs/code-review-2026-09-17.md`](docs/code-review-2026-09-17.md)**，章節編號（如 `[4.1]`）與下方清單一一對應。已修復且有文件記錄的項目已移除，見對應 `docs/*.md`／`docs/adr/*.md`。

### 🟡 Medium

- [ ] **[1.2] `people-repository.ts:32-37`、`season-repository.ts:32-35`、`announcement-repository.ts:25-28` 資料庫查詢/blocks 抓取沒處理 Notion 分頁（`has_more`/`next_cursor`）。** 未結清人數、season 數、公告內容超過 100 筆時會被靜默丟棄且無錯誤訊息。修法方向：補上分頁迴圈或至少加 log 提示可能被截斷。

- [ ] **[1.3] `calendar-repository.ts:33-38`、`people-repository.ts:17-22` `findByPageIds` 用 `Promise.all` 完全平行呼叫 Notion，違反「批次操作要加 delay」慣例（對照 `display-name-update.ts` 的 400ms），且 `notion-fetch.ts:30-36` 對 429 沒有 `Retry-After` 重試。** 修法方向：比照 `display-name-update.ts` 加節流，並在 `notion-fetch.ts` 對 429 做基本重試。

- [ ] **[1.4] `season-repository.ts:13-14,16` `courts`/`guestFee`/`weekCounts` 用 `?? 預設值` 掩蓋 Notion 欄位缺值（如忘填「場地數」會悄悄用 2 片場地算容量），與同函式內 formula 欄位保留 `null` 的處理方式不一致。** 修法方向：缺值時至少 log 警告，或讓後續邏輯明確處理 `null` 而非猜測預設值。

- [ ] **[2.1] `member-joined-handler.ts:12-21` 多人同時加入群組時，迴圈對同一個 `event.replyToken` 重複呼叫 `replyMessage`，LINE replyToken 只能用一次。** 第一位以外的成員收不到歡迎訊息且無告警（`reply-service.ts` 靜默 warn）。修法方向：迴圈內第一次用 `replyMessage`，其餘用 `pushMessage`（handler 已知道 `groupId`）。

- [ ] **[2.2] `message-handler.ts:22` `findByUserId` 沒有 try/catch，與其他 command handler 不一致。** Notion 在判斷 admin 身分的早期呼叫失敗時，例外會一路丟到外層只記 log，使用者完全收不到任何回應。修法方向：比照 `owe.ts`/`news.ts` 等，包 try/catch 並回覆「系統錯誤，請稍後再試」。

- [ ] **[2.3] `line-signature.ts:11-13` 未知 `botId`（webhook URL 打錯字/大小寫錯）靜默 fallback 用 Dobby 的 channel secret 驗簽，而非明確拒絕。** 且全專案沒有 Express 錯誤處理 middleware，驗簽失敗只會落到預設處理，難以定位根因。修法方向：`botId` 不在白名單時直接回 404；補上全域錯誤處理 middleware。

- [ ] **[3.1] `payment.ts:5-16` 自己重複定義了一份 `blocksToText()`，漏了 `bulleted_list_item` 補 `• ` 前綴的邏輯（commit `fb72fbd` 只改了 `introduce.ts`/`news.ts`，漏改這裡）。** `docs/commands.md` 明確寫 payment 支援 bulleted list，目前不支援且無測試覆蓋。修法方向：改用共用 `src/services/notion/blocks-to-text.ts`，並比照 `news.test.ts` 補項目符號測試案例。

- [ ] **[3.2] `command-parser.ts:12,15,90` `parseCommand`/`isCommand` 用大小寫敏感的 `startsWith('@Dobby')` 守門，但剝離前綴卻用 `/^@Dobby\s*/i` 忽略大小寫——這段大小寫容忍其實是死碼，實際不支援手動打字 `@dobby +1`。** 修法方向：決定要不要真的支援大小寫不敏感輸入，兩處判斷邏輯要一致（要嘛都不分大小寫，要嘛拿掉誤導性的 `/i`）。

- [ ] **[4.4] `registration-handler.ts`（`handleRegistration`）完全沒有測試檔，這是串起 mutex + 容量計算 + Notion 寫入的主流程，也是 `[4.1]`/`[4.2]`/`[4.3]` 實際發生的入口。** 修法方向：比照 `leave-handler.test.ts` 補上，驗證 mutex lock key、`calendarRepo.updateGuests` 呼叫參數、cappedAt 標題文案等。

- [ ] **[5.3] `display-name-update.ts:11` 查詢 USERS 資料庫沒有分頁處理，使用者數超過 100 時後面的人永遠不會被排程處理到；且直接呼叫 `notionPost` 繞過 repository 慣例。** 修法方向：補分頁迴圈，並改走 `users-repository.ts`（可能需要新增一個分頁安全的 list-all 函式）。

- [ ] **[5.4] `display-name-update.ts:10-34` 整個迴圈包在單一 try/catch，任一筆使用者更新失敗會中斷整批，後面排隊的人當週全部不會被處理，無 retry。** 修法方向：改成逐筆 try/catch，單筆失敗只 log 該筆錯誤並繼續下一筆。

### 🟢 Low

- [ ] **[1.5] `users-repository.ts:78-82` `incrementMessageCount` + `user-management.ts:47` 讀取→計算→寫回沒套 `withMutex`，連續訊息可能遺失計數。** 僅影響統計欄位，非報名核心邏輯，優先度低。
- [ ] **[1.6] `blocks-to-text.ts` 不遞迴處理 `has_children` 區塊，公告若用 toggle/巢狀清單會整段被靜默丟掉。**
- [ ] **[1.7] `season-repository.ts:32-35` `findAll()` 全專案找不到呼叫點，疑似死碼，建議清掉或補上呼叫端。**
- [ ] **[2.4] `member-joined-handler.ts:16` 來源是 `room`（非 `group`）時跳過 profile 查詢，歡迎訊息直接顯示 userId 而非暱稱，其實 `getProfile` 支援不帶 groupId 查詢。**
- [ ] **[2.5] `webhook.ts:12-13` `req.body.events` 用 `as` 斷言掩蓋型別，沒有執行期防呆，欄位缺失會同步拋 TypeError。**
- [ ] **[2.6] `index.ts:14` 直接讀 `process.env['NODE_ENV']`，沒有走 `env.ts`，違反慣例（目前無實害）。**
- [ ] **[3.3] `command-parser.ts:37-45` mention 分支用無錨點 regex（`/[+\-]\d+/`、`/假\|銷假/`）掃整個 body，若代操作目標的暱稱含 `-1`/`+2`/「假」字可能誤判指令類型。**
- [ ] **[3.4] `command-parser.ts:63` `body.startsWith('next')` 沒有字界檢查，任何 next 開頭訊息都被當 NEXT_EVENT（非安全問題，UX 小瑕疵）。**
- [ ] **[3.5] 指令系統測試覆蓋缺口：`command-router.ts`/`command-list.ts`/`owe.ts`/`participants.ts`/`payment.ts`/`introduce.ts` 都沒有對應測試檔。**
- [ ] **[4.5] `capacity-calculator.ts:46-52` 名額為負數時錯誤訊息顯示負數（如「剩餘 -3 個名額」），純顯示問題。**
- [ ] **[4.6] `delta=0`（`+0`/`-0`）邊界情況：目標已有報名時仍會多打一次無意義的 Notion 寫入並回「取消報名成功」，但實際什麼都沒變；目標無報名時則正常回錯誤，行為不一致。**
- [ ] **[4.7] 一般成員打錯目標語法（漏了 `@`）會收到「你不是管理員」而非「指令格式錯誤」——`handleRegistration` 的管理員檢查順序在 `parseError` 檢查之前，容易誤導使用者，非安全問題。**
- [ ] **[5.6] `log-cleanup.ts:27-28`/`log-reader.ts:28-30` 檔名日期用 UTC 解析、cutoff 用伺服器本地時區算，時區來源不一致。目前容器預設 UTC 無偏差，若未來把 TZ 設成 Asia/Taipei 會有最多 8 小時邊界誤差。**
- [ ] **[5.7] `config/line.ts:12-15` `getClient(botId)` 對未知字串靜默 fallback 回 dobbyClient，未用既有 `BotId` 型別做編譯期限制。**
- [ ] **[5.8] `utils/logger.ts:4` 直接讀 `process.env['NODE_ENV']`，繞過 `env.ts`（目前因 import 順序無實害）。**
- [ ] **[5.9] `env.ts:15` `PORT` 是 `z.string()` 用 `parseInt` 轉型，填非數字字串會得到 `NaN` 導致 `app.listen(NaN)` 監聽隨機 port 而非 fail-fast。建議改 `z.coerce.number().int().positive()`。**
- [ ] **[5.10] `data/auto-reply.json` 多組 trigger 重複出現兩次以上（「朋友」「雙胞胎」及多個哈利波特咒語），後面那組（疑似改寫成療癒語氣的版本）永遠是死碼，`findReply` 抓第一個符合就回傳。需與內容維護者確認是否刻意設計。**
- [ ] **[5.11] `user-management.ts:16-47` `_trackUserAsync` 讀取→計算→寫回沒套 `withMutex`，fire-and-forget 下同一使用者連續發訊息可能漏算訊息計數/群組清單，僅影響統計。**
