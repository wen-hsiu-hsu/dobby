import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTestBot } from '../test-utils/index.js';

vi.mock('../services/notion/notion-fetch.js');
vi.mock('../config/line.js');
vi.mock('../services/mutex.js');

describe('Registration flow', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('@Dobby +1 → 報名成功（season member）', async () => {
    // Default fixture: Alice (person-1) is a season member, calendar has 0 guests
    const bot = createTestBot();
    const messages = await bot.run('@Dobby +1', { userId: 'user-alice' });

    expect(messages.length).toBeGreaterThan(0);
    const msg = messages[0] as any;
    expect(msg.text).toContain('報名成功');
    // Notion PATCH should have been called once to update guests
    expect(bot.notionPatchSpy).toHaveBeenCalledTimes(1);
  });

  it('@Dobby +1 → 找不到活動（calendar empty）', async () => {
    const bot = createTestBot({ calendar: { results: [] } });
    const messages = await bot.run('@Dobby +1', { userId: 'user-alice' });

    const msg = messages[0] as any;
    expect(msg.text).toContain('找不到');
    expect(bot.notionPatchSpy).not.toHaveBeenCalled();
  });

  it('@Dobby +1 → 找不到季租資料（season empty）', async () => {
    const bot = createTestBot({ season: { results: [] } });
    const messages = await bot.run('@Dobby +1', { userId: 'user-alice' });

    const msg = messages[0] as any;
    expect(msg.text).toContain('季租');
    expect(bot.notionPatchSpy).not.toHaveBeenCalled();
  });

  it('@Dobby +1 → 找不到帳號（user not registered）', async () => {
    const bot = createTestBot({ users: { results: [] } });
    const messages = await bot.run('@Dobby +1', { userId: 'unknown-user' });

    const msg = messages[0] as any;
    expect(msg.text).toContain('找不到');
    expect(bot.notionPatchSpy).not.toHaveBeenCalled();
  });

  it('@Dobby 假 → 請假成功（season member）', async () => {
    // Alice (person-1) is in season members, not currently absent
    const bot = createTestBot();
    const messages = await bot.run('@Dobby 假', { userId: 'user-alice' });

    const msg = messages[0] as any;
    expect(msg.text).toContain('請假成功');
    // updateAbsentees should have been called
    expect(bot.notionPatchSpy).toHaveBeenCalledTimes(1);
  });

  it('@Dobby +1 → 名額不足時仍回傳完整名額狀態，不是只有一句錯誤', async () => {
    const bot = createTestBot({
      season: {
        results: [
          {
            id: 'season-page-1',
            object: 'page',
            properties: {
              季租時段: { type: 'title', title: [{ plain_text: '2026-Q2' }] },
              報名人: { type: 'relation', relation: [{ id: 'person-1' }, { id: 'person-2' }], has_more: false },
              場地數: { type: 'number', number: 0 },
              零打費用: { type: 'number', number: 200 },
            },
          },
        ],
      },
    });

    const messages = await bot.run('@Dobby +1', { userId: 'user-alice' });

    const msg = messages[0] as any;
    expect(msg.text).toContain('名額不足');
    expect(msg.text).toContain('剩餘名額：');
    expect(msg.text).toContain('總人數：共');
    expect(bot.notionPatchSpy).not.toHaveBeenCalled();
  });

  it('@Dobby +7 → 名額不足時，非管理員仍能報到剩餘名額上限，並在回應說明已達上限', async () => {
    const bot = createTestBot({
      season: {
        results: [
          {
            id: 'season-page-1',
            object: 'page',
            properties: {
              季租時段: { type: 'title', title: [{ plain_text: '2026-Q2' }] },
              報名人: { type: 'relation', relation: [{ id: 'person-1' }, { id: 'person-2' }], has_more: false },
              場地數: { type: 'number', number: 1 }, // totalSlots = 1*7 - 2 + 0 = 5
              零打費用: { type: 'number', number: 200 },
            },
          },
        ],
      },
    });

    const messages = await bot.run('@Dobby +7', { userId: 'user-alice' });

    const msg = messages[0] as any;
    expect(msg.text).toContain('報名成功');
    expect(msg.text).toContain('名額已達上限，僅報名 5 位，您原本要求 7 位');
    expect(msg.text).toContain('Alice的朋友 (5)');
    expect(msg.text).not.toContain('Alice的朋友 (6)');
    expect(msg.text).toContain('剩餘名額：0 人');
    expect(bot.notionPatchSpy).toHaveBeenCalledTimes(1);
  });

  it('@Dobby @Bob +1 → 非管理員代他人報名應被拒絕', async () => {
    // user-alice is not admin in the default fixture
    const bot = createTestBot();
    const messages = await bot.run('@Dobby @Bob +1', { userId: 'user-alice' });

    const msg = messages[0] as any;
    expect(msg.text).toBe('你不是管理員');
    expect(bot.notionPatchSpy).not.toHaveBeenCalled();
  });

  it('@Dobby @Bob 假 → 非管理員代他人請假應被拒絕', async () => {
    const bot = createTestBot();
    const messages = await bot.run('@Dobby @Bob 假', { userId: 'user-alice' });

    const msg = messages[0] as any;
    expect(msg.text).toBe('你不是管理員');
    expect(bot.notionPatchSpy).not.toHaveBeenCalled();
  });

  it('@Dobby @Bob +1 → 管理員可代他人報名', async () => {
    const bot = createTestBot({
      users: {
        results: [
          {
            id: 'user-page-admin',
            object: 'page',
            properties: {
              user_id: { type: 'title', title: [{ plain_text: 'user-boss' }] },
              'Custom Name': { type: 'rich_text', rich_text: [] },
              'Registered name': { type: 'relation', relation: [], has_more: false },
              is_admin: { type: 'checkbox', checkbox: true },
              message_counts: { type: 'number', number: 0 },
              groups: { type: 'multi_select', multi_select: [] },
              'multi-chat': { type: 'multi_select', multi_select: [] },
            },
          },
        ],
      },
    });

    const messages = await bot.run('@Dobby @Bob +1', { userId: 'user-boss' });

    const msg = messages[0] as any;
    expect(msg.text).toContain('報名成功');
    expect(bot.notionPatchSpy).toHaveBeenCalledTimes(1);
  });

  it('@Dobby 假 → 拒絕非 season member', async () => {
    // Bob (person-2) is in season members in default fixture too —
    // use a user NOT mapped to any season person
    const bot = createTestBot({
      users: {
        results: [
          {
            id: 'user-page-guest',
            object: 'page',
            properties: {
              user_id: { type: 'title', title: [{ plain_text: 'user-guest' }] },
              'Custom Name': { type: 'rich_text', rich_text: [{ plain_text: 'Guest' }] },
              'Registered name': { type: 'relation', relation: [], has_more: false },
              is_admin: { type: 'checkbox', checkbox: false },
              message_counts: { type: 'number', number: 0 },
              groups: { type: 'multi_select', multi_select: [] },
              'multi-chat': { type: 'multi_select', multi_select: [] },
            },
          },
        ],
      },
    });

    const messages = await bot.run('@Dobby 假', { userId: 'user-guest' });

    const msg = messages[0] as any;
    expect(msg.text).toContain('季租');
    expect(bot.notionPatchSpy).not.toHaveBeenCalled();
  });
});

// ── capacity-calculator unit tests (no bot needed) ──────────────────────────

describe('calculateAddCapacity', () => {
  it('adds guest when capacity available', async () => {
    const { calculateAddCapacity } = await import(
      '../commands/registration/capacity-calculator.js'
    );
    const event = { pageId: 'evt1', date: '2026-05-09', absentees: [], guests: [], isPaused: false, courts: null };
    const season = { members: ['p1', 'p2', 'p3'], courts: 2, pageId: 's1', name: '2026-Q2', guestFee: 200 };

    const result = calculateAddCapacity(event, season, 'Alice', 1, false);
    expect(result.canAdd).toBe(true);
    expect(result.newGuests).toContain('Alice');
  });
});
