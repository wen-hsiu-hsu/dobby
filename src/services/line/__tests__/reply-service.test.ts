import { describe, it, expect, vi, beforeEach } from 'vitest';
import { replyMessage } from '../reply-service.js';
import { lineClient } from '../../../config/line.js';
import { logger } from '../../../utils/logger.js';
import { runWithContext } from '../../../utils/request-context.js';

vi.mock('../../../config/line.js', () => ({
  lineClient: { replyMessage: vi.fn() },
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockReplyMessage = vi.mocked(lineClient.replyMessage);

beforeEach(() => {
  vi.resetAllMocks();
  mockReplyMessage.mockResolvedValue({ sentMessages: [] });
});

describe('replyMessage', () => {
  it('sends messages unchanged when there is no quoteToken in context', async () => {
    await replyMessage('token', [{ type: 'text', text: 'hi' }]);

    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: 'token',
      messages: [{ type: 'text', text: 'hi' }],
    });
  });

  it('attaches the inbound quoteToken to text messages when running inside request context', async () => {
    await runWithContext(async () => {
      await replyMessage('token', [{ type: 'text', text: 'hi' }]);
    }, 'q-token-123');

    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: 'token',
      messages: [{ type: 'text', text: 'hi', quoteToken: 'q-token-123' }],
    });
  });

  it('does not override a message that already sets its own quoteToken', async () => {
    await runWithContext(async () => {
      await replyMessage('token', [{ type: 'text', text: 'hi', quoteToken: 'explicit' }]);
    }, 'q-token-123');

    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: 'token',
      messages: [{ type: 'text', text: 'hi', quoteToken: 'explicit' }],
    });
  });

  it('does not attach quoteToken to non-text messages', async () => {
    await runWithContext(async () => {
      await replyMessage('token', [{ type: 'sticker', packageId: '1', stickerId: '2' } as any]);
    }, 'q-token-123');

    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: 'token',
      messages: [{ type: 'sticker', packageId: '1', stickerId: '2' }],
    });
  });

  it('logs an info-level summary with method/path/sendId/messageCount but no replyToken/messages', async () => {
    await replyMessage('token', [{ type: 'text', text: 'hello' }]);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v2/bot/message/reply',
        sendId: expect.any(String),
        messageCount: 1,
      }),
      'LINE reply',
    );
    for (const call of vi.mocked(logger.info).mock.calls) {
      expect(call[0]).not.toHaveProperty('replyToken');
      expect(call[0]).not.toHaveProperty('messages');
    }
  });

  it('logs the full replyToken/messages only at debug level, under a distinct message name', async () => {
    await replyMessage('token', [{ type: 'text', text: 'hello' }]);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ replyToken: expect.stringContaining('…'), messages: ['hello'] }),
      'LINE reply payload',
    );
  });

  it('generates a distinct sendId for each call', async () => {
    await replyMessage('token', [{ type: 'text', text: 'hello' }]);
    await replyMessage('token', [{ type: 'text', text: 'hello' }]);

    const sendIds = vi.mocked(logger.info).mock.calls
      .filter(([, msg]) => msg === 'LINE reply')
      .map(([fields]) => (fields as { sendId: string }).sendId);

    expect(sendIds).toHaveLength(2);
    expect(sendIds[0]).not.toBe(sendIds[1]);
  });

  it('logs "LINE reply sent" at info level (not debug) with no message content, replacing the old debug-level behavior', async () => {
    await replyMessage('token', [{ type: 'text', text: 'hello' }]);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', path: '/v2/bot/message/reply', sendId: expect.any(String) }),
      'LINE reply sent',
    );
    const sentCall = vi.mocked(logger.info).mock.calls.find(([, msg]) => msg === 'LINE reply sent');
    expect(sentCall?.[0]).not.toHaveProperty('messages');
    expect(vi.mocked(logger.debug).mock.calls.some(([, msg]) => msg === 'LINE reply sent')).toBe(false);
  });

  it('does not include message content in the warn log on failure', async () => {
    const err = new Error('boom');
    mockReplyMessage.mockRejectedValue(err);

    await replyMessage('token', [{ type: 'text', text: 'hello' }]);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err, method: 'POST', path: '/v2/bot/message/reply', sendId: expect.any(String) }),
      'Reply failed, no fallback available (no groupId for push)',
    );
    const warnCall = vi.mocked(logger.warn).mock.calls[0]![0];
    expect(warnCall).not.toHaveProperty('messages');
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ messages: ['hello'] }),
      'Reply failed payload',
    );
  });
});
