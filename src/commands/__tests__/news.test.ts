import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleNews } from '../news.js';
import * as announcementRepo from '../../services/notion/announcement-repository.js';
import * as seasonRepo from '../../services/notion/season-repository.js';
import * as peopleRepo from '../../services/notion/people-repository.js';
import * as calendarRepo from '../../services/notion/calendar-repository.js';
import { replyMessage } from '../../services/line/reply-service.js';
import { replyText } from '../../test-utils/reply-text.js';

vi.mock('../../services/notion/announcement-repository.js');
vi.mock('../../services/notion/season-repository.js');
vi.mock('../../services/notion/people-repository.js');
vi.mock('../../services/notion/calendar-repository.js');
vi.mock('../../services/line/reply-service.js');

function paragraphBlock(text: string) {
  return { type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } };
}

function tableRow(...cells: string[]) {
  return { type: 'table_row', table_row: { cells: cells.map((c) => (c ? [{ plain_text: c }] : [])) } };
}

// 2026-10-01 Notion PAYMENT_V2 的實際內容
const paymentBlocks = [
  {
    type: 'table',
    table: { table_width: 3, has_column_header: true },
    children: [
      tableRow('名稱', '帳號', '備註'),
      tableRow('永豐銀行 （807）', '20201800934932', '請備註名字'),
      tableRow('Line Pay Money', '', ''),
      tableRow('現金', '', ''),
    ],
  },
];

function bulletedListItemBlock(text: string) {
  return { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: text }] } };
}

const newsBlocks = [
  paragraphBlock('{SEASON} {FROM_TO_MONTH}'),
  paragraphBlock('共 {TOTAL_PEOPLE} 人'),
  paragraphBlock('{LIST_ALL_PEOPLE}'),
  paragraphBlock('每人 ${PRICE_PER_PERSON_FOR_SEASON}'),
  paragraphBlock('共 {WEEK_COUNTS} 次'),
  paragraphBlock('每人每次 ${PRICE_PER_PERSON_FOR_ONCE}'),
  paragraphBlock('{COURT_COUNT} 面，共 ${TOTAL_PRICE}'),
  paragraphBlock('{LIST_ALL_DATES}'),
  paragraphBlock('{LOCATION}'),
  bulletedListItemBlock('現場付款'),
  paragraphBlock('付款方式'),
  paragraphBlock('{PAYMENT_V2}'),
  // 不認得的變數（含數字的也一樣）原樣保留
  paragraphBlock('{807} {PAYMENT_V3}'),
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(announcementRepo.findByName).mockImplementation(async (name: string) =>
    name === 'PAYMENT_V2' ? { pageId: 'ann-payment', name } : { pageId: 'ann-1', name },
  );
  vi.mocked(seasonRepo.findByName).mockResolvedValue({
    pageId: 'season-1',
    name: '2026-Q3',
    members: ['person-1', 'person-2'],
    courts: 2,
    guestFee: 170,
    location: '中華科大',
    weekCounts: 13,
    courtPricePerHour: 450,
    actualFeePerPerson: 2150,
    refundPerPerson: null,
    balance: null,
    totalPrice: 23400,
    playDatePageIds: ['cal-2', 'cal-1'],
  });
  vi.mocked(peopleRepo.findMembersOfSeasons).mockResolvedValue([
    { pageId: 'person-1', name: '許文修', hasPaid: true },
    { pageId: 'person-2', name: '陳玟育', hasPaid: true },
  ]);
  // Returned out of order on purpose — handler must sort by date before rendering.
  vi.mocked(calendarRepo.findPlayDatesOfSeason).mockResolvedValue([
    { pageId: 'cal-2', date: '2026-10-03T20:00:00.000+08:00', absentees: [], guests: [], isPaused: false, courts: null },
    { pageId: 'cal-1', date: '2026-09-26T20:00:00.000+08:00', absentees: [], guests: [], isPaused: false, courts: null },
  ]);
  vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) =>
    (pageId === 'ann-payment' ? paymentBlocks : newsBlocks) as any,
  );
});


function headingBlock(text: string) {
  return { type: 'heading_2', heading_2: { rich_text: [{ plain_text: text }] } };
}

const dividerBlock = { type: 'divider', divider: {} };

// 卡片 body：段落 box 與 separator 交錯，最後一個是按鈕列
function cardSections(message: any): string[][] {
  return (message.contents.body.contents as any[])
    .slice(0, -1)
    .filter((c) => c.type === 'box')
    .map((box) => box.contents.map((t: any) => t.text));
}

function heroTexts(message: any): string[] {
  const walk = (n: any): string[] =>
    !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(walk) : [...(n.type === 'text' ? [n.text] : []), ...Object.values(n).flatMap(walk)];
  return walk(message.contents.hero);
}

describe('handleNews', () => {
  it('looks up the NEWS_TEMPLATE announcement, not NEWS', async () => {
    await handleNews('token');

    expect(announcementRepo.findByName).toHaveBeenCalledWith('NEWS_TEMPLATE');
  });

  it('loads members and play dates of the current season with one query each, not per-page GETs', async () => {
    await handleNews('token');

    const season = await vi.mocked(seasonRepo.findByName).mock.results[0]!.value;
    expect(peopleRepo.findMembersOfSeasons).toHaveBeenCalledWith([season]);
    expect(calendarRepo.findPlayDatesOfSeason).toHaveBeenCalledWith(season);
  });

  it('substitutes all season/date placeholders with live data', async () => {
    await handleNews('token');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = replyText(messages[0]!);

    expect(text).toContain('2026-Q3 7~9月');
    expect(text).toContain('共 2 人');
    expect(text).toContain('許文修、陳玟育');
    // 每人實際收費，不是 formula 算的每人平均場租
    expect(text).toContain('每人 $2150');
    expect(text).toContain('共 13 次');
    expect(text).toContain('每人每次 $170');
    expect(text).toContain('2 面，共 $23400');
    // Sorted ascending and grouped by month despite being returned out of order
    expect(text).toContain('9/26\n10/03');
    expect(text).toContain('中華科大');
    // bulleted_list_item blocks get a "• " prefix that plain paragraphs don't
    expect(text).toContain('• 現場付款');
  });

  it('fills {PAYMENT_V2} with the PAYMENT_V2 payment table, one method per line', async () => {
    await handleNews('token');

    expect(announcementRepo.findByName).toHaveBeenCalledWith('PAYMENT_V2');
    expect(announcementRepo.getBlocks).toHaveBeenCalledWith('ann-payment');
    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = replyText(messages[0]!);
    expect(text).toContain('付款方式\n永豐銀行 （807） 20201800934932 (請備註名字)\nLine Pay Money\n現金');
    expect(text).not.toContain('{PAYMENT_V2}');
    expect(text).toContain('{807} {PAYMENT_V3}');
  });

  it('still replies the announcement, with a notice in place of {PAYMENT_V2}, when reading PAYMENT_V2 fails', async () => {
    vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) => {
      if (pageId === 'ann-payment') throw new Error('Notion 429');
      return newsBlocks as any;
    });

    await handleNews('token');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = replyText(messages[0]!);
    expect(text).toContain('2026-Q3 7~9月');
    expect(text).toContain('付款方式\n（付款資訊讀取失敗，請用 @Dobby 付款查詢）');
  });

  it('fills {PAYMENT_V2} with a notice (never an empty string) when PAYMENT_V2 is missing', async () => {
    vi.mocked(announcementRepo.findByName).mockImplementation(async (name: string) =>
      name === 'PAYMENT_V2' ? null : { pageId: 'ann-1', name },
    );

    await handleNews('token');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    expect(replyText(messages[0]!)).toContain('付款方式\n（找不到付款資訊）');
  });

  it('fills {PAYMENT_V2} with a notice when the PAYMENT_V2 page is empty', async () => {
    vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) =>
      (pageId === 'ann-payment' ? [] : newsBlocks) as any,
    );

    await handleNews('token');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    expect(replyText(messages[0]!)).toContain('付款方式\n（付款資訊為空）');
  });

  it('replies a Flex card split into sections at Notion headings, with the plain text as altText', async () => {
    vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) =>
      (pageId === 'ann-payment'
        ? paymentBlocks
        : [
            paragraphBlock('{SEASON} {FROM_TO_MONTH}'),
            headingBlock('報名名單'),
            paragraphBlock('(共 {TOTAL_PEOPLE} 人)'),
            paragraphBlock('{LIST_ALL_PEOPLE}'),
            dividerBlock,
            headingBlock('時間'),
            paragraphBlock('{LIST_ALL_DATES}'),
            dividerBlock,
            headingBlock('付款方式'),
            paragraphBlock('{PAYMENT_V2}'),
          ]) as any,
    );

    await handleNews('token');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const message = messages[0] as any;
    expect(message.type).toBe('flex');
    expect(message.altText).toBe(
      '2026-Q3 7~9月\n報名名單\n(共 2 人)\n許文修、陳玟育\n—\n時間\n9/26\n10/03\n—\n付款方式\n永豐銀行 （807） 20201800934932 (請備註名字)\nLine Pay Money\n現金',
    );
    expect(heroTexts(message)).toEqual(['2026 Q3（7~9月）', '本季公告', '共 2 人・13 次']);
    // 段落在代入變數前就切好，{LIST_ALL_DATES} 裡的換行不會被當成段落邊界
    expect(cardSections(message)).toEqual([
      ['2026-Q3 7~9月'],
      ['報名名單', '(共 2 人)\n許文修、陳玟育'],
      ['時間', '9/26\n10/03'],
      ['付款方式', '永豐銀行 （807） 20201800934932 (請備註名字)\nLine Pay Money\n現金'],
    ]);
  });

  it('falls back to plain text split at line breaks into messages within LINE\'s 5000-character limit when the card exceeds 30KB', async () => {
    // 每行 4000 字（卡片約 36KB）：兩行放不進同一則，所以一行一則，內容完整不截斷
    const lines = ['甲', '乙', '丙'].map((c) => c.repeat(4000));
    vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) =>
      (pageId === 'ann-payment' ? paymentBlocks : [headingBlock('其他'), ...lines.map(paragraphBlock)]) as any,
    );

    await handleNews('token');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    expect(messages).toEqual([
      { type: 'text', text: `其他\n${lines[0]}` },
      { type: 'text', text: lines[1] },
      { type: 'text', text: lines[2] },
    ]);
  });

  it('hard-splits a single line over 5000 characters, and caps the fallback at LINE\'s 5 messages per reply', async () => {
    const longLine = '長'.repeat(30000);
    vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) =>
      (pageId === 'ann-payment' ? paymentBlocks : [paragraphBlock(longLine)]) as any,
    );

    await handleNews('token');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const texts = messages.map((m) => replyText(m));
    expect(texts).toHaveLength(5);
    expect(texts.every((t) => t.length <= 5000)).toBe(true);
    expect(texts[4]!.endsWith('…（公告太長，後面省略）')).toBe(true);
  });

  it('replies "公告內容為空" when the template has text but no section with content, e.g. only blank lines and dividers', async () => {
    vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) =>
      (pageId === 'ann-payment'
        ? paymentBlocks
        : [paragraphBlock('  '), dividerBlock, paragraphBlock('{LOCATION}')]) as any,
    );
    vi.mocked(seasonRepo.findByName).mockResolvedValue({ ...(await seasonRepo.findByName('x'))!, location: '' });

    await handleNews('token');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '公告內容為空' }]);
  });

  it('replies "公告內容為空" when NEWS_TEMPLATE has no content', async () => {
    vi.mocked(announcementRepo.getBlocks).mockImplementation(async (pageId: string) =>
      (pageId === 'ann-payment' ? paymentBlocks : []) as any,
    );

    await handleNews('token');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '公告內容為空' }]);
  });

  it('shows a notice instead of $0 when 每人實際收費 is empty', async () => {
    vi.mocked(seasonRepo.findByName).mockResolvedValue({ ...(await seasonRepo.findByName('2026-Q3'))!, actualFeePerPerson: null });

    await handleNews('token');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    expect(replyText(messages[0]!)).toContain('每人 $（每人實際收費未填）');
  });

  it('replies "找不到公告內容" when NEWS_TEMPLATE does not exist', async () => {
    vi.mocked(announcementRepo.findByName).mockResolvedValue(null);

    await handleNews('token');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '找不到公告內容' }]);
    expect(seasonRepo.findByName).not.toHaveBeenCalled();
  });

  it('replies with a season-not-found message when the current season is missing', async () => {
    vi.mocked(seasonRepo.findByName).mockResolvedValue(null);

    await handleNews('token');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = replyText(messages[0]!);
    expect(text).toContain('季租資料');
  });
});
