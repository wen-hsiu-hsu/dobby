import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSeasonAnnouncement } from '../season-announcement.js';
import * as announcementRepo from '../../services/notion/announcement-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import * as peopleRepo from '../../services/notion/people-repository.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import * as usersRepo from '../../services/notion/users-repository.js';
import { replyMessage } from '../../services/line/reply-service.js';
import { replyText } from '../../test-utils/reply-text.js';
import type { SeasonRecord } from '../../types/notion-models.js';

vi.mock('../../services/notion/announcement-repository.js');
vi.mock('../../services/notion/season-repository.js');
vi.mock('../../services/notion/people-repository.js');
vi.mock('../../services/notion/calendar-repository.js');
vi.mock('../../services/notion/users-repository.js');
vi.mock('../../services/line/reply-service.js');

const DIVIDER = '————————';

function paragraphBlock(text: string) {
  return { type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } };
}

function headingBlock(text: string) {
  return { type: 'heading_2', heading_2: { rich_text: [{ plain_text: text }] } };
}

function tableRow(...cells: string[]) {
  return { type: 'table_row', table_row: { cells: cells.map((c) => (c ? [{ plain_text: c }] : [])) } };
}

function makeSeason(overrides: Partial<SeasonRecord>): SeasonRecord {
  return {
    pageId: 'season-page',
    name: '2026-Q2',
    members: [],
    courts: 2,
    guestFee: 170,
    location: '中華科大',
    weekCounts: 13,
    courtPricePerHour: 450,
    actualFeePerPerson: null,
    refundPerPerson: null,
    balance: null,
    totalPrice: 23400,
    playDatePageIds: [],
    ...overrides,
  };
}

// 季租資料：2026-Q2 每人實際收費 2340；上一季 2026-Q1 季打退費 140、結餘 2173（2026-10-01 Notion 2026-Q4／Q3 的實際數字）
const CURRENT_SEASON = makeSeason({
  pageId: 'season-q2',
  name: '2026-Q2',
  members: ['person-1', 'person-2', 'person-3'],
  playDatePageIds: ['cal-1'],
  actualFeePerPerson: 2340,
});
const PREVIOUS_SEASON = makeSeason({
  pageId: 'season-q1',
  name: '2026-Q1',
  members: ['person-1', 'person-2', 'person-4'],
  actualFeePerPerson: 2150,
  refundPerPerson: 140,
  balance: 2173,
});

function tableBlock(...rows: string[][]) {
  return {
    type: 'table',
    table: { table_width: rows[0]!.length, has_column_header: true },
    children: rows.map((cells) => tableRow(...cells)),
  };
}

// 結構照 2026-10-01 Notion 的 NEW_SEASON 模板：第一段只有 {NEW_SEASON_NEWS}；後兩段開頭一行當卡片標題，
// 內容放在表格裡（欄名決定版面：column → 數據格、highlight_title → 螢光大數字）
const seasonTemplateBlocks = [
  paragraphBlock('{NEW_SEASON_NEWS}'),
  paragraphBlock(DIVIDER),
  paragraphBlock('中華科大 - {SEASON_TITLE}'),
  tableBlock(
    ['標題', '內容前綴', '內容', '內容後綴', '備註', 'column'],
    ['場地', '', '{COURT_COUNT}', '個場', '', 'narrow'],
    ['零打', '$', '{GUEST_FEE}', '', '', 'narrow'],
    ['報名人數', '', '{TOTAL_PEOPLE}', '人', '', 'narrow'],
    ['零打名額', '', '{GUEST_SLOTS_BASELINE}', '起跳', '有人請假則增加', 'narrow'],
    ['場租', '$', '{TOTAL_PRICE}', '', '${COURT_PRICE} * {COURT_COUNT} 面 * 2hrs * {WEEK_COUNTS} 次', 'wide'],
  ),
  headingBlock('時間'),
  paragraphBlock('{WEEK_COUNTS} 次，周六 20:00 ~ 22:00\n{PLAY_DATES}'),
  paragraphBlock(DIVIDER),
  paragraphBlock('{SEASON_SHORT} 費用說明'),
  tableBlock(
    ['標題', '副標題', '內容', '備註', 'highlight_title'],
    ['續打', '${BACKTOBACK_SIGN_UP_PRICE} ', '{CONTINUING_MEMBERS_MENTIONS}', '已扣除退費 ${REFUND_PRICE}', 'true'],
    ['新朋友', '${REAL_PRICE}', '{NEW_MEMBERS_MENTIONS}', '', 'true'],
    ['退費', '${REFUND_PRICE}', '{REFUND_MEMBERS_MENTIONS}', '', 'true'],
    ['Q{PREV_QUARTER} 結餘', '${BALANCE}', '', '', ''],
  ),
];

// NEWS_TEMPLATE：變數用 news 那套（{SEASON}、{LIST_ALL_PEOPLE}、{PAYMENT_V2}…），不是 season 這套
const newsTemplateBlocks = [
  headingBlock('報名名單'),
  paragraphBlock('{SEASON} 共 {TOTAL_PEOPLE} 人\n{LIST_ALL_PEOPLE}'),
  headingBlock('季打費用'),
  paragraphBlock('每人 ${PRICE_PER_PERSON_FOR_SEASON}'),
  headingBlock('付款方式'),
  paragraphBlock('{PAYMENT_V2}'),
  headingBlock('時間'),
  paragraphBlock('{LIST_ALL_DATES}'),
];

const paymentBlocks = [
  {
    type: 'table',
    table: { table_width: 3, has_column_header: true },
    children: [tableRow('名稱', '帳號', '備註'), tableRow('永豐銀行 （807）', '20201800934932', '請備註名字'), tableRow('現金', '', '')],
  },
];

const PAGES: Record<string, string> = {
  NEW_SEASON: 'ann-template',
  NEWS_TEMPLATE: 'ann-news',
  PAYMENT_V2: 'ann-payment',
};

function mockTemplateBlocks(blocks: unknown[]) {
  vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) => {
    if (pageId === 'ann-payment') return paymentBlocks as any;
    if (pageId === 'ann-news') return newsTemplateBlocks as any;
    return blocks as any;
  });
}

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(announcementRepo.findByName).mockImplementation(async (name: string) =>
    PAGES[name] ? { pageId: PAGES[name]!, name } : null,
  );
  mockTemplateBlocks(seasonTemplateBlocks);

  vi.mocked(seasonRepo.findByName).mockImplementation(async (name: string) => {
    if (name === '2026-Q2') return CURRENT_SEASON;
    if (name === '2026-Q1') return PREVIOUS_SEASON;
    return null;
  });

  vi.mocked(calendarRepo.findByPageIds).mockResolvedValue([
    { pageId: 'cal-1', date: '2026-04-04T20:00:00.000+08:00', absentees: [], guests: [], isPaused: false, courts: null },
  ]);

  vi.mocked(usersRepo.findAll).mockResolvedValue([
    { pageId: 'user-1', userId: 'u1', customName: 'Alice', registeredPersonPageId: 'person-1', isAdmin: false, messageCount: 0, groups: [], multiChats: [] },
    { pageId: 'user-2', userId: 'u2', customName: 'Bob', registeredPersonPageId: 'person-2', isAdmin: false, messageCount: 0, groups: [], multiChats: [] },
    { pageId: 'user-3', userId: 'u3', customName: 'Carol', registeredPersonPageId: 'person-3', isAdmin: false, messageCount: 0, groups: [], multiChats: [] },
    // person-4 (refunded, previous-season-only) has no USERS record — must fall back to People List name.
  ]);

  vi.mocked(peopleRepo.findByPageIds).mockImplementation(async (ids: string[]) =>
    ids.map((id) => ({ pageId: id, name: id === 'person-4' ? '大衛' : `姓名-${id}`, hasPaid: true })),
  );
});

async function replyMessages() {
  const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
  return messages as any[];
}

// 卡片 body 裡每一段 [小標, 內文]（沒小標的段落只有內文）
function cardSections(message: any): string[][] {
  return (message.contents.body.contents as any[])
    .filter((c) => c.type === 'box')
    .map((box) => box.contents.map((t: any) => t.text));
}

// Flex 的 text／span 不能是空字串，LINE 會整則退回
function emptyTexts(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(emptyTexts);
  const self = (node.type === 'text' || node.type === 'span') && !node.text ? [node] : [];
  return [...self, ...Object.values(node).flatMap(emptyTexts)];
}

function cardTitle(message: any): string {
  const texts: string[] = [];
  const walk = (n: any): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'text') texts.push(n.text);
    Object.values(n).forEach(walk);
  };
  walk(message.contents.hero);
  return texts.join('|');
}

describe('handleSeasonAnnouncement', () => {
  it('rejects non-admins without touching Notion', async () => {
    await handleSeasonAnnouncement('token', false, '2026Q2');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '此指令僅限管理員使用' }]);
    expect(announcementRepo.findByName).not.toHaveBeenCalled();
  });

  it('asks for a season when none is given', async () => {
    await handleSeasonAnnouncement('token', true, undefined);

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '請指定季度，例如 @Dobby season 2026Q4' }]);
    expect(announcementRepo.findByName).not.toHaveBeenCalled();
  });

  it('rejects a malformed season code', async () => {
    await handleSeasonAnnouncement('token', true, 'not-a-season');

    const [first] = await replyMessages();
    expect(first.text).toContain('無法辨識季度');
    expect(announcementRepo.findByName).not.toHaveBeenCalled();
  });

  it('accepts season codes without a hyphen and with a lowercase q', async () => {
    await handleSeasonAnnouncement('token', true, '2026q2');

    expect(seasonRepo.findByName).toHaveBeenCalledWith('2026-Q2');
  });

  it('replies with an error when the NEW_SEASON template is missing', async () => {
    vi.mocked(announcementRepo.findByName).mockResolvedValue(null);

    await handleSeasonAnnouncement('token', true, '2026Q2');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '找不到 NEW_SEASON 公告模板' }]);
  });

  it('replies with an error when the NEWS_TEMPLATE page is missing', async () => {
    vi.mocked(announcementRepo.findByName).mockImplementation(async (name: string) =>
      name === 'NEW_SEASON' ? { pageId: 'ann-template', name } : null,
    );

    await handleSeasonAnnouncement('token', true, '2026Q2');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '找不到 NEWS_TEMPLATE 公告內容' }]);
  });

  it('replies with an error when the target season does not exist', async () => {
    vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [first] = await replyMessages();
    expect(first.text).toContain('找不到 2026-Q2 季租資料');
  });

  it('replies with an error when the previous season does not exist, naming it explicitly', async () => {
    vi.mocked(seasonRepo.findByName).mockImplementation(async (name: string) => (name === '2026-Q2' ? CURRENT_SEASON : null));

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [first] = await replyMessages();
    expect(first.text).toContain('找不到上一季 2026-Q1 的季租資料');
  });

  it('lists every empty fee field instead of filling in 0, and stops before building the announcement', async () => {
    vi.mocked(seasonRepo.findByName).mockImplementation(async (name: string) => {
      if (name === '2026-Q2') return { ...CURRENT_SEASON, actualFeePerPerson: null };
      if (name === '2026-Q1') return { ...PREVIOUS_SEASON, refundPerPerson: null, balance: null };
      return null;
    });

    await handleSeasonAnnouncement('token', true, '2026Q2');

    expect(replyMessage).toHaveBeenCalledWith('token', [
      {
        type: 'text',
        text: '季租承租紀錄還沒填：\n• 2026-Q2 的「每人實際收費」\n• 2026-Q1 的「季打退費」\n• 2026-Q1 的「結餘」',
      },
    ]);
    expect(announcementRepo.getBlocks).not.toHaveBeenCalled();
  });

  it('reads the refund and balance from the previous season, and the fee from the target season', async () => {
    vi.mocked(seasonRepo.findByName).mockImplementation(async (name: string) => {
      if (name === '2026-Q2') return { ...CURRENT_SEASON, refundPerPerson: null, balance: null };
      if (name === '2026-Q1') return { ...PREVIOUS_SEASON, actualFeePerPerson: null };
      return null;
    });

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [, , fees] = await replyMessages();
    expect(fees.altText).toContain('續打 $2200 (已扣除退費 $140)');
    expect(fees.altText).toContain('新朋友 $2340');
    expect(fees.altText).toContain('退費 $140\n@大衛');
    expect(fees.altText).toContain('Q1 結餘 $2173');
  });

  it('wraps across a year boundary when looking up the previous season', async () => {
    const q1_2027 = makeSeason({ pageId: 'season-q1-2027', name: '2027-Q1', members: ['person-1'], actualFeePerPerson: 2000 });
    const q4_2026 = makeSeason({ pageId: 'season-q4-2026', name: '2026-Q4', members: ['person-1'], refundPerPerson: 0, balance: 0 });
    vi.mocked(seasonRepo.findByName).mockImplementation(async (name: string) => {
      if (name === '2027-Q1') return q1_2027;
      if (name === '2026-Q4') return q4_2026;
      return null;
    });

    await handleSeasonAnnouncement('token', true, '2027Q1');

    expect(seasonRepo.findByName).toHaveBeenCalledWith('2026-Q4');
  });

  it('replies with the NEWS_TEMPLATE text for the requested season, then one card per remaining block', async () => {
    await handleSeasonAnnouncement('token', true, '2026Q2');

    const messages = await replyMessages();
    expect(messages.map((m) => m.type)).toEqual(['text', 'flex', 'flex']);

    // {NEW_SEASON_NEWS}：news 的變數代入的是指令指定的 2026-Q2，只列 2026-Q2 的成員（不含上一季退費的 person-4）
    expect(messages[0].text).toBe(
      [
        '報名名單',
        '2026-Q2 共 3 人',
        '姓名-person-1、姓名-person-2、姓名-person-3',
        '季打費用',
        '每人 $2340',
        '付款方式',
        '永豐銀行 （807） 20201800934932 (請備註名字)\n現金',
        '時間',
        '4/04',
      ].join('\n'),
    );
  });

  it('turns the first line of each card block into the card title, and the tables into cards laid out by their column names', async () => {
    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [, info, fees] = await replyMessages();

    expect(cardTitle(info)).toBe('中華科大 - 2026 Q2 (4~6月)');
    // altText 是卡片的純文字（通知、/logs 看到的）
    expect(info.altText).toBe(
      [
        '中華科大 - 2026 Q2 (4~6月)',
        '',
        '場地 2 個場',
        '零打 $170',
        '報名人數 3 人',
        // courts(2) * 7 - members(3) = 11
        '零打名額 11 起跳 (有人請假則增加)',
        '場租 $23400 ($450 * 2 面 * 2hrs * 13 次)',
        '',
        '時間',
        '13 次，周六 20:00 ~ 22:00\n4/04',
      ].join('\n'),
    );
    // 數據格：四個 narrow 兩兩一列、wide 的場租獨佔一列；接著細線、「時間」段落
    const [stats, separator, time] = info.contents.body.contents;
    expect(stats.contents.map((line: any) => line.contents.length)).toEqual([2, 2, 1]);
    expect(separator.type).toBe('separator');
    expect(time.contents.map((t: any) => t.text)).toEqual(['時間', '13 次，周六 20:00 ~ 22:00\n4/04']);

    expect(cardTitle(fees)).toBe('2026 Q2 費用說明');
    expect(fees.altText).toBe(
      [
        '2026 Q2 費用說明',
        '',
        // 2340 - 140
        '續打 $2200 (已扣除退費 $140)',
        '@Alice @Bob',
        '新朋友 $2340',
        '@Carol',
        '退費 $140',
        // person-4 has no USERS record — falls back to the People List name.
        '@大衛',
        'Q1 結餘 $2173',
      ].join('\n'),
    );
    // 突顯的三列各一列，落單的一般列（結餘）佔半格
    const highlightLines = fees.contents.body.contents[0].contents.filter((c: any) => c.type !== 'separator');
    expect(highlightLines).toHaveLength(4);
    expect(highlightLines[3].layout).toBe('horizontal');
    expect(highlightLines[3].contents).toHaveLength(2);
    expect(highlightLines[3].contents[1].contents).toEqual([]);
  });

  it('never sends an empty Flex text when a mention list comes out empty (e.g. nobody got a refund)', async () => {
    // 上一季的人全部續打：退費名單代入後是空字串
    vi.mocked(seasonRepo.findByName).mockImplementation(async (name: string) => {
      if (name === '2026-Q2') return CURRENT_SEASON;
      if (name === '2026-Q1') return { ...PREVIOUS_SEASON, members: ['person-1', 'person-2'] };
      return null;
    });

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [, info, fees] = await replyMessages();
    expect(emptyTexts(info.contents)).toEqual([]);
    expect(emptyTexts(fees.contents)).toEqual([]);
    expect(fees.altText).toContain('退費 $140\nQ1 結餘 $2173');
  });

  it('reads column/highlight_title values case-insensitively', async () => {
    mockTemplateBlocks([
      paragraphBlock('標題'),
      tableBlock(['標題', '內容', 'column'], ['a', '1', 'narrow'], ['b', '2', 'Wide']),
      tableBlock(['標題', '副標題', 'highlight_title'], ['c', '$3', 'TRUE']),
    ]);

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [card] = await replyMessages();
    const [stats, , highlights] = card.contents.body.contents;
    // a 落單（補空格）、b 是 wide 獨佔一列
    expect(stats.contents.map((line: any) => line.contents.length)).toEqual([2, 1]);
    expect(highlights.contents[0].contents[0].contents[0].backgroundColor).toBe('#A3E635');
  });

  it('renders a table without a column/highlight_title column as plain rows, and never uses it as the card title', async () => {
    mockTemplateBlocks([tableBlock(['名稱', '金額'], ['續打', '${REAL_PRICE}'], ['退費', '${REFUND_PRICE}'])]);

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [card] = await replyMessages();
    expect(cardTitle(card)).toBe('2026 Q2 (4~6月)');
    expect(cardSections(card)).toEqual([['續打 $2340\n退費 $140']]);
  });

  it('uses the season title when a block starts with a recognized table, and skips a table that has only its header row', async () => {
    mockTemplateBlocks([
      tableBlock(['標題', '內容', 'column'], ['場地', '{COURT_COUNT}', 'wide']),
      tableBlock(['標題', '副標題', 'highlight_title']),
    ]);

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [card] = await replyMessages();
    expect(cardTitle(card)).toBe('2026 Q2 (4~6月)');
    expect(card.contents.body.contents).toHaveLength(1);
    expect(card.altText).toBe('2026 Q2 (4~6月)\n\n場地 2');
  });

  it('uses the season title when a card block starts with a Notion heading, keeping that heading as a section', async () => {
    mockTemplateBlocks([headingBlock('零打'), paragraphBlock('${GUEST_FEE}')]);

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [card] = await replyMessages();
    expect(cardTitle(card)).toBe('2026 Q2 (4~6月)');
    expect(cardSections(card)).toEqual([['零打', '$170']]);
  });

  it('keeps the rest of the first block in the card body when the title line has more lines under it', async () => {
    // 標題行底下的空行不留在內文開頭
    mockTemplateBlocks([paragraphBlock('標題'), paragraphBlock(''), paragraphBlock('副標 {SEASON_SHORT}'), headingBlock('零打'), paragraphBlock('${GUEST_FEE}')]);

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const [card] = await replyMessages();
    expect(cardTitle(card)).toBe('標題');
    expect(cardSections(card)).toEqual([['副標 2026 Q2'], ['零打', '$170']]);
  });

  it('does not substitute season variables a second time inside the NEW_SEASON_NEWS text', async () => {
    vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) => {
      if (pageId === 'ann-payment') return paymentBlocks as any;
      // {GUEST_FEE} 不是 news 的變數，news 代入後原樣保留；season 也不能再把它代入
      if (pageId === 'ann-news') return [paragraphBlock('{SEASON} {GUEST_FEE}')] as any;
      return [paragraphBlock('{NEW_SEASON_NEWS}')] as any;
    });

    await handleSeasonAnnouncement('token', true, '2026Q2');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '2026-Q2 {GUEST_FEE}' }]);
  });

  it('replies with an error instead of dropping the notebook text when NEWS_TEMPLATE renders empty', async () => {
    vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) => {
      if (pageId === 'ann-payment') return paymentBlocks as any;
      if (pageId === 'ann-news') return [paragraphBlock('')] as any;
      return seasonTemplateBlocks as any;
    });

    await handleSeasonAnnouncement('token', true, '2026Q2');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: 'NEWS_TEMPLATE 公告內容為空' }]);
  });

  it('counts the split NEW_SEASON_NEWS messages toward the 5-message limit', async () => {
    // 5000 字以上的 NEWS_TEMPLATE 會拆成 4 則，加上兩張卡共 6 則
    const longLine = '字'.repeat(4000);
    vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) => {
      if (pageId === 'ann-payment') return paymentBlocks as any;
      if (pageId === 'ann-news') return Array.from({ length: 4 }, () => paragraphBlock(longLine)) as any;
      return seasonTemplateBlocks as any;
    });

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const messages = await replyMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toContain('季公告會產生 6 則訊息');
    expect(messages[0].text).toContain('NEWS_TEMPLATE 是否超過 5000 字');
  });

  it('falls back to plain text for a card block too large for a Flex bubble', async () => {
    // 中文一字 3 bytes，12000 字 ≈ 36KB，超過 30KB 但不到 5000 字×3 則
    mockTemplateBlocks([paragraphBlock('標題'), headingBlock('很長'), ...Array.from({ length: 3 }, () => paragraphBlock('字'.repeat(4000)))]);

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const messages = await replyMessages();
    expect(messages.every((m) => m.type === 'text')).toBe(true);
    expect(messages[0].text.startsWith('標題\n\n很長\n')).toBe(true);
  });

  it('falls back to plain text for a block that has nothing but its title line', async () => {
    mockTemplateBlocks([paragraphBlock('只有一行 {SEASON_SHORT}')]);

    await handleSeasonAnnouncement('token', true, '2026Q2');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '只有一行 2026 Q2' }]);
  });

  it('replies with an error instead of silently dropping the message when the template splits into more than 5 parts', async () => {
    // LINE reply allows at most 5 messages per call — 6 dividers means 7 segments.
    mockTemplateBlocks(
      Array.from({ length: 7 }, (_, i) => paragraphBlock(`段落 ${i}`)).flatMap((block, i) =>
        i === 0 ? [block] : [paragraphBlock(DIVIDER), block],
      ),
    );

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const messages = await replyMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toContain('超過 LINE 單次回覆上限');
  });

  it('does not split on Notion divider blocks — only a hand-typed 8-dash paragraph splits the template', async () => {
    mockTemplateBlocks([paragraphBlock('{NEW_SEASON_NEWS}'), paragraphBlock('上段'), { type: 'divider', divider: {} }, paragraphBlock('下段')]);

    await handleSeasonAnnouncement('token', true, '2026Q2');

    const messages = await replyMessages();
    expect(messages).toHaveLength(1);
    expect(replyText(messages[0])).toMatch(/上段\n—\n下段$/);
  });
});
