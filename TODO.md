# TODO

> 時區：Asia/Taipei ｜ 季度定義：Q1=1~3月, Q2=4~6月, Q3=7~9月, Q4=10~12月
>
> 前身為 `openspec/changes/bot-logic-fixes`，已改用純 Markdown TODO 追蹤，不再使用 OpenSpec 流程。
>
> 已完成且有文件記錄的項目已從這裡移除，機制細節記錄在 `docs/registration.md`、`docs/commands.md`、`docs/architecture.md`、`docs/notion/databases.md`、`docs/schedulers.md`、`docs/adr/`。開工前先看這裡＋對應文件，避免重複踩雷。

---

## 手動測試追蹤（ngrok 接真實 LINE 帳號測試）

> 每項測完打勾，機器人實際回應貼進該項下方的 code block（原文照貼、保留換行），有問題另加「備註：」說明差異。

- [ ] 全形 `＋`/`－` 符號 —— 程式碼已支援（`command-parser.ts`／`registration-parser.ts` 的 `normalizeFullWidth()`），只需要實際傳 `@Dobby ＋1` 這種全形指令驗證一次即可，不需要改 code
- [ ] 清除測試產生的 Notion 假資料

---

## 已評估、不採納

- **表格驅動指令解析與路由**（`/improve-codebase-architecture` 報告候選 3，Speculative）— 評估後不採納。理由：(1) 各 command handler 簽名不一致（7 種不同形狀，從 `(replyToken, botId)` 到 `(event, delta, botId, isAdmin)`），單一表格 row 形狀塞不下這些差異；(2) 報告自己也承認 deletion test 不明確，拆掉 `command-parser.ts`/`command-router.ts` 可能只是把 switch 搬位置，不會真正集中複雜度；(3) 唯一有具體壞味道支撐的症狀（courtOverride 解析邏輯被拆到兩個 module）已隨 `next?c=N` what-if 預覽功能整個移除而不復存在，不只是修好。若未來新增指令的頻率明顯提高、且 handler 簽名先被拉齊，可重新評估。
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
- [ ] **[2.5] `webhook.ts:11` `req.body.events` 用 `as` 斷言掩蓋型別，沒有執行期防呆，欄位缺失會同步拋 TypeError。**
- [ ] **[2.6] `index.ts:14` 直接讀 `process.env['NODE_ENV']`，沒有走 `env.ts`，違反慣例（目前無實害）。**
- [ ] **[3.3] `command-parser.ts:37-45` mention 分支用無錨點 regex（`/[+\-]\d+/`、`/假\|銷假/`）掃整個 body，若代操作目標的暱稱含 `-1`/`+2`/「假」字可能誤判指令類型。**
- [ ] **[3.5] 指令系統測試覆蓋缺口（2026-09-22 重新核實，這條記錄時效已過期，请以此為準）：`payment.ts`（已有 `payment.test.ts`，80% coverage）、`command-list.ts`（100%）、`introduce.ts`（76%，皆透過其他測試間接 import 覆蓋）其實已經有覆蓋，原始描述不準確。真正還是 0% 沒有任何測試的只剩 `owe.ts`、`participants.ts`；`command-router.ts` 本身也還沒有專屬測試檔（52% coverage，只靠 `command-integration.test.ts` 間接覆蓋部分指令）。這三項的完整背景與待辦見下方新章節「測試涵蓋率與有效性待補強」。**
- [ ] **[4.5] `capacity-calculator.ts:46-52` 名額為負數時錯誤訊息顯示負數（如「剩餘 -3 個名額」），純顯示問題。**
- [ ] **[4.6] `delta=0`（`+0`/`-0`）邊界情況：目標已有報名時仍會多打一次無意義的 Notion 寫入並回「取消報名成功」，但實際什麼都沒變；目標無報名時則正常回錯誤，行為不一致。**
- [ ] **[4.7] 一般成員打錯目標語法（漏了 `@`）會收到「你不是管理員」而非「指令格式錯誤」——`handleRegistration` 的管理員檢查順序在 `parseError` 檢查之前，容易誤導使用者，非安全問題。**
- [ ] **[5.8] `utils/logger.ts:4` 直接讀 `process.env['NODE_ENV']`，繞過 `env.ts`（目前因 import 順序無實害）。**
- [ ] **[5.9] `env.ts:15` `PORT` 是 `z.string()` 用 `parseInt` 轉型，填非數字字串會得到 `NaN` 導致 `app.listen(NaN)` 監聽隨機 port 而非 fail-fast。建議改 `z.coerce.number().int().positive()`。**
- [ ] **[5.10] `data/auto-reply.json` 多組 trigger 重複出現兩次以上（「朋友」「雙胞胎」及多個哈利波特咒語），後面那組（疑似改寫成療癒語氣的版本）永遠是死碼，`findReply` 抓第一個符合就回傳。需與內容維護者確認是否刻意設計。**
- [ ] **[5.11] `user-management.ts:16-47` `_trackUserAsync` 讀取→計算→寫回沒套 `withMutex`，fire-and-forget 下同一使用者連續發訊息可能漏算訊息計數/群組清單，僅影響統計。**

---

## 測試涵蓋率與有效性待補強（2026-09-22 測試分析）

> 背景：這次分析派了兩個 subagent 分別檢視「現有測試的品質/涵蓋率」與「測試假資料（fixtures/mock）跟真實 Notion/LINE 運作之間的落差」。結論：`npm test` 全數通過（39 檔案、331 測試），`npm run test:coverage` 整體 statement coverage 83.5%，但涵蓋率數字本身會掩蓋「測試存在但驗證薄弱」跟「mock 跟真實行為有落差」這兩類問題，所以另外開一個章節記錄具體缺口，避免跟 [3.5] 那種已經過時、籠統的描述混在一起。
>
> **這個章節下的每一項都只需要補測試，不需要改動 production 邏輯**，除非項目內特別註明「同時需要修正」。接手的人不需要回頭問為什麼要做這些、原本是怎麼發現的——下面已經把背景、風險、要驗證的情境都寫清楚了。

### 🟡 Medium

- [ ] **`owe.ts`、`participants.ts` 完全没有測試檔（coverage 0%），是目前指令系統裡兩個測試死角。**
  兩個 handler 都很單純（`src/commands/owe.ts`、`src/commands/participants.ts`，各約 20 行）：`owe.ts` 呼叫 `peopleRepo.findAllUnpaid()` 列出未繳費名單；`participants.ts` 呼叫 `seasonRepo.findByName()` + `peopleRepo.findByPageIds()` 列出當季報名成員。兩者都有 try/catch 包住、失敗時回覆「系統錯誤，請稍後再試」。
  需要驗證的情境（可參考 `src/commands/__tests__/news.test.ts` 或 `payment.test.ts` 的寫法跟 mock 方式）：
  - `owe.ts`：無人欠費時回「目前沒有未繳費成員 🎉」；有欠費名單時訊息格式正確（編號 + 姓名，換行分隔）；repository 拋錯時回系統錯誤訊息而不是讓例外往外丟。
  - `participants.ts`：當季 season 找不到時回「找不到 XX 季租資料」；season 存在但 `members` 是空陣列時回「目前沒有報名成員」；正常情境下訊息含正確人數與名單；repository 拋錯時的錯誤處理。
  - 兩個測試檔都應該用 `createTestBot`（`src/test-utils/`），比照 `command-integration.test.ts` 或 `news.test.ts` 的既有寫法，不需要另外設計新的測試手法。
  - 完成後用 `npm run test:coverage` 確認這兩個檔案的 coverage 從 0% 提升到跟其他 command handler 相近的水準（80% 以上）。

- [ ] **LINE webhook 簽章驗證（HMAC signature）從來沒有被自動化測試真正執行過，目前唯一驗證過這條路徑的方式是人工用 ngrok 接真實 LINE 帳號手動測試。**
  背景：`src/webhook.ts:9` 的路由掛了 `lineSignatureMiddleware`（`src/middleware/line-signature.ts`，本質是 `@line/bot-sdk` 的 `middleware()`，用 `LINE_CHANNEL_SECRET` 驗證請求簽章）。但 `src/__tests__/webhook.test.ts` 開頭直接用 `vi.mock('@line/bot-sdk', ...)` 把整個 `middleware()` 換成一個永遠 `next()` 放行、只負責把 raw body parse 成 JSON 的假中介層（理由寫在該檔案的註解裡：要繞過簽章驗證,同時還原「middleware 也負責 parse body」這個副作用，因為 `index.ts` 沒有另外掛 `express.json()`）。也就是說「壞簽章 / 沒有簽章的請求會被擋下」這件事，全專案目前沒有任何一個自動化測試覆蓋到。
  為什麼重要：這是唯一對外開放、不需要登入就能打的 HTTP endpoint，如果之後有人改動 `webhook.ts` 的 middleware 掛載順序、或不小心把簽章驗證繞過去，現有測試套件完全不會示警，只能等下次剛好有人手動用 ngrok 測試，或是等真實環境被打偽造請求才會發現。
  需要驗證的情境（不用 mock 掉 `@line/bot-sdk` 的 `middleware`，改成用真實的 `LINE_CHANNEL_SECRET` 產生正確/錯誤的 `X-Line-Signature`）：
  - 帶正確簽章的請求會通過並讓 `processEvents` 被呼叫（可以繼續 mock `event-router.js` 驗證有沒有被呼叫，這部分不用動）。
  - 帶錯誤/被竄改簽章的請求會被擋下（回 4xx，且 `processEvents` 沒有被呼叫）。
  - 完全沒帶 `X-Line-Signature` header 的請求會被擋下。
  - 這需要新增一個獨立測試檔（例如 `src/__tests__/webhook-signature.test.ts`），跟現有 `webhook.test.ts` 分開，因為兩者對 `@line/bot-sdk` 的 mock 策略互相衝突（一個要 mock 掉、一個要用真的），不要嘗試合併成同一個檔案。

- [ ] **`withMutex` 鎖跟報名/請假的完整 command handler 流程沒有整合測試驗證併發情境，目前 mutex 只有「純函式層」的單元測試。**
  背景：`src/services/mutex.ts` 本身有很扎實的單元測試（`src/services/__tests__/mutex.test.ts`，用 `vi.useFakeTimers()` 驗證了排隊順序、逾時後背景任務仍需跑完才換下一個任務等細節）。但 `src/test-utils/create-test-bot.ts:197` 為了讓一般指令測試好寫，把 `withMutex` mock 成「直接執行 callback、不真的排隊」的 no-op（`notionPatch` 也永遠 mock 成 `resolves({})`）。這代表所有透過 `createTestBot` 寫的報名/請假測試（包含 `registration-handler.test.ts`、`leave-handler.test.ts`），驗證的都是「假設鎖已經拿到之後」的業務邏輯，從來沒有測過「兩個人同時對同一天送出 `+1`」這種真實併發情境下，command handler 層有沒有正確依賴鎖的 key（活動日期字串）序列化執行、有沒有可能因為某個分支忘記包進 `withMutex` 而產生 race condition。
  需要驗證的情境：
  - 用真的 `withMutex`（不 mock，或只 mock 更底層的 `notionPatch`/`notion-fetch`）驅動 `handleRegistration`／`handleLeave`，模擬兩個「幾乎同時」對同一天發出的報名/請假請求，驗證兩次寫入是依序執行、不會互相覆蓋對方的計算結果（例如 A 跟 B 同時 +1，最終名額要正確扣兩次，不是只扣一次）。
  - 驗證不同日期的請求不會互相阻塞（鎖的 key 是活動日期字串，不同天應該平行執行,可參考 `mutex.test.ts` 裡「多個 key 互相獨立」的驗證方式）。
  - 這類測試建議獨立成新檔案（例如 `src/commands/registration/__tests__/registration-concurrency.test.ts`），不需要動到 `create-test-bot.ts` 既有的 no-op mock（那個 mock 對其他一般測試而言是合理的簡化，不要為了這個需求去改動它，影響範圍太大）。

### 🟢 Low

- [ ] **`capacity-calculator.ts` 缺少「`event.guests` 已經含有同一個 `targetName` 先前條目」情境的回歸測試。**
  重要澄清：這個「訪客命名重複」的 bug 本身**已經修好了**，不是還沒修——`docs/code-review-2026-09-17.md` 4.3 節描述的問題（同一人分兩次 `+1`，第二次呼叫又從 0 開始編號，導致「Bob的朋友」重複兩筆、被 Notion multi_select 靜默去重、憑空少一筆報名）已經在 `capacity-calculator.ts` 用 `findMaxExistingIndex()`（`capacity-calculator.ts:34-60`）修掉了，`calculateAddCapacity()`（`capacity-calculator.ts:100-104`）呼叫時會先掃描 `event.guests` 找出這個 targetName 已經用到的最大編號才接續往下編號，甚至還加了一段防禦性的重複偵測跟 `logger.warn`（`capacity-calculator.ts:118-133`）。**接手這項的人不需要、也不應該重新修這個邏輯**，只需要補上保護這段邏輯的回歸測試。
  需要驗證的情境（純函式測試，不需要透過 `createTestBot`，直接呼叫 `calculateAddCapacity` 即可，參考現有 `src/commands/registration/__tests__/capacity-calculator.test.ts` 的寫法）：
  - `event.guests` 傳入時已經含有 `"Bob的朋友"`（季租成員朋友情境）,再呼叫一次 `calculateAddCapacity(..., targetName: "Bob", delta: 1, isSelfSeasonMember: true)`，預期新產生的條目是 `"Bob的朋友2"` 而不是重複的 `"Bob的朋友"`。
  - 同樣情境但非季租成員命名（`"Alice"` / `"Alice 2"` 那種空格分隔格式）。
  - `event.guests` 已經含有 `"Bob的朋友"` 跟 `"Bob的朋友2"` 兩筆，再新增應該接續產生 `"Bob的朋友3"`。
  - 確認 `duplicates` 防禦性偵測那段邏輯：如果刻意構造出會產生重複字串的情境，`logger.warn` 有沒有被呼叫（可以 mock `../../utils/logger.js` 來斷言）。
  - 現有 `capacity-calculator.test.ts` 目前只測了「`event.guests` 起始為空」的情境（見該測試檔），這些新案例是要補進同一個檔案，不是取代既有測試。

- [ ] **`command-router.ts` 沒有專屬的 dispatch 測試檔，只靠 `src/__tests__/command-integration.test.ts` 間接覆蓋部分指令類型，目前 coverage 52%。**
  背景：`command-router.ts` 是一個單純的 `switch (command.type)` 分派表（`src/command-router.ts:24-60`），把 `CommandType` enum（定義在 `src/types/commands.ts`，共 10 種：`REGISTRATION`/`LEAVE`/`CANCEL_LEAVE`/`INTRODUCE`/`OWE`/`COMMAND_LIST`/`PARTICIPANTS`/`NEXT_EVENT`/`NEWS`/`PAYMENT`，加上 fallback 的 `UNKNOWN`）分派到對應的 handler。`command-integration.test.ts` 目前只驗證了少數幾種指令（`command`、空字串→INTRODUCE 等），沒有把 10 種指令類型都跑過一遍，也沒有專門測「未知指令會被安靜忽略、不會呼叫任何 handler」這個 default 分支，更沒有驗證 `REGISTRATION` 分支裡 `delta` 字串解析（`command-router.ts:47`，`parseInt(command.delta ?? '+1', 10)`）在邊界輸入（例如 `delta` 是 `undefined`、空字串）下的行為。
  為什麼重要：這張分派表是新增指令流程（`CLAUDE.md`「專案慣例」列的 5 步驟之一）的最後一步，如果之後改動時不小心打錯 `CommandType` 或漏接某個 case，沒有專屬測試會讓這個迴歸只能等到真實使用者送出該指令沒反應才發現。
  需要驗證的情境：
  - 對 10 種 `CommandType`（不含 `UNKNOWN`）逐一驗證 `routeCommand` 有呼叫到「且只呼叫到」對應的 handler（可以把各 handler 模組整個 `vi.mock()` 掉再斷言呼叫次數與參數，不需要透過 `createTestBot` 走完整 Notion mock）。
  - `UNKNOWN` 類型不會呼叫任何 handler（也不會拋例外）。
  - `REGISTRATION`/`LEAVE`/`CANCEL_LEAVE` 這三種有額外參數處理的分支（`delta` 解析、`isCancel` 布林值）要驗證有正確傳給 `handleRegistration`/`handleLeave`。
  - 這個測試檔案建議命名 `src/commands/__tests__/command-router.test.ts`，跟其他 command handler 測試放在同一層。

- [ ] **批次 Notion 寫入之間的 400ms 節流延遲（因應 Notion API ~3 req/s rate limit 的慣例做法）沒有任何測試斷言它真的有執行，目前純靠人工審查程式碼有沒有照著慣例寫。**
  背景：專案慣例（`CLAUDE.md`）要求批次操作間要加 delay，目前已知的兩處實作是 `src/services/notion/calendar-repository.ts:40`（迴圈裡 `if (i > 0) await new Promise((r) => setTimeout(r, 400))`）跟 `src/schedulers/display-name-update.ts:63`（同樣的 400ms delay）。這兩處都沒有測試驗證這段 delay 真的存在、真的在每一筆之間執行（而不是被重構時不小心刪掉、或條件寫錯只在某些情況才生效）。
  為什麼重要：如果之後有人重構這兩個檔案時不小心把 delay 弄丟，測試套件不會示警，只有在真實環境批次操作對 Notion 打太快、開始收到 429 錯誤時才會被發現（而且可能要等到社團人數變多、批次筆數變多才會踩到）。
  需要驗證的情境：
  - 用 `vi.useFakeTimers()`（參考 `mutex.test.ts` 的既有寫法）驗證這兩處迴圈在處理 N 筆資料時，`setTimeout` 總共被呼叫了 N-1 次、每次間隔是 400ms，而不是斷言「總耗時」這種容易 flaky 的寫法。
  - 只需要驗證「延遲機制有被觸發」，不需要驗證 Notion API 本身的 rate limit 行為（那是 `notion-fetch.test.ts` 已經覆蓋的 429 重試邏輯範疇）。

---

## 效能觀察（2026-09-21，從真實 log 分析發現，尚未處理）

- [ ] **`people-repository.ts:40-44` `findAllUnpaid()` 用 `結清` 這個 formula 欄位當篩選條件，比篩一般欄位慢一個檔次。** 真實環境的 log 顯示這個查詢（`owe` 指令用到）耗時落在 715ms～3540ms，而其他篩一般欄位的查詢中位數只要 400～600ms——Notion 官方文件跟社群經驗都指出篩 formula/rollup 欄位沒辦法用索引、每次都要即時算。不是這個查詢寫錯，是 formula 欄位篩選本來就有這個代價；如果之後 `owe` 指令的回應速度變成明顯困擾，可以考慮的方向是另外維護一個非 formula 的「是否結清」欄位讓 Notion 自動同步，或是接受這個延遲。
