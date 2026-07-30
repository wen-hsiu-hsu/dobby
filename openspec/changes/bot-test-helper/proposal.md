# bot-test-helper

## 問題
現有測試痛點：
- 需要手動 mock LINE client、組 event 物件、mock fetch、設定 env
- 只能斷言 `replyMessage` 有沒有被呼叫，看不到實際訊息內容
- registration/leave 指令的 `notionPatch` 有污染真實資料的風險
- Notion fixture 資料靠手動維護，容易與真實 API drift

## 目標
1. `createTestBot` helper — 用一行指令驅動 bot 並拿到 `Message[]`
2. `notionPatch` 在測試中自動 no-op，提供 spy 可斷言
3. `record-fixtures` script — 打真實 Notion API 產生 raw JSON fixture
4. mock 攔截以 fixture 為資料來源，不處理 filter（回傳第一筆）

## 範圍外
- 不改 production code 架構
- CI 無憑證環境不支援 record-fixtures（可接受）
- 不處理 mock filter 邏輯

## 目標 API

```ts
// 基本使用
const bot = createTestBot();
const messages = await bot.run('@Dobby +1', { userId: 'u1' });
expect(messages[0].text).toContain('報名成功');

// 覆蓋 fixture（特定情境）
const bot = createTestBot({ calendar: { results: [] } });
const messages = await bot.run('@Dobby +1', { userId: 'u1' });
expect(messages[0].text).toContain('找不到');

// 驗證寫入行為
expect(bot.notionPatchSpy).toHaveBeenCalledTimes(1);
```

## Fixture 結構

```
src/test-utils/fixtures/
  calendar.json
  season.json
  people.json
  users.json
  announcement.json
  blocks/
    <pageId>.json
```

每個 fixture 為對應 DB query 的 raw Notion API response。

## Mock 攔截策略

- `notionPost` — 依 path 中的 DB env var 名稱對應到 fixture，回傳 `results[0]` 或全部 results
- `notionPatch` — no-op + spy
- `reply-service.replyMessage` — 捕捉 messages，不打 LINE API
- `withMutex` — 直接執行，不等鎖

## 更新流程

```
pnpm record-fixtures   # 需要本地 .env 有真實憑證
git diff fixtures/     # 確認哪裡變了
pnpm test              # 確認測試仍通過
```
