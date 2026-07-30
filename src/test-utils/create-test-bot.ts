import { vi } from 'vitest';
import { createRequire } from 'module';
import type { messagingApi } from '@line/bot-sdk';
import * as notionFetch from '../services/notion/notion-fetch.js';
import * as mutexModule from '../services/mutex.js';
import * as lineConfig from '../config/line.js';
import { handleMessage } from '../handlers/message-handler.js';

const require = createRequire(import.meta.url);

type Message = messagingApi.Message;

// ── Fixture types ──────────────────────────────────────────────────────────────

interface NotionQueryResponse {
  results: unknown[];
  has_more: boolean;
  next_cursor: string | null;
}

interface BlocksResponse {
  results: unknown[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface FixtureOverrides {
  /** Override the calendar DB query response */
  calendar?: Partial<NotionQueryResponse>;
  /** Override the season DB query response */
  season?: Partial<NotionQueryResponse>;
  /** Override the people DB query response */
  people?: Partial<NotionQueryResponse>;
  /** Override the users DB query response */
  users?: Partial<NotionQueryResponse>;
  /** Override the announcement DB query response */
  announcement?: Partial<NotionQueryResponse>;
  /** Override blocks response keyed by pageId */
  blocks?: Record<string, Partial<BlocksResponse>>;
}

// ── Fixture loading ────────────────────────────────────────────────────────────

function loadFixture(name: string): NotionQueryResponse {
  return require(`./fixtures/${name}.json`) as NotionQueryResponse;
}

function loadBlocksFixture(pageId: string): BlocksResponse | null {
  try {
    return require(`./fixtures/blocks/${pageId}.json`) as BlocksResponse;
  } catch {
    return null;
  }
}

function mergeFixture(
  base: NotionQueryResponse,
  override?: Partial<NotionQueryResponse>,
): NotionQueryResponse {
  if (!override) return base;
  return { ...base, ...override };
}

// ── Fixture routing ────────────────────────────────────────────────────────────

const DB_ID_TO_FIXTURE: Record<string, string> = {
  'test-db-calendar': 'calendar',
  'test-db-season': 'season',
  'test-db-people': 'people',
  'test-db-users': 'users',
  'test-db-announcement': 'announcement',
};

function routePost(path: string, overrides: FixtureOverrides): unknown {
  for (const [dbId, fixtureName] of Object.entries(DB_ID_TO_FIXTURE)) {
    if (path.includes(dbId)) {
      const base = loadFixture(fixtureName);
      const override = overrides[fixtureName as keyof FixtureOverrides] as
        | Partial<NotionQueryResponse>
        | undefined;
      return mergeFixture(base, override);
    }
  }
  // Fallback for /pages (create operations) — return empty page
  return { id: 'new-page-id', object: 'page', properties: {} };
}

function routeGet(path: string, overrides: FixtureOverrides): unknown {
  // /blocks/<pageId>/children
  const blocksMatch = path.match(/\/blocks\/([^/]+)\/children/);
  if (blocksMatch) {
    const pageId = blocksMatch[1]!;
    const overrideBlocks = overrides.blocks?.[pageId];
    const fixtureBlocks = loadBlocksFixture(pageId);
    if (overrideBlocks) {
      return { results: [], has_more: false, ...overrideBlocks };
    }
    return fixtureBlocks ?? { results: [], has_more: false, next_cursor: null };
  }

  // /pages/<pageId> — look up in people fixture
  const pageMatch = path.match(/\/pages\/([^/]+)/);
  if (pageMatch) {
    const pageId = pageMatch[1]!;
    const peopleBase = loadFixture('people');
    const people = mergeFixture(peopleBase, overrides.people as Partial<NotionQueryResponse>);
    const found = (people.results as Array<{ id: string }>).find((p) => p.id === pageId);
    return found ?? (people.results[0] ?? {});
  }

  return { results: [], has_more: false, next_cursor: null };
}

// ── Event builder ──────────────────────────────────────────────────────────────

interface UserContext {
  userId: string;
  displayName?: string;
  groupId?: string;
}

function buildLineEvent(text: string, user: UserContext) {
  return {
    type: 'message' as const,
    replyToken: 'test-reply-token',
    timestamp: Date.now(),
    source: user.groupId
      ? { type: 'group' as const, userId: user.userId, groupId: user.groupId }
      : { type: 'user' as const, userId: user.userId },
    message: {
      type: 'text' as const,
      id: 'msg-1',
      text,
    },
    mode: 'active' as const,
    webhookEventId: 'evt-1',
    deliveryContext: { isRedelivery: false },
  };
}

// ── createTestBot ──────────────────────────────────────────────────────────────

export interface TestBot {
  /**
   * Send a text command to the bot and get back the replied messages.
   * Captured messages are reset on each call.
   */
  run(text: string, user: UserContext): Promise<Message[]>;
  /** Spy on notionPatch calls — useful for asserting write operations */
  notionPatchSpy: ReturnType<typeof vi.fn>;
  /** Direct access to captured messages from the last run() call */
  captured: Message[];
}

/**
 * Creates a test bot instance with Notion API mocked via fixtures.
 *
 * **Requires these vi.mock calls at the top of the test file:**
 * ```ts
 * vi.mock('../services/notion/notion-fetch.js');
 * vi.mock('../config/line.js');
 * vi.mock('../services/mutex.js');
 * ```
 *
 * @example
 * ```ts
 * const bot = createTestBot();
 * const messages = await bot.run('@Dobby +1', { userId: 'user-alice' });
 * expect(messages[0].text).toContain('報名成功');
 * ```
 */
export function createTestBot(overrides: FixtureOverrides = {}): TestBot {
  const captured: Message[] = [];

  // Configure LINE client mock to capture replied messages
  const mockReplyMessage = vi.fn().mockImplementation(
    ({ messages: msgs }: { replyToken: string; messages: Message[] }) => {
      captured.push(...msgs);
      return Promise.resolve({});
    },
  );
  vi.mocked(lineConfig.getClient).mockReturnValue({ replyMessage: mockReplyMessage } as any);

  // Configure Notion POST mock — route to fixtures
  vi.mocked(notionFetch.notionPost).mockImplementation(async (path: string) => {
    return routePost(path, overrides);
  });

  // Configure Notion GET mock — route to fixtures
  vi.mocked(notionFetch.notionGet).mockImplementation(async (path: string) => {
    return routeGet(path, overrides);
  });

  // Configure Notion PATCH mock — no-op with spy
  const notionPatchSpy = vi.mocked(notionFetch.notionPatch).mockResolvedValue({});

  // Configure mutex mock — skip locking, execute callback directly
  vi.mocked(mutexModule.withMutex).mockImplementation(
    async <T>(_key: string, fn: () => Promise<T>) => fn(),
  );

  async function run(text: string, user: UserContext): Promise<Message[]> {
    captured.length = 0;
    const event = buildLineEvent(text, user);
    await handleMessage(event as any, 'dobby');
    return [...captured];
  }

  return { run, notionPatchSpy, captured };
}
