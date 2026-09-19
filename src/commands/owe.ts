import * as peopleRepo from '../services/notion/people-repository.js';
import { replyMessage } from '../services/line/reply-service.js';
import { logger } from '../utils/logger.js';

export async function handleOwe(replyToken: string): Promise<void> {
  try {
    const unpaid = await peopleRepo.findAllUnpaid();
    if (unpaid.length === 0) {
      await replyMessage(replyToken, [{ type: 'text', text: '目前沒有未繳費成員 🎉' }]);
      return;
    }
    const list = unpaid.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    await replyMessage(replyToken, [{ type: 'text', text: `未繳費名單：\n${list}` }]);
  } catch (err) {
    logger.error({ err }, 'Owe handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
