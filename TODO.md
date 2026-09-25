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

---

## 已評估、不採納

- **表格驅動指令解析與路由**（`/improve-codebase-architecture` 報告候選 3，Speculative）— 評估後不採納。理由：(1) 各 command handler 簽名不一致（7 種不同形狀，從 `(replyToken, botId)` 到 `(event, delta, botId, isAdmin)`），單一表格 row 形狀塞不下這些差異；(2) 報告自己也承認 deletion test 不明確，拆掉 `command-parser.ts`/`command-router.ts` 可能只是把 switch 搬位置，不會真正集中複雜度；(3) 唯一有具體壞味道支撐的症狀（courtOverride 解析邏輯被拆到兩個 module）已隨 `next?c=N` what-if 預覽功能整個移除而不復存在，不只是修好。若未來新增指令的頻率明顯提高、且 handler 簽名先被拉齊，可重新評估。
- **[1.2] `people-repository.ts`/`season-repository.ts`/`announcement-repository.ts` 查詢分頁處理** — 評估後不採納。目前社團規模（未結清人數、season 數、公告內容）遠低於 Notion 單頁 100 筆上限，此狀況實務上不會發生，不需為此增加分頁邏輯的複雜度。
- **[2.1] `member-joined-handler.ts` 多人同時加入群組時用 `pushMessage` 補發歡迎訊息** — 評估後不採納，不修正。原因：此專案原則上不使用 `pushMessage`（唯一例外是既有的 `weekly-push.ts` 週報推播，見 `CLAUDE.md` 專案慣例），不為此問題新增 push 用法。第一位以外的成員收不到歡迎訊息維持現況。

---

## 效能觀察（2026-09-21，從真實 log 分析發現，尚未處理）

- [ ] **`people-repository.ts:40-44` `findAllUnpaid()` 用 `結清` 這個 formula 欄位當篩選條件，比篩一般欄位慢一個檔次。** 真實環境的 log 顯示這個查詢（`owe` 指令用到）耗時落在 715ms～3540ms，而其他篩一般欄位的查詢中位數只要 400～600ms——Notion 官方文件跟社群經驗都指出篩 formula/rollup 欄位沒辦法用索引、每次都要即時算。不是這個查詢寫錯，是 formula 欄位篩選本來就有這個代價；如果之後 `owe` 指令的回應速度變成明顯困擾，可以考慮的方向是另外維護一個非 formula 的「是否結清」欄位讓 Notion 自動同步，或是接受這個延遲。

---

## 流程/顯示缺口（2026-09-26，新增 `season` 指令後使用者實測時發現，尚未處理）

- [ ] **`@Dobby command` 指令輸出（`src/commands/command-list.ts`）沒有列出管理員限定指令，而且「新增指令」文件化步驟本身沒有這一步，導致每次新增管理員指令都會漏掉、也沒人做出明確決定。** 事實：`command-list.ts:4-48` 的 `COMMAND_LIST_TEXT` 沒有列出 `season`（`src/commands/season-announcement.ts`，2026-09-26 新增）。這不是單一個案——同樣是管理員限定指令的 `next`（`src/commands/next-event.ts`）也完全沒出現在這份清單裡，代表目前所有管理員限定指令都沒有出現在 `@Dobby command` 的輸出，只有一般成員可用的指令、以及附屬在一般指令下的管理員用法（`command-list.ts:41` 的「幫 @Name 代為報名（管理員限定）」）才有列出。
  - 不是必然的 bug：`handleCommandList()`（`command-list.ts:50-66`）沒有檢查 `isAdmin`，任何人傳 `@Dobby command` 都能看到這份清單，所以「刻意不列出管理員指令」有可能是為了不對一般成員曝光管理員功能——但目前沒有任何註解或文件講清楚這是刻意設計還是純粹沒想到；兩次新增管理員指令（`next`、`season`）都沒人做出明確決定，這才是真正要處理的問題，不是「季節指令沒被列出來」這件事本身。
  - 具體缺口：`docs/development.md:154-159`「## 新增指令」5 步驟，以及 `CLAUDE.md:13`「專案慣例」對應的同一份 5 步驟摘要，完全沒有提到 `command-list.ts`。就算未來想在新增指令時「決定」要不要列出來，也沒有一個步驟會提醒要做這個決定，所以只會一直漏下去。
  - 如果要處理，建議方向（以下三個政策選項沒有標準答案，需要維護者決定要選哪個，不要在沒有確認的情況下逕自選一個直接實作）：(1) 先跟維護者確認政策——管理員指令要不要出現在 `@Dobby command` 的輸出（可能方向：完全不出現／獨立成一個章節但一般成員也看得到文字／依 `isAdmin` 動態顯示不同內容，三者各有取捨，動態顯示會讓 `handleCommandList()` 多一個參數跟兩套文案要維護）；(2) 依維護者的決定補齊 `next`、`season` 目前已經漏掉的部分；(3) 在 `docs/development.md` 的「新增指令」5 步驟跟 `CLAUDE.md` 對應摘要各加一步，明確要求「決定要不要更新 `command-list.ts`」，避免以後新增指令時又漏掉一次同樣的決定。

- [ ] **`/logs` 頁面看不出一次 LINE 回覆其實是好幾則獨立訊息，卡片預覽和展開後的時間軸明細都把多則訊息用 `\n` 接成一串，跟「一則很長的多行訊息」在畫面上無法分辨；`?format=text` 文字匯出繼承同一個根因。** 事實：`src/routes/logs.ts:562-565` 的 `lineMessagesOf()` 從 log payload 的 `messages` 陣列取出一次 LINE reply/push 實際送出的每一則訊息內容（對應 `reply-service.ts` 記下的 `messageContents`；一次 reply 可能包含多則訊息，例如 `season` 指令一次最多回 3 則）。這個陣列在四個地方被直接 `.join('\n')` 成單一字串，完全沒有標示原本是幾則訊息：`groupPreview()`（`logs.ts:573`、`583`，事件卡片的預覽文字）跟 `lineStepTimeline()`（`logs.ts:783`、`788`，展開後時間軸明細的 body）。
  - `?format=text&reqId=xxx` 的 `renderEventDetailText()`（`logs.ts:1653-1684`）沒有另外處理這個問題，是因為它直接複用 `lineStepTimeline()` 算出來的同一份 `TimelineStep.body`/`bodyLabel`——HTML 頁面跟文字匯出共享同一個根因，不是兩個獨立的 bug，改一處應該兩邊都會修好。
  - 風險：目前看起來像「一則很長、有很多行的訊息」，跟「LINE 端實際上收到 N 則獨立訊息」在畫面上完全無法分辨。多則訊息的指令（目前只有 `season`）在 `/logs` 上會被誤讀成單一訊息，除錯時容易誤判 LINE reply 在對方手機上實際的外觀（以為是一則很長的訊息，但其實是三個分開的訊息泡泡）。不影響 bot 實際送出的內容（LINE 端沒問題，這純粹是 `/logs` 這個除錯頁面本身的顯示缺口）。
  - 如果要處理，建議方向：在 `groupPreview()`/`lineStepTimeline()` 組字串前，若 `messages.length > 1`，加上類似「（共 N 則訊息）」的標示，或用比單一 `\n` 更明顯的分隔（例如訊息之間加一條分隔線）區隔每則訊息。因為 `format=text` 複用同一份 `TimelineStep`，改這兩個函式應該會同時修好 HTML 頁面跟文字匯出，不需要在 `renderEventDetailText()` 另外處理。

---

## 程式碼清理觀察（2026-09-26，新增 `season` 指令的 code review 中發現，尚未處理）

- [ ] **`src/config/constants.ts` 有兩個沒人用的死碼常數（`COURTS_DENSITY`、`MAX_GUESTS_PER_MEMBER`），其中 `COURTS_DENSITY`（每面場地容納人數上限 = 7）又在另外兩處被獨立重新定義。** 三處分別是：(1) `src/config/constants.ts:1`——整份檔案（`COURTS_DENSITY` 和 `MAX_GUESTS_PER_MEMBER` 兩個常數）目前沒有任何檔案 import，用 `grep -rn "constants.js\|constants.ts" src` 確認過（`__tests__` 也沒有），是純死碼；(2) `src/commands/registration/capacity-calculator.ts:37`——`calculateTotalSlots()` 函式內的區域變數；(3) `src/commands/season-announcement.ts:13`——這次新增 `season` 指令時獨立宣告的模組層級常數（已加註解說明跟 capacity-calculator.ts 語意相同但故意不共用，因為算的是「當季預設、零請假」的公告用 baseline，不是即時報名名額，兩處吃的資料形狀不同）。`MAX_GUESTS_PER_MEMBER` 跟 `COURTS_DENSITY` 三處重複定義是不同性質的問題（單純沒人用，不是被重複定義），一併列在這裡是因為都在同一份死碼檔案裡。
  - 現狀不是這次改動造成的 bug，是既有問題，這次只是又多了一份重複定義；三處數值目前一致（都是 7），沒有不一致風險，暫時不影響正確性。但如果之後場地密度假設要調整，容易忘記同步改到三處而悄悄產生不一致——不會報錯，只會讓公告數字跟實際報名邏輯的名額計算脫鉤，不容易發現。
  - 如果要處理，建議方向：先確認 `src/config/constants.ts` 除了這兩個常數外有沒有其他用途，若沒有近期會用到的需求就直接刪掉，避免死碼一直留著；否則補上實際的 import 讓它不再是死碼。再評估 `capacity-calculator.ts` 跟 `season-announcement.ts` 的兩個定義能不能合併成一個共用常數（但要注意兩處吃的參數形狀不同，硬要共用可能需要重新設計介面，不是單純 import 一個數字就好）。
