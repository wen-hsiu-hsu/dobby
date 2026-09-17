import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionPost, notionPatch, notionGet, notionGetAllResults } from '../notion-fetch.js';
import { findByDate, findByPageIds, updateAbsentees } from '../calendar-repository.js';

vi.mock('../notion-fetch.js');

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
  });

  describe('findByPageIds', () => {
    it('resolves each page independently, truncation only triggered for the page that needs it', async () => {
      notionGetMock.mockImplementation(async (path: string) => {
        if (path === '/pages/page-1') {
          return makePage(baseProps({ 請假人: absenteesRelation('prop-a', 25) }), 'page-1');
        }
        if (path === '/pages/page-2') {
          return makePage(baseProps({ 請假人: absenteesRelation('prop-b', 3) }), 'page-2');
        }
        throw new Error(`unexpected path ${path}`);
      });
      const fullAbsentees = Array.from({ length: 26 }, (_, i) => ({ relation: { id: `absentee-${i}` } }));
      notionGetAllResultsMock.mockResolvedValue(fullAbsentees);

      const events = await findByPageIds(['page-1', 'page-2']);

      expect(events).toHaveLength(2);
      expect(events[0]?.absentees).toHaveLength(26);
      expect(events[1]?.absentees).toHaveLength(3);
      expect(notionGetAllResultsMock).toHaveBeenCalledTimes(1);
      expect(notionGetAllResultsMock).toHaveBeenCalledWith('/pages/page-1/properties/prop-a');
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
