import type { WebhookEvent } from '@line/bot-sdk';
import { handleMessage } from './message-handler.js';
import { handleJoin } from './join-handler.js';
import { handleMemberJoined } from './member-joined-handler.js';
import { logger } from '../utils/logger.js';
import { runWithContext } from '../utils/request-context.js';

export async function processEvents(events: WebhookEvent[], botId: string): Promise<void> {
  for (const event of events) {
    const quoteToken = event.type === 'message' && event.message.type === 'text' ? event.message.quoteToken : undefined;
    await runWithContext(async () => {
    logger.debug({ type: event.type, source: event.source, message: 'message' in event ? event.message : undefined }, 'Processing event');
    try {
      switch (event.type) {
        case 'message':
          await handleMessage(event, botId);
          break;
        case 'join':
          await handleJoin(event, botId);
          break;
        case 'memberJoined':
          await handleMemberJoined(event, botId);
          break;
        default:
          logger.debug({ type: event.type }, 'Unhandled event type');
      }
    } catch (err) {
      logger.error({ err, eventType: event.type }, 'Error handling event');
    }
    }, quoteToken); // runWithContext
  }
}
