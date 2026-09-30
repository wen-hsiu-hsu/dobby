import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTestBot } from '../../test-utils/index.js';
import * as notionFetch from '../../services/notion/notion-fetch.js';
import { logger } from '../../utils/logger.js';
import { BADGE_COLORS } from '../flex-card-parts.js';
import { FLEX_ICONS } from '../../config/flex-assets.js';
import { heroTitleOf, listNamesOf } from './name-list-nav.js';

vi.mock('../../services/notion/notion-fetch.js');
vi.mock('../../config/line.js');
vi.mock('../../services/mutex.js');
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('handleOwe (@Dobby 欠 / owe)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('replies an all-paid card (header only, no list or button) when no one owes payment', async () => {
    const bot = createTestBot({ people: { results: [] } });
    const messages = await bot.run('@Dobby 欠', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'flex', altText: '目前沒有未繳費成員 🎉' });
    const bubble = (messages[0] as any).contents;
    expect(heroTitleOf(bubble)).toEqual({ badgeColor: BADGE_COLORS.lime, title: '全部繳清', countLabel: undefined });
    expect(JSON.stringify(bubble.hero)).toContain(FLEX_ICONS.checkDark);
    expect(bubble.body).toBeUndefined();
  });

  it('replies with a numbered, newline-separated unpaid list when there is an unpaid list', async () => {
    const bot = createTestBot();
    const messages = await bot.run('@Dobby owe', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'flex', altText: '未繳費名單：\n1. Alice\n2. Bob' });
    const bubble = (messages[0] as any).contents;
    expect(heroTitleOf(bubble)).toEqual({ badgeColor: BADGE_COLORS.orange, title: '未繳費名單', countLabel: '2 位' });
    expect(listNamesOf(bubble)).toEqual(['Alice', 'Bob']);
    expect(JSON.stringify(bubble.hero)).toContain(FLEX_ICONS.circleDollarSignDark);
    // 底部「付款資訊」按鈕送出的是付款指令（付款卡的觸發文字不能改）
    expect(JSON.stringify(bubble.body)).toContain('"text":"@Dobby 付款"');
  });

  it('falls back to plain text when the list is too long for one Flex bubble (LINE would reject it silently)', async () => {
    const results = Array.from({ length: 70 }, (_, i) => ({
      id: `person-${i + 1}`,
      object: 'page',
      properties: {
        Name: { type: 'title', title: [{ plain_text: `成員${i + 1}`, type: 'text' }] },
        '結清': { type: 'formula', formula: { type: 'boolean', boolean: false } },
      },
    }));
    const bot = createTestBot({ people: { results } });
    const messages = await bot.run('@Dobby 欠', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe('text');
    const text = (messages[0] as { text: string }).text;
    expect(text.startsWith('未繳費名單：\n1. 成員1\n')).toBe(true);
    expect(text.endsWith('70. 成員70')).toBe(true);
  });

  it('replies with a system error message instead of throwing when the repository call fails', async () => {
    const bot = createTestBot();
    // Only fail the People DB query (findAllUnpaid) — let the Users DB lookup that
    // handleMessage does beforehand keep working, so the error is actually caught by
    // handleOwe's own try/catch, not message-handler's outer one.
    const fixtureRouting = vi.mocked(notionFetch.notionPost).getMockImplementation()!;
    vi.mocked(notionFetch.notionPost).mockImplementation(async (path: string, body: unknown) => {
      if (path.includes('test-db-people')) throw new Error('Notion API down');
      return fixtureRouting(path, body);
    });

    const messages = await bot.run('@Dobby 欠', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'text', text: '系統錯誤，請稍後再試' });
    // Confirms handleOwe's own try/catch caught it (not message-handler's outer catch).
    expect(logger.error).toHaveBeenCalledWith(expect.anything(), 'Owe handler error');
  });
});
