import { env } from '../../config/env.js';
import { notionPost, notionPatch } from './notion-fetch.js';
import {
  getTitle,
  getRichText,
  getRelation,
  getCheckbox,
  getNumber,
  getMultiSelect,
} from './property-helpers.js';
import { withPurpose } from '../../utils/request-context.js';
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

export async function findByUserId(userId: string): Promise<NotionUser | null> {
  return withPurpose('查詢發話者的 bot 使用者帳號', async () => {
    const response = await notionPost(`/databases/${env.NOTION_DB_USERS}/query`, {
      filter: { property: 'user_id', title: { equals: userId } },
    }) as any;
    if (response.results.length === 0) return null;
    return pageToUser(response.results[0] as PageObjectResponse);
  });
}

export async function findAll(): Promise<NotionUser[]> {
  return withPurpose('查詢全部 bot 使用者帳號', async () => {
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
  });
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

export async function create(userId: string, customName: string): Promise<NotionUser> {
  return withPurpose('建立新的 bot 使用者帳號', async () => {
    const page = await notionPost('/pages', {
      parent: { database_id: env.NOTION_DB_USERS },
      properties: {
        user_id: { title: [{ text: { content: userId } }] },
        'Custom Name': { rich_text: [{ text: { content: customName } }] },
        message_counts: { number: 0 },
      },
    });
    return pageToUser(page as PageObjectResponse);
  });
}

export async function update(
  pageId: string,
  updates: Partial<Pick<NotionUser, 'customName' | 'groups' | 'multiChats'>>,
): Promise<void> {
  return withPurpose('更新 bot 使用者帳號資料', async () => {
    const properties: Record<string, unknown> = {};
    if (updates.customName !== undefined)
      properties['Custom Name'] = { rich_text: [{ text: { content: updates.customName } }] };
    if (updates.groups !== undefined)
      properties['groups'] = { multi_select: updates.groups.map(name => ({ name })) };
    if (updates.multiChats !== undefined)
      properties['multi-chat'] = { multi_select: updates.multiChats.map(name => ({ name })) };
    await notionPatch(`/pages/${pageId}`, { properties });
  });
}

export async function incrementMessageCount(pageId: string, currentCount: number): Promise<void> {
  return withPurpose('累加使用者發言次數', async () => {
    await notionPatch(`/pages/${pageId}`, {
      properties: { message_counts: { number: currentCount + 1 } },
    });
  });
}
