import { describe, it, expect, vi, beforeEach } from 'vitest';
import { replyMessage } from '../reply-service.js';
import { lineClient } from '../../../config/line.js';
import { runWithContext } from '../../../utils/request-context.js';

vi.mock('../../../config/line.js', () => ({
  lineClient: { replyMessage: vi.fn() },
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
});
