import * as calendarRepo from '../services/notion/calendar-repository.js';
import * as seasonRepo from '../services/notion/season-repository.js';
import { replyMessage } from '../services/line/reply-service.js';
import { formatDate, getNextSaturday } from '../utils/date-utils.js';
import { calculateTotalSlots } from './registration/capacity-calculator.js';
import { logger } from '../utils/logger.js';
import type { NextEventQueryParams } from '../types/commands.js';

export async function handleNextEvent(
  replyToken: string,
  botId: string,
  isAdmin: boolean,
  queryParams?: NextEventQueryParams
): Promise<void> {
  if (!isAdmin) {
    await replyMessage(replyToken, [{ type: 'text', text: '此指令僅限管理員使用' }], botId);
    return;
  }

  try {
    const dayOffset = queryParams?.dayOffset ?? 0;
    const courtOverride = queryParams?.courtOverride ?? null;

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

    if (courtOverride !== null && activeSeason) {
      const whatIfSlots = calculateTotalSlots(calEvent, { ...activeSeason, courts: courtOverride }) - guestCount;
      lines.push(`（若 ${courtOverride} 場地：剩餘名額 ${whatIfSlots} 人）`);
    }

    await replyMessage(replyToken, [{ type: 'text', text: lines.join('\n') }], botId);
  } catch (err) {
    logger.error({ err }, 'Next event handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }], botId);
  }
}
