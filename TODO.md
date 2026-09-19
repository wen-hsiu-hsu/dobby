# TODO

> 時區：Asia/Taipei ｜ 季度定義：Q1=1~3月, Q2=4~6月, Q3=7~9月, Q4=10~12月
>
> 前身為 `openspec/changes/bot-logic-fixes`，已改用純 Markdown TODO 追蹤，不再使用 OpenSpec 流程。
>
> 已完成且有文件記錄的項目已從這裡移除，機制細節記錄在 `docs/registration.md`、`docs/commands.md`、`docs/architecture.md`、`docs/notion/databases.md`、`docs/schedulers.md`、`docs/adr/`。開工前先看這裡＋對應文件，避免重複踩雷。

---

## Log 系統補強：LINE API endpoint + 其他改進

> 2026-09-20 確立的需求。`/logs` 頁面對 Notion API 呼叫已經有完整的「info 摘要 + debug 明細」分層（`src/services/notion/notion-fetch.ts`，設計原則見 `docs/adr/0005-purpose-context-layered-on-reqid.md`），且能顯示打了哪個 endpoint（`method`/`path`/`db`，`NotionCallRow`）。但 LINE 相關的 API 呼叫（`push-service.ts`/`reply-service.ts`/`profile-service.ts`）完全沒跟進：沒有 `method`/`path` 欄位，而且分層方向是**反的**——訊息文字全文、groupId/userId 這類身分識別資訊目前直接記在 info（不像 Notion body 需要開 `LOG_LEVEL=debug` 才看得到），`profile-service.ts` 的 `getProfile()` 成功時更是完全沒有 log。另外分析過程中發現一個同性質的既有 PII 洩漏：`src/routes/webhook.ts:12` 把完整 `WebhookEvent[]`（含使用者 userId/groupId、訊息全文）直接記在 info，跟先前 `event-router.ts` 修過的 PII 洩漏（commit `0446dee`）是同一種問題再犯一次。
>
> **這份清單是唯一的需求來源，下面 8 點是已確認定案，開工前不用回頭問使用者。** 如果執行時發現這裡沒提到的邊界情況，用「保守不動、記錄下來問」的態度處理（見文末「查證中發現、需要使用者決定」小節），不要自行擴大範圍。

### 已確認的決定（2026-09-20 定案，不用再問）

1. LINE API log 要補上 `method`/`path` endpoint 資訊，比照 Notion 的 info/debug 分層模式。
2. 身分識別資訊（groupId/userId、或路徑裡帶實際 id）搬到 debug：info 只留路徑「樣式」（不帶實際 id，例如 `/v2/bot/group/{groupId}/member/{userId}`）跟 method，實際 groupId/userId 只在 debug 層看得到。
3. LINE 訊息文字全文（回覆/推播的實際內容）搬到 debug：跟 Notion body 一致，預設 `LOG_LEVEL=info` 下 `/logs` 頁面看不到訊息全文，只有開 debug 才看得到。這會讓平面模式/流程表模式的訊息預覽在預設 LOG_LEVEL 下消失——這是刻意的 UX 犧牲，換取預設環境不外洩訊息內容，比照 `logs.ts` 對 Notion call row「開 `LOG_LEVEL=debug` 才能看到完整內容」的既有提示手法處理。
4. `profile-service.ts` 補最小成功摘要 log：加一行 info/debug 摘要 log（比照 2、3 點的分層原則），但**不**讓 `log-grouping.ts`/`logs.ts` 為它新增 `'line-profile'` row kind 或做流程表配對顯示——這次範圍內只要「有 log 可查」。
5. 修 `webhook.ts:12` 的 PII 洩漏：拆成 info 摘要（不含完整 `events`）+ debug 明細（完整 `events`），比照 `event-router.ts` 當初的修法（commit `0446dee`）。
6. `registration-handler.ts`、`leave-handler.ts` 加業務摘要 log（目前這兩個檔案完全沒有任何 `logger.*` 呼叫），讓使用者（社團管理者）能直接查「誰在什麼時候報名/請假了幾位」，不用逐行拼湊 Notion payload。
7. 加事件/API 呼叫耗時記錄：`event-router.ts` 的 `processEvents` 處理單一事件的總耗時、`notion-fetch.ts` 單次 Notion API 呼叫的耗時，都要記錄下來（`durationMs` 欄位）。
8. `reply-service.ts:34` 錯誤 log 補回訊息內容，但要跟決定 2/3（訊息內容放 debug）協調——見下方「錯誤 log 的分層」小節，這裡明確定案，不留模糊空間。

### 關鍵設計決策：用 `sendId` 取代內容比對做 LINE push/reply 的配對

`log-grouping.ts` 現在用 `pushSignature()`（`JSON.stringify([e['to'], e['messages']])`）比對哪一筆 `'LINE push'` 對應哪一筆 `'LINE push sent'`/`'Push message failed'`——因為 push 呼叫背景排程沒有 `reqId`（見 `logs.ts` 裡「pushes carry no reqId」的既有註解），沒辦法像 Notion call 一樣靠 `reqId` bucket 區分。

**問題**：決定 2/3 要求把 `to`/`messages` 這些內容搬到 debug 專屬的 payload 行，但如果 info 層級的 `'LINE push'`/`'LINE push sent'` 行不再帶 `to`/`messages`，`pushSignature()` 在預設 `LOG_LEVEL=info` 下永遠算出同一個空簽名，兩個不相關的 push 會被誤配對——直接違反 `log-grouping.test.ts` 既有測試「without cross-matching two different pushes」保證的行為。

**決定（本次規格新增，非使用者逐條確認，但是決定 1+3 的必然推論，不留給實作者猜）**：`pushMessage()`/`replyMessage()` 呼叫時各自產生一個短隨機 `sendId`（用 `randomBytes(3).toString('hex')`，跟 `request-context.ts` 產生 `reqId`的手法一樣），寫進該次呼叫的**所有** log 行（info 的 start/sent/failure 行 + debug 的 payload 行）。`log-grouping.ts` 改成用 `sendId` 精確配對，取代 `pushSignature()`。這同時修掉一個既有的潛在 bug：兩個併發、`to`+`messages` 完全相同的 push 呼叫，舊版 `pushSignature()` 靠 `findIndex` 找第一個符合的，理論上可能配對錯誤；`sendId` 保證每次呼叫獨一無二。

`replyMessage()` 目前用佇列（FIFO shift）配對，不受這次改動影響其正確性，但為了跟 push 走同一套配對機制（減少 `log-grouping.ts` 裡兩套邏輯並存的複雜度），reply 也一起改用 `sendId`。

### 錯誤 log 的分層（決定 8 的明確定案）

`logger.warn`/`logger.error` **不管 `LOG_LEVEL` 設多少都一定會輸出**（pino 的 level 排序是 debug < info < warn < error，設定 `LOG_LEVEL=info` 只是把 debug 以下的行濾掉，warn/error 永遠可見）。所以「補訊息內容」**不能**直接加在 `logger.warn(...)`/`logger.error(...)` 那一行的物件裡——那樣訊息全文會不管 `LOG_LEVEL` 設定、在正式環境預設就外洩，直接違背決定 3 的目的。

**定案**：失敗時的訊息內容，另外開一行 **debug** 層級的「payload」log（例如 `'Reply failed payload'`/`'Push message failed payload'`），跟既有的 warn/error 行用同一個 `sendId` 綁在一起。warn/error 行本身只留 `err`/`method`/`path`/`sendId`（不含訊息內容），永遠可見但不含 PII；要看失敗當下實際送的是什麼訊息，一樣得開 `LOG_LEVEL=debug`——跟決定 3 的「預設環境不外洩訊息內容」原則完全一致，只是失敗時多一行 debug payload 可查，不是把內容塞進 error 行。`push-service.ts` 的 `'Push message failed'` 目前也有一樣的洩漏（`logger.error({ err, to, messages: messageContents }, 'Push message failed')`），雖然使用者只點名 `reply-service.ts`，但這是同一個原則的必然延伸，這次一併修。

---

### 檔案改動

#### 1. `src/services/line/push-service.ts`（全檔重寫）

現況（全檔 22 行）：

```ts
import type { messagingApi } from '@line/bot-sdk';
import { lineClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';

type Message = messagingApi.Message;

export async function pushMessage(
  to: string,
  messages: Message[]
): Promise<void> {
  const messageContents = messages.map((m) =>
    m.type === 'text' ? (m as { type: string; text: string }).text : `[${m.type}]`
  );
  logger.info({ to, messageCount: messages.length, messages: messageContents }, 'LINE push');
  try {
    await lineClient.pushMessage({ to, messages });
    logger.debug({ to, messages: messageContents }, 'LINE push sent');
  } catch (err) {
    logger.error({ err, to, messages: messageContents }, 'Push message failed');
    throw err;
  }
}
```

改成：

```ts
import type { messagingApi } from '@line/bot-sdk';
import { randomBytes } from 'node:crypto';
import { lineClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';

type Message = messagingApi.Message;

// Matches the actual REST endpoint @line/bot-sdk's MessagingApiClient calls
// internally (node_modules/@line/bot-sdk/dist/messaging-api/api/messagingApiClient.js) —
// a fixed path with no id in it, safe to log at info level.
const METHOD = 'POST';
const PATH = '/v2/bot/message/push';

export async function pushMessage(
  to: string,
  messages: Message[]
): Promise<void> {
  const messageContents = messages.map((m) =>
    m.type === 'text' ? (m as { type: string; text: string }).text : `[${m.type}]`
  );
  // sendId correlates this call's start/sent/failure/payload log lines so
  // log-grouping.ts can pair them without relying on `to`/`messages` content
  // (which is now debug-only — see TODO.md's "用 sendId 取代內容比對" note).
  const sendId = randomBytes(3).toString('hex');
  logger.info({ method: METHOD, path: PATH, sendId, messageCount: messages.length }, 'LINE push');
  logger.debug({ method: METHOD, path: PATH, sendId, to, messages: messageContents }, 'LINE push payload');
  try {
    await lineClient.pushMessage({ to, messages });
    logger.info({ method: METHOD, path: PATH, sendId }, 'LINE push sent');
  } catch (err) {
    logger.error({ err, method: METHOD, path: PATH, sendId }, 'Push message failed');
    logger.debug({ method: METHOD, path: PATH, sendId, to, messages: messageContents }, 'Push message failed payload');
    throw err;
  }
}
```

要點：`to`（groupId/userId）跟 `messages` 全文只出現在 `debug` 的 payload 行；`messageCount`（純數字，非 PII）留在 info；error 行不含訊息內容（見上方「錯誤 log 的分層」）；`throw err` 行為不變。

#### 2. `src/services/line/reply-service.ts`（全檔重寫）

現況（全檔 36 行，第 21-36 行是 `replyMessage`）：

```ts
export async function replyMessage(
  replyToken: string,
  messages: Message[]
): Promise<void> {
  const messagesToSend = withQuoteToken(messages);
  const messageContents = messages.map((m) =>
    m.type === 'text' ? (m as { type: string; text: string }).text : `[${m.type}]`
  );
  logger.info({ replyToken: replyToken.slice(0, 8) + '…', messageCount: messages.length, messages: messageContents }, 'LINE reply');
  try {
    await lineClient.replyMessage({ replyToken, messages: messagesToSend });
    logger.debug({ messages: messageContents }, 'LINE reply sent');
  } catch (err) {
    logger.warn({ err }, 'Reply failed, no fallback available (no groupId for push)');
  }
}
```

改成（`import`/`withQuoteToken` 那段，第 1-19 行不變，只在檔案開頭多加 `randomBytes` import 跟兩個常數）：

```ts
import type { messagingApi } from '@line/bot-sdk';
import { randomBytes } from 'node:crypto';
import { lineClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';
import { getQuoteToken } from '../../utils/request-context.js';

type Message = messagingApi.Message;

const METHOD = 'POST';
const PATH = '/v2/bot/message/reply';

// withQuoteToken() 維持原樣，不用動

export async function replyMessage(
  replyToken: string,
  messages: Message[]
): Promise<void> {
  const messagesToSend = withQuoteToken(messages);
  const messageContents = messages.map((m) =>
    m.type === 'text' ? (m as { type: string; text: string }).text : `[${m.type}]`
  );
  const sendId = randomBytes(3).toString('hex');
  logger.info({ method: METHOD, path: PATH, sendId, messageCount: messages.length }, 'LINE reply');
  logger.debug(
    { method: METHOD, path: PATH, sendId, replyToken: replyToken.slice(0, 8) + '…', messages: messageContents },
    'LINE reply payload'
  );
  try {
    await lineClient.replyMessage({ replyToken, messages: messagesToSend });
    logger.info({ method: METHOD, path: PATH, sendId }, 'LINE reply sent');
  } catch (err) {
    logger.warn({ err, method: METHOD, path: PATH, sendId }, 'Reply failed, no fallback available (no groupId for push)');
    logger.debug({ method: METHOD, path: PATH, sendId, messages: messageContents }, 'Reply failed payload');
  }
}
```

要點：原本 `'LINE reply sent'` 是 debug 層級（含訊息內容），改成 info（不含內容，只有 method/path/sendId）+ 沒有對應的「sent payload」debug 行——因為送出成功時內容沒變化，start 時的 debug payload 已經記過一次，不需要重複記兩次相同內容。`replyToken` 的截斷預覽（`slice(0,8)+'…'`）維持在 debug 層（原本在 info），因為訊息內容本來就要搬到 debug，`replyToken` 的截斷值本來就無法識別使用者，但既然同一行本來就要放訊息全文，一併放進 debug 層，不用在 info/debug 各留一份 replyToken。

#### 3. `src/services/line/profile-service.ts`（全檔重寫）

現況（全檔 22 行）：

```ts
export async function getProfile(userId: string, groupId?: string): Promise<LineProfile | null> {
  try {
    if (groupId) {
      const member = await lineClient.getGroupMemberProfile(groupId, userId);
      return { userId, displayName: member.displayName, pictureUrl: member.pictureUrl };
    }
    const profile = await lineClient.getProfile(userId);
    return { userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl };
  } catch (err) {
    logger.warn({ err, userId }, 'Could not get user profile');
    return null;
  }
}
```

改成：

```ts
import { lineClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

// 實際打的 endpoint（見 node_modules/@line/bot-sdk 的 messagingApiClient.js）：
// getGroupMemberProfile -> GET /v2/bot/group/{groupId}/member/{userId}
// getProfile            -> GET /v2/bot/profile/{userId}
const GROUP_MEMBER_PATH = '/v2/bot/group/{groupId}/member/{userId}';
const USER_PROFILE_PATH = '/v2/bot/profile/{userId}';

export async function getProfile(userId: string, groupId?: string): Promise<LineProfile | null> {
  const method = 'GET';
  const path = groupId ? GROUP_MEMBER_PATH : USER_PROFILE_PATH;
  try {
    let result: LineProfile;
    if (groupId) {
      const member = await lineClient.getGroupMemberProfile(groupId, userId);
      result = { userId, displayName: member.displayName, pictureUrl: member.pictureUrl };
    } else {
      const profile = await lineClient.getProfile(userId);
      result = { userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl };
    }
    logger.info({ method, path }, 'LINE get profile');
    logger.debug({ method, path, userId, groupId, displayName: result.displayName }, 'LINE get profile detail');
    return result;
  } catch (err) {
    logger.warn({ err, method, path }, 'Could not get user profile');
    logger.debug({ method, path, userId, groupId }, 'Could not get user profile detail');
    return null;
  }
}
```

要點：這是決定 4 說的「最小摘要 log」，`log-grouping.ts`/`logs.ts` 完全不用改，這兩行 log 會以 `kind: 'single'` 的形式出現在平面模式的一般表格列（跟其他沒被合併的 log 行一樣），流程表模式裡則會落在 `renderFlowMisc()` 的 misc 區塊，不需要額外處理。`userId`/`groupId`（身分識別資訊）只在 debug 行，`err`（診斷用，不含使用者資料本身）留在 warn 行——跟 `reply-service.ts`/`push-service.ts` 同一個分層原則。

#### 4. `src/routes/webhook.ts`（第 12 行拆成兩行）

現況（全檔 16 行）：

```ts
webhookRouter.post('/', lineSignatureMiddleware, (req, res) => {
  res.status(200).json({ status: 'ok' });
  const events = req.body.events as WebhookEvent[];
  logger.info({ eventCount: events.length, events }, 'Webhook received');
  processEvents(events).catch((err) =>
    logger.error({ err }, 'Error processing events')
  );
});
```

改成（比照 `event-router.ts` 現有的 `'Processing event'`/`'Processing event detail'` 拆法）：

```ts
webhookRouter.post('/', lineSignatureMiddleware, (req, res) => {
  res.status(200).json({ status: 'ok' });
  const events = req.body.events as WebhookEvent[];
  logger.info({ eventCount: events.length }, 'Webhook received');
  logger.debug({ eventCount: events.length, events }, 'Webhook received detail');
  processEvents(events).catch((err) =>
    logger.error({ err }, 'Error processing events')
  );
});
```

#### 5. `src/handlers/event-router.ts`（加耗時記錄，第 8-38 行的 `processEvents`）

現況：

```ts
export async function processEvents(events: WebhookEvent[]): Promise<void> {
  for (const event of events) {
    const quoteToken = event.type === 'message' && event.message.type === 'text' ? event.message.quoteToken : undefined;
    await runWithContext(async () => {
    // Split like notion-fetch.ts's request/response logging: ...
    logger.info({ type: event.type, sourceType: event.source?.type }, 'Processing event');
    logger.debug({ type: event.type, source: event.source, message: 'message' in event ? event.message : undefined }, 'Processing event detail');
    try {
      switch (event.type) {
        case 'message':
          await handleMessage(event);
          break;
        case 'join':
          await handleJoin(event);
          break;
        case 'memberJoined':
          await handleMemberJoined(event);
          break;
        default:
          logger.debug({ type: event.type }, 'Unhandled event type');
      }
    } catch (err) {
      logger.error({ err, eventType: event.type }, 'Error handling event');
    }
    }, quoteToken); // runWithContext
  }
}
```

改成（只加 `startedAt`/`durationMs`，其餘不動；`'Error handling event'` 沿用既有的 `eventType` 欄位名，新加的 `'Event processed'` 沿用 `'Processing event'` 既有的 `type` 欄位名——這兩個名稱不一致是既有程式碼的既有風格，這次不順手統一，避免跟這次的目的無關的改動混在一起）：

```ts
export async function processEvents(events: WebhookEvent[]): Promise<void> {
  for (const event of events) {
    const quoteToken = event.type === 'message' && event.message.type === 'text' ? event.message.quoteToken : undefined;
    await runWithContext(async () => {
    // Split like notion-fetch.ts's request/response logging: ...
    logger.info({ type: event.type, sourceType: event.source?.type }, 'Processing event');
    logger.debug({ type: event.type, source: event.source, message: 'message' in event ? event.message : undefined }, 'Processing event detail');
    const startedAt = Date.now();
    try {
      switch (event.type) {
        case 'message':
          await handleMessage(event);
          break;
        case 'join':
          await handleJoin(event);
          break;
        case 'memberJoined':
          await handleMemberJoined(event);
          break;
        default:
          logger.debug({ type: event.type }, 'Unhandled event type');
      }
      logger.info({ type: event.type, durationMs: Date.now() - startedAt }, 'Event processed');
    } catch (err) {
      logger.error({ err, eventType: event.type, durationMs: Date.now() - startedAt }, 'Error handling event');
    }
    }, quoteToken); // runWithContext
  }
}
```

`'Event processed'` 不是 `groupPairedEntries()` 認得的合併訊息名稱，會以 `kind: 'single'` 落進流程表的 misc 區塊（`renderFlowMisc`），不需要改 `log-grouping.ts`。

#### 6. `src/services/notion/notion-fetch.ts`（加耗時記錄，第 30-72 行）

現況（`assertOk`/`request` 兩個函式）：

```ts
async function assertOk(res: Response, method: string, path: string): Promise<void> {
  if (!res.ok) {
    const err = await res.json();
    logger.error({ method, path, status: res.status, err }, 'Notion API error');
    throw new Error(`Notion API error: ${JSON.stringify(err)}`);
  }
}

const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

function retryDelayMs(res: Response): number {
  const retryAfter = Number(res.headers.get('Retry-After'));
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : DEFAULT_RETRY_DELAY_MS;
}

async function request(method: string, path: string, body?: unknown, attempt = 0): Promise<unknown> {
  const db = getDbName(path);
  logger.info({ method, path, db }, 'Notion API request');
  logger.debug({ method, path, db, ...(body !== undefined && { body }) }, 'Notion API request payload');
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: notionHeaders(),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const delayMs = retryDelayMs(res);
    logger.warn({ method, path, db, attempt: attempt + 1, delayMs }, 'Notion API rate limited, retrying');
    await new Promise((r) => setTimeout(r, delayMs));
    return request(method, path, body, attempt + 1);
  }
  await assertOk(res, method, path);
  const data = await res.json();
  logger.info({ method, path, db }, 'Notion API response');
  logger.debug({ method, path, db, result: data }, 'Notion API response payload');
  return data;
}
```

改成（`assertOk` 多一個 `durationMs` 參數；`request` 在 `fetch` 前後量測單次 HTTP 呼叫的耗時——429 重試時每次遞迴呼叫各自量測自己那一次 attempt 的耗時，不是把重試等待時間也算進去）：

```ts
async function assertOk(res: Response, method: string, path: string, durationMs: number): Promise<void> {
  if (!res.ok) {
    const err = await res.json();
    logger.error({ method, path, status: res.status, err, durationMs }, 'Notion API error');
    throw new Error(`Notion API error: ${JSON.stringify(err)}`);
  }
}

const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

function retryDelayMs(res: Response): number {
  const retryAfter = Number(res.headers.get('Retry-After'));
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : DEFAULT_RETRY_DELAY_MS;
}

async function request(method: string, path: string, body?: unknown, attempt = 0): Promise<unknown> {
  const db = getDbName(path);
  logger.info({ method, path, db }, 'Notion API request');
  logger.debug({ method, path, db, ...(body !== undefined && { body }) }, 'Notion API request payload');
  const startedAt = Date.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: notionHeaders(),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const durationMs = Date.now() - startedAt;
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const delayMs = retryDelayMs(res);
    logger.warn({ method, path, db, attempt: attempt + 1, delayMs, durationMs }, 'Notion API rate limited, retrying');
    await new Promise((r) => setTimeout(r, delayMs));
    return request(method, path, body, attempt + 1);
  }
  await assertOk(res, method, path, durationMs);
  const data = await res.json();
  logger.info({ method, path, db, durationMs }, 'Notion API response');
  logger.debug({ method, path, db, result: data }, 'Notion API response payload');
  return data;
}
```

`'Notion API request'`（呼叫前）不帶 `durationMs`（那時還不知道要多久），只有 `'Notion API response'`/`'Notion API error'`/`'Notion API rate limited, retrying'` 這三個「知道結果」的行才帶。

#### 7. `src/routes/log-grouping.ts`（`LineSendRow` 型別 + 配對邏輯重寫）

現況第 17-22 行：

```ts
export interface LineSendRow {
  kind: 'line-reply' | 'line-push';
  start: LogEntry;
  sent?: LogEntry;
  failure?: LogEntry;
}
```

改成（比照 `NotionCallRow` 的 `request`/`requestPayload`/`response`/`responsePayload` 命名習慣，`payload` 對應「送出前的內容」、`failurePayload` 對應「失敗時的內容」）：

```ts
export interface LineSendRow {
  kind: 'line-reply' | 'line-push';
  method: string;
  path: string;
  start: LogEntry;
  payload?: LogEntry;
  sent?: LogEntry;
  failure?: LogEntry;
  failurePayload?: LogEntry;
}
```

現況第 26-27 行的失敗訊息常數維持不變，另外新增兩個 payload 訊息常數：

```ts
const LINE_REPLY_FAILURE_MSG = 'Reply failed, no fallback available (no groupId for push)';
const LINE_PUSH_FAILURE_MSG = 'Push message failed';
const LINE_REPLY_FAILURE_PAYLOAD_MSG = 'Reply failed payload';
const LINE_PUSH_FAILURE_PAYLOAD_MSG = 'Push message failed payload';
```

第 33-35 行的 `pushSignature()` 整個刪除（不再需要靠內容比對配對，見上方「用 `sendId` 取代內容比對」）。

`processBucket()`（現況第 47-154 行）裡，`openReplies`/`openPushes` 兩個佇列/陣列（現況第 52-53 行）改成跟 Notion call 一樣的兩個 `Map`：

```ts
const openLineSendBySendId = new Map<string, LineSendRow>();
const lastResolvedLineSendBySendId = new Map<string, LineSendRow>();
```

`switch (e.msg)` 裡原本的 6 個 case（`'LINE reply'`、`'LINE reply sent'`、`LINE_REPLY_FAILURE_MSG`、`'LINE push'`、`'LINE push sent'`/`LINE_PUSH_FAILURE_MSG` 合併那組，現況第 112-149 行）整組換成：

```ts
case 'LINE reply':
case 'LINE push': {
  const sendId = String(e['sendId']);
  const row: LineSendRow = {
    kind: e.msg === 'LINE reply' ? 'line-reply' : 'line-push',
    method: String(e['method']),
    path: String(e['path']),
    start: e,
  };
  openLineSendBySendId.set(sendId, row);
  output.push(row);
  break;
}
case 'LINE reply payload':
case 'LINE push payload': {
  const sendId = String(e['sendId']);
  const row = openLineSendBySendId.get(sendId);
  if (row) row.payload = e;
  else output.push({ kind: 'single', entry: e });
  break;
}
case 'LINE reply sent':
case 'LINE push sent': {
  const sendId = String(e['sendId']);
  const row = openLineSendBySendId.get(sendId);
  if (row) {
    row.sent = e;
    lastResolvedLineSendBySendId.set(sendId, row);
    openLineSendBySendId.delete(sendId);
  } else {
    output.push({ kind: 'single', entry: e });
  }
  break;
}
case LINE_REPLY_FAILURE_MSG:
case LINE_PUSH_FAILURE_MSG: {
  const sendId = String(e['sendId']);
  const row = openLineSendBySendId.get(sendId);
  if (row) {
    row.failure = e;
    lastResolvedLineSendBySendId.set(sendId, row);
    openLineSendBySendId.delete(sendId);
  } else {
    output.push({ kind: 'single', entry: e });
  }
  break;
}
case LINE_REPLY_FAILURE_PAYLOAD_MSG:
case LINE_PUSH_FAILURE_PAYLOAD_MSG: {
  const sendId = String(e['sendId']);
  const row = lastResolvedLineSendBySendId.get(sendId);
  if (row && !row.failurePayload) row.failurePayload = e;
  else output.push({ kind: 'single', entry: e });
  break;
}
```

`representativeTime()`（現況第 156-166 行）的 `'line-reply'`/`'line-push'` 分支（`return row.start.time ?? 0;`）不用改。

#### 8. `src/routes/logs.ts`（`renderLineSendRow`/`lineSendDetail`/流程表 JS 改寫）

現況第 194-238 行的 `lineSendDetail`/`renderLineSendRow` 整組改成：

```ts
function lineSendDetail(row: LineSendRow): string {
  const parts: string[] = [`${row.method} ${row.path}`];
  const payloadMessages = row.payload?.['messages'];
  if (row.payload && payloadMessages !== undefined) {
    parts.push(`訊息內容:\n${JSON.stringify(payloadMessages, null, 2)}`);
  } else {
    parts.push('開 LOG_LEVEL=debug 才能看到完整訊息內容');
  }
  if (row.failure) {
    parts.push(`失敗原因:\n${JSON.stringify(row.failure, null, 2)}`);
    const failureMessages = row.failurePayload?.['messages'];
    if (row.failurePayload && failureMessages !== undefined) {
      parts.push(`失敗時的訊息內容:\n${JSON.stringify(failureMessages, null, 2)}`);
    } else {
      parts.push('開 LOG_LEVEL=debug 才能看到失敗時的完整訊息內容');
    }
  } else if (!row.sent) {
    parts.push('尚無送出結果記錄');
  }
  return parts.join('\n\n');
}

function renderLineSendRow(row: LineSendRow): string {
  const levelNum = row.failure?.level ?? row.sent?.level ?? row.start.level ?? 30;
  const levelName = LEVEL_NAMES[levelNum] ?? String(levelNum);
  const color = LEVEL_COLORS[levelName] ?? '#94a3b8';
  const time = formatTime(row.start.time ?? 0);
  const rawReqId = String(row.start.reqId ?? '');
  const label = row.kind === 'line-reply' ? 'LINE 回覆' : 'LINE 推播';

  const methodColor = METHOD_COLORS[row.method] ?? '#94a3b8';
  const methodHtml = `<span class="tag-method" style="color:${methodColor};border-color:${methodColor}">${escapeHtml(row.method)}</span>`;
  const pathHtml = `<span class="tag-path" title="${escapeHtml(row.path)}">${escapeHtml(row.path)}</span>`;

  const payloadMessages = row.payload?.['messages'];
  const messages = Array.isArray(payloadMessages) ? payloadMessages.map(String) : null;
  const contentHtml = messages
    ? escapeHtml(messages.join(' / ').slice(0, 80))
    : '<span class="hint">開 LOG_LEVEL=debug 才能看到訊息內容</span>';

  const icon = statusIcon(!!row.sent, !!row.failure);
  const msgHtml = `<div class="action-row">` +
    `<span class="action-icon">${icon}</span>` +
    `<span class="action-label">${escapeHtml(label)}</span>` +
    `<span class="action-badges">${methodHtml}${pathHtml}</span>` +
    `<span class="action-content">${contentHtml}</span>` +
    `</div>`;

  const extraJson = escapeHtml(lineSendDetail(row));
  const searchableText = JSON.stringify(row).toLowerCase();
  const rawJson = escapeHtml(JSON.stringify(row));

  return `
  <tr class="log-row" data-level="${levelName}" data-time="${row.start.time ?? 0}" data-msg="${escapeHtml(searchableText)}" data-reqid="${rawReqId}" data-raw="${rawJson}" onclick="toggleExtra(this)">
    <td class="time">${time}</td>
    <td><span class="badge" style="background:${color}">${levelName}</span></td>
    ${reqIdCellHtml(rawReqId)}
    <td class="msg">${msgHtml}</td>
  </tr>
  <tr class="extra-row hidden"><td colspan="4"><pre>${extraJson}</pre></td></tr>`;
}
```

`renderDisplayRow`（現況第 240-250 行）不用改，`case 'line-reply': case 'line-push': return renderLineSendRow(row);` 呼叫方式不變。

流程表 JS（`<script>` 內，現況第 544-561 行）的 `renderFlowEndEndpoint`/`renderFlowMisc` 改成：

```js
function renderFlowEndEndpoint(row, label) {
  const payloadMessages = row.payload && Array.isArray(row.payload.messages) ? row.payload.messages.join(' / ') : '';
  const icon = row.failure ? '✕' : (row.sent ? '✓' : '⏳');
  const contentHtml = payloadMessages
    ? ' · ' + escapeHtmlJs(payloadMessages.slice(0, 80))
    : ' · <span class="hint">開 LOG_LEVEL=debug 才能看到訊息內容</span>';
  return '<div class="flow-endpoint"><span class="flow-tag">' + label + '</span>' +
    icon + ' LINE 回覆 ' + methodBadge(row.method, null, row.path) + contentHtml + '</div>';
}

function renderFlowMisc(row) {
  if (row.kind === 'single') {
    return '<div class="flow-misc">' + escapeHtmlJs(row.entry.msg || '') + '</div>';
  }
  // kind === 'line-push': pushes carry no reqId, so a push that lands in
  // an event's group (or the shared '' bucket) is shown inline rather
  // than dropped.
  const payloadMessages = row.payload && Array.isArray(row.payload.messages) ? row.payload.messages.join(' / ') : '';
  const icon = row.failure ? '✕' : (row.sent ? '✓' : '⏳');
  const contentHtml = payloadMessages
    ? ' · ' + escapeHtmlJs(payloadMessages.slice(0, 80))
    : ' · <span class="hint">開 LOG_LEVEL=debug 才能看到訊息內容</span>';
  return '<div class="flow-misc">' + icon + ' LINE 推播 ' + methodBadge(row.method, null, row.path) + contentHtml + '</div>';
}
```

`methodBadge(method, db, path)`（現況第 446-455 行）簽名不變，這裡傳 `null` 當 `db` 引數即可（該函式已經有 `if (db) ...` 的判斷，`null` 會被跳過，不用改函式本身）。

另外，`notionCallDetail()`（現況第 130-151 行）第一行後面補一行耗時顯示，呼應決定 7：

```ts
function notionCallDetail(row: NotionCallRow): string {
  const parts: string[] = [`${row.method} ${row.path}`];
  const durationMs = row.response?.['durationMs'];
  if (typeof durationMs === 'number') {
    parts.push(`耗時: ${durationMs}ms`);
  }
  const requestBody = row.requestPayload?.['body'];
  // ...其餘不變
```

#### 9. `src/commands/registration/registration-handler.ts`（加業務摘要 log）

現況第 1-10 行的 import 區塊加一行 `logger` import：

```ts
import { replyMessage } from '../../services/line/reply-service.js';
import { logger } from '../../utils/logger.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
// ...其餘 import 不變
```

現況第 80-82 行：

```ts
      const updatedGuests = result.newGuests ?? [];
      await calendarRepo.updateGuests(freshEvent.pageId, updatedGuests);

      let headline: string;
```

改成（在 Notion 寫入成功之後、組回覆文字之前插入摘要 log；只在實際寫入成功時記錄，`!result.canAdd` 提早 return 的失敗分支不記錄——那是使用者操作錯誤，不是狀態變化，不算「誰報名了」的業務事件）：

```ts
      const updatedGuests = result.newGuests ?? [];
      await calendarRepo.updateGuests(freshEvent.pageId, updatedGuests);

      logger.info(
        {
          date: nextSaturday,
          delta,
          targetDisplayName: resolved.displayName,
          guestCountAfter: updatedGuests.length,
          cappedAt: result.cappedAt,
        },
        'Registration updated'
      );
      logger.debug(
        { actorUserId: event.source.userId, targetPersonPageId: resolved.personPageId },
        'Registration updated detail'
      );

      let headline: string;
```

**info/debug 分層的判斷理由**（避免留模糊空間）：`targetDisplayName`（報名對象的顯示名稱）放 info，因為這是 Notion People DB 裡的姓名——這個名字本來就會出現在每一則回覆訊息裡（例如「Bob 報名成功」），不是 LINE 平台的內部識別碼，跟決定 2/3 要藏的「groupId/userId」不是同一類資料，公開給管理者查閱不算新增 PII 曝露面。`actorUserId`（操作者的 LINE userId，代操作時操作者跟報名對象可能不同人）則是決定 2/3 講的那類 LINE 平台身分識別碼，放 debug。`targetPersonPageId`（Notion page ID）本身不含個資，放 debug 只是跟 `actorUserId` 放一起、對應「操作明細」的定位，不是因為它本身敏感。

#### 10. `src/commands/registration/leave-handler.ts`（加業務摘要 log）

現況第 1-9 行的 import 區塊加一行 `logger` import：

```ts
import { replyMessage } from '../../services/line/reply-service.js';
import { logger } from '../../utils/logger.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
// ...其餘 import 不變
```

現況第 84-90 行：

```ts
      const newAbsentees = !isCancel
        ? [...freshEvent.absentees, resolved.personPageId]
        : freshEvent.absentees.filter((id) => id !== resolved.personPageId);

      await calendarRepo.updateAbsentees(freshEvent.pageId, newAbsentees);

      const newTotalSlots = calculateTotalSlots({ absentees: newAbsentees }, freshSeason);
```

改成：

```ts
      const newAbsentees = !isCancel
        ? [...freshEvent.absentees, resolved.personPageId]
        : freshEvent.absentees.filter((id) => id !== resolved.personPageId);

      await calendarRepo.updateAbsentees(freshEvent.pageId, newAbsentees);

      logger.info(
        {
          date: nextSaturday,
          isCancel,
          targetDisplayName: resolved.displayName,
          absenteeCountAfter: newAbsentees.length,
        },
        'Leave status updated'
      );
      logger.debug(
        { actorUserId: event.source.userId, targetPersonPageId: resolved.personPageId },
        'Leave status updated detail'
      );

      const newTotalSlots = calculateTotalSlots({ absentees: newAbsentees }, freshSeason);
```

分層理由同上一節，`isCancel`（請假 vs 銷假）放 info 讓管理者能分辨「誰請假」跟「誰銷假」。已經是請假中又請假、或未請假卻銷假的兩個早退分支（現況第 56-68 行、第 70-82 行）不記錄——同樣是使用者操作錯誤/無效操作，不是狀態變化。

---

### 測試檔案

先查證過現有測試檔案清單（`find src -iname "*push-service*" -o ...`），下面標明每個檔案「已存在，需要改」還是「不存在，需要新建」：

| 檔案 | 現況 | 這次要做的事 |
|---|---|---|
| `src/services/line/__tests__/push-service.test.ts` | **不存在，需新建** | 仿照 `reply-service.test.ts`/`notion-fetch.test.ts` 的風格：mock `../../../config/line.js`（`lineClient.pushMessage`）跟 `../../../utils/logger.js`。斷言：(1) `logger.info` 對 `'LINE push'`/`'LINE push sent'` 兩行只帶 `method`/`path`/`sendId`/`messageCount`，不含 `to`/`messages`；(2) `logger.debug` 對 `'LINE push payload'` 帶完整 `to`/`messages`；(3) 兩次呼叫產生的 `sendId` 不同（用來驗證後續 `log-grouping.ts` 配對不會混淆）；(4) 失敗時 `logger.error` 對 `'Push message failed'` 不含 `messages`，`logger.debug` 對 `'Push message failed payload'` 才含；(5) 失敗時仍然 `throw err`（現有行為不能被這次改動動到）。 |
| `src/services/line/__tests__/reply-service.test.ts` | **存在，需要改** | 現有 4 個測試斷言 `mockReplyMessage`（LINE SDK 呼叫參數）不受影響，不用動。但整個檔案目前完全沒有 mock `../../../utils/logger.js`，這次要新增這個 mock，並新增測試比照上面 push-service 的 (1)-(4) 點（reply 版本），另外要驗證原本 `'LINE reply sent'` 是 debug 層級的舊行為，改成 info 層級、不含訊息內容。 |
| `src/services/line/__tests__/profile-service.test.ts` | **不存在，需新建** | mock `../../../config/line.js`（`getProfile`/`getGroupMemberProfile`）跟 `../../../utils/logger.js`。斷言：(1) 成功時 `logger.info` 帶 `method`/`path`，不含 `userId`/`groupId`；(2) `logger.debug` 才帶 `userId`/`groupId`/`displayName`；(3) 有無 `groupId` 兩種情況各自對應 `GROUP_MEMBER_PATH`/`USER_PROFILE_PATH`；(4) 失敗（`getGroupMemberProfile`/`getProfile` reject）時 `logger.warn` 不含 `userId`/`groupId`，`logger.debug` 才含，且回傳 `null`（既有行為）。 |
| `src/routes/__tests__/webhook.test.ts` | **存在，需要改** | 目前完全沒有 mock `logger.js`。新增 `vi.mock('../../utils/logger.js', ...)`（相對於 `src/__tests__/webhook.test.ts` 的正確路徑是 `'../utils/logger.js'`），新增測試送一筆帶 `userId`/`text` 的 `events`，斷言 `logger.info` 對 `'Webhook received'` 只帶 `eventCount`、不含 `events` 欄位，`logger.debug` 對 `'Webhook received detail'` 才帶完整 `events`。 |
| `src/handlers/__tests__/event-router.test.ts` | **存在，需要改** | 現有兩個測試（quoteToken 相關）不受影響。新增 `vi.mock('../../utils/logger.js', ...)` 跟兩個新測試：(1) `handleMessage` 正常完成時，`logger.info` 對 `'Event processed'` 帶 `durationMs: expect.any(Number)`；(2) `handleMessage` reject 時，`logger.error` 對 `'Error handling event'` 帶 `durationMs: expect.any(Number)`（且不影響現有「拋出的錯誤被吞掉、不會讓 `processEvents` 整體 reject」的既有行為，這次沒有測試明確斷言這件事，但程式碼邏輯不變，仍然成立）。 |
| `src/services/notion/__tests__/notion-fetch.test.ts` | **存在，需要改** | 現有 `'split-level Notion API logging'` 那組測試（第 125-159 行）的 `logger.info` 斷言目前用**精確物件相等**（`toHaveBeenCalledWith({ method, path, db }, 'Notion API request')`），這次 `'Notion API response'` 多了 `durationMs` 欄位後這個精確比對會壞掉，要改成 `expect.objectContaining({ method, path, db, durationMs: expect.any(Number) })` 只套在 `'...response'` 那筆斷言上，`'...request'` 那筆维持精確比對不變（因為 request 行本來就不含 `durationMs`）。另外新增：429 重試測試裡 `logger.warn` 的 `'Notion API rate limited, retrying'` 斷言補上 `durationMs: expect.any(Number)`；`assertOk` 失敗那組測試裡 `logger.error` 的 `'Notion API error'` 斷言補上 `durationMs: expect.any(Number)`。 |
| `src/routes/__tests__/log-grouping.test.ts` | **存在，需要大改** | 現有跟 push/reply 相關的 4 個測試（`'pairs a successful LINE reply'`、`'pairs a failed LINE reply'`、`'pairs LINE push by content, not reqId...'`，以及其餘 3 個不涉及 push/reply 的測試不用動）要整組改寫：entry 資料加上 `method`/`path`/`sendId` 欄位，`'LINE reply'`/`'LINE push'` 這兩行不再帶 `messages`，改成獨立的 `'LINE reply payload'`/`'LINE push payload'` entry 帶 `sendId`+`messages`，斷言 `row.payload` 而不是 `row.start['messages']`。`'pairs LINE push by content, not reqId...'` 這個測試名稱本身也要改（配對機制已經不是「靠內容」，改成靠 `sendId`），情境改成兩個 `to`/`messages`完全相同但 `sendId` 不同的 push，驗證不會誤配對。新增測試：驗證 `'Reply failed payload'`/`'Push message failed payload'` debug 行能正確配對到已經 resolve 的失敗 row 的 `failurePayload`（比照現有 `'Notion API response payload'` 配對 `lastResolvedNotionByKey` 的測試寫法）。 |
| `src/routes/__tests__/logs.test.ts` | **存在，需要改** | 現有 5 個測試不涉及 LINE row，不用動。新增測試：(1) mock 一筆完整配對的 `line-reply`（`LINE reply` + `LINE reply payload` + `LINE reply sent`，帶 `method`/`path`/`sendId`）readRecentLogs 回傳，斷言渲染出的 HTML 含 `tag-method`、`tag-path`、實際訊息文字；(2) mock 一筆**沒有** `payload` 的 `line-reply`（模擬 `LOG_LEVEL=info` 下沒有捕捉到 debug 行的情況），斷言渲染出的 HTML 含「開 LOG_LEVEL=debug 才能看到訊息內容」提示文字、不含訊息原文。 |
| `src/commands/registration/__tests__/registration-handler.test.ts` | **存在，需要改** | 現有測試（例如第 76 行 `'wraps the read-modify-write in withMutex...'`、第 85 行 `'registers a guest for a non-season-member...'`）不受影響，不用動斷言內容。新增 `vi.mock('../../../utils/logger.js', ...)` 跟一個新測試：成功報名後 `logger.info` 被呼叫、帶 `'Registration updated'`，物件含 `targetDisplayName: 'Alice'`（或情境對應的名字）、`delta`、`guestCountAfter`，且**不含** `actorUserId`；`logger.debug` 帶 `'Registration updated detail'`，物件含 `actorUserId`。另外新增一個測試驗證 `!result.canAdd`（例如非管理員超額報名不被 cap 允許、或找不到帳號）分支不會呼叫 `logger.info`（對應上面「失敗分支不記錄」的決定）。 |
| `src/commands/registration/__tests__/leave-handler.test.ts` | **存在，需要改** | 現有測試（例如第 59、66、73、87 行）不受影響。新增 `vi.mock('../../../utils/logger.js', ...)` 跟對應的成功/早退分支測試，比照 registration-handler 那組。 |

---

### 文件更新清單

- **`docs/logging.md`**：
  - 「合併顯示」小節（現況第 12-17 行）補上 LINE 回覆/推播現在也有 method/path 徽章的說明，跟 Notion API 呼叫那條並列。
  - 新增一段說明：LINE 訊息內容（回覆/推播全文）跟 groupId/userId 這類身分識別資訊，這次比照 Notion body 搬到 debug 層，預設 `LOG_LEVEL=info` 下平面模式/流程表模式都只會看到方法/路徑徽章跟「開 `LOG_LEVEL=debug` 才能看到訊息內容」的提示，看不到訊息原文——這是刻意的 UX 犧牲換取預設環境不外洩內容，明確提醒讀者不要誤以為是 bug。
  - 補一句：`profile-service.ts` 現在有摘要 log，但沒有被流程表特別合併/配對顯示，會以一般單行出現在平面模式跟流程表的雜項區塊。
  - 「Endpoint path」小節可以補一句：耗時（`durationMs`）也記錄在 Notion API 呼叫的展開明細裡（`耗時: Xms`）。
- **`docs/adr/0005-purpose-context-layered-on-reqid.md`**：**建議在檔案末尾新增一段**（不是開新 ADR），理由：這次改動的核心原則（摘要級資訊留 info、載荷級/身分識別資訊留 debug）跟 ADR 0005 記錄的原則完全一樣，只是把同一套原則延伸套用到 LINE API 呼叫，不是新的架構決策。新增內容建議涵蓋：(1) LINE push/reply/profile 也採用同一套分層，理由跟 Notion body 一致；(2) 為什麼 push/reply 的配對機制從內容比對（`pushSignature`/佇列 FIFO）改成專屬的 `sendId`——因為內容（`to`/`messages`）搬到 debug 後，content-based 配對在預設 `LOG_LEVEL=info` 下會失效；(3) error/warn log 不受 `LOG_LEVEL` 篩選、一定會輸出，所以訊息內容不能直接放在 error/warn 那一行，要另開一行 debug payload——這是「新增任何會被流程表用到的 log 呼叫時」這條既有提醒的一個新案例，值得記下來避免後人重蹈覆轍。
- 這次改動**不影響**：`docs/README.md`、`docs/development.md`、`docs/architecture.md`（沒有描述到 LINE log 分層細節，不用動）。

---

### 驗收標準

- [ ] `push-service.ts`/`reply-service.ts` 的 info 層級 log 只含 `method`/`path`/`sendId`/`messageCount`，不含 `to`/`replyToken` 全文/`messages`。
- [ ] `push-service.ts`/`reply-service.ts` 失敗時的 warn/error log 不含訊息內容，訊息內容只在對應的 debug payload 行。
- [ ] `profile-service.ts` 的 `getProfile()` 成功跟失敗都有 log（目前成功完全沒有 log），`userId`/`groupId` 只在 debug 層。
- [ ] `webhook.ts:12` 不再有一行 log 同時含完整 `events` 且是 info 層級。
- [ ] `event-router.ts` 的 `'Event processed'`/`'Error handling event'`、`notion-fetch.ts` 的 `'Notion API response'`/`'Notion API error'`/`'Notion API rate limited, retrying'` 都帶 `durationMs`。
- [ ] `registration-handler.ts`/`leave-handler.ts` 在報名/請假成功寫入 Notion 後各有一行 info 摘要 log + 一行 debug 明細 log；失敗/無效操作分支不記錄。
- [ ] `/logs` 頁面平面模式跟流程表模式都能顯示 LINE 呼叫的 method/path 徽章。
- [ ] 預設 `LOG_LEVEL=info` 情境下（測試裡用「不提供 payload entry」模擬），`/logs` 頁面看不到 LINE 訊息全文，顯示「開 `LOG_LEVEL=debug` 才能看到訊息內容」提示，不是空白或報錯。
- [ ] 兩個內容完全相同（`to`/`messages` 一樣）但不同次呼叫的 push，在 `/logs` 頁面不會被誤配對成同一次呼叫。
- [ ] 上述「測試檔案」表格列出的每個檔案都已新建或更新，`npm test` 全過。
- [ ] `npx tsc --noEmit`、`npm run build` 全過。
- [ ] `docs/logging.md` 已更新；`docs/adr/0005-*.md` 已補充新段落。

---

### 查證中發現、需要使用者決定（保守不動，先記錄）

- **`push-service.ts` 呼叫端（`weekly-push.ts`）的錯誤處理沒有查證過**：這次規格只涵蓋 `pushMessage()` 本身的 log 分層，沒有檢查 `weekly-push.ts` 呼叫 `pushMessage()` 後怎麼處理 `throw err`（例如會不會導致整個排程 job 中斷、要不要也補 log）。`weekly-push.ts` 本身不在這次「查詢清單」範圍內，沒有讀過，不確定改動 `pushMessage()` 的 log 內容是否會影響它既有的錯誤處理邏輯（理論上不會，因為只改了 log 呼叫、`throw err` 行為不變，但保守起見列出來，實作前建議先讀一次 `weekly-push.ts` 確認）。
- **`docs/schedulers.md` 是否需要更新**：`schedulers/display-name-update.ts` 有呼叫 `profile-service.ts` 的 `getProfile()`（見 `CLAUDE.md` 提到的 400ms delay 那段程式碼），這次幫 `getProfile()` 加的摘要 log 會讓 `display-name-update.ts` 跑批次作業時多出大量 log 行（每個使用者一行 info）。這是否符合預期、要不要在 `docs/schedulers.md` 提一句「批次更新顯示名稱時 `/logs` 會出現對應數量的 `'LINE get profile'` 行」，這次沒有讀過 `docs/schedulers.md` 現有內容判斷是否需要更新，列出來讓使用者確認要不要一併處理，這次先不動這份文件。

---

## 手動測試追蹤（ngrok 接真實 LINE 帳號測試）

> 每項測完打勾，機器人實際回應貼進該項下方的 code block（原文照貼、保留換行），有問題另加「備註：」說明差異。

- [ ] 全形 `＋`/`－` 符號 —— 程式碼已支援（`command-parser.ts`／`registration-parser.ts` 的 `normalizeFullWidth()`），只需要實際傳 `@Dobby ＋1` 這種全形指令驗證一次即可，不需要改 code
- [ ] 清除測試產生的 Notion 假資料

---

## 已評估、不採納

- **表格驅動指令解析與路由**（`/improve-codebase-architecture` 報告候選 3，Speculative）— 評估後不採納。理由：(1) 各 command handler 簽名不一致（7 種不同形狀，從 `(replyToken, botId)` 到 `(event, delta, botId, isAdmin)`），單一表格 row 形狀塞不下這些差異；(2) 報告自己也承認 deletion test 不明確，拆掉 `command-parser.ts`/`command-router.ts` 可能只是把 switch 搬位置，不會真正集中複雜度；(3) 唯一有具體壞味道支撐的症狀（courtOverride 解析邏輯被拆到兩個 module）已用小範圍修法解決，`next?c=N` what-if 預覽見 `docs/commands.md`。若未來新增指令的頻率明顯提高、且 handler 簽名先被拉齊，可重新評估。
- **[1.2] `people-repository.ts`/`season-repository.ts`/`announcement-repository.ts` 查詢分頁處理** — 評估後不採納。目前社團規模（未結清人數、season 數、公告內容）遠低於 Notion 單頁 100 筆上限，此狀況實務上不會發生，不需為此增加分頁邏輯的複雜度。
- **[2.1] `member-joined-handler.ts` 多人同時加入群組時用 `pushMessage` 補發歡迎訊息** — 評估後不採納，不修正。原因：此專案原則上不使用 `pushMessage`（唯一例外是既有的 `weekly-push.ts` 週報推播，見 `CLAUDE.md` 專案慣例），不為此問題新增 push 用法。第一位以外的成員收不到歡迎訊息維持現況。

---

## 程式碼審查待修問題（2026-09-17 分模組審查）

> 全專案依模組（Notion 資料層 / LINE 整合 / 指令系統 / 報名請假核心 / 排程與基礎設施）分開派 subagent 審查。**完整技術細節、程式碼片段、每個模組「確認沒問題」的部分見 [`docs/code-review-2026-09-17.md`](docs/code-review-2026-09-17.md)**，章節編號（如 `[4.1]`）與下方清單一一對應。已修復且有文件記錄的項目已移除，見對應 `docs/*.md`／`docs/adr/*.md`。

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
- [ ] **[5.8] `utils/logger.ts:4` 直接讀 `process.env['NODE_ENV']`，繞過 `env.ts`（目前因 import 順序無實害）。**
- [ ] **[5.9] `env.ts:15` `PORT` 是 `z.string()` 用 `parseInt` 轉型，填非數字字串會得到 `NaN` 導致 `app.listen(NaN)` 監聽隨機 port 而非 fail-fast。建議改 `z.coerce.number().int().positive()`。**
- [ ] **[5.10] `data/auto-reply.json` 多組 trigger 重複出現兩次以上（「朋友」「雙胞胎」及多個哈利波特咒語），後面那組（疑似改寫成療癒語氣的版本）永遠是死碼，`findReply` 抓第一個符合就回傳。需與內容維護者確認是否刻意設計。**
- [ ] **[5.11] `user-management.ts:16-47` `_trackUserAsync` 讀取→計算→寫回沒套 `withMutex`，fire-and-forget 下同一使用者連續發訊息可能漏算訊息計數/群組清單，僅影響統計。**
