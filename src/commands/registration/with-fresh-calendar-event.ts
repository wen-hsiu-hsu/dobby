import { withMutex } from '../../services/mutex.js';
import { replyMessage } from '../../services/line/reply-service.js';
import { logger } from '../../utils/logger.js';

class EventNotFoundError extends Error {}

export async function withFreshCalendarEvent<T>(
  replyToken: string,
  botId: string,
  date: string,
  context: string,
  refetch: () => Promise<T | null>,
  mutation: (fresh: T) => Promise<void>
): Promise<void> {
  try {
    // Lock by date (not the event's page ID) so we don't need an extra lookup
    // just to learn the lock key — refetch() below does the one query we need.
    await withMutex(date, async () => {
      const fresh = await refetch();
      if (!fresh) throw new EventNotFoundError();
      await mutation(fresh);
    });
  } catch (err: unknown) {
    if (err instanceof EventNotFoundError) {
      await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${date} 的活動` }], botId);
      return;
    }
    logger.error({ err }, `${context} error`);
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }], botId);
  }
}
