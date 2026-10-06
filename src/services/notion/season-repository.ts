import { env } from '../../config/env.js';
import { notionPost } from './notion-fetch.js';
import { getTitle, getRelation, getNumber, getRichText, getFormulaNumber } from './property-helpers.js';
import { getFullRelation } from './paginated-relation.js';
import { logger } from '../../utils/logger.js';
import { withPurpose } from '../../utils/request-context.js';
import { ReadCache } from './read-cache.js';
import type { SeasonRecord } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

const NUMBER_DEFAULTS = {
  '場地數': 2,
  '零打費用': 170,
  '租借次數 (2hrs)': 0,
  '每場/小時 定價': 450,
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
    courtPricePerHour: getNumberWithDefault(p, page.id, '每場/小時 定價'),
    // 這三個金額由管理員手動填、不給預設值：缺值時由用到的指令自己決定要報錯還是顯示提示
    actualFeePerPerson: getNumber(p, '每人實際收費'),
    refundPerPerson: getNumber(p, '季打退費'),
    balance: getNumber(p, '結餘'),
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

/**
 * 季資料 TTL 是 60 秒，比 USERS／People 短很多，因為它直接決定名額：鎖內的 getEventOccupancy
 * 用 handler 傳進來的這份季資料算 `calculateTotalSlots`，不會重讀（event-occupancy.ts）。
 * 管理員改了季租名單或季預設場地數後，60 秒內的報名可能用舊值算名額。每週的場地數覆寫在
 * 行事曆的 `場地數`，鎖內本來就會重讀，不受影響。為什麼不改成鎖內重讀，見 ADR 0020。
 */
export const SEASON_CACHE_MAX_AGE_MS = 60 * 1000;

// bot 不會寫入季資料，versionKey 用不到失效，給季名就好。
const cache = new ReadCache<SeasonRecord>('season', SEASON_CACHE_MAX_AGE_MS, (s) => s.name);

/**
 * 只給報名／請假進鎖前用（ADR 0020）。其他指令（season 公告、付款、名單）照樣呼叫
 * findByName：管理員改完費用馬上查，要看到新值。
 */
// purpose-exempt: 快取未命中時呼叫 findByName，目的在那裡標註
export async function findByNameCached(name: string): Promise<SeasonRecord | null> {
  return cache.getOrLoad(name, () => findByName(name));
}
