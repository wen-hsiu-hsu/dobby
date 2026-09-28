# withPurpose 疊加在 reqId context 之上，Notion API log 依 level 拆成兩行

`/logs` 頁面新增流程表模式，需要幫每次 Notion API 呼叫標上「打的目的」（例：查詢請假成員姓名），讓一組 `reqId` 底下的呼叫鏈讀起來像一段敘事，而不是一串 method+path。

**為什麼用 `AsyncLocalStorage` context（`withPurpose`）而不是幫 `notionGet`/`notionPost`/`notionPatch` 多加一個參數**：改簽名要動遍 `*-repository.ts` 全部呼叫點（20+ 處），而且會打壞既有測試裡 `expect(notionPostMock).toHaveBeenCalledWith(path, body)` 這類精確斷言。`withPurpose` 改成在 repository 函式**內部**包一層，函式簽名、呼叫端、既有測試的呼叫參數斷言完全不用動——只有 `notion-fetch.ts` 的 `request()` 從 context 讀 purpose 這一處要改。

**為什麼 `withPurpose` 是疊加（spread 現有 store）而不是取代**：`request-context.ts` 原本只有 `runWithContext` 建立的 `reqId`/`quoteToken`，`withPurpose` 如果用 `storage.run({ purpose }, fn)` 直接建新 store，會把外層已經設定的 `reqId` 蓋掉——一個 repository 函式跑在某個 LINE event 處理中途時，它的所有 log 會突然失去 reqId，跟同一個事件的其他 log 對不起來，流程表也就分不了組。`withPurpose` 因此讀出 `storage.getStore()` 目前的值、只覆蓋 `purpose` 欄位、其餘欄位原樣帶過去。這也是為什麼 `withPurpose` 在完全沒有 `runWithContext` 的情況下（例如排程任務直接呼叫 repository 函式）一樣能正常運作，只是 `reqId` 是 `undefined`。

**為什麼 repository 函式只在「進入點」包一層，內部呼叫的 helper（`pageToEvent`、`getFullRelation` 等）不重複包**：一個 repository 匯出函式即使內部因為分頁或迴圈打了好幾次 HTTP call，語意上仍是同一件事（例如 `findByPageIds` 迴圈查多個人，是同一個「查詢成員資料」動作，不是好幾個不同目的）。讓內層呼叫自然繼承外層已經設定的 purpose，粒度才會對齊使用者真正想看到的「這一步在幹嘛」，而不是每個原始 HTTP call 各自一個標籤。

**為什麼 Notion API log 拆成 info + debug 兩行，而不是維持一行、只是把 level 從 debug 改 info**：原本一行 `logger.debug({ method, path, db, body, result }, ...)` 含完整 request/response payload，如果整行升到 info，會讓 Notion 回傳的完整 raw page object（含姓名、LINE user_id 等 PII）在正式環境預設就持續寫進 `/logs` 可查到的檔案，違背 `LOG_LEVEL` 這個功能原本「預設 info、要診斷才臨時開 debug」的設計初衷（見 `docs/development.md` 裡 `LOG_LEVEL` 那條的說明）。拆成兩行——info 只帶 method/path/db/purpose，debug 才帶 body/result——讓流程表在**不開 debug** 的情況下也能顯示每一步「打了什麼、為了什麼」，只是看不到完整內容；要看完整內容才需要臨時切到 debug，PII 曝露面沒有因為這個新功能而擴大。

新增任何會被流程表用到的 log 呼叫時，記得這個分層：摘要級資訊（能安全常駐 info 的）跟載荷級資訊（含使用者資料、只該在主動診斷時短暫出現的）要分開兩行記，不要圖方便合併成一行、也不要把摘要級資訊也降去 debug——那樣流程表在預設 level 下就會變成一片空白。

這不是只有 Notion API 這一處：`event-router.ts` 的 `'Processing event'` 一開始（升到 info 時）沒注意到 `event.source`（LINE userId/groupId）跟 `event.message`（使用者原始訊息）也是同一類 PII，之後才拆成 info 摘要（`type`/`sourceType`）+ debug 明細（`'Processing event detail'`）補上這個分層。之後新增 log 呼叫，先問自己「這行會不會被升到 info 常駐」，會的話要先檢查裡面有沒有欄位屬於這一類，不要等出包才拆。

## 補充（2026-09-20）：同一套分層延伸套用到 LINE API 呼叫

上面記錄的原則一開始只套用在 Notion API 呼叫，`push-service.ts`/`reply-service.ts`/`profile-service.ts` 當時沒跟進——訊息全文、groupId/userId 直接記在 info，`profile-service.ts` 的 `getProfile()` 成功時甚至完全沒有 log。這次把同一套「摘要級留 info、載荷級/身分識別資訊留 debug」的原則延伸套用過去，不是新的架構決策，記錄三個延伸出來的細節：

**LINE push/reply/profile 都採用同一套分層**：`method`/`path`/`sendId`/`messageCount` 這些不含使用者資料的欄位留在 info；`to`/`replyToken`/`messages`（訊息全文）跟 `userId`/`groupId` 這些身分識別資訊搬到 debug 專屬的 payload 行（例如 `'LINE push payload'`/`'LINE reply payload'`/`'LINE get profile detail'`）。跟 Notion body 一樣，預設 `LOG_LEVEL=info` 下 `/logs` 看不到訊息原文，是刻意的 UX 犧牲換取預設環境不外洩內容。

**push/reply 的配對機制從內容比對改成專屬 `sendId`**：`log-grouping.ts` 原本用 `pushSignature()`（對 `to`/`messages` 做 `JSON.stringify` 比對）配對同一次呼叫的「準備送出」跟「已送出/失敗」兩行，因為 push 呼叫來自背景排程、沒有 `reqId` 可用。但內容搬到 debug 後，info 層級的行不再帶 `to`/`messages`，content-based 配對在預設 `LOG_LEVEL=info` 下會永遠算出同一個空簽名，導致兩個不相關的 push 被誤配對。解法是 `pushMessage()`/`replyMessage()` 呼叫時各自產生一個短隨機 `sendId`（`randomBytes(3).toString('hex')`，手法跟 `request-context.ts` 產生 `reqId` 一樣），寫進該次呼叫的所有 log 行（info 的 start/sent/failure + debug 的 payload），`log-grouping.ts` 用 `sendId` 精確配對取代內容比對。這同時修掉一個潛在 bug：兩個併發、內容完全相同的 push 呼叫，舊版用 `findIndex` 找第一個符合簽名的，理論上可能配對錯誤；`sendId` 保證每次呼叫獨一無二，不受內容是否相同影響。

**error/warn log 不受 `LOG_LEVEL` 篩選，訊息內容不能直接放在 error/warn 那一行**：pino 的 level 排序是 debug < info < warn < error，設定 `LOG_LEVEL=info` 只是把 debug 以下的行濾掉，warn/error 不管設定多少一定會輸出。所以失敗時「補訊息內容方便除錯」不能直接加在 `logger.warn(...)`/`logger.error(...)` 那一行的物件裡——那樣訊息全文會不管 `LOG_LEVEL` 設定、在正式環境預設就外洩，違背這整套分層的目的。正確做法是另開一行**debug** 層級的「failure payload」log（例如 `'Reply failed payload'`/`'Push message failed payload'`），跟對應的 warn/error 行用同一個 `sendId` 綁在一起；warn/error 行本身只留 `err`/`method`/`path`/`sendId`，永遠可見但不含訊息內容，要看失敗當下實際送的是什麼還是得開 `LOG_LEVEL=debug`。這是「新增任何會被流程表用到的 log 呼叫時，先檢查分層」這條既有提醒的一個新案例，之後遇到 warn/error 想補內容時直接抄這個模式，不要重新踩一次。

## 補充（2026-09-28）：`request()` 的每一種失敗都要記 `Notion API error`

`routes/log-grouping.ts` 只靠 `Notion API error` 這個訊息字串把 Notion 那一步標成失敗，`routes/logs.ts` 的 `groupStatus()` 規則 1 再靠它把事件判成「失敗」。原本只有「HTTP 非 2xx 且 body 是 JSON」這一種情況會記：`fetch` 本身丟錯（DNS 失敗、連線中斷、undici 預設逾時）直接往外丟，`assertOk` 先 `res.json()`，碰到 proxy 回 HTML 的 502/503 就丟 `SyntaxError`，錯誤 log 跟 HTTP status 一起消失。結果那一步在時間軸上只剩「尚無回應記錄」，fire-and-forget 路徑（`trackUser` 等）的事件被判成「完成（有降級）」而不是「失敗」。

現在 `notion-fetch.ts` 的 `request()` 在 `fetch` 丟錯、非 2xx（先 `res.text()` 再試 `JSON.parse`，失敗就記截斷後的原文）、2xx 的 body 讀不出來這三處都記 `Notion API error`。修改時注意：

- **訊息字串不能改**，也不能為了區分網路錯誤另取一個名字，否則 `log-grouping.ts` 認不得，這一步又會變回「尚無回應記錄」。網路錯誤沒有 `status`，`logs.ts` 已經只在 `status` 是數字時才顯示 HTTP 碼。
- **網路錯誤要原樣丟出，不要包成新的 `Error`**。原本的 `TypeError: fetch failed` 帶著 `cause`（例如 `getaddrinfo ENOTFOUND api.notion.com`），呼叫端 `logger.error({ err })` 時 pino 會把 cause 串進訊息；包一層新 Error 又沒設 `cause` 的話，這個最有用的原因就沒了。
- 呼叫端（`Message handler error`、`User tracking failed (non-blocking)` 等）照樣會記自己的錯誤，這一行是額外的，不是取代。

## 補充（2026-09-28）：Notion 呼叫也改用專屬 `callId` 配對

Notion 呼叫原本在 `log-grouping.ts` 用 method+path 配對，同一個 key 還沒回應時又出現 request 就當成 429 重試。同一個 DB 的 query 路徑都是 `POST /databases/{id}/query`，不管查詢條件，所以同一個 reqId 底下兩個重疊的查詢（例如管理員 `+1 @X` 時，前一則訊息的 `trackUser` 還握著鎖，第二則的 `trackUser` 跟 `resolveTarget` 同時查 USERS）會被併成一列「重試 1 次」，第二個的 payload 蓋掉第一個，還多出一筆配不到的 response。

做法跟上面 LINE 的 `sendId` 一樣：`notion-fetch.ts` 的 `request()` 每次呼叫產生一個 `callId`（`randomBytes(3).toString('hex')`），這次呼叫的所有 log 行都帶上，`log-grouping.ts` 優先用它配對。跟 `sendId` 不同的地方有兩個：

- **`callId` 只能在最外層產生一次，透過參數傳給重試**。429 重試是遞迴呼叫內部的 `send()`，如果改成在 `send()` 裡產生，每次重試拿到新的 callId，真正的重試就被拆成好幾個獨立呼叫，「重試 N 次」旗標反而消失。`request()`／`send()` 分成兩個函式就是為了讓這件事在結構上不會被改錯，不要把它們「簡化」回一個帶 `attempt` 預設參數的函式。
- **舊 log 檔沒有 `callId`，要保留 method+path 的 fallback**。兩種 key 加不同前綴（`call:`／`path:`），同一個檔案裡新舊格式混在一起也不會撞。

`callId` 是隨機值、不含使用者資料，留在 info 行沒有 PII 問題。

## 補充（2026-09-29）：`/logs` 時間軸的回覆、終點與排序

`sendId` 讓每次回覆各自配對成一列之後，`buildFlowGroups()`（`routes/log-grouping.ts`）再把一個 reqId 的列分成起點／步驟／雜項／終點。以下幾點看起來可以「簡化」，但簡化回去會壞：

- **一個事件可能有兩次 LINE 回覆，`FlowGroup.end` 只放最後一次，前面的留在 `misc`**。報名／請假 mutex 逾時時，`with-fresh-calendar-event.ts` 先成功回覆逾時訊息，背景任務跑完再用同一個 replyToken 回覆、被 LINE 拒絕（[ADR 0002](0002-mutex-timeout-does-not-cancel-task.md)）。原本 `end = row` 讓後一次覆蓋前一次，使用者實際收到的逾時訊息從時間軸消失、卡片預覽只剩「回覆失敗」。沒有改成 `end` 陣列，是因為讀 `end` 的地方大多只需要「有沒有回覆」（規則 3 的「指令沒回覆 → 警告」）或「終點是哪一步」，陣列會讓每個呼叫端都多一層處理；代價是「所有回覆」要看 `misc` 裡的 line-reply 加上 `end`——`routes/logs.ts` 的 `replyRows()`／`hasReplyFailure()`。狀態、flag、卡片預覽都走它，不要改回只看 `group.end`：狀態規則 1 是「任何一次回覆失敗」（先失敗後成功也算失敗），預覽則要顯示送出成功的那則（使用者實際收到的），不是最後一則。
- **「終點」照實際時間排進時間軸，不固定放最後**（`routes/logs.ts` 的 `buildTimeline()`）。原本在所有步驟之後才 push 終點，fire-and-forget 的 `trackUser` 在回覆之後才完成的 USERS 重查／PATCH 看起來像發生在回覆之前。「終點」只是標示哪一步是回覆，不代表「最後一步」；讀 `group.end` 的其他地方（狀態、預覽、flag、`flattenEntries()`）都不依賴它是最後一步，之後新增讀 `end` 的邏輯也不要做這個假設。
- **同一毫秒的步驟依 log 檔原始順序排，用的是 `groupPairedEntries()` 輸入陣列的位置（`DisplayRow.seq`）**。log 的 `time` 只到毫秒，`Message classified` 跟緊接著的 USERS query 常是同一毫秒；原本靠穩定排序維持 `[...steps, ...misc]` 的串接順序，結果同毫秒一律 Notion 步驟在前。不要改成「雜項在前」，那只是把問題換邊（同毫秒先 request、後記雜項 log 的情況就會反過來）。`seq` 是全域位置而不是 reqId bucket 內的位置，合併後的列取 request／「準備送出」那一行的位置，跟 `representativeTime()` 取同一行。它依賴 `readRecentLogs()` 依 `time` 做**穩定**排序、同毫秒維持檔案內順序——之後改 `readRecentLogs()` 的排序時要保持穩定，否則同毫秒的順序會亂掉。不需要 log 行多帶欄位，舊 log 檔一樣適用。

## 現況（2026-09-28）：正式環境常駐 debug

上面的理由都建立在「正式環境預設 `info`，診斷時才暫時開 `debug`」這個前提上。實際上正式環境（Pi）一直都跑 `LOG_LEVEL=debug`，2026-09-28 決定維持這個做法、把文件改成符合現況，不改回 `info`。取捨是：Notion payload、LINE 訊息全文、userId/groupId 這些 PII 會常駐寫進 `logs/` 與 R2 備份；換到的是出問題時不用重現就能直接從 log 查出原因（見 `docs/overview.md`「日誌」小節）。

**分層不拆掉**：這份 ADR 的 info/debug 分層仍然照做。它讓 `/logs` 在 `info` 下不會一片空白，也讓之後要改回 `info` 時不用重新整理每一行 log。新增 log 時仍然要把摘要級跟載荷級分成兩行。

**已處理（2026-09-28）**：`/logs` 在 `info` 下原本會把所有文字訊息判成「指令」、沒回覆的閒聊標成「警告」（`groupKind()` 只能靠「有沒有 Notion 呼叫」猜，但每則文字訊息都會查 USERS）。現在 `src/handlers/message-handler.ts` 在所有分支之前記一行 info 摘要 `Message classified`（`isCommand`/`parsed`/`commandType`），`groupKind()`／`groupOrigin()` 優先讀它。這行本身就是這份 ADR 分層的一個例子：只帶分類結果，不帶訊息原文和 userId（原文仍在 debug 層的 `handleMessage`／`Processing event detail`）。加這行之前的舊 log 檔仍走原本的猜法，見 `docs/logging.md`「事件種類」。

**之後如果要改回 `info`，要先處理這些**：

- 以下 info／warn／error 行直接帶 userId 或 groupId，違反上面「身分識別資訊留 debug」的原則（warn/error 不受 `LOG_LEVEL` 篩選，任何等級都會寫出），要改成 USERS pageId 或搬到 debug：`display-name-update.ts:48,55,68`、`user-management.ts:24,66,71`、`member-joined-handler.ts:29`、`welcome-message.ts:79`、`weekly-push.ts:46`、`mutex.ts:148` 的逾時 warn（key 為 `user-track-${userId}` 時）（2026-09-28 單行 grep 的結果，行號已在同日 log 可觀測性改動後更新，改之前要再搜一次跨多行的 logger 呼叫）。`registration-handler.ts:125`、`leave-handler.ts:149` 的 `targetDisplayName`（姓名）也在 info，要決定是當例外還是搬走。
