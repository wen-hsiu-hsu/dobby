# Dobby 程式碼審查報告（2026-09-17）

> **2026-09-19 補註**：本報告是 2026-09-17 當時程式碼的稽核快照，內文不因後續修復而回頭編輯（修好的項目改記在 `TODO.md`）。2026-09-19 的「移除雙 bot 架構」重構把本報告 2.3、5.7 兩節與「本模組確認沒問題的地方」提到的 `botId`/`getClient(botId)`/`middlewareByBotId` 雙 client 派發機制**整段拿掉**，不是「同一段邏輯修好了」——現在的 `line-signature.ts`/`config/line.ts` 已經沒有這個機制，下面提到的 `botId` 相關敘述純供歷史參考，不反映現況。

## 範圍與方法

全專案分 5 個模組，各自獨立派出一個 subagent 審查（避免單一 context 塞爆導致審查失焦），審查時已對照：
- 各模組對應的 `docs/*.md` 規格文件
- `TODO.md`「已解決」區塊（避免重複回報已修好的問題）
- `CLAUDE.md` 記載的專案慣例（repository 存取模式、`withMutex`、`env.ts` zod schema、Notion rate limit delay）

5 個模組：
1. Notion 資料存取層（`src/services/notion/*`、`src/types/notion-models.ts`）
2. LINE 整合與事件路由（`src/handlers/*`、`src/services/line/*`、`src/middleware/line-signature.ts`、`src/routes/webhook.ts`、`src/index.ts`）
3. 指令系統（`src/commands/*.ts` 頂層指令、`command-parser.ts`、`command-router.ts`）
4. 報名/請假核心邏輯（`src/commands/registration/*`、`src/services/mutex.ts`）
5. 排程與基礎設施（`src/schedulers/*`、`src/services/{auto-reply,user-management,welcome-message}.ts`、`src/utils/*`、`src/config/*`、`src/routes/{health,logs}.ts`）

**如何使用本文件**：`TODO.md` 的「程式碼審查待修問題」區塊是精簡、可勾選的 actionable 清單，適合開工前快速掃過；本文件是每項 finding 的完整技術細節（程式碼片段、具體壞掉情境、修法方向），適合實際動手修改前深入理解問題成因。兩份文件用章節編號互相對應（例如 TODO 裡的 `[4.1]` 對應本文件的 `4.1`）。

## 優先順序總覽（🔴 High，依風險排序）

1. **4.2** `capacity-calculator.ts` 用 `startsWith` 誤刪別人的報名 — 資料安全問題，優先修
2. **4.1** `mutex.ts` 逾時機制沒有真正取消操作 — 破壞 FIFO 排隊的互斥保證，靜默丟失報名
3. **1.1** `getRelation` 沒處理 Notion 的 25 筆截斷 — 請假名單覆寫可能永久刪除資料，報名超過 25 人容量算錯
4. **5.2** `/logs` 路由完全無存取控制 — 個資外洩風險
5. **5.1** `display-name-update.ts` 排程實質失效 — 沒帶 `groupId` 查 profile，功能性但非破壞性

---

## 模組一：Notion 資料存取層

審查檔案：`announcement-repository.ts`、`blocks-to-text.ts`、`calendar-repository.ts`、`event-occupancy.ts`、`notion-fetch.ts`、`people-repository.ts`、`property-helpers.ts`、`season-repository.ts`、`users-repository.ts`、`types/notion-models.ts`

### 1.1 `getRelation` 沒處理 Notion 的 25 筆截斷（🔴 High）

**位置**：`property-helpers.ts:27-31`（`getRelation`）→ 影響 `season-repository.ts:12`、`calendar-repository.ts:19,42-44`

Notion 的 page/database-query 端點對 `relation`（以及 `people`/`rollup`）型別屬性一律只回傳前 25 筆，超過的部分要另外呼叫 `/pages/{id}/properties/{property_id}` 分頁端點才拿得到（SDK 型別 `PropertyItemPropertyItemListResponse` 可佐證此行為）。`getRelation` 直接 `.map()` 整包 `prop.relation`，完全沒處理這個上限。

**失敗情境**：
- `season.members`（報名人）經 `getRelation` 讀取。一季報名人數 > 25 時，`activeSeason.members.includes(resolved.personPageId)`（`registration-handler.ts:49`、`leave-handler.ts:39`）對第 26 位以後的成員回傳 `false`，誤判「你不是本季成員」擋下正常報名/請假；`capacity-calculator.ts` 用 `members.length` 算 `totalSlots` 會少算；`event-occupancy.ts:30` 的 `presentSeasonMembers` 也算錯，容量計算全面失真。
- `calendar.absentees`（請假人）同樣經 `getRelation` 讀取，且 `updateAbsentees`（`calendar-repository.ts:40-44`）是**整包覆寫**：若某天請假人數已 ≥25，下次讀取→修改→寫回時，會把讀到的（被截斷成 25 筆的）陣列整個覆蓋回 Notion，**永久刪除**第 26 筆以後的請假關聯，不只是讀錯，是寫壞資料。

**修法方向**：對可能超過 25 筆的 relation 屬性改走分頁的 property item 端點；至少在讀到剛好 25 筆時記 log 提醒可能被截斷。

### 1.2 資料庫查詢沒有處理分頁（🟡 Medium）

**位置**：`people-repository.ts:32-37`（`findAllUnpaid`）、`season-repository.ts:32-35`（`findAll`）、`announcement-repository.ts:25-28`（`getBlocks`）

`databases.query` 預設一頁最多 100 筆，`blocks/children` 同樣最多 100 筆，三處都沒有檢查 `has_more`/`next_cursor` 做後續分頁。若未結清人數、season 數或公告內容超過 100，多出的部分會被靜默丟棄（`owe` 指令顯示不完整、公告內容被截斷且無錯誤訊息）。目前規模可能還沒踩到，但沒有任何防呆或 log 提示。

### 1.3 `findByPageIds` 無節流，違反批次操作要加 delay 的慣例（🟡 Medium）

**位置**：`calendar-repository.ts:33-38`、`people-repository.ts:17-22`；搭配 `notion-fetch.ts:30-36` 無 429 重試

兩個 `findByPageIds` 都是 `Promise.all(pageIds.map(id => notionGet(...)))`，完全平行送出、無任何節流。呼叫端如 `news.ts:74-75` 會同時對 `season.members`（可能數十人）與 `season.playDatePageIds` 分別發一批平行請求，瞬間輕易超過專案自訂的 ~3 req/s 限制（對照 `schedulers/display-name-update.ts` 有刻意加 400ms delay，這裡完全沒有）。且 `notion-fetch.ts` 的 `request()` 對 429 跟其他錯誤一視同仁直接 throw，沒有讀 `Retry-After` 做重試，一旦觸發 rate limit，使用者會直接看到指令失敗，而不是短暫延遲後成功。

### 1.4 用魔術數字掩蓋缺值，且與同一 struct 內其他欄位處理方式不一致（🟡 Medium）

**位置**：`season-repository.ts:13-14,16`

```ts
courts: getNumber(p, '場地數') ?? 2,
guestFee: getNumber(p, '零打費用') ?? 170,
weekCounts: getNumber(p, '租借次數 (2hrs)') ?? 0,
```

對應 Notion 屬性空白/欄位改名時，靜默代入猜測值而不是報錯。`courts` 直接餵進 `capacity-calculator.ts` 算 `totalSlots`，若新建一季時忘了填「場地數」，會用錯誤的 2 片場地悄悄算出容量，沒有任何錯誤提示。同一函式裡 `pricePerPersonForSeason`/`totalPrice`（formula 欄位）卻正確地保留 `null` 不硬塞預設值——同一個 `pageToRecord` 內對「缺值」的處理方式不一致。精神上與 `CLAUDE.md` 「環境變數不要用 `?? fallback` 掩蓋缺值」是同一類問題，值得比照處理。

### 1.5 `incrementMessageCount` 的介面設計會誘發 race，未套用 `withMutex` 慣例（🟢 Low）

> 2026-09-25 複查時發現這跟本文件下方的「5.11」小節是同一個 bug（都是 `user-management.ts` 的 `_trackUserAsync` 沒套 `withMutex`），已在 `TODO.md` 合併成同一項 `[1.5]`。這裡的內容維持原樣不改，只是提醒不要把兩節當成兩個獨立待辦。

**位置**：`users-repository.ts:78-82` + `user-management.ts:47`

`incrementMessageCount(pageId, currentCount)` 要呼叫端自己傳入「已讀到的」計數，而非伺服器端原子遞增。唯一呼叫處先 `findByUserId` 讀到 `existing.messageCount`，再寫回 `currentCount + 1`，中間沒有 `withMutex` 保護。同一使用者短時間內連續傳訊息可能兩次都讀到同樣的 `messageCount`，最後只 +1 而非 +2，遺失計數。影響範圍僅止於統計欄位，非報名/請假等關鍵路徑。

### 1.6 `blocks-to-text.ts` 不遞迴處理 `has_children` 區塊（🟢 Low）

`blocksToText` 只把每個 top-level block 的 `rich_text` 攤平成一行，沒有處理 `has_children === true` 的情況（toggle、巢狀清單）；`announcement-repository.ts:25-28` 的 `getBlocks` 也只抓第一層 children，不會遞迴抓子區塊。管理員若在公告頁面用 toggle 或巢狀清單寫內容，巢狀部分會被整段靜默丟掉，無警告。

### 1.7 `season-repository.ts:32-35` `findAll()` 是死碼（🟢 Low）

Grep 全專案（`src/` 底下、測試除外）找不到任何呼叫點，只在 `src/test-utils/README.md` 被當作假設性範例提及。若非預留給未來功能，建議清掉或補上呼叫端。

### 本模組確認沒問題的地方

- 沒有其他檔案繞過 repository 直接 import `@notionhq/client`，實際請求都走 `notion-fetch.ts`。
- 沒有檔案用 `process.env.X ?? fallback` 繞過 `env.ts` 的 zod schema。
- 五個 repository 對「找不到結果回傳 null」與「用 `equals` filter 查單筆」的寫法彼此一致；`blocks-to-text.ts` 本身抽得算乾淨（唯一缺口是 1.6）。

---

## 模組二：LINE 整合與事件路由

審查檔案：`event-router.ts`、`join-handler.ts`、`member-joined-handler.ts`、`message-handler.ts`、`profile-service.ts`、`push-service.ts`、`reply-service.ts`、`line-signature.ts`、`webhook.ts`、`index.ts`、`request-context.ts`

### 2.1 多人同時加入群組時，迴圈內重複使用同一個 `replyToken`（🟡 Medium）

**位置**：`member-joined-handler.ts:12-21`

```ts
for (const member of members) {
  ...
  await replyMessage(event.replyToken, [message], botId);
}
```

LINE 的 `replyToken` 只能用一次，但 `memberJoined` 事件一次帶多位新成員時（`joined.members` 為陣列），這裡對同一個 `event.replyToken` 呼叫多次 `replyMessage`。第一位成員能收到歡迎訊息，其餘成員的 reply 呼叫會被 LINE API 拒絕（reply token already used），而 `reply-service.ts` 又把錯誤吞掉只記 `logger.warn`，所以是靜默失敗——多人同時加入群組時，只有第一位會被歡迎，其他人完全沒有訊息也沒有任何告警觸發。由於 handler 內已知道 `groupId`，理論上可用 `pushMessage` 作為 fallback，但目前沒有這樣做。

### 2.2 `findByUserId` 沒有 try/catch，與其他 command handler 的錯誤處理模式不一致（🟡 Medium）

**位置**：`message-handler.ts:22`

`findByUserId`（`users-repository.ts:28-34`）內部呼叫 `notionPost`，失敗時直接 throw，不會被吞掉。`handleMessage` 本身沒有 try/catch，例外會一路往上丟到 `event-router.ts` 的外層 catch，只記 log，**完全不會回覆使用者**。這和專案裡其他 command handler（`owe.ts`、`news.ts`、`introduce.ts`、`registration-handler.ts` 等）都在自己的 try/catch 裡明確回覆「系統錯誤，請稍後再試」的模式不一致——如果 Notion 在這個判斷 admin 身分的早期呼叫時掛掉（例如速率限制或網路抖動），使用者的訊息會被整個吃掉，使用者看不到任何回應。

### 2.3 未知 `botId` 靜默 fallback 到 Dobby 密鑰（🟡 Medium）

**位置**：`line-signature.ts:11-13`

```ts
const botId = (req.params['botId'] as string | undefined) ?? 'dobby';
const mw = middlewareByBotId[botId] ?? middlewareByBotId['dobby']!;
```

任何不是精確等於 `'batting'` 的 `:botId`（大小寫錯誤、typo，例如 webhook URL 打成 `/webhook/Batting`）都會被拿 **Dobby 的 channel secret** 去驗簽，而不是回 404 或明確拒絕。若 batting bot 的 webhook URL 設定有誤，所有請求都會被判定簽章驗證失敗，但因為全專案都沒有註冊 4 參數的 Express 錯誤處理 middleware，`@line/bot-sdk` 驗簽失敗時呼叫的 `next(SignatureValidationFailed)` 會落到 Express 預設錯誤處理，回傳不明確的狀態碼，難以在 log 裡快速定位「這是 batting webhook URL 設定錯誤」這個根因。（HMAC 比對本身用 `timingSafeEqual`，沒有 timing attack 風險。）

### 2.4 `room` 類型來源時完全跳過 profile 查詢（🟢 Low）

**位置**：`member-joined-handler.ts:16`

```ts
const groupId = event.source.type === 'group' ? event.source.groupId : undefined;
const profile = groupId ? await getProfile(userId, groupId) : null;
const displayName = profile?.displayName ?? userId;
```

`getProfile` 本身支援不帶 `groupId` 的單人 profile 查詢，但這裡在沒有 `groupId`（來源是 `room` 而非 `group`）時直接跳過查詢，改用原始 `userId`（opaque 字串）當顯示名稱。LINE 的多人聊天室（room）同樣會觸發 `memberJoined`，此時歡迎訊息會直接 @ 使用者的 userId 而非暱稱。

### 2.5 `req.body.events` 沒有防呆（🟢 Low）

**位置**：`webhook.ts:12-13`

```ts
const events = req.body.events as WebhookEvent[];
logger.info({ botId, eventCount: events.length, events }, 'Webhook received');
```

若 `req.body` 沒有 `events` 欄位（型別用 `as` 斷言掩蓋，執行期未檢查），`events.length` 會同步丟出 TypeError。此時 `res.status(200).json(...)` 已經送出，`processEvents` 不會被呼叫，這次 request 帶的事件會直接消失且無明確錯誤 log。LINE 平台照規格一定會帶 `events` 欄位，實際觸發機率低，但仍是防呆缺口。

### 2.6 `index.ts` 直接讀 `process.env['NODE_ENV']`，未走 `env.ts`（🟢 Low）

**位置**：`index.ts:14`

`env.ts` 已定義並驗證 `NODE_ENV`（有 fail-fast + default），這裡直接讀原始 `process.env`，違反專案「環境變數只能透過 env.ts」的慣例。目前無實害（schema 有 default），純粹是慣例不一致。

### 本模組確認沒問題的地方

- 簽章驗證邏輯本身（HMAC-SHA256 + `timingSafeEqual`，raw body 驗證）正確，`index.ts` 沒有在其之前掛全域 `express.json()`。
- quoteToken 機制：`event-router.ts` 對每個事件用 `runWithContext` 包住整個處理鏈，`reply-service.ts` 統一從 `AsyncLocalStorage` 取值並附加到所有經 `replyMessage` 送出的訊息，已 grep 確認全部 `replyMessage` 呼叫點沒有繞過此機制。
- 雙 bot 區分邏輯（主要路徑）：`botId` 從 route param 一路透傳到 `getClient(botId)`/`replyMessage`/`pushMessage`，沒有訊息被錯誤路由到對方 bot 的情況（唯一模糊地帶是 2.3 的 fallback 邊界情況）。
- push/reply 呼叫失敗的錯誤處理：`pushMessage` 失敗 log 後 rethrow，唯一呼叫者 `weekly-push.ts` 有自己的 try/catch 包住；`replyMessage` 失敗則 log warn 後吞掉，不會讓整個 webhook 處理中斷；`event-router.ts` 對每個事件也有外層 try/catch，單一事件出錯不影響同批次其他事件。

---

## 模組三：指令系統

審查檔案：`command-list.ts`、`command-parser.ts`、`command-router.ts`、`introduce.ts`、`news.ts`、`next-event.ts`、`owe.ts`、`participants.ts`、`payment.ts`、`types/commands.ts`

### 3.1 `payment.ts` 重複定義 `blocksToText`，漏了項目符號前綴邏輯（🟡 Medium）

**位置**：`payment.ts:5-16`

`payment.ts` 自己重複定義了一份 `blocksToText()`，跟 `src/services/notion/blocks-to-text.ts`（`introduce.ts`、`news.ts` 都改用的共用版本）邏輯幾乎一樣，但**少了 `bulleted_list_item` 補 `• ` 前綴的邏輯**：

```ts
// payment.ts 本地版本（缺 bulleted_list_item 判斷）
return richText.map((r: any) => r.plain_text ?? '').join('');
```

對照共用版本（`blocks-to-text.ts:16`）：
```ts
return type === 'bulleted_list_item' ? `• ${text}` : text;
```

Commit `fb72fbd`（「抽出共用 blocksToText()，修正 introduce 指令漏掉的項目符號前綴」）明顯只改了 `introduce.ts`/`news.ts`，漏改 `payment.ts`。`docs/commands.md:53` 明確寫「顯示付款說明（支援 bulleted list 格式）」，但目前程式碼不支援——若之後 Notion `PAYMENT` 頁面內容改成項目符號清單，輸出會悄悄漏掉 `• ` 前綴。目前 TODO.md 手測輸出沒有項目符號所以還沒被實測發現，也沒有 `payment.test.ts` 覆蓋這段邏輯。

**修法方向**：改用共用 `blocksToText`，並比照 `news.test.ts` 補一個項目符號測試案例。

### 3.2 `parseCommand`/`isCommand` 大小寫判斷不一致（🟡 Medium）

**位置**：`command-parser.ts:12,15,90`

`parseCommand()` 用大小寫敏感的 `text.startsWith('@Dobby')`（第 12 行）擋掉不符合的訊息，`isCommand()`（第 90 行，`message-handler.ts` 用它決定要不要進入指令分派）也是同樣大小寫敏感的檢查。但第 15 行剝離前綴時卻用 `/^@Dobby\s*/i`（忽略大小寫）。由於第 12 行的守門已先擋掉任何非精確 `@Dobby` 開頭的字串，第 15 行的 `/i` 永遠不可能在真正處理到「大小寫不同」的輸入時生效——這段大小寫容忍的意圖其實是死碼，實際上完全不支援 `@dobby +1`/`@DOBBY` 這類手動輸入。正常透過 LINE mention picker 不會有此問題，但文件提到「電腦版 LINE 的 @mention 有時無法正確傳遞」時使用者可能手動打字，此時容易打錯大小寫。

### 3.3 mention 分支用無錨點 regex 判斷指令類型（🟢 Low）

**位置**：`command-parser.ts:37-45`

「mention 開頭」分支用不定位的 `/[+\-]\d+/` 和 `/假|銷假/` 去掃整個 body 判斷是報名還是請假指令，而不是先把 mention 名稱部分切掉再判斷指令 token。若代操作目標的 LINE 顯示名稱恰好含 `-1`、`+2` 這類子字串（例如暱稱 `"Vic-1"`），`@Dobby @Vic-1 假` 會被誤判成 REGISTRATION 而非 LEAVE；同理若顯示名稱含「假」字，可能被誤判成請假。機率低但是個脆弱的啟發式判斷。

### 3.4 `next` 指令字首判斷沒有字界檢查（🟢 Low）

**位置**：`command-parser.ts:63`

`if (body.startsWith('next'))` 沒有字界檢查，任何以 `next` 開頭的訊息（例如 `@Dobby next期`、`@Dobby next time...`）都會被路由到 `NEXT_EVENT`。非管理員會因此收到「此指令僅限管理員使用」而非被當成一般未知指令忽略，屬於次要 UX 不一致（權限判斷本身仍正確擋下，非安全問題）。

### 3.5 測試覆蓋缺口（🟢 Low）

`src/commands/__tests__/` 下只有 `command-parser.test.ts`、`news.test.ts`、`next-event.test.ts`。`command-router.ts`、`command-list.ts`、`owe.ts`、`participants.ts`、`payment.ts`、`introduce.ts` 都沒有對應測試檔。3.1（payment 漏掉 bullet 前綴）正是這個缺口造成沒被抓到的例子。建議至少補 `payment.test.ts`（比照 `news.test.ts` 的 bulleted list 斷言）與一個簡單的 `command-router.test.ts` 鎖住 dispatch 對應表。

### 本模組確認沒問題的地方

- 管理員權限檢查：`command-router.ts` 對所有指令類型一律呼叫對應 handler，`next-event.ts:13-16` 內部有做 `isAdmin` 檢查並提前擋下，`message-handler.ts` 在進入 `routeCommand` 前就已算好 `isAdmin` 並傳入，屬於 defense-in-depth，沒有繞過路徑。
- 全形 ＋/－、連續空白正規化、`next?c=N`/`next?-=N` 結構化解析、`NEWS_TEMPLATE` + `{PLACEHOLDER}` 代入邏輯、`command-list.ts` 別名清單（含 `announcement`）— 皆與 `docs/commands.md`、`TODO.md` 已解決項目一致。
- `owe.ts`/`participants.ts`/`introduce.ts` 本身的資料組裝邏輯簡單直接，未發現正確性問題。

---

## 模組四：報名/請假核心邏輯

審查檔案：`capacity-calculator.ts`、`event-status-message.ts`、`leave-handler.ts`、`registration-handler.ts`、`registration-parser.ts`、`target-resolver.ts`、`with-fresh-calendar-event.ts`、`mutex.ts`

這是全專案最複雜、最容易出 race condition 的部分，發現的問題也最關鍵。

### 4.1 `mutex.ts` 逾時後並未真正等待 in-flight 操作完成（🔴 High）

**位置**：`mutex.ts:11-45`

`withMutex` 的佇列鏈（`queues.set(key, tail)`，下一個呼叫者的 `prev` 依賴此值）掛在 `run = prev.then(() => runWithTimeout(key, fn))` 上；而 `runWithTimeout` 內部用 `Promise.race([fn(), timeout])`。逾時發生時，`race` 立刻 reject，`run`/`tail` 隨即 settle 並釋出鎖——但真正的 `fn()`（內含 Notion 讀取+寫入）並未被取消，仍在背景繼續執行。

**失敗情境**：A 的報名因 Notion API 延遲卡超過 10 秒觸發逾時，鎖「提早」釋放給排隊中的 B；B 立刻讀到（A 尚未寫入前的）舊 guest 清單並計算、寫入成功，回覆「報名成功」；接著 A 那個逾時後仍在背景跑的舊寫入才真正完成，用 A 計算時的（更舊的）guest 清單把 B 剛寫入的結果整個覆蓋掉——**B 的報名被靜默吃掉，但兩人都收到成功訊息**。這正是 mutex 存在的目的所要防止的 race，逾時機制反而開了一個窗口。

**修法方向**：next-in-queue 應該等待「真正的 `fn()` 完成」而不是等 race 的結果（例如仍 `await` 真正的 promise，只是不把它的結果回給已經逾時的呼叫端；或做真正的 abort，讓逾時的操作真的不再寫入）。

### 4.2 `calculateRemoveCapacity` 用 `startsWith` 做 prefix 比對，可能誤刪別人的報名（🔴 High）

**位置**：`capacity-calculator.ts:86-95`

非季租成員的 `prefix` 就是 `targetName` 本身（沒有分隔符），用 `event.guests.filter(g => g.startsWith(prefix))` 找要移除的項目。

**失敗情境**：現有 guest 清單有「Alice」「Alice 2」（Alice 本人報名兩位），從未報名過的 `"Al"` 傳 `-1`：`prefix="Al"`，`"Alice".startsWith("Al")` 為 true，於是 `toRemove` 誤含 Alice 的兩筆條目，`toRemove.length>0` 使程式碼**不會**走進「找不到 Al 的報名紀錄」錯誤分支，而是真的把 Alice 其中一筆條目從 Notion 刪掉，並回覆 Al「取消報名成功 ✅」。這是會**靜默刪除別人報名資料**的資料完整性/授權漏洞，只要有一個人的名字（或系統自動加空格+數字的變體）恰好是另一個人名字的字串前綴就會觸發，實務上很可能發生（例如 `"Peter"` vs `"Peter Wang"`、`"Vic"` vs `"Victor"` 之類）。季租成員分支因為 prefix 多了「的朋友」這個天然邊界字，風險低很多；風險集中在非季租成員（零打本人）這條路徑。

**修法方向**：比對時要求完整相等或以明確邊界字元（如空格）分隔，不能單純用 `startsWith`。

### 4.3 Guest 命名編號每次呼叫都從 0 重算，導致重複命名（🟠 Medium-High）

**位置**：`capacity-calculator.ts:58-71`

`calculateAddCapacity` 的 `newEntries` 迴圈永遠 `i` 從 0 開始（`suffix = i===0?'':...`），沒有先算「這個 targetName 在現有 `event.guests` 裡已經有幾筆」再接續編號。

**失敗情境**：季租成員 Bob 先傳一次 `+1`（產生「Bob的朋友」），過幾天再傳一次 `+1`（另一位朋友），第二次呼叫仍是 `i=0` → 又產生「Bob的朋友」，guest 清單出現兩筆一模一樣的「Bob的朋友」，而不是規格要求的「Bob的朋友」+「Bob的朋友2」。非季租成員命名（「Alice」/「Alice 2」）同樣有此問題。`capacity-calculator.test.ts` 目前只測試單次呼叫（`event.guests` 起始為空或無同名條目），沒有測試「已含同一人先前條目」這個情境，此 bug 未被任何測試覆蓋。

**修法方向**：先掃描 `event.guests` 找出同一 `targetName` 已存在的最大編號，再接續往後編號。

### 4.4 `registration-handler.ts`（`handleRegistration`）完全沒有測試檔（🟡 Medium）

搜尋 `src/commands/__tests__/` 與 `src/commands/registration/__tests__/`，只有 `capacity-calculator.test.ts`（純函式）、`registration-parser.test.ts`、`leave-handler.test.ts`、`with-fresh-calendar-event.test.ts`，唯獨缺少 `registration-handler.test.ts`。相較之下 `leave-handler.test.ts` 有完整驗證 `withMutex` 的 lock key、`calendarRepo.updateAbsentees` 呼叫參數等；`handleRegistration`（本模組最複雜、串起 mutex + 容量計算 + Notion 寫入的主流程，也是 4.1、4.2、4.3 實際發生的入口）卻沒有任何整合層測試驗證 mutex key 是否正確、`calendarRepo.updateGuests` 呼叫參數是否正確、cappedAt 標題文案等。建議比照 `leave-handler.test.ts` 補上。

### 4.5 `availableSlots` 為負數時，錯誤訊息顯示負數（🟢 Low）

**位置**：`capacity-calculator.ts:46-52`

若因超額報名或季資料異動導致 `availableSlots < 0`，非管理員再 `+N` 會回「名額不足，目前剩餘 -3 個名額」，對使用者而言負數不直觀。純顯示問題，非邏輯錯誤。

### 4.6 `+0`/`-0` 邊界情況行為不一致（🟢 Low）

`command-parser.ts` 正則 `[+\-]\d+` 允許 `"0"`。`calculateRemoveCapacity` 收到 `delta=0` 時，若目標已有既有報名，`removeCount = Math.min(0, toRemove.length) = 0`，回傳 `canAdd:true` 但 `newGuests` 內容不變；`registration-handler.ts` 因此仍會呼叫一次沒有實際變化的 `calendarRepo.updateGuests`（多餘 Notion 寫入），並回覆「取消報名成功 ✅」，但實際上什麼都沒取消。若目標完全沒有既有報名，則正常回「找不到...報名紀錄」——同樣輸入但行為依既有狀態不一致。

### 4.7 錯誤訊息優先序：格式錯誤被誤判成「非管理員」（🟢 Low）

非管理員送出目標語法錯誤的指令（例如 `@Dobby +1 Charlie`，漏了 `@`）時，`parseRegistrationTarget` 回傳 `isSelf:false` + `parseError`；但 `handleRegistration` 的管理員檢查（`!target.isSelf && !isAdmin`）在 `parseError` 檢查之前執行，導致這類單純打錯格式的一般成員收到「你不是管理員」而非更準確的「指令格式錯誤：指定對象需使用 @Name」。不影響資料安全，純粹是錯誤訊息不夠精準。

### 本模組確認沒問題的地方

- Season 資料在取得 mutex 鎖「之前」先查（`registration-handler.ts:43`/`leave-handler.ts:38`），符合 `docs/registration.md` 流程圖第 3 步明確記載的設計（courts/members 資料變動極少），非鎖外舊資料誤用的 bug。
- `calendarRepo.updateGuests`/`updateAbsentees`（`calendar-repository.ts:40-50`）都是單一 Notion PATCH 呼叫，不會有「寫一半」的中間狀態；`withFreshCalendarEvent` 的 try/catch 確保寫入例外時統一回「系統錯誤，請稍後再試」且不留殘破狀態。
- `registration-parser.ts` 的中文指令 regex 順序（`[+\-]\d+|假|銷假`）在「銷假」情境下經人工驗證仍能正確匹配完整兩字，不會被「假」提前截斷；`command-parser.ts` 已先過濾成 LEAVE/CANCEL_LEAVE 才會進入 `parseRegistrationTarget`，不會誤觸發。
- FIFO 排隊、+N 規格對齊、非管理員部分成功名額、管理員代操作規則均已確認正確實作（見 `TODO.md`「已解決」區塊）。

---

## 模組五：排程與基礎設施

審查檔案：`display-name-update.ts`、`weekly-push.ts`、`auto-reply.ts`、`user-management.ts`、`welcome-message.ts`、`date-utils.ts`、`log-cleanup.ts`、`log-reader.ts`、`logger.ts`、`request-context.ts`、`constants.ts`、`env.ts`、`line.ts`、`routes/health.ts`、`routes/logs.ts`、`data/auto-reply.json`

### 5.1 `display-name-update.ts` 排程實質失效：沒帶 `groupId` 查 profile（🔴 High）

**位置**：`display-name-update.ts:19`

```ts
const profile = await getProfile(userId);
```

完全沒有讀取/傳入使用者的 `groups` 欄位。對照 `profile-service.ts:10-18`，未帶 `groupId` 時呼叫的是 LINE「一對一好友」`getProfile(userId)`，而不是 `docs/schedulers.md`（「使用者必須在 groups 欄位中有群組 ID 才能被查詢（profile API 需要 groupId）」）描述、且真正該用的 `getGroupMemberProfile(groupId, userId)`。社團成員多半只在群組互動、未加 Dobby 為個人好友，這會導致 `getProfile` 對幾乎所有使用者回傳 404 → null（兩個 bot 都是如此），使「顯示名稱批次更新」這個排程**實質上永遠不會真的更新任何人的 Custom Name**。文件與程式碼落差比 `CLAUDE.md` 已知的 auto-reply 落差更嚴重，建議實測確認。

**修法方向**：改用 `usersRepo` 資料裡使用者所屬的 `groupId`，呼叫 `getGroupMemberProfile(groupId, userId)`。

### 5.2 `/logs` 路由完全無存取控制（🔴 High）

**位置**：`routes/logs.ts`（掛載於 `index.ts:12` `app.use('/logs', logsRouter)`）

`/logs` 路由完全沒有身份驗證或存取限制（對照 `/webhook` 有 `line-signature.ts` 驗簽，`/health`、`/logs` 都沒有任何 middleware）。任何知道網址的人都能看到近 7 天完整結構化 log。搭配 `push-service.ts:16`（`logger.info({..., messages: messageContents}, 'LINE push')`，info 等級，production 會落地寫檔）會把每次推播的完整訊息內容（含零打名單真實姓名）、LINE 使用者/群組 ID 記進檔案，再原封不動透過 `/logs` 對外暴露，屬於使用者個資外洩風險。

**修法方向**：`/logs` 路由至少加上簡單的 token/Basic Auth 驗證，或限制只能從內網/特定 IP 存取。

### 5.3 `display-name-update.ts` 查詢沒有分頁處理（🟡 Medium）

**位置**：`display-name-update.ts:11`

```ts
notionPost(`/databases/${env.NOTION_DB_USERS}/query`, {})
```

沒有帶 `page_size`，也沒有檢查回應的 `has_more`/`next_cursor` 做分頁，Notion 查詢預設一頁最多 100 筆。`user-management.ts` 的 `trackUser` 會替每個曾在群組互動過的 LINE 使用者建 USERS 頁面，長期下來使用者數很容易超過 100，超出的部分這支排程永遠碰不到；log 的 `total: pages.length`（第 31 行）也會誤導成「總共才 100 人」。另外此處直接呼叫 `notionPost` 而非透過 `users-repository.ts`，違反「Notion 存取一律走 repository」慣例（該 repository 目前也確實沒有提供分頁安全的 list-all 函式，屬於連帶缺口）。

### 5.4 `display-name-update.ts` 整個迴圈單一 try/catch，單筆失敗拖垮整批（🟡 Medium）

**位置**：`display-name-update.ts:10-34`

整個 for-loop 都包在函式層級單一 try/catch 內，沒有逐筆 try/catch。任一筆 `usersRepo.update`（第 23 行）失敗（例如撞到 Notion 429、該筆資料格式異常）會直接中斷整個迴圈，後面排隊的所有使用者當週都不會被處理，也沒有 retry，只留一行 generic `logger.error`，事後無法定位是哪個使用者/哪筆資料出錯。

### 5.5 `log-cleanup.ts` `unlink` 沒包 try/catch，變成 unhandled rejection（🟡 Medium）

**位置**：`log-cleanup.ts:30`

`await unlink(filePath)` 沒有包 try/catch。單一檔案刪除失敗（權限問題、檔案已被別的程序刪掉等）會讓 `cleanOldLogs()` 整個 promise reject；呼叫端是 `void cleanOldLogs()`，變成 unhandled rejection——不會進 logger、後面排隊要刪的舊檔案全部略過，且完全沒有任何 log 線索可以事後排查。

### 5.6 log 檔名日期解析與 cutoff 計算時區來源不一致（🟢 Low）

**位置**：`log-cleanup.ts:27-28`、`log-reader.ts:28-30`

用 `new Date(match[1])` 把檔名裡的日期字串當 **UTC 午夜**解析，但保留期限的 cutoff 是用 `cutoff.setHours(0,0,0,0)`（**伺服器本地時區**）算的，兩者時區來源不一致。目前 Dockerfile 沒設定 `TZ`（`node:22-alpine` 預設 UTC），本地時區恰好等於 UTC，所以現況沒有實際偏差；但若之後依 `docs/schedulers.md` 的除錯建議把伺服器 TZ 設成 Asia/Taipei，就會產生最多 8 小時的邊界誤差，可能讓某天的 log 提早/延後被判定為過期。

### 5.7 `getClient(botId)` 對未知字串靜默 fallback（🟢 Low）

**位置**：`config/line.ts:12-15`

對任何非 `'batting'` 的字串（含打錯字）一律 silently fallback 回 `dobbyClient`；函式簽名也沒用 `constants.ts` 已定義的 `BotId` 型別做編譯期限制。若呼叫端不小心傳錯 botId，會用錯的 channel token 打 LINE API，要等到 LINE 回 403/400 才會被發現，而非在程式內 fail-fast。

### 5.8 `logger.ts` 直接讀 `process.env['NODE_ENV']`（🟢 Low）

**位置**：`utils/logger.ts:4`

未經 `env.ts` 匯出的 `env.NODE_ENV`。因為 `index.ts` 一定先 import `config/env.js`（觸發 `dotenv/config`）才會 import logger，實務上不會有值缺漏的問題，但屬於繞過 `env.ts` 慣例；且 schema 對 `NODE_ENV` 只驗證 `z.string()`（`env.ts:16`），沒有限制成 enum，打錯字不會 fail-fast。

### 5.9 `env.ts` 的 `PORT` 沒有 coerce，錯值會靜默監聽隨機 port（🟢 Low）

**位置**：`env.ts:15`

`PORT: z.string().default('3000')`，`index.ts:21` 用 `parseInt(env.PORT, 10)` 轉型。若 `.env` 的 `PORT` 填了非數字字串，`parseInt` 會得到 `NaN`，`app.listen(NaN)` 實際上會讓 Node 監聽隨機可用 port 而不是丟錯，違反「缺值/錯值要 fail-fast」精神。建議改成 `z.coerce.number().int().positive()`。

### 5.10 `auto-reply.json` 多組 trigger 重複，後面那組是死碼（🟢 Low）

多組 trigger 重複出現兩次以上（例：「朋友」、「雙胞胎」出現 3 次、「魔法」「火車」「哈利」「榮恩」「妙麗」「鄧不利多」「石內卜」「海格」「跩哥」「露娜」「天狼星」「路平」「催狂魔」「孤單」「難過」「自由」，以及多個咒語 Lumos/Nox/Accio/Alohomora/Expelliarmus/Protego/Stupefy/Expecto Patronum/Obliviate/Riddikulus/Wingardium Leviosa/Imperio/Crucio/Avada Kedavra 都出現兩次）。`findReply`（`auto-reply.ts:13-16`）用 `for...of` 找到第一個 `text.includes(rule.trigger)` 就回傳，排在後面的重複 trigger 永遠是死碼——尤其後半段那組明顯是改寫成「療癒/安慰向」語氣的版本，永遠不會被觸發到。不確定是否刻意設計，需與內容維護者確認。

### 5.11 `user-management.ts` 讀取→計算→寫回沒套 `withMutex`（🟢 Low）

> 2026-09-25 複查時發現這跟本文件上方的「1.5」小節是同一個 bug，已在 `TODO.md` 合併成同一項 `[1.5]`，不是兩個獨立待辦。

**位置**：`user-management.ts:16-47`

`_trackUserAsync` 是「讀取現有使用者/訊息數 → 計算合併 groups/multiChats/message_counts → 寫回」的流程，卻沒有用專案慣例規定的 `withMutex`。因為是 fire-and-forget（`trackUser` 呼叫端不 await），同一使用者短時間內連續發多則訊息時，`existing.messageCount`/`existing.groups` 可能讀到舊值，造成 race，導致 `message_counts` 漏算或群組清單漏合併。影響僅止於統計與群組清單準確度，非報名核心邏輯。

### 本模組確認沒問題的地方

- `weekly-push.ts` 本身只做 3 次獨立 Notion 查詢（非迴圈批次），沒有加 delay 是合理的，不算違反 rate-limit 慣例。
- `date-utils.ts` 的 Asia/Taipei 與季度計算（含跨年、月初/月底）都用 `Intl.DateTimeFormat({timeZone:'Asia/Taipei'})` 正確處理，未發現 edge case 問題，且有對應測試（`date-utils.test.ts`）覆蓋跨年與各季度邊界。
- Notion request/response 完整內容目前只在 `logger.debug`（`notion-fetch.ts:40,48`）記錄，production 等級為 info，不會寫入檔案，經 `/logs` 也看不到，這部分沒有洩漏風險。
- 測試覆蓋缺口（非 bug，僅供參考）：`schedulers/__tests__`、`services/__tests__`、`utils/__tests__` 目前只有 `mutex.test.ts` 與 `date-utils.test.ts`；`weekly-push`、`display-name-update`、`auto-reply`、`user-management`、`welcome-message`、`log-cleanup`、`log-reader`、`logger`、`routes/health`、`routes/logs`、`config/env`、`config/line` 均無對應測試，5.1、5.3 若有基本測試應能提早發現。
