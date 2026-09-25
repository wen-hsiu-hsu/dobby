# 報名系統

報名系統是 Dobby 最複雜的功能，涉及容量計算、guest 命名、並發保護、跨平台 mention 解析。

## 流程概覽

```
@Dobby +2（或 @Dobby @Vic +1）
    │
    ▼
Registration Parser
  └── 解析 delta（+2）和目標（自己或 @Vic）
    │
    ▼
Target Resolver
  └── 判斷操作對象：self / mention userId / name 文字
    │
    ▼
取得當前 Season 資料（供 isSelfSeasonMember 判斷）
    │
    ▼
獲取 Mutex 鎖（key = 下一個週六的日期字串，TTL 10 秒）
    │
    ├── 鎖內查詢最新 Calendar 事件（避免 race condition；查無此活動 → 回「找不到活動」，不視為系統錯誤）
    │
    ▼
Capacity Calculator
  └── 計算可用名額，產生新的 guest 清單
    │
    ▼
更新 Notion 行事曆（零打 multi-select）
    │
    ▼
釋放 Mutex
    │
    ▼
回覆 LINE：新名單 + 剩餘名額 + 請假名單
```

失敗或邊界情況（名額不足、重複請假、未請假卻銷假等）也會回覆同一種「完整名額狀態」格式，只是第一行換成對應的說明，而不是只回一句話（`src/commands/registration/event-status-message.ts`）。例外情況見下方「請假邏輯」一節。

## 容量計算公式

```
可用名額 = 場地數 × 7 - 季租成員數 + 請假人數 - 已報名零打數
```

- **場地數**：本週行事曆的 `場地數`，未填則用當季的 `courts` 欄位（`resolveCourts()`，`src/commands/registration/capacity-calculator.ts`）。`calculateTotalSlots` 內部就會套用這個 fallback，所以報名時的名額判斷（`calculateAddCapacity`）、請假／銷假後重算的名額、週報顯示都一致。為什麼 fallback 只能寫在這一處，見 [ADR 0007](adr/0007-calendar-courts-fallback-in-one-place.md)
- **季租成員數**：當季 `members` 關聯的人員數量
- **請假人數**：本週行事曆 `請假人` 關聯的人員數量
- **已報名零打數**：本週行事曆 `零打` multi-select 的項目數量

管理員報名時**不受名額限制**，但這只在活動未暫停的前提下成立：`calculateAddCapacity`（`src/commands/registration/capacity-calculator.ts`）一開始就檢查活動是否為「打球暫停」，若已暫停會直接拒絕（回「本次活動已暫停，無法報名」），這個檢查在判斷是否為管理員**之前**，管理員也一樣會被擋下。

非管理員 `+N` 超過剩餘名額時，**不會整筆拒絕**：改成報到剩餘名額為止，並在回覆說明「已達上限，僅報名 X 位」。剩餘名額恰好為 0（完全沒有名額可報）時才維持整筆拒絕，回「名額不足」。若季資料異動導致 `availableSlots` 算出負數（既有零打數已超過總名額），錯誤訊息一律顯示「剩餘 0 個名額」，不顯示負數。

取消報名（`calculateRemoveCapacity`）若算出的實際刪除數為 0（例如指令解析出 `-0`／`+0`，或目標存在但要求刪除 0 筆），一律回「取消數量需大於 0」的錯誤，不寫入 Notion，也不會誤回「取消報名成功」——這與「找不到報名紀錄」時同樣不寫入、同樣回錯誤的行為一致。

## Guest 命名規則

### 季租成員帶朋友
```
第一位：{姓名}的朋友
第二位：{姓名}的朋友2
第三位：{姓名}的朋友3
```

### 非季租成員（零打本人）
```
第一位：{姓名}
第二位：{姓名} 2
第三位：{姓名} 3
```

取消報名時，用完整相等或明確的編號後綴邊界比對（例如非季租成員的 `{姓名}` 或 `{姓名} 2`），**不能**用單純的字串前綴（`startsWith`）比對——曾經發生過因為名字互為前綴（如 `"Al"` 對 `"Alice"`）誤刪別人報名的資料安全漏洞，見 `docs/code-review-2026-09-17.md` 第 4.2 節。

新增條目時的編號也不是每次從頭算：會先掃描活動目前的 `零打` 清單，找出這個人已經用到的最大編號再接續，而不是每次呼叫都重算成同一個編號——因為 `零打` 是 Notion 的 multi_select 欄位，重複的名字字串會被 Notion 靜默去重合併成一筆，不接續編號會悄悄弄丟報名資料。細節見 `docs/adr/0004-guest-name-must-be-globally-unique.md`。

## Mutex 保護

報名和請假都需要「讀取 → 計算 → 寫回」三步驟。若兩個請求同時進行，可能產生資料覆蓋。

Mutex 以活動日期字串為 key（不是 calendar 頁面 ID，這樣不用多一次查詢才能知道要鎖哪個 key），同一個活動一次只允許一個報名操作在執行。

同一個 key 的請求會排成 FIFO 佇列，後到的等前一個做完才執行，**不會直接拒絕**、不需要使用者重試。單次執行有 10 秒逾時保護，但逾時只影響「這次呼叫端等多久」——背後真正的讀寫仍會在背景跑到完成，後面排隊的請求會等它真正完成才開始，不會因為前一個逾時就提早用舊資料搶跑。細節與這個設計取捨的原因見 `docs/adr/0002-mutex-timeout-does-not-cancel-task.md`。

```
src/services/mutex.ts
```

## Target Resolver（誰在報名）

### 三種情境

| 情境 | 判斷條件 | 處理方式 |
|------|----------|----------|
| 自己報名 | 無 mention | 查 USERS 資料庫取得對應 userId 的記錄 |
| @mention 指定 | 有目標 userId | 查 USERS 資料庫取得對應 userId 的記錄 |
| 名字指定（文字） | 有目標名字文字 | 查 People List 比對 |

「自己報名」「@mention 指定」這兩種情境查到 USERS 記錄後，顯示名稱不是直接用 `customName`：會**優先**用該 user 的 `registeredPersonPageId` 去查 People DB，若查得到就用 People DB 上的 `person.name`；只有查不到對應的 People 記錄（例如非季租成員從未在 People DB 註冊）時，才 fallback 用 USERS 資料庫的 `customName`（見 `src/commands/registration/target-resolver.ts`）。

管理員才能代他人操作（非管理員發出代他人指令會被拒絕）。

## 跨平台 Mention 解析問題

LINE 電腦版和手機版的 `mentionees` 行為不一致：

| 平台 | `@Dobby @Vic +1` | `mentionees.length` |
|------|-----------------|---------------------|
| 手機版 | 正常 | 2（@Dobby + @Vic） |
| 電腦版 | 可能少 @Dobby | 1（只有 @Vic） |

**解法：一律取 `mentionees` 最後一個 `type === "user"` 的項目為目標。**

原因：
1. 手機版代操（2 個）：最後一個是目標
2. 電腦版代操（1 個）：最後一個是目標
3. 自己操作（0 個）：走 `isSelf` 分支，不進 mention 邏輯

實作位置：`src/commands/registration/registration-parser.ts`

## 請假邏輯

- 僅限**當季季租成員**
- 已請假者再次請假：回錯誤
- 未請假者銷假：回錯誤
- 請假成功後，名額立即增加（其他人可以報名）
- 資料寫入：Notion 行事曆的 `請假人`（Relation）欄位
- 同樣受 Mutex 保護

**例外**：管理員代非季租成員操作 `假`/`銷假` 時，回應是單一句「請假/銷假功能僅限季租成員使用」，**不是**上面「流程概覽」提到的完整名額狀態格式。這是刻意的：這個判斷發生在還沒抓到活動資料之前（對方根本不是季租成員，沒有「本週名額」的意義可顯示），不像其他失敗情境是在拿到活動資料後才判斷。
