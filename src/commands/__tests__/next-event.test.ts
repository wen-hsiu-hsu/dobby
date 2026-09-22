import { describe, it, expect, vi } from 'vitest';
import { createTestBot } from '../../test-utils/create-test-bot.js';

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
  it('rejects non-admin users', async () => {
    const bot = createTestBot();
    const messages = await bot.run('@Dobby next', { userId: 'user-alice' });
    expect((messages[0] as any)?.text).toContain('僅限管理員');
  });

  it('shows attendance summary for admin without query params', async () => {
    const bot = createTestBot({ users: adminUsers });
    const messages = await bot.run('@Dobby next', { userId: 'admin-user' });
    const text = (messages[0] as any)?.text ?? '';
    // season fixture: courts=3, members=[person-1, person-2]; calendar fixture: no absentees/guests
    // calculateTotalSlots: courts(3)*7 - members(2) + absentees(0) = 19
    expect(text).toContain('零打名額：19人 $200/人');
    expect(text).toContain('場地：3 面');
    expect(text).toContain('應到：2 人');
    expect(text).toContain('請假：無');
    expect(text).not.toContain('剩餘名額');
  });

  it('shows what-if remaining slots when c=N is provided, without affecting attendance', async () => {
    const bot = createTestBot({ users: adminUsers });
    const messages = await bot.run('@Dobby next?c=5', { userId: 'admin-user' });
    const text = (messages[0] as any)?.text ?? '';
    // calculateTotalSlots: courts(5)*7 - members(2) + absentees(0) = 33
    expect(text).toContain('零打名額：33人 $200/人');
    // 場地 line reflects the override, not season.courts (3)
    expect(text).toContain('場地：5 面');
    // 應到 unaffected by courtOverride
    expect(text).toContain('應到：2 人');
  });
});
