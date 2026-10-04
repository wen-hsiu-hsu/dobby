import type { messagingApi } from '@line/bot-sdk';
import { withMutex, MutexTimeoutError } from '../../services/mutex.js';
import { replyMessage } from '../../services/line/reply-service.js';
import { logger } from '../../utils/logger.js';
import { logOutcome } from './outcome-log.js';
import { buildEventStatusReply, type EventStatusParams } from './event-status-message.js';

class EventNotFoundError extends Error {}

// The mutation keeps running after a timeout and may still write, but nobody can report
// its result: this message has already used the replyToken. `+N`/`-N`
// are not idempotent, so the message must stop users from retrying. `next` is
// admin-only, so it can't point regular members there.
const TIMEOUT_REPLY = '處理時間較長，這次操作可能已經完成，請勿重複操作。如需確認，請洽管理員。';

export async function withFreshCalendarEvent<T>(
  replyToken: string,
  date: string,
  context: string,
  refetch: () => Promise<T | null>,
  mutation: (fresh: T) => Promise<EventStatusParams>
): Promise<void> {
  let status: EventStatusParams;
  try {
    // Lock by date (not the event's page ID) so we don't need an extra lookup
    // just to learn the lock key — refetch() below does the one query we need.
    status = await withMutex(date, async () => {
      const fresh = await refetch();
      if (!fresh) throw new EventNotFoundError();
      return mutation(fresh);
    });
  } catch (err: unknown) {
    if (err instanceof EventNotFoundError) {
      // Handlers pass their own log context here, so this lands on the same
      // `${context} outcome` message as their other branches — just with fewer fields,
      // since request details (delta, season...) never reach the wrapper.
      logOutcome(context, { outcome: 'event-not-found', date });
      await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${date} 的活動` }]);
      return;
    }
    if (err instanceof MutexTimeoutError) {
      logger.warn({ err }, `${context} timed out; result unknown to the user`);
      await replyMessage(replyToken, [{ type: 'text', text: TIMEOUT_REPLY }]);
      return;
    }
    logger.error({ err }, `${context} error`);
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
    return;
  }

  // Built and sent after the lock is released: the card's absentee-name lookup and the
  // LINE reply don't touch the event, and the mutation already snapshotted everything the
  // card shows, so holding the lock for them would only make the next caller wait longer.
  // After a timeout we never get here, so the background task skips both — its reply would
  // be rejected anyway, since the timeout message already used the replyToken.
  await replyStatus(replyToken, context, status);
}

// By now the write (if any) has succeeded, so a failure here must not reach the generic
// "系統錯誤" reply: `+N` isn't idempotent and a retry would register twice. Fall back to the
// headline alone rather than a card with a missing or partial absentee list.
async function replyStatus(replyToken: string, context: string, status: EventStatusParams): Promise<void> {
  let reply: messagingApi.Message;
  try {
    reply = await buildEventStatusReply(status);
  } catch (err: unknown) {
    logger.warn({ err }, `${context} status card failed; replied with the headline only`);
    reply = { type: 'text', text: `${status.headline}\n（名額狀態暫時無法顯示）` };
  }
  await replyMessage(replyToken, [reply]);
}
