import { replyMessage } from '../../services/line/reply-service.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import { getEventOccupancy } from '../../services/notion/event-occupancy.js';
import { calculateTotalSlots } from './capacity-calculator.js';
import { resolveTarget } from './target-resolver.js';
import { parseRegistrationTarget } from './registration-parser.js';
import { buildEventStatusMessage } from './event-status-message.js';
import { formatDate, getNextSaturday, getCurrentSeasonName } from '../../utils/date-utils.js';
import { withFreshCalendarEvent } from './with-fresh-calendar-event.js';

interface MessageEvent {
  replyToken: string;
  message: { text: string; mention?: unknown };
  source: { userId: string };
}

export async function handleLeave(
  event: MessageEvent,
  isCancel: boolean,
  botId: string,
  isAdmin = false
): Promise<void> {
  const target = parseRegistrationTarget(event as any);

  if (!target.isSelf && !isAdmin) {
    await replyMessage(event.replyToken, [{ type: 'text', text: '你不是管理員' }], botId);
    return;
  }

  const resolved = await resolveTarget(target, event.source.userId);

  if (!resolved) {
    await replyMessage(event.replyToken, [{ type: 'text', text: '找不到您的資料' }], botId);
    return;
  }

  const activeSeason = await seasonRepo.findByName(getCurrentSeasonName());
  if (!activeSeason || !activeSeason.members.includes(resolved.personPageId)) {
    // Target isn't a season member — no calendar event fetched yet, and no meaningful
    // "occupancy" to show for someone who has no leave concept to begin with.
    await replyMessage(event.replyToken, [{ type: 'text', text: '請假/銷假功能僅限季租成員使用' }], botId);
    return;
  }

  const nextSaturday = formatDate(getNextSaturday());

  await withFreshCalendarEvent(
    event.replyToken,
    botId,
    nextSaturday,
    'Leave handler',
    () => getEventOccupancy(nextSaturday),
    async (occupancy) => {
      const { event: freshEvent, season: freshSeason } = occupancy;
      const isCurrentlyAbsent = freshEvent.absentees.includes(resolved.personPageId);

      if (!isCancel && isCurrentlyAbsent) {
        const replyText = await buildEventStatusMessage({
          date: nextSaturday,
          headline: `${resolved.displayName} 已請假，無需重複操作`,
          guests: freshEvent.guests,
          totalSlots: occupancy.totalSlots,
          presentSeasonMembers: occupancy.presentSeasonMembers,
          guestFee: freshSeason.guestFee,
          absenteePageIds: freshEvent.absentees,
        });
        await replyMessage(event.replyToken, [{ type: 'text', text: replyText }], botId);
        return;
      }

      if (isCancel && !isCurrentlyAbsent) {
        const replyText = await buildEventStatusMessage({
          date: nextSaturday,
          headline: `${resolved.displayName} 目前未請假`,
          guests: freshEvent.guests,
          totalSlots: occupancy.totalSlots,
          presentSeasonMembers: occupancy.presentSeasonMembers,
          guestFee: freshSeason.guestFee,
          absenteePageIds: freshEvent.absentees,
        });
        await replyMessage(event.replyToken, [{ type: 'text', text: replyText }], botId);
        return;
      }

      const newAbsentees = !isCancel
        ? [...freshEvent.absentees, resolved.personPageId]
        : freshEvent.absentees.filter((id) => id !== resolved.personPageId);

      await calendarRepo.updateAbsentees(freshEvent.pageId, newAbsentees);

      const newTotalSlots = calculateTotalSlots({ absentees: newAbsentees }, freshSeason);
      const newPresentSeasonMembers = freshSeason.members.length - newAbsentees.length;
      const replyText = await buildEventStatusMessage({
        date: nextSaturday,
        headline: isCancel ? '銷假成功 ✅' : '請假成功 ✅',
        guests: freshEvent.guests,
        totalSlots: newTotalSlots,
        presentSeasonMembers: newPresentSeasonMembers,
        guestFee: freshSeason.guestFee,
        absenteePageIds: newAbsentees,
      });
      await replyMessage(event.replyToken, [{ type: 'text', text: replyText }], botId);
    }
  );
}
