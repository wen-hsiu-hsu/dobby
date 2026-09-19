import type { messagingApi } from '@line/bot-sdk';
import { lineClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';

type Message = messagingApi.Message;

export async function pushMessage(
  to: string,
  messages: Message[]
): Promise<void> {
  const messageContents = messages.map((m) =>
    m.type === 'text' ? (m as { type: string; text: string }).text : `[${m.type}]`
  );
  logger.info({ to, messageCount: messages.length, messages: messageContents }, 'LINE push');
  try {
    await lineClient.pushMessage({ to, messages });
    logger.debug({ to, messages: messageContents }, 'LINE push sent');
  } catch (err) {
    logger.error({ err, to, messages: messageContents }, 'Push message failed');
    throw err;
  }
}
