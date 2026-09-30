# test-utils

測試輔助工具，讓 bot 測試更簡單。

## createTestBot

用一行指令驅動 bot，直接取得 LINE 回傳訊息。

### 基本用法

每個使用 `createTestBot` 的測試檔案開頭需要這 3 行 mock 宣告：

```ts
vi.mock('../services/notion/notion-fetch.js');
vi.mock('../config/line.js');
vi.mock('../services/mutex.js');
```

自動 mock 會把 `mutex.js` 的 `MutexTimeoutError` 也換成 mock class，在這種測試檔裡 `new MutexTimeoutError()` 產生的物件不是真的 `Error`。要測逾時分支時，改用部分 mock 保留真的 class，寫法見 `src/commands/registration/__tests__/with-fresh-calendar-event.test.ts` 開頭。

然後在測試中：

```ts
import { replyText } from '../../../test-utils/index.js';

const bot = createTestBot();
const messages = await bot.run('@Dobby +1', { userId: 'user-alice' });

// 直接看訊息內容——不要假設 messages[0] 一定有 .text：報名／請假的回覆現在
// 多半是 Flex 卡片（type: 'flex'），沒有 .text 欄位，只有 .altText。
expect(replyText(messages[0])).toContain('報名成功');

// 確認 Notion 有被寫入
expect(bot.notionPatchSpy).toHaveBeenCalledTimes(1);
```

### `replyText(message)`

`src/test-utils/reply-text.ts`。`text`/`textV2` 訊息回傳 `.text`，`flex` 訊息回傳 `.altText`（卡片的精簡文字版；狀態卡的規則見 `src/commands/registration/flex-status-card.ts` 的 `buildStatusCardAltText`，指令清單卡、名單卡見 ADR 0012、0013）。讓測試不用關心某個分支現在是純文字還是卡片，繼續用字串斷言內容；其他訊息型別會 throw，提醒你這個型別還沒被涵蓋。

**什麼時候不夠、要直接斷言卡片 contents**：`replyText()` 只看得到 altText 這一段精簡文字，卡片本身的徽章底色（`badgeColor`）、徽章圖示（`badgeIcon`）不會反映在 altText 裡——handler 把這兩個參數接錯，altText 斷言不會失敗。要驗證這類「卡片專屬」的欄位，得直接讀 `messages[0].contents`（`messagingApi.FlexBubble`），照卡片的巢狀 box/contents 結構往下找。`src/commands/registration/__tests__/flex-status-card.test.ts` 有一組導覽用小工具（`heroTitleRow`、`guestSectionRows` 等）；跨測試檔共用的版本在 `src/commands/registration/__tests__/card-nav.ts`（`cardHeroSummary`、`guestRows`），`registration-handler.test.ts`／`leave-handler.test.ts` 的每個結束分支都用它斷言徽章顏色／圖示／標題／副標題。名單卡（欠費、報名人）的版本在 `src/commands/__tests__/name-list-nav.ts`（`heroTitleOf`、`listNamesOf`）。

### Fixture Override（特定情境）

```ts
// 找不到活動
const bot = createTestBot({ calendar: { results: [] } });

// 自訂 season 成員
const bot = createTestBot({
  season: {
    results: [{ id: 'season-1', properties: { /* ... */ } }]
  }
});

// 自訂 announcement blocks
const bot = createTestBot({
  blocks: {
    'my-page-id': { results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: '...' }] } }] }
  }
});
```

### UserContext

```ts
await bot.run('@Dobby +1', {
  userId: 'user-alice',      // 必填，對應 users DB 的 user_id
  displayName: 'Alice',      // 選填
  groupId: 'group-123',      // 選填，模擬群組訊息
});
```

### 什麼時候不用 createTestBot

`routePost`／`routeGet`（`create-test-bot.ts`）只依 DB ID 路由到對應 fixture，**不解析 Notion query 的 filter body**——所以像「`seasonRepo.findByName(name)` vs `seasonRepo.findAll()[0]`」這種差異，在 `createTestBot` 底下永遠回傳一樣的結果，測不出行為差異。

遇到這種要斷言「呼叫了哪個 repository 函式／帶什麼參數」的情境，改用手動 `vi.mock()` 直接 mock 該 repository 模組，斷言呼叫參數即可（見
`src/commands/registration/__tests__/leave-handler.test.ts`）。這不是隨意繞過慣例——只有在 `createTestBot` 的 fixture routing 結構性測不出來時才這樣做；其他情境仍優先用 `createTestBot`。

---

## Fixtures

位置：`src/test-utils/fixtures/`

| 檔案 | 對應 |
|------|------|
| `calendar.json` | Calendar DB query response |
| `season.json` | Season DB query response |
| `people.json` | People DB query response |
| `users.json` | Users DB query response |
| `announcement.json` | Announcement DB query response |
| `blocks/<pageId>.json` | Blocks for a specific page |

### 更新 Fixture（對齊真實 API）

`src/test-utils/fixtures/*.json` 是**手工維護**的合成資料，用了像 `person-1`、
`user-alice` 這種可讀 ID，整個測試套件都依賴這些 ID 的對應關係。**不要**用真實
API 資料整批覆蓋這些檔案。

```bash
# 需要本地 .env 有真實 Notion 憑證
# 寫到 gitignored 的 .notion-snapshot/，不會動到 fixtures/
pnpm record-fixtures

# 手動比對 schema/欄位有沒有變化
diff <(cat .notion-snapshot/people.json) <(cat src/test-utils/fixtures/people.json)

# 只手動搬移「結構/欄位」的變動，保留 fixtures 裡的合成 ID
# 改完後確認測試仍通過
pnpm test
```

若 fixture 結構有變動影響到 handler 邏輯，需同步更新 production code。
