import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

// setup.ts (vitest setupFiles) already sets LINE_CHANNEL_SECRET/LINE_CHANNEL_ACCESS_TOKEN
// and the other required env vars before any module (incl. env.ts) is imported.
// LINE_CHANNEL_SECRET is 'test-secret-dobby' (see src/test-utils/setup.ts).

// Unlike src/__tests__/webhook.test.ts, this file does NOT mock '@line/bot-sdk'.
// The whole point of this test file is to exercise the real middleware()
// signature verification path (src/middleware/line-signature.ts), so a
// tampered/missing X-Line-Signature actually gets rejected by real code
// instead of by a fake middleware that always calls next(). Because Vitest
// isolates the module registry per test file by default, this doesn't
// conflict with webhook.test.ts mocking '@line/bot-sdk' in the same run.

vi.mock('../handlers/event-router.js', () => ({
  processEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const CHANNEL_SECRET = 'test-secret-dobby';

function makeSignature(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

describe('POST /webhook signature verification (real @line/bot-sdk middleware)', () => {
  let app: any;

  beforeAll(async () => {
    const mod = await import('../index.js');
    app = mod.app;
  });

  // processEvents is a single mocked fn shared across all tests in this file
  // (vi.mock is module-scoped, not per-test) — reset its call history between
  // tests so an earlier "valid signature" test doesn't make a later
  // "not.toHaveBeenCalled()" assertion see a stale call.
  beforeEach(async () => {
    const { processEvents } = await import('../handlers/event-router.js');
    vi.mocked(processEvents).mockClear();
  });

  it('accepts a request with a valid signature and calls processEvents', async () => {
    const { processEvents } = await import('../handlers/event-router.js');
    const body = JSON.stringify({ events: [] });
    const sig = makeSignature(CHANNEL_SECRET, body);

    const res = await request(app)
      .post('/webhook')
      .set('x-line-signature', sig)
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(processEvents).toHaveBeenCalledTimes(1);
    expect(processEvents).toHaveBeenCalledWith([]);
  });

  it('rejects a request with a tampered/invalid signature and does not call processEvents', async () => {
    const { processEvents } = await import('../handlers/event-router.js');
    const body = JSON.stringify({ events: [] });
    // Valid signature for a *different* body — simulates a tampered payload
    // or a signature computed with the wrong secret.
    const wrongSig = makeSignature(CHANNEL_SECRET, JSON.stringify({ events: ['tampered'] }));

    const res = await request(app)
      .post('/webhook')
      .set('x-line-signature', wrongSig)
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(processEvents).not.toHaveBeenCalled();
  });

  it('rejects a request with no X-Line-Signature header and does not call processEvents', async () => {
    const { processEvents } = await import('../handlers/event-router.js');
    const body = JSON.stringify({ events: [] });

    const res = await request(app)
      .post('/webhook')
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(processEvents).not.toHaveBeenCalled();
  });
});
