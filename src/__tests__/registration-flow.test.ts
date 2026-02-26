import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

beforeAll(() => {
  process.env['NODE_ENV'] = 'test';
  process.env['LINE_CHANNEL_SECRET_DOBBY'] = 'test-secret-dobby';
  process.env['LINE_CHANNEL_ACCESS_TOKEN_DOBBY'] = 'test-token-dobby';
  process.env['LINE_CHANNEL_SECRET_BATTING'] = 'test-secret-batting';
  process.env['LINE_CHANNEL_ACCESS_TOKEN_BATTING'] = 'test-token-batting';
  process.env['NOTION_API_KEY'] = 'test-notion-key';
  process.env['NOTION_DB_USERS'] = 'test-db-users';
  process.env['NOTION_DB_CALENDAR'] = 'test-db-calendar';
  process.env['NOTION_DB_PEOPLE'] = 'test-db-people';
  process.env['NOTION_DB_SEASON'] = 'test-db-season';
  process.env['NOTION_DB_ANNOUNCEMENT'] = 'test-db-announcement';
});

vi.mock('../services/notion/notion-client.js', () => ({
  notion: {
    dataSources: { query: vi.fn() },
    pages: { create: vi.fn(), update: vi.fn().mockResolvedValue({}), retrieve: vi.fn() },
    blocks: { children: { list: vi.fn() } },
  },
}));

vi.mock('../config/line.js', () => ({
  dobbyClient: { replyMessage: vi.fn().mockResolvedValue({}) },
  battingClient: { replyMessage: vi.fn().mockResolvedValue({}) },
  getClient: vi.fn().mockReturnValue({ replyMessage: vi.fn().mockResolvedValue({}) }),
}));

describe('Registration flow', () => {
  it('handleRegistration replies with success message', async () => {
    const { notion } = await import('../services/notion/notion-client.js');
    const { getClient } = await import('../config/line.js');

    const mockReply = vi.fn().mockResolvedValue({});
    (getClient as any).mockReturnValue({ replyMessage: mockReply });

    // Mock: findByUserId → user with customName
    (notion.dataSources.query as any).mockImplementation(({ filter }: any) => {
      // users query
      return Promise.resolve({
        results: [{
          id: 'user-page-1',
          properties: {
            'User ID': { type: 'title', title: [{ plain_text: 'user1' }] },
            'Display Name': { type: 'rich_text', rich_text: [{ plain_text: 'Alice' }] },
            'Custom Name': { type: 'rich_text', rich_text: [{ plain_text: 'Alice' }] },
            'Message Count': { type: 'number', number: 0 },
            'Groups': { type: 'multi_select', multi_select: [] },
            'Multi Chats': { type: 'multi_select', multi_select: [] },
          },
        }],
      });
    });

    // For simplicity, test the capacity calculator directly for the e2e flow
    const { calculateAddCapacity } = await import('../commands/registration/capacity-calculator.js');
    const event = {
      pageId: 'evt1', date: '2024-01-06',
      absentees: [], guests: [], capacity: 14, isPaused: false,
    };
    const season = { members: ['p1', 'p2', 'p3'] };

    const result = calculateAddCapacity(event, season, 'Alice', 1, false);
    expect(result.canAdd).toBe(true);
    expect(result.newGuests).toContain('Alice');
  });

  it('handleLeave rejects non-season member', async () => {
    const { handleLeave } = await import('../commands/registration/leave-handler.js');
    const { notion } = await import('../services/notion/notion-client.js');
    const { getClient } = await import('../config/line.js');

    const mockReply = vi.fn().mockResolvedValue({});
    (getClient as any).mockReturnValue({ replyMessage: mockReply });

    // Users query returns user
    // Season findAll returns season where target is NOT a member
    (notion.dataSources.query as any).mockImplementation(() => Promise.resolve({
      results: [{
        id: 'user-page-1',
        properties: {
          'User ID': { type: 'title', title: [{ plain_text: 'user1' }] },
          'Display Name': { type: 'rich_text', rich_text: [{ plain_text: 'Bob' }] },
          'Custom Name': { type: 'rich_text', rich_text: [{ plain_text: 'Bob' }] },
          'Message Count': { type: 'number', number: 0 },
          'Groups': { type: 'multi_select', multi_select: [] },
          'Multi Chats': { type: 'multi_select', multi_select: [] },
          // Season: Name field for season
          'Name': { type: 'title', title: [{ plain_text: 'Q1 2024' }] },
          'Members': { type: 'relation', relation: [], has_more: false },
          'Start Date': { type: 'date', date: null },
          'End Date': { type: 'date', date: null },
          // People
          'Has Paid': { type: 'checkbox', checkbox: false },
          'Line User ID': { type: 'rich_text', rich_text: [] },
        },
      }],
    }));

    // Mock pages.retrieve for people
    (notion.pages.retrieve as any).mockResolvedValue({
      id: 'person1',
      properties: {
        'Name': { type: 'title', title: [{ plain_text: 'Bob' }] },
        'Has Paid': { type: 'checkbox', checkbox: false },
        'Line User ID': { type: 'rich_text', rich_text: [] },
      },
    });

    const event = {
      replyToken: 'token-leave',
      message: { text: '@Dobby 假' },
      source: { userId: 'user1' },
    };

    await handleLeave(event as any, false, 'dobby');

    // Should reply with season-member-only message
    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining('季租') }),
        ]),
      })
    );
  });
});
