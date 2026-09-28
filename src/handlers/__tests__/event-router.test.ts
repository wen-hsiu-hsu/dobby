import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEvents } from '../event-router.js';
import { handleMessage } from '../message-handler.js';
import { getQuoteToken } from '../../utils/request-context.js';
import { logger } from '../../utils/logger.js';

vi.mock('../message-handler.js');
vi.mock('../join-handler.js');
vi.mock('../member-joined-handler.js');

vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('processEvents', () => {
  it('makes the inbound text message quoteToken available via request context', async () => {
    let seenToken: string | undefined;
    vi.mocked(handleMessage).mockImplementation(async () => {
      seenToken = getQuoteToken();
    });

    const event = {
      type: 'message',
      replyToken: 'token',
      source: { type: 'user', userId: 'u1' },
      message: { type: 'text', id: 'm1', text: '@Dobby +1', quoteToken: 'qt-1' },
      deliveryContext: { isRedelivery: false },
    };

    await processEvents([event as any]);

    expect(seenToken).toBe('qt-1');
  });

  it('leaves quoteToken undefined for non-text messages', async () => {
    let seenToken: string | undefined = 'unset';
    vi.mocked(handleMessage).mockImplementation(async () => {
      seenToken = getQuoteToken();
    });

    const event = {
      type: 'message',
      replyToken: 'token',
      source: { type: 'user', userId: 'u1' },
      message: { type: 'sticker', id: 'm1' },
      deliveryContext: { isRedelivery: false },
    };

    await processEvents([event as any]);

    expect(seenToken).toBeUndefined();
  });

  it('logs "Processing event" with the event\'s webhookEventId/isRedelivery (not PII, safe at info level)', async () => {
    vi.mocked(handleMessage).mockResolvedValue(undefined);

    const event = {
      type: 'message',
      replyToken: 'token',
      source: { type: 'group', groupId: 'g1' },
      message: { type: 'text', id: 'm1', text: '@Dobby +1' },
      webhookEventId: '01M31BEND6EPJ7FSWMDHC7BGRQ',
      timestamp: Date.now(),
      deliveryContext: { isRedelivery: true },
    };

    await processEvents([event as any]);

    expect(logger.info).toHaveBeenCalledWith(
      {
        type: 'message',
        sourceType: 'group',
        webhookEventId: '01M31BEND6EPJ7FSWMDHC7BGRQ',
        isRedelivery: true,
        lagMs: expect.any(Number),
      },
      'Processing event',
    );
  });

  it('logs lagMs as the time between LINE\'s event timestamp and when processing starts', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-28T10:00:05.000Z'));
      vi.mocked(handleMessage).mockResolvedValue(undefined);

      const event = {
        type: 'message',
        replyToken: 'token',
        source: { type: 'group', groupId: 'g1' },
        message: { type: 'text', id: 'm1', text: '@Dobby +1' },
        timestamp: Date.parse('2026-09-28T10:00:03.500Z'),
        deliveryContext: { isRedelivery: false },
      };

      await processEvents([event as any]);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ lagMs: 1500 }),
        'Processing event',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs "Event processed" with durationMs when handleMessage completes normally', async () => {
    vi.mocked(handleMessage).mockResolvedValue(undefined);

    const event = {
      type: 'message',
      replyToken: 'token',
      source: { type: 'user', userId: 'u1' },
      message: { type: 'text', id: 'm1', text: '@Dobby +1' },
      deliveryContext: { isRedelivery: false },
    };

    await processEvents([event as any]);

    expect(logger.info).toHaveBeenCalledWith(
      { type: 'message', durationMs: expect.any(Number) },
      'Event processed',
    );
  });

  it('logs "Error handling event" with durationMs when handleMessage rejects', async () => {
    vi.mocked(handleMessage).mockRejectedValue(new Error('boom'));

    const event = {
      type: 'message',
      replyToken: 'token',
      source: { type: 'user', userId: 'u1' },
      message: { type: 'text', id: 'm1', text: '@Dobby +1' },
      deliveryContext: { isRedelivery: false },
    };

    await processEvents([event as any]);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), eventType: 'message', durationMs: expect.any(Number) }),
      'Error handling event',
    );
  });
});
