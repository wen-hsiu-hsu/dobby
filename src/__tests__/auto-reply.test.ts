import { describe, it, expect, vi, beforeAll } from 'vitest';

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

const ADMIN_USER = { pageId: 'p-admin', userId: 'manager-user-id', customName: 'Manager', isAdmin: true, messageCount: 0, groups: ['group-1'], multiChats: [] };
const REGULAR_USER = { pageId: 'p1', userId: 'regular-user', customName: '', isAdmin: false, messageCount: 0, groups: [], multiChats: [] };

vi.mock('../services/notion/users-repository.js', () => ({
  findByUserId: vi.fn().mockImplementation((userId: string) =>
    Promise.resolve(userId === 'manager-user-id' ? ADMIN_USER : REGULAR_USER)
  ),
  findAdmin: vi.fn().mockResolvedValue(ADMIN_USER),
  create: vi.fn().mockResolvedValue(REGULAR_USER),
  update: vi.fn().mockResolvedValue(undefined),
  incrementMessageCount: vi.fn().mockResolvedValue(undefined),
  findByCustomName: vi.fn().mockResolvedValue(null),
}));

describe('auto-reply', () => {
  it('findReply returns a match for known trigger', async () => {
    const { findReply } = await import('../services/auto-reply.js');
    // "請假" is in the JSON (reply="喔不")
    const result = findReply('我想請假');
    expect(result).toBe('喔不');
  });

  it('findReply returns null for unknown text', async () => {
    const { findReply } = await import('../services/auto-reply.js');
    const result = findReply('這不是任何觸發詞xyz123');
    expect(result).toBeNull();
  });

  it('findReply is case-sensitive', async () => {
    const { findReply } = await import('../services/auto-reply.js');
    // All triggers in the JSON are Chinese or specific case
    const result = findReply('PLEASE LEAVE');
    expect(result).toBeNull();
  });

  it('message handler skips auto-reply for admin', async () => {
    const { handleMessage } = await import('../handlers/message-handler.js');
    const { getClient } = await import('../config/line.js');
    const mockReply = vi.fn();
    (getClient as any).mockReturnValue({ replyMessage: mockReply });

    const event = {
      type: 'message' as const,
      replyToken: 'token-admin',
      message: { type: 'text' as const, id: 'msg1', text: '請假', quoteToken: '' },
      source: { type: 'user' as const, userId: 'manager-user-id' },
      timestamp: Date.now(),
      mode: 'active' as const,
      webhookEventId: '',
      deliveryContext: { isRedelivery: false },
    };

    await handleMessage(event as any, 'dobby');
    expect(mockReply).not.toHaveBeenCalled();
  });

  it('message handler sends auto-reply for non-admin', async () => {
    const { handleMessage } = await import('../handlers/message-handler.js');
    const { getClient } = await import('../config/line.js');
    const mockReply = vi.fn().mockResolvedValue({});
    (getClient as any).mockReturnValue({ replyMessage: mockReply });

    const event = {
      type: 'message' as const,
      replyToken: 'token-user',
      message: { type: 'text' as const, id: 'msg2', text: '請假', quoteToken: '' },
      source: { type: 'user' as const, userId: 'regular-user' },
      timestamp: Date.now(),
      mode: 'active' as const,
      webhookEventId: '',
      deliveryContext: { isRedelivery: false },
    };

    await handleMessage(event as any, 'dobby');
    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ text: '喔不' }),
        ]),
      })
    );
  });
});
