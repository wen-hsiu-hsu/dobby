import { describe, it, expect, vi, beforeAll } from 'vitest';
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

  it('logs an info-level summary with only eventCount, not the full events (with userId/text)', async () => {
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

    expect(logger.info).toHaveBeenCalledWith({ eventCount: 1 }, 'Webhook received');
    const infoCall = vi.mocked(logger.info).mock.calls.find(([, msg]) => msg === 'Webhook received');
    expect(infoCall?.[0]).not.toHaveProperty('events');

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ eventCount: 1, events }),
      'Webhook received detail',
    );
  });
});
