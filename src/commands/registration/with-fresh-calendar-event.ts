import { withMutex } from '../../services/mutex.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import { replyMessage } from '../../services/line/reply-service.js';
import { logger } from '../../utils/logger.js';

export async function withFreshCalendarEvent<T>(
  replyToken: string,
  botId: string,
  date: string,
  context: string,
  refetch: () => Promise<T | null>,
  mutation: (fresh: T) => Promise<void>
): Promise<void> {
  const calEvent = await calendarRepo.findByDate(date);
  if (!calEvent) {
    await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${date} 的活動` }], botId);
    return;
  }

  try {
    await withMutex(calEvent.pageId, async () => {
      const fresh = await refetch();
      if (!fresh) throw new Error('Event not found');
      await mutation(fresh);
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message?.includes('Mutex busy')) {
      await replyMessage(replyToken, [{ type: 'text', text: '系統忙碌中，請稍後再試' }], botId);
      return;
    }
    logger.error({ err }, `${context} error`);
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }], botId);
  }
}
