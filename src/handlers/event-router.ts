import type { WebhookEvent } from '@line/bot-sdk';
import { handleMessage } from './message-handler.js';
import { handleJoin } from './join-handler.js';
import { handleMemberJoined } from './member-joined-handler.js';
import { logger } from '../utils/logger.js';
import { runWithContext } from '../utils/request-context.js';

export async function processEvents(events: WebhookEvent[]): Promise<void> {
  for (const event of events) {
    const quoteToken = event.type === 'message' && event.message.type === 'text' ? event.message.quoteToken : undefined;
    await runWithContext(async () => {
    // Split like notion-fetch.ts's request/response logging: an info-level
    // summary with no PII (source/message can carry a LINE userId/groupId
    // and the user's raw message text) so the flow-table view always has a
    // starting point to show, and a debug-level line with the full detail
    // for when someone actually needs to see what was sent.
    //
    // lagMs = 現在 − LINE 記錄的事件發生時間。它混了 LINE→Pi 的送達延遲、
    // Pi 的時鐘偏差（沒校時可能是負值或固定偏移），以及同一個 webhook 多筆
    // 事件依序處理時後面事件的排隊時間；重送事件（isRedelivery）的 timestamp
    // 是原始發生時間，lagMs 本來就會很大。不能直接拿 lagMs 判斷 replyToken
    // 會不會失效：LINE 的 1 分鐘時限從「收到 webhook」起算，送達延遲不算在
    // 內，主要看 Event processed 的 durationMs（見 docs/logging.md）。
    logger.info(
      {
        type: event.type,
        sourceType: event.source?.type,
        webhookEventId: event.webhookEventId,
        isRedelivery: event.deliveryContext.isRedelivery,
        lagMs: Date.now() - event.timestamp,
      },
      'Processing event'
    );
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
