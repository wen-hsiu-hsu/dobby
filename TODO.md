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

## 規劃中功能（尚未開發）

- [ ] **成就系統（含賽季彩蛋）** —— 規則見 [`docs/achievements-rulebook.md`](docs/achievements-rulebook.md)。目前只有遊戲規則，**沒有實作設計，也還沒排入開發**，不是急件。開工前要注意：
  - **可行性要重新分析。** 2026-09-27 曾對照當時的程式碼（commit `6e28250`）做過一次初步分析，但結論沒有寫進 repo，只留下規則書第 11 節的待確認事項。開工時程式碼一定已經改過，要用當下的程式碼從頭分析，不要假設當時的判斷還成立。
  - **先把規則書第 11 節的待確認事項定案。** 那幾項是規則本身互相矛盾，或定義不足以直接實作，不是實作細節，照目前的文字寫不出唯一正確的行為。
  - **規則書第 9 節列的 Notion 資料庫不是完整的實作清單。** 那一節只列出管理者要填的設定，成就解鎖紀錄、哪些打球週已結算、發話統計這類系統自己要存的狀態都沒列。重新分析時要另外盤點。
  - **規則要對照 `CLAUDE.md` 的專案慣例檢查**，特別是「回覆一律用 `replyMessage`」、Notion rate limit（約 3 req/s），以及「讀取 → 計算 → 寫回用 `withMutex`」。規則書的「不推播」「一則訊息只回覆一次」和這些慣例一致，但實作時每則群組訊息都要判定成就，要注意不能每則都打 Notion。

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
> - Notion 單次呼叫中位數約 430ms，p90 約 660ms，偶有 3.3～5.5 秒的長尾。
> - 沒有任何 429，也沒有任何 mutex 逾時。
> - log 幾乎都是測試流量：報名只有 2 個 userId，請假人數只有 0～2 人。正式搶報的行為還沒被觀察到。
>
> 慢的原因是呼叫模式（逐筆查、人為延遲、重複查、能平行卻依序），不是 Notion 本身或 rate limit。前三項都**不是 bug**：結果正確，只是慢，不是急件，依效益排序。第四項 mutex 逾時是潛在的錯誤回覆風險，排序依據不同，要獨立評估。做完任何一項後，都要在 `/logs` 時間軸比對同類指令前後的 Notion 呼叫數與總耗時。

- [ ] **`findByPageIds` 逐筆 GET，每筆之間 sleep 400ms，是 `participants`／`news` 慢的主因。** 兩個 repository 都有這個函式：
  - `src/services/notion/people-repository.ts:17-27`（sleep 在第 21 行）
  - `src/services/notion/calendar-repository.ts:55-65`（sleep 在第 59 行）

  sleep 是 commit `8a4ed71`（2026-09-18）加的。當時原本用 `Promise.all` 完全平行，怕瞬間超過約 3 req/s，就比照 `display-name-update.ts` 改成依序＋400ms。commit 沒提到真的遇過 429，是預防性的節流。

  呼叫端：
  - `participants.ts:19`：推估 1＋N 次呼叫（N≈11 位季租成員），約 7 秒。log 裡沒有這個指令，數字是用單次 GET 約 280ms＋sleep 400ms 推算的。
  - `news.ts:75-76`：實測 2 次，都是 29 次呼叫（11 次姓名 GET＋13 次活動 GET＋5 次其他），耗時 11.3 和 11.7 秒。兩組 GET 各自拖了 7～9.5 秒，其中 sleep 約佔各組的 55～60%，約佔整個指令的 40%。兩組用 `Promise.all`（`news.ts:73-77`）同時跑，平均合計約 2.5～3 req/s，任 1 秒窗口瞬間最多 4 個 GET，靠 Notion 容許的短暫突發撐住，沒有出現 429。
  - `season-announcement.ts:90-91`：管理員專用（產生新一季公告草稿），頻率很低，優先度比 news／participants 更低。
  - `weekly-status-message.ts:22`
  - `registration/event-status-message.ts:30`：報名／請假的回覆訊息查請假人姓名，在鎖內執行，見下面第三項。只有請假人數 ≥2 時才會觸發 sleep。
  - `registration/target-resolver.ts:19,28`：每次只傳 1 筆 ID，sleep 永遠不會觸發，**不受這一項影響**。

  **只拿掉 sleep 或改有限並行不能解決問題。** 現在平均已經頂在 3 req/s 上限，拿掉 sleep 就會超出，變成靠 Notion 容忍短時間超量加上 429 重試兜底，違反 `CLAUDE.md` 的節流慣例。news、season-announcement 還會有 2～3 組同時跑。真正能加速的只有減少呼叫次數。Notion query 也沒辦法依 page ID 篩選（SDK 的 `PropertyFilter` 只有 relation 的 `contains`），所以不能把 N 次 GET 合成一次「ID in [...]」查詢。

  如果要處理（範圍只限「整季名單」的呼叫端：news、participants、season-announcement）：
  - **首選：用反向 relation 直接查詢，不用快取。**
    - 季租成員：query People DB，篩選 `報名季度` contains `season.pageId`。
    - 打球日：query Calendar DB，篩選 `季度` contains `season.pageId`。
    - news 的 24 次 GET 會變成 2 次 query，預估從約 11.5 秒降到 2～3.5 秒。participants 從 1＋11 次降到 2 次。
    - schema 顯示 `報名人`（季租紀錄）↔`報名季度`（People）、`打球日`（季租紀錄）↔`季度`（行事曆）各自是兩個 DB 之間唯一的 `dual_property`，很可能就是配對的兩端。但 `docs/notion/schemas/` 沒記錄配對的屬性名，實作前要先用 Notion API 讀 database schema 的 `synced_property_name` 確認。
    - season-announcement：打球日只查本季（第 90 行），People 要查本季＋上一季的成員（第 91 行，`allMemberIds`），要用 `or` 篩兩個季度，或查兩次。另外有更便宜的做法：這裡的 `people` 只拿來當 `buildMentionResolver` 的保底姓名，第 22 行註解寫 USERS 找不到的情況「理論上不會發生」，所以也可以改成用到時才查，或直接拿掉保底。
    - 成員超過 100 位要處理分頁，寫法參考 `users-repository.ts:39-56`。
  - **備案：People DB 全表建 `pageId → name` 的 in-memory Map（TTL 約 10 分鐘）。** 對整季名單的效益跟首選差不多，但多了下面的快取陷阱。它的範圍比首選大：`請假人` 是單向 relation，沒有反向欄位可篩，只有快取能加速鎖內的請假人姓名查詢（`event-status-message.ts:30`），等於順便處理第三項。只有在想一起處理第三項時才值得考慮。新 LINE 使用者自動建立的 People 頁面（見 `docs/notion/databases.md` 第 49 行）不在快取裡，要走 miss 路徑逐筆 GET。

  已知陷阱：
  - **query 回來的順序跟 relation 順序不同。** participants 的編號、news 的名單順序都依賴 `season.members` 的順序，要照它重排。日期那邊 `groupDatesByMonth` 本來就會排序，不受影響。
  - **打球日的查詢結果不能拿去算名額。** Calendar query 回來的是完整 `CalendarEvent`，內含 `guests`／`absentees`。在鎖外查到的這份只能用在公告列日期，算名額一律照 [ADR 0001](docs/adr/0001-explicit-fresh-calendar-event-wrapper.md) 在鎖內重讀。
  - **若走快取備案，不要快取整個 `PersonRecord`。** 它帶有 `hasPaid`（`結清` formula，`people-repository.ts:13`）。目前全 repo 沒有其他地方讀 `hasPaid`（`owe` 走 `findAllUnpaid`），所以現在不會出錯。風險在之後：有人從快取讀 `hasPaid`，會拿到最多 TTL 前的繳費狀態，而且不會有任何錯誤訊息。快取只存 name，或在型別上分開。
  - **若走快取備案，快取是 module 層級狀態，測試之間會殘留。** 要提供 reset 函式，在測試檔的 `beforeEach` 呼叫。**不要**在 `src/test-utils/setup.ts` 用靜態 import 引入：那支檔案只負責在任何 module 載入前設定 env var，靜態 import 會被 hoist 到 env 設定之前，讓 `env.ts` 驗證失敗，也可能讓測試檔對 `notion-fetch.js` 的 `vi.mock` 失效。
  - **測試 fixture：** `create-test-bot.ts:74-86` 的 `routePost` 只依 DB ID 回 fixture、不看 filter，改用 DB query 後現有 fixture 大多可以直接用。另外 `routeGet` 的 `/pages/:id`（第 102-109 行）一律從 people fixture 找，所以現在測試裡 calendar 的 `findByPageIds` 拿到的其實是 people 頁面。改成 calendar query 後反而更正確，但既有斷言可能要跟著調整。

- [ ] **報名／請假：同一個請求查兩次 USERS，互不相依的查詢依序執行。** 實測成功寫入的 `+N`／`-N` 共 26 次（另有 7 次失敗或 no-op 未計），每次 7～12 個 Notion 呼叫，中位數 3.3 秒（2.4～7.1 秒）。10、12 個呼叫的是新使用者第一次 `+1`，會多建 USERS／People 頁面。請假／銷假每次 7～9 個呼叫，中位數 3.1 秒（只有 4 筆樣本）。除了 `trackUser` 的「累加使用者發言次數」PATCH（fire-and-forget，和指令路徑並行），其他呼叫都依序執行。

  典型的既有使用者 `-2`（log reqId `aa2f09`，總耗時 3.1 秒，時間相對於事件開始）：
  ```
  USERS      +8    → +548   message-handler 的 findByUserId
  USERS      +552  → +1037  resolveTarget（重複查同一人）
  incMsg     +556  → +1040  trackUser fire-and-forget，和上一列並行
  PeopleGET  +1056 → +1323  resolveTarget 查自己的姓名
  Season     +1325 → +1689  可以和 resolveTarget 並行
  Cal        +1692 → +2081  鎖內
  updGuests  +2090 → +2607  鎖內
  PeopleGET  +2613 → +2905  請假人姓名（鎖內，見第三項）
  ```

  - **重複查 USERS。** `handlers/message-handler.ts:24` 已經 `findByUserId` 一次，`registration/target-resolver.ts:16` 自己報名時又查一次（替別人報名走第 25 行，查的是別人，不算重複）。請假也走 `resolveTarget`（`leave-handler.ts:36`）。
  - **能平行卻依序執行。** `registration-handler.ts:36` 的 `resolveTarget` 和第 46 行的 `seasonRepo.findByName` 互不相依：季度名稱只由日期算出，`resolved` 到第 52 行才用到。`leave-handler.ts:36,47` 也一樣（第 54 行才用到 `resolved`）。
  - 另有一個小重複：請假成功時，自己的 People 頁會 GET 兩次，一次在 `resolveTarget`，一次在 `buildEventStatusMessage` 查請假人姓名。這個不在本項範圍，改請假人姓名的查詢方式時才會一起解掉。

  如果要處理：
  - **傳 `notionUser`：** `routeCommand`（`message-handler.ts:49`）加一個參數；router 的 3 個呼叫點（`command-router.ts:52,56,59`）、`handleRegistration`、`handleLeave`、`resolveTarget` 各加一個 optional 參數 `actorUser?: NotionUser | null`。只有非 null 時才採用，null 或 undefined 就重查。既有 handler 測試直接用 `(event, x, false)` 呼叫的地方不用改，但 `src/commands/__tests__/command-router.test.ts:141,149,157,178,185,192` 用 `toHaveBeenCalledWith(event, x, isAdmin)` 斷言，router 多傳一個參數（即使是 undefined）就會失敗，要跟著改。
  - **並行：** 把 `resolveTarget` 和 `findByName` 包進 `Promise.all`。要放在 `parseError`／非管理員檢查之後，並保留「`resolved` 為 null 就先回覆錯誤」的順序，錯誤訊息才會跟現在一樣。失敗路徑會多白查一次 Season（約 0.4 秒），不影響正確性。

  預估效益（用 log 的實際 durationMs 逐筆重算 20 筆既有使用者的 `+N`）：中位數從約 3.3 秒降到約 2.4～2.5 秒，大約省 0.7 秒。其中 USERS 去重約省 0.45 秒；並行只有在使用者有綁 People 時才有效，約省 0.26 秒。這些呼叫都在鎖外，對第四項的 mutex 逾時風險沒有幫助。

  已知陷阱：
  - **傳進來的 `null` 不能當成「使用者不存在」。** 在群組／多人聊天裡，`notionUser` 為 null 時，`message-handler.ts:36-39` 會 await `trackUser` 把 USERS 頁面建好，所以傳下去的 null 在這條路徑上一定是過時的。這跟 `services/user-management.ts:83-85` 註解講的「null snapshot 不能信」同理。1 對 1 聊天不做 tracking，null 才是真的不存在，重查也只多一次呼叫。反過來，非 null 的 snapshot 可以直接用：既有使用者的 `trackUser` 只會改 groups／multiChats／message_counts（`user-management.ts` 的 existing 分支），不會改 `resolveTarget` 需要的 `registeredPersonPageId`。
  - **不要用 AsyncLocalStorage（`src/utils/request-context.ts`）對 `findByUserId` 做請求範圍快取。** `user-management.ts:89` 在 mutex 內刻意重查，要拿最新資料。`trackUser` 又是在同一個 context 裡 fire-and-forget 執行，會命中快取、拿到舊的 snapshot，重新引發 `user-management.ts:75-82` 註解在防的覆寫 groups／message_counts 問題。

- [ ] **報名／請假的回覆訊息在鎖內組，拉長鎖持有時間。** `buildEventStatusMessage` 在請假人數 >0 時會呼叫 `peopleRepo.findByPageIds` 查請假人姓名（`event-status-message.ts:29-31`）。它在 `withFreshCalendarEvent` 的 mutation 裡被呼叫，後面的 `replyMessage` 也在 mutation 裡，所以鎖要等 LINE API 回應後才釋放。共有 5 處：
  - `registration-handler.ts:70-78`（名額不足）、`110-118`（成功）
  - `leave-handler.ts:71-79`（已請假，no-op）、`85-93`（未請假，no-op）、`120-128`（成功）

  實測鎖持有時間：中位數約 1.43 秒（0.85～4.44 秒，n=34）。n=34 是所有進到鎖內的報名／請假請求，包含名額不足和 no-op 分支，所以比第二項的「成功寫入 26 次＋請假 4 次」多。log 沒有 acquire／release 事件，這是用鎖內第一個 calendar query 的開始時間，算到 `LINE reply sent` 推出來的。4.4 秒那筆是 calendar PATCH 長尾，跟組訊息無關。鎖內姓名查詢中位數約 0.28 秒，LINE reply 約 0.2 秒。

  鎖內多出的時間會隨請假人數增加：每位請假人約 0.3 秒 GET，加上筆與筆之間 400ms sleep。1 人約 0.3 秒，2～3 人約 1～1.7 秒，5～6 人約 3.1～3.8 秒。log 是測試流量，請假人數只有 0～2 人。但從 calendar payload 看，7/04～9/19 各週的最終請假人數是 0～6 人（中位數約 2.5），週末前的報名可能遇到較高的數字。

  這項不是 bug，單一使用者的回覆時間也不會變短，只在有人排隊時才有幫助（縮短後面的人的等待，降低第四項的逾時風險）。

  如果要處理：可以讓 mutation 回傳組訊息需要的資料，改到鎖外組訊息並 `replyMessage`。要改 `with-fresh-calendar-event.ts:12` 的 mutation 簽名，它現在是 `(fresh: T) => Promise<void>`。
  - 移到鎖外不會造成資料不一致：訊息內容仍然用 mutation 在鎖內算出的快照（`updatedGuests`、`newAbsentees`、`totalSlots`），跟現在一樣。差別只有姓名查詢晚一點（姓名不會變），以及 B 的回覆可能比 A 先到，都無害。
  - 如果做了第一項的快取備案，請假人姓名會走快取，鎖內只剩 LINE reply 約 0.2 秒，這一項就不值得做了。第一項的首選做法（反向 relation 查詢）不碰鎖內的查詢，做完後這一項的效益不變。

- [ ] **`withMutex` 的 10 秒逾時把排隊時間也算進去，尖峰時使用者可能收到「系統錯誤」，但報名其實已經成功，重試還會重複報名。** 現象推論自程式碼，log 裡還沒發生過。
  - **機制。** `src/services/mutex.ts:25` 的 `settle` 是「等前一個任務完成、再執行 `fn()`」，第 45 行從一呼叫 `withMutex` 就開始用 `raceAgainstTimeout` 計時（`TIMEOUT_MS` 在第 5 行），所以 10 秒是「排隊＋執行」的合計。`mutex.test.ts:64-65` 的註解也明寫 "each call's timeout is armed at call time, independent of queue"。
  - **文件跟實際行為不一致。** 下面三處都寫「單次執行有 10 秒逾時」：
    - [ADR 0002](docs/adr/0002-mutex-timeout-does-not-cancel-task.md) 第 3 行
    - `docs/architecture.md:69`
    - `docs/registration.md:89`

    另外 [ADR 0001](docs/adr/0001-explicit-fresh-calendar-event-wrapper.md) 第 3 行寫「統一處理逾時以外的例外」，但逾時其實也走同一個 catch，回的也是「系統錯誤」。
  - **逾時後使用者看到什麼。** `with-fresh-calendar-event.ts:27-28` 的 catch 先用 replyToken 回「系統錯誤，請稍後再試」，token 就被用掉了。背景的 `fn()` 會照樣跑完，報名實際寫入，但它的 `replyMessage` 會被 LINE 拒絕（token 只能用一次），被 `reply-service.ts:42-44` 吞掉，只記一筆 warn。所以使用者只看到錯誤，不會收到第二則成功訊息。同一 key 後面排隊的人也會連鎖逾時，因為每人都從自己呼叫時開始計時。
  - **重試會重複報名或多取消一筆。** `+N` 不是冪等的，重試會再寫入一筆「名字 (2)」（`capacity-calculator.ts:144`），佔掉一個名額。零打名額本來就少（約場地數×7 − 季租人數 + 請假人數），推播後的搶報正是最可能逾時的時候。`-N` 也不是冪等的：使用者有 2 筆以上報名時，重試會再刪一筆。請假／銷假重試會走 no-op 分支，不受影響。
  - **觸發機率低。** 推播是週日 09:00（`weekly-push.ts:63`）。以鎖持有中位數 1.43 秒估算，要約 7 人同時排隊才會超過 10 秒。遇到 Notion 長尾（單次 3～5 秒）時，約 3～4 人就可能觸發。log 最密集的一段是 10 秒內 3 次，最大排隊等待 1.24 秒，而且是測試流量，不代表正式搶報。

  如果要處理：
  - **建議：逾時時改回覆「處理較久，結果可能已寫入，請勿重複報名或取消」**，不要回「系統錯誤」。做法是新增 `MutexTimeoutError`（或判斷錯誤訊息前綴 `Mutex timeout: `），在 `withFreshCalendarEvent` 的 catch 分流。訊息要寫成「結果未定」：逾時當下任務可能還在排隊，最後也可能因名額不足而失敗，不能說「已成功」。改完要同步修正上面列的文件描述。
    - **陷阱：訊息不能叫一般使用者用 `next` 確認。** `next` 限管理員使用（`next-event.ts:8-10`），一般成員目前沒有任何指令能查本週報名狀態。可以寫「如需確認請洽管理員」。要不要開放 `next` 或新增成員可用的查詢指令，是範圍外的產品決策，不要順手做。
  - **縮短鎖持有時間**（第三項，或第一項的快取備案）能降低觸發機率，但沒辦法消除「看到錯誤、實際已寫入」這個結果。第一項的首選做法不碰鎖內，對這一項沒有幫助。
  - **不建議改成從拿到鎖才開始計時。** 程式改起來不難（計時器移到 `settle` 內、`fn()` 之前），但 `notion-fetch.ts` 沒有請求逾時（第 57 行的 `fetch` 沒帶 signal）。前一個任務卡住時，排隊的人會永遠拿不到鎖、永遠收不到回覆，等於拿掉現有的安全網。這個改動也會影響 `user-management.ts:88` 的 `user-track` 鎖。真要做，得先補 fetch 逾時或總等待上限。另外**不能**改成「逾時就讓下一個排隊任務開始」，那會重新引入 ADR 0002 防的 race。

---
