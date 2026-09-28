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

- [ ] **報名／請假在取鎖前的 Notion 例外不會回覆使用者。** `handleRegistration`／`handleLeave` 呼叫 `withFreshCalendarEvent` 之前，會先用 `Promise.all` 並行查 `resolveTarget` 和 `seasonRepo.findByName`（`src/commands/registration/registration-handler.ts:49-52`、`leave-handler.ts:49-52`）。這段沒有 try/catch；`with-fresh-calendar-event.ts:21-45` 的 try 只包住取鎖之後。任一查詢 throw，例外會經 `command-router.ts`、`message-handler.ts:71` 一路丟到 `src/handlers/event-router.ts:50-52`，那裡只 `logger.error`（`/logs` 會顯示為失敗），使用者收不到任何回覆。

  這是 bug，但目前還沒觀察到：
  - `notion-fetch.ts` 只對 429 重試（最多 3 次，第 74、121 行）；5xx、網路錯誤、429 重試用完都會直接 throw（`assertOk`，第 45-72 行）。本機 `logs/`（2026-09-21～27）沒有任何 `Error handling event` 或 `Notion API error`。
  - 從 n8n 遷移的第一版（commit `23c32a1`）就是這樣，當時的 try 也只包鎖內。
  - 其他指令都自己 try/catch 並回「系統錯誤，請稍後再試」：`owe.ts:6-14`、`news.ts:59-84`、`participants.ts:8-22`、`payment.ts:7-16`、`next-event.ts:13-27`、`season-announcement.ts:56-150`、`introduce.ts:12-42`。`message-handler.ts:48-54` 的 `findByUserId` 也在 commit `5ef200d` 補過同一種缺口。只有報名／請假漏掉。
  - 2026-09-28 把兩個查詢改成並行後，多了一種觸發情況：對象查無（`resolved` 為 null）而 Season 查詢 throw。舊版依序執行，會先回「找不到您的帳號」；現在 `Promise.all` 整個 reject，不回覆。其他組合的行為跟舊版相同。
  - 影響：使用者以為 bot 沒收到，通常會再打一次。這段在任何寫入之前，所以重打不會重複報名，只是體驗差。

  如果要處理：
  - 可以把取鎖前的查詢（`Promise.all` 那段）包進 try/catch，catch 時記 `logger.error`、回「系統錯誤，請稍後再試」。取鎖前還沒寫入任何東西，回「系統錯誤」、讓使用者重試是安全的。
  - **try 範圍不要包住 `withFreshCalendarEvent`。** 它自己會處理例外並回覆。外層再 catch 回「系統錯誤」的話，萬一日後它把 `MutexTimeoutError` 往外丟，就會違反 [ADR 0002](docs/adr/0002-mutex-timeout-does-not-cancel-task.md)：逾時時背景寫入可能仍會成功，`+N`／`-N` 不是冪等的，不能回「系統錯誤」引導重試。
  - 另一種做法是在 `message-handler.ts:71` 對 `routeCommand` 統一 catch，以後新增的指令也不會漏。但同樣不能讓 `MutexTimeoutError` 落到這裡被回成「系統錯誤」；已經回覆過的 handler 若之後才 throw，再回一次會因 replyToken 已用過而被 LINE 拒絕（無害，但 `/logs` 會多一筆 `Reply failed`）。
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
  - `registration/target-resolver.ts:38,47`：每次只傳 1 筆 ID，sleep 永遠不會觸發，**不受這一項影響**。

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
  - `registration-handler.ts:98-106`（名額不足）、`138-146`（成功）
  - `leave-handler.ts:100-108`（已請假，no-op）、`115-123`（未請假，no-op）、`149-157`（成功）

  實測鎖持有時間：中位數約 1.43 秒（0.85～4.44 秒，n=34）。n=34 是所有進到鎖內的報名／請假請求，包含名額不足和 no-op 分支，所以比成功寫入的次數（`+N`／`-N` 26 次＋請假／銷假 4 次）多。這是 mutex 摘要上線前量的：當時 log 沒有 acquire／release 事件，是用鎖內第一個 calendar query 的開始時間，算到 `LINE reply sent` 推出來的。2026-09-28 起可以直接看 `Mutex task finished` 的 `heldMs`／`waitMs`／`queuedAhead`（見 `docs/registration.md`「從 log 看鎖競爭」），做完這一項後用它比對效果。4.4 秒那筆是 calendar PATCH 長尾，跟組訊息無關。鎖內姓名查詢中位數約 0.28 秒，LINE reply 約 0.2 秒。

  鎖內多出的時間會隨請假人數增加：每位請假人約 0.3 秒 GET，加上筆與筆之間 400ms sleep。1 人約 0.3 秒，2～3 人約 1～1.7 秒，5～6 人約 3.1～3.8 秒。log 是測試流量，請假人數只有 0～2 人。但從 calendar payload 看，7/04～9/19 各週的最終請假人數是 0～6 人（中位數約 2.5），週末前的報名可能遇到較高的數字。

  這項不是 bug，單一使用者的回覆時間也不會變短，只在有人排隊時才有幫助：縮短後面的人的等待，降低 mutex 逾時的機率。`withMutex` 的 10 秒逾時從呼叫時起算、含排隊時間（見 [ADR 0002](docs/adr/0002-mutex-timeout-does-not-cancel-task.md)）。以目前鎖持有中位數 1.43 秒估算，約 7 人同時排隊才會逾時；遇到 Notion 長尾時約 3～4 人。逾時的使用者會收到「這次操作可能已經完成，請勿重複操作」，背景寫入照常完成。

  如果要處理：可以讓 mutation 回傳組訊息需要的資料，改到鎖外組訊息並 `replyMessage`。要改 `with-fresh-calendar-event.ts:19` 的 mutation 簽名，它現在是 `(fresh: T) => Promise<void>`。
  - 移到鎖外不會造成資料不一致：訊息內容仍然用 mutation 在鎖內算出的快照（`updatedGuests`、`newAbsentees`、`totalSlots`），跟現在一樣。差別只有姓名查詢晚一點（姓名不會變），以及 B 的回覆可能比 A 先到，都無害。
  - 如果做了上面 `findByPageIds` 那一項的快取備案，請假人姓名會走快取，鎖內只剩 LINE reply 約 0.2 秒，這一項就不值得做了。那一項的首選做法（反向 relation 查詢）不碰鎖內的查詢，做完後這一項的效益不變。
  - 另有一個可以單獨做的小改善：操作對象本人在請假名單裡時（請假成功、「已請假，無需重複操作」，以及已請假的季租成員自己 `+N`），他的 People 頁會 GET 兩次，一次在鎖外的 `resolveTarget`（`target-resolver.ts:38`），一次在鎖內的 `buildEventStatusMessage`（`event-status-message.ts:30`）。不是 bug，姓名相同，只是鎖內多一次約 0.3 秒的 GET；請假成功時本人排在 `newAbsentees` 最後（`leave-handler.ts:129`），前面有人時還要多等一次 400ms sleep。如果要處理：可以讓 `buildEventStatusMessage` 多收一個「已知 pageId → 姓名」參數（傳 `resolved.personPageId` → `resolved.displayName`），已知的就跳過 GET，但輸出順序要維持 `absenteePageIds` 的順序。pageId 出現在請假名單就一定有 People 頁，所以這時 `displayName` 一定是 People 的 `Name`，不會拿到 LINE 名稱。若做了上面的鎖外組訊息，或 `findByPageIds` 那一項的快取備案，這個重複的影響會變小或消失。

---

## Log 可觀測性（2026-09-28 評估，剩餘項目）

> 2026-09-28 評估出的 log 缺口已大多補上（Notion 錯誤 log、callId 配對、`/logs` 狀態判斷、info 分類摘要、mutex 摘要、報名／請假決策摘要、crash handler 等，細節見 `docs/logging.md`、`docs/registration.md`、ADR 0002／0005）。以下是還沒做的尾巴，都**不影響使用者**、不是急件。路徑除非另外寫明，都相對於 `src/`。

- [ ] **USERS `groups` 殘留的測試群組 ID，讓 display-name 排程每週都顯示「完成（有降級）」。** 每週排程對殘留群組查 profile 會失敗，`services/line/profile-service.ts:32` 記 `Could not get user profile`（降級訊息）；該使用者所有群組都查不到時，再加 `schedulers/display-name-update.ts:55` 的 `Could not resolve profile for user in any known group` warn。Notion API 錯誤、LINE 送出失敗，以及非降級的 `logger.error`（例如 `display-name-update.ts:68`）仍會顯示「失敗」（`routes/logs.ts` `groupStatus()` 規則 1、2 先判），會被降級蓋掉的只有第 55 行的 warn。

  這不是程式 bug，是 Notion 資料問題，只影響 `/logs` 呈現。如果要處理：
  - 比較好的做法是到 Notion USERS 手動清掉殘留的群組 ID，不是降低 log 等級。
  - **清掉不保證事件變回綠色**：使用者退出的群組查 profile 也會 404（`display-name-update.ts:7-9` 註解），只要那個群組排在清單前面就會再記一次；如果 bot 還在那個測試群組，使用者在裡面發言時 `trackUser`（`services/user-management.ts:129-131`）會把群組 ID 加回去。

- [ ] **graceful shutdown 的 `process.exit` 前沒有 flush log。** `src/index.ts:82-83`（`Graceful shutdown timed out, forcing exit` 後 `process.exit(1)`）和 `:102`（正常關閉後 `process.exit(0)`）都直接結束。正式環境的檔案 stream 是非同步的 SonicBoom，前面還有排隊的行時，最後幾行可能沒寫進 `logs/`（crash handler 那邊實測過：不 flush 直接 exit、前面有排隊時最後一行 0/20 寫進檔案）。

  不是 bug，只是關機前最後幾行 log 可能遺失；docker 的 stdout 還有一份。如果要處理：在這兩處 exit 前呼叫 `utils/logger.ts` 的 `flushLogsSync()`（crash handler `utils/crash-handlers.ts` 已經這樣用）。

- [ ] **`@Dobby next` 在「有活動、沒季資料」時回「找不到 YYYY-MM-DD 的活動」，誤導成行事曆沒建。** `commands/next-event.ts:19-21`；原因是 `services/notion/event-occupancy.ts` 的 `getEventOccupancy` 把「沒有活動」和「沒有季資料」都回 `null`。背景見 ADR 0008 最後一段。

  現在管理員可以從 `/logs` 的 info 行 `Event occupancy unavailable: no event or season for date`（`{date, hasEvent, hasSeason}`）查到真正原因，但使用者收到的回覆還是一樣。如果要處理：要讓呼叫端分得出兩種情況（例如改 `getEventOccupancy` 的回傳形狀），注意它還有週報、報名、請假三個呼叫端，報名／請假事先確認過 season 不是 null，改形狀時要一起調整。

---
