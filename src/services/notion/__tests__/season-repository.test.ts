import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionPost, notionGetAllResults } from '../notion-fetch.js';
import { findByName } from '../season-repository.js';

vi.mock('../notion-fetch.js');

const notionPostMock = vi.mocked(notionPost);
const notionGetAllResultsMock = vi.mocked(notionGetAllResults);

function makePage(properties: Record<string, unknown>, id = 'season-page-1') {
  return { id, properties };
}

function membersRelation(propertyId: string, count: number) {
  return {
    id: propertyId,
    type: 'relation',
    relation: Array.from({ length: count }, (_, i) => ({ id: `member-${i}` })),
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    季租時段: { type: 'title', title: [{ plain_text: '2025-Q1' }] },
    場地數: { type: 'number', number: 2 },
    零打費用: { type: 'number', number: 170 },
    地點: { type: 'rich_text', rich_text: [] },
    '租借次數 (2hrs)': { type: 'number', number: 10 },
    每人平均場租: { type: 'formula', formula: { type: 'number', number: 500 } },
    '每人平均場租（特殊狀況）': { type: 'number', number: null },
    場租總金額: { type: 'formula', formula: { type: 'number', number: 5000 } },
    打球日: { type: 'relation', relation: [] },
    ...overrides,
  };
}

describe('season-repository', () => {
  beforeEach(() => {
    notionPostMock.mockReset();
    notionGetAllResultsMock.mockReset();
  });

  describe('findByName', () => {
    it('fetches full member list via paginated endpoint when relation is exactly 25 (truncation boundary)', async () => {
      notionPostMock.mockResolvedValue({
        results: [
          makePage(
            baseProps({ 報名人: membersRelation('members-prop-id', 25) }),
            'season-page-1',
          ),
        ],
      });
      const fullMembers = Array.from({ length: 30 }, (_, i) => ({ relation: { id: `member-${i}` } }));
      notionGetAllResultsMock.mockResolvedValue(fullMembers);

      const season = await findByName('2025-Q1');

      expect(season?.members).toHaveLength(30);
      expect(notionGetAllResultsMock).toHaveBeenCalledWith(
        '/pages/season-page-1/properties/members-prop-id',
      );
    });

    it('does not call the paginated endpoint when the relation is well under the limit', async () => {
      notionPostMock.mockResolvedValue({
        results: [
          makePage(
            baseProps({ 報名人: membersRelation('members-prop-id', 5) }),
            'season-page-1',
          ),
        ],
      });

      const season = await findByName('2025-Q1');

      expect(season?.members).toHaveLength(5);
      expect(notionGetAllResultsMock).not.toHaveBeenCalled();
    });

    it('returns null when no results', async () => {
      notionPostMock.mockResolvedValue({ results: [] });

      const season = await findByName('missing');

      expect(season).toBeNull();
    });

    it('falls back to defaults when 場地數/零打費用/租借次數 are missing from Notion', async () => {
      const props = baseProps();
      // @ts-expect-error simulate a missing property (e.g. field renamed/deleted in Notion)
      delete props['場地數'];
      // @ts-expect-error same as above
      delete props['零打費用'];
      // @ts-expect-error same as above
      delete props['租借次數 (2hrs)'];
      notionPostMock.mockResolvedValue({
        results: [makePage(props, 'season-page-1')],
      });

      const season = await findByName('2025-Q1');

      expect(season?.courts).toBe(2);
      expect(season?.guestFee).toBe(170);
      expect(season?.weekCounts).toBe(0);
    });
  });
});
