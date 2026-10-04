import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionGet, notionPost } from '../notion-fetch.js';
import { create, findMembersOfSeasons } from '../people-repository.js';

vi.mock('../notion-fetch.js');

const notionPostMock = vi.mocked(notionPost);
const notionGetMock = vi.mocked(notionGet);

function personPage(id: string, name: string) {
  return {
    id,
    properties: {
      Name: { type: 'title', title: [{ plain_text: name }] },
      結清: { type: 'formula', formula: { type: 'boolean', boolean: true } },
    },
  };
}

describe('people-repository', () => {
  beforeEach(() => {
    notionPostMock.mockReset();
    notionGetMock.mockReset();
  });

  describe('create', () => {
    it('creates a page with only the Name title in the people database and maps the response', async () => {
      notionPostMock.mockResolvedValue({
        id: 'person-page-1',
        properties: {
          Name: { type: 'title', title: [{ plain_text: 'Alice' }] },
          結清: { type: 'formula', formula: { type: 'boolean', boolean: true } },
        },
      });

      const person = await create('Alice');

      expect(notionPostMock).toHaveBeenCalledWith('/pages', {
        parent: { database_id: process.env['NOTION_DB_PEOPLE'] },
        properties: { Name: { title: [{ text: { content: 'Alice' } }] } },
      });
      expect(person).toEqual({ pageId: 'person-page-1', name: 'Alice', hasPaid: true });
    });
  });

  describe('findMembersOfSeasons', () => {
    const queryPath = `/databases/${process.env['NOTION_DB_PEOPLE']}/query`;

    it('queries the reverse 報名季度 relation once and returns members in the season relation order', async () => {
      notionPostMock.mockResolvedValue({
        results: [personPage('p2', 'Bob'), personPage('p1', 'Alice')],
        has_more: false,
        next_cursor: null,
      });

      const people = await findMembersOfSeasons([{ pageId: 'season-1', members: ['p1', 'p2'] }]);

      expect(notionPostMock).toHaveBeenCalledTimes(1);
      expect(notionPostMock).toHaveBeenCalledWith(queryPath, {
        filter: { property: '報名季度', relation: { contains: 'season-1' } },
        page_size: 100,
      });
      expect(notionGetMock).not.toHaveBeenCalled();
      expect(people.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    });

    it('ORs several seasons into one query and dedupes members, earlier seasons first', async () => {
      notionPostMock.mockResolvedValue({
        results: [personPage('p3', 'Carol'), personPage('p2', 'Bob'), personPage('p1', 'Alice')],
        has_more: false,
        next_cursor: null,
      });

      const people = await findMembersOfSeasons([
        { pageId: 'season-new', members: ['p2', 'p3'] },
        { pageId: 'season-old', members: ['p1', 'p2'] },
      ]);

      expect(notionPostMock).toHaveBeenCalledWith(queryPath, {
        filter: {
          or: [
            { property: '報名季度', relation: { contains: 'season-new' } },
            { property: '報名季度', relation: { contains: 'season-old' } },
          ],
        },
        page_size: 100,
      });
      expect(people.map((p) => p.pageId)).toEqual(['p2', 'p3', 'p1']);
    });

    it('falls back to a GET for a member the query did not return', async () => {
      notionPostMock.mockResolvedValue({ results: [personPage('p1', 'Alice')], has_more: false, next_cursor: null });
      notionGetMock.mockResolvedValue(personPage('p2', 'Bob'));

      const people = await findMembersOfSeasons([{ pageId: 'season-1', members: ['p1', 'p2'] }]);

      expect(notionGetMock).toHaveBeenCalledWith('/pages/p2');
      expect(people.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    });

    it('makes no Notion call when every season is empty', async () => {
      expect(await findMembersOfSeasons([{ pageId: 'season-1', members: [] }])).toEqual([]);
      expect(notionPostMock).not.toHaveBeenCalled();
    });
  });
});
