# 報名／請假沿用 message-handler 的 USERS 快照：只信非 null，不做請求範圍快取

`message-handler.ts` 開頭為了判斷管理員身分，已經 `findByUserId` 查過發訊者一次。報名、請假自己操作（`target.isSelf`）時，這份快照經 `routeCommand` → `handleRegistration`／`handleLeave` → `resolveTarget`（`src/commands/registration/target-resolver.ts`）用 `actorUser?` 參數往下傳，省掉一次重複的 USERS 查詢（約 0.45 秒）。**只有快照不是 `null` 時才採用，`null` 或沒傳一律重查。** 替別人報名（@mention、名字指定）查的是別人，不用這份快照。

**為什麼非 null 可以信**：`resolveTarget` 只用到 `registeredPersonPageId` 和 `customName`。既有使用者的 `trackUser` 只會改 groups／multiChats／message_counts（`src/services/user-management.ts` 的 existing 分支），不會改 `registeredPersonPageId`。快照也可能是剛建好、還沒連到 People 的頁面（`trackUser` 建頁後約 1 秒才寫入連結），這時結果跟重查一樣：自動建立的 People 頁名稱就是 `customName`，也不在任何季租名單上。

**為什麼 null 不能信**：群組／聊天室的新使用者下指令時，`message-handler.ts` 會先 await `trackUser` 把 USERS 頁面建好，所以傳下來的 `null` 在這條路徑上一定已經過時。相信它的話，新使用者的第一個指令會回「找不到您的帳號」，也就是 commit `b817157` 修掉的問題。一對一私訊不追蹤使用者，`null` 才是真的不存在，重查也只多一次呼叫。這跟 `trackUser` 不採信呼叫端傳入的 `null` 快照（`user-management.ts` 的 `trustKnownUser`，見 `docs/architecture.md`「USERS 不重複建頁的前提」）是同一個道理。

**不要做的「簡化」：用 AsyncLocalStorage（`src/utils/request-context.ts`）對 `findByUserId` 做請求範圍快取。** 看起來比逐層傳參數乾淨，也不用改函式簽名，但會出事：

- `trackUser` 在同一個請求 context 裡 fire-and-forget 執行。它在 mutex 內刻意重查（`user-management.ts` 的 `withMutex` 區塊），就是為了拿到最新資料，避免同一人連續兩則訊息時，用舊快照算出的更新覆寫另一次呼叫剛寫入的 groups／message_counts。快取會讓這次重查命中舊資料，重新引發這個覆寫問題。
- 快取如果把 `null` 也存下來，更嚴重：`trackUser` 鎖內重查拿到過時的 `null`，會打破「USERS 不重複建頁」的前提，可能建出重複的 USERS 頁；`resolveTarget` 也會把剛建好的新使用者當成不存在。

`request-context` 只放請求的後設資料（`reqId`、`quoteToken`、purpose），不放查詢結果。

**限制**：一對一私訊和群組新使用者的第一個指令，仍然會查兩次 USERS，這是預期的。以後其他 handler 想沿用這份快照，要照同樣規則：只信非 null，並先確認它用到的欄位不會被 `trackUser` 改到。
