import { describe, it, expect, beforeEach, vi } from 'vitest';

// logger.ts's Proxy merges request-context (reqId/purpose) into every log
// call. It must support both of pino's call shapes — logger.info(msg) and
// logger.info(mergingObject, msg) — without ever treating a bare string as
// the merging object (spreading a string spreads its characters as numeric
// keys). Mock the underlying 'pino' factory so we can assert exactly what
// reaches it, independent of transport/output formatting.
const { infoMock, pinoFactoryMock } = vi.hoisted(() => {
  const infoMock = vi.fn();
  const pinoFactoryMock = vi.fn(() => ({
    info: infoMock,
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }));
  return { infoMock, pinoFactoryMock };
});

vi.mock('pino', () => ({ default: pinoFactoryMock }));

import { runWithContext, withPurpose } from '../request-context.js';

describe('logger', () => {
  beforeEach(() => {
    infoMock.mockClear();
  });

  it('passes a string-only call through as the message when no context is active', async () => {
    const { logger } = await import('../logger.js');
    logger.info('plain message');
    expect(infoMock).toHaveBeenCalledWith('plain message');
  });

  it('keeps a string-only call as the message (not spread into a merging object) when a reqId is active', async () => {
    const { logger } = await import('../logger.js');
    await runWithContext(async () => {
      logger.info('inside context');
    });

    const [mergeArg, msgArg] = infoMock.mock.calls.at(-1)!;
    expect(msgArg).toBe('inside context');
    expect(mergeArg).not.toHaveProperty('0');
    expect(typeof (mergeArg as { reqId?: unknown }).reqId).toBe('string');
  });

  it('still merges reqId/purpose into an object-first call', async () => {
    const { logger } = await import('../logger.js');
    await runWithContext(async () => {
      await withPurpose('查詢使用者資料', async () => {
        logger.info({ userId: 'u1' }, 'looked up user');
      });
    });

    const [mergeArg, msgArg] = infoMock.mock.calls.at(-1)!;
    expect(msgArg).toBe('looked up user');
    expect(mergeArg).toMatchObject({ userId: 'u1', purpose: '查詢使用者資料' });
    expect(typeof (mergeArg as { reqId?: unknown }).reqId).toBe('string');
  });
});
