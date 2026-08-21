import { replyMessage } from '../../services/line/reply-service.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import * as peopleRepo from '../../services/notion/people-repository.js';
import { getEventOccupancy } from '../../services/notion/event-occupancy.js';
import type { EventOccupancy } from '../../services/notion/event-occupancy.js';
import { withFreshCalendarEvent } from './with-fresh-calendar-event.js';
import { resolveTarget } from './target-resolver.js';
import { calculateAddCapacity, calculateRemoveCapacity } from './capacity-calculator.js';
import { parseRegistrationTarget } from './registration-parser.js';
import { formatDate, getNextSaturday, getCurrentSeasonName } from '../../utils/date-utils.js';

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

  // Get current season by name (e.g. "2026-Q1"), not by array index
  const activeSeason = await seasonRepo.findByName(getCurrentSeasonName());
  if (!activeSeason) {
    await replyMessage(event.replyToken, [{ type: 'text', text: `找不到 ${getCurrentSeasonName()} 季租資料` }], botId);
    return;
  }

  const isSelfSeasonMember = activeSeason.members.includes(resolved.personPageId);
  const nextSaturday = formatDate(getNextSaturday());

  await withFreshCalendarEvent(
    event.replyToken,
    botId,
    nextSaturday,
    'Registration handler',
    () => getEventOccupancy(nextSaturday),
    async (occupancy) => {
      const { event: freshEvent, season: freshSeason } = occupancy;

      let result;
      if (delta > 0) {
        result = calculateAddCapacity(freshEvent, freshSeason, resolved.displayName, delta, isSelfSeasonMember, isAdmin);
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
        occupancy,
        delta,
      );
      await replyMessage(event.replyToken, [{ type: 'text', text: replyText }], botId);
    }
  );
}

async function buildRegistrationReply(
  date: string,
  guests: string[],
  absenteePageIds: string[],
  occupancy: EventOccupancy,
  delta: number,
): Promise<string> {
  const { totalSlots, presentSeasonMembers, season } = occupancy;
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
  const totalPeople = presentSeasonMembers + guests.length;

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
