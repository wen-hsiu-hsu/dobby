# TODO

> 時區：Asia/Taipei ｜ 季度定義：Q1=1~3月, Q2=4~6月, Q3=7~9月, Q4=10~12月
>
> 前身為 `openspec/changes/bot-logic-fixes`，已改用純 Markdown TODO 追蹤，不再使用 OpenSpec 流程。
>
> 已完成且有文件記錄的項目已從這裡移除，機制細節記錄在 `docs/registration.md`、`docs/commands.md`、`docs/architecture.md`、`docs/notion/databases.md`、`docs/schedulers.md`、`docs/adr/`。開工前用任務關鍵字 grep 這裡（不用整份讀），再看對應文件，避免重複踩雷。已否決的提案在 `docs/rejected-proposals.md`，效能待辦在 `docs/performance-observations.md`。

---

## 手動測試追蹤（ngrok 接真實 LINE 帳號測試）

> 每項測完打勾，機器人實際回應貼進該項下方的 code block（原文照貼、保留換行），有問題另加「備註：」說明差異。

- [ ] 全形 `＋`/`－` 符號 —— 程式碼已支援（`command-parser.ts`／`registration-parser.ts` 的 `normalizeFullWidth()`），只需要實際傳 `@Dobby ＋1` 這種全形指令驗證一次即可，不需要改 code
- [ ] 正式切換後第一次 `display-name-update`（2026-09-28 週一 04:00）—— 到 `/logs` 的排程分頁確認有跑完、更新筆數合理；USERS `groups` 裡殘留的測試群組 ID 造成的 404 是預期中的（見 `docs/overview.md`「從 n8n 遷移」），不是錯誤；2026-09-29 已手動清掉無關的群組 ID，之後的週次應該會少很多
- [ ] 部署「報名／請假沿用 message-handler 的 USERS 快照＋Season 並行查」（2026-09-28，見 [ADR 0009](docs/adr/0009-actor-users-snapshot-non-null-only.md)）後，到 `/logs` 看既有使用者在群組的 `@Dobby +N`／`@Dobby 假`：時間軸應該只剩一次 USERS query（`message-handler` 那次）；另外會有一筆背景的 `GET /pages/<USERS 頁>`（目的「追蹤發話者時依 page ID 重讀 bot 使用者帳號」），那是 `trackUser` 在鎖內重讀（[ADR 0017](docs/adr/0017-track-user-always-rereads-inside-lock.md)），預期中的、不在指令的關鍵路徑上，不代表快照沿用失效；`resolveTarget` 的 People GET 和 Season query 起點應該幾乎相同。改之前的基準：成功寫入的 `+N`／`-N` 每次 7～12 個 Notion 呼叫、中位數 3.3 秒，預估降到 2.4～2.5 秒（原始分析見 git 歷史中被刪掉的 TODO 項目「報名／請假：同一個請求查兩次 USERS」）。群組新使用者的第一個指令、一對一私訊仍會查兩次 USERS，這是預期的。沒達到預估不是 bug，把實測數字記在下方即可。
- [ ] 到 Pi 的 `/logs` 頁面，看底部 footer 的「R2 備份」徽章，確認 R2 同步真的有啟用、最近一次同步成功（徽章語意見 `docs/logging.md`「R2 同步狀態徽章」段）。本機 log 保留約 7 天，當週的申訴夠用；但季末對帳或事後爭議只能靠 R2，沒啟用的話 7 天前的 log 就沒了。R2 上的檔案 `/logs` 讀不到，要自己下載再用 `jq` 查。
- [ ] 報名／請假狀態回覆改用 Flex 卡片後（見 [ADR 0010](docs/adr/0010-registration-status-flex-card.md)），部署後在真實 LINE（iOS、Android、電腦版、深色模式）分別看一次報名／請假卡片：標題照片（`header-shuttle.jpg`）與各徽章圖示有正常顯示、文字疊在照片上仍然讀得清楚（深色模式跟淺色模式的漸層遮罩都要看）、卡片底部三顆按鈕（`+1 零打`／`−1 零打`／`請假`）按下去有送出正確的指令文字、LINE 推播通知彈出的內容跟 `/logs` 顯示的內容是 altText（不是卡片 JSON 或空白）。**前置條件**：repo 的 Settings → Pages → Source 要選「GitHub Actions」（見 `.github/workflows/pages.yml`），且 `https://wen-hsiu-hsu.github.io/dobby/flex/` 底下的圖片網址要能回 200——這件事要先確認完成，才能讓 bot 部署接真實流量，否則卡片會整張破圖。
- [ ] 指令清單改用 Flex 卡片後（見 [ADR 0012](docs/adr/0012-command-list-flex-card.md)），部署後在真實 LINE（iOS、Android、電腦版）用一般成員和管理員各下一次 `@Dobby 指令`：標題照片與各列圖示有正常顯示；每一列、每顆按鈕按下去送出的指令文字正確，而且 bot 有照該指令回覆；一般成員看不到「管理員專用」區；管理員的「下一季公告草稿」送出的季度是下一季。**前置條件**：這批新增的圖示（`assets/flex/` 底下 `list-dark.png`、`*-light.png`、`search-gray.png` 等，commit `95ccacd`）要先推上 `main`、GitHub Pages 發布完成、網址回 200，才能部署程式，否則卡片會破圖。
- [ ] 欠費名單、本季報名人改用 Flex 名單卡後（見 [ADR 0013](docs/adr/0013-name-list-flex-card.md)），部署後在真實 LINE 各下一次 `@Dobby 欠`、`@Dobby 報名人`：徽章圖示有正常顯示、名單完整沒有被截斷（長名字要換行）、欠費卡的「付款資訊」按鈕按下去有回付款資訊；沒有人欠費時顯示「全部繳清」卡（用到既有的 `check-dark.png`）。**前置條件**：這批新增的圖示（`circle-dollar-sign-dark.png`、`users-dark.png`、`user-x-white.png`，commit `ee11d95`）要先推上 `main`、GitHub Pages 發布完成、網址回 200，才能部署程式，否則卡片會破圖。
- [ ] `@Dobby 付款` 改用 Flex 付款資訊卡後（見 [ADR 0014](docs/adr/0014-payment-flex-card.md)），部署後在真實 LINE（iOS、Android、電腦版）各下一次 `@Dobby 付款`，也從欠費名單卡的「付款資訊」按鈕點一次。要確認：信用卡徽章和「複製」按鈕的圖示有正常顯示；按「複製」後剪貼簿裡是 `20201800934932`，沒有多出空白或其他文字，LINE 有跳出已複製的提示；Line Pay Money、現金這兩格沒有按鈕；通知和 `/logs` 顯示的是 altText 純文字。如果手邊有 LINE 14.0.0 以下的舊版，也看一下按鈕按下去會怎樣。另外下一次 `@Dobby 公告`，確認「付款方式」底下是 `PAYMENT_V2` 的三種方式（一種一行），沒有出現 `{PAYMENT_V2}` 字樣。**前置條件**：新圖示 `credit-card-dark.png`、`copy-dark.png` 要先推上 `main`，GitHub Pages 發布完成、網址回 200 之後才能部署程式，否則卡片會破圖。
- [ ] `@Dobby 公告` 改用 Flex 公告卡後（見 [ADR 0015](docs/adr/0015-news-flex-card.md)），部署後在真實 LINE（iOS、Android、電腦版）各下一次 `@Dobby 公告`，也從指令清單卡的「最新公告」點一次。要確認：
  - 螢光綠徽章的擴音器圖示 `megaphone-dark.png` 有正常顯示。
  - 標題區左上角是當季季度（例如「2026 Q4（10~12月）」），副標題的人數、次數跟季租紀錄一致。
  - 每一段的小標是 Notion 的標題文字，段落之間有細線，沒有多出 `—`。
  - 報名名單、打球日期、「其他」的長句都完整換行，沒有被截斷。
  - 「付款資訊」按下去會回付款卡，「指令清單」按下去會回指令清單卡。
  - 通知和 `/logs` 顯示的是 altText 純文字公告。
  - 卡片第一段是「報名名單」。2026-10-01 已經從 Notion 刪掉模板開頭的 `{SEASON} {FROM_TO_MONTH}`，所以不會再出現一段沒有小標、跟標題區重複的季度。

  **前置條件（已完成）**：新圖示 `megaphone-dark.png` 已經推上 `main`（`e611673`），2026-10-01 確認 GitHub Pages 上的網址回 200，程式可以部署。
- [ ] 週報推播與 `@Dobby next` 改用 Flex 卡片後（見 [ADR 0011](docs/adr/0011-weekly-status-flex-card.md)），部署後在真實 LINE 群組看一次：可以用 `@Dobby next`（管理員身分）先看，不用等到週日 09:00 才知道卡片長怎樣，兩者輸出應該完全一樣。正常週要看：徽章灰底＋`calendar-check-dark.png`、標題「本週打球」、副標題「不能到請喊聲」（若當週場地數跟季預設不同，額外確認副標題變成「不能到請喊聲・本週 N 面場」、altText 場地行有「（本週調整）」）、底部三顆按鈕功能跟報名卡片一致。暫停週（Notion 行事曆該週活動狀態設「打球暫停」）要另外找一週測：確認徽章換成灰底＋`ban-dark.png`、標題「本週活動暫停」、右上剩餘名額／進度條與零打名單／請假／本週出席三段內文都不見了，內文改成一行灰字「本週因故暫停，恢復後另行公告」，底部沒有按鈕。

- [ ] `@Dobby season` 改成「一段純文字＋數張 Flex 卡」後（見 [ADR 0016](docs/adr/0016-season-announcement-flex-card.md)），部署後用管理員身分在真實 LINE（iOS、Android、電腦版）下一次 `@Dobby season 2026Q4`，也從指令清單卡的「下一季公告草稿」點一次。要確認：
  - 第一則是純文字（`NEWS_TEMPLATE` 的內容），長按可以複製、貼進 LINE 記事本後換行正常，人數、日期是指令指定那一季的。
  - 後面兩張卡片的標題是「中華科大 - 2026 Q4 (10~12月)」和「2026 Q4 費用說明」，擴音器徽章有正常顯示。版面跟 mockup（https://claude.ai/artifact/88WHEHW8c8V8htGL3wjSSe 最上面的「定案」）一致：第一張的數據格兩兩一列、場租佔滿一列、同一列的兩格等高；第二張的續打／新朋友／退費是螢光綠標籤、上季結餘佔半格，最底下的「付款方式」跟 `@Dobby 付款` 的付款卡長得一樣，按「複製」後剪貼簿是 `20201800934932`。手邊有 LINE 14.0.0 以下的舊版的話，也看一下轉傳後的季公告卡按「複製」會怎樣：這張卡會轉傳給全群組，碰到舊版的機會比 `@Dobby 付款` 多。大數字的前後綴（`$`、`個場`）跟數字在同一行，mention 名單長的時候有換行。
  - 續打費用 = 每人實際收費 − 上一季季打退費；退費、結餘是上一季的數字。
  - 卡片轉傳到群組後，其他人看到的跟原本一樣。
  - 只打 `@Dobby season` 會回「請指定季度」；把上一季的 `季打退費` 暫時清空再下一次，會回「季租承租紀錄還沒填」並列出那一欄（測完記得填回去）。
  - 通知和 `/logs` 顯示的是 altText 純文字。

  **部署之後**：程式已經不讀 Notion「所有公告」的舊 `PAYMENT` 頁面（只剩部署前的舊版在讀），確認正式環境跑的是新版後，就可以到 Notion 刪掉 `PAYMENT`。另外 `NEWS_TEMPLATE`「季打費用」那段的「(此金額為直接除以人數，並非真正的繳費金額)」要記得刪：`{PRICE_PER_PERSON_FOR_SEASON}` 已改成每人實際收費。

---

## 規劃中功能（尚未開發）

- [ ] **成就系統（含賽季彩蛋）** —— 規則見 [`docs/achievements-rulebook.md`](docs/achievements-rulebook.md)。目前只有遊戲規則，**沒有實作設計，也還沒排入開發**，不是急件。開工前要注意：
  - **可行性要重新分析。** 2026-09-27 曾對照當時的程式碼（commit `6e28250`）做過一次初步分析，但結論沒有寫進 repo，只留下規則書第 11 節的待確認事項。開工時程式碼一定已經改過，要用當下的程式碼從頭分析，不要假設當時的判斷還成立。
  - **先把規則書第 11 節的待確認事項定案。** 那幾項是規則本身互相矛盾，或定義不足以直接實作，不是實作細節，照目前的文字寫不出唯一正確的行為。
  - **規則書第 9 節列的 Notion 資料庫不是完整的實作清單。** 那一節只列出管理者要填的設定，成就解鎖紀錄、哪些打球週已結算、發話統計這類系統自己要存的狀態都沒列。重新分析時要另外盤點。
  - **規則要對照 `CLAUDE.md` 的專案慣例檢查**，特別是「回覆一律用 `replyMessage`」、Notion rate limit（約 3 req/s），以及「讀取 → 計算 → 寫回用 `withMutex`」。規則書的「不推播」「一則訊息只回覆一次」和這些慣例一致，但實作時每則群組訊息都要判定成就，要注意不能每則都打 Notion。

---

## 已知問題（尚未處理）

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
  - **發言數**：群組／多人聊天的**所有文字訊息**（不只指令，閒聊也算）重複送達都會讓 `trackUser` 多算 1；一對一聊天不追蹤（`handlers/message-handler.ts:59-64`）。新使用者的第一則訊息重複送達不會建出兩個 USERS 頁（鎖內一律重讀 USERS，`services/user-management.ts:95`），只會多算 1。
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
  - **測試**：寫在 `src/handlers/__tests__/event-router.test.ts`（那裡的 `handleMessage` 本來就是 mock），同一個 `webhookEventId` 送兩次，斷言 `handleMessage` 只被呼叫一次；另外測沒有 `webhookEventId` 的事件不會被去重。去重的 Map 在模組層級，測試之間會殘留，要提供重置函式（在 `beforeEach` 呼叫），或每個測試用不同的 ID。**不要用 `createTestBot` 測**：它的 `run()` 直接呼叫 `handleMessage`（`src/test-utils/create-test-bot.ts:219`），完全不經過 `processEvents()`，測不到去重；如果為了測試改成經過 `processEvents()`，`buildLineEvent` 把 `webhookEventId` 寫死成 `'evt-1'`（第 140 行），同一個測試檔裡第二次以後的 `run()` 會全部被當成重複吞掉。
  - 同步文件：`docs/architecture.md`「Fire-and-Forget Webhook 處理」小節（目前寫「本專案沒有開啟重送」，改完要一起更新），以及 `docs/logging.md` 對「起點」和事件種類／狀態的說明（新 log 行要寫進去）。

- [ ] **`truncateAltText()` 截斷 altText 時，可能把 emoji 切成半個字元。** `src/commands/flex-card-parts.ts:117-119` 用 `text.slice(0, ALT_TEXT_MAX - 1) + '…'`（`ALT_TEXT_MAX = 400`，第 114 行）截字。`slice` 和 `.length` 算的是 UTF-16 code unit，不是字。🏸、🎉 這類 emoji 佔 2 個 code unit（surrogate pair），如果第 399 個 code unit 剛好是某個 emoji 的前半，截完的結尾就會是「孤立的前半個 surrogate＋…」。2026-10-01 實測 `truncateAltText('a'.repeat(398) + '🏸' + 'b'.repeat(10))`，結尾是 `"a\ud83c…"`。

  **算是潛在 bug，但不會讓訊息送不出去。** 同一天把這個 altText 送到 LINE validate API（`POST /v2/bot/message/validate/reply`），回 200：`JSON.stringify` 會把孤立的 surrogate 轉成 `\ud83c` 跳脫字元，LINE 也接受。影響只在顯示：LINE 通知、聊天列表預覽、`/logs` 看到的 altText 結尾，可能多一個亂碼字元（通常是 �），出現在「…」前面。實際在手機上長什麼樣子還沒驗證過。卡片本身不受影響，因為卡片內容不經過 `truncateAltText`。

  **現在沒發生的原因，以及什麼情況會碰到：** 要同時符合兩個條件：altText 超過 400 個 code unit，而且第 399 個剛好落在 emoji 的前半。
  - **公告（`src/commands/news.ts:203`）最容易碰到。** 正式的 `NEWS_TEMPLATE` 光模板（變數還沒代入）就有 582 字，所以每次都會截斷。2026-10-01 模板裡沒有任何 emoji，所以現在不會發生。但只要管理員在 Notion 的前 400 字附近加一個 emoji，或 `{LIST_ALL_PEOPLE}` 名單裡有人的名字帶 emoji，就可能剛好切到。
  - **報名／請假狀態卡**（`src/commands/registration/flex-status-card.ts:362`、`:377`）：altText 列出零打名單和請假名單，名字常是 LINE 顯示名稱，比較可能帶 emoji，但要零打很多人才會超過 400 字。
  - **其他呼叫端**：`payment.ts:32`、`owe.ts:38`、`participants.ts:38`、`command-list-card.ts:220`。名單要很長才會超過 400 字。程式裡寫死的 emoji（`owe.ts:14` 的 🎉、`command-list-card.ts:210` 的 🛠️）都在短字串開頭，碰不到截斷點。

  如果要處理：
  - 改 `truncateAltText()` 這一個地方就好，所有呼叫端會一起修好。最小的改法是截完之後，如果最後一個字元是前半個 surrogate（`/[\uD800-\uDBFF]$/`），就把它去掉再補「…」。也可以改用 `Array.from(text)` 依 code point 計數和截斷。
  - **依 code point 截斷，還是可能把組合 emoji 拆開。** 例如 👨‍👩‍👧 這種用 ZWJ 串起來的家庭 emoji、膚色修飾、國旗。拆開不會變亂碼，只會顯示成幾個分開的 emoji 或不完整的組合。要完全不拆開，得用 `Intl.Segmenter` 依字素（grapheme）切，Node 有內建，但對 altText 來說可能不值得。
  - **長度上限不要改。** 400 是改 Flex 前就沿用的上限，不是 LINE 的上限（LINE altText 上限是 1500）。改成依 code point 計算時，要確認截完的 `.length`（UTF-16）仍然不超過 400；結尾去掉半個 surrogate 的做法，會讓結果變成 399 個 code unit。
  - **既有測試**：`src/commands/registration/__tests__/flex-status-card.test.ts:367` 斷言 `altText.length` 剛好是 400，用的是沒有 emoji 的文字，應該不受影響。另外補一個 emoji 剛好落在截斷點的測試，斷言結果不含孤立的 surrogate。

---

## 程式碼整理與小改善（非 bug，低優先）

- [ ] **mutex 用完清理 `queues`／`inFlight` 的程式沒有任何測試保護，其中一行改壞會讓報名／請假失去互斥。**（2026-10-04 刪除 `isLocked()` 時 code review 發現，是既有缺口）

  不是 bug：`src/services/mutex.ts` 第 81 行起的 `void tail.then(...)` callback，前段（第 82-88 行）負責清理，目前寫法正確。缺口在測試：2026-10-04 實測把下面三種改法分別套上去，整個 `npx vitest run --dir src`（836 個，含用真 mutex 的 `registration-concurrency.test.ts`、`user-management.test.ts`）全部照樣通過。
  1. **拿掉第 82 行的守衛**，`if (queues.get(key) === tail) queues.delete(key);` 變成無條件 `queues.delete(key)`。**這會造成真的 race**：A 執行中、B 排在後面時，A 結束會把 B 的 entry 刪掉；B 執行期間進來的新呼叫 C 讀到 `queues.get(key)` 是 undefined，不等 B 就直接跑。兩個「讀取 → 計算 → 寫回」同時進行：報名／請假（key 是活動日期）可能互相覆蓋寫入；`trackUser`（`src/services/user-management.ts:93`，key 是 `user-track-${userId}`）的 `message_counts` 是整個值覆寫，同樣會被蓋掉。已用暫時測試驗證，突變後順序是 `a-start, a-end, b-start, c-start`，C 在 B 結束前就開始了。
  2. **整行刪掉**（`queues` 永不清理）：功能不受影響，只是記憶體洩漏，每個用過的 key 留一個已完成的 promise。key 是活動日期（每週一個）和 `user-track-${userId}`（每個發過言的人一個），量很小。
  3. **`inFlight` 不減一**（第 83-88 行）：功能不受影響，但 `Mutex task finished` 摘要和逾時 warn 裡的 `queuedAhead` 會一直累加，變成假的「前面還有 N 個任務」，用 `/logs` 判讀排隊情形時會被誤導。

  為什麼現有測試抓不到（都在 `src/services/__tests__/mutex.test.ts`）：
  - 排隊的測試（key3、key5、key6、key7）都在任何任務結束前就把所有呼叫排好，碰不到「前面的任務結束、清理跑完之後才進來新呼叫」的時序。
  - key8 的註解寫著 queues-cleanup-must-follow-tail，但它前面只有一個任務、沒有第三個呼叫，第 82 行的守衛有沒有都會過。
  - 任務結束後重用同一個 key 的測試（key2、key4）當下沒有其他任務在排隊，守衛有沒有都一樣，而且只斷言回傳值，沒看 `queuedAhead`。
  - 以前的 `isLocked()` 斷言驗的是已刪除的 `pending`，本來就沒涵蓋。

  風險情境：之後有人「簡化」這段（例如覺得 `=== tail` 多餘），測試全綠，正式環境卻偶發報名重複寫入或漏寫，非常難追。

  如果要處理（**只補測試，不用改 `mutex.ts`**）：
  - 加在 `src/services/__tests__/mutex.test.ts`，用真的 mutex，不要 mock。模組層級的 `queues`／`inFlight` 會跨測試保留（沒有 `resetModules`），每個新測試都要用同檔沒用過的 key。
  - **情況 1 最值得補**，放在最外層的 `describe('mutex')`，**不能**放進 `describe('task summary log')`：那裡的 `beforeEach` 開了 fake timers，`setImmediate` 會永遠不觸發。寫法：A、B、C 各用一個 gate promise 控制結束時機，用 `order` 陣列記錄開始／結束；A、B 排隊 → 放行 A 並 `await` 它 → B 還卡著時呼叫 C → **呼叫 C 之後先 `await new Promise((r) => setImmediate(r))` 再斷言** `order` 裡沒有 `c-start`（同檔 key3 測試第 38-39 行的做法）→ 最後放行 B、C。陷阱：呼叫 C 之後若沒等就同步檢查 `order`，突變版的 C 也還沒開始執行，測試會永遠綠燈。
  - **情況 3**：不用匯出內部狀態，從 `Mutex task finished` 摘要看就行。同一個 key 先跑完一個任務，再呼叫一次，斷言第二次摘要的 `queuedAhead` 是 0。放進 `describe('task summary log')`，用它的 `summaryCalls()`；推進時照同區塊其他測試用 `await vi.advanceTimersByTimeAsync(0)`，不要用 `setImmediate`（fake timers 預設連它也換掉）。key 要用日期格式才會記在 info，非日期 key 記在 debug（`INFO_SUMMARY_KEY`，`mutex.ts:16`）；同區塊已用掉 `2026-10-03`～`2026-10-10`。
  - **情況 2 可以不測**：只能看內部 Map 的大小，得為測試匯出狀態（例如 `__mutexKeyCountForTests()`）。正式模組為了測試加 export 有代價，洩漏量又很小。

- [ ] **`message-handler.ts` 的「指令解析失敗」分支永遠走不到。** `src/handlers/message-handler.ts:66-69` 的 `if (!command)`（記 debug `Message looks like command but failed to parse` 後 return）不會執行：`isCommand()`（`src/commands/command-parser.ts:98-100`）就是 `text.startsWith('@Dobby')`，而 `parseCommand()` 只在「不是 `@Dobby` 開頭」時回 `null`（第 12 行），其餘至少回 `{ type: CommandType.UNKNOWN }`（第 95 行）。所以 `Message classified` 的 `parsed` 永遠是 `true`，打錯的指令會以 `commandType: 'unknown'` 進 `routeCommand`、被靜默忽略，`/logs` 顯示成「指令／警告」、「來自」`unknown`（2026-09-28 本機 reqId `d8dad6` 的 `@Dobby hello` 實測）。

  不是 bug，行為正確，只是死碼加上幾處為它寫的顯示邏輯。不處理也沒有風險；風險只在之後有人改 `parseCommand()` 讓它對某些 `@Dobby` 開頭的文字回 `null` 時，這些分支才會突然「活過來」，所以處理時要決定是刪掉還是保留當防禦。

  如果要處理：
  - 相關的地方要一起看：`message-handler.ts:37` 的 `parsed: command !== null`、`src/routes/logs.ts:478-481`（舊 log fallback 認 `Message looks like command but failed to parse`）、`logs.ts:635`（`parsed === false` 時「來自」顯示「（指令解析失敗）」）、`docs/logging.md` 第 39、45、49、60 行的說明，以及 `src/routes/__tests__/logs.test.ts` 裡用到 `failed to parse`／`parsed: false` 的測試。
  - **`logs.ts:478-481` 的舊 log fallback 不能刪**：`/logs` 會讀本機保留 7 天、R2 備份的舊 log 檔，裡面可能有這行。
  - 如果改成保留分支，可以考慮讓 `parseCommand()` 的型別不回 `null`（呼叫端先確認 `isCommand()`），讓 TypeScript 直接擋掉這個分支；如果刪掉，`Message classified` 的 `parsed` 欄位要一起決定去留（`logs.ts:635` 在讀它）。

- [ ] **`/logs`「起點」那一步的摘要沒顯示 `lagMs`。** `src/handlers/event-router.ts` 的 `Processing event` 從 2026-09-28 起帶 `lagMs`（事件發生到 Pi 開始處理的毫秒數，定義與判讀限制見 `docs/logging.md`「起點」那段），但 `src/routes/logs.ts:866-903` 的 `startStepTimeline()` 組 note 時只放訊息內容、事件類型、來源、`webhookEventId` 和 `isRedelivery`，沒有 `lagMs`，要點開「起點」看原始 JSON 才看得到；`?format=text` 也沒有。`docs/logging.md` 已經寫明「目前沒有顯示在起點的摘要文字裡」。

  不是 bug，只是不方便。如果要處理：在 note 加一段（例如「延遲 246ms」），舊 log 沒有這個欄位時不要顯示。**負值是正常的**（Pi／容器時鐘偏差，本機實測看過 -302），不要當成錯誤標紅；重送事件（`isRedelivery`）的值本來就很大，搭配既有的黃色重送提示看。改完要同步 `docs/logging.md` 那句「目前沒有顯示」，`logs.test.ts` 有起點 note 的測試可以參考。

---

## 已評估、不採納

已移到 [`docs/rejected-proposals.md`](docs/rejected-proposals.md)。提出重構、效能優化、新機制之前，先 grep 那份確認沒被否決過。

---

## 效能觀察（從真實 `logs/` 分析發現，尚未處理）

已移到 [`docs/performance-observations.md`](docs/performance-observations.md)（`findByPageIds` 逐筆查詢、回覆訊息在鎖內組、Notion 長尾造成連鎖逾時等）。要處理效能或改到 Notion 呼叫模式時再讀。

---
