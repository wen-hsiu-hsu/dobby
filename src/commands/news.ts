import * as announcementRepo from '../services/notion/announcement-repository.js';
import * as seasonRepo from '../services/notion/season-repository.js';
import * as peopleRepo from '../services/notion/people-repository.js';
import * as calendarRepo from '../services/notion/calendar-repository.js';
import { blocksToText } from '../services/notion/blocks-to-text.js';
import { PAYMENT_PAGE_NAME, paymentPageToText } from '../services/notion/payment-methods.js';
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

// Live Notion data variables, e.g. {SEASON}, {TOTAL_PEOPLE} (season data) and {PAYMENT_V2} (payment page).
function buildSeasonPlaceholders(
  season: SeasonRecord,
  people: PersonRecord[],
  playDates: CalendarEvent[],
  paymentText: string,
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
    PAYMENT_V2: paymentText,
  };
}

// {PAYMENT_V2}：跟 `@Dobby 付款` 同一份資料（「所有公告」的 PAYMENT_V2 頁面），一種付款方式一行。
// 讀不到或是空的時給一句提示，不代入空字串——公告改成 Flex 卡後空字串會讓整張卡被 LINE 退回。
// 付款是公告的次要段落：這幾次 Notion 呼叫失敗（例如 429 重試用完）時只降級這一段，不讓整則公告回「系統錯誤」。
async function loadPaymentText(): Promise<string> {
  try {
    const page = await announcementRepo.findByName(PAYMENT_PAGE_NAME);
    if (!page) return '（找不到付款資訊）';
    return paymentPageToText(await announcementRepo.getBlocks(page.pageId)) || '（付款資訊為空）';
  } catch (err) {
    logger.warn({ err }, 'News: failed to load PAYMENT_V2, using a notice instead');
    return '（付款資訊讀取失敗，請用 @Dobby 付款查詢）';
  }
}

function applySeasonPlaceholders(text: string, placeholders: Record<string, string>): string {
  return text.replace(/\{([A-Z0-9_]+)\}/g, (match, key: string) => placeholders[key] ?? match);
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

    const [blocks, people, playDates, paymentText] = await Promise.all([
      announcementRepo.getBlocks(announcement.pageId),
      peopleRepo.findByPageIds(season.members),
      calendarRepo.findByPageIds(season.playDatePageIds),
      loadPaymentText(),
    ]);

    const rawText = blocksToText(blocks);
    const withStatic = applyStaticPlaceholders(rawText);
    const text = applySeasonPlaceholders(withStatic, buildSeasonPlaceholders(season, people, playDates, paymentText));

    await replyMessage(replyToken, [{ type: 'text', text: text || '公告內容為空' }]);
  } catch (err) {
    logger.error({ err }, 'News handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
