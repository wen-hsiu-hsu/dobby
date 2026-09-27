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
- [ ] 正式切換後第一次 `display-name-update`（2026-09-28 週一 04:00）—— 到 `/logs` 的排程分頁確認有跑完、更新筆數合理；USERS `groups` 裡殘留的測試群組 ID 造成的 404 是預期中的（見 `docs/overview.md`「從 n8n 遷移」），不是錯誤

---

## 已評估、不採納

- **表格驅動指令解析與路由**（`/improve-codebase-architecture` 報告候選 3，Speculative）— 評估後不採納。理由：(1) 各 command handler 簽名不一致（7 種不同形狀，從 `(replyToken, botId)` 到 `(event, delta, botId, isAdmin)`），單一表格 row 形狀塞不下這些差異；(2) 報告自己也承認 deletion test 不明確，拆掉 `command-parser.ts`/`command-router.ts` 可能只是把 switch 搬位置，不會真正集中複雜度；(3) 唯一有具體壞味道支撐的症狀（courtOverride 解析邏輯被拆到兩個 module）已隨 `next?c=N` what-if 預覽功能整個移除而不復存在，不只是修好。若未來新增指令的頻率明顯提高、且 handler 簽名先被拉齊，可重新評估。
- **[1.2] `people-repository.ts`/`season-repository.ts`/`announcement-repository.ts` 查詢分頁處理** — 評估後不採納。目前社團規模（未結清人數、season 數、公告內容）遠低於 Notion 單頁 100 筆上限，此狀況實務上不會發生，不需為此增加分頁邏輯的複雜度。
- **[2.1] `member-joined-handler.ts` 多人同時加入群組時用 `pushMessage` 補發歡迎訊息** — 評估後不採納，不修正。原因：此專案原則上不使用 `pushMessage`（唯一例外是既有的 `weekly-push.ts` 週報推播，見 `CLAUDE.md` 專案慣例），不為此問題新增 push 用法。第一位以外的成員收不到歡迎訊息維持現況。
- **導入 SQLite 改善 Notion 讀寫速度**（2026-09-27 評估）— 不採納。評估過兩種做法：以 SQLite 為主、背景同步回 Notion；或把 SQLite 當讀取快取。前提是 Notion 必須維持唯一可信來源，因為管理員會直接在 Notion UI 改行事曆的 `零打`、`請假人` 等欄位。不採納的理由：
  1. **快取省不掉報名最慢的那段。** 報名名額必須在鎖內從 Notion 重讀（[ADR 0001](docs/adr/0001-explicit-fresh-calendar-event-wrapper.md)），所以不管哪種快取，報名關鍵路徑上的「鎖內讀一次＋寫一次」（約 1 秒）都省不掉。
  2. **以 SQLite 為主會弄丟管理員的修改、造成超賣。** `calendar-repository.ts:69-83` 的 `updateAbsentees`／`updateGuests` 是整包覆寫，背景寫回時會蓋掉管理員同一時段在 Notion 的手動修改。偵測 Notion 端變更只能靠 polling，在 polling 空窗期間用舊人數算名額會超賣。`withMutex` 也只能鎖 bot 自己的寫入，鎖不住 Notion UI。
  3. **當讀取快取時，in-memory Map 就夠了。** 能快取的資料不到幾百筆，重啟後 1～2 次呼叫就能重新載入。SQLite 在 arm64 Pi 上需要 native build，還要多一個 Docker volume、schema migration，也會增加 SD 卡寫入，沒有對應的好處。

  慢的真正原因是呼叫模式，見下方「效能觀察」。若未來 log 出現 Notion 429（rate limit 真的成為瓶頸），或決定不再用 Notion 當後台，可以重新評估。

---

## 效能觀察（從真實 `logs/` 分析發現，尚未處理）

> 2026-09-27 分析了本機 `logs/`（2026-09-21～27，約 75 個事件、402 次 Notion 呼叫）：
> - Notion 單次呼叫中位數約 430ms，p90 約 660ms，偶有 3.5～5.5 秒的長尾。
> - 沒有任何 429，也沒有任何 mutex 逾時。
>
> 慢的原因是呼叫模式（逐筆查、人為延遲、重複查、能平行卻依序），不是 Notion 本身或 rate limit。以下除了最後一項 mutex 逾時是潛在的錯誤回覆風險，其餘都**不是 bug**：結果正確，只是慢，不是急件。項目依效益排序。做完任何一項後，都要在 `/logs` 時間軸比對同類指令前後的 Notion 呼叫數與總耗時。

- [ ] **`findByPageIds` 逐筆 GET，每筆之間 sleep 400ms，是 `participants`／`news` 慢的主因。** 兩個 repository 都有這個函式：
  - `src/services/notion/people-repository.ts:17-27`（sleep 在第 21 行）
  - `src/services/notion/calendar-repository.ts:55-65`（sleep 在第 59 行）

  呼叫端：
  - `participants.ts:19`：推估 1＋N 次呼叫（N≈11 位季租成員），約 7～8 秒。
  - `news.ts:75-76`：實測 29 次呼叫，11.3～11.7 秒。兩組用 `Promise.all` 同時跑，瞬間約 5 req/s。
  - `season-announcement.ts:90-91`
  - `weekly-status-message.ts:22`
  - `registration/event-status-message.ts:30`：報名／請假的回覆訊息，在鎖內執行，見下面第三項。
  - `registration/target-resolver.ts:19,28`

  如果要處理：
  - **人員姓名**：可以改成一次 query People DB（分頁寫法參考 `users-repository.ts:39-56`），建立 `pageId → name` 的 in-memory Map，TTL 約 10 分鐘。查不到的 ID 才退回逐筆 GET。新 LINE 使用者自動建立的 People 頁面（見 `docs/notion/databases.md` 第 49 行）不在快取裡，會自然走 miss 路徑。
  - **打球日**：可以改成一次 calendar query，篩選 `季度` relation 等於該季的頁面。schema 顯示行事曆只有 `季度`、季租紀錄只有 `打球日` 這一組互相指向的 `dual_property`，很可能是同一對 relation。但 `docs/notion/schemas/` 沒記錄配對的屬性名，實作前要先用 Notion API 讀 database schema 的 `synced_property_name` 確認。

  已知陷阱：
  - **不要快取整個 `PersonRecord`。** 它帶有 `hasPaid`（`結清` formula，`people-repository.ts:13`）。目前 `findByPageIds` 的呼叫端都沒用到 `hasPaid`（`owe` 走 `findAllUnpaid`），所以現在不會出錯。風險在之後：有人從快取讀 `hasPaid`，會拿到最多 TTL 前的繳費狀態，而且不會有任何錯誤訊息。快取只存 name，或在型別上分開。
  - **打球日的查詢結果不能拿去算名額。** `calendar-repository.ts` 的 `findByPageIds` 回傳完整的 `CalendarEvent`，內含 `guests`／`absentees`。如果對打球日做快取，只能用在公告列日期，不能拿去算名額。
  - **快取是 module 層級狀態，測試之間會殘留。** 要提供 reset 函式，在 `src/test-utils/setup.ts` 或 `beforeEach` 呼叫。`create-test-bot.ts:74-86` 的 `routePost` 只依 DB ID 回 fixture、不看 filter，所以改用 DB query 後，現有 fixture 大多可以直接用。

- [ ] **報名／請假：同一個請求查兩次 USERS，互不相依的查詢依序執行。** 實測 `+N`／`-N` 共 26 次，每次 7～12 個 Notion 呼叫全部依序，中位數 3.3 秒（2.4～7.1 秒）。請假／銷假每次 7～9 個呼叫，中位數 3.1 秒。
  - **重複查 USERS。** `handlers/message-handler.ts:24` 已經 `findByUserId` 一次，`registration/target-resolver.ts:16` 自己查報名時又查一次（替別人報名走的是第 25 行，查的是別人，不算重複）。
  - **能平行卻依序執行。** `registration-handler.ts:36` 的 `resolveTarget` 和第 46 行的 `seasonRepo.findByName` 互不相依，卻一個等一個。`leave-handler.ts:36,47` 也一樣。

  如果要處理：
  - 可以把 message-handler 查到的 `notionUser` 一路傳到 `resolveTarget`，這會改到 router 和 handler 的簽名。
  - 把 `resolveTarget` 和 `findByName` 包進 `Promise.all`。

  預估 `+1` 從約 3.3 秒降到約 1.8～2 秒。陷阱：傳進來的 `null` 不能當成「使用者不存在」直接採信，要重查。message-handler 查完之後，使用者追蹤流程可能剛好建立了頁面，理由同 `services/user-management.ts:83-86` 的註解。

- [ ] **報名／請假的回覆訊息在鎖內組，拉長鎖持有時間。** 實測鎖持有時間中位數約 1.45 秒（0.9～4.4 秒）。`buildEventStatusMessage` 會呼叫 `peopleRepo.findByPageIds` 查請假人姓名（`event-status-message.ts:29-31`）。它在 `withFreshCalendarEvent` 的 mutation 裡被呼叫，所以是在鎖內，會讓鎖內多出 0.3～1.5 秒：
  - `registration-handler.ts:70-78`
  - `registration-handler.ts:110-118`
  - `leave-handler.ts:120-128`

  如果要處理：可以讓 mutation 回傳組訊息需要的資料，改到鎖外組訊息並 `replyMessage`。要改 `with-fresh-calendar-event.ts:12` 的 mutation 簽名，它現在回傳 `Promise<void>`。先做完第一項（姓名快取）後，這一項的效益大部分已經拿到，可以視情況不做。

- [ ] **`withMutex` 的 10 秒逾時把排隊時間也算進去，尖峰時可能回「系統錯誤」，但報名其實已經成功。** 現象推論自程式碼，log 裡還沒發生過。
  - **機制。** `src/services/mutex.ts:25` 的 `settle` 是「等前一個任務完成、再執行 `fn()`」，第 45 行從一呼叫 `withMutex` 就開始用 `raceAgainstTimeout` 計時（`TIMEOUT_MS` 在第 5 行），所以 10 秒是「排隊＋執行」的合計。[ADR 0002](docs/adr/0002-mutex-timeout-does-not-cancel-task.md) 寫的「單次執行有 10 秒逾時」跟實際行為不完全一致。
  - **風險情境。** 週日推播後多人同時 `+1`，每人的鎖持有時間約 1.45 秒，遇到 Notion 長尾時可到 4.4 秒以上。排在後面的人累計等超過 10 秒，就會收到 `with-fresh-calendar-event.ts:27-28` 的「系統錯誤，請稍後再試」。但他的 `fn()` 會在背景照樣跑完，報名實際上已經寫入。使用者可能以為失敗而重試或放棄。

  如果要處理：
  - 先做上面三項縮短鎖持有時間，這是最低風險的緩解方式。
  - 若要改成從拿到鎖才開始計時，**不能**改成「逾時就讓下一個排隊任務開始」，那會重新引入 ADR 0002 防的 race。改完要同步修正 ADR 0002 的描述。
  - 另一個方向是逾時時改回覆「處理中，請稍後用 `next` 確認」，而不是「系統錯誤」。

- [ ] **`people-repository.ts:51-58` `findAllUnpaid()` 用 `結清` 這個 formula 欄位當篩選條件，比篩一般欄位慢一個檔次。**（2026-09-21 發現）真實環境的 log 顯示這個查詢（`owe` 指令用到）耗時落在 715ms～3540ms，而其他篩一般欄位的查詢中位數只要 400～600ms——Notion 官方文件跟社群經驗都指出篩 formula/rollup 欄位沒辦法用索引、每次都要即時算。不是這個查詢寫錯，是 formula 欄位篩選本來就有這個代價；如果之後 `owe` 指令的回應速度變成明顯困擾，可以考慮的方向是另外維護一個非 formula 的「是否結清」欄位讓 Notion 自動同步，或是接受這個延遲。2026-09-27 的 log 裡 `owe` 整個指令耗時 1.3～8.6 秒。另一個選項是把結果做 1～5 分鐘的短 TTL 快取，代價是管理員在 Notion 登記付款後，最多要等這麼久才會從欠費名單消失。

---
