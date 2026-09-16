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
取得下一個週六的 Calendar 事件 + 當前 Season 資料
    │
    ▼
獲取 Mutex 鎖（key = calendar 頁面 ID，TTL 10 秒）
    │
    ├── 重新讀取最新 calendar 資料（避免 race condition）
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

失敗或邊界情況（名額不足、重複請假、未請假卻銷假、代他人操作對象不符資格等）也會回覆同一種「完整名額狀態」格式，只是第一行換成對應的說明，而不是只回一句話（`src/commands/registration/event-status-message.ts`）。

## 容量計算公式

```
可用名額 = 場地數 × 7 - 季租成員數 + 請假人數 - 已報名零打數
```

- **場地數**：當季的 `courts` 欄位
- **季租成員數**：當季 `members` 關聯的人員數量
- **請假人數**：本週行事曆 `請假人` 關聯的人員數量
- **已報名零打數**：本週行事曆 `零打` multi-select 的項目數量

管理員報名時**不受名額限制**。

非管理員 `+N` 超過剩餘名額時，**不會整筆拒絕**：改成報到剩餘名額為止，並在回覆說明「已達上限，僅報名 X 位」。剩餘名額恰好為 0（完全沒有名額可報）時才維持整筆拒絕，回「名額不足」。

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

取消報名時，以 prefix 比對：季租成員比對 `{姓名}的朋友`，非季租成員比對 `{姓名}`。

## Mutex 保護

報名和請假都需要「讀取 → 計算 → 寫回」三步驟。若兩個請求同時進行，可能產生資料覆蓋。

Mutex 以 calendar 頁面 ID 為 key，同一個活動一次只允許一個報名操作在執行。

同一個 key 的請求會排成 FIFO 佇列，後到的等前一個做完才執行，**不會直接拒絕**、不需要使用者重試。單次執行有 10 秒逾時保護，逾時只影響那一次執行，不會卡住後面排隊的請求。

```
src/services/mutex.ts
```

## Target Resolver（誰在報名）

### 三種情境

| 情境 | 判斷條件 | 處理方式 |
|------|----------|----------|
| 自己報名 | 無 mention | 查 USERS 資料庫取得 customName |
| @mention 指定 | 有目標 userId | 查 USERS 資料庫取得 customName |
| 名字指定（文字） | 有目標名字文字 | 查 People List 比對 |

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
