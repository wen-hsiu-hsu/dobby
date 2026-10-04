import { replyMessage } from '../../services/line/reply-service.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import { getEventOccupancy } from '../../services/notion/event-occupancy.js';
import { withFreshCalendarEvent } from './with-fresh-calendar-event.js';
import { resolveTarget } from './target-resolver.js';
import { calculateAddCapacity, calculateRemoveCapacity } from './capacity-calculator.js';
import { parseRegistrationTarget } from './registration-parser.js';
import { FLEX_ICONS } from '../../config/flex-assets.js';
import { logger } from '../../utils/logger.js';
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
  const requestSummary = { date: nextSaturday, seasonName, requestedDelta: delta, isAdmin };
  if (!resolved) {
    logOutcome(
      LOG_CONTEXT,
      { outcome: 'target-not-found', ...requestSummary, targetRequest: describeTargetRequest(target) },
      { actorUserId, targetUserId: target.targetUserId, targetName: target.targetName }
    );
    // 代報時要講清楚是哪個對象查無；「找不到您的帳號」會讓管理員以為是自己的帳號有問題。
    const text = target.isSelf
      ? '找不到您的帳號，請先向管理員登記'
      : `找不到「${target.targetName ?? '指定對象'}」的資料，請確認名稱與人員清單一致`;
    await replyMessage(event.replyToken, [{ type: 'text', text }]);
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
        const outcome = rejectionOutcome(delta, freshEvent.isPaused);
        logOutcome(LOG_CONTEXT, { outcome, ...lockedSummary }, targetDetail);
        return {
          date: nextSaturday,
          headline: result.error ?? '操作失敗',
          badgeColor: 'orange',
          badgeIcon: FLEX_ICONS.banDark,
          title: rejectionCardTitle(outcome),
          subtitle: result.error ?? '操作失敗',
          guests: freshEvent.guests,
          totalSlots: occupancy.totalSlots,
          presentSeasonMembers: occupancy.presentSeasonMembers,
          guestFee: occupancy.season.guestFee,
          eventPageId: freshEvent.pageId,
          absenteePageIds: freshEvent.absentees,
        };
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
      let badgeColor: 'lime' | 'gray';
      let badgeIcon: string;
      let title: string;
      let subtitle: string;
      let newGuestCount = 0;
      if (delta <= 0) {
        headline = '取消報名成功 ✅';
        badgeColor = 'gray';
        badgeIcon = FLEX_ICONS.minusWhite;
        title = '取消報名成功';
        subtitle = `${resolved.displayName} 取消 ${result.removedGuests?.length ?? 0} 位`;
      } else {
        badgeColor = 'lime';
        badgeIcon = FLEX_ICONS.checkDark;
        title = '報名成功';
        newGuestCount = updatedGuests.length - freshEvent.guests.length;
        if (result.cappedAt !== undefined) {
          headline = `報名成功 ✅（名額已達上限，僅報名 ${result.cappedAt} 位，您原本要求 ${delta} 位）`;
          subtitle = `${resolved.displayName} 報名 ${result.cappedAt} 位（名額已滿，原本要求 ${delta} 位）`;
        } else {
          headline = '報名成功 ✅';
          subtitle = `${resolved.displayName} 報名 ${delta} 位`;
        }
      }

      return {
        date: nextSaturday,
        headline,
        badgeColor,
        badgeIcon,
        title,
        subtitle,
        guests: updatedGuests,
        newGuestCount,
        totalSlots: occupancy.totalSlots,
        presentSeasonMembers: occupancy.presentSeasonMembers,
        guestFee: occupancy.season.guestFee,
        eventPageId: freshEvent.pageId,
        absenteePageIds: freshEvent.absentees,
      };
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

/**
 * 拒絕卡片的標題文字，依 rejectionOutcome() 的四種結果對應。跟 outcome log 共用同一個
 * outcome 值，避免「Notion 呼叫/log 判斷是這個分支，卡片標題卻用另一套邏輯」兩邊漂移。
 */
function rejectionCardTitle(outcome: RegistrationOutcome): string {
  switch (outcome) {
    case 'full':
      return '名額不足';
    case 'paused':
      return '本週活動暫停';
    case 'no-registration':
    case 'zero-delta':
      return '無法取消';
    default:
      return '操作失敗';
  }
}
