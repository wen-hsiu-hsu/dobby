# 指令說明

所有指令以 `@Dobby` 開頭（全形 `＠Ｄｏｂｂｙ` 不支援，但 `＋`/`－` 可以用全形；`@Dobby` 前綴本身大小寫敏感，例如 `@dobby` 不會被辨識為指令）。

英文指令關鍵字（`owe`／`command`／`participants`／`people`／`next`／`news`／`announcement`／`payment`／`season`）不分大小寫，例如 `@Dobby NEWS`、`@Dobby News` 都等同 `@Dobby news`。`season` 後面接的季度代碼（如 `2026Q2`）不受影響，維持照打字原樣（見 `src/commands/season-announcement.ts` 對代碼格式的解析）。中文指令關鍵字（`假`／`銷假`／`指令`／`報名人`／`公告`／`付款`／`欠`）不受此規則影響。

## 一般指令

### 自我介紹
```
@Dobby
```
Dobby 會介紹自己並 @mention 觸發者和管理員。

---

### 查看指令清單
```
@Dobby command
@Dobby 指令
```
回覆內容依觸發者身分不同：一般成員只看得到本節（一般指令）跟下面「報名或請假類」；管理員額外多一個「管理員專用」章節（`next`、`season`、代他人報名），一般成員完全看不到這個章節存在（見 `src/commands/command-list.ts`）。

---

### 查看公告
```
@Dobby news
@Dobby 公告
@Dobby announcement
```
讀取 Notion「所有公告」資料庫中名為 `NEWS_TEMPLATE` 的頁面，套用當季季租資料後回傳。內容裡的 `{PLACEHOLDER}` 會被即時抓取的資料取代：

| 變數 | 內容 |
|------|------|
| `{SEASON}` | 季度名稱，如 `2026-Q3` |
| `{FROM_TO_MONTH}` | 季度月份範圍，如 `7~9月` |
| `{TOTAL_PEOPLE}` | 當季報名人數 |
| `{LIST_ALL_PEOPLE}` | 當季報名人名單，頓號分隔的單行（`許文修、陳玟育、...`） |
| `{PRICE_PER_PERSON_FOR_SEASON}` | 每人平均場租，無條件進位到整數（僅供參考，非實際繳費金額）。預設是 Notion formula「每人平均場租」算出來的值；若「每人平均場租（特殊狀況）」欄位有填值，改顯示該手動覆寫值，不再用 formula 值（見 `src/commands/news.ts`） |
| `{PRICE_PER_PERSON_FOR_ONCE}` | 零打（單次）費用 |
| `{COURT_COUNT}` | 當季預設場地數（季租承租紀錄的 `場地數`，不含行事曆單週調整） |
| `{WEEK_COUNTS}` | 本季租借次數 |
| `{TOTAL_PRICE}` | 場租總金額 |
| `{LIST_ALL_DATES}` | 本季所有打球日期，依月份分行、同月用 `, ` 相隔，格式 `M/DD`（如 `7/04, 7/11`） |
| `{LOCATION}` | 打球地點 |

Notion 內容裡的 `bulleted_list_item`（項目符號清單）在輸出時會自動補上 `• ` 前綴。改公告文字內容（包含新增備註句子）要去 Notion 改 `NEWS_TEMPLATE` 頁面，不用改 code；但若要新增/修改變數本身或格式，需同步改 `src/commands/news.ts`。

---

### 查看付款資訊
```
@Dobby payment
@Dobby 付款
```
顯示付款說明（支援 bulleted list 格式）。

---

### 查看報名人員
```
@Dobby participants
@Dobby people
@Dobby 報名人
```
顯示當季的季租報名人員清單。

---

### 查看欠費名單
```
@Dobby owe
@Dobby 欠
```
顯示本季尚未繳費的成員名單。

---

## 報名指令

### 報名零打（自己）
```
@Dobby +1
@Dobby +2
```
- 若你是**季租成員**：報名朋友（`你的朋友`、`你的朋友 (2)`...）
- 若你**不是季租成員**：以你的名字報名（`你的名字`、`你的名字 (2)`...）

### 取消報名
```
@Dobby -1
@Dobby -2
```
取消你（或你的朋友）的報名紀錄。有多筆時，優先取消編號較大的那筆（例如同時有 `你的朋友` 和 `你的朋友 (2)`，`-1` 會先刪 `你的朋友 (2)`），沒有編號的那筆留到最後才刪，避免清單看起來像少了第一位。

---

## 請假指令

僅限**當季季租成員**使用。

### 請假
```
@Dobby 假
```
登記本週請假。成功後系統會自動釋出零打名額。

### 銷假
```
@Dobby 銷假
```
取消請假紀錄。

---

## 管理員指令

以下指令需要 `is_admin = true`（在 USERS 資料庫設定）。

### 代他人操作
管理員可以在指令中 @mention 目標，代替他人報名或請假：

```
@Dobby +1 @Vic        ← 幫 Vic 報名
@Dobby @Vic 假        ← 幫 Vic 請假
@Dobby @Vic 銷假      ← 幫 Vic 銷假
@Dobby -1 @Vic        ← 幫 Vic 取消報名
```

報名／取消報名時 `+N`/`-N` 跟 `@mention` 的前後順序皆可解析（`@Dobby @Vic +1` 也可以），上面採用跟 `@Dobby command` 指令說明文字（`src/commands/command-list.ts`）一致的順序。

**注意：** 電腦版 LINE 的 @mention 有時無法正確傳遞，建議用手機操作代他人指令。

### 查看本週打球資訊
```
@Dobby next
```
管理員可查看下次打球的完整資訊。回覆內容跟每週打球資訊推播（`docs/schedulers.md`）完全同一套訊息格式，由 `src/commands/weekly-status-message.ts` 的 `buildWeeklyStatusMessage()` 共用產生 —— `next` 只是手動查看目前狀態的方式，不是另一種摘要格式。

### 產生新一季公告草稿
```
@Dobby season 2026Q2
```
依指定季度（`YYYY` + `Q1`~`Q4`，接受無 hyphen／小寫 q，如 `2026Q2`、`2026-Q2`、`2026q2`）產生下一季公告草稿，套用 Notion「所有公告」資料庫中 `NEW_SEASON` 頁面的模板，回傳後由管理員自行潤飾再手動發布——不會自動發到群組。

模板內容裡的 `{PLACEHOLDER}` 會被即時抓取的資料取代：

| 變數 | 內容 |
|------|------|
| `{SEASON_TITLE}` | 季度標題，如 `2026 Q2 (4~6月)` |
| `{SEASON_SHORT}` | 季度標題（不含月份範圍），如 `2026 Q2` |
| `{TOTAL_PEOPLE}` | 指定季報名人數 |
| `{ALL_MEMBERS_MENTIONS}` | 指定季報名人 mention 清單，空格分隔（`@Alice @Bob ...`） |
| `{WEEK_COUNTS}` | 指定季租借次數（`租借次數 (2hrs)`） |
| `{GUEST_FEE}` | 指定季零打費用 |
| `{PAYMENT_INFO}` | `PAYMENT` 公告內容（跟 `payment` 指令同一份資料） |
| `{COURT_PRICE}` | 每場/小時定價 |
| `{COURT_COUNT}` | 指定季場地數 |
| `{TOTAL_PRICE}` | 指定季場租總金額 |
| `{PLAY_DATES}` | 指定季所有打球日期，依月份分行（同 `news` 的 `{LIST_ALL_DATES}`） |
| `{GUEST_SLOTS_BASELINE}` | 零打名額 baseline：`場地數 * 7 - 報名人數`（無人請假時的名額數） |
| `{CONTINUING_MEMBERS_MENTIONS}` | 續打名單：指定季有報名、上一季也有報名的人 |
| `{NEW_MEMBERS_MENTIONS}` | 新朋友名單：指定季有報名、上一季沒有報名的人 |
| `{REFUND_MEMBERS_MENTIONS}` | 退費名單：指定季沒報名、上一季有報名的人 |
| `{PREV_QUARTER}` | 上一季的季度數字（如指定 `2026-Q2` → 上一季 `2026-Q1` → 顯示 `1`）。跨年時上一季會回推到前一年 Q4（如 `2027-Q1` 的上一季是 `2026-Q4`） |

Mention 名單一律用「Custom Name」（LINE 顯示名稱）+ `@` 前綴，不是真正會通知對方的 LINE mention，僅供貼上群組前手動編輯。找不到對應 USERS 記錄時 fallback 用人員清單的 `Name`。

模板裡所有 `$xxx` 都是字面文字，不做任何運算替換，由管理員產生草稿後自行填入金額。

模板用 8 個連續 `—`（`————————`）分隔三則子公告，bot 會依此切成最多 3 則 LINE 訊息回覆；模板內部段落間的單一 `—` 只是斷行用，不會被當作分隔點。LINE reply 一次最多允許 5 則訊息，若改模板時不小心讓分隔線切出超過 5 段，bot 不會硬送、而是回一則錯誤訊息提醒檢查模板。

---

## 自動回覆

管理員的訊息**不會**觸發自動回覆。

自動回覆規則是靜態 JSON 檔（`src/data/auto-reply.json`，由 `scripts/convert-auto-reply.mjs` 從 CSV 轉換），非 Notion 資料庫。以關鍵字 `includes()` 比對（區分大小寫）。改規則需重新轉換 + 部署，非即時生效。
