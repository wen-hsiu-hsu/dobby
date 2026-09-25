import { env } from '../../config/env.js';
import { notionPost } from './notion-fetch.js';
import { getTitle, getRelation, getNumber, getRichText, getFormulaNumber } from './property-helpers.js';
import { getFullRelation } from './paginated-relation.js';
import { logger } from '../../utils/logger.js';
import { withPurpose } from '../../utils/request-context.js';
import type { SeasonRecord } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

const NUMBER_DEFAULTS = {
  '場地數': 2,
  '零打費用': 170,
  '租借次數 (2hrs)': 0,
} as const;

function getNumberWithDefault(p: PageObjectResponse['properties'], pageId: string, key: keyof typeof NUMBER_DEFAULTS): number {
  const value = getNumber(p, key);
  if (value === null) {
    logger.warn({ seasonPageId: pageId, field: key, fallback: NUMBER_DEFAULTS[key] }, 'Season 欄位缺值，使用預設值');
    return NUMBER_DEFAULTS[key];
  }
  return value;
}

async function pageToRecord(page: PageObjectResponse): Promise<SeasonRecord> {
  const p = page.properties;
  return {
    pageId: page.id,
    name: getTitle(p, '季租時段'),
    members: await getFullRelation(p, '報名人', page.id),
    courts: getNumberWithDefault(p, page.id, '場地數'),
    guestFee: getNumberWithDefault(p, page.id, '零打費用'),
    location: getRichText(p, '地點'),
    weekCounts: getNumberWithDefault(p, page.id, '租借次數 (2hrs)'),
    pricePerPersonForSeason: getFormulaNumber(p, '每人平均場租'),
    pricePerPersonOverride: getNumber(p, '每人平均場租（特殊狀況）'),
    totalPrice: getFormulaNumber(p, '場租總金額'),
    playDatePageIds: getRelation(p, '打球日'), // 唯讀顯示用途，一季正常遠低於 25，不做分頁化
  };
}

export async function findByName(name: string): Promise<SeasonRecord | null> {
  return withPurpose('查詢本季場地/費用資料', async () => {
    const response = await notionPost(`/databases/${env.NOTION_DB_SEASON}/query`, {
      filter: { property: '季租時段', title: { equals: name } },
    }) as any;
    if (response.results.length === 0) return null;
    return await pageToRecord(response.results[0] as PageObjectResponse);
  });
}
