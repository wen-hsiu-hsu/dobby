import cron from 'node-cron';
import { pushMessage } from '../services/line/push-service.js';
import * as calendarRepo from '../services/notion/calendar-repository.js';
import * as seasonRepo from '../services/notion/season-repository.js';
import { env } from '../config/env.js';
import { formatDate, getNextSaturday, getNextSaturdayDateText, getCurrentSeasonName } from '../utils/date-utils.js';
import { logger } from '../utils/logger.js';

export async function sendWeeklyPush(): Promise<void> {
  try {
    const groupIds = env.DOBBY_GROUP_IDS;
    if (groupIds.length === 0) {
      logger.error('Weekly push aborted: DOBBY_GROUP_IDS is not set');
      return;
    }

    const nextSaturday = formatDate(getNextSaturday());
    const calEvent = await calendarRepo.findByDate(nextSaturday);
    const activeSeason = await seasonRepo.findByName(getCurrentSeasonName());

    const dateText = getNextSaturdayDateText();
    const seasonMemberCount = activeSeason?.members.length ?? 0;
    const absentCount = calEvent?.absentees.length ?? 0;
    const guestCount = calEvent?.guests.length ?? 0;
    const present = seasonMemberCount - absentCount + guestCount;
    const isPaused = calEvent?.isPaused ?? false;

    const lines = [
      `🏸 本週打球資訊`,
      `📅 ${dateText}`,
      ``,
      isPaused ? '⛔ 本週活動暫停' : `出席人數：${present} 人`,
    ];

    if (!isPaused && calEvent && calEvent.guests.length > 0) {
      lines.push(`\n零打名單：\n${calEvent.guests.map((g, i) => `${i + 1}. ${g}`).join('\n')}`);
    }

    const messages = [{ type: 'text' as const, text: lines.join('\n') }];

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
