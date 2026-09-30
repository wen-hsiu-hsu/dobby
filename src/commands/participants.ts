import * as seasonRepo from '../services/notion/season-repository.js';
import * as peopleRepo from '../services/notion/people-repository.js';
import { replyMessage } from '../services/line/reply-service.js';
import { logger } from '../utils/logger.js';
import { formatSeasonTitle, getCurrentSeasonName, getSeasonMonthRange } from '../utils/date-utils.js';
import { FLEX_ICONS } from '../config/flex-assets.js';
import { truncateAltText } from './flex-card-parts.js';
import { buildNameListBubble } from './name-list-card.js';

export async function handleParticipants(replyToken: string): Promise<void> {
  try {
    const seasonName = getCurrentSeasonName();
    const current = await seasonRepo.findByName(seasonName);
    if (!current) {
      await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${seasonName} 季租資料` }]);
      return;
    }
    const names = current.members.length === 0 ? [] : (await peopleRepo.findByPageIds(current.members)).map((p) => p.name);
    // altText 沿用改 Flex 前的純文字內容（通知、/logs 看到的就是這段）
    const altText =
      names.length === 0
        ? `${current.name} 目前沒有報名成員`
        : `${current.name} 報名人（${names.length} 位）：\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;
    const contents = buildNameListBubble({
      topText: `${formatSeasonTitle(current.name, false)}（${getSeasonMonthRange(current.name)}）`,
      badgeColor: names.length === 0 ? 'gray' : 'lime',
      badgeIcon: names.length === 0 ? FLEX_ICONS.userXWhite : FLEX_ICONS.usersDark,
      title: '本季報名人',
      countLabel: `${names.length} 位`,
      names,
    });
    await replyMessage(replyToken, [{ type: 'flex', altText: truncateAltText(altText), contents }]);
  } catch (err) {
    logger.error({ err }, 'Participants handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
