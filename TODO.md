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

## 測試技術債（2026-09-27 發現，尚未處理）

- [ ] **`src/schedulers/__tests__/weekly-push.test.ts` 有兩個測試斷言寫死了日期字串，會隨系統時間流逝定期過期失敗**（目前在 `main` 分支上就已經是失敗狀態，`npx vitest run` 會看到 2 個失敗）。失敗的兩個測試在第 113-122 行（`shows a paused message...`）跟第 124-143 行（`builds a numbered guest list...`），斷言 `expect(text).toContain('2026-09-26 不能到請喊聲')`。
  - **不是 bug，是測試對程式邏輯的誤解**：推播文字裡實際顯示的日期，來源是 `weekly-push.ts:27` 用系統時間算出的 `getNextSaturday()`（見 `src/utils/date-utils.ts:29-36`），再經 `weekly-status-message.ts:9,13,27` 組進文字；`findByDate()` mock 回傳的 `CalendarEvent.date` 欄位只用來查有沒有資料、從未被拿去顯示。測試把 `makeCalendarEvent({ date: '2026-09-26', ... })` 誤當成「會顯示在文字裡的日期」寫死斷言，但實際顯示的是撰寫測試當下算出的「下一個週六」，隨系統時間往前推進就會跟寫死的字串對不上（今天 2026-09-27 週日，`getNextSaturday()` 算出 `2026-10-03`，跟斷言的 `2026-09-26` 不符）。
  - **正式環境不受影響**：`weekly-push.ts` 週日 09:00 排程推播「下週六」狀態本來就該跟著系統時間走，只要 Notion 裡當週週六有對應 `CalendarEvent` 就沒問題，這純粹是測試撰寫方式的技術債。
  - **如果要處理**，方向是讓測試不再依賴「執行當下離撰寫當下多久」：(1) `vi.useFakeTimers()` 固定系統時間到某個星期幾，再依 `getNextSaturday()` 動態算出預期字串來斷言；或 (2) mock `date-utils.js` 讓 `getNextSaturday()` 回傳固定值。已知陷阱：不要只是把寫死的日期字串換成「現在比較新」的日期，那只是把過期時間點往後延，問題會再發生。
  - grep 過其他測試檔，沒發現同樣「mock 固定日期字串 + 斷言文字包含該字串 + 沒 freeze 系統時間」的模式，應該是 `weekly-push.test.ts` 的個案，不需要全面排查。

---
