import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTestBot } from '../../test-utils/index.js';
import * as notionFetch from '../../services/notion/notion-fetch.js';
import { logger } from '../../utils/logger.js';
import { BADGE_COLORS } from '../flex-card-parts.js';
import { FLEX_ICONS } from '../../config/flex-assets.js';
import { heroTitleOf } from './name-list-nav.js';

vi.mock('../../services/notion/notion-fetch.js');
vi.mock('../../config/line.js');
vi.mock('../../services/mutex.js');
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const PAGE_ID = 'announce-payment-v2';
const TABLE_ID = 'payment-table';

const announcement = {
  results: [
    { id: PAGE_ID, object: 'page', properties: { Name: { type: 'title', title: [{ plain_text: 'PAYMENT_V2', type: 'text' }] } } },
  ],
};

function row(...cells: string[]) {
  return { type: 'table_row', has_children: false, table_row: { cells: cells.map((c) => (c ? [{ plain_text: c }] : [])) } };
}

function paragraph(text: string) {
  return { type: 'paragraph', has_children: false, paragraph: { rich_text: text ? [{ plain_text: text }] : [] } };
}

const tableBlock = { id: TABLE_ID, type: 'table', has_children: true, table: { table_width: 3, has_column_header: true } };

// 2026-10-01 Notion PAYMENT_V2 的實際內容
const realRows = [
  row('名稱', '帳號', '備註'),
  row('永豐銀行 （807）', '20201800934932', '請備註名字'),
  row('Line Pay Money', '', ''),
  row('現金', '', ''),
];

function botWith(pageBlocks: unknown[], tableRows: unknown[] = realRows) {
  return createTestBot({
    announcement,
    blocks: { [PAGE_ID]: { results: pageBlocks as any }, [TABLE_ID]: { results: tableRows as any } },
  });
}

/** 付款卡 body 的每一格：名稱／帳號／備註文字，以及複製按鈕的 clipboard action（沒有按鈕就是 undefined）。 */
function methodRowsOf(bubble: any) {
  const rows = bubble.body.contents[0].contents as any[];
  return rows.map((r) => ({
    texts: r.contents[0].contents.map((t: any) => t.text),
    copy: r.contents[1]?.action,
  }));
}

describe('handlePayment (@Dobby 付款 / payment)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('looks up the PAYMENT_V2 announcement', async () => {
    const bot = botWith([tableBlock]);
    await bot.run('@Dobby 付款', { userId: 'user-alice' });

    expect(vi.mocked(notionFetch.notionPost)).toHaveBeenCalledWith(
      expect.stringContaining('/databases/test-db-announcement/query'),
      { filter: { property: 'Name', title: { equals: 'PAYMENT_V2' } } },
    );
  });

  it('replies a payment card with one row per method and a copy button only on rows with an account', async () => {
    const bot = botWith([tableBlock]);
    const messages = await bot.run('@Dobby payment', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: 'flex',
      altText: '永豐銀行 （807） 20201800934932 (請備註名字)\nLine Pay Money\n現金',
    });
    const bubble = (messages[0] as any).contents;
    expect(heroTitleOf(bubble)).toEqual({ badgeColor: BADGE_COLORS.lime, title: '付款資訊', countLabel: undefined });
    expect(JSON.stringify(bubble.hero)).toContain(FLEX_ICONS.creditCardDark);
    expect(JSON.stringify(bubble.hero)).toContain('共 3 種付款方式');
    expect(methodRowsOf(bubble)).toEqual([
      {
        texts: ['永豐銀行 （807）', '20201800934932', '請備註名字'],
        copy: { type: 'clipboard', label: '複製帳號', clipboardText: '20201800934932' },
      },
      { texts: ['Line Pay Money'], copy: undefined },
      { texts: ['現金'], copy: undefined },
    ]);
    // 只有表格時 body 只有列表，沒有額外說明文字
    expect(bubble.body.contents).toHaveLength(1);
  });

  it('shows text outside the table under the list and appends it to altText', async () => {
    const bot = botWith([paragraph('轉帳後請私訊管理員'), tableBlock, paragraph('')]);
    const messages = await bot.run('@Dobby 付款', { userId: 'user-alice' });

    const bubble = (messages[0] as any).contents;
    expect(bubble.body.contents[1]).toMatchObject({ type: 'text', text: '轉帳後請私訊管理員' });
    expect((messages[0] as any).altText).toBe(
      '永豐銀行 （807） 20201800934932 (請備註名字)\nLine Pay Money\n現金\n轉帳後請私訊管理員',
    );
  });

  it('shows 「（未命名）」 for an account-only row (Flex text must not be empty)', async () => {
    const bot = botWith([tableBlock], [row('名稱', '帳號', '備註'), row('', '999', '')]);
    const messages = await bot.run('@Dobby 付款', { userId: 'user-alice' });

    expect(methodRowsOf((messages[0] as any).contents)).toEqual([
      { texts: ['（未命名）', '999'], copy: { type: 'clipboard', label: '複製帳號', clipboardText: '999' } },
    ]);
  });

  it('falls back to the page text when there is no usable table (e.g. the admin replaced it with paragraphs)', async () => {
    const bot = botWith([paragraph('永豐 (807) 20201800934932'), paragraph('現金')]);
    const messages = await bot.run('@Dobby 付款', { userId: 'user-alice' });

    expect(messages).toEqual([{ type: 'text', text: '永豐 (807) 20201800934932\n現金' }]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('falls back to the table rows as text when the header row is turned off, so the account still gets through', async () => {
    const bot = botWith([{ ...tableBlock, table: { table_width: 3, has_column_header: false } }]);
    const messages = await bot.run('@Dobby 付款', { userId: 'user-alice' });

    expect(messages).toEqual([
      { type: 'text', text: '名稱 帳號 備註\n永豐銀行 （807） 20201800934932 請備註名字\nLine Pay Money\n現金' },
    ]);
  });

  it('falls back to the table rows (minus the header) plus page text when the 名稱 column is renamed', async () => {
    const rows = [row('銀行', '帳號', '備註'), row('永豐銀行 （807）', '20201800934932', '請備註名字')];
    const bot = botWith([tableBlock, paragraph('轉帳後請私訊管理員')], rows);
    const messages = await bot.run('@Dobby 付款', { userId: 'user-alice' });

    expect(messages).toEqual([{ type: 'text', text: '永豐銀行 （807） 20201800934932 請備註名字\n轉帳後請私訊管理員' }]);
  });

  it('ignores whitespace-only text outside the table', async () => {
    const bot = botWith([tableBlock, paragraph('   ')]);
    const messages = await bot.run('@Dobby 付款', { userId: 'user-alice' });

    const bubble = (messages[0] as any).contents;
    expect(bubble.body.contents).toHaveLength(1);
    expect((messages[0] as any).altText).toBe('永豐銀行 （807） 20201800934932 (請備註名字)\nLine Pay Money\n現金');
  });

  it('drops the copy button when the account is over the 1000-char clipboard limit (LINE would reject the message)', async () => {
    const long = '1'.repeat(1001);
    const bot = botWith([tableBlock], [row('名稱', '帳號'), row('永豐', long), row('郵局', '1'.repeat(1000))]);
    const messages = await bot.run('@Dobby 付款', { userId: 'user-alice' });

    const rows = methodRowsOf((messages[0] as any).contents);
    expect(rows[0]!.copy).toBeUndefined();
    expect(rows[1]!.copy).toMatchObject({ type: 'clipboard' });
  });

  it('replies "付款資訊為空" when the page is empty', async () => {
    const bot = botWith([]);
    const messages = await bot.run('@Dobby 付款', { userId: 'user-alice' });

    expect(messages).toEqual([{ type: 'text', text: '付款資訊為空' }]);
  });

  it('replies "找不到付款資訊" when PAYMENT_V2 does not exist', async () => {
    const bot = createTestBot({ announcement: { results: [] } });
    const messages = await bot.run('@Dobby 付款', { userId: 'user-alice' });

    expect(messages).toEqual([{ type: 'text', text: '找不到付款資訊' }]);
  });

  it('falls back to plain text when the card would exceed the Flex size limit', async () => {
    const rows = [row('名稱', '帳號', '備註'), ...Array.from({ length: 80 }, (_, i) => row(`銀行${i}`, `${1000000 + i}`, '請備註名字'))];
    const bot = botWith([tableBlock], rows);
    const messages = await bot.run('@Dobby 付款', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe('text');
    expect((messages[0] as any).text).toContain('銀行79 1000079 (請備註名字)');
  });

  it('replies a system error when Notion fails', async () => {
    const bot = botWith([tableBlock]);
    vi.mocked(notionFetch.notionGetAllResults).mockRejectedValue(new Error('boom'));
    const messages = await bot.run('@Dobby 付款', { userId: 'user-alice' });

    expect(messages).toEqual([{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  });
});
