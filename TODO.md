# TODO

> 時區：Asia/Taipei ｜ 季度定義：Q1=1~3月, Q2=4~6月, Q3=7~9月, Q4=10~12月
>
> 前身為 `openspec/changes/bot-logic-fixes`，已改用純 Markdown TODO 追蹤，不再使用 OpenSpec 流程。

---

## 已解決（供參考，非待辦）

- 季度判斷（`participants` 未依當前時間取正確季度）— 已修正欄位對應與 `getCurrentSeasonName()`
- `owe` 未付款判斷 — 已改用 `結清` formula boolean
- `+/-N` 名額計算公式 — 已對齊規格公式（`capacity-calculator.ts`）
- 測試輔助工具（`createTestBot`、fixture 錄製）— 已完成，見 `src/test-utils/README.md`
- `payment` 指令規格 — 確認為「付款方式說明」（取 Announcement DB 的 PAYMENT 靜態文字），與 `owe`（未繳費名單）為不同指令，現有邏輯正確
- `command/指令` handler 完整性 — `command-list.ts` 存在且列出所有非管理員指令，正確排除管理員限定的 `next`
- `next` 指令 `c=N`（court override）參數未生效 — 已補上 what-if 顯示邏輯：`command-parser.ts` 統一解析 `-=N`/`c=N` 為結構化 `NextEventQueryParams`，`next-event.ts` 用 `calculateTotalSlots()` 算出「若場地數為 N」的剩餘名額並顯示，不寫回 Notion、不影響出席人數計算

---

## 手動測試追蹤（ngrok 接真實 LINE 帳號，見下方測試方案）

> dobby / batting 兩個 bot 需各測一輪（webhook 路徑與 channel secret 不同）。
> 每項測完打勾，機器人實際回應貼進該項下方的 code block（原文照貼、保留換行，避免 markdown 列表縮排把內容reflow 走樣），有問題另加「備註：」說明差異。
> 以下每一項目內的訊息若沒有特別說明即代表是連續執行的訊息

### 前置準備

- [x] 準備管理員 / 當季季租成員 / 非季租成員三種測試帳號

### 一般指令

- [x] `@Dobby`（自我介紹）
    - 待修改：指令與其功能說明之間要換行，讓使用者閱讀時不會誤以為一整句是指令
    - **查證結果：不是程式碼問題。** 這段文字來自 Notion `INTRODUCE` 公告頁面的 block 內容（`introduce.ts` 直接讀 Notion，不是寫死在程式裡），換行需要直接去 Notion 那則公告頁面改，不需要改 code。

```
嗨 @修_Kevin，我是多比
季打或零打的資訊可以前往記事本查看
—
主揪是 @修_Kevin ，有任何問題都可以提出
你可以打 @Dobby command 來看我有哪些功能
```

- [x] `command` / `指令`

```
Dobby 指令列表：

📋 報名/取消
@Dobby +N — 零打報名 N 位
@Dobby -N — 取消報名 N 位
@Dobby +N @Name — 幫 @Name 報名

🏸 季租成員
@Dobby 假 — 請假
@Dobby 銷假 — 銷假

📢 查詢
@Dobby 欠 / owe — 未繳費名單
@Dobby 報名人 / participants — 本季報名人
@Dobby 公告 / news — 最新公告
@Dobby 付款 / payment — 付款資訊
@Dobby — 自我介紹
```

```修改參考
🛠️ 指令列表
----------
（提醒：中文請用全形）

【查詢類】
1) 未繳費名單
@Dobby owe
@Dobby 欠

2) 查看指令列表（本頁）
@Dobby command
@Dobby 指令

3) 查詢季度報名人
@Dobby participants
@Dobby 報名人
別名：@Dobby people

4) 查詢最新公告
@Dobby news
@Dobby 公告
別名：@Dobby announcement

5) 查詢付款資訊
@Dobby payment
@Dobby 付款

【報名 / 請假類】
1) 報名零打（1 位）
@Dobby +1

2) 報名兩位（2 位）
@Dobby +2

3) 取消報名
@Dobby -1

4) 季租成員請假
@Dobby 假

5) 季租成員銷假
@Dobby 銷假
```

- ✅ 已依你的「修改參考」草稿改寫，並補上原本漏列的 `announcement` 別名。待下一輪 ngrok 複測後打勾。

- [x] `news` / `公告`
- 待釐清問題
- **查證結果：不是程式碼問題，是 Notion 資料命名問題。** Announcement DB 裡沒有名為 `NEWS` 的頁面（只有 `NEWS_TEMPLATE`），找不到才回「找不到公告內容」，邏輯本身正確。
- ✅ 已修正：改抓 `NEWS_TEMPLATE`，並支援內容裡的 `{PLACEHOLDER}` 變數即時代入當季資料（完整變數清單見 `docs/commands.md` 的 news 章節）。
    - 你想加的「此金額為直接除以人數，非實際繳費金額」備註是**純文字內容**，不隨季度變動，直接去 Notion `NEWS_TEMPLATE` 頁面那段文字後面加一行就好，不需要改 code。
    - 已用真實 Notion 資料實測，逐字比對你給的期望輸出完全一致。待下一輪 ngrok 複測後打勾。

```
找不到公告內容
```

- [x] `payment` / `付款`

```
永豐 (807) 20201800934932
Line Pay Money
iPass money
現金
```

- [x] `participants` / `people` / `報名人`

```
2026-Q3 報名人（11 位）：
1. 許文修
2. 陳玟育
3. 官穗妙
4. Peter Wang
5. 謝道正
6. 高煜
7. 子騏
8. 林郁軒
9. 簡蔡竹浩
10. Lee
11. 勤行
```

- [x] `owe` / `欠`

```
未繳費名單：
1. Lee
2. Peter Wang
3. 謝道正
4. 陳玟育
```

- [ ] 全形 `＋`/`－` 符號
    - 無法知道這個選項的用意是什麼
    - **查證結果：程式碼已支援。** `command-parser.ts`／`registration-parser.ts` 都有 `normalizeFullWidth()` 把 `＋`／`－` 轉成半形再解析，這項是驗證「傳 `＋1`／`－1` 這種全形符號的指令也要能正常運作」，不是新功能。可以實際傳 `@Dobby ＋1` 測完打勾即可，不需要改 code。

```

```

### 報名指令

- [x] 季租成員 `+1` / `+2` / `-1`（guest 命名「的朋友」）

```使用者
@Dobby +3
```

```機器人回應
報名成功 ✅

2026-09-19
零打名額 5 人 | $170/人
1. 林耀昌Derek
2. 林耀昌Derek+2
3. 許文修的朋友
4. 許文修的朋友2
5. 許文修的朋友3
剩餘名額：0 人
請假：謝道正、高煜

若要報名請輸入 @Dobby +1
總人數：共 14 人
```

```使用者
@Dobby -3
```

```機器人回應
取消報名成功 ✅

2026-09-19
零打名額 5 人 | $170/人
1. 林耀昌Derek
2. 林耀昌Derek+2
3.
4.
5.
剩餘名額：3 人
請假：謝道正、高煜

若要報名請輸入 @Dobby +1
總人數：共 11 人
```

- [x] 非季租成員 `+1` / `+2` / `-1`（guest 命名本人姓名）

- [x] 名額滿時 `+1`
    - 待修正：不論是否有報名成功都應該要有最後的報名結果名單（原本報名成功時所回應的內容）只是要額外加上無法完成該使用者所想報名的數量的敘述。
    - ✅ 已修正：失敗時的回應改成完整名額狀態（不再只回一句話）。
    - 二次調整（行為變更）：非管理員 `+N` 超過剩餘名額時，**不再整筆拒絕**，改成報到剩餘名額上限為止，回應說明「已達上限，僅報名 X 位，您原本要求 N 位」；剩餘名額為 0 時才維持整筆拒絕。管理員不受影響。已補測試，待下一輪 ngrok 複測後打勾。

```(此時仍有三個空的名額)
@Dobby +4
```

```機器人回應
名額不足，目前剩餘 0 個名額
```

- [x] 取消數量超過已報名數

```(此時有報名三個名額)
@Dobby -4
```

```機器人回應
取消報名成功 ✅

2026-09-19
零打名額 5 人 | $170/人
1. 林耀昌Derek
2. 林耀昌Derek+2
3.
4.
5.
剩餘名額：3 人
請假：謝道正、高煜

若要報名請輸入 @Dobby +1
總人數：共 11 人
```

- [x] Mutex：兩帳號同時 `+1`
    - 待修改：當兩個帳號同時 +1 時，必須確保第一個傳送指令的人的指令優先執行，目前的結果是執行最後被觸發的指令（若可行的話我希望全部指令最後都可以排隊執行，而不需要使用者重複執行指令）
    - ✅ 已修正：改成 FIFO 排隊，後到的等前一個做完才執行，不再直接回「系統忙碌中」拒絕。單次逾時 10 秒不會卡住後面排隊的請求。已補測試，待下一輪 ngrok 複測（兩支手機幾乎同時 +1）後打勾。

```使用者A
@Dobby +1
```

```使用者B
@Dobby +1
```

```機器人回應
系統忙碌中，請稍後再試
```

```機器人回應
報名成功 ✅

2026-09-19
零打名額 5 人 | $170/人
1. 林耀昌Derek
2. 林耀昌Derek+2
3. 許文修的朋友
4.
5.
剩餘名額：2 人
請假：謝道正、高煜

若要報名請輸入 @Dobby +1
總人數：共 12 人
```

### 請假指令

- [x] 季租成員 `假` / `銷假`
    - 待修正：不論是否有請假或銷假成功都應該要有最後的報名結果名單（原本報名成功時所回應的內容）只是要額外加上該使用者請假或銷假完成的敘述。
    - ✅ 已修正：成功後回應改成完整名額狀態（名額數字是請假/銷假**之後**重新算出來的，不是用請假前的舊資料）。已補測試，待下一輪 ngrok 複測後打勾。

```許文修請假 （使用者訊息）
@Dobby 假
```

```許文修請假 （機器人回應訊息）
請假成功！許文修
```

```許文修銷假 （使用者訊息）
@Dobby 銷假
```

```許文修銷假 （機器人回應訊息）
銷假成功！許文修
```

```正確回應
請假成功 ✅

2026-09-19
零打名額 6 人 | $170/人
1. 林耀昌Derek
2. 林耀昌Derek+2
3.
4.
5.
6.

剩餘名額：4 人
請假：謝道正、高煜、許文修

若要報名請輸入 @Dobby +1
總人數：共 10 人
```

- [x] 重複請假應回錯誤
    - 待修正：不論是否有重複請假或銷假都應該要有最後的報名結果名單（原本報名成功時所回應的內容）只是要額外加上該使用者重複請假或銷假的敘述。
    - ✅ 已修正：同上，回應改成完整名額狀態 + 「{名字} 已請假，無需重複操作」。待下一輪 ngrok 複測後打勾。

```該名使用者已經在請假名單中
@Dobby 假
```

```機器人回應
許文修 已請假，無需重複操作
```

- [x] 未請假時銷假應回錯誤
    - 待修正：不論是否已經請假都應該要有最後的報名結果名單（原本報名成功時所回應的內容）只是要額外加上該使用者並未請假的敘述。
    - ✅ 已修正：同上，回應改成完整名額狀態 + 「{名字} 目前未請假」。待下一輪 ngrok 複測後打勾。

```該名使用者並沒有請假
@Dobby 銷假
```

```機器人回應
許文修 目前未請假
```

- [x] 非季租成員使用 `假`/`銷假` 應被拒絕

```
@Dobby 假
```

```機器人回應
請假/銷假功能僅限季租成員使用
```

### 管理員指令

- [x] `@某人 +1` / `-1`（代他人操作）

```管理員訊息
@Dobby @Vic +1
```

```機器人回應
報名成功 ✅

2026-09-19
零打名額 5 人 | $170/人
1. 林耀昌Derek
2. 林耀昌Derek+2
3. Vic
4.
5.
剩餘名額：2 人
請假：謝道正、高煜

若要報名請輸入 @Dobby +1
總人數：共 12 人
```

- [x] `假` / `銷假`（代他人操作）（指定之人並沒有報名季打）
    - 待修正：執行功能無誤，但回應內容不完整，不論是否有請假或銷假成功都應該要有最後的報名結果名單（原本報名成功時所回應的內容）只是要額外加上該行動無法生效的原因的敘述。
    - ⚠️ 這句「請假/銷假功能僅限季租成員使用」是在還沒抓到活動資料前就判斷的（對方根本不是季租成員，沒有「本週名額」可以顯示），這次沒有改，維持原本的一句話錯誤。若你希望這裡也要接完整名額狀態，請告訴我要顯示誰的名額（因為對方不是季租成員，沒有「請假」的意義）。

```管理員訊息
@Dobby @Vic 假
```

```機器人回應
請假/銷假功能僅限季租成員使用
```

- [x] `假` / `銷假`（代他人操作）（指定之人有報名季打）
    - 待修正：執行功能無誤，但回應內容不完整，不論是否有請假或銷假成功都應該要有最後的報名結果名單（原本報名成功時所回應的內容）只是要額外加上該行動無法生效的原因的敘述。
    - ✅ 已修正：這個情境跟上面「季租成員 假/銷假」走同一段程式碼（自己操作或代人操作沒有分開處理），已一起修好。待下一輪 ngrok 複測後打勾。

```管理員訊息（該名使用者已請假）
@Dobby @高煜 假
```

```機器人回應
高煜 已請假，無需重複操作
```

```管理員訊息（該名使用者已請假）
@Dobby @高煜 銷假
```

```機器人回應
銷假成功！高煜
```

```管理員訊息（該名使用者未請假）
@Dobby @高煜 假
```

```機器人回應
請假成功！高煜
```

- [x] 非管理員代他人操作應被拒絕
    - 待修正：使用非管理員並未阻擋，若阻擋了，直接回應該名使用者「你不是管理員」
    - ✅ 已修正：非管理員代他人操作（報名或請假）一律先擋下回「你不是管理員」，不會寫入 Notion。已補測試，待下一輪 ngrok 複測後打勾。

```

```

- [x] `next`
- [x] `next?-=N`
- [x] `next?c=N`（確認不寫回 Notion）
- [x] 電腦版與手機版 mention 解析皆正確

### 自動回覆

- [x] 非管理員觸發自動回覆
- [x] 管理員訊息不觸發自動回覆
- [x] 大小寫需完全比對

### 收尾

- [ ] 清除測試產生的 Notion 假資料

---

## 已評估、不採納

- **表格驅動指令解析與路由**（`/improve-codebase-architecture` 報告候選 3，Speculative）— 評估後不採納。理由：(1) 各 command handler 簽名不一致（7 種不同形狀，從 `(replyToken, botId)` 到 `(event, delta, botId, isAdmin)`），單一表格 row 形狀塞不下這些差異；(2) 報告自己也承認 deletion test 不明確，拆掉 `command-parser.ts`/`command-router.ts` 可能只是把 switch 搬位置，不會真正集中複雜度；(3) 唯一有具體壞味道支撐的症狀（courtOverride 解析邏輯被拆到兩個 module）已用小範圍修法解決，見上方「已解決」。若未來新增指令的頻率明顯提高、且 handler 簽名先被拉齊，可重新評估。

## 待修正問題

- [x] 判斷指令時，自動移除連續的重複空白字元。例如：如果使用者輸入 `@Dobby  +2`，可以判斷為 `@Dobby +2`。 — ✅ 已修正，已補測試。
- [x] 回應任何訊息時，如果 webhook 事件中包含 quoteToken 就必須要使用，確保使用者能夠知道自己的訊息有被回應 — ✅ 已修正（透過既有的 `request-context.ts` 機制統一處理，不用逐一改每個 handler），已補測試。

```(API 請求範例 (JSON))
{
  "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
  "messages": [
    {
      "type": "text",
      "text": "這是引用您的訊息後的回覆！",
      "quoteToken": "q_uoteT0kEn123456..."
    }
  ]
}
```

---

## 程式碼審查待修問題（2026-09-17 分模組審查）

> 全專案依模組（Notion 資料層 / LINE 整合 / 指令系統 / 報名請假核心 / 排程與基礎設施）分開派 subagent 審查，避免單一 context 過大失焦。**完整技術細節、程式碼片段、每個模組「確認沒問題」的部分見 [`docs/code-review-2026-09-17.md`](docs/code-review-2026-09-17.md)**，章節編號（如 `[4.1]`）與下方清單一一對應。下方每項已包含足夠情境（檔案位置、具體壞掉情境、修法方向），可獨立開一個 session 直接動手修；若要更完整的背景或程式碼片段再去查對應章節。

### 🔴 High（建議優先處理，依風險排序）

- [x] **[4.2] `capacity-calculator.ts:86-95` `calculateRemoveCapacity` 用 `startsWith` 做名字 prefix 比對，會誤刪別人的報名。** 非季租成員（零打本人）用 `event.guests.filter(g => g.startsWith(prefix))` 找要移除的項目，沒有邊界檢查。若某人的名字（如 `"Al"`）剛好是別人名字（如 `"Alice"`）的前綴，傳 `-1` 會把 Alice 的報名刪掉、卻回覆 Al「取消報名成功」——靜默刪除別人資料的授權/資料完整性漏洞。修法方向：比對時要求完整相等或以空格等明確邊界字元分隔，不能單純 `startsWith`。務必補 `registration-handler.ts` 的整合測試（見下方 `[4.4]`）鎖住此行為。
    - ✅ 已修正：改用完整相等/明確編號後綴邊界的 regex 比對，補 7 個回歸測試（含原漏洞情境）。

- [x] **[4.1] `mutex.ts:11-45` `withMutex` 逾時機制沒有真正取消 `fn()`，破壞 FIFO 排隊的互斥保證。** 逾時發生時用 `Promise.race([fn(), timeout])`，race 一 reject 就釋放鎖給下一位，但真正的 `fn()`（含 Notion 讀取+寫入）仍在背景繼續跑。情境：A 的報名因 Notion 延遲卡超過 10 秒逾時 → 鎖提早釋放給 B → B 讀到 A 尚未寫入前的舊資料並成功寫入、收到「報名成功」→ A 那個逾時後仍在背景跑的舊寫入才完成，用更舊資料把 B 的結果覆蓋掉。兩人都收到成功訊息，但其中一人的報名被吃掉。修法方向：next-in-queue 要等待「真正的 `fn()` 完成」才釋放鎖，而不是等 race 的結果；或做真正的 abort。
    - ✅ 已修正：拆開佇列鏈（只依賴真正 settle）與呼叫端等待（race 結果），佇列清理綁在真正完成上而非等待計數。設計細節見 `docs/adr/0002-mutex-timeout-does-not-cancel-task.md`。

- [x] **[1.1] `property-helpers.ts:27-31`（`getRelation`）沒處理 Notion API 對 relation 屬性只回傳前 25 筆的限制，影響 `season-repository.ts:12`、`calendar-repository.ts:19,42-44`。** `season.members`（報名人）超過 25 人時，第 26 位以後的成員會被誤判「非本季成員」擋下報名/請假，且容量計算全面失真。更嚴重的是 `calendar.absentees`（請假人）的 `updateAbsentees` 是整包覆寫，若請假人數已達 25，下次寫回會**永久刪除**第 26 筆以後的請假紀錄。修法方向：對可能超過 25 筆的 relation 屬性改走 Notion 的分頁 property item 端點（`/pages/{id}/properties/{property_id}`），或至少讀到剛好 25 筆時 log 警告。
    - ✅ 已修正：新增 `getFullRelation`（讀到剛好 25 筆才走分頁端點補齊），`season-repository.ts`/`calendar-repository.ts` 改用它，呼叫端不用改。已發生過的截斷資料無法從程式碼復原，建議人工核對正式環境有沒有已卡在 25 筆的紀錄。見 `docs/notion/databases.md`。

- [x] **[5.2] `routes/logs.ts`（掛載於 `index.ts:12`）`/logs` 路由完全沒有身份驗證，任何知道網址的人都能看完整近 7 天 log。** 搭配 `push-service.ts:16` 用 `logger.info` 記錄每次推播的完整訊息內容（含真實姓名）與 LINE ID，構成個資外洩風險。修法方向：`/logs` 加上簡單 token/Basic Auth 驗證，或限制只能內網存取。
    - ✅ 已修正：加上 `LOGS_ACCESS_TOKEN` 共享密鑰驗證（timing-safe 比對），設為必填環境變數。部署環境需記得設定此變數。

- [x] **[5.1] `display-name-update.ts:19` 顯示名稱批次更新排程實質上永遠不會成功。** `getProfile(userId)` 沒有帶 `groupId`，打的是「一對一好友」API 而非文件要求、真正該用的 `getGroupMemberProfile(groupId, userId)`。社團成員多半只在群組互動、沒加 Dobby 為個人好友，導致幾乎所有查詢回 404 → null。建議先用真實資料實測確認現況（可能兩個 bot 都中招），再改用 `usersRepo` 資料裡使用者所屬的 `groupId` 呼叫正確 API。
    - ✅ 已修正：改依序嘗試使用者 `groups` 欄位裡每個 group 查詢，第一個成功即用，全部失敗才跳過該使用者。

### 🟠 Medium-High

- [x] **[4.3] `capacity-calculator.ts:58-71` `calculateAddCapacity` 的 guest 命名編號每次呼叫都從 0 重算，導致重複命名。** 同一人分兩次 `+1`（如季租成員 Bob 先後兩次各帶一位朋友）會產生兩筆一模一樣的「Bob的朋友」，而非規格要求的「Bob的朋友」+「Bob的朋友2」；非季租成員命名（「Alice」/「Alice 2」）同樣有此問題。`capacity-calculator.test.ts` 目前沒有測試「`event.guests` 已含同一人先前條目」的情境。修法方向：先掃描 `event.guests` 找出同一 `targetName` 已存在的最大編號，再接續編號；並補測試。
    - ✅ **已修正並在正式環境實際發生後確認**：2026-09-17 使用者「許文修」連續 4 次 `@Dobby +1` 只成功報名 1 位——因為重複命名產生的相同字串被 Notion `零打`（multi_select）欄位靜默去重合併成一筆，其餘 3 次報名在 Notion 端無聲遺失，程式端也沒有任何錯誤或警告。已新增 `findMaxExistingIndex` 掃描既有清單接續編號，並加上寫入前重複字串偵測的 `logger.warn` 防護（未來若還有其他路徑產生重複字串，至少會留下 log 線索）。已補 7 個測試案例，全專案測試通過。**已發生的那 4 次操作無法從程式碼層面復原**（Notion 的去重發生在伺服器端當下、無審計日誌可回溯），需人工跟許文修確認原本想報名的朋友是誰，手動在 Notion 補上。

### 🟡 Medium

- [ ] **[1.2] `people-repository.ts:32-37`、`season-repository.ts:32-35`、`announcement-repository.ts:25-28` 資料庫查詢/blocks 抓取沒處理 Notion 分頁（`has_more`/`next_cursor`）。** 未結清人數、season 數、公告內容超過 100 筆時會被靜默丟棄且無錯誤訊息。修法方向：補上分頁迴圈或至少加 log 提示可能被截斷。

- [ ] **[1.3] `calendar-repository.ts:33-38`、`people-repository.ts:17-22` `findByPageIds` 用 `Promise.all` 完全平行呼叫 Notion，違反「批次操作要加 delay」慣例（對照 `display-name-update.ts` 的 400ms），且 `notion-fetch.ts:30-36` 對 429 沒有 `Retry-After` 重試。** 修法方向：比照 `display-name-update.ts` 加節流，並在 `notion-fetch.ts` 對 429 做基本重試。

- [ ] **[1.4] `season-repository.ts:13-14,16` `courts`/`guestFee`/`weekCounts` 用 `?? 預設值` 掩蓋 Notion 欄位缺值（如忘填「場地數」會悄悄用 2 片場地算容量），與同函式內 formula 欄位保留 `null` 的處理方式不一致。** 修法方向：缺值時至少 log 警告，或讓後續邏輯明確處理 `null` 而非猜測預設值。

- [ ] **[2.1] `member-joined-handler.ts:12-21` 多人同時加入群組時，迴圈對同一個 `event.replyToken` 重複呼叫 `replyMessage`，LINE replyToken 只能用一次。** 第一位以外的成員收不到歡迎訊息且無告警（`reply-service.ts` 靜默 warn）。修法方向：迴圈內第一次用 `replyMessage`，其餘用 `pushMessage`（handler 已知道 `groupId`）。

- [ ] **[2.2] `message-handler.ts:22` `findByUserId` 沒有 try/catch，與其他 command handler 不一致。** Notion 在判斷 admin 身分的早期呼叫失敗時，例外會一路丟到外層只記 log，使用者完全收不到任何回應。修法方向：比照 `owe.ts`/`news.ts` 等，包 try/catch 並回覆「系統錯誤，請稍後再試」。

- [ ] **[2.3] `line-signature.ts:11-13` 未知 `botId`（webhook URL 打錯字/大小寫錯）靜默 fallback 用 Dobby 的 channel secret 驗簽，而非明確拒絕。** 且全專案沒有 Express 錯誤處理 middleware，驗簽失敗只會落到預設處理，難以定位根因。修法方向：`botId` 不在白名單時直接回 404；補上全域錯誤處理 middleware。

- [ ] **[3.1] `payment.ts:5-16` 自己重複定義了一份 `blocksToText()`，漏了 `bulleted_list_item` 補 `• ` 前綴的邏輯（commit `fb72fbd` 只改了 `introduce.ts`/`news.ts`，漏改這裡）。** `docs/commands.md` 明確寫 payment 支援 bulleted list，目前不支援且無測試覆蓋。修法方向：改用共用 `src/services/notion/blocks-to-text.ts`，並比照 `news.test.ts` 補項目符號測試案例。

- [ ] **[3.2] `command-parser.ts:12,15,90` `parseCommand`/`isCommand` 用大小寫敏感的 `startsWith('@Dobby')` 守門，但剝離前綴卻用 `/^@Dobby\s*/i` 忽略大小寫——這段大小寫容忍其實是死碼，實際不支援手動打字 `@dobby +1`。** 修法方向：決定要不要真的支援大小寫不敏感輸入，兩處判斷邏輯要一致（要嘛都不分大小寫，要嘛拿掉誤導性的 `/i`）。

- [ ] **[4.4] `registration-handler.ts`（`handleRegistration`）完全沒有測試檔，這是串起 mutex + 容量計算 + Notion 寫入的主流程，也是 `[4.1]`/`[4.2]`/`[4.3]` 實際發生的入口。** 修法方向：比照 `leave-handler.test.ts` 補上，驗證 mutex lock key、`calendarRepo.updateGuests` 呼叫參數、cappedAt 標題文案等。

- [ ] **[5.3] `display-name-update.ts:11` 查詢 USERS 資料庫沒有分頁處理，使用者數超過 100 時後面的人永遠不會被排程處理到；且直接呼叫 `notionPost` 繞過 repository 慣例。** 修法方向：補分頁迴圈，並改走 `users-repository.ts`（可能需要新增一個分頁安全的 list-all 函式）。

- [ ] **[5.4] `display-name-update.ts:10-34` 整個迴圈包在單一 try/catch，任一筆使用者更新失敗會中斷整批，後面排隊的人當週全部不會被處理，無 retry。** 修法方向：改成逐筆 try/catch，單筆失敗只 log 該筆錯誤並繼續下一筆。

- [x] **[5.5] `log-cleanup.ts:30` `unlink` 沒包 try/catch，單一檔案刪除失敗會變成 unhandled rejection（呼叫端是 `void cleanOldLogs()`），後面排隊要刪的檔案全部被跳過且無 log 線索。** 修法方向：逐檔案包 try/catch，失敗記 log 並繼續處理下一個檔案。
    - ✅ 已修正：每個檔案的 `unlink` 各自包 try/catch，失敗只記 warning 繼續處理下一個；`startLogCleanup` 呼叫端也加了 `.catch()` 保險。順便一起修的還有 `initLogger()` 缺錯誤處理、log 路徑改成錨定絕對路徑（不受啟動當下 cwd 影響，見 `docs/adr/0003-log-dir-anchored-via-argv.md`）、`/logs` 顯示時間改台北時區、加上 graceful shutdown（`SIGTERM`/`SIGINT`）。**[5.6] 的時區問題（檔名日期解析用 UTC、cutoff 用本地時區）本輪未修，仍是獨立待辦。**

### 🟢 Low

- [ ] **[1.5] `users-repository.ts:78-82` `incrementMessageCount` + `user-management.ts:47` 讀取→計算→寫回沒套 `withMutex`，連續訊息可能遺失計數。** 僅影響統計欄位，非報名核心邏輯，優先度低。
- [ ] **[1.6] `blocks-to-text.ts` 不遞迴處理 `has_children` 區塊，公告若用 toggle/巢狀清單會整段被靜默丟掉。**
- [ ] **[1.7] `season-repository.ts:32-35` `findAll()` 全專案找不到呼叫點，疑似死碼，建議清掉或補上呼叫端。**
- [ ] **[2.4] `member-joined-handler.ts:16` 來源是 `room`（非 `group`）時跳過 profile 查詢，歡迎訊息直接顯示 userId 而非暱稱，其實 `getProfile` 支援不帶 groupId 查詢。**
- [ ] **[2.5] `webhook.ts:12-13` `req.body.events` 用 `as` 斷言掩蓋型別，沒有執行期防呆，欄位缺失會同步拋 TypeError。**
- [ ] **[2.6] `index.ts:14` 直接讀 `process.env['NODE_ENV']`，沒有走 `env.ts`，違反慣例（目前無實害）。**
- [ ] **[3.3] `command-parser.ts:37-45` mention 分支用無錨點 regex（`/[+\-]\d+/`、`/假\|銷假/`）掃整個 body，若代操作目標的暱稱含 `-1`/`+2`/「假」字可能誤判指令類型。**
- [ ] **[3.4] `command-parser.ts:63` `body.startsWith('next')` 沒有字界檢查，任何 next 開頭訊息都被當 NEXT_EVENT（非安全問題，UX 小瑕疵）。**
- [ ] **[3.5] 指令系統測試覆蓋缺口：`command-router.ts`/`command-list.ts`/`owe.ts`/`participants.ts`/`payment.ts`/`introduce.ts` 都沒有對應測試檔。**
- [ ] **[4.5] `capacity-calculator.ts:46-52` 名額為負數時錯誤訊息顯示負數（如「剩餘 -3 個名額」），純顯示問題。**
- [ ] **[4.6] `delta=0`（`+0`/`-0`）邊界情況：目標已有報名時仍會多打一次無意義的 Notion 寫入並回「取消報名成功」，但實際什麼都沒變；目標無報名時則正常回錯誤，行為不一致。**
- [ ] **[4.7] 一般成員打錯目標語法（漏了 `@`）會收到「你不是管理員」而非「指令格式錯誤」——`handleRegistration` 的管理員檢查順序在 `parseError` 檢查之前，容易誤導使用者，非安全問題。**
- [ ] **[5.6] `log-cleanup.ts:27-28`/`log-reader.ts:28-30` 檔名日期用 UTC 解析、cutoff 用伺服器本地時區算，時區來源不一致。目前容器預設 UTC 無偏差，若未來把 TZ 設成 Asia/Taipei 會有最多 8 小時邊界誤差。**
- [ ] **[5.7] `config/line.ts:12-15` `getClient(botId)` 對未知字串靜默 fallback 回 dobbyClient，未用既有 `BotId` 型別做編譯期限制。**
- [ ] **[5.8] `utils/logger.ts:4` 直接讀 `process.env['NODE_ENV']`，繞過 `env.ts`（目前因 import 順序無實害）。**
- [ ] **[5.9] `env.ts:15` `PORT` 是 `z.string()` 用 `parseInt` 轉型，填非數字字串會得到 `NaN` 導致 `app.listen(NaN)` 監聽隨機 port 而非 fail-fast。建議改 `z.coerce.number().int().positive()`。**
- [ ] **[5.10] `data/auto-reply.json` 多組 trigger 重複出現兩次以上（「朋友」「雙胞胎」及多個哈利波特咒語），後面那組（疑似改寫成療癒語氣的版本）永遠是死碼，`findReply` 抓第一個符合就回傳。需與內容維護者確認是否刻意設計。**
- [ ] **[5.11] `user-management.ts:16-47` `_trackUserAsync` 讀取→計算→寫回沒套 `withMutex`，fire-and-forget 下同一使用者連續發訊息可能漏算訊息計數/群組清單，僅影響統計。**


