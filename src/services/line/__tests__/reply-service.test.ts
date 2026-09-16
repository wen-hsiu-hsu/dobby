import { describe, it, expect, vi, beforeEach } from 'vitest';
import { replyMessage } from '../reply-service.js';
import { getClient } from '../../../config/line.js';
import { runWithContext } from '../../../utils/request-context.js';

vi.mock('../../../config/line.js');

const mockReplyMessage = vi.fn().mockResolvedValue({});

beforeEach(() => {
  vi.resetAllMocks();
  mockReplyMessage.mockResolvedValue({});
  vi.mocked(getClient).mockReturnValue({ replyMessage: mockReplyMessage } as any);
});

describe('replyMessage', () => {
  it('sends messages unchanged when there is no quoteToken in context', async () => {
    await replyMessage('token', [{ type: 'text', text: 'hi' }], 'dobby');

    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: 'token',
      messages: [{ type: 'text', text: 'hi' }],
    });
  });

  it('attaches the inbound quoteToken to text messages when running inside request context', async () => {
    await runWithContext(async () => {
      await replyMessage('token', [{ type: 'text', text: 'hi' }], 'dobby');
    }, 'q-token-123');

    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: 'token',
      messages: [{ type: 'text', text: 'hi', quoteToken: 'q-token-123' }],
    });
  });

  it('does not override a message that already sets its own quoteToken', async () => {
    await runWithContext(async () => {
      await replyMessage('token', [{ type: 'text', text: 'hi', quoteToken: 'explicit' }], 'dobby');
    }, 'q-token-123');

    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: 'token',
      messages: [{ type: 'text', text: 'hi', quoteToken: 'explicit' }],
    });
  });

  it('does not attach quoteToken to non-text messages', async () => {
    await runWithContext(async () => {
      await replyMessage('token', [{ type: 'sticker', packageId: '1', stickerId: '2' } as any], 'dobby');
    }, 'q-token-123');

    expect(mockReplyMessage).toHaveBeenCalledWith({
      replyToken: 'token',
      messages: [{ type: 'sticker', packageId: '1', stickerId: '2' }],
    });
  });
});
