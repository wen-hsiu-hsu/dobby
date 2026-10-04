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

describe('handleParticipants (@Dobby participants / people / 報名人)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('replies with a season-not-found message when the current season is missing', async () => {
    const bot = createTestBot({ season: { results: [] } });
    const messages = await bot.run('@Dobby participants', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    const msg = messages[0] as { type: string; text: string };
    expect(msg.type).toBe('text');
    expect(msg.text).toMatch(/^找不到 .+ 季租資料$/);
  });

  it('replies a header-only card with "0 位" when the season exists but has no members', async () => {
    const bot = createTestBot({
      season: {
        results: [
          {
            id: 'season-page-1',
            object: 'page',
            properties: {
              '季租時段': { type: 'title', title: [{ plain_text: '2026-Q2', type: 'text' }] },
              '報名人': { type: 'relation', relation: [], has_more: false },
              '場地數': { type: 'number', number: 3 },
              '零打費用': { type: 'number', number: 200 },
            },
          },
        ],
      },
    });

    const messages = await bot.run('@Dobby people', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'flex', altText: '2026-Q2 目前沒有報名成員' });
    const bubble = (messages[0] as any).contents;
    expect(heroTitleOf(bubble)).toEqual({ badgeColor: BADGE_COLORS.gray, title: '本季報名人', countLabel: '0 位' });
    expect(JSON.stringify(bubble.hero)).toContain(FLEX_ICONS.userXWhite);
    expect(bubble.body).toBeUndefined();
    // 沒有成員時不查 People
    expect(vi.mocked(notionFetch.notionPost).mock.calls.some(([path]) => path.includes('test-db-people'))).toBe(false);
  });

  it('replies with member count and a numbered, newline-separated name list in the normal case', async () => {
    const bot = createTestBot();
    const messages = await bot.run('@Dobby 報名人', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'flex', altText: '2026-Q2 報名人（2 位）：\n1. Alice\n2. Bob' });
    const bubble = (messages[0] as any).contents;
    expect(heroTitleOf(bubble)).toEqual({ badgeColor: BADGE_COLORS.lime, title: '本季報名人', countLabel: '2 位' });
    expect(listNamesOf(bubble)).toEqual(['Alice', 'Bob']);
    expect(JSON.stringify(bubble.hero)).toContain(FLEX_ICONS.usersDark);
    // 左上角是季度＋月份範圍；報名人卡沒有副標題、沒有按鈕（使用者定案）
    expect(JSON.stringify(bubble.hero)).toContain('2026 Q2（4~6月）');
    expect(JSON.stringify(bubble.body)).not.toContain('"action"');
    // 一次反向 relation query 拿整份名單，不逐筆 GET 成員頁面
    const peopleQueries = vi.mocked(notionFetch.notionPost).mock.calls.filter(([path]) => path.includes('test-db-people'));
    expect(peopleQueries).toHaveLength(1);
    expect(vi.mocked(notionFetch.notionGet).mock.calls.some(([path]) => /\/pages\/person-/.test(path))).toBe(false);
  });

  it('falls back to plain text when the member list is too long for one Flex bubble', async () => {
    const memberIds = Array.from({ length: 70 }, (_, i) => `person-${i + 1}`);
    const bot = createTestBot({
      season: {
        results: [
          {
            id: 'season-page-1',
            object: 'page',
            properties: {
              '季租時段': { type: 'title', title: [{ plain_text: '2026-Q2', type: 'text' }] },
              '報名人': { type: 'relation', relation: memberIds.map((id) => ({ id })), has_more: false },
              '場地數': { type: 'number', number: 3 },
              '零打費用': { type: 'number', number: 200 },
            },
          },
        ],
      },
      people: {
        results: memberIds.map((id, i) => ({
          id,
          object: 'page',
          properties: {
            Name: { type: 'title', title: [{ plain_text: `成員${i + 1}`, type: 'text' }] },
            '結清': { type: 'formula', formula: { type: 'boolean', boolean: true } },
          },
        })),
      },
    });
    const messages = await bot.run('@Dobby 報名人', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe('text');
    const text = (messages[0] as { text: string }).text;
    expect(text.startsWith('2026-Q2 報名人（70 位）：\n1. 成員1\n')).toBe(true);
    expect(text.endsWith('70. 成員70')).toBe(true);
  });

  it('replies with a system error message instead of throwing when the repository call fails', async () => {
    const bot = createTestBot();
    // Only fail the Season DB query (findByName) — let the Users DB lookup that
    // handleMessage does beforehand keep working, so the error is actually caught by
    // handleParticipants's own try/catch, not message-handler's outer one.
    const fixtureRouting = vi.mocked(notionFetch.notionPost).getMockImplementation()!;
    vi.mocked(notionFetch.notionPost).mockImplementation(async (path: string, body: unknown) => {
      if (path.includes('test-db-season')) throw new Error('Notion API down');
      return fixtureRouting(path, body);
    });

    const messages = await bot.run('@Dobby participants', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'text', text: '系統錯誤，請稍後再試' });
    // Confirms handleParticipants's own try/catch caught it (not message-handler's outer catch).
    expect(logger.error).toHaveBeenCalledWith(expect.anything(), 'Participants handler error');
  });
});
