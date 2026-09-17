import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionPost, notionPatch } from '../notion-fetch.js';
import { findByUserId, findAll, create, update, incrementMessageCount } from '../users-repository.js';

vi.mock('../notion-fetch.js');

const notionPostMock = vi.mocked(notionPost);
const notionPatchMock = vi.mocked(notionPatch);

function makePage(properties: Record<string, unknown>, id = 'user-page-1') {
  return { id, properties };
}

describe('users-repository', () => {
  beforeEach(() => {
    notionPostMock.mockReset();
    notionPatchMock.mockReset();
  });

  describe('findByUserId', () => {
    it('maps a fully populated page to NotionUser', async () => {
      notionPostMock.mockResolvedValue({
        results: [
          makePage({
            user_id: { type: 'title', title: [{ plain_text: 'user-alice' }] },
            'Custom Name': { type: 'rich_text', rich_text: [{ plain_text: 'Alice' }] },
            'Registered name': { type: 'relation', relation: [{ id: 'person-1' }] },
            is_admin: { type: 'checkbox', checkbox: true },
            message_counts: { type: 'number', number: 5 },
            groups: { type: 'multi_select', multi_select: [{ name: 'A' }, { name: 'B' }] },
            'multi-chat': { type: 'multi_select', multi_select: [{ name: 'chat-1' }] },
          }),
        ],
      });

      const user = await findByUserId('user-alice');

      expect(user).toEqual({
        pageId: 'user-page-1',
        userId: 'user-alice',
        customName: 'Alice',
        registeredPersonPageId: 'person-1',
        isAdmin: true,
        messageCount: 5,
        groups: ['A', 'B'],
        multiChats: ['chat-1'],
      });
    });

    it('defaults missing/empty properties', async () => {
      notionPostMock.mockResolvedValue({
        results: [makePage({})],
      });

      const user = await findByUserId('user-alice');

      expect(user).toEqual({
        pageId: 'user-page-1',
        userId: '',
        customName: '',
        registeredPersonPageId: '',
        isAdmin: false,
        messageCount: 0,
        groups: [],
        multiChats: [],
      });
    });

    it('returns null when no results', async () => {
      notionPostMock.mockResolvedValue({ results: [] });

      const user = await findByUserId('missing');

      expect(user).toBeNull();
    });
  });

  describe('findAll', () => {
    it('follows has_more/next_cursor to fetch every page', async () => {
      notionPostMock
        .mockResolvedValueOnce({
          results: [makePage({ user_id: { type: 'title', title: [{ plain_text: 'user-a' }] } }, 'page-a')],
          has_more: true,
          next_cursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          results: [makePage({ user_id: { type: 'title', title: [{ plain_text: 'user-b' }] } }, 'page-b')],
          has_more: false,
          next_cursor: null,
        });

      const users = await findAll();

      expect(users.map((u) => u.userId)).toEqual(['user-a', 'user-b']);
      expect(notionPostMock).toHaveBeenNthCalledWith(1, `/databases/${process.env['NOTION_DB_USERS']}/query`, { page_size: 100 });
      expect(notionPostMock).toHaveBeenNthCalledWith(2, `/databases/${process.env['NOTION_DB_USERS']}/query`, {
        page_size: 100,
        start_cursor: 'cursor-1',
      });
    });

    it('returns an empty array when the database has no users', async () => {
      notionPostMock.mockResolvedValue({ results: [], has_more: false, next_cursor: null });

      const users = await findAll();

      expect(users).toEqual([]);
    });
  });

  describe('create', () => {
    it('posts the correct page payload and maps the response', async () => {
      notionPostMock.mockResolvedValue(
        makePage({
          user_id: { type: 'title', title: [{ plain_text: 'user-bob' }] },
          'Custom Name': { type: 'rich_text', rich_text: [{ plain_text: 'Bob' }] },
          message_counts: { type: 'number', number: 0 },
        }, 'user-page-2'),
      );

      const user = await create('user-bob', 'Bob');

      expect(notionPostMock).toHaveBeenCalledWith('/pages', expect.objectContaining({
        properties: expect.objectContaining({
          user_id: { title: [{ text: { content: 'user-bob' } }] },
          'Custom Name': { rich_text: [{ text: { content: 'Bob' } }] },
          message_counts: { number: 0 },
        }),
      }));
      expect(user.pageId).toBe('user-page-2');
      expect(user.userId).toBe('user-bob');
    });
  });

  describe('update', () => {
    it('only patches the provided fields', async () => {
      notionPatchMock.mockResolvedValue(undefined);

      await update('user-page-1', { customName: 'New Name' });

      expect(notionPatchMock).toHaveBeenCalledWith('/pages/user-page-1', {
        properties: { 'Custom Name': { rich_text: [{ text: { content: 'New Name' } }] } },
      });
    });

    it('patches groups and multiChats when provided', async () => {
      notionPatchMock.mockResolvedValue(undefined);

      await update('user-page-1', { groups: ['A'], multiChats: ['chat-1'] });

      expect(notionPatchMock).toHaveBeenCalledWith('/pages/user-page-1', {
        properties: {
          groups: { multi_select: [{ name: 'A' }] },
          'multi-chat': { multi_select: [{ name: 'chat-1' }] },
        },
      });
    });
  });

  describe('incrementMessageCount', () => {
    it('patches message_counts with incremented value', async () => {
      notionPatchMock.mockResolvedValue(undefined);

      await incrementMessageCount('user-page-1', 4);

      expect(notionPatchMock).toHaveBeenCalledWith('/pages/user-page-1', {
        properties: { message_counts: { number: 5 } },
      });
    });
  });
});
