import { env } from '../../config/env.js';

const NOTION_VERSION = '2022-06-28';
const BASE_URL = 'https://api.notion.com/v1';

function notionHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function assertOk(res: Response): Promise<void> {
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion API error: ${JSON.stringify(err)}`);
  }
}

export async function notionGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: notionHeaders(),
  });
  await assertOk(res);
  return res.json();
}

export async function notionPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify(body),
  });
  await assertOk(res);
  return res.json();
}

export async function notionPatch(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: notionHeaders(),
    body: JSON.stringify(body),
  });
  await assertOk(res);
  return res.json();
}
