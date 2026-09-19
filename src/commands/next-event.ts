import { getEventOccupancy } from '../services/notion/event-occupancy.js';
import { replyMessage } from '../services/line/reply-service.js';
import { formatDate, getNextSaturday } from '../utils/date-utils.js';
import { logger } from '../utils/logger.js';
import type { NextEventQueryParams } from '../types/commands.js';

export async function handleNextEvent(
  replyToken: string,
  isAdmin: boolean,
  queryParams?: NextEventQueryParams
): Promise<void> {
  if (!isAdmin) {
    await replyMessage(replyToken, [{ type: 'text', text: '此指令僅限管理員使用' }]);
    return;
  }

  try {
    const dayOffset = queryParams?.dayOffset ?? 0;
    const courtOverride = queryParams?.courtOverride ?? null;

    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + dayOffset);
    const nextSat = getNextSaturday(baseDate);
    const dateStr = formatDate(nextSat);

    const occupancy = await getEventOccupancy(dateStr, courtOverride ?? undefined);

    if (!occupancy) {
      await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${dateStr} 的活動` }]);
      return;
    }

    const { event: calEvent, presentSeasonMembers, totalPeople, remainingSlots } = occupancy;
    const guestCount = calEvent.guests.length;

    const lines = [
      `📅 ${dateStr}`,
      `季租出席：${presentSeasonMembers} 人`,
      `零打報名：${guestCount} 人`,
      `總計：${totalPeople} 人`,
      `狀態：${calEvent.isPaused ? '⛔ 暫停' : '✅ 正常'}`,
    ];

    if (calEvent.guests.length > 0) {
      lines.push(`\n零打名單：\n${calEvent.guests.map((g, i) => `${i + 1}. ${g}`).join('\n')}`);
    }

    if (courtOverride !== null) {
      lines.push(`（若 ${courtOverride} 場地：剩餘名額 ${remainingSlots} 人）`);
    }

    await replyMessage(replyToken, [{ type: 'text', text: lines.join('\n') }]);
  } catch (err) {
    logger.error({ err }, 'Next event handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
