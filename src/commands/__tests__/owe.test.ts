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

describe('handleOwe (@Dobby 欠 / owe)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('replies "目前沒有未繳費成員 🎉" when no one owes payment', async () => {
    const bot = createTestBot({ people: { results: [] } });
    const messages = await bot.run('@Dobby 欠', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'text', text: '目前沒有未繳費成員 🎉' });
  });

  it('replies with a numbered, newline-separated unpaid list when there is an unpaid list', async () => {
    const bot = createTestBot();
    const messages = await bot.run('@Dobby owe', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    const msg = messages[0] as { type: string; text: string };
    expect(msg.type).toBe('text');
    expect(msg.text).toBe('未繳費名單：\n1. Alice\n2. Bob');
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
