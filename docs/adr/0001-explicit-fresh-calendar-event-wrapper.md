# 活動的讀-算-寫用 withFreshCalendarEvent 顯式包裝

修改活動（Calendar 頁面）的操作（報名、請假）需要「重讀最新資料 → 計算 → 寫回」的原子性，因為 Notion 沒有樂觀鎖，並發請求可能互相覆蓋彼此的寫入。我們在 `src/commands/registration/with-fresh-calendar-event.ts` 提供 `withFreshCalendarEvent(replyToken, date, context, refetch, mutation)`：取得 Mutex 鎖、呼叫 `refetch()` 拿最新資料、查無資料時回「找不到活動」、否則把最新資料交給 `mutation` 執行寫回，並統一處理逾時以外的例外（記錄 log、回覆「系統錯誤，請稍後再試」）。呼叫端（`registration-handler.ts`、`leave-handler.ts`）只需提供 `refetch` 與 `mutation` 這兩個函式，不用自己重複寫「找不到活動」「系統錯誤」的錯誤處理與回覆邏輯。

**鎖 key 用活動日期字串，不是 Calendar 頁面 ID**：`withFreshCalendarEvent` 把 `date` 直接交給 `services/mutex.ts` 的 `withMutex` 當 key。若改用頁面 ID 當 key，呼叫端要先查一次 Notion 才能拿到 ID，等於為了「知道要鎖哪個 key」多打一次 API；而 `refetch()`（例如 `getEventOccupancy(date, ...)`）本來就是用日期查活動，日期在呼叫前就已經知道，不需要額外查詢。

**為什麼把 `refetch` 做成 interface 的必要參數**：這點跟本 ADR最初的版本相反——原始版本主張「不該強制呼叫端傳入 refetch，因為介面只該保護鎖的取得與釋放，讀取邏輯留給呼叫端自己寫」。實際重構後採用了相反的做法：`refetch` 是 `withFreshCalendarEvent` 的第三個必要參數，「取鎖 → refetch → 檢查是否存在 → 呼叫 mutation → 錯誤處理與回覆」整段流程都收進 helper 內部。這樣「查無活動時回什麼話」「非預期例外時記什麼 log、回什麼話」這些行為只寫一次，兩個呼叫端（報名、請假）不會各自寫一份容易漏改、容易不一致的錯誤處理。真正的風險改成「呼叫端沒有透過 `withFreshCalendarEvent` 包裝整段讀-算-寫」，而不是「呼叫端自己忘記重讀」——把 refetch 收進介面正是為了讓這件事不可能被漏掉。

新增操作活動資料的程式碼時，若沒有透過 `withFreshCalendarEvent` 包裝整段讀-算-寫，就是在重新引入這個決策要避免的並發風險。
