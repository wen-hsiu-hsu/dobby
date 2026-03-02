import type { WebhookEvent } from '@line/bot-sdk';
import { handleMessage } from './message-handler.js';
import { handleJoin } from './join-handler.js';
import { handleMemberJoined } from './member-joined-handler.js';
import { logger } from '../utils/logger.js';
import { runWithContext } from '../utils/request-context.js';

export async function processEvents(events: WebhookEvent[], botId: string): Promise<void> {
  for (const event of events) {
    await runWithContext(async () => {
    logger.debug({ type: event.type, source: event.source }, 'Processing event');
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
    }); // runWithContext
  }
}
