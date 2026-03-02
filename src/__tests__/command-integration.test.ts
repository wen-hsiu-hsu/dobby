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
  process.env['PORT'] = '3000';
});

// Mock LINE clients
vi.mock('../config/line.js', () => ({
  dobbyClient: {
    replyMessage: vi.fn().mockResolvedValue({}),
    pushMessage: vi.fn().mockResolvedValue({}),
    getGroupMemberProfile: vi.fn(),
    getProfile: vi.fn(),
  },
  battingClient: {
    replyMessage: vi.fn().mockResolvedValue({}),
    pushMessage: vi.fn().mockResolvedValue({}),
    getProfile: vi.fn(),
  },
  getClient: vi.fn().mockReturnValue({
    replyMessage: vi.fn().mockResolvedValue({}),
    pushMessage: vi.fn().mockResolvedValue({}),
  }),
}));

function mockFetchResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  } as Response);
}

describe('Command routing integration', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(() => mockFetchResponse({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes @Dobby command to command-list handler', async () => {
    const { routeCommand } = await import('../commands/command-router.js');
    const { parseCommand } = await import('../commands/command-parser.js');
    const { getClient } = await import('../config/line.js');

    const mockClient = { replyMessage: vi.fn().mockResolvedValue({}) };
    (getClient as any).mockReturnValue(mockClient);

    const command = parseCommand('@Dobby command')!;
    const event = {
      replyToken: 'token123',
      message: { text: '@Dobby command', type: 'text' },
      source: { userId: 'user1', type: 'group', groupId: 'grp1' },
    };

    await routeCommand(command, event as any, 'dobby', false);

    expect(mockClient.replyMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToken: 'token123',
        messages: expect.arrayContaining([
          expect.objectContaining({ type: 'text' }),
        ]),
      })
    );
  });

  it('routes @Dobby (alone) to introduce handler', async () => {
    const { getClient } = await import('../config/line.js');

    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/databases/test-db-announcement/query')) {
        return mockFetchResponse({
          results: [{ id: 'page1', properties: { Name: { type: 'title', title: [{ plain_text: 'INTRODUCE' }] } } }],
        });
      }
      if (url.includes('/blocks/page1/children')) {
        return mockFetchResponse({
          results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Hello!' }] } }],
        });
      }
      return mockFetchResponse({ results: [] });
    });

    const mockClient = { replyMessage: vi.fn().mockResolvedValue({}) };
    (getClient as any).mockReturnValue(mockClient);

    const { routeCommand } = await import('../commands/command-router.js');
    const { parseCommand } = await import('../commands/command-parser.js');

    const command = parseCommand('@Dobby')!;
    const event = {
      replyToken: 'token456',
      message: { text: '@Dobby', type: 'text' },
      source: { userId: 'user1' },
    };

    await routeCommand(command, event as any, 'dobby', false);

    expect(mockClient.replyMessage).toHaveBeenCalled();
  });
});
