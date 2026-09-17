import { env } from '../../config/env.js';
import { notionPost } from './notion-fetch.js';
import { getTitle, getRelation, getNumber, getRichText, getFormulaNumber } from './property-helpers.js';
import { getFullRelation } from './paginated-relation.js';
import type { SeasonRecord } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

async function pageToRecord(page: PageObjectResponse): Promise<SeasonRecord> {
  const p = page.properties;
  return {
    pageId: page.id,
    name: getTitle(p, '季租時段'),
    members: await getFullRelation(p, '報名人', page.id),
    courts: getNumber(p, '場地數') ?? 2,
    guestFee: getNumber(p, '零打費用') ?? 170,
    location: getRichText(p, '地點'),
    weekCounts: getNumber(p, '租借次數 (2hrs)') ?? 0,
    pricePerPersonForSeason: getFormulaNumber(p, '每人平均場租'),
    pricePerPersonOverride: getNumber(p, '每人平均場租（特殊狀況）'),
    totalPrice: getFormulaNumber(p, '場租總金額'),
    playDatePageIds: getRelation(p, '打球日'), // 唯讀顯示用途，一季正常遠低於 25，不做分頁化
  };
}

export async function findByName(name: string): Promise<SeasonRecord | null> {
  const response = await notionPost(`/databases/${env.NOTION_DB_SEASON}/query`, {
    filter: { property: '季租時段', title: { equals: name } },
  }) as any;
  if (response.results.length === 0) return null;
  return await pageToRecord(response.results[0] as PageObjectResponse);
}

export async function findAll(): Promise<SeasonRecord[]> {
  const response = await notionPost(`/databases/${env.NOTION_DB_SEASON}/query`, {}) as any;
  return Promise.all(response.results.map((r: unknown) => pageToRecord(r as PageObjectResponse)));
}
