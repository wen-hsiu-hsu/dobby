import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionPost, notionPatch, notionGet, notionGetAllResults } from '../notion-fetch.js';
import { findByDate, findPlayDatesOfSeason, updateAbsentees } from '../calendar-repository.js';
import { logger } from '../../../utils/logger.js';

vi.mock('../notion-fetch.js');
vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const notionPostMock = vi.mocked(notionPost);
const notionPatchMock = vi.mocked(notionPatch);
const notionGetMock = vi.mocked(notionGet);
const notionGetAllResultsMock = vi.mocked(notionGetAllResults);

function makePage(properties: Record<string, unknown>, id = 'calendar-page-1') {
  return { id, properties };
}

function absenteesRelation(propertyId: string, count: number) {
  return {
    id: propertyId,
    type: 'relation',
    relation: Array.from({ length: count }, (_, i) => ({ id: `absentee-${i}` })),
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    時間: { type: 'date', date: { start: '2026-05-09', end: null, time_zone: null } },
    零打: { type: 'multi_select', multi_select: [] },
    類型: { type: 'select', select: { id: 'x', name: '正常', color: 'default' } },
    ...overrides,
  };
}

describe('calendar-repository', () => {
  beforeEach(() => {
    notionPostMock.mockReset();
    notionPatchMock.mockReset();
    notionGetMock.mockReset();
    notionGetAllResultsMock.mockReset();
    vi.mocked(logger.warn).mockClear();
  });

  describe('findByDate', () => {
    it('fetches full absentee list via paginated endpoint when relation is exactly 25 (truncation boundary)', async () => {
      notionPostMock.mockResolvedValue({
        results: [
          makePage(
            baseProps({ 請假人: absenteesRelation('absentees-prop-id', 25) }),
            'calendar-page-1',
          ),
        ],
      });
      const fullAbsentees = Array.from({ length: 28 }, (_, i) => ({ relation: { id: `absentee-${i}` } }));
      notionGetAllResultsMock.mockResolvedValue(fullAbsentees);

      const event = await findByDate('2026-05-09');

      expect(event?.absentees).toHaveLength(28);
      expect(notionGetAllResultsMock).toHaveBeenCalledWith(
        '/pages/calendar-page-1/properties/absentees-prop-id',
      );
    });

    it('does not call the paginated endpoint when the relation is well under the limit', async () => {
      notionPostMock.mockResolvedValue({
        results: [
          makePage(
            baseProps({ 請假人: absenteesRelation('absentees-prop-id', 2) }),
            'calendar-page-1',
          ),
        ],
      });

      const event = await findByDate('2026-05-09');

      expect(event?.absentees).toHaveLength(2);
      expect(notionGetAllResultsMock).not.toHaveBeenCalled();
    });

    it('returns null when no results', async () => {
      notionPostMock.mockResolvedValue({ results: [] });

      const event = await findByDate('2026-01-01');

      expect(event).toBeNull();
    });

    it('reads 場地數 as the week-specific court count', async () => {
      notionPostMock.mockResolvedValue({
        results: [makePage(baseProps({ 場地數: { type: 'number', number: 1 } }))],
      });

      const event = await findByDate('2026-05-09');

      expect(event?.courts).toBe(1);
    });

    it('returns courts=null when 場地數 is empty or the property is missing', async () => {
      notionPostMock.mockResolvedValueOnce({
        results: [makePage(baseProps({ 場地數: { type: 'number', number: null } }))],
      });
      notionPostMock.mockResolvedValueOnce({ results: [makePage(baseProps())] });

      expect((await findByDate('2026-05-09'))?.courts).toBeNull();
      expect((await findByDate('2026-05-09'))?.courts).toBeNull();
    });

    it.each([0, -1, 1.5])('treats non-positive-integer 場地數 (%s) as unset and warns', async (value) => {
      notionPostMock.mockResolvedValue({
        results: [makePage(baseProps({ 場地數: { type: 'number', number: value } }))],
      });

      const event = await findByDate('2026-05-09');

      expect(event?.courts).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ calendarPageId: 'calendar-page-1', field: '場地數', value }),
        expect.any(String),
      );
    });

    it('does not warn when 場地數 is simply left empty', async () => {
      notionPostMock.mockResolvedValue({
        results: [makePage(baseProps({ 場地數: { type: 'number', number: null } }))],
      });

      await findByDate('2026-05-09');

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('findPlayDatesOfSeason', () => {
    const season = { pageId: 'season-1', playDatePageIds: ['page-2', 'page-1'] };

    it('queries the calendar DB by the reverse 季度 relation once, instead of a GET per page', async () => {
      notionPostMock.mockResolvedValue({
        results: [makePage(baseProps(), 'page-1'), makePage(baseProps(), 'page-2')],
        has_more: false,
        next_cursor: null,
      });

      const events = await findPlayDatesOfSeason(season);

      expect(notionPostMock).toHaveBeenCalledTimes(1);
      expect(notionPostMock).toHaveBeenCalledWith(`/databases/${process.env['NOTION_DB_CALENDAR']}/query`, {
        filter: { property: '季度', relation: { contains: 'season-1' } },
        page_size: 100,
      });
      expect(notionGetMock).not.toHaveBeenCalled();
      // 照 playDatePageIds 的順序，不是 query 回來的順序
      expect(events.map((e) => e.pageId)).toEqual(['page-2', 'page-1']);
    });

    it('still completes a truncated 請假人 relation for the page that needs it', async () => {
      notionPostMock.mockResolvedValue({
        results: [
          makePage(baseProps({ 請假人: absenteesRelation('prop-a', 25) }), 'page-1'),
          makePage(baseProps({ 請假人: absenteesRelation('prop-b', 3) }), 'page-2'),
        ],
        has_more: false,
        next_cursor: null,
      });
      notionGetAllResultsMock.mockResolvedValue(
        Array.from({ length: 26 }, (_, i) => ({ relation: { id: `absentee-${i}` } })),
      );

      const [page2, page1] = await findPlayDatesOfSeason(season);

      expect(page1?.absentees).toHaveLength(26);
      expect(page2?.absentees).toHaveLength(3);
      expect(notionGetAllResultsMock).toHaveBeenCalledTimes(1);
      expect(notionGetAllResultsMock).toHaveBeenCalledWith('/pages/page-1/properties/prop-a');
    });

    it('falls back to a GET for a play date the query did not return', async () => {
      notionPostMock.mockResolvedValue({ results: [makePage(baseProps(), 'page-1')], has_more: false, next_cursor: null });
      notionGetMock.mockResolvedValue(makePage(baseProps(), 'page-2'));

      const events = await findPlayDatesOfSeason(season);

      expect(notionGetMock).toHaveBeenCalledWith('/pages/page-2');
      expect(events.map((e) => e.pageId)).toEqual(['page-2', 'page-1']);
    });

    it('makes no Notion call when the season has no play dates', async () => {
      expect(await findPlayDatesOfSeason({ pageId: 'season-1', playDatePageIds: [] })).toEqual([]);
      expect(notionPostMock).not.toHaveBeenCalled();
    });
  });

  describe('updateAbsentees', () => {
    it('patches the relation property with the full given list (pass-through)', async () => {
      notionPatchMock.mockResolvedValue(undefined);

      await updateAbsentees('calendar-page-1', ['p1', 'p2', 'p3']);

      expect(notionPatchMock).toHaveBeenCalledWith('/pages/calendar-page-1', {
        properties: { 請假人: { relation: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] } },
      });
    });
  });
});
