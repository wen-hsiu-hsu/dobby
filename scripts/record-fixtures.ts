/**
 * Record fixtures from real Notion API.
 * Run: pnpm record-fixtures
 * Requires: local .env with real Notion credentials
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

const NOTION_VERSION = '2022-06-28';
const BASE_URL = 'https://api.notion.com/v1';

const NOTION_API_KEY = process.env['NOTION_API_KEY'];
if (!NOTION_API_KEY) {
  console.error('Missing NOTION_API_KEY in environment');
  process.exit(1);
}

const DBS = {
  calendar: process.env['NOTION_DB_CALENDAR'],
  season: process.env['NOTION_DB_SEASON'],
  people: process.env['NOTION_DB_PEOPLE'],
  users: process.env['NOTION_DB_USERS'],
  announcement: process.env['NOTION_DB_ANNOUNCEMENT'],
};

for (const [name, id] of Object.entries(DBS)) {
  if (!id) {
    console.error(`Missing NOTION_DB_${name.toUpperCase()} in environment`);
    process.exit(1);
  }
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../src/test-utils/fixtures');

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function notionPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion POST ${path} failed: ${JSON.stringify(err)}`);
  }
  return res.json();
}

async function notionGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: headers(),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion GET ${path} failed: ${JSON.stringify(err)}`);
  }
  return res.json();
}

function writeFixture(relativePath: string, data: unknown): void {
  const fullPath = path.join(FIXTURES_DIR, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`  wrote ${relativePath}`);
}

async function recordDb(name: string, dbId: string): Promise<unknown> {
  console.log(`Recording ${name}...`);
  const data = await notionPost(`/databases/${dbId}/query`, { page_size: 10 });
  writeFixture(`${name}.json`, data);
  return data;
}

async function recordBlocks(pageId: string): Promise<void> {
  console.log(`  Recording blocks for ${pageId}...`);
  const data = await notionGet(`/blocks/${pageId}/children`);
  writeFixture(`blocks/${pageId}.json`, data);
}

async function main(): Promise<void> {
  console.log('Recording Notion fixtures...\n');

  for (const [name, dbId] of Object.entries(DBS)) {
    await recordDb(name, dbId!);
  }

  // Record blocks for all announcement pages
  console.log('\nRecording announcement blocks...');
  const announcementData = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, 'announcement.json'), 'utf-8'),
  ) as { results: Array<{ id: string }> };

  for (const page of announcementData.results) {
    await recordBlocks(page.id);
  }

  console.log('\nDone. Commit the updated fixtures if they changed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
