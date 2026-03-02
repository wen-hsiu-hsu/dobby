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
  const messageContents = messages.map((m) =>
    m.type === 'text' ? (m as { type: string; text: string }).text : `[${m.type}]`
  );
  logger.info({ botId, to, messageCount: messages.length, messages: messageContents }, 'LINE push');
  try {
    await client.pushMessage({ to, messages });
    logger.debug({ botId, to, messages: messageContents }, 'LINE push sent');
  } catch (err) {
    logger.error({ err, to, botId, messages: messageContents }, 'Push message failed');
    throw err;
  }
}
