# 報名／請假進鎖前的查詢改用 in-memory 讀取快取，USERS／People 定時整表重載，季資料短 TTL

報名／請假進鎖前要串行打兩段 Notion：先在 `message-handler.ts` 查 USERS，再由 handler 並行查對象（`resolveTarget` 查 People）和季資料。每則合計約 0.8～2.2 秒，偶爾碰到 3～5 秒的長尾。這段時間的快慢會讓排在後面的人在號碼牌閘門多等（[ADR 0018](0018-entry-gate-orders-lock-entry.md)），長尾還可能撞到 5 秒上限，打亂順序。這三樣資料平常幾乎不變（2026-10-04 使用者確認季租名單、管理員身分幾乎不會改），所以 2026-10-05 起改成讀 in-memory 快取。`docs/rejected-proposals.md` 否決的是 SQLite，當時的結論本來就是「讀取快取用 in-memory Map 就夠了」。

快取只縮短進鎖前這段，**不提高吞吐量**：mutex 的 10 秒逾時從呼叫 `withMutex` 才開始算，搶報時的瓶頸是鎖內每則約 1 秒（`docs/performance-observations.md` 的「同一場活動 10 秒內大約只能處理 8～9 則報名／請假」）。快取也**不能取代閘門**，命中了也一樣要照號碼進鎖。

## 做法

快取核心在 `src/services/notion/read-cache.ts`（`ReadCache`），只在 repository 內部使用，handler 透過 repository 的函式讀取。

| 資料 | 入口 | 快取方式 | 誰在用 |
|------|------|------|------|
| USERS | `usersRepo.findByUserId`，`reason` 是 `'actor'`／`'mention-target'` | 每 15 分鐘整表重載＋查詢時順便存，項目最舊 30 分鐘 | message-handler（每則訊息）、`resolveTarget` |
| People 姓名 | `peopleRepo.findNameByPageId`（只回傳 `pageId`、`name`） | 同上 | `resolveTarget` |
| 季資料 | `seasonRepo.findByNameCached` | TTL 60 秒，查詢時才存 | 只有報名／請假 handler |

共通規則：

- **`null`（查無）不存。** 全新使用者的 USERS 頁由 `trackUser` 建立，存了 `null` 之後所有指令都會回「找不到您的帳號」（[ADR 0009](0009-actor-users-snapshot-non-null-only.md)）。
- **同一個 key 同時查詢時共用一次請求。** 搶報時大家查的都是同一份季資料，不會每則各打一次，也比較不會撞到 Notion 的 rate limit。代價是那一次查詢失敗時，共用的人一起回「系統錯誤」。
- **命中時回傳複本**，呼叫端改了也不會污染快取。
- 命中時記 debug `Read cache hit`，這時 `/logs` 的時間軸上不會有那次 Notion 呼叫。

## 為什麼 USERS／People 要整表重載，不只靠逐筆 TTL

搶報時，多數人送的 `+1` 就是他近期的第一則訊息。只靠查詢時順便存的話，最需要命中的時候反而都沒命中。重載排程在 `src/schedulers/read-cache-refresh.ts`：啟動時跑一次，之後每 15 分鐘一次，每次 2～3 個 Notion 請求。項目最舊 30 分鐘，所以容許一次重載失敗；兩張表各自失敗，失敗的那邊沿用舊快取直到過期。

## 寫入怎麼讓快取失效

bot 自己寫 USERS 只走 `usersRepo.update`，它在 PATCH 前後各呼叫一次 `invalidate(pageId)`：

- 寫入前失效：寫入期間的讀取改查 Notion。
- 寫入後再失效：丟掉寫入期間開始、可能讀到舊值的那些查詢結果。

寫入成功後，再用 PATCH 回傳的頁面直接存回快取（`ReadCache.put`）。不靠下一次查詢補，是因為剛 PATCH 完，database query 是否馬上反映新值沒有實測過（ADR 0017）。如果查回舊值又被存進快取，舊值會一直留到下次重載。`usersRepo.create` 也用回傳的頁面存回快取，同一個 userId 的舊記錄（例如管理員手動刪掉的舊頁）會被取代。

每次讀取開始前先拿序號，存入前檢查這筆資料在讀取開始後有沒有被寫過，有就丟掉不存。`put` 的序號比所有進行中的查詢都新，所以它們完成時不會蓋掉它。整表重載也照這個規則，另外會保留重載開始之後才存進來的較新項目。

每週一 `display-name-update` 改 `customName` 也是走 `usersRepo.update`，所以不需要另外清快取。如果不失效，沒有 People 頁的人 `+1` 會寫進舊名，之後 `-1` 依名稱比對會找不到。`trackUser` 寫入 `Registered name` 連結也一樣會失效。

**`incrementMessageCount` 刻意不失效**：每則群組訊息都會呼叫它，失效的話快取幾乎不會命中。快取記錄裡的 `messageCount`／`groups`／`multiChats` 因此可能是舊的，**不能拿來算任何寫入**。

## 不要改成的寫法

- **`'track-user'` 也走快取**：`trackUser` 鎖內的重讀（`findByPageId`、`findByUserId(userId, 'track-user')`）會用讀到的 `groups`／`message_counts` 算出新值寫回，而且 `message_counts` 是絕對值。吃到快取的舊值就會蓋掉別人的寫入（[ADR 0017](0017-track-user-always-rereads-inside-lock.md)）。
- **把 `seasonRepo.findByName` 本身改成走快取**：season 公告、付款、名單等指令也呼叫它。管理員改完費用馬上查，會看到舊值。
- **季資料改成鎖內重讀**：這樣季資料一定是新的，但每則佔鎖時間會多一次查詢（0.4 秒左右）。佔鎖時間正是搶報吞吐量的瓶頸，所以選了短 TTL。
- **People 快取存 `PersonRecord`**：`結清` 是 formula，管理員登記付款就會變。快取只存姓名，型別上就拿不到 `hasPaid`。
- **用 request context 存查詢結果**：[ADR 0009](0009-actor-users-snapshot-non-null-only.md) 否決過，理由不變。這次的快取在 repository 層，`track-user` 一律繞過。

## 接受的延遲

只有直接在 Notion 手動改的資料會延遲生效。bot 自己的寫入會用寫入 API 的回傳值立刻更新快取：

- **季資料（最多 60 秒）**：管理員改季租名單（`報名人`）或季預設 `場地數` 後，60 秒內的報名／請假可能用舊值算名額，例如多加一位季租成員卻還沒生效，零打名額就多算一個。每週的場地數覆寫在行事曆的 `場地數`，鎖內本來就會重讀，不受影響。季資料層級的這兩個欄位通常只在換季時改，所以接受這個風險。
- **USERS 與 People（最多約 15 分鐘，重載失敗時最多 30 分鐘）**：
  - `is_admin` 拿掉之後，這段時間內仍有管理員權限。
  - `Registered name` 連結改了，這段時間內還是解析到舊的 People 頁。
  - People 的 `Name` 改了，這段時間內報名寫的還是舊名。

## 手動清除

`/logs` 頁首有「清除快取」按鈕（`POST /logs/read-cache/clear`，`clearAndReloadReadCaches`）。它清空全部快取，包括季資料，然後立刻重載 USERS／People，讓管理員在 Notion 手動改完資料後不用等。

- **不能只清不載**：清完之後到下一輪重載前，搶報時都會沒命中。
- **清除前開始的查詢不能存回來**：`ReadCache.clear` 會記下當時的序號，在這之前開始的查詢和整表重載，完成時結果一律丟掉，不然清除前讀到的舊資料會被存回去。

## 限制

- 跟 mutex、閘門一樣，快取只存在單一 process 的記憶體，只在單一 instance 下成立。重啟後第一輪重載完成前，查詢都直接打 Notion。
- 快取是模組層級的狀態，測試之間會互相污染。`src/test-utils/setup.ts` 在每個測試前呼叫 `clearAllReadCaches()`。
- 每 15 分鐘的重載在 `/logs` 上是一張「排程」卡片，「來自」顯示 `read-cache-refresh`。成功的連續幾張跟 R2 同步一樣折疊成一列，「有新 log」輪詢也會忽略它（`docs/logging.md`）。
