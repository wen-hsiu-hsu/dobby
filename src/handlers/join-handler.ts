import type { JoinEvent } from '@line/bot-sdk';
import { replyMessage } from '../services/line/reply-service.js';
import { buildJoinWelcome } from '../services/welcome-message.js';
import { logger } from '../utils/logger.js';

export async function handleJoin(event: JoinEvent): Promise<void> {
  try {
    const message = await buildJoinWelcome();
    await replyMessage(event.replyToken, [message]);
  } catch (err) {
    logger.error({ err }, 'Join handler error');
  }
}
