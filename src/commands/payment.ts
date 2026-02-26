import * as announcementRepo from '../services/notion/announcement-repository.js';
import { replyMessage } from '../services/line/reply-service.js';
import { logger } from '../utils/logger.js';

function blocksToText(blocks: any[]): string {
  return blocks
    .map((block) => {
      const type = block.type as string;
      const content = (block as any)[type];
      if (!content) return '';
      const richText: any[] = content.rich_text ?? [];
      return richText.map((r: any) => r.plain_text ?? '').join('');
    })
    .filter(Boolean)
    .join('\n');
}

export async function handlePayment(replyToken: string, botId: string): Promise<void> {
  try {
    const announcement = await announcementRepo.findByName('PAYMENT');
    if (!announcement) {
      await replyMessage(replyToken, [{ type: 'text', text: '找不到付款資訊' }], botId);
      return;
    }
    const blocks = await announcementRepo.getBlocks(announcement.pageId);
    const text = blocksToText(blocks);
    await replyMessage(replyToken, [{ type: 'text', text: text || '付款資訊為空' }], botId);
  } catch (err) {
    logger.error({ err }, 'Payment handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }], botId);
  }
}
