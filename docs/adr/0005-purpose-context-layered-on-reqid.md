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
