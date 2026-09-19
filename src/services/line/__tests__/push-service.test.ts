import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pushMessage } from '../push-service.js';
import { lineClient } from '../../../config/line.js';
import { logger } from '../../../utils/logger.js';

vi.mock('../../../config/line.js', () => ({
  lineClient: { pushMessage: vi.fn() },
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockPushMessage = vi.mocked(lineClient.pushMessage);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('pushMessage', () => {
  it('logs an info-level summary with method/path/sendId/messageCount but no to/messages', async () => {
    mockPushMessage.mockResolvedValue({ sentMessages: [] });

    await pushMessage('group-1', [{ type: 'text', text: 'hello' }]);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v2/bot/message/push',
        sendId: expect.any(String),
        messageCount: 1,
      }),
      'LINE push',
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', path: '/v2/bot/message/push', sendId: expect.any(String) }),
      'LINE push sent',
    );
    for (const call of vi.mocked(logger.info).mock.calls) {
      expect(call[0]).not.toHaveProperty('to');
      expect(call[0]).not.toHaveProperty('messages');
    }
  });

  it('logs the full to/messages only at debug level, under a distinct message name', async () => {
    mockPushMessage.mockResolvedValue({ sentMessages: [] });

    await pushMessage('group-1', [{ type: 'text', text: 'hello' }]);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'group-1', messages: ['hello'] }),
      'LINE push payload',
    );
  });

  it('generates a distinct sendId for each call', async () => {
    mockPushMessage.mockResolvedValue({ sentMessages: [] });

    await pushMessage('group-1', [{ type: 'text', text: 'hello' }]);
    await pushMessage('group-1', [{ type: 'text', text: 'hello' }]);

    const sendIds = vi.mocked(logger.info).mock.calls
      .filter(([, msg]) => msg === 'LINE push')
      .map(([fields]) => (fields as { sendId: string }).sendId);

    expect(sendIds).toHaveLength(2);
    expect(sendIds[0]).not.toBe(sendIds[1]);
  });

  it('does not include message content in the error log on failure', async () => {
    const err = new Error('boom');
    mockPushMessage.mockRejectedValue(err);

    await expect(pushMessage('group-1', [{ type: 'text', text: 'hello' }])).rejects.toThrow('boom');

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err, method: 'POST', path: '/v2/bot/message/push', sendId: expect.any(String) }),
      'Push message failed',
    );
    const errorCall = vi.mocked(logger.error).mock.calls[0]![0];
    expect(errorCall).not.toHaveProperty('messages');
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'group-1', messages: ['hello'] }),
      'Push message failed payload',
    );
  });

  it('still throws the original error on failure', async () => {
    const err = new Error('boom');
    mockPushMessage.mockRejectedValue(err);

    await expect(pushMessage('group-1', [{ type: 'text', text: 'hi' }])).rejects.toBe(err);
  });
});
