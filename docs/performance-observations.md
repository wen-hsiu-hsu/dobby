# 效能觀察（從真實 `logs/` 分析發現，尚未處理）

從 `TODO.md` 拆出來的待處理效能項目，規則跟 `TODO.md` 一樣：做完且有文件記錄就直接刪除該項，不打勾留紀錄。

> 2026-09-27 分析了本機 `logs/`（2026-09-21～27，62 個事件、402 次 Notion 呼叫），2026-09-28 用 subagent 逐項複查過事實與數字：
>
> - 「真實」指的是打真正的 Notion／LINE API，但服務是在本機 docker 跑的，不是 Pi。網路環境不同，拿這裡的數字跟 Pi 的 `/logs` 比對時要考慮這點。
> - Notion 單次呼叫中位數約 430ms，p90 約 660ms，偶有 3.3～5.5 秒的長尾。
> - 沒有任何 429，也沒有任何 mutex 逾時。
> - log 幾乎都是測試流量：報名只有 2 個 userId，請假人數只有 0～2 人。正式搶報的行為還沒被觀察到。
>
> 慢的原因是呼叫模式（逐筆查、人為延遲），不是 Notion 本身或 rate limit。以下都**不是 bug**：結果正確，只是慢，不是急件，依效益排序。做完任何一項後，都要在 `/logs` 時間軸比對同類指令前後的 Notion 呼叫數與總耗時。

- [ ] **報名／請假的狀態卡，操作對象本人是唯一請假人時，他的 People 頁會 GET 兩次。** 一次在鎖外的 `resolveTarget`（`target-resolver.ts:38` 本人、`:47` mention 代操，`:55` 依姓名代操是 query 但一樣拿到 People 姓名），一次在 `with-fresh-calendar-event.ts` 的 `replyStatus` 呼叫 `buildEventStatusReply`（`event-status-message.ts:33`）→ `peopleRepo.findAbsenteesOfEvent`，只有 1 位請假人時是直接 GET 那一頁。會發生在請假成功、「已請假，無需重複操作」，以及已請假的季租成員報名 `+N` 這些情況。

    不是 bug，兩次拿到的姓名相同。2026-10-04 起組狀態卡已經移到鎖外，所以這次多出的 GET（約 0.3 秒）不會拉長佔鎖時間，只會讓這個使用者晚約 0.3 秒收到回覆。2 人以上請假時是一次反向 query，本人在不在名單裡成本都一樣，沒有重複。0 人時不查。

    如果要處理：可以讓 `EventStatusParams` 多帶一個「已知 pageId → 姓名」（handler 傳 `resolved.personPageId` → `resolved.displayName`），`buildEventStatusReply` 遇到已知的就跳過查詢。這樣做是安全的：pageId 出現在請假名單就一定有 People 頁，這時 `resolveTarget` 給的 `displayName` 一定是 People 的 `Name`，不會是 LINE 名稱（沒有 People 頁時 `personPageId` 是空字串，不會跟請假名單對上）。效益只有單一使用者少等 0.3 秒，優先度低。

- [ ] **一次 Notion 寫入卡 43 秒，同一天的報名／請假全部連鎖逾時；另外發現進鎖順序不等於送出順序。**（2026-10-04 測試環境實測，本機 `logs/app.2026-10-04.1.log`）

    經過：同一人在群組快速連送兩輪 `+1`、`-1`、`假`、`銷假`，共 8 則，全部收到逾時訊息「處理時間較長，這次操作可能已經完成，請勿重複操作」（`with-fresh-calendar-event.ts:16`）。
    - 起因是第一則 `+1`（reqId `a7d55c`，17:46:22）寫零打名單的 PATCH 花了 **43.2 秒**。這段時間沒有 429，也沒有重試，同時段其他 Notion 呼叫都在 0.4～0.5 秒。完全相同的 payload 在同一頁寫過十幾次都約 0.5 秒，所以不是「零打」多選欄位新增選項造成的，是 Notion 端偶發的慢回應。本機 log 共 1,378 次 Notion 呼叫：中位數 0.39 秒，p99 2.4 秒，超過 10 秒的只有 2 次，這次是最大值。
    - 其餘 7 則都鎖在同一個 key（活動日期 `2026-10-10`），排在它後面，等滿 10 秒（`mutex.ts:9` 的 `TIMEOUT_MS`）就收到逾時訊息。第二輪（17:47:01～04）進來時第一輪還有 3 個任務在排隊，所以也各等了 11～13 秒（`waitMs` 11001～13443）。第二輪如果沒有這些積壓，4 個任務每個佔鎖 1.4～2.3 秒，不會逾時。
    - 背景寫入照 FIFO 全部完成，兩輪都是一加一減，最後狀態跟操作前一樣，資料正確。背景完成後送出的回覆全部 `Reply failed`（400），這是預期的，replyToken 已經被逾時訊息用掉了（[ADR 0002](adr/0002-mutex-timeout-does-not-cancel-task.md)）。

    **不是 bug**：mutex 照設計守住了資料正確性，逾時訊息也正確地叫使用者不要重試。觸發條件是 Notion 的罕見長尾，不是急件。

    **另一個觀察：進鎖順序是「誰先查完」，不是「誰先送出」。** 第二輪送出順序是 `+1 → -1 → 假 → 銷假`，進鎖順序卻是 `+1 → 假 → -1 → 銷假`（看 `queuedAhead` 4、6、5、7）。原因是進鎖前要先並行查對象和季資料（`registration-handler.ts:55`、`leave-handler.ts:55` 的 `Promise.all`），這段花了 0.8～2.2 秒不等，`-1` 比 `假` 晚查完。
    - 這次的組合最後結果相同，所以沒事。
    - **會出錯的情境**：同一人在 1～2 秒內送出彼此衝突的指令，而且順序被對調，最終狀態會跟他的意圖相反。例如送 `假` 再送 `銷假`，若 `銷假` 先進鎖，會回「未請假」（no-op），接著 `假` 寫入，最後變成「請假中」；`+1` 再 `-1` 對調則最後變成「已報名」。兩則回覆都會照實寫出結果，使用者看得出來，但不一定會注意。
    - LINE 本身也不保證 webhook 送達順序，所以就算進鎖順序照收到的順序，也不是完全保證。

    **已處理（2026-10-04）：排隊中就逾時的任務改成取消不執行。** `withFreshCalendarEvent` 傳 `withMutex(..., { cancelIfNotStarted: true })`，逾時當下還沒輪到的任務永遠不會執行，回覆「目前處理較慢，這次操作沒有執行，請稍後再送一次」（重送安全）；只有逾時當下已經開始的任務才回「可能已完成」。套到這次事件（依 log 的 `waitMs`／`heldMs` 重建時間線）：第一輪排隊的 3 則會在卡住的寫入結束、輪到它們時被跳過，收到確定的「沒有執行」；第二輪不用再等它們的寫入（各 1.4～2.3 秒），4 則都能在逾時前開始，其中 3 則會收到真正的狀態卡（最後一則只差約 0.2 秒），1 則跑完時已超過逾時點，仍收到「可能已完成」。卡住的那則 `+1` 結果也不確定。機制與保證見 [ADR 0002](adr/0002-mutex-timeout-does-not-cancel-task.md)「例外：還沒開始的任務可以取消」。**同一天又撤掉了**：取消會讓最早排隊的人最先被跳過，破壞先送先報（見 [ADR 0018](adr/0018-entry-gate-orders-lock-entry.md)）。現在這種事件又會回到「排隊中的人都收到可能已完成」。卡住的那一次寫入本身還是擋不住，下面是剩下的方向。

    如果還要處理，各方向都有代價：
    - **縮短佔鎖時間**：2026-10-04 已把請假人姓名查詢和 LINE 回覆移到鎖外（`with-fresh-calendar-event.ts` 的 `replyStatus`），每次佔鎖少約 0.5～0.7 秒。能減少連鎖逾時波及的範圍，但擋不住第一個卡住的寫入。另外，背景完成後的那次 `Reply failed` 也不會再出現了：逾時後不會走到鎖外組卡片、回覆那步。
    - **拉長 mutex 逾時**：replyToken 約 1 分鐘內有效（`docs/architecture.md`「Fire-and-Forget Webhook 處理」），這次 8 則都在送出後 49 秒內完成，逾時改成約 50 秒的話，大家都會收到真正的結果。陷阱：使用者在群組裡可能乾等幾十秒沒有任何回應（LINE 的「輸入中」動畫只支援一對一聊天），比較容易重打；`+N` 不是冪等的，重打會重複報名，比現在的「請勿重複操作」更糟。要改的話，`TIMEOUT_MS` 是所有 key 共用的，`trackUser` 的鎖也會跟著變長。
    - **不要幫 Notion 請求加逾時中斷（AbortController）**：被中斷的 PATCH 可能稍後仍在 Notion 端生效。這時排在後面的任務已經讀完、寫完，晚到的舊 PATCH 會把它蓋掉，造成真正的資料錯誤。只對 GET 加逾時是安全的，但這次卡住的是 PATCH，幫不上忙。
    - **進鎖順序**：2026-10-04 已用號碼牌閘門處理，同時撤掉報名／請假的取消（[ADR 0018](adr/0018-entry-gate-orders-lock-entry.md)），進鎖前查詢的快取見下一項。
    - 觀察方式：`/logs` 搜尋 `Mutex task finished` 的 `callerTimedOut: true`（2026-10-04 短暫開過取消，那段期間的 `cancelled: true` 是排隊中被跳過、沒有執行的），以及 `Notion API response` 的 `durationMs` 超過 10000 的呼叫；比對同一個 key 的 `queuedAhead` 可以看出實際進鎖順序。

- [ ] **報名／請假進鎖前的 Notion 查詢可以改用 in-memory 快取，縮短等待，也縮短號碼牌閘門的等待。**（2026-10-04 討論）

    現況：每則報名／請假進鎖前要串行打兩段 Notion，合計約 0.8～2.2 秒：
    - 先在 `src/handlers/message-handler.ts:77` 查 `usersRepo.findByUserId`（USERS）。
    - 再到 `registration-handler.ts:55`／`leave-handler.ts:55` 並行查兩樣東西：
        - `resolveTarget`：`target-resolver.ts:38`／`:47` 的 `peopleRepo.findByPageIds`、`:55` 的 `peopleRepo.findByName`；mention 代操時多一次 `usersRepo.findByUserId`。
        - `seasonRepo.findByName`（`season-repository.ts:46`）。

    不是 bug。效益有兩個：使用者少等約 1 秒；而這段時間長短不一，以前正是進鎖順序對調的根源；2026-10-04 起由號碼牌閘門保證順序（[ADR 0018](adr/0018-entry-gate-orders-lock-entry.md)），慢的查詢改成讓排在後面的人在閘門多等。快取命中時這段縮到毫秒級，閘門就很少需要真的等前一號。快取保證不了順序，**不能取代閘門**；它只是讓閘門的等待變短。

    `docs/rejected-proposals.md` 否決的是 SQLite，當時的結論是「讀取快取用 in-memory Map 就夠了」，沒有否決 in-memory 快取。2026-10-04 使用者確認季租名單和管理員身分幾乎不會改，所以失效策略可以簡單（例如 TTL）。

    如果要處理，有這些陷阱：
    - **季資料的快取會直接影響名額。** 現況已經是「季資料在進鎖前讀、鎖內不重讀」：鎖內的 `getEventOccupancy` 拿到 handler 傳進來的 `activeSeason` 就不會重讀（`event-occupancy.ts:27`），快取只是把這份資料的年齡從幾秒拉長到 TTL。所以 `members.length`、季預設 `courts` 都會用快取值算 `calculateTotalSlots`，`guestFee` 也是。季資料改了之後，TTL 內名額可能算錯，甚至超賣。要快取的話，只能二選一，並寫清楚選了哪個：季資料的 TTL 設短；或改成在鎖內重讀季資料，代價是多一次查詢、佔鎖變長。
    - **USERS 查無此人（`null`）不能快取。** 全新使用者的第一則訊息之後，`trackUser` 會建頁；快取 null 的話，之後的指令都會回「找不到您的帳號」。ADR 0009 也規定只信任非 null 的快照。
    - **USERS 的 `customName` 每週會變。** 每週一的 `display-name-update`（`schedulers/display-name-update.ts`）會更新它。沒有 People 頁的人報名時，零打名稱用的是 `customName`（`target-resolver.ts:40`、`:49` 的 `person?.name ?? user.customName`）。快取到舊名的話，`+1` 會寫進舊名，之後 `-1` 依名稱比對會找不到。TTL 要短，或在排程更新後清掉快取。
    - **`isAdmin` 也來自 USERS**：管理員身分被拿掉之後，TTL 內仍然有管理員權限；被新增時，TTL 內還沒有權限（只是不方便，不會出事）。
    - **`trackUser` 鎖內的重讀必須繞過快取。** `user-management.ts:94` 的 `findByPageId` 和 `:95` 的 `findByUserId(userId, 'track-user')` 是 ADR 0017 規定的鎖內重讀，它會用讀到的 `groups`／`multiChats`／`message_counts` 算出新值寫回（`message_counts` 是絕對值）。如果快取直接做在 `usersRepo.findByUserId` 裡，這條路徑也會吃到舊值，蓋掉別人的寫入。只有 `reason` 是 `'actor'`／`'mention-target'` 的呼叫可以走快取；快取記錄裡的 `groups`／`message_counts` 也不能拿來算任何寫入。ADR 0009 也提過同類風險。
    - 快取層放在 repository 裡面，不要讓 handler 繞過 repository 直接讀快取（`CLAUDE.md`：Notion 存取一律走 repository）。
