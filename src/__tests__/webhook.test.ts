import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

// setup.ts (vitest setupFiles) already sets LINE_CHANNEL_SECRET/LINE_CHANNEL_ACCESS_TOKEN
// and the other required env vars before any module (incl. env.ts) is imported.

// Mock the event router so no actual processing happens
vi.mock('../handlers/event-router.js', () => ({
  processEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock LINE SDK middleware to bypass signature validation in tests. The real
// middleware() also parses the raw request body into req.body as part of
// signature verification (there's no separate express.json() in index.ts) —
// replicate just that part here so route handlers that read req.body.events
// (like webhookRouter) still see a populated body in tests.
vi.mock('@line/bot-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@line/bot-sdk')>();
  return {
    ...actual,
    middleware: () => (req: any, _res: any, next: any) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => {
        raw += chunk;
      });
      req.on('end', () => {
        try {
          req.body = raw ? JSON.parse(raw) : {};
        } catch {
          req.body = {};
        }
        next();
      });
    },
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

  // processEvents/logger mocks are module-scoped (shared across all tests in
  // this file) — clear call history between tests so an earlier test's call
  // doesn't leak into a later `not.toHaveBeenCalled()`/`toHaveBeenCalledWith()`
  // assertion.
  beforeEach(async () => {
    const { processEvents } = await import('../handlers/event-router.js');
    const { logger } = await import('../utils/logger.js');
    vi.mocked(processEvents).mockClear();
    vi.mocked(logger.warn).mockClear();
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

  // 決定：單筆事件（LINE 送過來幾乎永遠是這樣）不再另外記一行批次摘要——
  // 每筆事件自己在 processEvents() 裡都會有帶 reqId 的 'Processing event'/
  // detail，這裡再記一次只是重複、還沒有 reqId 可用。
  it('does not log a batch-level "Webhook received" line for a single event', async () => {
    const { logger } = await import('../utils/logger.js');
    const events = [
      {
        type: 'message',
        replyToken: 'token',
        source: { type: 'user', userId: 'U1234567890' },
        message: { type: 'text', id: 'm1', text: 'secret message text' },
      },
    ];
    const body = JSON.stringify({ events });
    const sig = makeSignature('test-secret-dobby', body);

    await request(app)
      .post('/webhook')
      .set('x-line-signature', sig)
      .set('content-type', 'application/json')
      .send(body);

    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'Webhook received');
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'Webhook received multiple events');
    expect(logger.debug).not.toHaveBeenCalledWith(expect.anything(), 'Webhook received detail');
  });

  // LINE 理論上可以一次遞送多筆事件——這種情況才值得留一行摘要，且只帶
  // eventCount，不帶完整 events（一樣不能把 userId/text 這類個資留在 info 層）。
  it('logs a batch-level summary with only eventCount when a webhook delivers more than one event', async () => {
    const { logger } = await import('../utils/logger.js');
    const events = [
      {
        type: 'message',
        replyToken: 'token-1',
        source: { type: 'user', userId: 'U1234567890' },
        message: { type: 'text', id: 'm1', text: 'secret message text 1' },
      },
      {
        type: 'message',
        replyToken: 'token-2',
        source: { type: 'user', userId: 'U0987654321' },
        message: { type: 'text', id: 'm2', text: 'secret message text 2' },
      },
    ];
    const body = JSON.stringify({ events });
    const sig = makeSignature('test-secret-dobby', body);

    await request(app)
      .post('/webhook')
      .set('x-line-signature', sig)
      .set('content-type', 'application/json')
      .send(body);

    expect(logger.info).toHaveBeenCalledWith({ eventCount: 2 }, 'Webhook received multiple events');
    const infoCall = vi.mocked(logger.info).mock.calls.find(([, msg]) => msg === 'Webhook received multiple events');
    expect(infoCall?.[0]).not.toHaveProperty('events');
  });
});
