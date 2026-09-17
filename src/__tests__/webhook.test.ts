import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

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
  process.env['LOGS_ACCESS_TOKEN'] = 'test-logs-token';
  process.env['PORT'] = '3000';
});

// Mock the event router so no actual processing happens
vi.mock('../handlers/event-router.js', () => ({
  processEvents: vi.fn().mockResolvedValue(undefined),
}));

// Mock LINE SDK middleware to bypass signature validation in tests
vi.mock('@line/bot-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@line/bot-sdk')>();
  return {
    ...actual,
    middleware: () => (_req: any, _res: any, next: any) => next(),
  };
});

function makeSignature(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

describe('POST /webhook/:botId', () => {
  let app: any;

  beforeAll(async () => {
    const mod = await import('../index.js');
    app = mod.app;
  });

  it('returns 200 immediately with valid payload', async () => {
    const body = JSON.stringify({ events: [] });
    const sig = makeSignature('test-secret-dobby', body);

    const res = await request(app)
      .post('/webhook/dobby')
      .set('x-line-signature', sig)
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns 200 for batting bot', async () => {
    const body = JSON.stringify({ events: [] });
    const sig = makeSignature('test-secret-batting', body);

    const res = await request(app)
      .post('/webhook/batting')
      .set('x-line-signature', sig)
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
  });

  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns 404 for an unknown botId instead of falling back to dobby', async () => {
    const body = JSON.stringify({ events: [] });
    const sig = makeSignature('test-secret-dobby', body);

    const res = await request(app)
      .post('/webhook/Batting') // wrong case — must not silently match 'batting' or fall back to 'dobby'
      .set('x-line-signature', sig)
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(404);
  });
});
