# TODO

> 時區：Asia/Taipei ｜ 季度定義：Q1=1~3月, Q2=4~6月, Q3=7~9月, Q4=10~12月
>
> 完成且有文件記錄的項目直接刪除（機制細節在 `docs/`、`docs/adr/`）。已否決的提案見 `docs/rejected-proposals.md`，效能待辦見 `docs/performance-observations.md`。

---

## 手動測試追蹤（ngrok 接真實 LINE 帳號測試）

> 測完通過就直接刪掉該項，結論寫進 commit message，值得留的觀察在對應 ADR 加一兩句，不要把整段實測紀錄貼進來。有問題時才在該項下方貼機器人實際回應（code block，保留換行），加「備註：」說明差異。
>
> **Flex 卡共通檢查**（下面每個 Flex 項目都要看，各項只列額外重點）：iOS、Android、電腦版各看一次；標題照片與徽章／按鈕圖示正常顯示；按鈕送出的指令文字正確、bot 有照該指令回覆；推播通知和 `/logs` 顯示的是 altText 純文字（不是卡片 JSON 或空白）。所用圖示 2026-10-05 已確認 `https://wen-hsiu-hsu.github.io/dobby/flex/` 全部回 200。

- [ ] 全形 `＋`/`－` 符號 —— 程式碼已支援（`normalizeFullWidth()`），實際傳一次 `@Dobby ＋1` 驗證即可，不用改 code
- [ ] 第一次正式 `display-name-update`（2026-09-28 週一 04:00）—— 到 `/logs` 排程分頁確認有跑完、更新筆數合理。USERS `groups` 殘留測試群組 ID 造成的 404 是預期的（見 `docs/overview.md`「從 n8n 遷移」）；2026-09-29 已清掉無關群組 ID，之後應少很多
- [ ] 「報名／請假沿用 message-handler 的 USERS 快照＋Season 並行查」部署後（[ADR 0009](docs/adr/0009-actor-users-snapshot-non-null-only.md)），到 `/logs` 看既有使用者在群組的 `+N`／`假`：時間軸只剩一次 USERS query；`resolveTarget` 的 People GET 和 Season query 起點幾乎相同。背景那筆 `GET /pages/<USERS 頁>` 是 `trackUser` 鎖內重讀（[ADR 0017](docs/adr/0017-track-user-always-rereads-inside-lock.md)），預期中。基準：改前成功的 `±N` 中位數 3.3 秒，預估 2.4～2.5 秒；沒達到不是 bug，記下實測數字即可。群組新使用者首次指令、一對一私訊仍查兩次 USERS，是預期的
- [ ] Pi `/logs` footer 的「R2 備份」徽章：確認 R2 同步有啟用、最近一次成功（徽章語意見 `docs/logging.md`）。本機 log 只留約 7 天，季末對帳要靠 R2（`/logs` 讀不到 R2，要下載後用 `jq` 查）
- [ ] 報名／請假 Flex 卡（[ADR 0010](docs/adr/0010-registration-status-flex-card.md)）：另加深色模式；文字疊在照片上仍清楚（深淺色漸層遮罩都看）；底部三顆按鈕 `+1 零打`／`−1 零打`／`請假`
- [ ] 指令清單 Flex 卡（[ADR 0012](docs/adr/0012-command-list-flex-card.md)）：一般成員和管理員各下一次 `@Dobby 指令`，每列、每顆按鈕都按過；一般成員看不到「管理員專用」區；「下一季公告草稿」送出的是下一季
- [ ] 欠費名單／本季報名人 Flex 卡（[ADR 0013](docs/adr/0013-name-list-flex-card.md)）：`@Dobby 欠`、`@Dobby 報名人` 名單完整、長名字換行；欠費卡「付款資訊」按鈕回付款卡；沒人欠費時顯示「全部繳清」卡
- [ ] 付款資訊 Flex 卡（[ADR 0014](docs/adr/0014-payment-flex-card.md)）：`@Dobby 付款` 和欠費卡的「付款資訊」各一次；按「複製」後剪貼簿是 `20201800934932`、無多餘字元、LINE 有已複製提示；Line Pay Money、現金沒有按鈕；有 LINE 14.0.0 以下舊版的話看按鈕行為。另下一次 `@Dobby 公告`，「付款方式」是 `PAYMENT_V2` 三種（一行一種），沒有 `{PAYMENT_V2}` 字樣
- [ ] 公告 Flex 卡（[ADR 0015](docs/adr/0015-news-flex-card.md)）：`@Dobby 公告` 和指令清單卡「最新公告」各一次
    - 標題區是當季季度（例如「2026 Q4（10~12月）」），副標題人數、次數跟季租紀錄一致
    - 第一段是「報名名單」（模板開頭的季度段已於 2026-10-01 從 Notion 刪除）；小標是 Notion 標題文字，段落間有細線、沒有多出 `—`
    - 報名名單、打球日期、「其他」長句完整換行
    - 「付款資訊」回付款卡，「指令清單」回指令清單卡

- [ ] 週報推播／`@Dobby next` Flex 卡（[ADR 0011](docs/adr/0011-weekly-status-flex-card.md)）：用管理員下 `@Dobby next` 即可，輸出應跟週日 09:00 推播一樣
    - 正常週：灰底徽章＋`calendar-check-dark.png`、標題「本週打球」、副標題「不能到請喊聲」；當週場地數與季預設不同時副標題變「不能到請喊聲・本週 N 面場」、altText 場地行有「（本週調整）」；底部按鈕跟報名卡一致
    - 暫停週（Notion 行事曆活動狀態設「打球暫停」）：灰底＋`ban-dark.png`、標題「本週活動暫停」；剩餘名額／進度條與三段內文都不見，改成一行灰字「本週因故暫停，恢復後另行公告」；沒有按鈕

- [ ] `@Dobby season` 純文字＋Flex 卡（[ADR 0016](docs/adr/0016-season-announcement-flex-card.md)）：管理員下 `@Dobby season 2026Q4`，也從指令清單卡「下一季公告草稿」點一次
    - 第一則是純文字（`NEWS_TEMPLATE`），長按複製貼進 LINE 記事本換行正常，人數、日期是指定那一季
    - 兩張卡標題「中華科大 - 2026 Q4 (10~12月)」「2026 Q4 費用說明」。版面對照 mockup（https://claude.ai/artifact/88WHEHW8c8V8htGL3wjSSe 最上面「定案」）：第一張數據格兩兩一列、場租佔滿一列、同列等高；第二張續打／新朋友／退費是螢光綠標籤、上季結餘佔半格，底部「付款方式」跟付款卡一樣、「複製」得到 `20201800934932`。大數字前後綴（`$`、`個場`）與數字同行，長 mention 名單有換行
    - 續打費用 = 每人實際收費 − 上一季季打退費；退費、結餘是上一季的數字
    - 轉傳到群組後其他人看到的一樣；有 LINE 14.0.0 以下舊版的話看轉傳卡的「複製」（這張會轉傳全群組，碰到舊版機會較多）
    - 只打 `@Dobby season` 回「請指定季度」；暫時清空上一季 `季打退費` 再下一次，回「季租承租紀錄還沒填」並列出該欄（測完填回去）

    **部署之後**：確認正式環境跑新版後，到 Notion 刪掉「所有公告」的舊 `PAYMENT` 頁面（新版已不讀）；並刪掉 `NEWS_TEMPLATE`「季打費用」段的「(此金額為直接除以人數，並非真正的繳費金額)」（`{PRICE_PER_PERSON_FOR_SEASON}` 已改成每人實際收費）。

---

## 規劃中功能（尚未開發）

- [ ] **成就系統（含賽季彩蛋）** —— 規則見 [`docs/achievements-rulebook.md`](docs/achievements-rulebook.md)。只有遊戲規則，**沒有實作設計、未排入開發**，不是急件。開工前要注意：
    - **可行性要用當下程式碼重新分析。** 2026-09-27 對照 commit `6e28250` 做過初步分析，結論沒寫進 repo，只留下規則書第 11 節的待確認事項；不要假設當時的判斷還成立。
    - **先把規則書第 11 節的待確認事項定案。** 那些是規則本身矛盾或定義不足，照目前文字寫不出唯一正確行為，不是實作細節。
    - **規則書第 9 節不是完整的資料庫清單。** 只列管理者要填的設定；成就解鎖紀錄、已結算的打球週、發話統計等系統狀態都沒列，要另外盤點。
    - **對照 `CLAUDE.md` 慣例**：`replyMessage`、Notion rate limit（約 3 req/s）、讀取 → 計算 → 寫回用 `withMutex`。每則群組訊息都要判定成就，不能每則都打 Notion。

---

## 已知問題（尚未處理）

- [ ] **`src/routes/__tests__/logs.test.ts` 跑整套測試時偶發逾時，一次掛 2～12 個。**（2026-10-04 發現，還沒分析）
    - 現象：`npx vitest run --dir src` 跑約 15 次，有 3 次這支檔案的測試超過 vitest 預設 5 秒逾時（`Error: Test timed out in 5000ms`），每次掛的不一樣，例如第 1123 行 `shows a short request-body summary…`、第 1020 行 `shows lagMs in the 起點 step note…`、第 1037 行 `renders a service-restart boundary marker…`。單獨跑這支（83 個測試）約 0.34 秒，從沒失敗。同一天另有一次 `src/__tests__/logs-auth.test.ts` 的 `GET /logs > accepts requests with the correct Bearer token` 失敗（也打 `/logs`，失敗訊息沒保留），可能是同一問題。
    - 不是產品 bug，`/logs` 頁面本身沒問題，只影響測試結果可信度。發現當時的改動（反向 relation 查詢）沒碰 `src/routes`；這支檔案最近一次改動是 commit `f75a27d`。應該是原本就有的問題，但沒在更早的 commit 上重現確認。
    - 推測一（沒驗證）：整套平行跑時負載高，每個測試都用 supertest 起新的 express app（第 92-124 行 `getLogsHtml`／`getEventDetailHtml`／`getLogsText`），偶爾超過 5 秒。
    - 推測二（沒驗證）：連鎖失敗。這支檔案沒有 `beforeEach`／`afterEach` 重設 mock，很多測試用 `vi.mocked(readRecentLogs).mockResolvedValueOnce(...)` 疊加假資料（第 100-107 行註解有疊加規則）。一個測試逾時，沒被消耗的 Once mock 會留給後面的測試，後面拿到錯的資料而失敗。
    - 如果要處理：先在更早的 commit 跑整套確認是否原本就有；再看失敗是「逾時」還是「斷言失敗」以分辨兩個推測。陷阱：不要只把 `testTimeout` 調大，推測二成立的話殘留 Once mock 仍會造成連鎖失敗。加 `beforeEach` 重設 mock 時注意檔案開頭 `vi.mock('../../utils/log-reader.js', ...)` 有一組預設假資料（第 13-87 行），很多測試依賴它，`vi.resetAllMocks()` 會清掉，要改用只清 Once 佇列的做法，或在 `beforeEach` 重設預設值。
