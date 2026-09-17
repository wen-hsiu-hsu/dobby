import { replyMessage } from '../../services/line/reply-service.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import { getEventOccupancy } from '../../services/notion/event-occupancy.js';
import { withFreshCalendarEvent } from './with-fresh-calendar-event.js';
import { resolveTarget } from './target-resolver.js';
import { calculateAddCapacity, calculateRemoveCapacity } from './capacity-calculator.js';
import { parseRegistrationTarget } from './registration-parser.js';
import { buildEventStatusMessage } from './event-status-message.js';
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

  if (!target.isSelf && !isAdmin) {
    await replyMessage(event.replyToken, [{ type: 'text', text: '你不是管理員' }], botId);
    return;
  }

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
    () => getEventOccupancy(nextSaturday, undefined, activeSeason),
    async (occupancy) => {
      const { event: freshEvent, season: freshSeason } = occupancy;

      let result;
      if (delta > 0) {
        result = calculateAddCapacity(freshEvent, freshSeason, resolved.displayName, delta, isSelfSeasonMember, isAdmin);
      } else {
        result = calculateRemoveCapacity(freshEvent, resolved.displayName, delta, isSelfSeasonMember);
      }

      if (!result.canAdd) {
        const replyText = await buildEventStatusMessage({
          date: nextSaturday,
          headline: result.error ?? '操作失敗',
          guests: freshEvent.guests,
          totalSlots: occupancy.totalSlots,
          presentSeasonMembers: occupancy.presentSeasonMembers,
          guestFee: occupancy.season.guestFee,
          absenteePageIds: freshEvent.absentees,
        });
        await replyMessage(event.replyToken, [{ type: 'text', text: replyText }], botId);
        return;
      }

      const updatedGuests = result.newGuests ?? [];
      await calendarRepo.updateGuests(freshEvent.pageId, updatedGuests);

      let headline: string;
      if (delta <= 0) {
        headline = '取消報名成功 ✅';
      } else if (result.cappedAt !== undefined) {
        headline = `報名成功 ✅（名額已達上限，僅報名 ${result.cappedAt} 位，您原本要求 ${delta} 位）`;
      } else {
        headline = '報名成功 ✅';
      }

      const replyText = await buildEventStatusMessage({
        date: nextSaturday,
        headline,
        guests: updatedGuests,
        totalSlots: occupancy.totalSlots,
        presentSeasonMembers: occupancy.presentSeasonMembers,
        guestFee: occupancy.season.guestFee,
        absenteePageIds: freshEvent.absentees,
      });
      await replyMessage(event.replyToken, [{ type: 'text', text: replyText }], botId);
    }
  );
}
