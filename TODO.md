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

---
