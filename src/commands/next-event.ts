import * as calendarRepo from '../services/notion/calendar-repository.js';
import * as seasonRepo from '../services/notion/season-repository.js';
import { replyMessage } from '../services/line/reply-service.js';
import { formatDate, getNextSaturday } from '../utils/date-utils.js';
import { logger } from '../utils/logger.js';

export async function handleNextEvent(
  replyToken: string,
  botId: string,
  isAdmin: boolean,
  queryParams?: string
): Promise<void> {
  if (!isAdmin) {
    await replyMessage(replyToken, [{ type: 'text', text: '此指令僅限管理員使用' }], botId);
    return;
  }

  try {
    // Parse query params: "-=N" (subtract N days) and "c=N" (court count override)
    let dayOffset = 0;
    let courtOverride: number | null = null;
    if (queryParams) {
      const offsetMatch = queryParams.match(/-=(\d+)/);
      if (offsetMatch) dayOffset = -parseInt(offsetMatch[1], 10);
      const courtMatch = queryParams.match(/c=(\d+)/);
      if (courtMatch) courtOverride = parseInt(courtMatch[1], 10);
    }

    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + dayOffset);
    const nextSat = getNextSaturday(baseDate);
    const dateStr = formatDate(nextSat);

    const calEvent = await calendarRepo.findByDate(dateStr);
    const seasons = await seasonRepo.findAll();
    const activeSeason = seasons[0];

    if (!calEvent) {
      await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${dateStr} 的活動` }], botId);
      return;
    }

    const seasonMemberCount = activeSeason?.members.length ?? 0;
    const absentCount = calEvent.absentees.length;
    const guestCount = calEvent.guests.length;
    const present = seasonMemberCount - absentCount + guestCount;

    const lines = [
      `📅 ${dateStr}`,
      `季租出席：${seasonMemberCount - absentCount} 人`,
      `零打報名：${guestCount} 人`,
      `總計：${present} 人`,
      `狀態：${calEvent.isPaused ? '⛔ 暫停' : '✅ 正常'}`,
    ];

    if (calEvent.guests.length > 0) {
      lines.push(`\n零打名單：\n${calEvent.guests.map((g, i) => `${i + 1}. ${g}`).join('\n')}`);
    }

    // courtOverride is parsed but not used in display currently
    void courtOverride;

    await replyMessage(replyToken, [{ type: 'text', text: lines.join('\n') }], botId);
  } catch (err) {
    logger.error({ err }, 'Next event handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }], botId);
  }
}
