import type { messagingApi } from '@line/bot-sdk';
import { getEventOccupancy } from '../services/notion/event-occupancy.js';
import { pendingTaskCount } from '../services/mutex.js';
import { buildWeeklyStatusReply } from './weekly-status-message.js';
import { replyMessage } from '../services/line/reply-service.js';
import { formatDate, getNextSaturday } from '../utils/date-utils.js';
import { logger } from '../utils/logger.js';

// Open to every member: it's how someone who got the registration timeout reply checks the
// result themselves (ADR 0019). The card itself must stay identical to the weekly push (ADR
// 0011), so the pending notice goes in a separate text message after it.
export async function handleNextEvent(replyToken: string): Promise<void> {
  try {
    const nextSat = getNextSaturday();
    const dateStr = formatDate(nextSat);

    // Read without the lock. A registration/leave on this date (same key as
    // withFreshCalendarEvent) pending before or during the read may not be reflected yet —
    // e.g. queued behind a stuck Notion write — so the user must not take the card as final
    // and resend `+1`, which isn't idempotent.
    const pendingBefore = pendingTaskCount(dateStr);
    const occupancy = await getEventOccupancy(dateStr);

    if (!occupancy) {
      await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${dateStr} 的活動` }]);
      return;
    }

    const reply = await buildWeeklyStatusReply(occupancy, dateStr);
    const pending = Math.max(pendingBefore, pendingTaskCount(dateStr));
    const messages: messagingApi.Message[] = [reply];
    if (pending > 0) {
      messages.push({
        type: 'text',
        text: `⏳ 還有 ${pending} 筆報名／請假正在處理，上面的名單可能還會變動，請稍後再查一次，不要重複操作。`,
      });
    }

    await replyMessage(replyToken, messages);
  } catch (err) {
    logger.error({ err }, 'Next event handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
