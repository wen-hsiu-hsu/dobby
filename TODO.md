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

## 程式碼清理觀察（2026-09-26，新增 `season` 指令的 code review 中發現，尚未處理）

- [ ] **`src/config/constants.ts` 有兩個沒人用的死碼常數（`COURTS_DENSITY`、`MAX_GUESTS_PER_MEMBER`），其中 `COURTS_DENSITY`（每面場地容納人數上限 = 7）又在另外兩處被獨立重新定義。** 三處分別是：(1) `src/config/constants.ts:1`——整份檔案（`COURTS_DENSITY` 和 `MAX_GUESTS_PER_MEMBER` 兩個常數）目前沒有任何檔案 import，用 `grep -rn "constants.js\|constants.ts" src` 確認過（`__tests__` 也沒有），是純死碼；(2) `src/commands/registration/capacity-calculator.ts:37`——`calculateTotalSlots()` 函式內的區域變數；(3) `src/commands/season-announcement.ts:13`——這次新增 `season` 指令時獨立宣告的模組層級常數（已加註解說明跟 capacity-calculator.ts 語意相同但故意不共用，因為算的是「當季預設、零請假」的公告用 baseline，不是即時報名名額，兩處吃的資料形狀不同）。`MAX_GUESTS_PER_MEMBER` 跟 `COURTS_DENSITY` 三處重複定義是不同性質的問題（單純沒人用，不是被重複定義），一併列在這裡是因為都在同一份死碼檔案裡。
  - 現狀不是這次改動造成的 bug，是既有問題，這次只是又多了一份重複定義；三處數值目前一致（都是 7），沒有不一致風險，暫時不影響正確性。但如果之後場地密度假設要調整，容易忘記同步改到三處而悄悄產生不一致——不會報錯，只會讓公告數字跟實際報名邏輯的名額計算脫鉤，不容易發現。
  - 如果要處理，建議方向：先確認 `src/config/constants.ts` 除了這兩個常數外有沒有其他用途，若沒有近期會用到的需求就直接刪掉，避免死碼一直留著；否則補上實際的 import 讓它不再是死碼。再評估 `capacity-calculator.ts` 跟 `season-announcement.ts` 的兩個定義能不能合併成一個共用常數（但要注意兩處吃的參數形狀不同，硬要共用可能需要重新設計介面，不是單純 import 一個數字就好）。
