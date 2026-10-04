# `trackUser` 在鎖內一律重讀 USERS，不沿用呼叫端的快照

`message-handler.ts` 開頭為了判斷管理員身分，已經 `findByUserId` 查過發訊者一次，並把結果（`knownUser`）傳給 `trackUser`。`trackUser` 在 `user-track-${userId}` 鎖內**一律重讀**，不直接拿這份快照算更新（`src/services/user-management.ts` 的 `_trackUserAsync`）：

- 快照不是 `null`：用快照的 pageId 讀頁面本身（`usersRepo.findByPageId`，`GET /pages/{id}`）。頁面已封存或在垃圾桶時回 `null`，改用 `findByUserId` 查。
- 快照是 `null`：用 `findByUserId` 查，理由見 `docs/architecture.md`「USERS 不重複建頁的前提」。

**為什麼不能沿用快照**：快照是進鎖之前讀的。同一人的另一次 `trackUser`／`trackJoinedMember` 可能在這之間寫入 groups／multiChats／message_counts。拿快照算更新，會把那次寫入蓋掉：`message_counts` 寫的是「快照的數字＋1」這種絕對值（Notion API 沒有原子加一），groups／multiChats 是把「快照的陣列＋這次的 ID」整包寫回。後果是發言數少算 1，或在兩個新群組幾乎同時發言時弄丟一個群組 ID。

**不要做的「最佳化」：用 `isLocked(key)` 判斷「沒有別人在跑就信任快照」。** 2026-10-04 以前就是這樣寫的（`trustKnownUser`），但它擋不住兩種情況，`services/__tests__/user-management.test.ts` 的 `trackUser concurrency` 各有一個測試重現：

1. **前一次呼叫逾時、但背景還在寫。** `isLocked()` 讀的是 `pending`，也就是「還有沒有呼叫端在等」。呼叫端 10 秒逾時放棄後 `pending` 就歸零，但 `fn()` 還在背景持鎖寫入（[ADR 0002](0002-mutex-timeout-does-not-cancel-task.md)）。
2. **快照在前一次寫入完成前讀取，但檢查 `isLocked` 時前一次已經結束。** 檢查點是呼叫 `trackUser` 那一刻，不是讀快照那一刻。同一人快速連發兩則訊息時，第二則的 `findByUserId` 會和第一則的寫入重疊，不需要逾時。

改讀 `inFlight`（只在 `fn()` 真正結束時才減一）只修得到第 1 種。要修第 2 種，得在讀快照之前記下「這個 key 已完成幾次」再傳給 `trackUser` 比對：要改函式簽名，`message-handler` 要知道鎖的 key 格式，計數的清理方式也有陷阱。比起來，每則群組訊息多一次 Notion 讀取（fire-and-forget，使用者感覺不到；本機 log 2026-09-27～10-04 平均每天約 15 則群組訊息）便宜得多。

**為什麼用 `GET /pages/{id}`，不用 database query**：鎖內這次讀取一定要看到前一次 PATCH 寫入的值。`docs/architecture.md` 只實測過「新建的頁面立刻查得到」，沒測過「PATCH 更新屬性後，database query 立刻拿到新值」。直接讀頁面不經過 database query，比較有把握。這點也沒有實測過，只是比較直接的讀法。如果日後 log 裡同一頁的「累加使用者發言次數」連續兩次寫入同一個數字，而且兩次 PATCH 一前一後沒有重疊（要 `LOG_LEVEL=debug` 才看得到 PATCH body），就要懷疑這個前提不成立。

**快照還有什麼用**：只用來拿 pageId，省掉 database query。報名／請假沿用同一份快照是另一回事（只用 `registeredPersonPageId`、`customName`，`trackUser` 不會改這兩個欄位），見 [ADR 0009](0009-actor-users-snapshot-non-null-only.md)。
