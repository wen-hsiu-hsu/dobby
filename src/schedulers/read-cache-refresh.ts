import * as usersRepo from '../services/notion/users-repository.js';
import * as peopleRepo from '../services/notion/people-repository.js';
import { clearAllReadCaches } from '../services/notion/read-cache.js';
import { logger } from '../utils/logger.js';
import { runWithContext } from '../utils/request-context.js';

/**
 * 報名／請假進鎖前查詢的快取（ADR 0020）要事先載好整張表：搶報時多數人送的 `+1` 就是他近期
 * 第一則訊息，只靠查詢時順便存的話，最需要命中的時候反而都沒命中。
 * 間隔要比 USERS_CACHE_MAX_AGE_MS／PEOPLE_CACHE_MAX_AGE_MS 短，容許一次重載失敗。
 */
export const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/** 兩張表各自的快取筆數；那張表重載失敗時是 null。 */
export interface RefreshResult {
  users: number | null;
  people: number | null;
}

let running: Promise<RefreshResult> | null = null;

/** 每次重載各自一個 reqId，/logs 上是一張背景作業卡，成功的連續幾張會折疊成一列。 */
export async function refreshReadCaches(): Promise<void> {
  if (running) return; // 上一輪還沒跑完（Notion 偶發慢）就跳過，不要疊兩輪
  await runRefresh(() => runWithContext(() => doRefresh()));
}

/**
 * `/logs` 的「清除快取」按鈕：管理員剛在 Notion 手動改了季租名單、`is_admin` 之類的資料，
 * 不想等 TTL 或下一輪重載。清空全部快取（含季資料）後立刻重載 USERS／People，不能只清不載，
 * 否則到下一輪重載前，搶報時都會沒命中（ADR 0020）。正在跑的那一輪是清除前開始的，結果會被
 * ReadCache.clear 擋掉，所以等它結束後再自己跑一輪。
 */
export async function clearAndReloadReadCaches(): Promise<RefreshResult> {
  // 連按兩次時共用同一次：第二次的 clear 會讓第一次的重載結果被丟掉，第一次的按鈕就會顯示 0 筆。
  if (clearing) return clearing;
  clearing = runWithContext(async () => {
    clearAllReadCaches();
    // 字串要跟 routes/logs.ts 的 SCHEDULE_ORIGIN_MARKERS 對得上
    logger.info('Read cache cleared from /logs');
    await running?.catch(() => undefined);
    return runRefresh(() => doRefresh());
  });
  try {
    return await clearing;
  } finally {
    clearing = null;
  }
}

let clearing: Promise<RefreshResult> | null = null;

async function runRefresh(fn: () => Promise<RefreshResult>): Promise<RefreshResult> {
  const current = fn();
  running = current;
  try {
    return await current;
  } finally {
    if (running === current) running = null;
  }
}

async function doRefresh(): Promise<RefreshResult> {
  // 兩張表各自失敗各自記：一邊失敗時另一邊照樣更新，失敗的那邊沿用舊快取直到過期。
  let users: number | null = null;
  let people: number | null = null;
  try {
    users = await usersRepo.refreshCache();
  } catch (err) {
    logger.warn({ err }, 'Read cache refresh failed: users');
  }
  try {
    people = await peopleRepo.refreshCache();
  } catch (err) {
    logger.warn({ err }, 'Read cache refresh failed: people');
  }
  // 筆數包成物件，不要放成頂層數字欄位：/logs 的 computeBatch 會把兩個以上的頂層數字畫成
  // 比例條，「users 對 people」的比例沒有意義。
  if (users !== null && people !== null) {
    logger.info({ entries: { users, people } }, 'Read cache refresh complete');
  }
  return { users, people };
}

export function startReadCacheRefresh(): void {
  void refreshReadCaches();
  setInterval(() => void refreshReadCaches(), REFRESH_INTERVAL_MS);
  logger.info('Read cache refresh scheduler started');
}
