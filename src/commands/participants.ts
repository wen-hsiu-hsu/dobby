import * as seasonRepo from '../services/notion/season-repository.js';
import * as peopleRepo from '../services/notion/people-repository.js';
import { replyMessage } from '../services/line/reply-service.js';
import { logger } from '../utils/logger.js';
import { formatSeasonTitle, getCurrentSeasonName, getSeasonMonthRange } from '../utils/date-utils.js';
import { FLEX_ICONS } from '../config/flex-assets.js';
import { truncateAltText } from './flex-card-parts.js';
import { buildNameListBubble, fitsBubbleSizeLimit } from './name-list-card.js';

export async function handleParticipants(replyToken: string): Promise<void> {
  try {
    const seasonName = getCurrentSeasonName();
    const current = await seasonRepo.findByName(seasonName);
    if (!current) {
      await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${seasonName} 季租資料` }]);
      return;
    }
    const names = (await peopleRepo.findMembersOfSeasons([current])).map((p) => p.name);
    // 改 Flex 前的純文字內容：當 altText（通知、/logs 看到的），卡片太大時也直接改送這段
    const text =
      names.length === 0
        ? `${current.name} 目前沒有報名成員`
        : `${current.name} 報名人（${names.length} 位）：\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;
    const contents = buildNameListBubble({
      // current.name 是用 canonical seasonName 以 equals 查回來的，格式一定是 YYYY-QN；跟 altText 用同一個來源
      topText: `${formatSeasonTitle(current.name, false)}（${getSeasonMonthRange(current.name)}）`,
      badgeColor: names.length === 0 ? 'gray' : 'lime',
      badgeIcon: names.length === 0 ? FLEX_ICONS.userXWhite : FLEX_ICONS.usersDark,
      title: '本季報名人',
      countLabel: `${names.length} 位`,
      names,
    });
    if (!fitsBubbleSizeLimit(contents)) {
      logger.warn({ count: names.length }, 'Participants list too large for a Flex bubble, falling back to text');
      await replyMessage(replyToken, [{ type: 'text', text }]);
      return;
    }
    await replyMessage(replyToken, [{ type: 'flex', altText: truncateAltText(text), contents }]);
  } catch (err) {
    logger.error({ err }, 'Participants handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
  }
}
