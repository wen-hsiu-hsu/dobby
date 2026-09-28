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
- [ ] 部署「報名／請假沿用 message-handler 的 USERS 快照＋Season 並行查」（2026-09-28，見 [ADR 0009](docs/adr/0009-actor-users-snapshot-non-null-only.md)）後，到 `/logs` 看既有使用者在群組的 `@Dobby +N`／`@Dobby 假`：時間軸應該只剩一次 USERS query（`message-handler` 那次），`resolveTarget` 的 People GET 和 Season query 起點應該幾乎相同。改之前的基準：成功寫入的 `+N`／`-N` 每次 7～12 個 Notion 呼叫、中位數 3.3 秒，預估降到 2.4～2.5 秒（原始分析見 git 歷史中被刪掉的 TODO 項目「報名／請假：同一個請求查兩次 USERS」）。群組新使用者的第一個指令、一對一私訊仍會查兩次 USERS，這是預期的。沒達到預估不是 bug，把實測數字記在下方即可。
- [ ] 到 Pi 的 `/logs` 頁面，看底部 footer 的「R2 備份」徽章，確認 R2 同步真的有啟用、最近一次同步成功（徽章語意見 `docs/logging.md`「R2 同步狀態徽章」段）。本機 log 保留約 7 天，當週的申訴夠用；但季末對帳或事後爭議只能靠 R2，沒啟用的話 7 天前的 log 就沒了。R2 上的檔案 `/logs` 讀不到，要自己下載再用 `jq` 查。

---

## 規劃中功能（尚未開發）

- [ ] **成就系統（含賽季彩蛋）** —— 規則見 [`docs/achievements-rulebook.md`](docs/achievements-rulebook.md)。目前只有遊戲規則，**沒有實作設計，也還沒排入開發**，不是急件。開工前要注意：
  - **可行性要重新分析。** 2026-09-27 曾對照當時的程式碼（commit `6e28250`）做過一次初步分析，但結論沒有寫進 repo，只留下規則書第 11 節的待確認事項。開工時程式碼一定已經改過，要用當下的程式碼從頭分析，不要假設當時的判斷還成立。
  - **先把規則書第 11 節的待確認事項定案。** 那幾項是規則本身互相矛盾，或定義不足以直接實作，不是實作細節，照目前的文字寫不出唯一正確的行為。
  - **規則書第 9 節列的 Notion 資料庫不是完整的實作清單。** 那一節只列出管理者要填的設定，成就解鎖紀錄、哪些打球週已結算、發話統計這類系統自己要存的狀態都沒列。重新分析時要另外盤點。
  - **規則要對照 `CLAUDE.md` 的專案慣例檢查**，特別是「回覆一律用 `replyMessage`」、Notion rate limit（約 3 req/s），以及「讀取 → 計算 → 寫回用 `withMutex`」。規則書的「不推播」「一則訊息只回覆一次」和這些慣例一致，但實作時每則群組訊息都要判定成就，要注意不能每則都打 Notion。

---

## 已知問題（尚未處理）

- [ ] **報名／請假在取鎖前的 Notion 例外不會回覆使用者。** `handleRegistration`／`handleLeave` 呼叫 `withFreshCalendarEvent` 之前，會先用 `Promise.all` 並行查 `resolveTarget` 和 `seasonRepo.findByName`（`src/commands/registration/registration-handler.ts:43-46`、`leave-handler.ts:43-46`）。這段沒有 try/catch；`with-fresh-calendar-event.ts:20-40` 的 try 只包住取鎖之後。任一查詢 throw，例外會經 `command-router.ts`、`message-handler.ts:49` 一路丟到 `src/handlers/event-router.ts:38-40`，那裡只 `logger.error`（Notion HTTP 錯誤時 `/logs` 顯示為失敗；網路錯誤或非 JSON 回應時反而顯示為警告，見「Log 可觀測性」的「Notion 網路錯誤…」那一項），使用者收不到任何回覆。

  這是 bug，但目前還沒觀察到：
  - `notion-fetch.ts` 只對 429 重試（最多 3 次，第 38、63 行）；5xx、網路錯誤、429 重試用完都會直接 throw（`assertOk`，第 30-36 行）。本機 `logs/`（2026-09-21～27）沒有任何 `Error handling event` 或 `Notion API error`。
  - 從 n8n 遷移的第一版（commit `23c32a1`）就是這樣，當時的 try 也只包鎖內。
  - 其他指令都自己 try/catch 並回「系統錯誤，請稍後再試」：`owe.ts:6-14`、`news.ts:59-84`、`participants.ts:8-22`、`payment.ts:7-16`、`next-event.ts:13-27`、`season-announcement.ts:56-150`、`introduce.ts:12-42`。`message-handler.ts:23-29` 的 `findByUserId` 也在 commit `5ef200d` 補過同一種缺口。只有報名／請假漏掉。
  - 2026-09-28 把兩個查詢改成並行後，多了一種觸發情況：對象查無（`resolved` 為 null）而 Season 查詢 throw。舊版依序執行，會先回「找不到您的帳號」；現在 `Promise.all` 整個 reject，不回覆。其他組合的行為跟舊版相同。
  - 影響：使用者以為 bot 沒收到，通常會再打一次。這段在任何寫入之前，所以重打不會重複報名，只是體驗差。

  如果要處理：
  - 可以把取鎖前的查詢（`Promise.all` 那段）包進 try/catch，catch 時記 `logger.error`、回「系統錯誤，請稍後再試」。取鎖前還沒寫入任何東西，回「系統錯誤」、讓使用者重試是安全的。
  - **try 範圍不要包住 `withFreshCalendarEvent`。** 它自己會處理例外並回覆。外層再 catch 回「系統錯誤」的話，萬一日後它把 `MutexTimeoutError` 往外丟，就會違反 [ADR 0002](docs/adr/0002-mutex-timeout-does-not-cancel-task.md)：逾時時背景寫入可能仍會成功，`+N`／`-N` 不是冪等的，不能回「系統錯誤」引導重試。
  - 另一種做法是在 `message-handler.ts:49` 對 `routeCommand` 統一 catch，以後新增的指令也不會漏。但同樣不能讓 `MutexTimeoutError` 落到這裡被回成「系統錯誤」；已經回覆過的 handler 若之後才 throw，再回一次會因 replyToken 已用過而被 LINE 拒絕（無害，但 `/logs` 會多一筆 `Reply failed`）。
  - 測試不能用 `createTestBot`（fixture 不會 throw），要手動 mock repository 讓它 reject，寫法參考 `src/commands/registration/__tests__/registration-handler.test.ts` 開頭。

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
- **`findAllUnpaid()` 改掉 `結清` formula 篩選來加速 `owe`**（2026-09-21 發現、2026-09-28 複查）— 不採納。`src/services/notion/people-repository.ts:51-58` 用 `{ property: '結清', formula: { checkbox: { equals: false } } }` 篩選。`結清` 的依賴鏈有好幾層：`結清` 是 formula，依賴 `未繳季租`（formula），`未繳季租` 又依賴 `報名季度`（relation）和 `已繳季租`（rollup，經 `付款` relation）。不採納的理由：
  1. **沒有證據證明 formula 篩選較慢。** log 裡這個查詢只有 3 個樣本（715／3305／3540ms），全部是 09-21 同一人 40 秒內連打。3.3～3.5 秒那兩筆，剛好落在 Notion 整體變慢的 4 分鐘內（06:59～07:03 UTC）。同一段時間沒篩 formula 的查詢也出現 3.3～5.5 秒。唯一不在這段時間的 715ms，跟一般查詢的 p90 差不多（所有 query 的 p90 約 715～780ms）。回傳 3 筆、約 10KB，也不是 payload 太大。
  2. **「formula 篩選沒辦法用索引」找不到官方來源。** Notion Help Center 只說 formula／rollup 篩選在 UI「may take a bit longer to load」，沒有提到索引。API 文件完全沒談效能。
  3. **`owe` 慢不全是這個查詢造成的。** 09-21 的 3 次 `owe` 耗時 1.3～8.6 秒，其中 8.6 秒那次有 4.9 秒是 `message-handler.ts` 的 `findByUserId`（沒篩 formula）遇到長尾。
  4. **使用率低，替代方案都有代價。** 09-21～27 所有指令共 56 次，`owe` 只有 3 次。替代方案如下：
     - 改用一般欄位，靠 Notion automation 同步：automation 要付費方案，而且 formula 和 rollup 不能當觸發條件。
     - 由 bot 排程同步，或做短 TTL 快取：管理員登記付款後，要過一段時間名單才會更新。
     - 拿掉篩選、改在程式端過濾：回傳的每一列一樣要算 `結清`，而且列數更多，不會比較快。

  若 log 累積 10 次以上 `owe`，且在 Notion 沒有整體變慢的時段仍然穩定超過 2 秒，可以重新評估。

---

## 效能觀察（從真實 `logs/` 分析發現，尚未處理）

> 2026-09-27 分析了本機 `logs/`（2026-09-21～27，62 個事件、402 次 Notion 呼叫），2026-09-28 用 subagent 逐項複查過事實與數字：
> - 「真實」指的是打真正的 Notion／LINE API，但服務是在本機 docker 跑的，不是 Pi。網路環境不同，拿這裡的數字跟 Pi 的 `/logs` 比對時要考慮這點。
> - Notion 單次呼叫中位數約 430ms，p90 約 660ms，偶有 3.3～5.5 秒的長尾。
> - 沒有任何 429，也沒有任何 mutex 逾時。
> - log 幾乎都是測試流量：報名只有 2 個 userId，請假人數只有 0～2 人。正式搶報的行為還沒被觀察到。
>
> 慢的原因是呼叫模式（逐筆查、人為延遲），不是 Notion 本身或 rate limit。以下都**不是 bug**：結果正確，只是慢，不是急件，依效益排序。做完任何一項後，都要在 `/logs` 時間軸比對同類指令前後的 Notion 呼叫數與總耗時。

- [ ] **`findByPageIds` 逐筆 GET，每筆之間 sleep 400ms，是 `participants`／`news` 慢的主因。** 兩個 repository 都有這個函式：
  - `src/services/notion/people-repository.ts:17-27`（sleep 在第 21 行）
  - `src/services/notion/calendar-repository.ts:55-65`（sleep 在第 59 行）

  sleep 是 commit `8a4ed71`（2026-09-18）加的。當時原本用 `Promise.all` 完全平行，怕瞬間超過約 3 req/s，就比照 `display-name-update.ts` 改成依序＋400ms。commit 沒提到真的遇過 429，是預防性的節流。

  呼叫端：
  - `participants.ts:19`：推估 1＋N 次呼叫（N≈11 位季租成員），約 7 秒。log 裡沒有這個指令，數字是用單次 GET 約 280ms＋sleep 400ms 推算的。
  - `news.ts:75-76`：實測 2 次，都是 29 次呼叫（11 次姓名 GET＋13 次活動 GET＋5 次其他），耗時 11.3 和 11.7 秒。兩組 GET 各自拖了 7～9.5 秒，其中 sleep 約佔各組的 55～60%，約佔整個指令的 40%。兩組用 `Promise.all`（`news.ts:73-77`）同時跑，平均合計約 2.5～3 req/s，任 1 秒窗口瞬間最多 4 個 GET，靠 Notion 容許的短暫突發撐住，沒有出現 429。
  - `season-announcement.ts:90-91`：管理員專用（產生新一季公告草稿），頻率很低，優先度比 news／participants 更低。
  - `weekly-status-message.ts:22`
  - `registration/event-status-message.ts:30`：報名／請假的回覆訊息查請假人姓名，在鎖內執行，見下面「回覆訊息在鎖內組」那一項。只有請假人數 ≥2 時才會觸發 sleep。
  - `registration/target-resolver.ts:31,40`：每次只傳 1 筆 ID，sleep 永遠不會觸發，**不受這一項影響**。

  **只拿掉 sleep 或改有限並行不能解決問題。** 現在平均已經頂在 3 req/s 上限，拿掉 sleep 就會超出，變成靠 Notion 容忍短時間超量加上 429 重試兜底，違反 `CLAUDE.md` 的節流慣例。news、season-announcement 還會有 2～3 組同時跑。真正能加速的只有減少呼叫次數。Notion query 也沒辦法依 page ID 篩選（SDK 的 `PropertyFilter` 只有 relation 的 `contains`），所以不能把 N 次 GET 合成一次「ID in [...]」查詢。

  如果要處理（範圍只限「整季名單」的呼叫端：news、participants、season-announcement）：
  - **首選：用反向 relation 直接查詢，不用快取。**
    - 季租成員：query People DB，篩選 `報名季度` contains `season.pageId`。
    - 打球日：query Calendar DB，篩選 `季度` contains `season.pageId`。
    - news 的 24 次 GET 會變成 2 次 query，預估從約 11.5 秒降到 2～3.5 秒。participants 從 1＋11 次降到 2 次。
    - schema 顯示 `報名人`（季租紀錄）↔`報名季度`（People）、`打球日`（季租紀錄）↔`季度`（行事曆）各自是兩個 DB 之間唯一的 `dual_property`，很可能就是配對的兩端。但 `docs/notion/schemas/` 沒記錄配對的屬性名，實作前要先用 Notion API 讀 database schema 的 `synced_property_name` 確認。
    - season-announcement：打球日只查本季（第 90 行），People 要查本季＋上一季的成員（第 91 行，`allMemberIds`），要用 `or` 篩兩個季度，或查兩次。另外有更便宜的做法：這裡的 `people` 只拿來當 `buildMentionResolver` 的保底姓名，第 22 行註解寫 USERS 找不到的情況「理論上不會發生」，所以也可以改成用到時才查，或直接拿掉保底。
    - 成員超過 100 位要處理分頁，寫法參考 `users-repository.ts:39-56`。
  - **備案：People DB 全表建 `pageId → name` 的 in-memory Map（TTL 約 10 分鐘）。** 對整季名單的效益跟首選差不多，但多了下面的快取陷阱。它的範圍比首選大：`請假人` 是單向 relation，沒有反向欄位可篩，只有快取能加速鎖內的請假人姓名查詢（`event-status-message.ts:30`），等於順便處理下面「回覆訊息在鎖內組」那一項。只有在想一起處理那一項時才值得考慮。新 LINE 使用者自動建立的 People 頁面（見 `docs/notion/databases.md` 第 49 行）不在快取裡，要走 miss 路徑逐筆 GET。

  已知陷阱：
  - **query 回來的順序跟 relation 順序不同。** participants 的編號、news 的名單順序都依賴 `season.members` 的順序，要照它重排。日期那邊 `groupDatesByMonth` 本來就會排序，不受影響。
  - **打球日的查詢結果不能拿去算名額。** Calendar query 回來的是完整 `CalendarEvent`，內含 `guests`／`absentees`。在鎖外查到的這份只能用在公告列日期，算名額一律照 [ADR 0001](docs/adr/0001-explicit-fresh-calendar-event-wrapper.md) 在鎖內重讀。
  - **若走快取備案，不要快取整個 `PersonRecord`。** 它帶有 `hasPaid`（`結清` formula，`people-repository.ts:13`）。目前全 repo 沒有其他地方讀 `hasPaid`（`owe` 走 `findAllUnpaid`），所以現在不會出錯。風險在之後：有人從快取讀 `hasPaid`，會拿到最多 TTL 前的繳費狀態，而且不會有任何錯誤訊息。快取只存 name，或在型別上分開。
  - **若走快取備案，快取是 module 層級狀態，測試之間會殘留。** 要提供 reset 函式，在測試檔的 `beforeEach` 呼叫。**不要**在 `src/test-utils/setup.ts` 用靜態 import 引入：那支檔案只負責在任何 module 載入前設定 env var，靜態 import 會被 hoist 到 env 設定之前，讓 `env.ts` 驗證失敗，也可能讓測試檔對 `notion-fetch.js` 的 `vi.mock` 失效。
  - **測試 fixture：** `create-test-bot.ts:74-86` 的 `routePost` 只依 DB ID 回 fixture、不看 filter，改用 DB query 後現有 fixture 大多可以直接用。另外 `routeGet` 的 `/pages/:id`（第 102-109 行）一律從 people fixture 找，所以現在測試裡 calendar 的 `findByPageIds` 拿到的其實是 people 頁面。改成 calendar query 後反而更正確，但既有斷言可能要跟著調整。

- [ ] **報名／請假的回覆訊息在鎖內組，拉長鎖持有時間。** `buildEventStatusMessage` 在請假人數 >0 時會呼叫 `peopleRepo.findByPageIds` 查請假人姓名（`event-status-message.ts:29-31`）。它在 `withFreshCalendarEvent` 的 mutation 裡被呼叫，後面的 `replyMessage` 也在 mutation 裡，所以鎖要等 LINE API 回應後才釋放。共有 5 處：
  - `registration-handler.ts:74-82`（名額不足）、`114-122`（成功）
  - `leave-handler.ts:75-83`（已請假，no-op）、`89-97`（未請假，no-op）、`124-132`（成功）

  實測鎖持有時間：中位數約 1.43 秒（0.85～4.44 秒，n=34）。n=34 是所有進到鎖內的報名／請假請求，包含名額不足和 no-op 分支，所以比成功寫入的次數（`+N`／`-N` 26 次＋請假／銷假 4 次）多。log 沒有 acquire／release 事件，這是用鎖內第一個 calendar query 的開始時間，算到 `LINE reply sent` 推出來的。4.4 秒那筆是 calendar PATCH 長尾，跟組訊息無關。鎖內姓名查詢中位數約 0.28 秒，LINE reply 約 0.2 秒。

  鎖內多出的時間會隨請假人數增加：每位請假人約 0.3 秒 GET，加上筆與筆之間 400ms sleep。1 人約 0.3 秒，2～3 人約 1～1.7 秒，5～6 人約 3.1～3.8 秒。log 是測試流量，請假人數只有 0～2 人。但從 calendar payload 看，7/04～9/19 各週的最終請假人數是 0～6 人（中位數約 2.5），週末前的報名可能遇到較高的數字。

  這項不是 bug，單一使用者的回覆時間也不會變短，只在有人排隊時才有幫助：縮短後面的人的等待，降低 mutex 逾時的機率。`withMutex` 的 10 秒逾時從呼叫時起算、含排隊時間（見 [ADR 0002](docs/adr/0002-mutex-timeout-does-not-cancel-task.md)）。以目前鎖持有中位數 1.43 秒估算，約 7 人同時排隊才會逾時；遇到 Notion 長尾時約 3～4 人。逾時的使用者會收到「這次操作可能已經完成，請勿重複操作」，背景寫入照常完成。

  如果要處理：可以讓 mutation 回傳組訊息需要的資料，改到鎖外組訊息並 `replyMessage`。要改 `with-fresh-calendar-event.ts:18` 的 mutation 簽名，它現在是 `(fresh: T) => Promise<void>`。
  - 移到鎖外不會造成資料不一致：訊息內容仍然用 mutation 在鎖內算出的快照（`updatedGuests`、`newAbsentees`、`totalSlots`），跟現在一樣。差別只有姓名查詢晚一點（姓名不會變），以及 B 的回覆可能比 A 先到，都無害。
  - 如果做了上面 `findByPageIds` 那一項的快取備案，請假人姓名會走快取，鎖內只剩 LINE reply 約 0.2 秒，這一項就不值得做了。那一項的首選做法（反向 relation 查詢）不碰鎖內的查詢，做完後這一項的效益不變。
  - 另有一個可以單獨做的小改善：操作對象本人在請假名單裡時（請假成功、「已請假，無需重複操作」，以及已請假的季租成員自己 `+N`），他的 People 頁會 GET 兩次，一次在鎖外的 `resolveTarget`（`target-resolver.ts:31`），一次在鎖內的 `buildEventStatusMessage`（`event-status-message.ts:30`）。不是 bug，姓名相同，只是鎖內多一次約 0.3 秒的 GET；請假成功時本人排在 `newAbsentees` 最後（`leave-handler.ts:103`），前面有人時還要多等一次 400ms sleep。如果要處理：可以讓 `buildEventStatusMessage` 多收一個「已知 pageId → 姓名」參數（傳 `resolved.personPageId` → `resolved.displayName`），已知的就跳過 GET，但輸出順序要維持 `absenteePageIds` 的順序。pageId 出現在請假名單就一定有 People 頁，所以這時 `displayName` 一定是 People 的 `Name`，不會拿到 LINE 名稱。若做了上面的鎖外組訊息，或 `findByPageIds` 那一項的快取備案，這個重複的影響會變小或消失。

---

## Log 可觀測性（2026-09-28 評估，尚未處理）

> 2026-09-28 用 subagent 評估「只靠 log 能不能 debug」，逐一檢查這些情境：報名結果不對、bot 沒回、同時報名、換季、排程失敗、USERS 重複建頁、Notion 錯誤或變慢。
> - **前提：正式環境（Pi）一直跑 `LOG_LEVEL=debug`**（2026-09-28 向使用者確認；之後可看 Pi `/logs` footer 的 LOG_LEVEL 徽章複查，見 `docs/logging.md`「訊息內容跟身分識別資訊只在 debug 層」段）。所以 Notion request/response 全文、LINE 回覆全文、`Routing command`、userId 都有記錄，大部分「為什麼這樣判斷」可以從 debug 行反推。下面的優先順序以 debug 為前提；若改成 info，見第一項。
> - 做得好的部分不用動：reqId 分組、每次 Notion 呼叫的 purpose 和 durationMs、429 重試的 warn、Notion HTTP 錯誤的 status 和 body、LINE 回覆失敗的 `err`、報名／請假成功的摘要、排程每條路徑結尾都有 log。
> - 本機 `logs/` 是本機 docker 測試產生的，不是 Pi 的 log。Pi 上的實際狀態（例如 R2 有沒有啟用）要到 Pi 的 `/logs` 確認。
>
> 以下都不是急件：正式環境是 debug，除了「Notion 網路錯誤…」那一項以外，都只影響 `/logs` 的呈現或除錯效率，不影響使用者。

- [ ] **正式環境一直開 `debug`，跟文件設計的前提相反，需要決定以哪邊為準。** 文件的設計是「預設 info，診斷時才暫時開 debug」：
  - `docs/overview.md:106` 寫「診斷完務必改回 `info`，否則這些 PII 會持續寫進 `/logs` 可查到的檔案」。
  - `docs/adr/0005-purpose-context-layered-on-reqid.md` 第 11、21、25 行的分層理由，也建立在「正式環境預設 info」上。
  - `src/config/env.ts:16` 預設是 `info`，`docker-compose.yml` 沒有覆寫，所以 Pi 上的 `debug` 是在 `.env` 設的。

  現在沒有功能上的問題，開 debug 反而讓除錯更容易。但文件跟實際不一致，而且有兩個具體風險：
  - PII 常駐：成員姓名、LINE userId、groupId、使用者訊息原文都一直寫進 `logs/`，有啟用 R2 的話也會上傳備份，而且 R2 不受 7 天保留限制。
  - 之後有人照 `overview.md:106` 改回 `info`，會立刻觸發下面「只有 `LOG_LEVEL=info` 才會發生：…」那一項的 bug，而且報名被拒的原因、寫入內容、季度名稱在 info 層都看不到，要先做完「報名／請假只有成功路徑有 info 摘要…」那一項才不會失去這些資訊。

  如果要處理，有兩個方向，要由使用者決定：
  - **維持 debug**：改 `docs/overview.md:106`、`docs/development.md:80`（`LOG_LEVEL` 那列）、`docs/logging.md:115,123,137`（「預設 `LOG_LEVEL=info`」的敘述）、`docs/adr/0006-log-r2-sync-is-periodic-full-directory-not-rotation-hook.md:17`，並在 ADR 0005 補一段現況，明講正式環境常駐 debug、接受 PII 寫入 log 與 R2。ADR 0005 的分層仍然有用（切到 info 時畫面不會空白），不用拆掉。
  - **改回 info**：先做下面「只有 `LOG_LEVEL=info` 才會發生：…」那一項，以及「報名／請假只有成功路徑有 info 摘要…」那一項。另外，以下 info／warn／error 行直接帶 userId 或 groupId，違反 ADR 0005 補充段「摘要級留 info、載荷級／身分識別資訊留 debug」的原則（第 19、21 行；第 25 行說明 warn/error 不受 `LOG_LEVEL` 篩選，放在這些行的欄位在任何等級都會寫出），要一併改成 USERS pageId 或搬到 debug：`display-name-update.ts:40,47,58`、`user-management.ts:24,57,62`、`member-joined-handler.ts:29`、`welcome-message.ts:79`、`weekly-push.ts:46`。這份清單是單行 grep 的結果，改之前要再搜一次跨多行的 logger 呼叫。`registration-handler.ts:94`、`leave-handler.ts:112` 的 `targetDisplayName`（姓名）也在 info，要決定是寫進 ADR 當例外還是搬走。

- [ ] **Notion 網路錯誤、或錯誤回應不是 JSON 時，`Notion API error` 那一行不會寫出來。** `src/services/notion/notion-fetch.ts`：
  - 第 57 行的 `fetch` 沒有 try/catch。DNS 失敗、連線中斷、逾時這類網路錯誤會直接丟出，不會記任何 Notion 層的錯誤 log。
  - 第 32 行的 `assertOk` 先 `await res.json()`。Notion 或中間的 proxy 回傳 HTML／純文字（常見於 502/503）時，這裡會丟 `SyntaxError`，第 33 行的 `logger.error` 永遠不會執行，HTTP status 也跟著遺失。

  這是 bug，但目前還沒觀察到。發生時的結果：
  - 多數呼叫端有自己的 try/catch（`message-handler.ts:23-29`、各指令 handler、`with-fresh-calendar-event.ts:38`），會記自己的 error（例如 `Message handler error`）並回「系統錯誤」，事件狀態是「失敗」。但 error 裡只看得到 `fetch failed` 或 JSON 解析錯誤，看不出是哪個 Notion 呼叫、status 多少。
  - `/logs` 時間軸上那一步只有 request、沒有 response 也沒有錯誤（`log-grouping.ts:103-110` 靠 `Notion API error` 這個訊息把該步標成失敗）。
  - 沒被接住的路徑（目前主要是「已知問題」裡報名／請假取鎖前那段）才會落到 `event-router.ts:39` 的 `Error handling event`。這種情況沒有回覆，再加上下一項的判斷順序問題，事件會顯示成「警告」而不是「失敗」。

  如果要處理：
  - 可以用 try/catch 包住 `fetch`，失敗時用**同一個訊息字串** `'Notion API error'` 記 `{method, path, db, durationMs, err}` 再丟出。訊息字串不能改，`log-grouping.ts` 靠它配對。
  - `assertOk` 可以改成先 `res.text()`，再試著 `JSON.parse`，失敗就把截斷後的原文當 `err` 記下來。
  - 丟出的 `Error` 訊息目前是 `Notion API error: ${JSON.stringify(err)}`（第 34 行），改法要讓呼叫端拿到的訊息仍然可讀。
  - 跟 TODO「已知問題」的「報名／請假在取鎖前的 Notion 例外不會回覆使用者」是不同的事：那一項是使用者收不到回覆，這一項是 log 記得不完整，兩者可以分開做。

- [ ] **`/logs` 的事件狀態判斷順序，會把真正的錯誤顯示成「警告」或「降級」。** `src/routes/logs.ts:559-576` 的 `groupStatus()` 依序判斷：
  1. Notion 步驟錯誤或 LINE 送出失敗 → `error`（第 560-564 行）
  2. 指令類事件從頭到尾沒送出回覆 → `warn`（第 568 行，原意是標示「指令解析失敗、使用者沒收到反應」這種安靜的失敗）
  3. 有降級訊息 → `degraded`（第 569-571 行）
  4. 任何 error／fatal 等級的 log → `error`（第 572-573 行）

  問題在第 2 步排在第 4 步前面：指令處理中途丟出、且沒被 handler 自己的 try/catch 接住（因此沒有回覆）的例外（例如程式 bug、上一項的網路錯誤），`event-router.ts:39` 會記一行 error 等級的 `Error handling event`，但因為沒有回覆，第 2 步先回傳 `warn`，「需要注意」分頁裡看起來跟「指令打錯字」一樣。

  第 3 步排在第 4 步前面則是**刻意的設計**，不是 bug：`buildMemberJoinedWelcome error, using fallback`（`welcome-message.ts:79`）是 `logger.error`，但歡迎訊息有正常送出，所以列進 `DEGRADATION_EXPLANATIONS`（`logs.ts:76-91`），要顯示成「完成（有降級）」而不是「失敗」（`docs/logging.md:73` 也有寫）。

  這是 `/logs` 的顯示 bug，資料本身沒有少，點進事件還是看得到 error 行。如果要處理：
  - 可以在第 2 步之前加一個 error／fatal 判斷，但**要排除 `DEGRADATION_EXPLANATIONS` 裡的訊息**。不能單純把第 572-573 行整段往前搬，否則上面那個降級會被改判成「失敗」。
  - 既有的狀態測試在 `src/routes/__tests__/logs.test.ts`（第 274、434、445 行附近，用 `data-status` 斷言），沒有直接測 `groupStatus` 的單元測試。第 445 行的降級測試用的是 info 等級的訊息，改之前要補一個「error 等級的降級訊息仍然是 degraded」的測試，才抓得到回歸。
  - 改完要同步 `docs/logging.md` 的狀態判定說明。

- [ ] **只有 `LOG_LEVEL=info` 才會發生：所有文字訊息都被判成「指令」，其中沒命中自動回覆的（多數閒聊）再被標成「警告」。** `src/routes/logs.ts:448` 的 `groupKind()`，在沒有 debug 層的 `Routing command`／`Auto-reply lookup` 時，改用「這個事件有沒有 Notion 呼叫」判斷是不是指令。但 `handlers/message-handler.ts:24` 對每則文字訊息都會 `findByUserId`，群組訊息還會觸發 `trackUser` 的累加發言數 PATCH，所以閒聊一定有 Notion 呼叫，被判成指令；沒命中自動回覆的閒聊沒有回覆，再被第 568 行標成 `warn`。命中自動回覆的有送出回覆，不會是警告，但「來自」欄位會顯示未知。

  正式環境是 debug，現在**不會發生**，因為第 444-447 行會先命中 debug 訊息。風險是依第一項改回 info 的那一刻，「需要注意」分頁會被閒聊洗版。另外，`logs.ts:433` 的註解和 `docs/logging.md:45` 都寫「單純聊天不會查 Notion」，這句與程式不符：程式從第一版（commit `23c32a1`）起就對每則訊息查 USERS，所以這句註解寫下時就不成立。

  如果要處理：可以在 `message-handler.ts` 加一行 info 摘要，例如 `{isCommand, commandType, parsed}`，不含訊息原文（ADR 0005），`groupKind()` 改看這一行。舊的 log 檔沒有這行，所以第 448 行的 fallback 要保留給舊檔。

- [ ] **mutex 沒有記排隊多久、鎖持有多久。** `src/services/mutex.ts:32-68` 的 `withMutex` 只在逾時時記一行 warn（第 74-77 行，只有 `{key}`），正常情況完全沒有 log。

  不是 bug。影響是：
  - 兩人同時報名、名額算錯或逾時的時候，看不出前面排了幾個、等了多久。
  - TODO「回覆訊息在鎖內組」那一項的鎖持有時間，只能用「鎖內第一個 calendar query 開始」到「`LINE reply sent`」間接推算。做了這一項，那一項改完後就能直接比對效果。

  如果要處理：
  - 可以在任務**真正結束**時記一行摘要，欄位如 `{key, queuedAhead, waitMs, heldMs, callerTimedOut}`，掛在 `settle` 完成的地方（第 43-46 行的 `tail`），不要掛在 caller 的 `finally`（第 60 行）。逾時後 caller 早就離開，但 `fn()` 還在背景跑（ADR 0002），掛在 caller 那邊會量到錯的持有時間。建議記一行摘要，不要分 acquire／release 兩行，量比較小。
  - `queuedAhead` 若直接讀第 33 行加一前的 `pending`，會少算已逾時、但 `fn()` 仍在排隊或執行的任務（`pending` 在 caller 的 `finally` 就減一，第 60-67 行），而逾時正是最需要這個數字的情境。要準確的話，另外維護一個在 `tail` 完成時才減一的計數。
  - **`user-track-${userId}` 這種 key 含 userId**（`user-management.ts` 的 `trackUser`），而且每則群組訊息都會觸發一次。這類 key 如果要記，要放 debug 或完全不記，不然 info 層會帶 userId，量也大。日期 key（`2026-10-03`）每次報名／請假才一行，可以放 info。
  - 逾時的 warn 可以一起補上 `queuedAhead`。

- [ ] **報名／請假只有成功路徑有 info 摘要，被拒絕或 no-op 的分支沒有。** 成功時有 `Registration updated`（`registration-handler.ts:90-99`）和 `Leave status updated`（`leave-handler.ts:108-116`）。以下分支都只有 LINE 回覆，沒有自己的 log：
  - 報名鎖內被拒：`registration-handler.ts:73-85`（`result.canAdd === false`，包含名額不足、活動暫停、找不到報名紀錄、取消數量 ≤0，見 `capacity-calculator.ts:107,120,188,197`）
  - 請假已請假、未請假的 no-op：`leave-handler.ts:74-86`、`88-100`
  - 找不到下週六的活動：`with-fresh-calendar-event.ts:29-31`（報名、請假共用）
  - 取鎖前的拒絕：`registration-handler.ts:28-54`（格式錯誤、不是管理員、找不到對象、找不到季租資料）、`leave-handler.ts:28-63`（同上，再加非季租成員）

  在正式環境（debug）**不是缺口**：被拒原因看 `LINE reply payload`，季度看 Season query 的 request body，寫入內容看 Notion PATCH body，大多可以反推，只是要一個一個點開 debug 行，比較費工。

  以下情況價值會提高：改回 info 時（見本段第一項「正式環境一直開 `debug`…」），或想用封存的 log 做季末對帳時。

  如果要處理：
  - 可以在每個結束分支記一行 info 決策摘要，欄位如：
    - `outcome`（例：`ok`、`full`、`no-registration`、`not-season-member`、`already-absent`）
    - `date`、`seasonName`、`isSelfSeasonMember`、`isAdmin`
    - `requestedDelta`、`cappedAt`
    - 容量數字：`courts`、`totalSlots`、`guestCountBefore`／`After`
    - 只放本次新增／移除的條目
  - 容量數字都在 `occupancy` 裡，不用改 calculator。
  - 想記目標是怎麼解析出來的（本人／mention／姓名 fallback），`resolveTarget` 要多回傳一個欄位，`target-resolver.ts` 的三條路徑都要改，測試也要跟著改。
  - 完整名單和姓名要不要放 info，看本段第一項的 PII 決定。

- [ ] **小項彙整（低優先，各自獨立，不是 bug 或影響很小）：**
  - **週報中止分不出原因。** `services/notion/event-occupancy.ts:27` 在「沒有活動」或「沒有季資料」時都回 `null`，`weekly-push.ts:30` 只記 `Weekly push aborted: no calendar/season data for date`。debug 層可以從 Calendar／Season query 的 response 看出哪個是空的，所以正式環境查得到。如果要處理：可以在第 27 行 return 前記 `{date, hasEvent, hasSeason}`。這也能解釋 ADR 0008 最後一段 `@Dobby next` 誤導訊息的那個情況。
  - **沒記 webhook 延遲。** `handlers/event-router.ts:17-20` 的 `Processing event` 沒有 `Date.now() - event.timestamp`。replyToken 失效或 Pi 積壓時，看不出事件是不是很晚才處理。如果要處理：加 `lagMs` 欄位，不含 PII，可以放 info。
  - **沒有 userId 的訊息直接丟掉，沒有 log。** `handlers/message-handler.ts:15` `if (!userId) return;`。LINE 群組來源在某些情況可能不帶 userId（未確認是哪些用戶端），發生時使用者會覺得 bot 沒反應，但 log 只有 `Processing event` 跟 `Event processed`。如果要處理：return 前記一行 `{sourceType}`。
  - **新使用者建立完成沒有摘要。** `services/user-management.ts:91-102` 建 USERS、建 People、連結三步都沒有成功 log，只有同名略過（第 57 行）和失敗（第 62 行）有 warn。debug 層看得到每個 Notion 呼叫的 body，可以反推。如果要處理：記一行 `{usersPageId, personLink: 'created'|'same-name-skipped'|'failed'}`，userId 放 debug。
  - **display-name 批次的統計會誤導。** `schedulers/display-name-update.ts:66` 的 summary 有 `updated/skipped/failed/total`，但「名稱沒變」（第 52 行條件不成立）和「沒有 userId」（第 36 行 `continue`）的人算進 `total`，卻不在任何一個計數裡。`/logs` 的批次結果圖只按有記錄的欄位畫比例，30 人只更新 1 人也會顯示 100% 綠色。如果要處理：補 `unchanged`、`noUserId` 兩個計數。另外，USERS `groups` 殘留的測試群組 ID 每週都會讓 `profile-service.ts:32` 記 `Could not get user profile`（該使用者所有群組都查不到時，再加第 47 行的 warn），這是降級訊息，事件每週都顯示成「完成（有降級）」，真的出問題時會被蓋掉；比較好的做法是清掉殘留的群組 ID，不是降低 log 等級。
  - **同一事件裡兩個相同的 Notion 呼叫會被誤判成重試。** `routes/log-grouping.ts:35-37` 用 `method + path` 當配對 key，第 59-76 行遇到同 key 還沒回應的呼叫就當成重試（`attempts += 1`）。同一個 reqId 裡並行發出兩個 method＋path 相同的呼叫時（對同一個 DB 的 query 路徑都是 `POST /databases/{id}/query`，不管查詢條件；例如同一人快速連發訊息，`trackUser` 的鎖內重查剛好撞上 `resolveTarget` 查被 mention 對象的 USERS query），時間軸會顯示「重試 1 次」，另外多一筆沒配對到的 response。只影響顯示。如果要處理：可以讓 `notion-fetch.ts` 每次呼叫產生一個 `callId`（做法同 ADR 0005 補充段的 LINE `sendId`），`log-grouping.ts` 改用它配對；舊 log 檔沒有 `callId`，要保留 method+path 的 fallback。
  - **事件的「使用者」欄位抓群組裡第一個符合的值。** `routes/logs.ts:473-486` 的 `groupUserId`／`groupDisplayName` 各自抓第一筆有 `userId`／`targetDisplayName` 的 log。管理員代報 `+1 @X` 時，userId 是管理員、姓名卻是被報名的 X，兩者對不起來；display-name 排程會把批次中第一筆帶 userId／displayName 的 log 對應的使用者顯示成「使用者」。只影響顯示。
  - **兩個會誤導的 log 文字。** `services/line/reply-service.ts:43` 的訊息 `Reply failed, no fallback available (no groupId for push)` 暗示有 push 備援的可能，但依 `CLAUDE.md` 永遠不會用 push 補發；這個字串也寫死在 `routes/log-grouping.ts:30`，`docs/logging.md:76` 也有引用，改的時候三處要一起改，否則 `/logs` 會配對失敗。另外，`services/notion/users-repository.ts:30` 的 purpose「查詢發話者的 bot 使用者帳號」，也被用在查被 mention 的目標（`target-resolver.ts:38`）和 `trackUser` 的鎖內重查（`user-management.ts:89`），時間軸上的標籤不精確。
  - **沒有 `unhandledRejection`／`uncaughtException` handler。** `src/index.ts` 沒有註冊，process 因此 crash 時 stack 只在 docker 的 json-file log（上限約 30MB，見 `docs/overview.md:104`），不在 `logs/`，`/logs` 看不到。如果要處理：要注意 pino 在 process 結束前可能來不及 flush 到檔案。

---
