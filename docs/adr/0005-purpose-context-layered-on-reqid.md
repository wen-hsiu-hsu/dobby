# withPurpose 疊加在 reqId context 之上，Notion API log 依 level 拆成兩行

`/logs` 頁面新增流程表模式，需要幫每次 Notion API 呼叫標上「打的目的」（例：查詢請假成員姓名），讓一組 `reqId` 底下的呼叫鏈讀起來像一段敘事，而不是一串 method+path。

**為什麼用 `AsyncLocalStorage` context（`withPurpose`）而不是幫 `notionGet`/`notionPost`/`notionPatch` 多加一個參數**：改簽名要動遍 `*-repository.ts` 全部呼叫點（20+ 處），而且會打壞既有測試裡 `expect(notionPostMock).toHaveBeenCalledWith(path, body)` 這類精確斷言。`withPurpose` 改成在 repository 函式**內部**包一層，函式簽名、呼叫端、既有測試的呼叫參數斷言完全不用動——只有 `notion-fetch.ts` 的 `request()` 從 context 讀 purpose 這一處要改。

**為什麼 `withPurpose` 是疊加（spread 現有 store）而不是取代**：`request-context.ts` 原本只有 `runWithContext` 建立的 `reqId`/`quoteToken`，`withPurpose` 如果用 `storage.run({ purpose }, fn)` 直接建新 store，會把外層已經設定的 `reqId` 蓋掉——一個 repository 函式跑在某個 LINE event 處理中途時，它的所有 log 會突然失去 reqId，跟同一個事件的其他 log 對不起來，流程表也就分不了組。`withPurpose` 因此讀出 `storage.getStore()` 目前的值、只覆蓋 `purpose` 欄位、其餘欄位原樣帶過去。這也是為什麼 `withPurpose` 在完全沒有 `runWithContext` 的情況下（例如排程任務直接呼叫 repository 函式）一樣能正常運作，只是 `reqId` 是 `undefined`。

**為什麼 repository 函式只在「進入點」包一層，內部呼叫的 helper（`pageToEvent`、`getFullRelation` 等）不重複包**：一個 repository 匯出函式即使內部因為分頁或迴圈打了好幾次 HTTP call，語意上仍是同一件事（例如 `findByPageIds` 迴圈查多個人，是同一個「查詢成員資料」動作，不是好幾個不同目的）。讓內層呼叫自然繼承外層已經設定的 purpose，粒度才會對齊使用者真正想看到的「這一步在幹嘛」，而不是每個原始 HTTP call 各自一個標籤。

**為什麼 Notion API log 拆成 info + debug 兩行，而不是維持一行、只是把 level 從 debug 改 info**：原本一行 `logger.debug({ method, path, db, body, result }, ...)` 含完整 request/response payload，如果整行升到 info，會讓 Notion 回傳的完整 raw page object（含姓名、LINE user_id 等 PII）在正式環境預設就持續寫進 `/logs` 可查到的檔案，違背 `LOG_LEVEL` 這個功能原本「預設 info、要診斷才臨時開 debug」的設計初衷（見 `docs/development.md` 裡 `LOG_LEVEL` 那條的說明）。拆成兩行——info 只帶 method/path/db/purpose，debug 才帶 body/result——讓流程表在**不開 debug** 的情況下也能顯示每一步「打了什麼、為了什麼」，只是看不到完整內容；要看完整內容才需要臨時切到 debug，PII 曝露面沒有因為這個新功能而擴大。

新增任何會被流程表用到的 log 呼叫時，記得這個分層：摘要級資訊（能安全常駐 info 的）跟載荷級資訊（含使用者資料、只該在主動診斷時短暫出現的）要分開兩行記，不要圖方便合併成一行、也不要把摘要級資訊也降去 debug——那樣流程表在預設 level 下就會變成一片空白。

這不是只有 Notion API 這一處：`event-router.ts` 的 `'Processing event'` 一開始（升到 info 時）沒注意到 `event.source`（LINE userId/groupId）跟 `event.message`（使用者原始訊息）也是同一類 PII，之後才拆成 info 摘要（`type`/`sourceType`）+ debug 明細（`'Processing event detail'`）補上這個分層。之後新增 log 呼叫，先問自己「這行會不會被升到 info 常駐」，會的話要先檢查裡面有沒有欄位屬於這一類，不要等出包才拆。
