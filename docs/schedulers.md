# 排程任務

系統有兩個定時排程任務，在 `src/index.ts` 啟動時初始化。

## 每週打球資訊推播

**觸發時間：** 每週日 09:00（Asia/Taipei）

**實作：** `src/schedulers/weekly-push.ts`

### 執行流程

1. 讀取 `DOBBY_GROUP_ID` 環境變數，作為推播目標的 LINE 群組 ID
2. 計算下一個週六的日期
3. 查詢行事曆：找到對應日期的活動
4. 查詢季租承租紀錄：取得季租成員數
5. 計算出席人數：`季租成員 - 請假人數 + 零打人數`
6. 發送 Push Message 到 Dobby 群組

### 訊息格式

```
🏸 本週打球資訊
📅 3月8日（六）

出席人數：14 人

零打名單：
1. 小明
2. 小明的朋友
```

若活動狀態為「打球暫停」，改顯示：
```
⛔ 本週活動暫停
```

### 除錯

若推播沒有發送，檢查：
- `DOBBY_GROUP_ID` 環境變數是否有設定（沒設定會記一行 `Weekly push aborted: DOBBY_GROUP_ID is not set` 並跳過，不會讓 app 啟動失敗）
- 下一個週六是否有對應的行事曆頁面
- 伺服器時區是否正確（應為 Asia/Taipei）

**歷史備註**：這個群組 ID 原本是執行時查 USERS 資料庫裡 `is_admin = true` 管理員的 `groups[0]`（該欄位由 `user-management.ts` 的 `trackUser()` 在使用者發言時自動累加寫入）。改成環境變數是因為那個來源容易被意外改動（`groups` 欄位不是為了這個用途設計的，管理員在別的群組發言就可能讓 `groups[0]` 變成別的群組），而且讓這支排程沒辦法在不打 Notion API 的情況下測試。

**只會推播給 `DOBBY_GROUP_ID` 指定的那個群組**：`weekly-push.ts:39` 呼叫 `pushMessage(dobbyGroupId, ...)`，沒有多個推播目標的概念，要推到哪個群組完全由這個環境變數決定。

---

## 顯示名稱批次更新

**觸發時間：** 每週一 04:00（Asia/Taipei）

**實作：** `src/schedulers/display-name-update.ts`

### 執行流程

1. 查詢所有 USERS 資料庫的使用者
2. 對每個使用者，**依序嘗試 `groups` 欄位（該使用者曾出現過的所有群組 ID，可能包含已離開的群組）裡的每一個 group ID**，用 `getGroupMemberProfile(groupId, userId)` 查詢，取第一個查詢成功的 displayName；`groups` 為空或全部查詢失敗則跳過該使用者（記 log，不影響其他使用者）
3. 若 displayName 有變動，更新 Notion 的 `Custom Name` 欄位
4. 兩次 Notion 更新之間 delay 400ms（避免觸發 Notion rate limit）

**⚠️ 這裡一定要帶 `groupId` 查詢**：LINE 的 profile API 不帶 `groupId` 查的是「一對一好友」資料，社團成員多半只在群組互動、沒加 bot 為個人好友，不帶 `groupId` 幾乎必定回 404。2026-09-17 曾經因為漏帶這個參數，讓這支排程實質上永遠不會成功更新任何人，詳見 `docs/code-review-2026-09-17.md` 第 5.1 節。

### 注意事項

- 使用者必須在 `groups` 欄位裡至少有一個目前仍有效（bot 還在其中）的群組 ID 才查得到；若曾經在的所有群組都已離開，API 全部回 404，該使用者會被跳過且不影響其他人
- 這支排程目前沒有分頁處理（USERS 資料庫查詢一次最多抓 100 筆）、單一使用者更新失敗會中斷整批（無逐筆 try/catch），這兩項是已知但尚未修的問題，見 `TODO.md` 的 `[5.3]`、`[5.4]`
