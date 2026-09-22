import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTestBot } from '../../test-utils/index.js';
import * as notionFetch from '../../services/notion/notion-fetch.js';
import { logger } from '../../utils/logger.js';

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

  it('replies "目前沒有報名成員" when the season exists but has no members', async () => {
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
    expect(messages[0]).toMatchObject({ type: 'text', text: '2026-Q2 目前沒有報名成員' });
  });

  it('replies with member count and a numbered, newline-separated name list in the normal case', async () => {
    const bot = createTestBot();
    const messages = await bot.run('@Dobby 報名人', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    const msg = messages[0] as { type: string; text: string };
    expect(msg.type).toBe('text');
    expect(msg.text).toBe('2026-Q2 報名人（2 位）：\n1. Alice\n2. Bob');
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
