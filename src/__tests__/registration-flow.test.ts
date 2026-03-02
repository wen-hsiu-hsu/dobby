import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

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

vi.mock('../config/line.js', () => ({
  dobbyClient: { replyMessage: vi.fn().mockResolvedValue({}) },
  battingClient: { replyMessage: vi.fn().mockResolvedValue({}) },
  getClient: vi.fn().mockReturnValue({ replyMessage: vi.fn().mockResolvedValue({}) }),
}));

function mockFetchResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  } as Response);
}

describe('Registration flow', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('handleRegistration replies with success message', async () => {
    const { getClient } = await import('../config/line.js');
    const mockReply = vi.fn().mockResolvedValue({});
    (getClient as any).mockReturnValue({ replyMessage: mockReply });

    const userPage = {
      id: 'user-page-1',
      properties: {
        user_id: { type: 'title', title: [{ plain_text: 'user1' }] },
        'Custom Name': { type: 'rich_text', rich_text: [{ plain_text: 'Alice' }] },
        is_admin: { type: 'checkbox', checkbox: false },
        message_counts: { type: 'number', number: 0 },
        groups: { type: 'multi_select', multi_select: [] },
        'multi-chat': { type: 'multi_select', multi_select: [] },
      },
    };
    fetchMock.mockImplementation(() => mockFetchResponse({ results: [userPage] }));

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
    const { getClient } = await import('../config/line.js');

    const mockReply = vi.fn().mockResolvedValue({});
    (getClient as any).mockReturnValue({ replyMessage: mockReply });

    const userPage = {
      id: 'user-page-1',
      properties: {
        user_id: { type: 'title', title: [{ plain_text: 'user1' }] },
        'Custom Name': { type: 'rich_text', rich_text: [{ plain_text: 'Bob' }] },
        is_admin: { type: 'checkbox', checkbox: false },
        message_counts: { type: 'number', number: 0 },
        groups: { type: 'multi_select', multi_select: [] },
        'multi-chat': { type: 'multi_select', multi_select: [] },
      },
    };

    const seasonPage = {
      id: 'season-page-1',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Q1 2024' }] },
        Members: { type: 'relation', relation: [], has_more: false },
        'Start Date': { type: 'date', date: null },
        'End Date': { type: 'date', date: null },
      },
    };

    const personPage = {
      id: 'person1',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Bob' }] },
        'Has Paid': { type: 'checkbox', checkbox: false },
        'Line User ID': { type: 'rich_text', rich_text: [] },
      },
    };

    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/databases/test-db-users/query')) {
        return mockFetchResponse({ results: [userPage] });
      }
      if (url.includes('/databases/test-db-people/query')) {
        return mockFetchResponse({ results: [personPage] });
      }
      if (url.includes('/databases/test-db-season/query')) {
        return mockFetchResponse({ results: [seasonPage] });
      }
      if (url.includes('/pages/')) {
        return mockFetchResponse(personPage);
      }
      return mockFetchResponse({ results: [] });
    });

    const event = {
      replyToken: 'token-leave',
      message: { text: '@Dobby 假' },
      source: { userId: 'user1' },
    };

    await handleLeave(event as any, false, 'dobby');

    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining('季租') }),
        ]),
      })
    );
  });
});
