import * as announcementRepo from '../services/notion/announcement-repository.js';
import { blocksToText } from '../services/notion/blocks-to-text.js';
import { parsePaymentTable, paymentMethodsToText, tablesToText } from '../services/notion/payment-methods.js';
import { replyMessage } from '../services/line/reply-service.js';
import { logger } from '../utils/logger.js';
import { truncateAltText } from './flex-card-parts.js';
import { fitsBubbleSizeLimit } from './name-list-card.js';
import { buildPaymentBubble } from './payment-card.js';

export async function handlePayment(replyToken: string): Promise<void> {
  try {
    const announcement = await announcementRepo.findByName('PAYMENT_V2');
    if (!announcement) {
      await replyMessage(replyToken, [{ type: 'text', text: '找不到付款資訊' }]);
      return;
    }
    const blocks = await announcementRepo.getBlocks(announcement.pageId);
    // blocksToText 本來就不輸出表格，這裡明確濾掉，只留表格以外的說明文字。
    // 只有空白字元時當成沒有，免得卡片多一段看起來空白的文字
    const rawExtra = blocksToText(blocks.filter((b) => b.type !== 'table'));
    const extraText = rawExtra.trim() ? rawExtra : '';
    const methods = parsePaymentTable(blocks);
    if (!methods) {
      // 管理員把表格刪掉或改壞（沒開標題列、改了「名稱」欄名）時，照頁面文字回，表格內容也要一起回，
      // 不要讓使用者什麼都收不到
      logger.warn('PAYMENT_V2 has no usable payment table, falling back to text');
      const fallback = [tablesToText(blocks), extraText].filter(Boolean).join('\n');
      await replyMessage(replyToken, [{ type: 'text', text: fallback || '付款資訊為空' }]);
      return;
    }
    const text = [paymentMethodsToText(methods), extraText].filter(Boolean).join('\n');
    const contents = buildPaymentBubble(methods, extraText);
    if (!fitsBubbleSizeLimit(contents)) {
      logger.warn('Payment card too large for a Flex bubble, falling back to text');
      await replyMessage(replyToken, [{ type: 'text', text }]);
      return;
    }
    await replyMessage(replyToken, [{ type: 'flex', altText: truncateAltText(text), contents }]);
  } catch (err) {
    logger.error({ err }, 'Payment handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
