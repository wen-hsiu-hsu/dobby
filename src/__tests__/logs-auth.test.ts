import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

const VALID_TOKEN = 'test-logs-token';

// Must set env vars before importing app (env.ts validates at import time)
beforeAll(() => {
  process.env['NODE_ENV'] = 'test';
  process.env['LINE_CHANNEL_SECRET_DOBBY'] = 'test-secret-dobby';
  process.env['LINE_CHANNEL_ACCESS_TOKEN_DOBBY'] = 'test-token-dobby';
  process.env['LINE_CHANNEL_SECRET_BATTING'] = 'test-secret-batting';
  process.env['LINE_CHANNEL_ACCESS_TOKEN_BATTING'] = 'test-token-batting';
  process.env['NOTION_API_KEY'] = 'test-notion-key';
  process.env['NOTION_DB_USERS'] = 'test-db-users';
  process.env['NOTION_DB_CALENDAR'] = 'test-db-calendar';
  process.env['NOTION_DB_PEOPLE'] = 'test-db-people';
  process.env['NOTION_DB_SEASON'] = 'test-db-season';
  process.env['NOTION_DB_ANNOUNCEMENT'] = 'test-db-announcement';
  process.env['LOGS_ACCESS_TOKEN'] = VALID_TOKEN;
  process.env['PORT'] = '3000';
});

// Mock the event router so no actual processing happens
vi.mock('../handlers/event-router.js', () => ({
  processEvents: vi.fn().mockResolvedValue(undefined),
}));

// Mock LINE SDK middleware (unrelated route, kept for consistency with app import)
vi.mock('@line/bot-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@line/bot-sdk')>();
  return {
    ...actual,
    middleware: () => (_req: any, _res: any, next: any) => next(),
  };
});

// Avoid depending on real log files on disk
vi.mock('../utils/log-reader.js', () => ({
  readRecentLogs: vi.fn().mockResolvedValue([]),
}));

describe('GET /logs', () => {
  let app: any;

  beforeAll(async () => {
    const mod = await import('../index.js');
    app = mod.app;
  });

  it('rejects requests with no token', async () => {
    const res = await request(app).get('/logs');
    expect(res.status).toBe(401);
  });

  it('rejects requests with a wrong Bearer token', async () => {
    const res = await request(app).get('/logs').set('Authorization', 'Bearer wrong-token');
    expect(res.status).toBe(401);
  });

  it('rejects requests with a wrong query token', async () => {
    const res = await request(app).get('/logs?token=wrong-token');
    expect(res.status).toBe(401);
  });

  it('accepts requests with the correct Bearer token', async () => {
    const res = await request(app).get('/logs').set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('accepts requests with the correct query token', async () => {
    const res = await request(app).get(`/logs?token=${VALID_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});
