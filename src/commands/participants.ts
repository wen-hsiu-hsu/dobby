import * as seasonRepo from '../services/notion/season-repository.js';
import * as peopleRepo from '../services/notion/people-repository.js';
import { replyMessage } from '../services/line/reply-service.js';
import { logger } from '../utils/logger.js';
import { getCurrentSeasonName } from '../utils/date-utils.js';

export async function handleParticipants(replyToken: string, botId: string): Promise<void> {
  try {
    const seasonName = getCurrentSeasonName();
    const current = await seasonRepo.findByName(seasonName);
    if (!current) {
      await replyMessage(replyToken, [{ type: 'text', text: `找不到 ${seasonName} 季租資料` }], botId);
      return;
    }
    if (current.members.length === 0) {
      await replyMessage(replyToken, [{ type: 'text', text: `${current.name} 目前沒有報名成員` }], botId);
      return;
    }
    const people = await peopleRepo.findByPageIds(current.members);
    const list = people.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    await replyMessage(replyToken, [{ type: 'text', text: `${current.name} 報名人（${people.length} 位）：\n${list}` }], botId);
  } catch (err) {
    logger.error({ err }, 'Participants handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }], botId);
  }
}
