import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionGet, notionPost } from '../notion-fetch.js';
import { logger } from '../../../utils/logger.js';
import { getPurpose } from '../../../utils/request-context.js';
import { create, findAbsenteesOfEvent, findMembersOfSeasons } from '../people-repository.js';

vi.mock('../notion-fetch.js');
vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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
    vi.mocked(logger.warn).mockClear();
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

  describe('findAbsenteesOfEvent', () => {
    const queryPath = `/databases/${process.env['NOTION_DB_PEOPLE']}/query`;

    it('makes no Notion call when nobody is on leave', async () => {
      expect(await findAbsenteesOfEvent({ pageId: 'evt-1', absentees: [] })).toEqual([]);
      expect(notionPostMock).not.toHaveBeenCalled();
      expect(notionGetMock).not.toHaveBeenCalled();
    });

    it('GETs the single absentee directly instead of querying (one call either way)', async () => {
      notionGetMock.mockResolvedValue(personPage('p1', 'Alice'));

      const people = await findAbsenteesOfEvent({ pageId: 'evt-1', absentees: ['p1'] });

      expect(notionGetMock).toHaveBeenCalledWith('/pages/p1');
      expect(notionPostMock).not.toHaveBeenCalled();
      expect(people.map((p) => p.name)).toEqual(['Alice']);
    });

    it('queries the reverse 📅 行事曆 relation once for 2+ absentees, in 請假人 order', async () => {
      notionPostMock.mockResolvedValue({
        results: [personPage('p2', 'Bob'), personPage('p1', 'Alice')],
        has_more: false,
        next_cursor: null,
      });

      const people = await findAbsenteesOfEvent({ pageId: 'evt-1', absentees: ['p1', 'p2'] });

      expect(notionPostMock).toHaveBeenCalledTimes(1);
      expect(notionPostMock).toHaveBeenCalledWith(queryPath, {
        filter: { property: '📅 行事曆', relation: { contains: 'evt-1' } },
        page_size: 100,
      });
      expect(notionGetMock).not.toHaveBeenCalled();
      expect(people.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    });

    it('follows the given list, not the query, if the query lags behind a just-written 請假人', async () => {
      // query 還沒反映：剛請假的 p3 沒回來，剛銷假的 p9 還在
      notionPostMock.mockResolvedValue({
        results: [personPage('p1', 'Alice'), personPage('p9', 'Zed')],
        has_more: false,
        next_cursor: null,
      });
      notionGetMock.mockResolvedValue(personPage('p3', 'Carol'));

      const people = await findAbsenteesOfEvent({ pageId: 'evt-1', absentees: ['p1', 'p3'] });

      expect(notionGetMock).toHaveBeenCalledWith('/pages/p3');
      expect(people.map((p) => p.name)).toEqual(['Alice', 'Carol']);
    });

    it('falls back to per-page GETs when the query itself fails (e.g. 📅 行事曆 renamed), instead of throwing', async () => {
      const purposes: Array<string | undefined> = [];
      notionPostMock.mockImplementation(async () => {
        purposes.push(getPurpose());
        throw new Error('Notion API error: HTTP 400 validation_error');
      });
      notionGetMock.mockImplementation(async (path: string) => {
        purposes.push(getPurpose());
        return path === '/pages/p1' ? personPage('p1', 'Alice') : personPage('p2', 'Bob');
      });
      vi.useFakeTimers();
      try {
        const pending = findAbsenteesOfEvent({ pageId: 'evt-1', absentees: ['p1', 'p2'] });
        await vi.advanceTimersByTimeAsync(1000);
        const people = await pending;

        expect(people.map((p) => p.name)).toEqual(['Alice', 'Bob']);
        expect(notionGetMock).toHaveBeenCalledTimes(2);
        // 退回的逐筆 GET 不能被 findByPageIds 的 purpose 蓋掉，/logs 上整段都要是同一個目的
        expect(purposes).toEqual(['查詢活動請假人姓名', '查詢活動請假人姓名', '查詢活動請假人姓名']);
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ eventPageId: 'evt-1' }),
          'Absentee reverse-relation lookup failed; falling back to per-page GETs',
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
