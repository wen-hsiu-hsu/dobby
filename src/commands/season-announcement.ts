import * as announcementRepo from '../services/notion/announcement-repository.js';
import * as seasonRepo from '../services/notion/season-repository.js';
import * as peopleRepo from '../services/notion/people-repository.js';
import * as calendarRepo from '../services/notion/calendar-repository.js';
import * as usersRepo from '../services/notion/users-repository.js';
import type { messagingApi } from '@line/bot-sdk';
import { blocksToText, blocksToSections, readHeaderTable } from '../services/notion/blocks-to-text.js';
import type { NestedBlock } from '../services/notion/blocks-to-text.js';
import { tablesToText, parsePaymentTable, paymentExtraText } from '../services/notion/payment-methods.js';
import { replyMessage } from '../services/line/reply-service.js';
import { parseSeasonInput, getPreviousSeasonName, formatSeasonTitle, getSeasonQuarter, groupDatesByMonth } from '../utils/date-utils.js';
import { logger } from '../utils/logger.js';
import { COURTS_DENSITY } from './registration/capacity-calculator.js';
import { NEWS_TEMPLATE_PAGE_NAME, loadPaymentPage, paymentPageText, renderNews, splitIntoTextMessages } from './news.js';
import type { PaymentPage } from './news.js';
import { truncateAltText } from './flex-card-parts.js';
import { fitsBubbleSizeLimit } from './name-list-card.js';
import { buildSeasonBubble, seasonCardToText } from './season-card.js';
import { PAYMENT_HEADING } from './season-card.js';
import type { SeasonCardItem, SeasonCardParams } from './season-card.js';

// COURTS_DENSITY 從 capacity-calculator.ts 共用（每面場地可容納的人數上限）。這裡算的是
// 「當季預設、零請假」的零打名額 baseline（公告用途，非即時報名名額），公式跟
// calculateTotalSlots() 不同，但「每面場地幾人」這個數字本身共用同一來源。

// 三則公告之間的分隔線（NEW_SEASON 模板專用），bot 依此切成多則 LINE 訊息回覆。
// 跟區塊內部用來斷行的單一 "—"（Notion 分隔線區塊）不同，不要搞混。
// 只認「整個段落就是這 8 個字」的段落：要拿區塊切段才能保留 Notion 的標題給卡片用。
const BLOCK_DIVIDER = '————————';

// 含這個變數的那一段回純文字（給管理員貼到 LINE 記事本），其他段都畫成卡片。
const NEWS_PLACEHOLDER = '{NEW_SEASON_NEWS}';

// LINE reply 一次最多允許 5 則訊息
const LINE_REPLY_MESSAGE_LIMIT = 5;

/**
 * 依成員的人員清單 pageId 找出可 @ 的名字：優先用 USERS 的 Custom Name（LINE 顯示名稱），
 * 找不到（理論上不會發生，USERS 不會主動移除使用者）才退回人員清單的 Name 當作保底。
 */
function buildMentionResolver(users: Awaited<ReturnType<typeof usersRepo.findAll>>, people: Awaited<ReturnType<typeof peopleRepo.findMembersOfSeasons>>) {
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
  return text.replace(/\{([A-Z0-9_]+)\}/g, (match, key: string) => values[key] ?? match);
}

// 卡片裡整個段落只有 {PAYMENT_V2} 時，畫成跟付款卡一樣的付款列（帳號有複製按鈕）；
// 夾在其他文字裡的 {PAYMENT_V2} 照一般變數代入成純文字。
const PAYMENT_PLACEHOLDER = '{PAYMENT_V2}';

function isPaymentBlock(block: NestedBlock): boolean {
  return block.type === 'paragraph' && blocksToText([block]).trim() === PAYMENT_PLACEHOLDER;
}

/**
 * 付款區塊。PAYMENT_V2 的表格讀得懂就用付款卡的版面；讀不到頁面、或表格改壞時，
 * 「付款方式」底下改放純文字（跟 @Dobby 公告的 {PAYMENT_V2} 同一段，包括讀取失敗的提示），不讓整張卡失敗。
 */
function paymentItem(page: PaymentPage): SeasonCardItem {
  const methods = 'blocks' in page ? parsePaymentTable(page.blocks) : null;
  if (methods && 'blocks' in page) return { kind: 'payment', methods, extraText: paymentExtraText(page.blocks) };
  return { kind: 'section', heading: PAYMENT_HEADING, body: paymentPageText(page) };
}

function isDividerBlock(block: NestedBlock): boolean {
  if (block.type !== 'paragraph') return false;
  const text = blocksToText([block]).trim();
  if (text === BLOCK_DIVIDER) return true;
  // 分隔線跟其他字擠在同一段（Shift+Enter 換行）或多打了 —，不會切段，卡片會少一張或整份變成純文字，
  // 管理員只會看到「卡片怎麼不見了」，所以留一筆 log 方便從 /logs 找原因
  if (text.includes(BLOCK_DIVIDER)) logger.warn({ text }, 'NEW_SEASON paragraph contains the divider but is not a divider on its own; not splitting here');
  return false;
}

function splitByDivider(blocks: NestedBlock[]): NestedBlock[][] {
  const parts: NestedBlock[][] = [[]];
  for (const block of blocks) {
    if (isDividerBlock(block)) parts.push([]);
    else parts[parts.length - 1]!.push(block);
  }
  return parts;
}

// 卡片裡的表格依標題列的欄名決定版面（不看是第幾張卡片），管理員在 Notion 增刪、調整列都不用改程式。
// 有 `column` 欄的是數據格，有 `highlight_title` 欄的是螢光大數字，見 season-card.ts。
const STAT_COLUMNS = { title: '標題', prefix: '內容前綴', value: '內容', suffix: '內容後綴', note: '備註', width: 'column' } as const;
const HIGHLIGHT_COLUMNS = { title: '標題', amount: '副標題', content: '內容', note: '備註', highlight: 'highlight_title' } as const;

// 表格內容整塊消失時記一筆 warn：管理員只會看到「卡片少了一塊」，要能從 /logs 找到原因
function tableItem(block: NestedBlock, fill: (t: string) => string): SeasonCardItem | null {
  const table = readHeaderTable(block);
  if (table !== null && table.length === 0) {
    logger.warn('NEW_SEASON table has only a header row; skipping it');
    return null;
  }
  const rows = table?.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, fill(v).trim()])));
  const first = rows?.[0];
  if (rows && first && STAT_COLUMNS.width in first) {
    const c = STAT_COLUMNS;
    const tiles = rows
      .map((r) => ({
        title: r[c.title] ?? '',
        prefix: r[c.prefix] ?? '',
        value: r[c.value] ?? '',
        suffix: r[c.suffix] ?? '',
        note: r[c.note] ?? '',
        wide: (r[c.width] ?? '').toLowerCase() === 'wide',
      }))
      .filter((t) => t.title || t.value);
    if (tiles.length === 0) logger.warn('NEW_SEASON stats table has no row with a 標題 or 內容; skipping it');
    return tiles.length > 0 ? { kind: 'stats', tiles } : null;
  }
  if (rows && first && HIGHLIGHT_COLUMNS.highlight in first) {
    const c = HIGHLIGHT_COLUMNS;
    const highlightRows = rows
      .map((r) => ({
        title: r[c.title] ?? '',
        amount: r[c.amount] ?? '',
        content: r[c.content] ?? '',
        note: r[c.note] ?? '',
        highlight: (r[c.highlight] ?? '').toLowerCase() === 'true',
      }))
      .filter((r) => r.title || r.amount || r.content);
    if (highlightRows.length === 0) logger.warn('NEW_SEASON highlight table has no row with a 標題, 副標題 or 內容; skipping it');
    return highlightRows.length > 0 ? { kind: 'highlights', rows: highlightRows } : null;
  }
  // 認不得的表格（沒開標題列、欄名不對）：每列串成一行當一般文字，至少內容不會消失
  const body = fill(tablesToText([block])).trim();
  logger.warn({ hasHeader: table !== null }, 'NEW_SEASON table has neither a column nor a highlight_title column; rendering it as plain text');
  // fromTable：段首就是這種表格時，不能把它的第一列拿去當卡片標題
  return body ? { kind: 'section', heading: '', body, fromTable: true } : null;
}

/** 一段模板（兩條 `————————` 之間）由上到下轉成卡片項目：表格各自一項，表格之間的文字依 Notion 標題切段。 */
function buildCardItems(blocks: NestedBlock[], fill: (t: string) => string, payment: SeasonCardItem): SeasonCardItem[] {
  const items: SeasonCardItem[] = [];
  let run: NestedBlock[] = [];
  const flushText = () => {
    // 先切段再代入：變數值裡的換行（例如 {PLAY_DATES}）不會被誤認成段落邊界
    for (const s of blocksToSections(run)) {
      const heading = fill(s.heading).trim();
      const body = fill(s.body);
      if (heading || body.trim()) items.push({ kind: 'section', heading, body: body.trim() ? body : '' });
    }
    run = [];
  };
  for (const block of blocks) {
    if (block.type === 'table') {
      flushText();
      const item = tableItem(block, fill);
      if (item) items.push(item);
    } else if (isPaymentBlock(block)) {
      flushText();
      items.push(payment);
    } else {
      run.push(block);
    }
  }
  flushText();
  return items;
}

/**
 * 卡片標題取該段第一行：模板每段開頭都是一行沒有 Notion 標題的文字（例如「中華科大 - {SEASON_TITLE}」），
 * 那一行拿去當標題，同一段剩下的行留在內文。段落一開頭就是 Notion 標題或表格時，改用季度當卡片標題。
 */
function takeCardTitle(items: SeasonCardItem[], fallbackTitle: string): SeasonCardParams {
  const [first, ...rest] = items;
  if (first?.kind !== 'section' || first.heading || first.fromTable) return { title: fallbackTitle, items };
  const [titleLine = '', ...bodyLines] = first.body.trim().split('\n');
  const title = titleLine.trim();
  if (!title) return { title: fallbackTitle, items };
  // 標題行底下是空行時不要留在內文開頭
  const body = bodyLines.join('\n').replace(/^\n+/, '');
  return { title, items: body.trim() ? [{ kind: 'section', heading: '', body }, ...rest] : rest };
}

export async function handleSeasonAnnouncement(replyToken: string, isAdmin: boolean, seasonArg: string | undefined): Promise<void> {
  if (!isAdmin) {
    await replyMessage(replyToken, [{ type: 'text', text: '此指令僅限管理員使用' }]);
    return;
  }

  if (!seasonArg) {
    await replyMessage(replyToken, [{ type: 'text', text: '請指定季度，例如 @Dobby season 2026Q4' }]);
    return;
  }

  const seasonName = parseSeasonInput(seasonArg);
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

    // 金額欄位是管理員手填的，上一季的退費和結餘要等那一季結束才會填。沒填就報錯，不代入 0：
    // 退費當 0 算，續打費會變成全額，看起來仍是合理的數字，轉傳出去才會被發現。
    // 注意：Notion 欄位被改名或改成非 number 型別時 getNumber 也回 null，一樣會回「還沒填」。
    const { actualFeePerPerson: realPrice } = season;
    const { refundPerPerson: refundPrice, balance } = previousSeason;
    const missingFields = [
      ...(realPrice === null ? [`${seasonName} 的「每人實際收費」`] : []),
      ...(refundPrice === null ? [`${previousSeasonName} 的「季打退費」`] : []),
      ...(balance === null ? [`${previousSeasonName} 的「結餘」`] : []),
    ];
    if (realPrice === null || refundPrice === null || balance === null) {
      await replyMessage(replyToken, [
        { type: 'text', text: `季租承租紀錄還沒填：\n${missingFields.map((f) => `• ${f}`).join('\n')}` },
      ]);
      return;
    }

    const news = await announcementRepo.findByName(NEWS_TEMPLATE_PAGE_NAME);
    if (!news) {
      await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${NEWS_TEMPLATE_PAGE_NAME} 公告內容` }]);
      return;
    }

    const [templateBlocks, newsBlocks, paymentPage, users, playDates, people] = await Promise.all([
      announcementRepo.getBlocks(template.pageId),
      announcementRepo.getBlocks(news.pageId),
      loadPaymentPage(),
      usersRepo.findAll(),
      calendarRepo.findPlayDatesOfSeason(season),
      peopleRepo.findMembersOfSeasons([season, previousSeason]),
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

    // {NEW_SEASON_NEWS} 跟 @Dobby 公告同一份 NEWS_TEMPLATE，但代入的是指令指定的那一季。
    // people 已經包含指定季所有成員，不用再查一次。
    const personById = new Map(people.map((p) => [p.pageId, p]));
    const seasonPeople = season.members.flatMap((id) => personById.get(id) ?? []);
    const paymentText = paymentPageText(paymentPage);
    const newsText = renderNews(newsBlocks, season, seasonPeople, playDates, paymentText).text;
    // 空的話含 {NEW_SEASON_NEWS} 的那段會整段消失，管理員不一定發現少了要貼記事本的那則
    if (!newsText.trim()) {
      await replyMessage(replyToken, [{ type: 'text', text: `${NEWS_TEMPLATE_PAGE_NAME} 公告內容為空` }]);
      return;
    }

    const placeholders: Record<string, string> = {
      SEASON_TITLE: formatSeasonTitle(seasonName, true),
      SEASON_SHORT: formatSeasonTitle(seasonName, false),
      TOTAL_PEOPLE: String(season.members.length),
      ALL_MEMBERS_MENTIONS: mentionList(season.members),
      WEEK_COUNTS: String(season.weekCounts),
      GUEST_FEE: String(season.guestFee),
      COURT_PRICE: String(season.courtPricePerHour),
      COURT_COUNT: String(season.courts),
      TOTAL_PRICE: String(season.totalPrice ?? 0),
      PLAY_DATES: groupDatesByMonth(playDates.map((e) => e.date)),
      GUEST_SLOTS_BASELINE: String(guestSlotsBaseline),
      CONTINUING_MEMBERS_MENTIONS: mentionList(continuingMembers),
      NEW_MEMBERS_MENTIONS: mentionList(newMembers),
      REFUND_MEMBERS_MENTIONS: mentionList(refundedMembers),
      PREV_QUARTER: String(prevQuarter),
      NEW_SEASON_NEWS: newsText,
      REAL_PRICE: String(realPrice),
      REFUND_PRICE: String(refundPrice),
      BACKTOBACK_SIGN_UP_PRICE: String(realPrice - refundPrice),
      BALANCE: String(balance),
      // 夾在其他文字裡時用純文字；整段只有它時畫成付款列（buildCardItems）
      PAYMENT_V2: paymentText,
    };
    const payment = paymentItem(paymentPage);
    const fill = (t: string) => applyPlaceholders(t, placeholders);

    const messages: messagingApi.Message[] = [];
    for (const partBlocks of splitByDivider(templateBlocks)) {
      const rawText = blocksToText(partBlocks);
      if (rawText.includes(NEWS_PLACEHOLDER)) {
        const text = fill(rawText).trim();
        if (text) messages.push(...splitIntoTextMessages(text));
        continue;
      }

      const items = buildCardItems(partBlocks, fill, payment);
      if (items.length === 0) continue;
      const card = takeCardTitle(items, formatSeasonTitle(seasonName, true));
      const text = seasonCardToText(card);
      const contents = buildSeasonBubble(card);
      const hasBody = card.items.length > 0;
      if (!hasBody || !fitsBubbleSizeLimit(contents)) {
        if (hasBody) logger.warn({ length: text.length }, 'Season card too large for a Flex bubble, falling back to text');
        messages.push(...splitIntoTextMessages(text));
        continue;
      }
      messages.push({ type: 'flex', altText: truncateAltText(text), contents });
    }

    if (messages.length === 0) {
      await replyMessage(replyToken, [{ type: 'text', text: '公告內容為空' }]);
      return;
    }

    // 模板被改到切出太多段（或 NEWS_TEMPLATE 長到要切成多則）時，寧可回一則清楚的錯誤，
    // 也不要讓 replyMessage 對 LINE API 打出無效請求、管理員只在 log 裡看到警告、LINE 上什麼都沒收到。
    if (messages.length > LINE_REPLY_MESSAGE_LIMIT) {
      logger.error({ messageCount: messages.length }, 'NEW_SEASON announcement exceeds the LINE reply message limit');
      await replyMessage(replyToken, [
        {
          type: 'text',
          text: `季公告會產生 ${messages.length} 則訊息，超過 LINE 單次回覆上限（${LINE_REPLY_MESSAGE_LIMIT} 則）。請檢查 NEW_SEASON 模板的 ${BLOCK_DIVIDER} 分隔線數量，或 ${NEWS_TEMPLATE_PAGE_NAME} 是否超過 5000 字（超過會拆成多則）`,
        },
      ]);
      return;
    }

    await replyMessage(replyToken, messages);
  } catch (err) {
    logger.error({ err }, 'Season announcement handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
