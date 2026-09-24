# 排程任務

系統有兩個定時排程任務，在 `src/index.ts` 啟動時初始化。

## 每週打球資訊推播

**觸發時間：** 每週日 09:00（Asia/Taipei）

**實作：** `src/schedulers/weekly-push.ts`

### 執行流程

1. 讀取 `DOBBY_GROUP_IDS` 環境變數（逗號分隔字串），解析成多個推播目標的 LINE 群組 ID 清單
2. 計算下一個週六的日期
3. 呼叫 `getEventOccupancy(nextSaturday)`（`src/services/notion/event-occupancy.ts`）取得該日行事曆活動、當季 season 資料、總名額（`totalSlots`）與應到人數（`presentSeasonMembers`）——這個 helper 也被 `next-event.ts`、報名/請假流程共用，名額計算邏輯統一在一處，這支排程沒有另外算一次
4. 把 `occupancy` 交給 `buildWeeklyStatusMessage()`（`src/commands/weekly-status-message.ts`）組出訊息文字——這個 builder 同時也是 `@Dobby next`（`docs/commands.md`）的訊息來源，兩邊共用同一套格式，不是各自維護一份
5. 逐一發送 Push Message 到每個群組，個別 try/catch（單一群組失敗只記 log、不影響其他群組、不重試），跑完後記一行總結 log（成功/失敗/總數）

### 訊息格式

```
2026-09-26 不能到請喊聲
零打名額：4人 $170/人
1. 許文修的朋友
2. 
3. 
4. 

請假：官穗妙
場地：2 面
應到：10 人
```

`場地` 行顯示本週實際採用的場地數（行事曆 `場地數` 優先，未填用季預設，見 [registration.md](registration.md#容量計算公式)）；若跟季預設不同，會加註「（本週調整）」，例如 `場地：1 面（本週調整）`，讓換季複製頁面帶錯的值在週日推播時被看到。

零打名額那幾行印到 `Math.max(totalSlots, 已報名人數)`（沒人報名的格子留空），不是只列出已報名的零打名單；正常情況下等於 `totalSlots`，但已報名人數超過 `totalSlots` 的邊界情況下會印出更多行，不會截斷。`請假` 有多人時用頓號（`、`）分隔真實姓名，沒人請假顯示「無」。

若活動狀態為「打球暫停」，訊息改用簡化版，但沿用同一個標頭樣式：
```
2026-09-26 不能到請喊聲
⛔ 本週活動暫停
```

### 除錯

若推播沒有發送，檢查：
- `DOBBY_GROUP_IDS` 環境變數是否有設定（沒設定會記一行 `Weekly push aborted: DOBBY_GROUP_IDS is not set` 並跳過，不會讓 app 啟動失敗）
- 下一個週六是否有對應的行事曆頁面
- 伺服器時區是否正確（應為 Asia/Taipei）

`sendWeeklyPush()` 整次執行包在 `runWithContext()` 裡，每次觸發都有自己的 `reqId`，在 `/logs` 頁面會是一個獨立的「排程」事件（不會跟其他次執行混在一起），見 `docs/logging.md`。

**歷史備註**：這個群組 ID 原本是執行時查 USERS 資料庫裡 `is_admin = true` 管理員的 `groups[0]`（該欄位由 `user-management.ts` 的 `trackUser()` 在使用者發言時自動累加寫入）。改成環境變數是因為那個來源容易被意外改動（`groups` 欄位不是為了這個用途設計的，管理員在別的群組發言就可能讓 `groups[0]` 變成別的群組），而且讓這支排程沒辦法在不打 Notion API 的情況下測試。

**可同時推播給多個群組**：`DOBBY_GROUP_IDS` 用逗號分隔多個群組 ID（例如 `C123,C456`），`weekly-push.ts` 會逐一推播給每一個，單一群組推播失敗不影響其他群組（個別 try/catch、不重試）。push 呼叫之間刻意不加 delay，因為 LINE 官方 push 端點 rate limit 是 2,000 req/s/channel，遠大於實際會設定的群組數量。

---

## 顯示名稱批次更新

**觸發時間：** 每週一 04:00（Asia/Taipei）

**實作：** `src/schedulers/display-name-update.ts`

### 執行流程

1. 查詢所有 USERS 資料庫的使用者
2. 對每個使用者，**依序嘗試 `groups` 欄位（該使用者曾出現過的所有群組 ID，可能包含已離開的群組）裡的每一個 group ID**，用 `getGroupMemberProfile(groupId, userId)` 查詢，取第一個查詢成功的 displayName；`groups` 為空或全部查詢失敗則跳過該使用者（記 log，不影響其他使用者）
3. 若 displayName 有變動，更新 Notion 的 `Custom Name` 欄位
4. 每個處理過的使用者之間 delay 400ms（避免觸發 Notion rate limit）——這個 delay 寫在迴圈本體最底部、try/catch 之後，只要這次迴圈沒有提早 `continue`（例如 `groups` 為空、查不到 profile），就會執行，不論這次有沒有真的呼叫 Notion 更新、或是進了 catch 記錄失敗

**⚠️ 這裡一定要帶 `groupId` 查詢**：LINE 的 profile API 不帶 `groupId` 查的是「一對一好友」資料，社團成員多半只在群組互動、沒加 bot 為個人好友，不帶 `groupId` 幾乎必定回 404。2026-09-17 曾經因為漏帶這個參數，讓這支排程實質上永遠不會成功更新任何人，詳見 `docs/code-review-2026-09-17.md` 第 5.1 節。

### 注意事項

- 使用者必須在 `groups` 欄位裡至少有一個目前仍有效（bot 還在其中）的群組 ID 才查得到；若曾經在的所有群組都已離開，API 全部回 404，該使用者會被跳過且不影響其他人
- 查詢 USERS 資料庫時會用 cursor 分頁抓完所有使用者（不受單次查詢 100 筆上限影響）；單一使用者更新失敗只會被個別 try/catch 隔離、記 log 後跳過，不會中斷整批
- `getGroupMemberProfile()` 呼叫的 `profile-service.ts`/`getProfile()` 有摘要 log，跑這支批次作業時 `/logs` 會出現對應數量的 `'LINE get profile'` log 行（每個使用者一行）——這是預期行為，不是 bug，見 `docs/logging.md`。
