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

- **表格驅動指令解析與路由**（`/improve-codebase-architecture` 報告候選 3，Speculative）— 評估後不採納。理由：(1) 各 command handler 簽名不一致（7 種不同形狀，從 `(replyToken, botId)` 到 `(event, delta, botId, isAdmin)`），單一表格 row 形狀塞不下這些差異；(2) 報告自己也承認 deletion test 不明確，拆掉 `command-parser.ts`/`command-router.ts` 可能只是把 switch 搬位置，不會真正集中複雜度；(3) 唯一有具體壞味道支撐的症狀（courtOverride 解析邏輯被拆到兩個 module）已隨 `next?c=N` what-if 預覽功能整個移除而不復存在，不只是修好。若未來新增指令的頻率明顯提高、且 handler 簽名先被拉齊，可重新評估。
- **[1.2] `people-repository.ts`/`season-repository.ts` 查詢分頁處理** — 評估後不採納。目前社團規模（未結清人數、season 數）遠低於 Notion 單頁 100 筆上限，此狀況實務上不會發生，不需為此增加分頁邏輯的複雜度。
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
  - `participants.ts:18`：推估 1＋N 次呼叫（N≈11 位季租成員），約 7 秒。log 裡沒有這個指令，數字是用單次 GET 約 280ms＋sleep 400ms 推算的。
  - `news.ts:179-180`：實測 2 次，都是 29 次呼叫（11 次姓名 GET＋13 次活動 GET＋5 次其他），耗時 11.3 和 11.7 秒。兩組 GET 各自拖了 7～9.5 秒，其中 sleep 約佔各組的 55～60%，約佔整個指令的 40%。兩組用 `Promise.all`（`news.ts:177-182`）同時跑，平均合計約 2.5～3 req/s，任 1 秒窗口瞬間最多 4 個 GET，靠 Notion 容許的短暫突發撐住，沒有出現 429。以上是 2026-10-01 前的實測；之後同一個 `Promise.all` 多跑 `loadPaymentText()`（讀 `PAYMENT_V2`：1 次 query＋2 次 blocks GET，集中在開頭約 0.5 秒），開頭的瞬間請求數會再多一點。它失敗時只降級付款那段，不會讓整則公告失敗。
  - `season-announcement.ts:261-262`：管理員專用（產生新一季公告），頻率很低，優先度比 news／participants 更低。2026-10-01 起同一個 `Promise.all` 多讀 `NEWS_TEMPLATE` 的區塊和 `loadPaymentPage()`（讀一次 `PAYMENT_V2`，純文字和卡片的付款區塊共用），開頭同時發出的請求又多了幾個；`{NEW_SEASON_NEWS}` 的報名名單沿用這裡查到的人員資料，沒有再查一次。
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
    - 成員超過 100 位要處理分頁，寫法參考 `users-repository.ts:67-84` 的 `findAll`。
  - **備案：People DB 全表建 `pageId → name` 的 in-memory Map（TTL 約 10 分鐘）。** 對整季名單的效益跟首選差不多，但多了下面的快取陷阱。它的範圍比首選大：`請假人` 是單向 relation，沒有反向欄位可篩，只有快取能加速鎖內的請假人姓名查詢（`event-status-message.ts:30`），等於順便處理下面「回覆訊息在鎖內組」那一項。只有在想一起處理那一項時才值得考慮。新 LINE 使用者自動建立的 People 頁面（見 `docs/notion/databases.md` 第 49 行）不在快取裡，要走 miss 路徑逐筆 GET。

  已知陷阱：
  - **query 回來的順序跟 relation 順序不同。** participants 的編號、news 的名單順序都依賴 `season.members` 的順序，要照它重排。日期那邊 `groupDatesByMonth` 本來就會排序，不受影響。
  - **打球日的查詢結果不能拿去算名額。** Calendar query 回來的是完整 `CalendarEvent`，內含 `guests`／`absentees`。在鎖外查到的這份只能用在公告列日期，算名額一律照 [ADR 0001](docs/adr/0001-explicit-fresh-calendar-event-wrapper.md) 在鎖內重讀。
  - **若走快取備案，不要快取整個 `PersonRecord`。** 它帶有 `hasPaid`（`結清` formula，`people-repository.ts:13`）。目前全 repo 沒有其他地方讀 `hasPaid`（`owe` 走 `findAllUnpaid`），所以現在不會出錯。風險在之後：有人從快取讀 `hasPaid`，會拿到最多 TTL 前的繳費狀態，而且不會有任何錯誤訊息。快取只存 name，或在型別上分開。
  - **若走快取備案，快取是 module 層級狀態，測試之間會殘留。** 要提供 reset 函式，在測試檔的 `beforeEach` 呼叫。**不要**在 `src/test-utils/setup.ts` 用靜態 import 引入：那支檔案只負責在任何 module 載入前設定 env var，靜態 import 會被 hoist 到 env 設定之前，讓 `env.ts` 驗證失敗，也可能讓測試檔對 `notion-fetch.js` 的 `vi.mock` 失效。
  - **測試 fixture：** `create-test-bot.ts:74-86` 的 `routePost` 只依 DB ID 回 fixture、不看 filter，改用 DB query 後現有 fixture 大多可以直接用。另外 `routeGet` 的 `/pages/:id`（第 101-113 行）先在 users fixture、再在 people fixture 找同 id 的頁面，都找不到就回 people 第一筆，所以現在測試裡 calendar 的 `findByPageIds` 拿到的其實是 people 頁面。改成 calendar query 後反而更正確，但既有斷言可能要跟著調整。

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

- [ ] **一次 Notion 寫入卡 43 秒，同一天的報名／請假全部連鎖逾時；另外發現進鎖順序不等於送出順序。**（2026-10-04 測試環境實測，本機 `logs/app.2026-10-04.1.log`）

  經過：同一人在群組快速連送兩輪 `+1`、`-1`、`假`、`銷假`，共 8 則，全部收到逾時訊息「處理時間較長，這次操作可能已經完成，請勿重複操作」（`with-fresh-calendar-event.ts:12`）。
  - 起因是第一則 `+1`（reqId `a7d55c`，17:46:22）寫零打名單的 PATCH 花了 **43.2 秒**。這段時間沒有 429，也沒有重試，同時段其他 Notion 呼叫都在 0.4～0.5 秒。完全相同的 payload 在同一頁寫過十幾次都約 0.5 秒，所以不是「零打」多選欄位新增選項造成的，是 Notion 端偶發的慢回應。本機 log 共 1,378 次 Notion 呼叫：中位數 0.39 秒，p99 2.4 秒，超過 10 秒的只有 2 次，這次是最大值。
  - 其餘 7 則都鎖在同一個 key（活動日期 `2026-10-10`），排在它後面，等滿 10 秒（`mutex.ts:9` 的 `TIMEOUT_MS`）就收到逾時訊息。第二輪（17:47:01～04）進來時第一輪還有 3 個任務在排隊，所以也各等了 11～13 秒（`waitMs` 11001～13443）。第二輪如果沒有這些積壓，4 個任務每個佔鎖 1.4～2.3 秒，不會逾時。
  - 背景寫入照 FIFO 全部完成，兩輪都是一加一減，最後狀態跟操作前一樣，資料正確。背景完成後送出的回覆全部 `Reply failed`（400），這是預期的，replyToken 已經被逾時訊息用掉了（[ADR 0002](docs/adr/0002-mutex-timeout-does-not-cancel-task.md)）。

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

---
