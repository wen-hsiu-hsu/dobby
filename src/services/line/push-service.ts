import type { messagingApi } from '@line/bot-sdk';
import { getClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';

type Message = messagingApi.Message;

export async function pushMessage(
  to: string,
  messages: Message[],
  botId: string
): Promise<void> {
  const client = getClient(botId);
  logger.info({ botId, to, messageCount: messages.length }, 'LINE push');
  try {
    await client.pushMessage({ to, messages });
    logger.debug({ botId, to }, 'LINE push sent');
  } catch (err) {
    logger.error({ err, to, botId }, 'Push message failed');
    throw err;
  }
}
