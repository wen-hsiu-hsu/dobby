import { replyMessage } from '../../services/line/reply-service.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import { getEventOccupancy } from '../../services/notion/event-occupancy.js';
import { calculateTotalSlots } from './capacity-calculator.js';
import { resolveTarget } from './target-resolver.js';
import { parseRegistrationTarget } from './registration-parser.js';
import { FLEX_ICONS } from '../../config/flex-assets.js';
import { formatDate, getNextSaturday, getSeasonNameForDate } from '../../utils/date-utils.js';
import { withFreshCalendarEvent } from './with-fresh-calendar-event.js';
import { logger } from '../../utils/logger.js';
import { logOutcome, describeTargetRequest } from './outcome-log.js';
import type { NotionUser } from '../../types/notion-models.js';

// Also the wrapper's context, so its event-not-found line shares this `${LOG_CONTEXT} outcome` message.
const LOG_CONTEXT = 'Leave handler';

interface MessageEvent {
  replyToken: string;
  message: { text: string; mention?: unknown };
  source: { userId: string };
}

export async function handleLeave(
  event: MessageEvent,
  isCancel: boolean,
  isAdmin = false,
  actorUser?: NotionUser | null
): Promise<void> {
  const target = parseRegistrationTarget(event as any);
  const actorUserId = event.source.userId;

  if (target.parseError) {
    logOutcome(LOG_CONTEXT, { outcome: 'parse-error', isCancel, isAdmin }, { actorUserId });
    await replyMessage(event.replyToken, [{ type: 'text', text: target.parseError }]);
    return;
  }

  if (!target.isSelf && !isAdmin) {
    logOutcome(LOG_CONTEXT, { outcome: 'not-admin', isCancel, isAdmin }, { actorUserId });
    await replyMessage(event.replyToken, [{ type: 'text', text: '你不是管理員' }]);
    return;
  }

  const nextSaturday = formatDate(getNextSaturday());

  // Season of the event date, not today's — see getSeasonNameForDate
  const seasonName = getSeasonNameForDate(nextSaturday);
  // Independent lookups, run in parallel; the "not found" reply still takes precedence.
  // withFreshCalendarEvent only catches errors once it takes over, so a failure here must be
  // replied to here. Nothing is written yet, so "retry later" is safe. Keep withFreshCalendarEvent
  // out of this try: a timeout after the mutation started may still write, and must never be answered with "retry".
  let resolved, activeSeason;
  try {
    [resolved, activeSeason] = await Promise.all([
      resolveTarget(target, event.source.userId, actorUser),
      seasonRepo.findByNameCached(seasonName),
    ]);
  } catch (err) {
    logger.error({ err }, `${LOG_CONTEXT} error`);
    await replyMessage(event.replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
    return;
  }

  const requestSummary = { date: nextSaturday, seasonName, isCancel, isAdmin };
  if (!resolved) {
    logOutcome(
      LOG_CONTEXT,
      { outcome: 'target-not-found', ...requestSummary, targetRequest: describeTargetRequest(target) },
      { actorUserId, targetUserId: target.targetUserId, targetName: target.targetName }
    );
    // 代報時要講清楚是哪個對象查無；「找不到您的帳號」會讓管理員以為是自己的帳號有問題。
    const text = target.isSelf
      ? '找不到您的資料'
      : `找不到「${target.targetName ?? '指定對象'}」的資料，請確認名稱與人員清單一致`;
    await replyMessage(event.replyToken, [{ type: 'text', text }]);
    return;
  }
  const targetDetail = { actorUserId, targetPersonPageId: resolved.personPageId };
  const resolvedSummary = { ...requestSummary, resolvedVia: resolved.resolvedVia };
  if (!activeSeason) {
    logOutcome(LOG_CONTEXT, { outcome: 'season-not-found', ...resolvedSummary }, targetDetail);
    // Checked separately from membership: in the last week of a quarter the next season's
    // record may not exist yet, and "僅限季租成員" would wrongly tell a real member they aren't one.
    await replyMessage(event.replyToken, [{ type: 'text', text: `找不到 ${seasonName} 季租資料` }]);
    return;
  }
  if (!activeSeason.members.includes(resolved.personPageId)) {
    // Target isn't a season member — no calendar event fetched yet, and no meaningful
    // "occupancy" to show for someone who has no leave concept to begin with.
    logOutcome(LOG_CONTEXT, { outcome: 'not-season-member', ...resolvedSummary }, targetDetail);
    await replyMessage(event.replyToken, [{ type: 'text', text: '請假/銷假功能僅限季租成員使用' }]);
    return;
  }

  await withFreshCalendarEvent(
    event.replyToken,
    nextSaturday,
    LOG_CONTEXT,
    () => getEventOccupancy(nextSaturday, activeSeason),
    async (occupancy) => {
      const { event: freshEvent, season: freshSeason } = occupancy;
      const isCurrentlyAbsent = freshEvent.absentees.includes(resolved.personPageId);
      // Past the membership check, so the target is always a season member here.
      const lockedSummary = {
        ...resolvedSummary,
        courts: occupancy.courts,
        guestCount: freshEvent.guests.length,
        totalSlotsBefore: occupancy.totalSlots,
        absenteeCountBefore: freshEvent.absentees.length,
      };

      if (!isCancel && isCurrentlyAbsent) {
        logOutcome(LOG_CONTEXT, { outcome: 'already-absent', ...lockedSummary }, targetDetail);
        const headline = `${resolved.displayName} 已請假，無需重複操作`;
        return {
          date: nextSaturday,
          headline,
          badgeColor: 'gray',
          badgeIcon: FLEX_ICONS.infoWhite,
          title: '已經請過假',
          subtitle: headline,
          guests: freshEvent.guests,
          totalSlots: occupancy.totalSlots,
          presentSeasonMembers: occupancy.presentSeasonMembers,
          guestFee: freshSeason.guestFee,
          eventPageId: freshEvent.pageId,
          absenteePageIds: freshEvent.absentees,
        };
      }

      if (isCancel && !isCurrentlyAbsent) {
        logOutcome(LOG_CONTEXT, { outcome: 'not-absent', ...lockedSummary }, targetDetail);
        const headline = `${resolved.displayName} 目前未請假`;
        return {
          date: nextSaturday,
          headline,
          badgeColor: 'gray',
          badgeIcon: FLEX_ICONS.infoWhite,
          title: '目前未請假',
          subtitle: headline,
          guests: freshEvent.guests,
          totalSlots: occupancy.totalSlots,
          presentSeasonMembers: occupancy.presentSeasonMembers,
          guestFee: freshSeason.guestFee,
          eventPageId: freshEvent.pageId,
          absenteePageIds: freshEvent.absentees,
        };
      }

      const newAbsentees = !isCancel
        ? [...freshEvent.absentees, resolved.personPageId]
        : freshEvent.absentees.filter((id) => id !== resolved.personPageId);

      await calendarRepo.updateAbsentees(freshEvent.pageId, newAbsentees);

      const newTotalSlots = calculateTotalSlots({ absentees: newAbsentees, courts: freshEvent.courts }, freshSeason);
      const newPresentSeasonMembers = freshSeason.members.length - newAbsentees.length;

      logOutcome(
        LOG_CONTEXT,
        {
          outcome: isCancel ? 'leave-cancelled' : 'leave-recorded',
          ...lockedSummary,
          totalSlotsAfter: newTotalSlots,
          absenteeCountAfter: newAbsentees.length,
          presentSeasonMembersAfter: newPresentSeasonMembers,
          targetDisplayName: resolved.displayName,
        },
        targetDetail
      );
      return {
        date: nextSaturday,
        headline: isCancel ? '銷假成功 ✅' : '請假成功 ✅',
        badgeColor: isCancel ? 'lime' : 'blue',
        badgeIcon: isCancel ? FLEX_ICONS.calendarCheckDark : FLEX_ICONS.calendarXDark,
        title: isCancel ? '銷假成功' : '請假成功',
        subtitle: isCancel ? `${resolved.displayName} 已銷假，零打名額 −1` : `${resolved.displayName} 本週請假，零打名額 +1`,
        guests: freshEvent.guests,
        totalSlots: newTotalSlots,
        presentSeasonMembers: newPresentSeasonMembers,
        guestFee: freshSeason.guestFee,
        eventPageId: freshEvent.pageId,
        absenteePageIds: newAbsentees,
      };
    }
  );
}
