# 已評估、不採納的提案

提出重構、效能優化、新機制之前，先用關鍵字 grep 這份，避免重提已經否決過的方案。每一項都寫了不採納的理由，以及什麼條件下可以重新評估；條件成立時才重新討論。

新增項目時照同樣格式：提案內容、評估日期、不採納理由、重新評估的條件。

- **表格驅動指令解析與路由**（`/improve-codebase-architecture` 報告候選 3，Speculative）— 評估後不採納。理由：(1) 各 command handler 簽名不一致（7 種不同形狀，從 `(replyToken, botId)` 到 `(event, delta, botId, isAdmin)`），單一表格 row 形狀塞不下這些差異；(2) 報告自己也承認 deletion test 不明確，拆掉 `command-parser.ts`/`command-router.ts` 可能只是把 switch 搬位置，不會真正集中複雜度；(3) 唯一有具體壞味道支撐的症狀（courtOverride 解析邏輯被拆到兩個 module）已隨 `next?c=N` what-if 預覽功能整個移除而不復存在，不只是修好。若未來新增指令的頻率明顯提高、且 handler 簽名先被拉齊，可重新評估。
- **[1.2] `people-repository.ts`/`season-repository.ts` 查詢分頁處理** — 評估後不採納。目前社團規模（未結清人數、season 數）遠低於 Notion 單頁 100 筆上限，此狀況實務上不會發生，不需為此增加分頁邏輯的複雜度。
- **[2.1] `member-joined-handler.ts` 多人同時加入群組時用 `pushMessage` 補發歡迎訊息** — 評估後不採納，不修正。原因：此專案原則上不使用 `pushMessage`（唯一例外是既有的 `weekly-push.ts` 週報推播，見 `CLAUDE.md` 專案慣例），不為此問題新增 push 用法。第一位以外的成員收不到歡迎訊息維持現況。
- **導入 SQLite 改善 Notion 讀寫速度**（2026-09-27 評估）— 不採納。評估過兩種做法：以 SQLite 為主、背景同步回 Notion；或把 SQLite 當讀取快取。前提是 Notion 必須維持唯一可信來源，因為管理員會直接在 Notion UI 改行事曆的 `零打`、`請假人` 等欄位。不採納的理由：
  1. **快取省不掉報名最慢的那段。** 報名名額必須在鎖內從 Notion 重讀（[ADR 0001](adr/0001-explicit-fresh-calendar-event-wrapper.md)），所以不管哪種快取，報名關鍵路徑上的「鎖內讀一次＋寫一次」（約 1 秒）都省不掉。
  2. **以 SQLite 為主會弄丟管理員的修改、造成超賣。** `calendar-repository.ts:69-83` 的 `updateAbsentees`／`updateGuests` 是整包覆寫，背景寫回時會蓋掉管理員同一時段在 Notion 的手動修改。偵測 Notion 端變更只能靠 polling，在 polling 空窗期間用舊人數算名額會超賣。`withMutex` 也只能鎖 bot 自己的寫入，鎖不住 Notion UI。
  3. **當讀取快取時，in-memory Map 就夠了。** 能快取的資料不到幾百筆，重啟後 1～2 次呼叫就能重新載入。SQLite 在 arm64 Pi 上需要 native build，還要多一個 Docker volume、schema migration，也會增加 SD 卡寫入，沒有對應的好處。

  慢的真正原因是呼叫模式，見 [performance-observations.md](performance-observations.md)。若未來 log 出現 Notion 429（rate limit 真的成為瓶頸），或決定不再用 Notion 當後台，可以重新評估。
- **`findAllUnpaid()` 改掉 `結清` formula 篩選來加速 `owe`**（2026-09-21 發現、2026-09-28 複查）— 不採納。`src/services/notion/people-repository.ts:51-58` 用 `{ property: '結清', formula: { checkbox: { equals: false } } }` 篩選。`結清` 的依賴鏈有好幾層：`結清` 是 formula，依賴 `未繳季租`（formula），`未繳季租` 又依賴 `報名季度`（relation）和 `已繳季租`（rollup，經 `付款` relation）。不採納的理由：
  1. **沒有證據證明 formula 篩選較慢。** log 裡這個查詢只有 3 個樣本（715／3305／3540ms），全部是 09-21 同一人 40 秒內連打。3.3～3.5 秒那兩筆，剛好落在 Notion 整體變慢的 4 分鐘內（06:59～07:03 UTC）。同一段時間沒篩 formula 的查詢也出現 3.3～5.5 秒。唯一不在這段時間的 715ms，跟一般查詢的 p90 差不多（所有 query 的 p90 約 715～780ms）。回傳 3 筆、約 10KB，也不是 payload 太大。
  2. **「formula 篩選沒辦法用索引」找不到官方來源。** Notion Help Center 只說 formula／rollup 篩選在 UI「may take a bit longer to load」，沒有提到索引。API 文件完全沒談效能。
  3. **`owe` 慢不全是這個查詢造成的。** 09-21 的 3 次 `owe` 耗時 1.3～8.6 秒，其中 8.6 秒那次有 4.9 秒是 `message-handler.ts` 的 `findByUserId`（沒篩 formula）遇到長尾。
  4. **使用率低，替代方案都有代價。** 09-21～27 所有指令共 56 次，`owe` 只有 3 次。替代方案如下：
     - 改用一般欄位，靠 Notion automation 同步：automation 要付費方案，而且 formula 和 rollup 不能當觸發條件。
     - 由 bot 排程同步，或做短 TTL 快取：管理員登記付款後，要過一段時間名單才會更新。
     - 拿掉篩選、改在程式端過濾：回傳的每一列一樣要算 `結清`，而且列數更多，不會比較快。

  若 log 累積 10 次以上 `owe`，且在 Notion 沒有整體變慢的時段仍然穩定超過 2 秒，可以重新評估。

- **`@Dobby next` 在「有活動、沒季資料」時回「找不到 YYYY-MM-DD 的活動」的誤導訊息**（2026-09-29 決定）— 不修。背景見 [ADR 0008](adr/0008-season-derived-from-event-date.md) 最後一段：`getEventOccupancy` 把「沒有活動」和「沒有季資料」都回 `null`，`commands/next-event.ts` 分不出來。不修的理由：新一季的建立流程一定是先建季資料、再建活動，所以「有活動、沒季資料」只會在管理員建資料建到一半時出現；而會在這時候下 `@Dobby next` 的也只有管理員本人，他自己知道資料還沒建完。需要查原因時，`/logs` 的 info 行 `Event occupancy unavailable: no event or season for date`（`{date, hasEvent, hasSeason}`）已經看得出來。若之後建資料的流程改成非管理員也會碰到這個狀態，再重新評估。

- **部署後逐項驗證 log 改動的手動測試項、重測本機沒送到的情境**（2026-09-29 決定）— 不加進「手動測試追蹤」。2026-09-28 的 log 可觀測性改動已在本機用真實 LINE 訊息驗證過 30 個事件（原始 log 與 `/logs` 呈現都正確）；閒聊、貼圖、連續兩次 `假`、非管理員代報、從 LINE 選單點選的真正 mention、mutex 逾時這幾種當時沒送到本機伺服器或沒觸發，決定不再補測。部署到 Pi 後確認 `stop_grace_period` 生效（`docker inspect` 的 `StopTimeout` 為 15）也不列成追蹤項目。
- **`notion-fetch.test.ts` 兩個 429 重試測試各跑 1 秒、3 秒**（2026-09-28 發現）— 不處理。原因是測試用 `Retry-After: '0'`，程式把 0 視為無效、退回預設 1 秒等待；只影響測試速度，不影響正確性。新寫的 429 測試已改用 fake timers。
- **用 `webhookEventId` 對 webhook 事件去重，避免同一事件被處理兩次**（2026-09-29 發現、2026-10-04 決定）— 不做。現況：`src/handlers/event-router.ts` 會把 `webhookEventId`、`isRedelivery` 記在 `Processing event`，但沒有去重，同一事件送達幾次就處理幾次。重複處理時，`+N`／`-N` 會再寫入一次；「假 → 銷假 → 晚到的重送『假』」會重新登記請假；群組文字訊息的發言數會多算 1。第二次回覆會因 replyToken 已用過而 `Reply failed`，所以當下的回覆看不出重複寫入。不做的理由：
  1. **主要的重複來源都關著。** LINE 的 Webhook redelivery 預設關閉，2026-09-29 在 LINE Developers Console 確認本專案也是關閉的，而且**決定不會去改這個設定**。重送關閉時，Pi 回應超過 2 秒（`request_timeout`）或回非 2xx，LINE 都不會重送。
  2. **剩下的來源沒有證據。** LINE 文件寫了「The same webhook event may be sent to your bot server more than once by different reasons such as network routing problem」，但這句放在「開啟重送前要注意」的段落裡，沒講清楚重送關閉時會不會發生（[Redeliver a webhook that failed to be received](https://developers.line.biz/en/docs/messaging-api/receiving-messages/#webhook-redelivery)）。到目前為止也沒觀察到重複的 `webhookEventId`。

  如果真的發生，`/logs` 看得出來：同一個 `webhookEventId` 會出現兩次，第二次的 `Reply failed` 會讓事件卡片變紅。

  重新評估的條件：Console 的 Webhook redelivery 被打開；或在 `/logs`、Console 的 Error statistics 實際看到同一個 `webhookEventId` 被處理兩次。要做的話，先看 git 歷史中被刪掉的 `TODO.md` 項目「同一個 webhook 事件送達兩次時會被處理兩次」，裡面整理了去重放的位置、保留時間、測試寫法和幾個陷阱（例如沒有 `webhookEventId` 的事件不能去重、檢查和記下之間不能有 `await`、不能用 `isRedelivery` 判斷要不要略過）。
