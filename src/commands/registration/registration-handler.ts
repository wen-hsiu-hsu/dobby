import { withMutex } from '../../services/mutex.js';
import { replyMessage } from '../../services/line/reply-service.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import * as peopleRepo from '../../services/notion/people-repository.js';
import { resolveTarget } from './target-resolver.js';
import { calculateAddCapacity, calculateRemoveCapacity } from './capacity-calculator.js';
import { parseRegistrationTarget } from './registration-parser.js';
import { formatDate, getNextSaturday, getCurrentSeasonName } from '../../utils/date-utils.js';
import { logger } from '../../utils/logger.js';
import type { SeasonRecord } from '../../types/notion-models.js';

interface MessageEvent {
  replyToken: string;
  message: { text: string; mention?: unknown };
  source: { userId: string };
}

export async function handleRegistration(
  event: MessageEvent,
  delta: number,
  botId: string,
  isAdmin = false
): Promise<void> {
  const target = parseRegistrationTarget(event as any);

  if (target.parseError) {
    await replyMessage(event.replyToken, [{ type: 'text', text: target.parseError }], botId);
    return;
  }

  const resolved = await resolveTarget(target, event.source.userId);
  if (!resolved) {
    await replyMessage(event.replyToken, [{ type: 'text', text: '找不到您的帳號，請先向管理員登記' }], botId);
    return;
  }

  const nextSaturday = formatDate(getNextSaturday());
  const calEvent = await calendarRepo.findByDate(nextSaturday);
  if (!calEvent) {
    await replyMessage(event.replyToken, [{ type: 'text', text: `找不到 ${nextSaturday} 的活動` }], botId);
    return;
  }

  // Get current season by name (e.g. "2026-Q1"), not by array index
  const activeSeason = await seasonRepo.findByName(getCurrentSeasonName());
  if (!activeSeason) {
    await replyMessage(event.replyToken, [{ type: 'text', text: `找不到 ${getCurrentSeasonName()} 季租資料` }], botId);
    return;
  }

  const isSelfSeasonMember = activeSeason.members.includes(resolved.personPageId);

  try {
    await withMutex(calEvent.pageId, async () => {
      const freshEvent = await calendarRepo.findByDate(nextSaturday);
      if (!freshEvent) throw new Error('Event not found');

      let result;
      if (delta > 0) {
        result = calculateAddCapacity(freshEvent, activeSeason, resolved.displayName, delta, isSelfSeasonMember, isAdmin);
      } else {
        result = calculateRemoveCapacity(freshEvent, resolved.displayName, delta, isSelfSeasonMember);
      }

      if (!result.canAdd) {
        await replyMessage(event.replyToken, [{ type: 'text', text: result.error ?? '操作失敗' }], botId);
        return;
      }

      const updatedGuests = result.newGuests ?? [];
      await calendarRepo.updateGuests(freshEvent.pageId, updatedGuests);

      const replyText = await buildRegistrationReply(
        nextSaturday,
        updatedGuests,
        freshEvent.absentees,
        activeSeason,
        delta,
      );
      await replyMessage(event.replyToken, [{ type: 'text', text: replyText }], botId);
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message?.includes('Mutex busy')) {
      await replyMessage(event.replyToken, [{ type: 'text', text: '系統忙碌中，請稍後再試' }], botId);
      return;
    }
    logger.error({ err }, 'Registration handler error');
    await replyMessage(event.replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }], botId);
  }
}

async function buildRegistrationReply(
  date: string,
  guests: string[],
  absenteePageIds: string[],
  season: SeasonRecord,
  delta: number,
): Promise<string> {
  const COURTS_DENSITY = 7;
  const totalSlots = season.courts * COURTS_DENSITY - season.members.length + absenteePageIds.length;
  const remainingSlots = Math.max(0, totalSlots - guests.length);

  // Numbered guest list (show all slots including empty ones)
  const displaySlots = Math.max(totalSlots, guests.length);
  const guestLines = Array.from({ length: displaySlots }, (_, i) =>
    `${i + 1}. ${guests[i] ?? ''}`,
  ).join('\n');

  // Fetch absentee names
  let absenteeText = '無';
  if (absenteePageIds.length > 0) {
    const absentees = await peopleRepo.findByPageIds(absenteePageIds);
    absenteeText = absentees.map((p) => p.name).join('、');
  }

  const action = delta > 0 ? '報名成功 ✅' : '取消報名成功 ✅';
  const totalPeople = season.members.length - absenteePageIds.length + guests.length;

  return [
    `${action}`,
    '',
    date,
    `零打名額 ${totalSlots} 人 | $${season.guestFee}/人`,
    guestLines,
    `剩餘名額：${remainingSlots} 人`,
    `請假：${absenteeText}`,
    '',
    `若要報名請輸入 @Dobby +1`,
    `總人數：共 ${totalPeople} 人`,
  ].join('\n');
}
