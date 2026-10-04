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
並行執行（互不相依）：
  ├── Target Resolver：判斷操作對象（self / mention userId / name 文字）
  └── 取得活動日（下週六）所屬季度的 Season 資料（供 isSelfSeasonMember 判斷）
  兩者都查無時，以找不到對象優先：報名回「找不到您的帳號，請先向管理員登記」、
  請假回「找不到您的資料」（管理員代報 @Name 時，兩者都改回「找不到「Name」的資料，請確認名稱與人員清單一致」）；
  對象有找到但 Season 查無，才回「找不到 YYYY-QN 季租資料」
  任一查詢 throw（Notion 5xx、網路錯誤、429 重試用完）→ handler 自己 catch，回「系統錯誤，請稍後再試」
  （還沒寫入任何東西，引導重試是安全的；這個 try 刻意不包 withFreshCalendarEvent，理由見 ADR 0002）
    │
    ▼
獲取 Mutex 鎖（key = 下一個週六的日期字串，同 key FIFO 排隊，見下方「Mutex 保護」）
    │
    ├── 排隊＋執行超過 10 秒 → 回「這次操作可能已經完成，請勿重複操作」，讀寫仍在背景完成
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
組訊息並回覆 LINE：新名單 + 剩餘名額 + 請假名單（目前在鎖內送出）
    │
    ▼
釋放 Mutex
```

失敗或邊界情況（名額不足、重複請假、未請假卻銷假等）也會回覆同一種「完整名額狀態」卡片，只是徽章顏色／圖示、標題、副標題換成對應的說明，而不是只回一句話。從取鎖開始的流程中，只有 `withFreshCalendarEvent` 統一處理的三種情況維持純文字：找不到活動、mutex 逾時（見下方「Mutex 保護」）、其他非預期錯誤（「系統錯誤，請稍後再試」）。取鎖前的檢查（指定對象語法錯誤、非管理員代操、查無對象、查無季資料、對象不是季租成員、查詢 throw 時的「系統錯誤」）也都是純文字，因為這些情況還沒有活動資料可以組卡片。例外情況見下方「請假邏輯」一節。

### 狀態卡（Flex）

報名／請假操作後的完整回覆是 LINE Flex 卡片：日期＋零打費用、徽章（顏色／圖示＋標題／副標題）、目前完整零打名單（空位合併成一行「還有 N 個空位」／「尚無人報名」，不逐格列出）、這次新增的條目標「新增」＋淺綠底色、請假名單（Notion 名字空白的人顯示「（未命名）」，因為 LINE 不收空字串的 text；永遠完整列出，不截斷）、本週出席人數，底部三顆按鈕（`+1 零打`／`−1 零打`／`請假`，見 `docs/commands.md`）。卡片 JSON 由純函式 `buildStatusCardBubble()` 組裝（`src/commands/registration/flex-status-card.ts`），`buildEventStatusReply()`（`src/commands/registration/event-status-message.ts`）另外把請假人 pageId 查成姓名，再組出完整的 `{ type: 'flex', altText, contents }` 訊息。改用卡片的取捨（altText 的用途、按鈕為何用 message action、圖片資產怎麼部署）見 [ADR 0010](adr/0010-registration-status-flex-card.md)。

各結束分支對應的徽章與文案（`{name}` 是操作對象的顯示名稱）：

| 情境 | 徽章顏色 | 徽章圖示 | 標題 | 副標題 |
|------|----------|----------|------|--------|
| 報名成功 | lime `#A3E635` | `check-dark.png` | 報名成功 | `{name} 報名 N 位` |
| 報名成功（被截斷，超過剩餘名額） | lime `#A3E635` | `check-dark.png` | 報名成功 | `{name} 報名 {實際位數} 位（名額已滿，原本要求 N 位）` |
| 取消報名成功 | gray `#737373` | `minus-white.png` | 取消報名成功 | `{name} 取消 N 位` |
| 名額不足（剩餘名額 ≤ 0） | orange `#FB923C` | `ban-dark.png` | 名額不足 | `名額不足，目前剩餘 0 個名額`（負數也顯示 0，見下方容量計算公式） |
| 本週活動暫停 | orange `#FB923C` | `ban-dark.png` | 本週活動暫停 | `本次活動已暫停，無法報名` |
| 無法取消（找不到報名紀錄） | orange `#FB923C` | `ban-dark.png` | 無法取消 | `找不到 {name} 的報名紀錄` |
| 無法取消（`+0`／`-0`，實際刪除數為 0） | orange `#FB923C` | `ban-dark.png` | 無法取消 | `取消數量需大於 0` |
| 請假成功 | blue `#60A5FA` | `calendar-x-dark.png` | 請假成功 | `{name} 本週請假，零打名額 +1` |
| 銷假成功 | lime `#A3E635` | `calendar-check-dark.png` | 銷假成功 | `{name} 已銷假，零打名額 −1` |
| 已經請過假（請假但已在請假名單，no-op） | gray `#737373` | `info-white.png` | 已經請過假 | `{name} 已請假，無需重複操作` |
| 目前未請假（銷假但沒請過假，no-op） | gray `#737373` | `info-white.png` | 目前未請假 | `{name} 目前未請假` |

顏色定義在 `src/commands/flex-card-parts.ts` 的 `BADGE_COLORS`（跟指令清單卡、名單卡共用，`flex-status-card.ts` 轉出同名 export）；圖示檔名在 `src/config/flex-assets.ts` 的 `FLEX_ICONS`。零打名單那行的「N / 總名額」若 `totalSlots` 因資料異動算出負數，顯示層一律 clamp 到 0（`Math.max(0, totalSlots)`），不影響名額判斷本身的計算。

**altText（精簡文字版）**：`buildStatusCardAltText()` 另外組一段純文字，保留 headline（含 ✅ 等既有措辭）、日期、零打名額與費用、只列已報名者的編號名單（不含空位列）、剩餘名額、請假名單（空白名字一樣顯示「（未命名）」）、總人數；不含舊版「若要報名請輸入 @Dobby +1」這類提示。這段文字身兼三種用途：LINE 推播通知顯示的內容、`/logs` 看得到的內容（`reply-service.ts` 把 flex 訊息記成 `[flex] ${altText}`）、以及測試斷言的來源（`src/test-utils/reply-text.ts` 的 `replyText()`）。超過 400 字會截斷並以「…」結尾。

季度是用**活動日**判斷，不是用今天：季末最後一週報名時，下週六可能已經屬於下一季，要用下一季的季租名單判斷身分與名額。原因與事故背景見 [ADR 0008](adr/0008-season-derived-from-event-date.md)。

## 容量計算公式

```
可用名額 = 場地數 × 7 - 季租成員數 + 請假人數 - 已報名零打數
```

- **場地數**：本週行事曆的 `場地數`，未填則用當季的 `courts` 欄位（`resolveCourts()`，`src/commands/registration/capacity-calculator.ts`）。`calculateTotalSlots` 內部就會套用這個 fallback，所以報名時的名額判斷（`calculateAddCapacity`）、請假／銷假後重算的名額、週報顯示都一致。為什麼 fallback 只能寫在這一處，見 [ADR 0007](adr/0007-calendar-courts-fallback-in-one-place.md)
- **季租成員數**：活動日所屬季度的 `members` 關聯人員數量
- **請假人數**：本週行事曆 `請假人` 關聯的人員數量
- **已報名零打數**：本週行事曆 `零打` multi-select 的項目數量

管理員報名時**不受名額限制**，但這只在活動未暫停的前提下成立：`calculateAddCapacity`（`src/commands/registration/capacity-calculator.ts`）一開始就檢查活動是否為「打球暫停」，若已暫停會直接拒絕（回「本次活動已暫停，無法報名」），這個檢查在判斷是否為管理員**之前**，管理員也一樣會被擋下。

非管理員 `+N` 超過剩餘名額時，**不會整筆拒絕**：改成報到剩餘名額為止，並在回覆說明「已達上限，僅報名 X 位」。剩餘名額恰好為 0（完全沒有名額可報）時才維持整筆拒絕，回「名額不足」。若季資料異動導致 `availableSlots` 算出負數（既有零打數已超過總名額），錯誤訊息一律顯示「剩餘 0 個名額」，不顯示負數。

取消報名（`calculateRemoveCapacity`）若算出的實際刪除數為 0（例如指令解析出 `-0`／`+0`，或目標存在但要求刪除 0 筆），一律回「取消數量需大於 0」的錯誤，不寫入 Notion，也不會誤回「取消報名成功」——這與「找不到報名紀錄」時同樣不寫入、同樣回錯誤的行為一致。

## Guest 命名規則

### 季租成員帶朋友
```
第一位：{姓名}的朋友
第二位：{姓名}的朋友 (2)
第三位：{姓名}的朋友 (3)
```

### 非季租成員（零打本人）
```
第一位：{姓名}
第二位：{姓名} (2)
第三位：{姓名} (3)
```

取消報名時，用完整相等或明確的編號後綴邊界比對（例如非季租成員的 `{姓名}` 或 `{姓名} (2)`），**不能**用單純的字串前綴（`startsWith`）比對——曾經發生過因為名字互為前綴（如 `"Al"` 對 `"Alice"`）誤刪別人報名的資料安全漏洞，見 `docs/code-review-2026-09-17.md` 第 4.2 節。

取消多筆時，會優先刪編號最大的那筆，沒有編號的那筆（第一位）留到最後才刪。原因：`event.guests` 的既有順序不保證編號由小到大排列，若照陣列原始順序刪除，常常會先刪到沒有編號的第一位、留下 `{姓名}的朋友 (2)` 卻沒有 `{姓名}的朋友`，讓人誤以為第一位不見了（2026-09-25 正式環境實際發生過）。

新增條目時的編號也不是每次從頭算：會先掃描活動目前的 `零打` 清單，找出這個人已經用到的最大編號再接續，而不是每次呼叫都重算成同一個編號——因為 `零打` 是 Notion 的 multi_select 欄位，重複的名字字串會被 Notion 靜默去重合併成一筆，不接續編號會悄悄弄丟報名資料。細節見 `docs/adr/0004-guest-name-must-be-globally-unique.md`。

## Mutex 保護

報名和請假都需要「讀取 → 計算 → 寫回」三步驟。若兩個請求同時進行，可能產生資料覆蓋。

Mutex 以活動日期字串為 key（不是 calendar 頁面 ID，這樣不用多一次查詢才能知道要鎖哪個 key），同一個活動一次只允許一個報名操作在執行。

同一個 key 的請求會排成 FIFO 佇列，後到的等前一個做完才執行，**不會直接拒絕**、不需要使用者重試。每次呼叫有 10 秒逾時保護，從呼叫 `withMutex` 起算，**包含排隊時間**，所以尖峰時排在後面的人可能在自己的讀寫還沒開始前就逾時。逾時只影響「這次呼叫端等多久」——背後真正的讀寫仍會在背景跑到完成，後面排隊的請求會等它真正完成才開始，不會因為前一個逾時就提早用舊資料搶跑。

逾時時使用者會收到「處理時間較長，這次操作可能已經完成，請勿重複操作。如需確認，請洽管理員。」，而不是「系統錯誤」。因為背景的讀寫之後仍可能成功，而 `+N`／`-N` 不是冪等的，重試會重複報名或多取消一筆。訊息不引導使用者用 `next` 自己確認，因為 `next` 限管理員使用。細節與這個設計取捨的原因見 `docs/adr/0002-mutex-timeout-does-not-cancel-task.md`。

### 從 log 看鎖競爭

每個 `withMutex` 任務在 `fn()` **真正結束**時記一行 `Mutex task finished`，同一個 reqId，欄位：

| 欄位 | 意思 |
|------|------|
| `key` | 鎖的 key（報名／請假是活動日期） |
| `queuedAhead` | 這次呼叫進來時，同一個 key 前面還沒真正結束的任務數（排隊中＋執行中）。前一個呼叫端已逾時、但 `fn()` 還在背景跑的任務也算在內 |
| `waitMs` | 從呼叫 `withMutex` 到 `fn()` 開始，也就是排隊等前面任務的時間 |
| `heldMs` | `fn()` 從開始到真正結束的時間，就是實際持有鎖的時間；呼叫端逾時後仍會量到背景跑完為止 |
| `callerTimedOut` | 呼叫端是否已經因 10 秒逾時放棄等待 |
| `fnFailed` | `fn()` 是否丟出錯誤。呼叫端逾時後，背景任務失敗只有這個欄位看得到，錯誤本身不會再被任何人記下。注意報名／請假「找不到活動」也會是 `true`：`withFreshCalendarEvent` 是在鎖內丟 `EventNotFoundError` 再由 wrapper 接住，這是正常流程，不是失敗（看同一 reqId 的 `… outcome` 是不是 `event-not-found`） |

看法：`queuedAhead > 0` 表示有人同時操作同一場活動；`waitMs` 大而 `heldMs` 正常是被前面的人拖住，`heldMs` 本身就大則是鎖內的 Notion 呼叫或 LINE 回覆慢（對照同一 reqId 時間軸上的各步 `durationMs`）。逾時時，呼叫端那一行 warn 也帶 `queuedAhead`，摘要則要等背景任務跑完才寫出，會排在該事件 `Event processed` 之後。

等級依 key 格式決定：key 是純日期（`YYYY-MM-DD`）才記 info，其他 key 一律 debug。`user-track-${userId}` 這種含 userId 的 key 因此不會把 userId 寫進 info 層（ADR 0005）；之後新增的 key 格式預設也走 debug，要放 info 得先確認 key 不含身分資訊，再改 `mutex.ts` 的 `INFO_SUMMARY_KEY`。

```
src/services/mutex.ts
```

## Target Resolver（誰在報名）

### 三種情境

| 情境 | 判斷條件 | 處理方式 |
|------|----------|----------|
| 自己報名 | 無 mention | 直接沿用 `message-handler` 開頭查到的 USERS 記錄，不重查；那時查無此人（`null`）才重新查一次 USERS——群組裡第一次發言就下指令的新使用者，會先等記錄建好才走到這步（見 `docs/notion/databases.md` USERS 小節），所以開頭的 `null` 已經過時，不能當成「沒有帳號」（見 [ADR 0009](adr/0009-actor-users-snapshot-non-null-only.md)） |
| @mention 指定 | 有目標 userId | 查 USERS 資料庫取得對應 userId 的記錄 |
| 名字指定 | `@名字` 沒帶 userId（LINE 電腦版的 mention），或 @mention 的 userId 查不到 USERS 記錄 | 用 `@` 後面的文字查 People List 比對 |

「自己報名」「@mention 指定」這兩種情境查到 USERS 記錄後，顯示名稱不是直接用 `customName`：會**優先**用該 user 的 `registeredPersonPageId` 去查 People DB，若查得到就用 People DB 上的 `person.name`；只有查不到對應的 People 記錄（例如自動建立人員頁面前就存在、`Registered name` 空著的舊使用者，或建立時遇到同名而跳過的人）時，才 fallback 用 USERS 資料庫的 `customName`（見 `src/commands/registration/target-resolver.ts`）。新使用者會自動連到一個以當下 LINE 名稱命名的 People 頁面（見 `docs/notion/databases.md` USERS 小節），該頁面 `Name` 不隨 LINE 改名同步，所以這些人報名時顯示的是建立當下的名稱，直到管理員修改。

「名字指定」用 `findByName` 以 People `Name` 精確比對、取第一筆。沒有 `@` 的純文字（例如 `@Dobby +1 名字`）不會走到這裡，會直接回「指令格式錯誤：指定對象需使用 @Name」。因為新使用者都會自動建立 People 頁面，現在用他們建立當下的 LINE 名稱也能被名字指定找到，他們不在任何季度的 `報名人`，所以會以零打身分處理；但使用者之後在 LINE 改名，mention 帶出的新名字就對不上 People `Name`（不同步）。人員清單若有同名頁面，取到哪一筆不保證——被 @ 的人不在 USERS、而名字剛好跟別人的頁面相同時，會報到那個人名下。

管理員才能代他人操作（非管理員發出代他人指令會被拒絕）。`handleRegistration`／`handleLeave` 檢查順序是先判斷 `target.parseError`（指定對象語法錯誤，例如漏了 `@`）、再判斷是否為管理員：語法錯誤跟權限無關，優先回報，避免一般成員打錯 `@Name` 語法時被誤導以為是權限問題（收到「你不是管理員」而非「指令格式錯誤：指定對象需使用 @Name」）。

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

- 僅限**活動日所屬季度的季租成員**（季末最後一週請下一季活動的假，看的是下一季名單，見 [ADR 0008](adr/0008-season-derived-from-event-date.md)）
- 已請假者再次請假：回錯誤
- 未請假者銷假：回錯誤
- 請假成功後，名額立即增加（其他人可以報名）
- 資料寫入：Notion 行事曆的 `請假人`（Relation）欄位
- 同樣受 Mutex 保護

**例外**：管理員代非季租成員操作 `假`/`銷假` 時，回應是單一句「請假/銷假功能僅限季租成員使用」，**不是**上面「流程概覽」提到的完整名額狀態格式。這是刻意的：這個判斷發生在還沒抓到活動資料之前（對方根本不是季租成員，沒有「本週名額」的意義可顯示），不像其他失敗情境是在拿到活動資料後才判斷。活動日所屬季度的季租資料不存在（例如季末最後一週還沒建下一季紀錄）時，同樣在抓活動資料前就回單一句，但回的是「找不到 YYYY-QN 季租資料」，不是「僅限季租成員」，以免讓真正的季租成員誤以為自己不在名單上。

## 決策摘要 log

報名（`+N`／`-N`）和請假（`假`／`銷假`）的每個結束分支都會記**一行 info** 決策摘要，被拒絕、no-op 的分支也有，不用點開 debug 的回覆全文就看得出這次怎麼判的。訊息字串固定兩個：

- 報名：`Registration handler outcome`
- 請假：`Leave handler outcome`

跟 `withFreshCalendarEvent` 逾時／錯誤時的 `Registration handler timed out; …`／`Registration handler error` 同一個前綴（handler 傳給 wrapper 的 `context`）。取鎖前的查詢 throw 時，handler 自己也會記同名的 `… error`，見下方「outcome 行不是每個事件恰好一行」的例外清單。有 debug 明細的分支，另外記一行 `… outcome detail`（debug）。helper 在 `src/commands/registration/outcome-log.ts`。

**等級一律 info，不能用 warn**：`/logs` 的事件狀態會掃所有行的等級（`src/routes/logs.ts` 的 `groupStatus`），用 warn 會讓「名額不足」「已請假」這類正常的拒絕被標成「警告」。

### `outcome` 列舉

| outcome | 報名 | 請假 | 分支 |
|---------|:---:|:---:|------|
| `parse-error` | ✓ | ✓ | 指定對象沒用 `@`（取鎖前） |
| `not-admin` | ✓ | ✓ | 非管理員代他人操作（取鎖前） |
| `target-not-found` | ✓ | ✓ | `resolveTarget` 回 `null`（取鎖前） |
| `season-not-found` | ✓ | ✓ | 活動日所屬季度的 Season 查無（取鎖前） |
| `not-season-member` | | ✓ | 對象不在該季 `報名人`（取鎖前） |
| `event-not-found` | ✓ | ✓ | 鎖內查無下週六的活動，由 `withFreshCalendarEvent` 記 |
| `paused` | ✓ | | 活動是「打球暫停」（管理員也會被擋） |
| `full` | ✓ | | 非管理員、剩餘名額 ≤ 0 |
| `no-registration` | ✓ | | `-N`（N ≥ 1）但對象沒有零打條目 |
| `zero-delta` | ✓ | | `+0`／`-0`：走取消路徑且一律被拒，回覆是「找不到…的報名紀錄」或「取消數量需大於 0」（看有沒有條目），不是「報名被拒」 |
| `added` | ✓ | | `+N` 寫入成功（被截到剩餘名額時帶 `cappedAt`） |
| `removed` | ✓ | | `-N` 寫入成功 |
| `already-absent` | | ✓ | 已請假又請假（no-op） |
| `not-absent` | | ✓ | 未請假卻銷假（no-op） |
| `leave-recorded` | | ✓ | 請假寫入成功 |
| `leave-cancelled` | | ✓ | 銷假寫入成功 |

outcome 行不是「每個事件恰好一行」，例外有這些：

- **mutex 逾時**：當下沒有 outcome，wrapper 已有 warn。背景的讀寫跑完後，它自己的 outcome 仍會用同一個 reqId 寫出，時間軸上排在 `Event processed` 之後。例外：背景 refetch 才發現沒有活動時，`EventNotFoundError` 會被 mutex 吞掉，不會有 `event-not-found` 行（很少見）。
- **鎖內非預期錯誤**：wrapper 的 `… error` 那行就是結果。outcome 是在判斷完、組回覆訊息之前記的，所以如果是組訊息時（`buildEventStatusReply` 查請假人姓名）才 throw，會同時有 outcome 行和 error 行——outcome 代表判斷結果（寫入成功的分支代表已經寫入），error 代表回覆沒送出。
- **取鎖前的查詢 throw**（`resolveTarget`／`seasonRepo.findByName`）：沒有 outcome，也不經過 wrapper；handler 自己記一行跟 wrapper 同名的 `… error`（`Registration handler error`／`Leave handler error`），並回「系統錯誤，請稍後再試」。對象查無但 Season 查詢 throw 時，也是回「系統錯誤」，不是「找不到您的帳號」「找不到您的資料」這類查無對象的回覆，因為兩個查詢並行，`Promise.all` 整個 reject。

報名被拒的四種（`paused`／`full`／`no-registration`／`zero-delta`）是 handler 依 `delta` 和 `isPaused` 推出來的（`registration-handler.ts` 的 `rejectionOutcome()`），因為 `CapacityResult` 只有給使用者看的錯誤文字。**`capacity-calculator.ts` 如果新增拒絕路徑，`rejectionOutcome()` 要一起改**，不然會被歸成 `full` 或 `no-registration`。

### 欄位

欄位依分支拿得到的為準，愈後面的分支欄位愈多。**`event-not-found` 例外**：它在 wrapper 裡記，只有 `outcome` 和 `date`，看不出是 `+N` 還是 `-N`（`假` 還是 `銷假`），要看同一個 reqId 的 `Routing command`（debug）。下表不含這一支：

| 欄位 | 從哪個分支開始有 | 來源 |
|------|------------------|------|
| `requestedDelta`（報名）／`isCancel`（請假）、`isAdmin` | 全部（`event-not-found` 除外） | handler 參數 |
| `date`、`seasonName` | `target-not-found` 起 | `getNextSaturday()`、`getSeasonNameForDate()`；`parse-error`、`not-admin` 在這之前就 return |
| `targetRequest` | 只有 `target-not-found` | 指令要找誰：`self`／`mention`／`name`（`describeTargetRequest()`） |
| `resolvedVia` | `season-not-found` 起 | `resolveTarget` 怎麼找到對象：`self`、`mention`、`mention-name-fallback`（mention 的 userId 不在 USERS，改用姓名查 People）、`name`（電腦版 mention 或 `@名字`） |
| `isSelfSeasonMember` | 報名鎖內 | 對象的 People 頁在不在該季 `報名人`；沒有 People 頁（`personPageId` 空字串）時為 false。請假不記：過了 `not-season-member` 那關就恆為 true |
| `courts`、`totalSlots`（報名）／`totalSlotsBefore`（請假）、`guestCountBefore`（報名）／`guestCount`、`absenteeCountBefore`（請假） | 鎖內 | `getEventOccupancy()`，寫入**前**的數字 |
| `guestCountAfter` | `added`／`removed` | `updatedGuests.length` |
| `cappedAt` | 只有被截到剩餘名額的 `added` | `CapacityResult.cappedAt`（其他情況是 undefined，不會輸出） |
| `totalSlotsAfter`、`absenteeCountAfter`、`presentSeasonMembersAfter` | `leave-recorded`／`leave-cancelled` | handler 自己重算的 `newTotalSlots`／`newAbsentees.length`／`newPresentSeasonMembers`（`occupancy` 只有寫入前的數字） |
| `targetDisplayName` | 只有寫入成功的四種 | 沿用改版前成功摘要就有的欄位，姓名放 info 是 ADR 0005「現況」段待決的 PII，新分支不加 |

**姓名、userId、零打條目只放 debug 明細**（零打條目本身就是姓名，例如 `Alice的朋友 (2)`）。`… outcome detail` 的欄位：`actorUserId`（handler 內的每個分支）、`targetPersonPageId`（找到對象後）、`targetUserId`／`targetName`（`target-not-found`，指令裡帶的 mention userId 和 `@` 後面的文字）、`addedGuests`（`added`，`updatedGuests.slice(寫入前的零打數)`，依賴 calculator 把新條目接在既有條目後面）、`removedGuests`（`removed`）。`event-not-found` 在 wrapper 裡記，拿不到這些，所以沒有明細行。
