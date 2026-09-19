import type { messagingApi } from '@line/bot-sdk';
import { randomBytes } from 'node:crypto';
import { lineClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';

type Message = messagingApi.Message;

// Matches the actual REST endpoint @line/bot-sdk's MessagingApiClient calls
// internally (node_modules/@line/bot-sdk/dist/messaging-api/api/messagingApiClient.js) —
// a fixed path with no id in it, safe to log at info level.
const METHOD = 'POST';
const PATH = '/v2/bot/message/push';

export async function pushMessage(
  to: string,
  messages: Message[]
): Promise<void> {
  const messageContents = messages.map((m) =>
    m.type === 'text' ? (m as { type: string; text: string }).text : `[${m.type}]`
  );
  // sendId correlates this call's start/sent/failure/payload log lines so
  // log-grouping.ts can pair them without relying on `to`/`messages` content
  // (which is now debug-only — see TODO.md's "用 sendId 取代內容比對" note).
  const sendId = randomBytes(3).toString('hex');
  logger.info({ method: METHOD, path: PATH, sendId, messageCount: messages.length }, 'LINE push');
  logger.debug({ method: METHOD, path: PATH, sendId, to, messages: messageContents }, 'LINE push payload');
  try {
    await lineClient.pushMessage({ to, messages });
    logger.info({ method: METHOD, path: PATH, sendId }, 'LINE push sent');
  } catch (err) {
    logger.error({ err, method: METHOD, path: PATH, sendId }, 'Push message failed');
    logger.debug({ method: METHOD, path: PATH, sendId, to, messages: messageContents }, 'Push message failed payload');
    throw err;
  }
}
