import { env } from '../../config/env.js';
import { notionPost, notionPatch } from './notion-fetch.js';
import type { NotionUser } from '../../types/notion-models.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageToUser(page: any): NotionUser {
  const p = page.properties;
  return {
    pageId: page.id,
    userId: p['user_id']?.title?.[0]?.plain_text ?? '',
    customName: p['Custom Name']?.rich_text?.[0]?.plain_text ?? '',
    isAdmin: p['is_admin']?.checkbox ?? false,
    messageCount: p['message_counts']?.number ?? 0,
    groups: p['groups']?.multi_select?.map((s: any) => s.name) ?? [],
    multiChats: p['multi-chat']?.multi_select?.map((s: any) => s.name) ?? [],
  };
}

export async function findByUserId(userId: string): Promise<NotionUser | null> {
  const response = await notionPost(`/databases/${env.NOTION_DB_USERS}/query`, {
    filter: { property: 'user_id', title: { equals: userId } },
  }) as any;
  if (response.results.length === 0) return null;
  return pageToUser(response.results[0]);
}

export async function findAdmin(): Promise<NotionUser | null> {
  const response = await notionPost(`/databases/${env.NOTION_DB_USERS}/query`, {
    filter: { property: 'is_admin', checkbox: { equals: true } },
  }) as any;
  if (response.results.length === 0) return null;
  return pageToUser(response.results[0]);
}

export async function findByCustomName(name: string): Promise<NotionUser | null> {
  const response = await notionPost(`/databases/${env.NOTION_DB_USERS}/query`, {
    filter: { property: 'Custom Name', rich_text: { equals: name } },
  }) as any;
  if (response.results.length === 0) return null;
  return pageToUser(response.results[0]);
}

export async function create(userId: string, customName: string): Promise<NotionUser> {
  const page = await notionPost('/pages', {
    parent: { database_id: env.NOTION_DB_USERS },
    properties: {
      user_id: { title: [{ text: { content: userId } }] },
      'Custom Name': { rich_text: [{ text: { content: customName } }] },
      message_counts: { number: 0 },
    },
  });
  return pageToUser(page);
}

export async function update(
  pageId: string,
  updates: Partial<Pick<NotionUser, 'customName' | 'groups' | 'multiChats'>>,
): Promise<void> {
  const properties: Record<string, unknown> = {};
  if (updates.customName !== undefined)
    properties['Custom Name'] = { rich_text: [{ text: { content: updates.customName } }] };
  if (updates.groups !== undefined)
    properties['groups'] = { multi_select: updates.groups.map(name => ({ name })) };
  if (updates.multiChats !== undefined)
    properties['multi-chat'] = { multi_select: updates.multiChats.map(name => ({ name })) };
  await notionPatch(`/pages/${pageId}`, { properties });
}

export async function incrementMessageCount(pageId: string, currentCount: number): Promise<void> {
  await notionPatch(`/pages/${pageId}`, {
    properties: { message_counts: { number: currentCount + 1 } },
  });
}
