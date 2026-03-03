# 排程任務

系統有兩個定時排程任務，在 `src/index.ts` 啟動時初始化。

## 每週打球資訊推播

**觸發時間：** 每週日 09:00（Asia/Taipei）

**實作：** `src/schedulers/weekly-push.ts`

### 執行流程

1. 查詢 USERS 資料庫，找到 `is_admin = true` 的管理員，取其第一個 group ID
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
- 管理員帳號是否有 `groups` 欄位（需要 group ID 才能推播）
- 下一個週六是否有對應的行事曆頁面
- 伺服器時區是否正確（應為 Asia/Taipei）

---

## 顯示名稱批次更新

**觸發時間：** 每週一 04:00（Asia/Taipei）

**實作：** `src/schedulers/display-name-update.ts`

### 執行流程

1. 查詢所有 USERS 資料庫的使用者
2. 對每個使用者，呼叫 LINE API 取得最新的 displayName
3. 若 displayName 有變動，更新 Notion 的 `Custom Name` 欄位
4. 兩次 Notion 更新之間 delay 400ms（避免觸發 Notion rate limit）

### 雙 Bot 策略

Profile 查詢會先嘗試 Dobby bot，失敗（如 404）再試 batting bot。兩個都失敗則略過該使用者。

**原因：** 使用者可能只在其中一個 bot 的群組中，需要用對應的 bot 才能查到 profile。

### 注意事項

- 使用者必須在 `groups` 欄位中有群組 ID 才能被查詢（profile API 需要 groupId）
- 若使用者已離開群組，API 會回傳 404，該使用者不會被更新
