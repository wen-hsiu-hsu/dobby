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
- [ ] 正式切換後第一次 `display-name-update`（2026-09-28 週一 04:00）—— 到 `/logs` 的排程分頁確認有跑完、更新筆數合理；USERS `groups` 裡殘留的測試群組 ID 造成的 404 是預期中的（見 `docs/overview.md`「從 n8n 遷移」），不是錯誤；2026-09-29 已手動清掉無關的群組 ID，之後的週次應該會少很多
- [ ] 部署「報名／請假沿用 message-handler 的 USERS 快照＋Season 並行查」（2026-09-28，見 [ADR 0009](docs/adr/0009-actor-users-snapshot-non-null-only.md)）後，到 `/logs` 看既有使用者在群組的 `@Dobby +N`／`@Dobby 假`：時間軸應該只剩一次 USERS query（`message-handler` 那次），`resolveTarget` 的 People GET 和 Season query 起點應該幾乎相同。改之前的基準：成功寫入的 `+N`／`-N` 每次 7～12 個 Notion 呼叫、中位數 3.3 秒，預估降到 2.4～2.5 秒（原始分析見 git 歷史中被刪掉的 TODO 項目「報名／請假：同一個請求查兩次 USERS」）。群組新使用者的第一個指令、一對一私訊仍會查兩次 USERS，這是預期的。沒達到預估不是 bug，把實測數字記在下方即可。
- [ ] 到 Pi 的 `/logs` 頁面，看底部 footer 的「R2 備份」徽章，確認 R2 同步真的有啟用、最近一次同步成功（徽章語意見 `docs/logging.md`「R2 同步狀態徽章」段）。本機 log 保留約 7 天，當週的申訴夠用；但季末對帳或事後爭議只能靠 R2，沒啟用的話 7 天前的 log 就沒了。R2 上的檔案 `/logs` 讀不到，要自己下載再用 `jq` 查。
- [ ] 報名／請假狀態回覆改用 Flex 卡片後（見 [ADR 0010](docs/adr/0010-registration-status-flex-card.md)），部署後在真實 LINE（iOS、Android、電腦版、深色模式）分別看一次報名／請假卡片：標題照片（`header-shuttle.jpg`）與各徽章圖示有正常顯示、文字疊在照片上仍然讀得清楚（深色模式跟淺色模式的漸層遮罩都要看）、卡片底部三顆按鈕（`+1 零打`／`−1 零打`／`請假`）按下去有送出正確的指令文字、LINE 推播通知彈出的內容跟 `/logs` 顯示的內容是 altText（不是卡片 JSON 或空白）。**前置條件**：repo 的 Settings → Pages → Source 要選「GitHub Actions」（見 `.github/workflows/pages.yml`），且 `https://wen-hsiu-hsu.github.io/dobby/flex/` 底下的圖片網址要能回 200——這件事要先確認完成，才能讓 bot 部署接真實流量，否則卡片會整張破圖。
- [ ] 指令清單改用 Flex 卡片後（見 [ADR 0012](docs/adr/0012-command-list-flex-card.md)），部署後在真實 LINE（iOS、Android、電腦版）用一般成員和管理員各下一次 `@Dobby 指令`：標題照片與各列圖示有正常顯示；每一列、每顆按鈕按下去送出的指令文字正確，而且 bot 有照該指令回覆；一般成員看不到「管理員專用」區；管理員的「下一季公告草稿」送出的季度是下一季。**前置條件**：這批新增的圖示（`assets/flex/` 底下 `list-dark.png`、`*-light.png`、`search-gray.png` 等，commit `95ccacd`）要先推上 `main`、GitHub Pages 發布完成、網址回 200，才能部署程式，否則卡片會破圖。
- [ ] 週報推播與 `@Dobby next` 改用 Flex 卡片後（見 [ADR 0011](docs/adr/0011-weekly-status-flex-card.md)），部署後在真實 LINE 群組看一次：可以用 `@Dobby next`（管理員身分）先看，不用等到週日 09:00 才知道卡片長怎樣，兩者輸出應該完全一樣。正常週要看：徽章灰底＋`calendar-check-dark.png`、標題「本週打球」、副標題「不能到請喊聲」（若當週場地數跟季預設不同，額外確認副標題變成「不能到請喊聲・本週 N 面場」、altText 場地行有「（本週調整）」）、底部三顆按鈕功能跟報名卡片一致。暫停週（Notion 行事曆該週活動狀態設「打球暫停」）要另外找一週測：確認徽章換成灰底＋`ban-dark.png`、標題「本週活動暫停」、右上剩餘名額／進度條與零打名單／請假／本週出席三段內文都不見了，內文改成一行灰字「本週因故暫停，恢復後另行公告」，底部沒有按鈕。

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

- [ ] **`trackUser` 可能用過時的 USERS 快照寫回，少算一次發言數，少數情況會弄丟一個群組 ID。**（2026-09-28 code review 發現，是既有問題，不是當天 log 改動造成的）

  **嚴重度：低優先、不是急件。** 這是 bug，但沒有觀察到實際發生（見下方「有沒有發生過」）。`message_counts` 目前沒有任何程式讀取，成就規則也不用它；groups 只有暱稱排程在讀，而且弄丟群組需要很少見的時序。

  機制：`src/services/user-management.ts:95` 的 `trustKnownUser = knownUser != null && !isLocked(key)` 決定要不要沿用快照 `knownUser`。快照是 `src/handlers/message-handler.ts:49` 的 `findByUserId` 讀的，第 59 行再把它傳給 `trackUser`。沿用快照的話，鎖內就不重查 USERS，直接拿快照算更新：
  - `groups`／`multiChats`：只有「這次的群組／聊天室不在快照裡」時，才把「快照的陣列＋這次的 ID」整包寫回（第 129-138 行）。
  - `message_counts`：寫的是絕對值。`incrementMessageCount(pageId, existing.messageCount)` 寫入「快照的數字＋1」（`services/notion/users-repository.ts:124-130`），不是 Notion 端自己加一。

  快照過時的話，前一次寫入的結果會被蓋掉。「前一次」可能是 `trackUser`，也可能是 `trackJoinedMember`（`handlers/member-joined-handler.ts:27`，用同一把 `user-track-${userId}` 鎖，也會寫 groups／multiChats）。有兩種情況會讓過時的快照被信任：
  1. **前一次呼叫逾時、但背景還在跑。** `isLocked()`（`services/mutex.ts:158-160`）讀的是 `pending`，也就是「還有沒有呼叫端在等」，在 `withMutex` 的 `finally` 裡減一（`mutex.ts:105-111`），逾時的呼叫端也會走到這裡。呼叫端 10 秒逾時放棄後，只要沒有其他呼叫端還在排隊，`pending` 就歸零；但 `fn()` 還在背景持鎖寫入（ADR 0002）。這時同一人的下一則訊息會信任快照。鎖的 FIFO 仍然成立，它會等前一個 `fn()` 寫完才執行，但拿的是寫入前的快照去算。要 Notion 卡住超過 10 秒才會發生。
  2. **快照在前一次寫入生效前讀取，但檢查 `isLocked` 時前一次已經結束。** 第 95 行在 `_trackUserAsync` 第一個 await 之前同步執行，所以檢查點是「呼叫 `trackUser` 那一刻」，不是「讀快照那一刻」。`trackUser` 是 fire-and-forget（只有「新使用者＋指令」才 await，`message-handler.ts:62`），同一人快速連發兩則時，第二則的 `findByUserId` 會和第一則的 `fn()` 重疊。如果 Notion 處理第二則查詢時第一則的 PATCH 還沒生效，而查詢的回應在第一則 `fn()` 結束後才回來，第二則就會信任舊快照。不需要逾時，但時間窗很窄。

  影響：
  - **`message_counts` 少算 1**，不會自己修正。目前沒有任何程式讀這個欄位。規劃中的成就系統也不會用它：`docs/achievements-rulebook.md:30` 寫發話類成就「不看訊息數量」，第 107 行規定發話要算貼圖，但 `message_counts` 不算貼圖（`docs/notion/databases.md:32`）。
  - **群組 ID 遺失，條件很窄**：同一人要在時間窗內，先後在兩個「他從沒講過話的群組」X、Y 發言（Y ≠ X）。後一次拿不含 X 的快照寫回 `[...快照, Y]`，X 就被洗掉。只是「從不同群組發言」不會觸發，因為群組已經在快照裡就不寫 groups。multiChats 同理。
    - 遺失的 ID 要等這個人之後又在那個群組發言（或再觸發一次 memberJoined）才會加回去，不再發言就永久遺失。
    - groups 目前唯一的讀取者是 `schedulers/display-name-update.ts:47-55`，靠它查 LINE 暱稱。少一個群組，只有在其他群組都查不到 profile 時才會影響暱稱更新。
  - **不會建出重複的 USERS 頁**：`null` 快照從來不被信任（第 92-94 行註解），鎖內會重查。

  有沒有發生過：
  - 本機 `logs/` 有一筆看起來像的紀錄，但**不是這個 bug**：`/pages/2e44dbf2-…93d7` 在 2026-09-22 01:00:33 被寫了兩次 `message_counts: 515`（reqId `bd613b`、`77151d`，相差 120ms）。兩個 PATCH 是同時送出的，那是 `_trackUserAsync` 還沒加鎖時的舊 race，commit `78ce9cf`（2026-09-25）加了 `withMutex` 之後就不會再這樣。
  - `78ce9cf` 之後的 log 沒有觀察到這條描述的情況。
  - 要檢查的話：找「`累加使用者發言次數`」的 PATCH，看同一個 page 有沒有兩次寫入同一個數字，而且兩次 PATCH 沒有重疊（有鎖之後應該一前一後）。PATCH body 只在 `LOG_LEVEL=debug` 才有記錄（`services/notion/notion-fetch.ts` 的 `Notion API request payload`）；info 等級下只看得到 path 裡的 pageId，看不到寫了什麼數字。

  如果要處理：
  - **只修第 1 種**：新增一個讀 `inFlight` 的函式（例如 `isBusy(key)`）。`inFlight` 是 `mutex.ts` 為 `Mutex task finished` 摘要加的計數，只在 `fn()` 真正結束時才減一。`user-management.ts:95` 改用它。
    - **檢查位置不能動**：必須跟現在一樣，在呼叫 `withMutex` **之前**同步檢查（第 89-91 行註解說明了原因）。`withMutex` 一被呼叫就會把這次算進 `inFlight`，之後才檢查的話永遠回 true。
    - **不要直接改 `isLocked()` 讀的東西**：`services/__tests__/mutex.test.ts:235` 的測試鎖住的就是「`isLocked` 反映呼叫端有沒有在等」這個語意，ADR 0002 第 11 行也寫了 `trackUser` 依賴它。要改就要連同測試、ADR 一起改，並說明語意變更的理由。
    - `inFlight` 的註解（`mutex.ts:5-8`）目前寫「只給 log 用」，拿來做判斷時要一起改。
  - **要連第 2 種一起修**：檢查點要移到讀快照之前，例如在讀快照前記下這個 key「已完成幾次」，`trackUser` 時比對。陷阱：
    - 快照是在 `message-handler.ts:49` 讀的，所以要在那之前記下計數，再傳給 `trackUser`。這要改 `trackUser` 的簽名，`message-handler` 也要拿得到 key，而 `user-track-${userId}` 目前是 `user-management.ts` 內部的格式。
    - 比對計數之外，仍然要檢查 `inFlight`（或上面的 `isBusy`）：前一個任務如果讀快照時已經在跑、到呼叫 `trackUser` 時還沒結束，已完成次數不會變，只比計數會漏掉。
    - 計數不能照抄 `inFlight` 的清理方式（歸零就 `delete`）：刪掉再重建的計數可能剛好回到一樣的數字，就會錯誤地信任快照。計數也要在 `tail` 完成時遞增，不是在呼叫端的 `finally`，否則第 1 種還是存在。
  - **另一個做法是拿掉快照優化，鎖內一律重查 USERS**：每則群組訊息多一次 Notion 查詢（約 0.45 秒，見 ADR 0009；在 fire-and-forget 裡，使用者感覺不到），但會多吃 rate limit。會弄壞 `services/__tests__/user-management.test.ts:69`（斷言 `findByUserId` 沒被呼叫）和 `:308`（斷言只呼叫 1 次），`docs/adr/0009-actor-users-snapshot-non-null-only.md` 第 7 行附近提到 `trustKnownUser` 的地方也要同步。
  - **沒驗證過的前提**：不管哪種做法，最後都靠「鎖內重查拿到最新值」。重查用的是 database query（`findByUserId` → `/databases/…/query`），`docs/architecture.md:75` 只實測過「新建的頁面立刻查得到」，沒測過「PATCH 更新數字屬性後，query 立刻拿到新值」。如果 Notion 在這裡有延遲，連現在不信任快照的路徑也會少算。改用 `GET /pages/{pageId}` 讀會比較穩。
  - `message_counts` 更根本的修法是不寫絕對值，但 Notion API 沒有原子加一，還是要靠「鎖內讀最新值」。
  - 測試：`createTestBot` 把 `withMutex` mock 掉了（`test-utils/create-test-bot.ts:196-199`），重現不了。要加在 `services/__tests__/user-management.test.ts` 既有的 `describe('trackUser concurrency')`（第 270 行起，用的是真的 mutex），不要另外寫一套。
    - 第 2 種很好重現：拿同一份舊快照，先 `await trackUser(A)`，再呼叫 `trackUser(B)`，不需要手動控制 resolve 時機。
    - 第 1 種要用 fake timers 觸發 10 秒逾時。該檔的 `flush()` 用 `setImmediate`，vitest 的 fake timers 可能連 `setImmediate` 也假掉，讓 `flush()` 卡住，寫之前先確認。

- [ ] **同一個 webhook 事件送達兩次時會被處理兩次，`+N`／`-N` 可能重複寫入。**（2026-09-29 對照 LINE 官方文件發現）

  **嚴重度：潛在的資料錯誤，沒有觀察到，低優先、不是急件。** 2026-09-29 已在 LINE Developers Console 確認 **Webhook redelivery 是關閉的**，所以下方「重送」與「2 秒逾時」兩種來源目前都不會觸發重複送達；剩下的只有 LINE 文件那句沒講清楚適用範圍的「網路路由問題」。**如果之後要打開 Webhook redelivery，要先處理這一條。** 沒打開的話，可以先照下方「動手前先確認」開 Error statistics 觀察，確認真的有重複送達再決定要不要做。

  現況：`src/routes/webhook.ts:9-30` 驗完簽章就回 200（第 11 行），再把 `events` 丟給 `processEvents()`。`src/handlers/event-router.ts` 對每筆事件在 `Processing event`（第 24-33 行）記下 `webhookEventId`、`isRedelivery`，但**沒有任何去重**，同一個 `webhookEventId` 來幾次就處理幾次。

  LINE 官方文件說會有同一事件送達不只一次的情況（網頁版是 JS 渲染，要讀內容可以 `curl -sL <網址>/index.html.md` 抓 Markdown 原始檔）：
  - [Receive messages → Redeliver a webhook that failed to be received](https://developers.line.biz/en/docs/messaging-api/receiving-messages/#webhook-redelivery)：
    - **Webhook 重送預設關閉**，要在 Console 的 Messaging API 分頁手動開啟。開啟後，bot 伺服器沒回 2xx 時 LINE 會重送，次數和間隔不公開、可能不經通知變更。
    - 重送的事件內容跟原本一樣（`webhookEventId`、`replyToken` 都不變），只有 `deliveryContext.isRedelivery` 變成 `true`。
    - 同一段的注意事項：「The same webhook event may be sent to your bot server more than once by different reasons such as network routing problem. To detect duplicates, use `webhookEventId`」，以及「重送時事件到達的順序可能跟發生的順序不同」。這兩句寫在「開啟重送前要注意」的段落裡，沒講清楚重送關閉時會不會發生。
  - [Check webhook error statistics](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/)：LINE 等回應只等 **2 秒**，超過就記成 `request_timeout`，而且文件明講「Note that the webhook may have been successfully received by the bot server」。也就是說，「Pi 已經處理、LINE 卻當成失敗」不只發生在 200 遺失，只要 200 超過 2 秒才回到 LINE 就算。正式環境的路徑是 LINE → Cloudflare Tunnel → Pi（`docs/overview.md:66`），Pi 負載高、事件迴圈卡住、tunnel 抖動都可能讓回應超過 2 秒。

  **動手前先確認**：
  1. Console → Messaging API 分頁，「Webhook redelivery」有沒有開（2026-09-29 確認為關閉；有人改過設定的話要重新評估）。
  2. 同一頁打開「Error statistics aggregation」（預設關閉、不會回溯），觀察一段時間，看有沒有 `request_timeout` 或 `error_status_code`。這比到 `/logs` 逐筆看更適合確認現況。
  3. Pi 的 `/logs`：`isRedelivery` 為 true 時，「起點」那一步會顯示黃色的「LINE 重送這筆事件（isRedelivery）」（`src/routes/logs.ts:884-901`）；重複處理時第二次的 `Reply failed` 會讓事件卡片變紅（`groupStatus()` 的 `hasReplyFailure`，`logs.ts:661-664`），可以用 `webhookEventId` 搜尋對照。
  - 本機 `logs/`（檔案日期 2026-09-21、22、26、27、28）沒有任何 `isRedelivery: true`，也沒有重複的 `webhookEventId`。但本機是 ngrok 開發環境的資料（`docs/development.md`），不能當正式環境的證據。

  會出事的情境（同一事件被處理兩次時）：
  - **`+N` 會再加最多 N 筆**（`commands/registration/capacity-calculator.ts:98-171`），編號接著排。非管理員會被剩餘名額截斷；管理員不受名額上限，可能超額；名額已滿時第二次被拒絕、不寫入。
  - **`-N` 會再刪最多 N 筆**（第 173-208 行），前提是對方還有剩下的報名；沒有就回「找不到報名紀錄」、不寫入。
  - 第二次的回覆會因為 replyToken 已用過而被 LINE 拒絕（`Reply failed`），所以**當下的回覆看不出被重複寫入**；之後的 `@Dobby next`、週報、下一次報名的回覆名單才會顯示多出來或少掉的那筆。
  - **`假`／`銷假`**：`leave-handler.ts` 在鎖內重讀狀態，單純重複會走「已請假」／「未請假」的 no-op。但前提是兩次之間沒有相反的指令：LINE 說重送順序可能亂掉，「假 → 銷假 → 遲到的重送『假』」會**重新登記請假**，寫錯資料。
  - **發言數**：群組／多人聊天的**所有文字訊息**（不只指令，閒聊也算）重複送達都會讓 `trackUser` 多算 1；一對一聊天不追蹤（`handlers/message-handler.ts:58-63`）。新使用者的第一則訊息重複送達不會建出兩個 USERS 頁（null 快照一律重查，`services/user-management.ts:95`），只會多算 1。
  - 其他只會多一筆 `Reply failed`、不會寫壞資料的：自動回覆、其他唯讀指令（owe、next、news 等）、`join`；`memberJoined` 的 `trackJoinedMember` 不計發言數、groups 是合併寫入，重複也是冪等的。


  如果要處理：
  - **位置**：放在 `event-router.ts` 的 `runWithContext` 裡面、`Processing event` 那行 info log 之後、`switch` 之前。放在 `runWithContext` 外面，略過時記的 log 沒有 reqId，在 `/logs` 會變成「背景/未關聯事件」；放在 `Processing event` 之前，就沒有「起點」那一步，`isRedelivery` 也不會記下來。原本那次和重複那次一定是兩個不同的 reqId（`utils/request-context.ts:13` 每次隨機產生），`/logs` 上只能靠 `webhookEventId` 把兩者對起來。
  - **依據只能是 `webhookEventId`，不能用 `isRedelivery` 判斷要不要略過**：網路路由造成的重複，`isRedelivery` 可能是 false；Pi 當機後的重送 `isRedelivery` 是 true，而那種反而應該處理（原本那次根本沒處理到）。
  - **沒有 `webhookEventId` 時不要去重**：`src/handlers/__tests__/event-router.test.ts` 的事件大多沒帶這個欄位（undefined），`src/__tests__/auto-reply.test.ts` 帶的是空字串。拿 undefined 或 `''` 當 key 的話，第一筆之後全部會被當成重複。
  - **「檢查」和「記下」要在同一段同步程式裡，中間不能有任何 `await`**：兩個 webhook 請求會各自呼叫 `processEvents()`、交錯執行，`has` 和 `set` 之間夾了 `await` 的話，同時到的兩份都會通過檢查。要在開始處理時就記下 ID，不是處理完才記：原本那次還在 mutex 排隊時，重複的那份就可能到了。
  - **保存方式**：in-memory 的 Map（事件 ID → 收到時間），定期清掉過期的項目，控制記憶體用量。保留時間**不能照 replyToken 的 20 分鐘抓**：20 分鐘只限制 replyToken 還能不能用，不限制重送什麼時候到；超過 20 分鐘才到的重送仍然會寫入資料，而且完全沒辦法回覆，是最糟的情況。重送的次數和間隔不公開，保留時間要寬鬆（例如 1 小時），並在程式註解寫明這是推估。
  - Pi 重啟後 Map 清空，可以接受：重啟前處理過、重啟後才被重送的組合非常少見；Pi 當機時原本那次通常根本沒處理，重送本來就該處理。要跨重啟去重得另外存（檔案或 Notion），成本不成比例，要做的話先評估。
  - 同一個 webhook 裡的多筆事件各自有自己的 `webhookEventId`，去重的單位是「事件」，不是整個 webhook 請求。放在 event-router 會自動涵蓋 `join`／`memberJoined`，對它們去重也無害。
  - **`/logs` 呈現**：略過時記一行 info（例如 `Duplicate webhook event skipped`，帶 `webhookEventId`、`isRedelivery`，不帶 userId；不要用 warn，否則卡片會變黃）。**要注意的方向**：被略過的訊息事件不會有 `Message classified`、也沒有 Notion 步驟，`groupKind()`（`routes/logs.ts:468-491`）會把它判成「對話」、`groupStatus()` 判成「完成」，變成一張看不出是重複事件的綠色卡片。要讓 `groupKind()`／`groupStatus()`（或標題、預覽）認得這個訊息字串，在 `/logs` 上一眼分辨出「這是被略過的重複事件」。
  - **測試**：寫在 `src/handlers/__tests__/event-router.test.ts`（那裡的 `handleMessage` 本來就是 mock），同一個 `webhookEventId` 送兩次，斷言 `handleMessage` 只被呼叫一次；另外測沒有 `webhookEventId` 的事件不會被去重。去重的 Map 在模組層級，測試之間會殘留，要提供重置函式（在 `beforeEach` 呼叫），或每個測試用不同的 ID。**不要用 `createTestBot` 測**：它的 `run()` 直接呼叫 `handleMessage`（`src/test-utils/create-test-bot.ts:204`），完全不經過 `processEvents()`，測不到去重；如果為了測試改成經過 `processEvents()`，`buildLineEvent` 把 `webhookEventId` 寫死成 `'evt-1'`（第 136 行），同一個測試檔裡第二次以後的 `run()` 會全部被當成重複吞掉。
  - 同步文件：`docs/architecture.md`「Fire-and-Forget Webhook 處理」小節（目前寫「本專案沒有開啟重送」，改完要一起更新），以及 `docs/logging.md` 對「起點」和事件種類／狀態的說明（新 log 行要寫進去）。

---

## 程式碼整理與小改善（非 bug，低優先）

- [ ] **`message-handler.ts` 的「指令解析失敗」分支永遠走不到。** `src/handlers/message-handler.ts:65-68` 的 `if (!command)`（記 debug `Message looks like command but failed to parse` 後 return）不會執行：`isCommand()`（`src/commands/command-parser.ts:98-100`）就是 `text.startsWith('@Dobby')`，而 `parseCommand()` 只在「不是 `@Dobby` 開頭」時回 `null`（第 12 行），其餘至少回 `{ type: CommandType.UNKNOWN }`（第 95 行）。所以 `Message classified` 的 `parsed` 永遠是 `true`，打錯的指令會以 `commandType: 'unknown'` 進 `routeCommand`、被靜默忽略，`/logs` 顯示成「指令／警告」、「來自」`unknown`（2026-09-28 本機 reqId `d8dad6` 的 `@Dobby hello` 實測）。

  不是 bug，行為正確，只是死碼加上幾處為它寫的顯示邏輯。不處理也沒有風險；風險只在之後有人改 `parseCommand()` 讓它對某些 `@Dobby` 開頭的文字回 `null` 時，這些分支才會突然「活過來」，所以處理時要決定是刪掉還是保留當防禦。

  如果要處理：
  - 相關的地方要一起看：`message-handler.ts:37` 的 `parsed: command !== null`、`src/routes/logs.ts:478-481`（舊 log fallback 認 `Message looks like command but failed to parse`）、`logs.ts:635`（`parsed === false` 時「來自」顯示「（指令解析失敗）」）、`docs/logging.md` 第 39、45、49、60 行的說明，以及 `src/routes/__tests__/logs.test.ts` 裡用到 `failed to parse`／`parsed: false` 的測試。
  - **`logs.ts:478-481` 的舊 log fallback 不能刪**：`/logs` 會讀本機保留 7 天、R2 備份的舊 log 檔，裡面可能有這行。
  - 如果改成保留分支，可以考慮讓 `parseCommand()` 的型別不回 `null`（呼叫端先確認 `isCommand()`），讓 TypeScript 直接擋掉這個分支；如果刪掉，`Message classified` 的 `parsed` 欄位要一起決定去留（`logs.ts:635` 在讀它）。

- [ ] **`/logs`「起點」那一步的摘要沒顯示 `lagMs`。** `src/handlers/event-router.ts` 的 `Processing event` 從 2026-09-28 起帶 `lagMs`（事件發生到 Pi 開始處理的毫秒數，定義與判讀限制見 `docs/logging.md`「起點」那段），但 `src/routes/logs.ts:866-903` 的 `startStepTimeline()` 組 note 時只放訊息內容、事件類型、來源、`webhookEventId` 和 `isRedelivery`，沒有 `lagMs`，要點開「起點」看原始 JSON 才看得到；`?format=text` 也沒有。`docs/logging.md` 已經寫明「目前沒有顯示在起點的摘要文字裡」。

  不是 bug，只是不方便。如果要處理：在 note 加一段（例如「延遲 246ms」），舊 log 沒有這個欄位時不要顯示。**負值是正常的**（Pi／容器時鐘偏差，本機實測看過 -302），不要當成錯誤標紅；重送事件（`isRedelivery`）的值本來就很大，搭配既有的黃色重送提示看。改完要同步 `docs/logging.md` 那句「目前沒有顯示」，`logs.test.ts` 有起點 note 的測試可以參考。

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

- **`@Dobby next` 在「有活動、沒季資料」時回「找不到 YYYY-MM-DD 的活動」的誤導訊息**（2026-09-29 決定）— 不修。背景見 [ADR 0008](docs/adr/0008-season-derived-from-event-date.md) 最後一段：`getEventOccupancy` 把「沒有活動」和「沒有季資料」都回 `null`，`commands/next-event.ts` 分不出來。不修的理由：新一季的建立流程一定是先建季資料、再建活動，所以「有活動、沒季資料」只會在管理員建資料建到一半時出現；而會在這時候下 `@Dobby next` 的也只有管理員本人，他自己知道資料還沒建完。需要查原因時，`/logs` 的 info 行 `Event occupancy unavailable: no event or season for date`（`{date, hasEvent, hasSeason}`）已經看得出來。若之後建資料的流程改成非管理員也會碰到這個狀態，再重新評估。

- **部署後逐項驗證 log 改動的手動測試項、重測本機沒送到的情境**（2026-09-29 決定）— 不加進「手動測試追蹤」。2026-09-28 的 log 可觀測性改動已在本機用真實 LINE 訊息驗證過 30 個事件（原始 log 與 `/logs` 呈現都正確）；閒聊、貼圖、連續兩次 `假`、非管理員代報、從 LINE 選單點選的真正 mention、mutex 逾時這幾種當時沒送到本機伺服器或沒觸發，決定不再補測。部署到 Pi 後確認 `stop_grace_period` 生效（`docker inspect` 的 `StopTimeout` 為 15）也不列成追蹤項目。
- **`notion-fetch.test.ts` 兩個 429 重試測試各跑 1 秒、3 秒**（2026-09-28 發現）— 不處理。原因是測試用 `Retry-After: '0'`，程式把 0 視為無效、退回預設 1 秒等待；只影響測試速度，不影響正確性。新寫的 429 測試已改用 fake timers。

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
  - `registration-handler.ts:102-110`（名額不足）、`142-150`（成功）
  - `leave-handler.ts:104-112`（已請假，no-op）、`119-127`（未請假，no-op）、`153-161`（成功）

  實測鎖持有時間：中位數約 1.43 秒（0.85～4.44 秒，n=34）。n=34 是所有進到鎖內的報名／請假請求，包含名額不足和 no-op 分支，所以比成功寫入的次數（`+N`／`-N` 26 次＋請假／銷假 4 次）多。這是 mutex 摘要上線前量的：當時 log 沒有 acquire／release 事件，是用鎖內第一個 calendar query 的開始時間，算到 `LINE reply sent` 推出來的。2026-09-28 起可以直接看 `Mutex task finished` 的 `heldMs`／`waitMs`／`queuedAhead`（見 `docs/registration.md`「從 log 看鎖競爭」），做完這一項後用它比對效果。4.4 秒那筆是 calendar PATCH 長尾，跟組訊息無關。鎖內姓名查詢中位數約 0.28 秒，LINE reply 約 0.2 秒。

  鎖內多出的時間會隨請假人數增加：每位請假人約 0.3 秒 GET，加上筆與筆之間 400ms sleep。1 人約 0.3 秒，2～3 人約 1～1.7 秒，5～6 人約 3.1～3.8 秒。log 是測試流量，請假人數只有 0～2 人。但從 calendar payload 看，7/04～9/19 各週的最終請假人數是 0～6 人（中位數約 2.5），週末前的報名可能遇到較高的數字。

  這項不是 bug，單一使用者的回覆時間也不會變短，只在有人排隊時才有幫助：縮短後面的人的等待，降低 mutex 逾時的機率。`withMutex` 的 10 秒逾時從呼叫時起算、含排隊時間（見 [ADR 0002](docs/adr/0002-mutex-timeout-does-not-cancel-task.md)）。以目前鎖持有中位數 1.43 秒估算，約 7 人同時排隊才會逾時；遇到 Notion 長尾時約 3～4 人。2026-09-28 本機實測（`Mutex task finished` 的 `waitMs`／`heldMs`，見 `docs/registration.md`「從 log 看鎖競爭」）：同一人快速連發 4 則 ±1，其中一次 calendar PATCH 花了 4.2 秒，最後一則排隊 7.7 秒、從呼叫到完成 9.1 秒，離逾時只差約 0.9 秒；另一批連發 7 則被拒絕的 `-1`（持鎖約 0.85～1.5 秒），最長 4.7 秒。這項做完後，可以直接用這些欄位比對效果。逾時的使用者會收到「這次操作可能已經完成，請勿重複操作」，背景寫入照常完成。

  如果要處理：可以讓 mutation 回傳組訊息需要的資料，改到鎖外組訊息並 `replyMessage`。要改 `with-fresh-calendar-event.ts:19` 的 mutation 簽名，它現在是 `(fresh: T) => Promise<void>`。
  - 移到鎖外不會造成資料不一致：訊息內容仍然用 mutation 在鎖內算出的快照（`updatedGuests`、`newAbsentees`、`totalSlots`），跟現在一樣。差別只有姓名查詢晚一點（姓名不會變），以及 B 的回覆可能比 A 先到，都無害。
  - 如果做了上面 `findByPageIds` 那一項的快取備案，請假人姓名會走快取，鎖內只剩 LINE reply 約 0.2 秒，這一項就不值得做了。那一項的首選做法（反向 relation 查詢）不碰鎖內的查詢，做完後這一項的效益不變。
  - 另有一個可以單獨做的小改善：操作對象本人在請假名單裡時（請假成功、「已請假，無需重複操作」，以及已請假的季租成員自己 `+N`），他的 People 頁會 GET 兩次，一次在鎖外的 `resolveTarget`（`target-resolver.ts:38`），一次在鎖內的 `buildEventStatusMessage`（`event-status-message.ts:30`）。不是 bug，姓名相同，只是鎖內多一次約 0.3 秒的 GET；請假成功時本人排在 `newAbsentees` 最後（`leave-handler.ts:133`），前面有人時還要多等一次 400ms sleep。如果要處理：可以讓 `buildEventStatusMessage` 多收一個「已知 pageId → 姓名」參數（傳 `resolved.personPageId` → `resolved.displayName`），已知的就跳過 GET，但輸出順序要維持 `absenteePageIds` 的順序。pageId 出現在請假名單就一定有 People 頁，所以這時 `displayName` 一定是 People 的 `Name`，不會拿到 LINE 名稱。若做了上面的鎖外組訊息，或 `findByPageIds` 那一項的快取備案，這個重複的影響會變小或消失。

---
