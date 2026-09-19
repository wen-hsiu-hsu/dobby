import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePayment } from '../payment.js';
import * as announcementRepo from '../../services/notion/announcement-repository.js';
import { replyMessage } from '../../services/line/reply-service.js';

vi.mock('../../services/notion/announcement-repository.js');
vi.mock('../../services/line/reply-service.js');

function paragraphBlock(text: string) {
  return { type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } };
}

function bulletedListItemBlock(text: string) {
  return { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: text }] } };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(announcementRepo.findByName).mockResolvedValue({ pageId: 'ann-1', name: 'PAYMENT' });
});

describe('handlePayment', () => {
  it('looks up the PAYMENT announcement', async () => {
    vi.mocked(announcementRepo.getBlocks).mockResolvedValue([paragraphBlock('付款方式')] as any);

    await handlePayment('token');

    expect(announcementRepo.findByName).toHaveBeenCalledWith('PAYMENT');
  });

  it('prefixes bulleted_list_item blocks with "• ", matching the shared blocksToText behavior', async () => {
    vi.mocked(announcementRepo.getBlocks).mockResolvedValue([
      paragraphBlock('付款方式'),
      bulletedListItemBlock('永豐 (807) 20201800934932'),
      bulletedListItemBlock('Line 轉帳'),
    ] as any);

    await handlePayment('token');

    const [, messages] = vi.mocked(replyMessage).mock.calls[0]!;
    const text = (messages[0] as { text: string }).text;
    expect(text).toContain('付款方式\n• 永豐 (807) 20201800934932\n• Line 轉帳');
  });

  it('replies "找不到付款資訊" when PAYMENT does not exist', async () => {
    vi.mocked(announcementRepo.findByName).mockResolvedValue(null);

    await handlePayment('token');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '找不到付款資訊' }]);
    expect(announcementRepo.getBlocks).not.toHaveBeenCalled();
  });

  it('replies "付款資訊為空" when the announcement has no content', async () => {
    vi.mocked(announcementRepo.getBlocks).mockResolvedValue([]);

    await handlePayment('token');

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '付款資訊為空' }]);
  });
});
