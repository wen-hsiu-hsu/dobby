import type { messagingApi } from '@line/bot-sdk';
import { lineClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';
import { getQuoteToken } from '../../utils/request-context.js';

type Message = messagingApi.Message;

// Attach the inbound message's quoteToken to outgoing text messages, so users can see
// which of their messages a reply is responding to. Skips messages that already set one.
function withQuoteToken(messages: Message[]): Message[] {
  const quoteToken = getQuoteToken();
  if (!quoteToken) return messages;
  return messages.map((m) => {
    if ((m.type === 'text' || m.type === 'textV2') && !m.quoteToken) {
      return { ...m, quoteToken };
    }
    return m;
  });
}

export async function replyMessage(
  replyToken: string,
  messages: Message[]
): Promise<void> {
  const messagesToSend = withQuoteToken(messages);
  const messageContents = messages.map((m) =>
    m.type === 'text' ? (m as { type: string; text: string }).text : `[${m.type}]`
  );
  logger.info({ replyToken: replyToken.slice(0, 8) + '…', messageCount: messages.length, messages: messageContents }, 'LINE reply');
  try {
    await lineClient.replyMessage({ replyToken, messages: messagesToSend });
    logger.debug({ messages: messageContents }, 'LINE reply sent');
  } catch (err) {
    logger.warn({ err }, 'Reply failed, no fallback available (no groupId for push)');
  }
}
