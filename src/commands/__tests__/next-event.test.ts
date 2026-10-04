import { describe, it, expect, vi } from 'vitest';
import { createTestBot } from '../../test-utils/create-test-bot.js';
import { replyText } from '../../test-utils/index.js';
import { cardHeroSummary } from '../registration/__tests__/card-nav.js';
import * as mutex from '../../services/mutex.js';

vi.mock('../../services/notion/notion-fetch.js');
vi.mock('../../config/line.js');
vi.mock('../../services/mutex.js');

const adminUsers = {
  results: [
    {
      id: 'user-page-1',
      object: 'page',
      properties: {
        user_id: { type: 'title', title: [{ plain_text: 'admin-user', type: 'text' }] },
        'Custom Name': { type: 'rich_text', rich_text: [] },
        'Registered name': { type: 'relation', relation: [{ id: 'person-1' }], has_more: false },
        is_admin: { type: 'checkbox', checkbox: true },
        message_counts: { type: 'number', number: 0 },
        groups: { type: 'multi_select', multi_select: [] },
        'multi-chat': { type: 'multi_select', multi_select: [] },
      },
    },
  ],
  has_more: false,
  next_cursor: null,
};

describe('next-event', () => {
  it('shows members the same card as admins, with nothing else when no task is pending', async () => {
    const bot = createTestBot();
    const messages = await bot.run('@Dobby next', { userId: 'user-alice' });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe('flex');
    expect(cardHeroSummary((messages[0] as any).contents).title).toBe('本週打球');
  });

  it('adds a separate text warning after the unchanged card while registrations for the date are pending', async () => {
    const bot = createTestBot();
    vi.mocked(mutex.pendingTaskCount).mockReturnValue(3);
    const messages = await bot.run('@Dobby next', { userId: 'user-alice' });

    // The card stays the first message, identical to the weekly push (ADR 0011).
    expect(messages).toHaveLength(2);
    expect(messages[0]?.type).toBe('flex');
    expect(replyText(messages[1])).toContain('還有 3 筆報名／請假正在處理');
    expect(replyText(messages[1])).toContain('不要重複操作');
    // Counted on the event-date key that withFreshCalendarEvent locks.
    expect(mutex.pendingTaskCount).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('warns when a task was pending before the read even if it finished during it', async () => {
    const bot = createTestBot();
    // Before the read: 1 pending (the card may not reflect it); after: settled.
    vi.mocked(mutex.pendingTaskCount).mockReturnValueOnce(1).mockReturnValue(0);
    const messages = await bot.run('@Dobby next', { userId: 'user-alice' });

    expect(messages).toHaveLength(2);
    expect(replyText(messages[1])).toContain('還有 1 筆');
  });

  it('shows the same status card as the weekly push for admin without query params', async () => {
    const bot = createTestBot({ users: adminUsers });
    const messages = await bot.run('@Dobby next', { userId: 'admin-user' });

    expect(messages[0]?.type).toBe('flex');
    const bubble = (messages[0] as any).contents;
    const summary = cardHeroSummary(bubble);
    expect(summary.title).toBe('本週打球');
    expect(summary.subtitle).toBe('不能到請喊聲');

    // season fixture: courts=3, members=[person-1, person-2]; calendar fixture: no absentees/guests
    // calculateTotalSlots: courts(3)*7 - members(2) + absentees(0) = 19
    const altText = replyText(messages[0]);
    expect(altText).toContain('零打名額 19 人');
    expect(altText).toContain('$200/人');
    expect(altText).toContain('請假：無');

    // 底部保留三顆按鈕，跟報名卡片相同、也是 next 可以拿來手動補發週報的原因
    const footer = bubble.footer.contents;
    expect(footer.map((b: any) => b.action.text)).toEqual(['@Dobby +1', '@Dobby -1', '@Dobby 假']);
  });
});
