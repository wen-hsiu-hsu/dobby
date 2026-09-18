# TODO

> 時區：Asia/Taipei ｜ 季度定義：Q1=1~3月, Q2=4~6月, Q3=7~9月, Q4=10~12月
>
> 前身為 `openspec/changes/bot-logic-fixes`，已改用純 Markdown TODO 追蹤，不再使用 OpenSpec 流程。
>
> 已完成且有文件記錄的項目已從這裡移除，機制細節記錄在 `docs/registration.md`、`docs/commands.md`、`docs/architecture.md`、`docs/notion/databases.md`、`docs/schedulers.md`、`docs/adr/`。開工前先看這裡＋對應文件，避免重複踩雷。

---

## 移除雙 Bot 架構，改為單一 Bot

> 2026-09-19 確立的需求。這個服務目前**還沒上線**，使用者決定不需要維持 `dobby`/`batting` 雙 bot 架構——原本想把兩者改名成 `prod`/`lab` 表示「正式/測試」的想法已經放棄，改用 `NODE_ENV` 或其他環境變數區分即可，不透過多一個 bot identity 來做。這個任務的目標是把 `botId`（`'dobby'` / `'batting'`）這個概念從整個專案裡拿掉，只剩一個 bot。
>
> **這份清單是唯一的需求來源，開工前不用回頭問使用者「範圍是什麼」，答案都在這裡。如果執行時發現這裡沒提到的邊界情況，用「保守不動、記錄下來問」的態度處理，不要自行擴大範圍。**

### 明確排除（不在這次改動範圍內，最容易被誤判成同一件事）

`grep -rniE "dobby|batting"` 目前在 `src/` 底下有 239 處、跨 35 個檔案，但**絕大多數是 `@Dobby` 這個使用者呼叫指令的前綴、或是「Dobby」這個品牌/專案名稱，跟 `botId` 完全是兩回事，使用者明確要求要保留**：

- `src/commands/command-parser.ts`、`src/commands/registration/registration-parser.ts`（`@Dobby` 前綴判斷邏輯本身）——**完全不要動**。
- `src/commands/command-list.ts`、`src/types/commands.ts`（指令說明文字裡的 `@Dobby xxx` 範例）——不要動。
- `src/commands/registration/event-status-message.ts:45`、`src/services/welcome-message.ts:30,32`（回覆使用者的訊息文字裡提到「Dobby」「@Dobby」）——不要動。
- `src/data/auto-reply.json`、`docs/notion/databases.md`、`docs/notion/schemas/*.json`（內容/欄位說明提到 `@Dobby` 指令）——不要動。
- `src/test-utils/create-test-bot.ts`/`README.md` 裡 `bot.run('@Dobby +1', ...)` 這種呼叫指令的文字——不要動（但這個檔案裡 `handleMessage(event as any, 'dobby')` 這種**當作 botId 參數傳的 `'dobby'`** 屬於下面「範圍內」那類，兩者要分開看，不要整個檔案跳過）。
- `package.json` 的 `"name": "dobby"`、`README.md` 標題「# Dobby」——專案代稱，不要動。
- 這次**不要**引入 `prod`/`lab` 或任何新的 bot 身份命名——使用者已放棄雙 bot 改名的方向，直接移除即可，不要變成「換一個名字的雙 bot」。

### 範圍內：`botId` 概念本身要拿掉的地方

**核心路由/設定層**（這幾個檔案定義了 `botId` 這個概念本身）：
- `src/config/constants.ts:4-9`：`BOT_IDS`/`BotId` type，兩個 bot 的概念從這裡拿掉。
- `src/config/line.ts`：`dobbyClient`/`battingClient` 兩個 client + `getClient(botId)` 分派邏輯，簡化成一個 client、不用 `botId` 分派。
- `src/routes/webhook.ts:9,11`：`POST /:botId` 路由 + `?? 'dobby'` fallback，改成固定路徑（不吃 `:botId` 參數）。
- `src/middleware/line-signature.ts`：`middlewareByBotId`（`Record<BotId, RequestHandler>`）+ `isBotId()` 判斷，簡化成單一 secret 的 middleware，不用依 `botId` 選 secret。
- `src/services/line/profile-service.ts`：`getProfile()` 裡「先試 dobby client 失敗再試 batting client」的 fallback 邏輯，改成只查一個 client。
- `src/schedulers/weekly-push.ts:39`：`pushMessage(dobbyGroupId, ..., 'dobby')` 硬寫的 `'dobby'` botId 參數。

**環境變數**：
- `LINE_CHANNEL_SECRET_BATTING`、`LINE_CHANNEL_ACCESS_TOKEN_BATTING` 要從 `src/config/env.ts` schema、`.env.example`、`README.md`、`docs/development.md` 移除。
- `LINE_CHANNEL_SECRET_DOBBY`、`LINE_CHANNEL_ACCESS_TOKEN_DOBBY` 只剩一組——**這兩個變數名稱要不要順便拿掉 `_DOBBY` 後綴（改成 `LINE_CHANNEL_SECRET`/`LINE_CHANNEL_ACCESS_TOKEN`）是一個需要使用者決定的地方，見下方「需要你決定」。**

**`botId` 參數在呼叫鏈裡的傳遞範圍**（這是這次改動裡工程量最大、且有兩種做法的地方，見下方「需要你決定」）：目前 `botId: string` 這個參數貫穿了 16 個檔案的函式簽名：`command-router.ts`、`introduce.ts`、`news.ts`、`next-event.ts`、`owe.ts`、`participants.ts`、`payment.ts`、`registration/leave-handler.ts`、`registration/registration-handler.ts`、`registration/with-fresh-calendar-event.ts`、`handlers/event-router.ts`、`handlers/join-handler.ts`、`handlers/member-joined-handler.ts`、`handlers/message-handler.ts`、`services/line/push-service.ts`、`services/line/reply-service.ts`。

**測試檔案**（用 `'dobby'`/`'batting'` 當 botId 參數值的，跟上面「範圍內」的程式碼改動連動，需要跟著調整）：`src/__tests__/webhook.test.ts`、`src/handlers/__tests__/event-router.test.ts`、`src/handlers/__tests__/message-handler.test.ts`、`src/schedulers/__tests__/weekly-push.test.ts`、`src/services/line/__tests__/reply-service.test.ts`、`src/routes/__tests__/log-grouping.test.ts`、`src/commands/registration/__tests__/registration-handler.test.ts`、`src/commands/registration/__tests__/leave-handler.test.ts`、`src/commands/registration/__tests__/with-fresh-calendar-event.test.ts`、`src/test-utils/create-test-bot.ts`、`src/test-utils/setup.ts:5-8`（`setup.ts` 只留 `LINE_CHANNEL_SECRET_DOBBY`/`LINE_CHANNEL_ACCESS_TOKEN_DOBBY` 的假值，`_BATTING` 那兩行刪掉）。

**文件**：`docs/architecture.md`「雙 Bot 支援」整節（連同 2026-09-18 剛補的「batting 是測試 bot」那段一起，見下方）、`docs/overview.md` 開頭的雙 bot 敘述、`docs/development.md`/`README.md` 的環境變數表格、`docs/schedulers.md`「雙 Bot 策略」整節（`display-name-update.ts` 的 fallback 邏輯敘述）、`CLAUDE.md` 開頭「雙 bot：`dobby`/`batting`」那句、`docs/README.md`（如果目錄表有提到雙 bot）、`docs/adr/0004-guest-name-must-be-globally-unique.md`（確認裡面提到 dobby/batting 的地方是不是需要更新，不確定就照抄現況不用改，這份 ADR 的重點是別的主題）。

**既有 TODO 項目會因此變成無意義/被連帶解決**：`[5.7]`（`getClient(botId)` 沒用 `BotId` 型別限制）——這條會隨著 `getClient`/`botId` 整個拿掉而自然消失，不用另外處理，完工後直接把 `[5.7]` 從清單移除即可。

**這次順便發現、但不在這次任務範圍內的技術債**：`config/line.ts:13` 的 `getClient()` 對 `'batting'` 是直接硬寫字串比對，沒有用 `constants.ts` 的型別保護——這個問題會隨著整個 `getClient`/`botId` 拿掉而一併消失，不用單獨處理。

### 需要你決定的地方（不是能自己判斷的範圍問題）

1. **`botId` 參數要不要整個從 16 個檔案的函式簽名裡拔掉，還是只簡化路由/設定層、讓 `botId` 繼續在中間層傳遞(但永遠只有一個值)？**
   - 全拔：改動範圍最大（16 個檔案的函式簽名 + 對應測試），但沒有殘留的無意義參數，最乾淨。
   - 只簡化外層：只改 `webhook.ts`/`line-signature.ts`/`config/line.ts`/`profile-service.ts` 這幾個定義「botId 概念」的地方，中間層(`command-router.ts` 一路到 `reply-service.ts`)的 `botId: string` 參數維持原樣（傳遞一個固定的假值或空字串），風險/改動量小很多，但程式碼裡會留著一個「看起來還很重要，其實永遠是同一個值」的參數，之後可能造成誤解。
2. **`LINE_CHANNEL_SECRET_DOBBY`/`LINE_CHANNEL_ACCESS_TOKEN_DOBBY` 這兩個環境變數名稱，要不要順便拿掉 `_DOBBY` 後綴？** 只剩一個 bot 的情況下，這個後綴已經沒有區分作用，但重新命名會連動 `.env`（外部依賴，見下方）。

### 外部依賴（使用者自行處理，不屬於這次程式碼變更的驗收範圍）

- LINE Developer Console 後台的 webhook URL 設定（原本 `/webhook/dobby`、`/webhook/batting` 各自指向的 LINE Official Account）需要對應調整——**這是人工操作，不是這個 repo 能做的事**，程式碼變更完成後要提醒使用者處理。
- 正式環境（Zeabur 或使用者的伺服器）的 `.env` 需要同步移除 `_BATTING` 兩個變數（如果決定 1 選「拔掉 `_DOBBY` 後綴」，還要同步改名），**使用者自行處理**。

### 附帶調查：`NODE_ENV` 是否真的有在用（2026-09-19 確認過，不用重查）

`env.ts` schema 裡的 `NODE_ENV` 欄位（通過 zod 驗證那個）**完全沒有被讀取過，是死碼**。專案實際上繞過 `env.ts`，在 3 個地方直接讀 `process.env['NODE_ENV']`，而且這 3 個都是真的在運作、不是死碼：`src/index.ts:60`（`!== 'test'` 判斷要不要真的 `app.listen`）、`src/test-utils/setup.ts:4`（測試環境設定成 `'test'`）、`src/utils/logger.ts:6`（`isDev` 判斷決定 log 輸出格式）。這是既有 TODO `[2.6]`/`[5.8]` 記錄過的問題（繞過 `env.ts`），跟這次移除雙 bot 沒有直接關聯，**這次任務不用處理它**，但如果之後真的要用 `NODE_ENV` 取代原本雙 bot 的「正式/測試」區分角色，屆時會是把這個技術債一起清掉的自然時機，不是現在。

### 驗收標準

- [ ] `grep -rniE "\bdobby\b|\bbatting\b" src/` 只剩「明確排除」清單裡那些 `@Dobby`/品牌相關的結果，routing/設定層的結果歸零。
- [ ] `npm test`、`npx tsc --noEmit`、`npm run build` 全過。
- [ ] `.env.example` 不再有 `_BATTING` 相關變數。
- [ ] 上面列出的文件都同步更新，不再描述雙 bot 架構。
- [ ] `TODO.md` 的 `[5.7]` 一併移除。

---

## 手動測試追蹤（ngrok 接真實 LINE 帳號測試）

> dobby / batting 兩個 bot 需各測一輪（webhook 路徑與 channel secret 不同）。每項測完打勾，機器人實際回應貼進該項下方的 code block（原文照貼、保留換行），有問題另加「備註：」說明差異。

- [ ] 全形 `＋`/`－` 符號 —— 程式碼已支援（`command-parser.ts`／`registration-parser.ts` 的 `normalizeFullWidth()`），只需要實際傳 `@Dobby ＋1` 這種全形指令驗證一次即可，不需要改 code
- [ ] 清除測試產生的 Notion 假資料

---

## 已評估、不採納

- **表格驅動指令解析與路由**（`/improve-codebase-architecture` 報告候選 3，Speculative）— 評估後不採納。理由：(1) 各 command handler 簽名不一致（7 種不同形狀，從 `(replyToken, botId)` 到 `(event, delta, botId, isAdmin)`），單一表格 row 形狀塞不下這些差異；(2) 報告自己也承認 deletion test 不明確，拆掉 `command-parser.ts`/`command-router.ts` 可能只是把 switch 搬位置，不會真正集中複雜度；(3) 唯一有具體壞味道支撐的症狀（courtOverride 解析邏輯被拆到兩個 module）已用小範圍修法解決，`next?c=N` what-if 預覽見 `docs/commands.md`。若未來新增指令的頻率明顯提高、且 handler 簽名先被拉齊，可重新評估。
- **[1.2] `people-repository.ts`/`season-repository.ts`/`announcement-repository.ts` 查詢分頁處理** — 評估後不採納。目前社團規模（未結清人數、season 數、公告內容）遠低於 Notion 單頁 100 筆上限，此狀況實務上不會發生，不需為此增加分頁邏輯的複雜度。
- **[2.1] `member-joined-handler.ts` 多人同時加入群組時用 `pushMessage` 補發歡迎訊息** — 評估後不採納，不修正。原因：此專案原則上不使用 `pushMessage`（唯一例外是既有的 `weekly-push.ts` 週報推播，見 `CLAUDE.md` 專案慣例），不為此問題新增 push 用法。第一位以外的成員收不到歡迎訊息維持現況。

---

## 程式碼審查待修問題（2026-09-17 分模組審查）

> 全專案依模組（Notion 資料層 / LINE 整合 / 指令系統 / 報名請假核心 / 排程與基礎設施）分開派 subagent 審查。**完整技術細節、程式碼片段、每個模組「確認沒問題」的部分見 [`docs/code-review-2026-09-17.md`](docs/code-review-2026-09-17.md)**，章節編號（如 `[4.1]`）與下方清單一一對應。已修復且有文件記錄的項目已移除，見對應 `docs/*.md`／`docs/adr/*.md`。

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
- [ ] **[5.7] `config/line.ts:12-15` `getClient(botId)` 對未知字串靜默 fallback 回 dobbyClient，未用既有 `BotId` 型別做編譯期限制。**
- [ ] **[5.8] `utils/logger.ts:4` 直接讀 `process.env['NODE_ENV']`，繞過 `env.ts`（目前因 import 順序無實害）。**
- [ ] **[5.9] `env.ts:15` `PORT` 是 `z.string()` 用 `parseInt` 轉型，填非數字字串會得到 `NaN` 導致 `app.listen(NaN)` 監聽隨機 port 而非 fail-fast。建議改 `z.coerce.number().int().positive()`。**
- [ ] **[5.10] `data/auto-reply.json` 多組 trigger 重複出現兩次以上（「朋友」「雙胞胎」及多個哈利波特咒語），後面那組（疑似改寫成療癒語氣的版本）永遠是死碼，`findReply` 抓第一個符合就回傳。需與內容維護者確認是否刻意設計。**
- [ ] **[5.11] `user-management.ts:16-47` `_trackUserAsync` 讀取→計算→寫回沒套 `withMutex`，fire-and-forget 下同一使用者連續發訊息可能漏算訊息計數/群組清單，僅影響統計。**
