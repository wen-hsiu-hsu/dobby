import * as announcementRepo from '../services/notion/announcement-repository.js';
import * as seasonRepo from '../services/notion/season-repository.js';
import * as peopleRepo from '../services/notion/people-repository.js';
import * as calendarRepo from '../services/notion/calendar-repository.js';
import * as usersRepo from '../services/notion/users-repository.js';
import { blocksToText } from '../services/notion/blocks-to-text.js';
import { replyMessage } from '../services/line/reply-service.js';
import { parseSeasonInput, getPreviousSeasonName, formatSeasonTitle, getSeasonQuarter, groupDatesByMonth } from '../utils/date-utils.js';
import { logger } from '../utils/logger.js';

// 每面場地可容納的人數上限，跟 capacity-calculator.ts 的 COURTS_DENSITY 意義相同——
// 這裡算的是「本次無人請假」時的零打名額 baseline（公告用途，非即時報名名額）。
const COURTS_DENSITY = 7;

// 三則公告之間的分隔線（NEW_SEASON 模板專用），bot 依此切成多則 LINE 訊息回覆。
// 跟區塊內部用來斷行的單一 "—" 不同，不要搞混。
const BLOCK_DIVIDER = '————————';

/**
 * 依成員的人員清單 pageId 找出可 @ 的名字：優先用 USERS 的 Custom Name（LINE 顯示名稱），
 * 找不到（理論上不會發生，USERS 不會主動移除使用者）才退回人員清單的 Name 當作保底。
 */
function buildMentionResolver(users: Awaited<ReturnType<typeof usersRepo.findAll>>, people: Awaited<ReturnType<typeof peopleRepo.findByPageIds>>) {
  const customNameByPersonId = new Map<string, string>();
  for (const user of users) {
    if (user.registeredPersonPageId) customNameByPersonId.set(user.registeredPersonPageId, user.customName);
  }
  const nameByPersonId = new Map(people.map((p) => [p.pageId, p.name]));

  return function mentionFor(personPageId: string): string {
    const customName = customNameByPersonId.get(personPageId);
    if (customName) return `@${customName}`;
    const fallbackName = nameByPersonId.get(personPageId);
    logger.warn({ personPageId, fallbackName }, '成員沒有對應的 USERS Custom Name，改用人員清單姓名');
    return `@${fallbackName ?? personPageId}`;
  };
}

function applyPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{([A-Z_]+)\}/g, (match, key: string) => values[key] ?? match);
}

export async function handleSeasonAnnouncement(replyToken: string, isAdmin: boolean, seasonArg: string | undefined): Promise<void> {
  if (!isAdmin) {
    await replyMessage(replyToken, [{ type: 'text', text: '此指令僅限管理員使用' }]);
    return;
  }

  const seasonName = seasonArg ? parseSeasonInput(seasonArg) : null;
  if (!seasonName) {
    await replyMessage(replyToken, [{ type: 'text', text: `無法辨識季度「${seasonArg}」，請用類似 2026Q2 或 2026-Q2 的格式` }]);
    return;
  }

  try {
    const template = await announcementRepo.findByName('NEW_SEASON');
    if (!template) {
      await replyMessage(replyToken, [{ type: 'text', text: '找不到 NEW_SEASON 公告模板' }]);
      return;
    }

    const season = await seasonRepo.findByName(seasonName);
    if (!season) {
      await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${seasonName} 季租資料` }]);
      return;
    }

    const previousSeasonName = getPreviousSeasonName(seasonName);
    const previousSeason = await seasonRepo.findByName(previousSeasonName);
    if (!previousSeason) {
      await replyMessage(replyToken, [
        { type: 'text', text: `找不到上一季 ${previousSeasonName} 的季租資料，無法計算續打/新朋友/退費名單` },
      ]);
      return;
    }

    const payment = await announcementRepo.findByName('PAYMENT');
    if (!payment) {
      await replyMessage(replyToken, [{ type: 'text', text: '找不到 PAYMENT 公告內容' }]);
      return;
    }

    const allMemberIds = [...new Set([...season.members, ...previousSeason.members])];

    const [templateBlocks, paymentBlocks, users, playDates, people] = await Promise.all([
      announcementRepo.getBlocks(template.pageId),
      announcementRepo.getBlocks(payment.pageId),
      usersRepo.findAll(),
      calendarRepo.findByPageIds(season.playDatePageIds),
      peopleRepo.findByPageIds(allMemberIds),
    ]);

    const mentionFor = buildMentionResolver(users, people);
    const mentionList = (personPageIds: string[]) => personPageIds.map(mentionFor).join(' ');

    const previousMemberSet = new Set(previousSeason.members);
    const currentMemberSet = new Set(season.members);
    const continuingMembers = season.members.filter((id) => previousMemberSet.has(id));
    const newMembers = season.members.filter((id) => !previousMemberSet.has(id));
    const refundedMembers = previousSeason.members.filter((id) => !currentMemberSet.has(id));

    const guestSlotsBaseline = season.courts * COURTS_DENSITY - season.members.length;
    const prevQuarter = getSeasonQuarter(previousSeasonName);

    const placeholders: Record<string, string> = {
      SEASON_TITLE: formatSeasonTitle(seasonName, true),
      SEASON_SHORT: formatSeasonTitle(seasonName, false),
      TOTAL_PEOPLE: String(season.members.length),
      ALL_MEMBERS_MENTIONS: mentionList(season.members),
      WEEK_COUNTS: String(season.weekCounts),
      GUEST_FEE: String(season.guestFee),
      PAYMENT_INFO: blocksToText(paymentBlocks),
      COURT_PRICE: String(season.courtPricePerHour),
      COURT_COUNT: String(season.courts),
      TOTAL_PRICE: String(season.totalPrice ?? 0),
      PLAY_DATES: groupDatesByMonth(playDates.map((e) => e.date)),
      GUEST_SLOTS_BASELINE: String(guestSlotsBaseline),
      CONTINUING_MEMBERS_MENTIONS: mentionList(continuingMembers),
      NEW_MEMBERS_MENTIONS: mentionList(newMembers),
      REFUND_MEMBERS_MENTIONS: mentionList(refundedMembers),
      PREV_QUARTER: String(prevQuarter),
    };

    const rawText = blocksToText(templateBlocks);
    const text = applyPlaceholders(rawText, placeholders);

    const parts = text
      .split(BLOCK_DIVIDER)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length === 0) {
      await replyMessage(replyToken, [{ type: 'text', text: '公告內容為空' }]);
      return;
    }

    // LINE reply 一次最多允許 5 則訊息；如果模板被改到切出超過 5 段，寧可回一則清楚的錯誤，
    // 也不要讓 replyMessage 對 LINE API 打出無效請求、管理員只在 log 裡看到警告、LINE 上什麼都沒收到。
    const LINE_REPLY_MESSAGE_LIMIT = 5;
    if (parts.length > LINE_REPLY_MESSAGE_LIMIT) {
      logger.error({ partCount: parts.length }, 'NEW_SEASON 模板切出的段落數超過 LINE reply 上限');
      await replyMessage(replyToken, [
        { type: 'text', text: `NEW_SEASON 模板被 ${BLOCK_DIVIDER} 切出 ${parts.length} 段，超過 LINE 單次回覆上限（${LINE_REPLY_MESSAGE_LIMIT} 則），請檢查模板的分隔線數量` },
      ]);
      return;
    }

    await replyMessage(replyToken, parts.map((part) => ({ type: 'text' as const, text: part })));
  } catch (err) {
    logger.error({ err }, 'Season announcement handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
