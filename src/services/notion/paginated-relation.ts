import { notionGetAllResults } from './notion-fetch.js';
import { logger } from '../../utils/logger.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

type Properties = PageObjectResponse['properties'];

// Notion 對 page/database-query 回傳的 relation（及 people/rollup）屬性一律只給前 25 筆
export const RELATION_TRUNCATION_LIMIT = 25;

export async function getFullRelation(
  properties: Properties,
  key: string,
  pageId: string,
): Promise<string[]> {
  const prop = properties[key];
  if (!prop || prop.type !== 'relation') return [];
  const ids = prop.relation.map((r) => r.id);

  if (ids.length !== RELATION_TRUNCATION_LIMIT) return ids; // 不到 25，保證完整，不多打 API

  // 剛好卡在 25 筆，可能是被截斷，用分頁端點確認/補齊真正完整清單
  logger.info(
    { pageId, propertyId: prop.id, key },
    'Relation property at 25-item truncation boundary, fetching full list via paginated endpoint',
  );
  const results = await notionGetAllResults(`/pages/${pageId}/properties/${prop.id}`);
  return (results as Array<{ relation: { id: string } }>).map((r) => r.relation.id);
}
