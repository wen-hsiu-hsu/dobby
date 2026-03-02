# Bot Logic Issues — 待修復清單

> 時區：Asia/Taipei
> 季度定義：Q1=1~3月, Q2=4~6月, Q3=7~9月, Q4=10~12月

---

## Issue 1: `participants` 未根據當前時間判斷季度 ✅ 已修復

**嚴重度：🔴 高**

**問題：**
`src/commands/participants.ts` 直接取 `seasons[0]`（Notion 第一筆），沒有根據當前時間（Asia/Taipei）過濾出正確的季度。

**根本原因（調查後發現）：**
- Season DB 的 title 欄位實際名稱為 `季租時段`（非 `Name`），格式為 `YYYY-QN`（如 `2026-Q1`）
- Members 欄位實際名稱為 `報名人`（非 `Members`）
- `startDate` / `endDate` 欄位不存在於 DB
- `season-repository.ts` 的 `pageToRecord` 和 `findByName` filter 都使用錯誤的英文欄位名稱

**修復內容：**
1. `src/types/notion-models.ts` — 移除不存在的 `startDate`/`endDate` 欄位
2. `src/services/notion/season-repository.ts` — 修正欄位名稱（`Name`→`季租時段`、`Members`→`報名人`），修正 `findByName` filter
3. `src/utils/date-utils.ts` — 新增 `getCurrentSeasonName()` 使用 `Intl` API + `Asia/Taipei` 時區，回傳 `YYYY-QN`
4. `src/commands/participants.ts` — 改用 `findByName(getCurrentSeasonName())` 取得當季資料

---

## Issue 2: `payment` 回傳靜態文字而非未付款名單

**嚴重度：🟡 中（需釐清規格）**

**問題：**
`src/commands/payment.ts` 從 Announcement DB 取 Name='PAYMENT' 的靜態文字（付款說明），而非未付款人員名單。

**需確認：**
- `payment/付款` 指令的設計意圖是「付款方式說明」還是「未付款名單」？
- 若是未付款名單，則邏輯應與 `owe` 相同
- 若是付款說明，則現有邏輯正確，規格說明需修正

**PEOPLE DB 欄位說明（已確認）：**
- 未付款判斷欄位：`結清`（formula boolean），`false` = 未付清
- 不存在 `Has Paid` 欄位
- `owe` 指令已修正為使用 `結清` 欄位（`formula: { checkbox: { equals: false } }`）

**相關檔案：**
- `src/commands/payment.ts`
- `src/commands/owe.ts`（可能合併或參考）

---

## Issue 3: `+/-N` 名額計算公式與規格不符

**嚴重度：🔴 高**

**規格公式：**
```
可報名數 = (該季場地數 × 7 - 該季報名人數 + 該次請假人數) + 已報名零打數量
```
其中「已報名零打數量」加入是為了讓使用者知道「含已報名的總容量」，
實際「還能再報」= 該季場地數 × 7 - 該季報名人數 + 該次請假人數 - 已報名零打數量

**實作公式（錯誤）：**
```typescript
// capacity-calculator.ts
const totalCapacity = (members - absentees) + 14;
const availableSlots = 14 - currentGuests;  // 跟季打人數無關
```

**差異：**
| 條件 | 規格 | 實作 |
|------|------|------|
| 2場地,10季打,0請假,3已報零打 | 2×7-10+0-3 = 1 | 14-3 = 11 |

**待確認：**
- 「該季場地數」欄位從哪裡來？CalendarEvent 或 SeasonRecord 有這個欄位嗎？
- 若沒有，是寫死 2 場地還是從 Notion 讀取？

**相關檔案：**
- `src/commands/registration/capacity-calculator.ts`
- `src/types/notion-models.ts`（CalendarEvent, SeasonRecord）

---

## Issue 4: `command/指令` handler 需確認完整性

**嚴重度：⚠️ 待確認**

**問題：**
explore 時未取得 `command` handler 的詳細內容，需確認：
1. handler 是否存在且正確回應
2. 列出的指令是否完整（包含所有非管理員指令）
3. 是否有遺漏的指令

**相關檔案：**
- `src/commands/command-list.ts`（推測路徑）
- `src/commands/command-router.ts`

---

## Issue 5: date-utils 時區未明確設定為 Asia/Taipei ✅ 已修復

**嚴重度：🟡 中**

**問題：**
`src/utils/date-utils.ts` 的 `getNextSaturday()`、`getQuarter()` 使用 `new Date()`，依賴伺服器系統時區。若伺服器在 UTC，台灣時間的 00:00~07:59 會計算到前一天。

**Scheduler 有正確設定時區：**
```typescript
cron.schedule('...', fn, { timezone: 'Asia/Taipei' });
```

**修復方向：**
在 date-utils.ts 中，取得「現在時間」時明確轉換為 Asia/Taipei，例如使用 `Intl` API 或 `date-fns-tz`。

**相關檔案：**
- `src/utils/date-utils.ts`

---

## 修復優先順序

1. **Issue 3** — 名額計算公式（需先釐清「該季場地數」來源）
2. **Issue 1** — participants 季度判斷
3. **Issue 2** — payment 規格確認後修復
4. **Issue 4** — command list 確認
5. **Issue 5** — 時區處理
