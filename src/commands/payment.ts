import * as announcementRepo from '../services/notion/announcement-repository.js';
import { blocksToText } from '../services/notion/blocks-to-text.js';
import { replyMessage } from '../services/line/reply-service.js';
import { logger } from '../utils/logger.js';

export async function handlePayment(replyToken: string): Promise<void> {
  try {
    const announcement = await announcementRepo.findByName('PAYMENT');
    if (!announcement) {
      await replyMessage(replyToken, [{ type: 'text', text: '找不到付款資訊' }]);
      return;
    }
    const blocks = await announcementRepo.getBlocks(announcement.pageId);
    const text = blocksToText(blocks);
    await replyMessage(replyToken, [{ type: 'text', text: text || '付款資訊為空' }]);
  } catch (err) {
    logger.error({ err }, 'Payment handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
