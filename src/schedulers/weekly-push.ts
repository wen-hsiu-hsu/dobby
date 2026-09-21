import cron from 'node-cron';
import { pushMessage } from '../services/line/push-service.js';
import { getEventOccupancy } from '../services/notion/event-occupancy.js';
import * as peopleRepo from '../services/notion/people-repository.js';
import { env } from '../config/env.js';
import { formatDate, getNextSaturday, getNextSaturdayDateText } from '../utils/date-utils.js';
import { logger } from '../utils/logger.js';
import { runWithContext } from '../utils/request-context.js';

/**
 * Wrapped in runWithContext so each cron run gets its own reqId — the /logs
 * 頁面把「排程」事件當成一個 reqId 分組來顯示，沒有 reqId 每次執行都會被
 * 併成同一組，看不出這是哪一次跑的。
 */
export async function sendWeeklyPush(): Promise<void> {
  return runWithContext(() => doSendWeeklyPush());
}

async function doSendWeeklyPush(): Promise<void> {
  try {
    const groupIds = env.DOBBY_GROUP_IDS;
    if (groupIds.length === 0) {
      logger.error('Weekly push aborted: DOBBY_GROUP_IDS is not set');
      return;
    }

    const nextSaturday = formatDate(getNextSaturday());
    const occupancy = await getEventOccupancy(nextSaturday);
    if (!occupancy) {
      logger.error({ nextSaturday }, 'Weekly push aborted: no calendar/season data for date');
      return;
    }

    const { event, season, totalSlots, presentSeasonMembers } = occupancy;

    let text: string;
    if (event.isPaused) {
      text = [`🏸 本週打球資訊`, `📅 ${getNextSaturdayDateText()}`, ``, `⛔ 本週活動暫停`].join('\n');
    } else {
      // Show all slots including empty ones, matching buildEventStatusMessage's guest list.
      const displaySlots = Math.max(totalSlots, event.guests.length);
      const guestLines = Array.from({ length: displaySlots }, (_, i) => `${i + 1}. ${event.guests[i] ?? ''}`).join(
        '\n'
      );

      let absenteeText = '無';
      if (event.absentees.length > 0) {
        const absentees = await peopleRepo.findByPageIds(event.absentees);
        absenteeText = absentees.map((p) => p.name).join('、');
      }

      text = [
        `${nextSaturday} 不能到請喊聲`,
        `零打名額：${totalSlots}人 $${season.guestFee}/人`,
        guestLines,
        ``,
        `請假：${absenteeText}`,
        `場地：${season.courts} 面`,
        `應到：${presentSeasonMembers} 人`,
      ].join('\n');
    }

    const messages = [{ type: 'text' as const, text }];

    let succeeded = 0;
    let failed = 0;
    for (const groupId of groupIds) {
      try {
        await pushMessage(groupId, messages);
        succeeded++;
      } catch (err) {
        // Isolate per-group failures so one bad group ID doesn't stop the rest of the batch.
        logger.error({ err, groupId }, 'Failed to push weekly message to group, skipping');
        failed++;
      }
      // No delay here: LINE's push endpoint rate limit is 2,000 req/s per channel
      // (official docs), far beyond what looping over a handful of group IDs will
      // ever approach. Unlike the Notion 400ms delay elsewhere in this codebase
      // (where the ~3 req/s limit is genuinely tight), no delay is needed.
    }

    logger.info({ nextSaturday, succeeded, failed, total: groupIds.length }, 'Weekly push complete');
  } catch (err) {
    logger.error({ err }, 'Weekly push failed');
  }
}

export function startWeeklyPush(): void {
  // Every Sunday at 09:00 Asia/Taipei
  cron.schedule('0 9 * * 0', sendWeeklyPush, { timezone: 'Asia/Taipei' });
  logger.info('Weekly push scheduler started');
}
