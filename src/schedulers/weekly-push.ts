import cron from 'node-cron';
import { pushMessage } from '../services/line/push-service.js';
import * as calendarRepo from '../services/notion/calendar-repository.js';
import * as seasonRepo from '../services/notion/season-repository.js';
import { findAdmin } from '../services/notion/users-repository.js';
import { formatDate, getNextSaturday, getNextSaturdayDateText, getCurrentSeasonName } from '../utils/date-utils.js';
import { logger } from '../utils/logger.js';

async function sendWeeklyPush(): Promise<void> {
  try {
    const admin = await findAdmin();
    const dobbyGroupId = admin?.groups[0];
    if (!dobbyGroupId) {
      logger.error('Weekly push aborted: no admin user found with group ID');
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

    await pushMessage(dobbyGroupId, [{ type: 'text', text: lines.join('\n') }], 'dobby');
    logger.info({ nextSaturday }, 'Weekly push sent');
  } catch (err) {
    logger.error({ err }, 'Weekly push failed');
  }
}

export function startWeeklyPush(): void {
  // Every Sunday at 09:00 Asia/Taipei
  cron.schedule('0 9 * * 0', sendWeeklyPush, { timezone: 'Asia/Taipei' });
  logger.info('Weekly push scheduler started');
}
