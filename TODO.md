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

- [ ] **`src/routes/__tests__/logs.test.ts` 跑整套測試時偶發逾時，一次掛 2～12 個。**（2026-10-04 發現，還沒分析）
  - 現象：`npx vitest run --dir src` 跑約 15 次，有 3 次這支檔案的測試超過 vitest 預設的 5 秒逾時（`Error: Test timed out in 5000ms`），每次掛的測試不一樣，例如第 1123 行的 `shows a short request-body summary…`、第 1020 行的 `shows lagMs in the 起點 step note…`、第 1037 行的 `renders a service-restart boundary marker…`。其他次都是全過。單獨跑這支檔案（83 個測試）只要約 0.34 秒，從沒失敗過。同一天另有一次是 `src/__tests__/logs-auth.test.ts` 的 `GET /logs > accepts requests with the correct Bearer token` 失敗（也是打 `/logs` 路由，失敗訊息沒保留，不確定是不是逾時），可能是同一個問題。
  - 不是產品 bug，`/logs` 頁面本身沒問題，只影響測試結果的可信度。發現當時的改動（反向 relation 查詢）沒碰 `src/routes`；這支檔案最近一次改動是 commit `f75a27d`（起點摘要顯示 lagMs）。所以應該是原本就有的問題，不是那次造成的，但沒有在更早的 commit 上重現確認。
  - 推測一（沒驗證）：整套測試平行跑時機器負載高，每個測試都用 supertest 起一個新的 express app（第 92-124 行的 `getLogsHtml`／`getEventDetailHtml`／`getLogsText`），偶爾超過 5 秒。
  - 推測二（沒驗證）：一次掛好幾個，可能是連鎖失敗。這支檔案沒有 `beforeEach`／`afterEach` 重設 mock，很多測試用 `vi.mocked(readRecentLogs).mockResolvedValueOnce(...)` 疊加假資料（第 100-107 行的註解有說明疊加規則）。如果一個測試逾時，它還沒被消耗掉的 `mockResolvedValueOnce` 會留給後面的測試，後面的測試就拿到錯的資料而失敗。
  - 如果要處理：先在更早的 commit 上跑整套測試確認是不是原本就有；再看失敗的測試是「逾時」還是「斷言失敗」，以分辨上面兩個推測。陷阱：不要只把 `testTimeout` 調大了事，如果推測二成立，殘留的 Once mock 還是會在其他情況造成連鎖失敗。加 `beforeEach` 重設 mock 前要注意，檔案開頭的 `vi.mock('../../utils/log-reader.js', ...)` 有一組預設假資料（第 13-87 行），很多測試依賴它，`vi.resetAllMocks()` 會把它清掉，要改用只清 Once 佇列的做法，或在 `beforeEach` 重新設定預設值。

---

## 程式碼整理與小改善（非 bug，低優先）

目前沒有。

---

## 已評估、不採納

已移到 [`docs/rejected-proposals.md`](docs/rejected-proposals.md)。提出重構、效能優化、新機制之前，先 grep 那份確認沒被否決過。

---

## 效能觀察（從真實 `logs/` 分析發現，尚未處理）

已移到 [`docs/performance-observations.md`](docs/performance-observations.md)（Notion 長尾造成連鎖逾時、狀態卡重複查本人姓名等）。要處理效能或改到 Notion 呼叫模式時再讀。

---

