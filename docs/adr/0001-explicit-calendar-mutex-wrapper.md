# 活動的讀-算-寫用 withCalendarMutex 顯式包裝

修改活動（Calendar 頁面）的操作（報名、請假）需要「重讀最新資料 → 計算 → 寫回」的原子性，因為 Notion 沒有樂觀鎖，並發請求可能互相覆蓋彼此的寫入。我們在 `src/commands/registration/calendar-mutex.ts` 提供 `withCalendarMutex(pageId, fn)`，把「用活動 pageId 當鎖 key」這個領域知識從通用的 `services/mutex.ts` 移出來，但呼叫端（`registration-handler.ts`、`leave-handler.ts`）仍自己負責在 `fn` 內重新讀取最新資料，而不是把 refetch 邏輯也塞進 helper 的 interface。

**為什麼不強制呼叫端傳入 refetch 函式**：每個呼叫端重讀的方式不同（`registration-handler.ts` 重讀整個活動＋season 資料，`leave-handler.ts` 只需重讀活動），把 refetch 也吃進 interface 只會讓 helper 承擔它管不到的差異，未必比呼叫端自己寫「重讀 → 算 → 寫」三行更安全。真正的風險是「忘記用 withCalendarMutex 包裝整段」，不是「忘記重讀」——所以介面只保護鎖的取得與釋放，不試圖連讀取邏輯都一起框住。

新增操作活動資料的程式碼時，若沒有透過 `withCalendarMutex` 包裝整段讀-算-寫，就是在重新引入這個決策明確拒絕過的並發風險。
