import type { messagingApi } from '@line/bot-sdk';
import * as announcementRepo from '../services/notion/announcement-repository.js';
import * as seasonRepo from '../services/notion/season-repository.js';
import * as peopleRepo from '../services/notion/people-repository.js';
import * as calendarRepo from '../services/notion/calendar-repository.js';
import { blocksToText, blocksToSections } from '../services/notion/blocks-to-text.js';
import type { NestedBlock, TextSection } from '../services/notion/blocks-to-text.js';
import { PAYMENT_PAGE_NAME, paymentPageToText } from '../services/notion/payment-methods.js';
import { replyMessage } from '../services/line/reply-service.js';
import {
  formatSeasonTitle,
  getNextSaturdayDateText,
  getCurrentSeasonName,
  getSeasonMonthRange,
  groupDatesByMonth,
} from '../utils/date-utils.js';
import type { SeasonRecord, PersonRecord, CalendarEvent } from '../types/notion-models.js';
import { logger } from '../utils/logger.js';
import { truncateAltText } from './flex-card-parts.js';
import { fitsBubbleSizeLimit } from './name-list-card.js';
import { buildNewsBubble } from './news-card.js';

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

  return {
    SEASON: season.name,
    FROM_TO_MONTH: getSeasonMonthRange(season.name),
    TOTAL_PEOPLE: String(season.members.length),
    LIST_ALL_PEOPLE: listAllPeople,
    // 每人實際收費是管理員手填的；沒填時給提示，不代入 0（看起來會像是免費），也不讓整則公告報錯。
    // `@Dobby season` 在用到這段之前就會先檢查指定季有沒有填，所以那邊不會看到這句提示。
    PRICE_PER_PERSON_FOR_SEASON: season.actualFeePerPerson === null ? '（每人實際收費未填）' : String(season.actualFeePerPerson),
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
// 讀不到或是空的時給一句提示，不代入空字串——空的話公告卡的「付款方式」段只剩小標（或整段被略過），
// 讀的人看不出付款資訊沒讀到；提示會指引改用 @Dobby 付款。
// 付款是公告的次要段落：這幾次 Notion 呼叫失敗（例如 429 重試用完）時只降級這一段，不讓整則公告回「系統錯誤」。
export async function loadPaymentText(): Promise<string> {
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

export const NEWS_TEMPLATE_PAGE_NAME = 'NEWS_TEMPLATE';

export interface NewsContent {
  /** 整頁轉成的純文字：當 altText、卡片太大時的 fallback，也是 `@Dobby season` 的 {NEW_SEASON_NEWS}。 */
  text: string;
  /** 依標題切好的段落，給公告卡用。 */
  sections: TextSection[];
}

/**
 * 把 NEWS_TEMPLATE 的區塊代入指定季的資料。`@Dobby 公告` 傳當季，`@Dobby season` 傳指令指定的那一季，
 * 所以這裡不自己決定季度。
 */
export function renderNews(
  blocks: NestedBlock[],
  season: SeasonRecord,
  people: PersonRecord[],
  playDates: CalendarEvent[],
  paymentText: string,
): NewsContent {
  const placeholders = buildSeasonPlaceholders(season, people, playDates, paymentText);
  const fill = (t: string) => applySeasonPlaceholders(applyStaticPlaceholders(t), placeholders);
  return {
    // 改 Flex 前的純文字內容
    text: fill(blocksToText(blocks)),
    // 先切段再代入：變數值裡的換行（例如 {LIST_ALL_DATES}）不會被誤認成段落邊界
    sections: blocksToSections(blocks).map((s) => ({ heading: fill(s.heading), body: fill(s.body) })),
  };
}

// LINE 規定單則 text 最多 5000 字、一次 reply 最多 5 則訊息
const TEXT_MESSAGE_MAX = 5000;
const REPLY_MESSAGES_MAX = 5;
const OMITTED_NOTICE = '…（公告太長，後面省略）';

// 卡片太大時改送的純文字：卡片超過 30KB 時文字通常也超過 5000 字，單則送會被 LINE 退回
// （reply-service 只記 warn，使用者什麼都收不到），所以依行切成多則；單行超過上限時硬切。
// 超過 5 則才截掉最後一則的尾巴，正常的公告長度碰不到。
export function splitIntoTextMessages(text: string): messagingApi.TextMessage[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= TEXT_MESSAGE_MAX) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    let rest = line;
    while (rest.length > TEXT_MESSAGE_MAX) {
      chunks.push(rest.slice(0, TEXT_MESSAGE_MAX));
      rest = rest.slice(TEXT_MESSAGE_MAX);
    }
    current = rest;
  }
  if (current) chunks.push(current);

  if (chunks.length > REPLY_MESSAGES_MAX) {
    chunks.length = REPLY_MESSAGES_MAX;
    const last = chunks[REPLY_MESSAGES_MAX - 1]!;
    chunks[REPLY_MESSAGES_MAX - 1] = last.slice(0, TEXT_MESSAGE_MAX - OMITTED_NOTICE.length) + OMITTED_NOTICE;
  }
  return chunks.map((chunk) => ({ type: 'text', text: chunk }));
}

export async function handleNews(replyToken: string): Promise<void> {
  try {
    const announcement = await announcementRepo.findByName(NEWS_TEMPLATE_PAGE_NAME);
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

    // text 當 altText（通知、/logs 看到的），卡片太大時也改送這段
    const { text, sections } = renderNews(blocks, season, people, playDates, paymentText);
    // 只有空白段落、分隔線，或變數全部代入成空字串時，text 不一定是空的，但卡片上一段都畫不出來
    if (!text.trim() || !sections.some((s) => s.heading.trim() || s.body.trim())) {
      await replyMessage(replyToken, [{ type: 'text', text: '公告內容為空' }]);
      return;
    }

    const contents = buildNewsBubble({
      // season.name 是用 canonical seasonName 以 equals 查回來的，格式一定是 YYYY-QN
      topText: `${formatSeasonTitle(season.name, false)}（${getSeasonMonthRange(season.name)}）`,
      subtitle: `共 ${season.members.length} 人・${season.weekCounts} 次`,
      sections,
    });
    if (!fitsBubbleSizeLimit(contents)) {
      logger.warn({ length: text.length }, 'News card too large for a Flex bubble, falling back to text');
      await replyMessage(replyToken, splitIntoTextMessages(text));
      return;
    }
    await replyMessage(replyToken, [{ type: 'flex', altText: truncateAltText(text), contents }]);
  } catch (err) {
    logger.error({ err }, 'News handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
