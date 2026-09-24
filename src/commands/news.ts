import * as announcementRepo from '../services/notion/announcement-repository.js';
import * as seasonRepo from '../services/notion/season-repository.js';
import * as peopleRepo from '../services/notion/people-repository.js';
import * as calendarRepo from '../services/notion/calendar-repository.js';
import { blocksToText } from '../services/notion/blocks-to-text.js';
import { replyMessage } from '../services/line/reply-service.js';
import { getNextSaturdayDateText, getCurrentSeasonName, getSeasonMonthRange, groupDatesByMonth } from '../utils/date-utils.js';
import type { SeasonRecord, PersonRecord, CalendarEvent } from '../types/notion-models.js';
import { logger } from '../utils/logger.js';

const STATIC_PLACEHOLDERS: Record<string, () => string> = {
  '{{NEXT_SATURDAY}}': () => getNextSaturdayDateText(),
  '{{DATE}}': () => getNextSaturdayDateText(),
};

function applyStaticPlaceholders(text: string): string {
  let result = text;
  for (const [key, fn] of Object.entries(STATIC_PLACEHOLDERS)) {
    result = result.replaceAll(key, fn());
  }
  return result;
}

// Season summary variables, e.g. {SEASON}, {TOTAL_PEOPLE} — filled in from live Notion data.
function buildSeasonPlaceholders(
  season: SeasonRecord,
  people: PersonRecord[],
  playDates: CalendarEvent[],
): Record<string, string> {
  const listAllPeople = people.map((p) => p.name).join('、');
  const listAllDates = groupDatesByMonth(playDates.map((e) => e.date));

  // Informational split, not the actual amount to pay — rounded up so the shown figure never understates it.
  const pricePerPersonForSeason = Math.ceil(
    season.pricePerPersonOverride ?? season.pricePerPersonForSeason ?? 0,
  );

  return {
    SEASON: season.name,
    FROM_TO_MONTH: getSeasonMonthRange(season.name),
    TOTAL_PEOPLE: String(season.members.length),
    LIST_ALL_PEOPLE: listAllPeople,
    PRICE_PER_PERSON_FOR_SEASON: String(pricePerPersonForSeason),
    WEEK_COUNTS: String(season.weekCounts),
    PRICE_PER_PERSON_FOR_ONCE: String(season.guestFee),
    // 季公告：刻意用當季預設場地數，不套用行事曆單週調整（resolveCourts），見 docs/commands.md
    COURT_COUNT: String(season.courts),
    TOTAL_PRICE: String(season.totalPrice ?? 0),
    LIST_ALL_DATES: listAllDates,
    LOCATION: season.location,
  };
}

function applySeasonPlaceholders(text: string, placeholders: Record<string, string>): string {
  return text.replace(/\{([A-Z_]+)\}/g, (match, key: string) => placeholders[key] ?? match);
}

export async function handleNews(replyToken: string): Promise<void> {
  try {
    const announcement = await announcementRepo.findByName('NEWS_TEMPLATE');
    if (!announcement) {
      await replyMessage(replyToken, [{ type: 'text', text: '找不到公告內容' }]);
      return;
    }

    const seasonName = getCurrentSeasonName();
    const season = await seasonRepo.findByName(seasonName);
    if (!season) {
      await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${seasonName} 季租資料` }]);
      return;
    }

    const [blocks, people, playDates] = await Promise.all([
      announcementRepo.getBlocks(announcement.pageId),
      peopleRepo.findByPageIds(season.members),
      calendarRepo.findByPageIds(season.playDatePageIds),
    ]);

    const rawText = blocksToText(blocks);
    const withStatic = applyStaticPlaceholders(rawText);
    const text = applySeasonPlaceholders(withStatic, buildSeasonPlaceholders(season, people, playDates));

    await replyMessage(replyToken, [{ type: 'text', text: text || '公告內容為空' }]);
  } catch (err) {
    logger.error({ err }, 'News handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
