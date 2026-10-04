# 報名／請假用號碼牌閘門，照收到訊息的順序進鎖

> 後續變更：見 [ADR 0020](0020-pre-lock-read-cache.md)（進鎖前的查詢多半命中讀取快取，閘門很少需要真的等前一號；閘門仍保留）

社團要求報名「先送先報」：名額只剩幾個時，先送出的人要先拿到。`withMutex`（`src/services/mutex.ts`）是 FIFO，但排的是「呼叫 `withMutex` 的先後」。進鎖前還有一段 Notion 查詢：`message-handler.ts` 查 USERS，handler 再並行查對象（`resolveTarget`）和季資料。全新使用者還要等 `trackUser` 建頁。這段每則要 0.8～2.2 秒，所以實際上是誰先查完誰先進鎖。2026-10-04 測試環境實測過同一人的 `-1` 和 `假` 順序對調（見 `docs/performance-observations.md` 的 43 秒寫入那條）。

`src/services/entry-gate.ts` 在 mutex 前面加了一道閘門：

- `message-handler.ts` 判斷是 `+N`／`-N`／`假`／`銷假` 之後、查 USERS 之前，用 `withEntryTicket(活動日期, event.timestamp, …)` **同步**拿號碼。四種指令共用同一條序列：都鎖同一個日期 key，`-N`／`假` 會釋出名額，`銷假` 會佔回名額，都會影響排在後面的人。
- 拿完號碼後，查詢照常並行跑。`withFreshCalendarEvent` 要呼叫 `withMutex` 時，用 `enterInOrder` 等前面的號碼都「已進場」（呼叫過 `withMutex`，或已經提早結束），再呼叫 `withMutex`，**呼叫之後立刻同步**放行下一號。`withMutex` 在第一個 await 之前就會執行 `queues.set`，所以呼叫回傳的當下已經排進佇列。
- 平常多出的延遲接近 0。只有前一號比較慢的時候（新使用者、Notion 偶發慢），後面的人才要等，而這正好是原本會對調順序的情況。

## 不要改成的寫法

- **一收到訊息就取 mutex**：會把 0.8～2 秒的查詢搬進鎖內，佔鎖時間約加倍，搶報時更多人會碰到 10 秒逾時。閘門只排序進場時機，不排序查詢。
- **在 `withEntryTicket` 的 `finally` 才放行**：要等整個 mutation 和回覆都跑完才放行，所有請求會排成一條，比上一種還慢。`finally` 只當作提早結束時的保險（message-handler 查 USERS 失敗、parse error、非管理員、查無對象、查無季資料、不是季租成員、handler 的查詢 throw，這些路徑都不會走到 `enterInOrder`）。這些路徑要等 `replyMessage` 回來才放行，後面的人最多多等一次 LINE 回覆（約 0.1～0.3 秒）；為了不在每個分支手動放行，接受這個代價。
- **把閘門塞進 `mutex.ts` 的 `queues`**：閘門管的是「誰先呼叫 `withMutex`」，mutex 管的是「誰先執行」，混在一起會讓 [ADR 0002](0002-mutex-timeout-does-not-cancel-task.md) 的佇列保證難以推理。
- **提早結束的號碼直接標成完成**：第 n 號提早結束時，要先等第 n−1 號，才能算自己完成（`done = turn.then(() => released)`）。否則第 n+1 號會插到還沒進場的第 n−1 號前面。`entry-gate.test.ts` 有測這個時序。

## 等待上限

`notion-fetch.ts` 沒有請求逾時，只有 undici 預設的 300 秒。前一號的查詢卡住，不能拖住後面所有人，所以每號從拿號碼起最多等 5 秒，超過就進場，並記 warn `Entry gate wait capped; entering out of order`。這是唯一會打破順序的退路。上限不會一號一號疊加：每一號的「完成」掛在**已套用上限**的等待上，同一個卡住的號碼只會讓後面整條線多等一次上限。閘門的等待發生在呼叫 `withMutex` 之前，不算在 mutex 的 10 秒逾時裡，但會吃掉 replyToken 約 1 分鐘的有效時間，所以上限不能設長。

## 配套：報名／請假的 mutex 不取消排隊中的任務

光有閘門還不夠。`withFreshCalendarEvent` 原本傳 `cancelIfNotStarted`：排隊滿 10 秒還沒輪到就取消。Notion 寫入卡住時，最早送出的人逾時點最早、最先被取消，後送的人反而照常執行。只取消 `-N`／`假`／`銷假` 也不行：例如 C 的 `-1` 被取消，排在後面的 A 的 `+1` 就拿到「名額不足」，等 C 重送後空出的名額被更晚的 D 拿走。所以 2026-10-04 起，報名／請假全部不取消，逾時都回「可能已完成，請勿重複操作」（理由見 [ADR 0002](0002-mutex-timeout-does-not-cancel-task.md)「例外」）。

## 排序依據與觀察

排序用的是 Pi 收到訊息的順序，沒有加等待窗口。LINE 不保證送達順序，不同人之間會有幾十到幾百毫秒的抖動；加等待窗口的代價是每個人都變慢。進場時記一行 info `Entry gate passed`，欄位是 `{ key, ticket, gateWaitMs, lineTimestamp }`，不帶 userId（ADR 0005）。`lineTimestamp` 是 LINE 收到訊息的時間，群組畫面也是依它排序。同一個 key 的 `Entry gate passed` 依出現先後排，如果 `lineTimestamp` 沒有跟著遞增，就是進鎖順序和 LINE 的順序對調了；這種情況多了，再考慮加等待窗口。不要用 `ticket` 判斷先後：一個日期的號碼全部進場或結束後，計數會清掉、從 1 重新開始，兩則間隔稍長的訊息可能都是 1。

2026-10-04 本機接真實 LINE 手動驗證：同一帳號快速連送兩波共 9 則 `+1`／`-1`／`假`，`lineTimestamp` 都照 `Entry gate passed` 的先後遞增，每次寫入都接在上一則結果後面，沒有 `Entry gate wait capped`；第一波可看出 ticket 2、3 查詢比 ticket 1 早完成，仍在閘門等 ticket 1。完整紀錄見 commit `f3bdd8a` 的 `TODO.md`。沒測到的：前一則卡超過 5 秒的放行路徑（只有單元測試）、全新使用者排在前面、Pi 正式環境。

## 限制

閘門狀態只存在記憶體，跟 mutex 一樣，只在單一 instance 下成立。同一個 webhook 裡的多個事件本來就依序處理（`event-router.ts`），不受影響。日期 key 在 `message-handler` 算一次，handler 鎖 mutex 時又算一次。週六午夜換日的瞬間，兩邊可能不一樣，但 `enterInOrder` 用的是 context 裡的號碼本身，不會因此卡住。
