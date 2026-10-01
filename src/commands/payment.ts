import * as announcementRepo from '../services/notion/announcement-repository.js';
import { PAYMENT_PAGE_NAME, parsePaymentTable, paymentExtraText, paymentPageToText } from '../services/notion/payment-methods.js';
import { replyMessage } from '../services/line/reply-service.js';
import { logger } from '../utils/logger.js';
import { truncateAltText } from './flex-card-parts.js';
import { fitsBubbleSizeLimit } from './name-list-card.js';
import { buildPaymentBubble } from './payment-card.js';

export async function handlePayment(replyToken: string): Promise<void> {
  try {
    const announcement = await announcementRepo.findByName(PAYMENT_PAGE_NAME);
    if (!announcement) {
      await replyMessage(replyToken, [{ type: 'text', text: '找不到付款資訊' }]);
      return;
    }
    const blocks = await announcementRepo.getBlocks(announcement.pageId);
    const text = paymentPageToText(blocks);
    const methods = parsePaymentTable(blocks);
    if (!methods) {
      // 管理員把表格刪掉或改壞（沒開標題列、改了「名稱」欄名）時改回純文字，表格內容也一起回，
      // 不要讓使用者什麼都收不到
      logger.warn('PAYMENT_V2 has no usable payment table, falling back to text');
      await replyMessage(replyToken, [{ type: 'text', text: text || '付款資訊為空' }]);
      return;
    }
    const contents = buildPaymentBubble(methods, paymentExtraText(blocks));
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
