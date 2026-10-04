# 效能觀察（從真實 `logs/` 分析發現，尚未處理）

從 `TODO.md` 拆出來的待處理效能項目，規則跟 `TODO.md` 一樣：做完且有文件記錄就直接刪除該項，不打勾留紀錄。

> 2026-09-27 分析了本機 `logs/`（2026-09-21～27，62 個事件、402 次 Notion 呼叫），2026-09-28 用 subagent 逐項複查過事實與數字：
> - 「真實」指的是打真正的 Notion／LINE API，但服務是在本機 docker 跑的，不是 Pi。網路環境不同，拿這裡的數字跟 Pi 的 `/logs` 比對時要考慮這點。
> - Notion 單次呼叫中位數約 430ms，p90 約 660ms，偶有 3.3～5.5 秒的長尾。
> - 沒有任何 429，也沒有任何 mutex 逾時。
> - log 幾乎都是測試流量：報名只有 2 個 userId，請假人數只有 0～2 人。正式搶報的行為還沒被觀察到。
>
> 慢的原因是呼叫模式（逐筆查、人為延遲），不是 Notion 本身或 rate limit。以下都**不是 bug**：結果正確，只是慢，不是急件，依效益排序。做完任何一項後，都要在 `/logs` 時間軸比對同類指令前後的 Notion 呼叫數與總耗時。

- [ ] **報名／請假的回覆訊息在鎖內組，拉長鎖持有時間。** `buildEventStatusReply` 在請假人數 >0 時會呼叫 `peopleRepo.findByPageIds` 查請假人姓名（`event-status-message.ts:30-32`）。它在 `withFreshCalendarEvent` 的 mutation 裡被呼叫，後面的 `replyMessage` 也在 mutation 裡，所以鎖要等 LINE API 回應後才釋放。共有 5 處：
  - `registration-handler.ts:115-128`（名額不足）、`176-190`（成功）
  - `leave-handler.ts:117-130`（已請假，no-op）、`137-150`（未請假，no-op）、`175-188`（成功）

  實測鎖持有時間：中位數約 1.43 秒（0.85～4.44 秒，n=34）。n=34 是所有進到鎖內的報名／請假請求，包含名額不足和 no-op 分支，所以比成功寫入的次數（`+N`／`-N` 26 次＋請假／銷假 4 次）多。這是 mutex 摘要上線前量的：當時 log 沒有 acquire／release 事件，是用鎖內第一個 calendar query 的開始時間，算到 `LINE reply sent` 推出來的。2026-09-28 起可以直接看 `Mutex task finished` 的 `heldMs`／`waitMs`／`queuedAhead`（見 `docs/registration.md`「從 log 看鎖競爭」），做完這一項後用它比對效果。4.4 秒那筆是 calendar PATCH 長尾，跟組訊息無關。鎖內姓名查詢中位數約 0.28 秒，LINE reply 約 0.2 秒。

  鎖內多出的時間會隨請假人數增加：每位請假人約 0.3 秒 GET，加上筆與筆之間 400ms sleep。1 人約 0.3 秒，2～3 人約 1～1.7 秒，5～6 人約 3.1～3.8 秒。log 是測試流量，請假人數只有 0～2 人。但從 calendar payload 看，7/04～9/19 各週的最終請假人數是 0～6 人（中位數約 2.5），週末前的報名可能遇到較高的數字。

  這項不是 bug，單一使用者的回覆時間也不會變短，只在有人排隊時才有幫助：縮短後面的人的等待，降低 mutex 逾時的機率。`withMutex` 的 10 秒逾時從呼叫時起算、含排隊時間（見 [ADR 0002](adr/0002-mutex-timeout-does-not-cancel-task.md)）。以目前鎖持有中位數 1.43 秒估算，約 7 人同時排隊才會逾時；遇到 Notion 長尾時約 3～4 人。2026-09-28 本機實測（`Mutex task finished` 的 `waitMs`／`heldMs`，見 `docs/registration.md`「從 log 看鎖競爭」）：同一人快速連發 4 則 ±1，其中一次 calendar PATCH 花了 4.2 秒，最後一則排隊 7.7 秒、從呼叫到完成 9.1 秒，離逾時只差約 0.9 秒；另一批連發 7 則被拒絕的 `-1`（持鎖約 0.85～1.5 秒），最長 4.7 秒。這項做完後，可以直接用這些欄位比對效果。逾時的使用者會收到「這次操作可能已經完成，請勿重複操作」，背景寫入照常完成。

  如果要處理：可以讓 mutation 回傳組訊息需要的資料，改到鎖外組訊息並 `replyMessage`。要改 `with-fresh-calendar-event.ts:19` 的 mutation 簽名，它現在是 `(fresh: T) => Promise<void>`。
  - 移到鎖外不會造成資料不一致：訊息內容仍然用 mutation 在鎖內算出的快照（`updatedGuests`、`newAbsentees`、`totalSlots`），跟現在一樣。差別只有姓名查詢晚一點（姓名不會變），以及 B 的回覆可能比 A 先到，都無害。
  - 另一個不用改 mutation 簽名的做法：`請假人` 是雙向 relation，對應 People 的 `📅 行事曆`（2026-10-04 確認）。鎖內查姓名可以改成 query People DB，篩選 `📅 行事曆` contains 活動 pageId，N 次 GET（含 N−1 次 400ms sleep）變成 1 次 query（實測約 0.5 秒）。整季名單已經用同一招改好了，`src/services/notion/reverse-relation-query.ts` 的 `queryAlignedToIds` 已經處理照 ID 重排、丟掉多餘的、逐筆補查漏掉的，可以直接沿用。`weekly-status-message.ts:67` 的週報請假人姓名也還是逐筆 GET，它不在鎖內，只是推播慢幾秒，可以順便換。同一天實測 4 場有請假的活動（1～3 人），反向查詢的集合都跟 `請假人` 相同，順序有 3 場不同，所以要照 `absenteePageIds` 重排。只有 1 位請假人時是 1 次 GET 換 1 次 query，沒有好處，只在 ≥2 人時才省時間。陷阱：請假／銷假成功的路徑是先 PATCH `請假人`（`leave-handler.ts:158`），再用 `newAbsentees` 組訊息（`leave-handler.ts:175-188`）。剛寫完就 query，Notion 的 query 結果可能還沒反映這次寫入（這點沒有實測），所以不能只信 query 結果：`absenteePageIds` 裡有、query 沒回傳的 ID，要逐筆 GET 補上；query 多回傳的 ID（剛銷假的人）要丟掉。報名路徑和兩種 no-op 用的是鎖內讀到的 `freshEvent.absentees`，沒有剛寫入的問題。
  - 另有一個可以單獨做的小改善：操作對象本人在請假名單裡時（請假成功、「已請假，無需重複操作」，以及已請假的季租成員自己 `+N`），他的 People 頁會 GET 兩次，一次在鎖外的 `resolveTarget`（`target-resolver.ts:38`），一次在鎖內的 `buildEventStatusReply`（`event-status-message.ts:32`）。不是 bug，姓名相同，只是鎖內多一次約 0.3 秒的 GET；請假成功時本人排在 `newAbsentees` 最後（`leave-handler.ts:155`），前面有人時還要多等一次 400ms sleep。如果要處理：可以讓 `buildEventStatusReply` 多收一個「已知 pageId → 姓名」參數（傳 `resolved.personPageId` → `resolved.displayName`），已知的就跳過 GET，但輸出順序要維持 `absenteePageIds` 的順序。pageId 出現在請假名單就一定有 People 頁，所以這時 `displayName` 一定是 People 的 `Name`，不會拿到 LINE 名稱。若做了上面的鎖外組訊息，或改用反向查詢，這個重複的影響會變小或消失。

- [ ] **一次 Notion 寫入卡 43 秒，同一天的報名／請假全部連鎖逾時；另外發現進鎖順序不等於送出順序。**（2026-10-04 測試環境實測，本機 `logs/app.2026-10-04.1.log`）

  經過：同一人在群組快速連送兩輪 `+1`、`-1`、`假`、`銷假`，共 8 則，全部收到逾時訊息「處理時間較長，這次操作可能已經完成，請勿重複操作」（`with-fresh-calendar-event.ts:12`）。
  - 起因是第一則 `+1`（reqId `a7d55c`，17:46:22）寫零打名單的 PATCH 花了 **43.2 秒**。這段時間沒有 429，也沒有重試，同時段其他 Notion 呼叫都在 0.4～0.5 秒。完全相同的 payload 在同一頁寫過十幾次都約 0.5 秒，所以不是「零打」多選欄位新增選項造成的，是 Notion 端偶發的慢回應。本機 log 共 1,378 次 Notion 呼叫：中位數 0.39 秒，p99 2.4 秒，超過 10 秒的只有 2 次，這次是最大值。
  - 其餘 7 則都鎖在同一個 key（活動日期 `2026-10-10`），排在它後面，等滿 10 秒（`mutex.ts:9` 的 `TIMEOUT_MS`）就收到逾時訊息。第二輪（17:47:01～04）進來時第一輪還有 3 個任務在排隊，所以也各等了 11～13 秒（`waitMs` 11001～13443）。第二輪如果沒有這些積壓，4 個任務每個佔鎖 1.4～2.3 秒，不會逾時。
  - 背景寫入照 FIFO 全部完成，兩輪都是一加一減，最後狀態跟操作前一樣，資料正確。背景完成後送出的回覆全部 `Reply failed`（400），這是預期的，replyToken 已經被逾時訊息用掉了（[ADR 0002](adr/0002-mutex-timeout-does-not-cancel-task.md)）。

  **不是 bug**：mutex 照設計守住了資料正確性，逾時訊息也正確地叫使用者不要重試。觸發條件是 Notion 的罕見長尾，不是急件。

  **另一個觀察：進鎖順序是「誰先查完」，不是「誰先送出」。** 第二輪送出順序是 `+1 → -1 → 假 → 銷假`，進鎖順序卻是 `+1 → 假 → -1 → 銷假`（看 `queuedAhead` 4、6、5、7）。原因是進鎖前要先並行查對象和季資料（`registration-handler.ts:56`、`leave-handler.ts:56` 的 `Promise.all`），這段花了 0.8～2.2 秒不等，`-1` 比 `假` 晚查完。
  - 這次的組合最後結果相同，所以沒事。
  - **會出錯的情境**：同一人在 1～2 秒內送出彼此衝突的指令，而且順序被對調，最終狀態會跟他的意圖相反。例如送 `假` 再送 `銷假`，若 `銷假` 先進鎖，會回「未請假」（no-op），接著 `假` 寫入，最後變成「請假中」；`+1` 再 `-1` 對調則最後變成「已報名」。兩則回覆都會照實寫出結果，使用者看得出來，但不一定會注意。
  - LINE 本身也不保證 webhook 送達順序，所以就算進鎖順序照收到的順序，也不是完全保證。

  如果要處理，各方向都有代價：
  - **縮短佔鎖時間**：見上一項「報名／請假的回覆訊息在鎖內組」。能減少連鎖逾時波及的範圍，但擋不住第一個卡住的寫入。
  - **拉長 mutex 逾時**：replyToken 約 1 分鐘內有效（`docs/architecture.md`「Fire-and-Forget Webhook 處理」），這次 8 則都在送出後 49 秒內完成，逾時改成約 50 秒的話，大家都會收到真正的結果。陷阱：使用者在群組裡可能乾等幾十秒沒有任何回應（LINE 的「輸入中」動畫只支援一對一聊天），比較容易重打；`+N` 不是冪等的，重打會重複報名，比現在的「請勿重複操作」更糟。要改的話，`TIMEOUT_MS` 是所有 key 共用的，`trackUser` 的鎖也會跟著變長。
  - **不要幫 Notion 請求加逾時中斷（AbortController）**：被中斷的 PATCH 可能稍後仍在 Notion 端生效。這時排在後面的任務已經讀完、寫完，晚到的舊 PATCH 會把它蓋掉，造成真正的資料錯誤。只對 GET 加逾時是安全的，但這次卡住的是 PATCH，幫不上忙。
  - **進鎖順序**：如果要讓同一人的指令照收到的順序執行，可以在進鎖前的查詢之前，就先依收到的順序排隊（例如在 handler 一進來就取得順序，或以 `message-handler` 收到的時間排序）。但不能直接把取鎖提前到查詢之前，因為那會把 0.8～2 秒的查詢搬進鎖內，拉長所有人的佔鎖時間，跟上一項的方向衝突。LINE 事件帶有 `timestamp`，可以考慮用它判斷先後，但送達順序本身不保證。
  - 觀察方式：`/logs` 搜尋 `Mutex task finished` 的 `callerTimedOut: true`，以及 `Notion API response` 的 `durationMs` 超過 10000 的呼叫；比對同一個 key 的 `queuedAhead` 可以看出實際進鎖順序。
