import { env } from '../../config/env.js';
import { notionGet, notionPost, notionPatch } from './notion-fetch.js';
import {
  getTitle,
  getRichText,
  getRelation,
  getCheckbox,
  getNumber,
  getMultiSelect,
} from './property-helpers.js';
import { withPurpose } from '../../utils/request-context.js';
import { ReadCache } from './read-cache.js';
import type { NotionUser } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

function pageToUser(page: PageObjectResponse): NotionUser {
  const p = page.properties;
  return {
    pageId: page.id,
    userId: getTitle(p, 'user_id'),
    customName: getRichText(p, 'Custom Name'),
    registeredPersonPageId: getRelation(p, 'Registered name')[0] ?? '',
    isAdmin: getCheckbox(p, 'is_admin'),
    messageCount: getNumber(p, 'message_counts') ?? 0,
    groups: getMultiSelect(p, 'groups'),
    multiChats: getMultiSelect(p, 'multi-chat'),
  };
}

/**
 * Why this lookup happens, so the /logs timeline labels it correctly. Not a free-form
 * string: withPurpose is innermost-wins (request-context.ts), so a caller can't relabel
 * the query by wrapping this call in its own withPurpose — the label has to be chosen here.
 */
export type UserLookupReason = 'actor' | 'mention-target' | 'track-user';

const USER_LOOKUP_PURPOSES: Record<UserLookupReason, string> = {
  actor: '查詢發話者的 bot 使用者帳號',
  'mention-target': '查詢被 @ 的對象的 bot 使用者帳號',
  // trackUser (message sender) and trackJoinedMember (a newly joined member) share this path.
  'track-user': '追蹤使用者時重查 bot 使用者帳號（發話者或新加入的成員）',
};

/** 定時整表重載的間隔是 15 分鐘（schedulers/read-cache-refresh.ts），容許一次重載失敗。 */
export const USERS_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

// key 是 userId；寫入以 pageId 進行，所以失效用 pageId 比對。
const cache = new ReadCache<NotionUser>('users', USERS_CACHE_MAX_AGE_MS, (u) => u.pageId);

/**
 * 'actor'／'mention-target' 走快取（ADR 0020）：快取記錄的 `messageCount`／`groups`／`multiChats`
 * 可能是舊的，不能拿來算任何寫入。'track-user' 是 trackUser 鎖內的重讀（ADR 0017），
 * 會用讀到的值算出新值寫回，所以一律直接查 Notion。
 */
export async function findByUserId(userId: string, reason: UserLookupReason = 'actor'): Promise<NotionUser | null> {
  if (reason === 'track-user') return queryByUserId(userId, reason);
  return cache.getOrLoad(userId, () => queryByUserId(userId, reason));
}

async function queryByUserId(userId: string, reason: UserLookupReason): Promise<NotionUser | null> {
  return withPurpose(USER_LOOKUP_PURPOSES[reason], async () => {
    const response = await notionPost(`/databases/${env.NOTION_DB_USERS}/query`, {
      filter: { property: 'user_id', title: { equals: userId } },
    }) as any;
    if (response.results.length === 0) return null;
    return pageToUser(response.results[0] as PageObjectResponse);
  });
}

/** 定時排程用整張 USERS 表換掉快取，回傳快取筆數。 */
export async function refreshCache(): Promise<number> {
  return withPurpose('重載 bot 使用者帳號快取', () =>
    cache.replaceAll(async () =>
      (await queryAll()).filter((u) => u.userId).map((u): [string, NotionUser] => [u.userId, u]),
    ),
  );
}

/**
 * trackUser's in-lock re-read when the page is already known. Reads the page itself rather
 * than querying the database: query freshness right after a PATCH is unverified
 * (docs/architecture.md only measured it for newly created pages), while this read has to
 * see the previous call's write. A trashed page returns null, matching what a query would.
 * The purpose label is trackUser's; a new caller needs a `reason` parameter like findByUserId's.
 */
export async function findByPageId(pageId: string): Promise<NotionUser | null> {
  return withPurpose('追蹤發話者時依 page ID 重讀 bot 使用者帳號', async () => {
    const page = await notionGet(`/pages/${pageId}`) as PageObjectResponse;
    if (page.archived || page.in_trash) return null;
    return pageToUser(page);
  });
}

export async function findAll(): Promise<NotionUser[]> {
  return withPurpose('查詢全部 bot 使用者帳號', queryAll);
}

async function queryAll(): Promise<NotionUser[]> {
  const users: NotionUser[] = [];
  let cursor: string | undefined;
  let first = true;
  do {
    if (!first) await new Promise((r) => setTimeout(r, 400)); // Notion rate limit
    first = false;
    const response = await notionPost(`/databases/${env.NOTION_DB_USERS}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    }) as { results: PageObjectResponse[]; has_more: boolean; next_cursor: string | null };
    users.push(...response.results.map(pageToUser));
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return users;
}

export async function findAdmin(): Promise<NotionUser | null> {
  return withPurpose('查詢管理員帳號', async () => {
    const response = await notionPost(`/databases/${env.NOTION_DB_USERS}/query`, {
      filter: { property: 'is_admin', checkbox: { equals: true } },
    }) as any;
    if (response.results.length === 0) return null;
    return pageToUser(response.results[0] as PageObjectResponse);
  });
}

export async function findByCustomName(name: string): Promise<NotionUser | null> {
  return withPurpose('依暱稱查詢 bot 使用者帳號', async () => {
    const response = await notionPost(`/databases/${env.NOTION_DB_USERS}/query`, {
      filter: { property: 'Custom Name', rich_text: { equals: name } },
    }) as any;
    if (response.results.length === 0) return null;
    return pageToUser(response.results[0] as PageObjectResponse);
  });
}

export async function create(userId: string, customName: string, messageCount: number): Promise<NotionUser> {
  return withPurpose('建立新的 bot 使用者帳號', async () => {
    const page = await notionPost('/pages', {
      parent: { database_id: env.NOTION_DB_USERS },
      properties: {
        user_id: { title: [{ text: { content: userId } }] },
        'Custom Name': { rich_text: [{ text: { content: customName } }] },
        message_counts: { number: messageCount },
      },
    });
    // 同一個 userId 的舊記錄（例如管理員手動刪掉舊頁）會被新頁取代，不會留到下次重載。
    cacheWrittenPage(page);
    return pageToUser(page as PageObjectResponse);
  });
}

export async function update(
  pageId: string,
  updates: Partial<Pick<NotionUser, 'customName' | 'groups' | 'multiChats' | 'registeredPersonPageId'>>,
): Promise<void> {
  return withPurpose('更新 bot 使用者帳號資料', async () => {
    const properties: Record<string, unknown> = {};
    if (updates.customName !== undefined)
      properties['Custom Name'] = { rich_text: [{ text: { content: updates.customName } }] };
    if (updates.groups !== undefined)
      properties['groups'] = { multi_select: updates.groups.map(name => ({ name })) };
    if (updates.multiChats !== undefined)
      properties['multi-chat'] = { multi_select: updates.multiChats.map(name => ({ name })) };
    if (updates.registeredPersonPageId !== undefined)
      properties['Registered name'] = { relation: [{ id: updates.registeredPersonPageId }] };
    // 寫入前後都失效，成功後用 PATCH 回傳的頁面存回快取，見 read-cache.ts。
    // display-name-update 改 customName、trackUser 寫 Registered name 都走這裡，不用另外清快取。
    cache.invalidate(pageId);
    let page: unknown;
    try {
      page = await notionPatch(`/pages/${pageId}`, { properties });
    } finally {
      cache.invalidate(pageId);
    }
    cacheWrittenPage(page);
  });
}

/** 寫入 API 回傳的是整個頁面；格式不對（例如測試 mock 回 `{}`）就不存，下次查詢再補。 */
function cacheWrittenPage(page: unknown): void {
  if (!page || typeof page !== 'object' || !('properties' in page)) return;
  const user = pageToUser(page as PageObjectResponse);
  if (user.userId) cache.put(user.userId, user);
}

/**
 * 不讓快取失效：每則群組訊息都會呼叫，失效的話快取幾乎不會命中。快取裡的 `messageCount`
 * 本來就不可信，trackUser 一律在鎖內重讀（ADR 0017）。
 */
export async function incrementMessageCount(pageId: string, currentCount: number): Promise<void> {
  return withPurpose('累加使用者發言次數', async () => {
    await notionPatch(`/pages/${pageId}`, {
      properties: { message_counts: { number: currentCount + 1 } },
    });
  });
}
