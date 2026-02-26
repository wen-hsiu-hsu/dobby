import { notion } from './notion-client.js';
import { env } from '../../config/env.js';
import {
  getRichText,
  getTitle,
  getNumber,
  getMultiSelect,
  getCheckbox,
  setRichText,
  setTitle,
  setNumber,
  setMultiSelect,
} from './property-helpers.js';
import type { NotionUser } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

function pageToUser(page: PageObjectResponse): NotionUser {
  const p = page.properties;
  return {
    pageId: page.id,
    userId: getTitle(p, 'User ID'),
    customName: getRichText(p, 'Custom Name'),
    isAdmin: getCheckbox(p, 'is_admin'),
    messageCount: getNumber(p, 'Message Count') ?? 0,
    groups: getMultiSelect(p, 'Groups'),
    multiChats: getMultiSelect(p, 'Multi Chats'),
  };
}

export async function findByUserId(userId: string): Promise<NotionUser | null> {
  const response = await notion.dataSources.query({
    data_source_id: env.NOTION_DB_USERS,
    filter: { property: 'User ID', title: { equals: userId } },
  });
  if (response.results.length === 0) return null;
  return pageToUser(response.results[0] as PageObjectResponse);
}

export async function findAdmin(): Promise<NotionUser | null> {
  const response = await notion.dataSources.query({
    data_source_id: env.NOTION_DB_USERS,
    filter: { property: 'is_admin', checkbox: { equals: true } },
  });
  if (response.results.length === 0) return null;
  return pageToUser(response.results[0] as PageObjectResponse);
}

export async function findByCustomName(name: string): Promise<NotionUser | null> {
  const response = await notion.dataSources.query({
    data_source_id: env.NOTION_DB_USERS,
    filter: { property: 'Custom Name', rich_text: { equals: name } },
  });
  if (response.results.length === 0) return null;
  return pageToUser(response.results[0] as PageObjectResponse);
}

export async function create(userId: string, customName: string): Promise<NotionUser> {
  const page = await notion.pages.create({
    parent: { data_source_id: env.NOTION_DB_USERS },
    properties: {
      'User ID': setTitle(userId) as any,
      'Custom Name': setRichText(customName),
      'Message Count': setNumber(0),
    },
  });
  return pageToUser(page as PageObjectResponse);
}

export async function update(
  pageId: string,
  updates: Partial<Pick<NotionUser, 'customName' | 'groups' | 'multiChats'>>,
): Promise<void> {
  const properties: Record<string, unknown> = {};
  if (updates.customName !== undefined) properties['Custom Name'] = setRichText(updates.customName);
  if (updates.groups !== undefined) properties['Groups'] = setMultiSelect(updates.groups);
  if (updates.multiChats !== undefined) properties['Multi Chats'] = setMultiSelect(updates.multiChats);
  await notion.pages.update({ page_id: pageId, properties: properties as any });
}

export async function incrementMessageCount(pageId: string, currentCount: number): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: { 'Message Count': setNumber(currentCount + 1) } as any,
  });
}
