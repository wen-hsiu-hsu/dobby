import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionGet, notionPost, notionPatch } from '../notion-fetch.js';
import { findByUserId, findByPageId, findAll, create, update, incrementMessageCount, refreshCache } from '../users-repository.js';
import { getPurpose } from '../../../utils/request-context.js';

vi.mock('../notion-fetch.js');

const notionGetMock = vi.mocked(notionGet);
const notionPostMock = vi.mocked(notionPost);
const notionPatchMock = vi.mocked(notionPatch);

function makePage(properties: Record<string, unknown>, id = 'user-page-1') {
  return { id, properties };
}

describe('users-repository', () => {
  beforeEach(() => {
    notionGetMock.mockReset();
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

    it('labels the query by why it was looked up (defaults to the message sender)', async () => {
      const purposes: Array<string | undefined> = [];
      notionPostMock.mockImplementation(async () => {
        purposes.push(getPurpose());
        return { results: [] };
      });

      await findByUserId('user-alice');
      await findByUserId('u-bob', 'mention-target');
      await findByUserId('user-new', 'track-user');

      expect(purposes).toEqual([
        '查詢發話者的 bot 使用者帳號',
        '查詢被 @ 的對象的 bot 使用者帳號',
        '追蹤使用者時重查 bot 使用者帳號（發話者或新加入的成員）',
      ]);
    });
  });

  describe('findByPageId', () => {
    it('reads the page itself (not a database query) and maps it to NotionUser', async () => {
      notionGetMock.mockResolvedValue({
        ...makePage({
          user_id: { type: 'title', title: [{ plain_text: 'user-alice' }] },
          message_counts: { type: 'number', number: 7 },
          groups: { type: 'multi_select', multi_select: [{ name: 'A' }] },
        }),
        archived: false,
        in_trash: false,
      });

      const user = await findByPageId('user-page-1');

      expect(notionGetMock).toHaveBeenCalledWith('/pages/user-page-1');
      expect(notionPostMock).not.toHaveBeenCalled();
      expect(user).toMatchObject({ pageId: 'user-page-1', userId: 'user-alice', messageCount: 7, groups: ['A'] });
    });

    it.each([
      ['archived', { archived: true, in_trash: false }],
      ['in the trash', { archived: false, in_trash: true }],
    ])('returns null when the page is %s', async (_label, flags) => {
      notionGetMock.mockResolvedValue({ ...makePage({}), ...flags });

      expect(await findByPageId('user-page-1')).toBeNull();
    });

    it('labels the read for the /logs timeline', async () => {
      let purpose: string | undefined;
      notionGetMock.mockImplementation(async () => {
        purpose = getPurpose();
        return { ...makePage({}), archived: false, in_trash: false };
      });

      await findByPageId('user-page-1');

      expect(purpose).toBe('追蹤發話者時依 page ID 重讀 bot 使用者帳號');
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

      const user = await create('user-bob', 'Bob', 1);

      expect(notionPostMock).toHaveBeenCalledWith('/pages', expect.objectContaining({
        properties: expect.objectContaining({
          user_id: { title: [{ text: { content: 'user-bob' } }] },
          'Custom Name': { rich_text: [{ text: { content: 'Bob' } }] },
          message_counts: { number: 1 },
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

    it('patches the Registered name relation when registeredPersonPageId is provided', async () => {
      notionPatchMock.mockResolvedValue(undefined);

      await update('user-page-1', { registeredPersonPageId: 'person-1' });

      expect(notionPatchMock).toHaveBeenCalledWith('/pages/user-page-1', {
        properties: { 'Registered name': { relation: [{ id: 'person-1' }] } },
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

  // ADR 0020：報名／請假進鎖前查詢的讀取快取
  describe('read cache', () => {
    const userPage = (userId: string, customName: string, id = 'user-page-1') =>
      makePage(
        {
          user_id: { type: 'title', title: [{ plain_text: userId }] },
          'Custom Name': { type: 'rich_text', rich_text: [{ plain_text: customName }] },
        },
        id,
      );

    it('serves repeated actor and mention-target lookups from the cache', async () => {
      notionPostMock.mockResolvedValue({ results: [userPage('user-alice', 'Alice')] });

      await findByUserId('user-alice');
      const again = await findByUserId('user-alice', 'mention-target');

      expect(notionPostMock).toHaveBeenCalledTimes(1);
      expect(again?.customName).toBe('Alice');
    });

    it("always queries Notion for 'track-user' (trackUser computes writes from it, ADR 0017)", async () => {
      notionPostMock.mockResolvedValue({ results: [userPage('user-alice', 'Alice')] });

      await findByUserId('user-alice');
      await findByUserId('user-alice', 'track-user');

      expect(notionPostMock).toHaveBeenCalledTimes(2);
    });

    it('does not cache "not found": the USERS page trackUser creates next is found', async () => {
      notionPostMock
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [userPage('user-new', 'New')] });

      expect(await findByUserId('user-new')).toBeNull();
      expect(await findByUserId('user-new')).not.toBeNull();
    });

    it('drops the cached record on update, so the weekly customName change is seen right away', async () => {
      notionPostMock
        .mockResolvedValueOnce({ results: [userPage('user-alice', 'Old')] })
        .mockResolvedValueOnce({ results: [userPage('user-alice', 'New')] });
      notionPatchMock.mockResolvedValue({});

      await findByUserId('user-alice');
      await update('user-page-1', { customName: 'New' });

      expect((await findByUserId('user-alice'))?.customName).toBe('New');
    });

    it('stores the page returned by the PATCH, without relying on a query right after the write', async () => {
      notionPostMock.mockResolvedValue({ results: [userPage('user-alice', 'Old')] });
      notionPatchMock.mockResolvedValue(userPage('user-alice', 'New'));

      await findByUserId('user-alice');
      await update('user-page-1', { customName: 'New' });
      const after = await findByUserId('user-alice');

      // A query right after the PATCH could still return the old name; the cache must not depend on it.
      expect(after?.customName).toBe('New');
      expect(notionPostMock).toHaveBeenCalledTimes(1);
    });

    it('still drops the cached record when the PATCH fails (it may have landed anyway)', async () => {
      notionPostMock
        .mockResolvedValueOnce({ results: [userPage('user-alice', 'Old')] })
        .mockResolvedValueOnce({ results: [userPage('user-alice', 'New')] });
      notionPatchMock.mockRejectedValue(new Error('Notion 502'));

      await findByUserId('user-alice');
      await expect(update('user-page-1', { customName: 'New' })).rejects.toThrow();

      expect((await findByUserId('user-alice'))?.customName).toBe('New');
    });

    it('replaces the cached record of the same userId on create (e.g. the old USERS page was deleted by hand)', async () => {
      notionPostMock
        .mockResolvedValueOnce({ results: [userPage('user-alice', 'Alice', 'old-page')] })
        .mockResolvedValueOnce(userPage('user-alice', 'Alice', 'new-page'));

      await findByUserId('user-alice');
      await create('user-alice', 'Alice', 1);

      expect((await findByUserId('user-alice'))?.pageId).toBe('new-page');
      expect(notionPostMock).toHaveBeenCalledTimes(2);
    });

    it('keeps the cached record on incrementMessageCount (called for every group message)', async () => {
      notionPostMock.mockResolvedValue({ results: [userPage('user-alice', 'Alice')] });
      notionPatchMock.mockResolvedValue({});

      await findByUserId('user-alice');
      await incrementMessageCount('user-page-1', 3);
      await findByUserId('user-alice');

      expect(notionPostMock).toHaveBeenCalledTimes(1);
    });

    it('refreshCache loads the whole table so a first lookup is already a hit, skipping pages without user_id', async () => {
      notionPostMock.mockResolvedValueOnce({
        results: [userPage('user-alice', 'Alice', 'p-a'), userPage('user-bob', 'Bob', 'p-b'), makePage({}, 'p-empty')],
        has_more: false,
        next_cursor: null,
      });

      const count = await refreshCache();
      const bob = await findByUserId('user-bob');

      expect(count).toBe(2);
      expect(bob?.pageId).toBe('p-b');
      expect(notionPostMock).toHaveBeenCalledTimes(1);
    });

    it('refreshCache labels its Notion call with its own purpose', async () => {
      notionPostMock.mockImplementation(async () => {
        expect(getPurpose()).toBe('重載 bot 使用者帳號快取');
        return { results: [], has_more: false, next_cursor: null };
      });

      await refreshCache();
    });
  });
});
