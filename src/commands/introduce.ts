import type { messagingApi } from '@line/bot-sdk';
import * as announcementRepo from '../services/notion/announcement-repository.js';
import { findAdmin } from '../services/notion/users-repository.js';
import { blocksToText } from '../services/notion/blocks-to-text.js';
import { replyMessage } from '../services/line/reply-service.js';
import { logger } from '../utils/logger.js';

export async function handleIntroduce(
  replyToken: string,
  actorUserId: string,
  botId: string,
): Promise<void> {
  try {
    const [announcement, admin] = await Promise.all([
      announcementRepo.findByName('INTRODUCE'),
      findAdmin(),
    ]);

    if (!announcement) {
      await replyMessage(replyToken, [{ type: 'text', text: '找不到自我介紹內容' }], botId);
      return;
    }

    const blocks = await announcementRepo.getBlocks(announcement.pageId);
    const text = blocksToText(blocks);
    if (!text) {
      await replyMessage(replyToken, [{ type: 'text', text: '自我介紹內容為空' }], botId);
      return;
    }

    const substitution: Record<string, messagingApi.SubstitutionObject> = {
      USER: { type: 'mention', mentionee: { type: 'user', userId: actorUserId } },
    };
    if (admin) {
      substitution['MANAGER'] = {
        type: 'mention',
        mentionee: { type: 'user', userId: admin.userId },
      };
    }

    const message: messagingApi.TextMessageV2 = { type: 'textV2', text, substitution };
    await replyMessage(replyToken, [message], botId);
  } catch (err) {
    logger.error({ err }, 'Introduce handler error');
    await replyMessage(replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }], botId);
  }
}
