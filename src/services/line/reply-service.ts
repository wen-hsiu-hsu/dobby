import type { messagingApi } from '@line/bot-sdk';
import { getClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';

type Message = messagingApi.Message;

export async function replyMessage(
  replyToken: string,
  messages: Message[],
  botId: string
): Promise<void> {
  const client = getClient(botId);
  logger.info({ botId, replyToken: replyToken.slice(0, 8) + '…', messageCount: messages.length }, 'LINE reply');
  try {
    await client.replyMessage({ replyToken, messages });
    logger.debug({ botId }, 'LINE reply sent');
  } catch (err) {
    logger.warn({ err, botId }, 'Reply failed, no fallback available (no groupId for push)');
  }
}
