import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionGetAllResults } from '../notion-fetch.js';
import { getFullRelation, RELATION_TRUNCATION_LIMIT } from '../paginated-relation.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

vi.mock('../notion-fetch.js');

const notionGetAllResultsMock = vi.mocked(notionGetAllResults);

type Properties = PageObjectResponse['properties'];

function relationProps(propertyId: string, count: number): Properties {
  return {
    Rel: {
      id: propertyId,
      type: 'relation',
      relation: Array.from({ length: count }, (_, i) => ({ id: `rel-${i}` })),
    },
  } as unknown as Properties;
}

describe('getFullRelation', () => {
  beforeEach(() => {
    notionGetAllResultsMock.mockReset();
  });

  it('returns the relation directly when under the truncation limit, without calling notionGetAllResults', async () => {
    const props = relationProps('prop-1', 3);

    const result = await getFullRelation(props, 'Rel', 'page-1');

    expect(result).toEqual(['rel-0', 'rel-1', 'rel-2']);
    expect(notionGetAllResultsMock).not.toHaveBeenCalled();
  });

  it('fetches full list via paginated endpoint when exactly at the truncation limit and more exist', async () => {
    const props = relationProps('prop-1', RELATION_TRUNCATION_LIMIT);
    const fullResults = Array.from({ length: 30 }, (_, i) => ({ relation: { id: `full-${i}` } }));
    notionGetAllResultsMock.mockResolvedValue(fullResults);

    const result = await getFullRelation(props, 'Rel', 'page-1');

    expect(result).toHaveLength(30);
    expect(result).toEqual(fullResults.map((r) => r.relation.id));
    expect(notionGetAllResultsMock).toHaveBeenCalledWith('/pages/page-1/properties/prop-1');
  });

  it('returns exactly 25 when relation truly has only 25 members', async () => {
    const props = relationProps('prop-1', RELATION_TRUNCATION_LIMIT);
    const fullResults = Array.from({ length: RELATION_TRUNCATION_LIMIT }, (_, i) => ({
      relation: { id: `rel-${i}` },
    }));
    notionGetAllResultsMock.mockResolvedValue(fullResults);

    const result = await getFullRelation(props, 'Rel', 'page-1');

    expect(result).toHaveLength(RELATION_TRUNCATION_LIMIT);
    expect(result).toEqual(Array.from({ length: RELATION_TRUNCATION_LIMIT }, (_, i) => `rel-${i}`));
  });

  it('returns empty array when property is missing', async () => {
    const result = await getFullRelation({} as Properties, 'Missing', 'page-1');

    expect(result).toEqual([]);
    expect(notionGetAllResultsMock).not.toHaveBeenCalled();
  });

  it('returns empty array when property type is not relation', async () => {
    const props = {
      Rel: { id: 'prop-1', type: 'number', number: 42 },
    } as unknown as Properties;

    const result = await getFullRelation(props, 'Rel', 'page-1');

    expect(result).toEqual([]);
    expect(notionGetAllResultsMock).not.toHaveBeenCalled();
  });
});
