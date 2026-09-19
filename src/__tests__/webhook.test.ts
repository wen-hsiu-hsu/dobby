import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

// setup.ts (vitest setupFiles) already sets LINE_CHANNEL_SECRET/LINE_CHANNEL_ACCESS_TOKEN
// and the other required env vars before any module (incl. env.ts) is imported.

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

describe('POST /webhook', () => {
  let app: any;

  beforeAll(async () => {
    const mod = await import('../index.js');
    app = mod.app;
  });

  it('returns 200 immediately with valid payload', async () => {
    const body = JSON.stringify({ events: [] });
    const sig = makeSignature('test-secret-dobby', body);

    const res = await request(app)
      .post('/webhook')
      .set('x-line-signature', sig)
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
