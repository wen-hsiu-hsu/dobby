import * as peopleRepo from '../services/notion/people-repository.js';
import { replyMessage } from '../services/line/reply-service.js';
import { logger } from '../utils/logger.js';
import { FLEX_ICONS } from '../config/flex-assets.js';
import { truncateAltText } from './flex-card-parts.js';
import { buildNameListBubble, fitsBubbleSizeLimit } from './name-list-card.js';

export async function handleOwe(replyToken: string): Promise<void> {
  try {
    const unpaid = await peopleRepo.findAllUnpaid();
    const names = unpaid.map((p) => p.name);
    // 改 Flex 前的純文字內容：當 altText（通知、/logs 看到的），卡片太大時也直接改送這段
    const text =
      names.length === 0 ? '目前沒有未繳費成員 🎉' : `未繳費名單：\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;
    const contents =
      names.length === 0
        ? buildNameListBubble({
            badgeColor: 'lime',
            badgeIcon: FLEX_ICONS.checkDark,
            title: '全部繳清',
            subtitle: '目前沒有未繳費成員',
            names: [],
          })
        : buildNameListBubble({
            badgeColor: 'orange',
            badgeIcon: FLEX_ICONS.circleDollarSignDark,
            title: '未繳費名單',
            countLabel: `${names.length} 位`,
            subtitle: '付款方式請點下方「付款資訊」',
            names,
            button: { label: '付款資訊', text: '@Dobby 付款' },
          });
    if (!fitsBubbleSizeLimit(contents)) {
      logger.warn({ count: names.length }, 'Owe list too large for a Flex bubble, falling back to text');
      await replyMessage(replyToken, [{ type: 'text', text }]);
      return;
    }
    await replyMessage(replyToken, [{ type: 'flex', altText: truncateAltText(text), contents }]);
  } catch (err) {
    logger.error({ err }, 'Owe handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
