import { getEventOccupancy } from '../services/notion/event-occupancy.js';
import { buildWeeklyStatusMessage } from './weekly-status-message.js';
import { replyMessage } from '../services/line/reply-service.js';
import { formatDate, getNextSaturday } from '../utils/date-utils.js';
import { logger } from '../utils/logger.js';

export async function handleNextEvent(replyToken: string, isAdmin: boolean): Promise<void> {
  if (!isAdmin) {
    await replyMessage(replyToken, [{ type: 'text', text: '此指令僅限管理員使用' }]);
    return;
  }

  try {
    const nextSat = getNextSaturday();
    const dateStr = formatDate(nextSat);

    const occupancy = await getEventOccupancy(dateStr);

    if (!occupancy) {
      await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${dateStr} 的活動` }]);
      return;
    }

    const text = await buildWeeklyStatusMessage(occupancy, dateStr);

    await replyMessage(replyToken, [{ type: 'text', text }]);
  } catch (err) {
    logger.error({ err }, 'Next event handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
