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
    expect(text).toContain('季租出席：2 人');
    expect(text).toContain('零打報名：0 人');
    expect(text).toContain('總計：2 人');
    expect(text).not.toContain('剩餘名額');
  });

  it('shows what-if remaining slots when c=N is provided, without affecting attendance', async () => {
    const bot = createTestBot({ users: adminUsers });
    const messages = await bot.run('@Dobby next?c=5', { userId: 'admin-user' });
    const text = (messages[0] as any)?.text ?? '';
    // 出席人數 unaffected by courtOverride
    expect(text).toContain('季租出席：2 人');
    expect(text).toContain('總計：2 人');
    // calculateTotalSlots(5, members=2, absentees=0) - guests(0) = 5*7 - 2 = 33
    expect(text).toContain('若 5 場地：剩餘名額 33 人');
  });
});
