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

## 風險觀察（尚未驗證、尚未處理）

- [ ] **USERS 資料庫可能因 Notion 查詢延遲出現同一個 `user_id` 的重複頁面（未驗證 Notion 是否真有此延遲）。**
  - **背景**：`src/services/user-management.ts` 的 `_trackUserAsync` 用 `withMutex('user-track-${userId}')` 串行化「查使用者 → 不存在就建立」。有兩個入口共用這把鎖：發言（`trackUser`，由 `src/handlers/message-handler.ts:35` 觸發）和加入群組（`trackJoinedMember`，由 `src/handlers/member-joined-handler.ts` 觸發）。「加入後馬上發言」是常見組合，兩者會接連跑。
  - **已處理的部分**：呼叫端傳入的 `null` 快照（「查無此人」）一律不信任，第 65 行 `knownUser != null` 會讓它在鎖內重新 `findByUserId`（第 68 行）。所以前一個呼叫建好頁面並放鎖之後，後一個呼叫不會拿舊的 `null` 再建一次。這部分有測試覆蓋。
  - **剩下的風險**：鎖內重讀用的是 database query（`src/services/notion/users-repository.ts:32` 以 `user_id` 篩選）。如果 Notion 的 database query 對剛建立的頁面有索引延遲，前一個呼叫第 72 行 `create` 完、放鎖後，後一個呼叫的重讀可能還是查不到，就會再建一筆。目前**沒有驗證** Notion 是否真有這種延遲，也沒在正式資料看到重複頁面。
  - **發生後的影響**：同一個 `user_id` 有兩頁時，`findByUserId` 只取 `results[0]`。`groups`／`message_counts`／`is_admin` 可能分散在兩頁、看起來像少算或權限忽有忽無。
  - **如果要處理**：先確認是否真的發生，例如在 Notion 以 `user_id` 分組找重複，或在 `create` 前後加 log 觀察。確定有問題再考慮修法。已知限制：Notion 沒有 unique constraint，不能靠資料庫擋；mutex 是單一 process 記憶體鎖，重讀查不到時它也擋不住。可行方向是在 process 內快取「剛建立的 userId → pageId」一小段時間，讓鎖內重讀查不到時改用快取。不要為此拿掉 mutex 或改用 pushMessage 之類不相關的手段。

---
