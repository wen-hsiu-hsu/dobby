import { replyMessage } from '../../services/line/reply-service.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import { getEventOccupancy } from '../../services/notion/event-occupancy.js';
import { withFreshCalendarEvent } from './with-fresh-calendar-event.js';
import { resolveTarget } from './target-resolver.js';
import { calculateAddCapacity, calculateRemoveCapacity } from './capacity-calculator.js';
import { parseRegistrationTarget } from './registration-parser.js';
import { buildEventStatusMessage } from './event-status-message.js';
import { logOutcome, describeTargetRequest, type RegistrationOutcome } from './outcome-log.js';
import { formatDate, getNextSaturday, getSeasonNameForDate } from '../../utils/date-utils.js';
import type { NotionUser } from '../../types/notion-models.js';

// Also the wrapper's context, so its event-not-found line shares this `${LOG_CONTEXT} outcome` message.
const LOG_CONTEXT = 'Registration handler';

interface MessageEvent {
  replyToken: string;
  message: { text: string; mention?: unknown };
  source: { userId: string };
}

export async function handleRegistration(
  event: MessageEvent,
  delta: number,
  isAdmin = false,
  actorUser?: NotionUser | null
): Promise<void> {
  const target = parseRegistrationTarget(event as any);
  const actorUserId = event.source.userId;

  if (target.parseError) {
    logOutcome(LOG_CONTEXT, { outcome: 'parse-error', requestedDelta: delta, isAdmin }, { actorUserId });
    await replyMessage(event.replyToken, [{ type: 'text', text: target.parseError }]);
    return;
  }

  if (!target.isSelf && !isAdmin) {
    logOutcome(LOG_CONTEXT, { outcome: 'not-admin', requestedDelta: delta, isAdmin }, { actorUserId });
    await replyMessage(event.replyToken, [{ type: 'text', text: '你不是管理員' }]);
    return;
  }

  const nextSaturday = formatDate(getNextSaturday());

  // Season of the event date (e.g. "2026-Q4"), not today's — see getSeasonNameForDate
  const seasonName = getSeasonNameForDate(nextSaturday);
  // Independent lookups, run in parallel; the "account not found" reply still takes precedence.
  const [resolved, activeSeason] = await Promise.all([
    resolveTarget(target, event.source.userId, actorUser),
    seasonRepo.findByName(seasonName),
  ]);
  const requestSummary = { date: nextSaturday, seasonName, requestedDelta: delta, isAdmin };
  if (!resolved) {
    logOutcome(
      LOG_CONTEXT,
      { outcome: 'target-not-found', ...requestSummary, targetRequest: describeTargetRequest(target) },
      { actorUserId, targetUserId: target.targetUserId, targetName: target.targetName }
    );
    await replyMessage(event.replyToken, [{ type: 'text', text: '找不到您的帳號，請先向管理員登記' }]);
    return;
  }
  const targetDetail = { actorUserId, targetPersonPageId: resolved.personPageId };
  if (!activeSeason) {
    logOutcome(LOG_CONTEXT, { outcome: 'season-not-found', ...requestSummary, resolvedVia: resolved.resolvedVia }, targetDetail);
    await replyMessage(event.replyToken, [{ type: 'text', text: `找不到 ${seasonName} 季租資料` }]);
    return;
  }

  const isSelfSeasonMember = activeSeason.members.includes(resolved.personPageId);

  await withFreshCalendarEvent(
    event.replyToken,
    nextSaturday,
    LOG_CONTEXT,
    () => getEventOccupancy(nextSaturday, activeSeason),
    async (occupancy) => {
      const { event: freshEvent, season: freshSeason } = occupancy;

      let result;
      if (delta > 0) {
        result = calculateAddCapacity(freshEvent, freshSeason, resolved.displayName, delta, isSelfSeasonMember, isAdmin);
      } else {
        result = calculateRemoveCapacity(freshEvent, resolved.displayName, delta, isSelfSeasonMember);
      }

      const lockedSummary = {
        ...requestSummary,
        isSelfSeasonMember,
        resolvedVia: resolved.resolvedVia,
        courts: occupancy.courts,
        totalSlots: occupancy.totalSlots,
        guestCountBefore: freshEvent.guests.length,
      };

      if (!result.canAdd) {
        logOutcome(LOG_CONTEXT, { outcome: rejectionOutcome(delta, freshEvent.isPaused), ...lockedSummary }, targetDetail);
        const replyText = await buildEventStatusMessage({
          date: nextSaturday,
          headline: result.error ?? '操作失敗',
          guests: freshEvent.guests,
          totalSlots: occupancy.totalSlots,
          presentSeasonMembers: occupancy.presentSeasonMembers,
          guestFee: occupancy.season.guestFee,
          absenteePageIds: freshEvent.absentees,
        });
        await replyMessage(event.replyToken, [{ type: 'text', text: replyText }]);
        return;
      }

      const updatedGuests = result.newGuests ?? [];
      await calendarRepo.updateGuests(freshEvent.pageId, updatedGuests);

      logOutcome(
        LOG_CONTEXT,
        {
          outcome: delta > 0 ? 'added' : 'removed',
          ...lockedSummary,
          guestCountAfter: updatedGuests.length,
          cappedAt: result.cappedAt,
          targetDisplayName: resolved.displayName,
        },
        delta > 0
          // calculateAddCapacity appends new entries after the existing ones, in order.
          ? { ...targetDetail, addedGuests: updatedGuests.slice(freshEvent.guests.length) }
          : { ...targetDetail, removedGuests: result.removedGuests }
      );

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
      await replyMessage(event.replyToken, [{ type: 'text', text: replyText }]);
    }
  );
}

/**
 * Which calculator rejection this was, derived from its inputs because CapacityResult
 * only carries the user-facing error text. Mirrors capacity-calculator.ts: an add is only
 * rejected when the event is paused or no slot is left; a removal of |delta| >= 1 only when
 * the target has no entry. `+0`/`-0` goes down the removal path and is always rejected —
 * as "找不到報名紀錄" or "取消數量需大於 0" depending on whether an entry exists — so it
 * gets its own outcome rather than a misleading "no registration". If the calculator gains
 * a new rejection path, add it here too.
 */
function rejectionOutcome(delta: number, isPaused: boolean): RegistrationOutcome {
  if (delta > 0) return isPaused ? 'paused' : 'full';
  return delta === 0 ? 'zero-delta' : 'no-registration';
}
