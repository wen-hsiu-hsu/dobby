import type { messagingApi } from '@line/bot-sdk';
import { randomBytes } from 'node:crypto';
import { lineClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';
import { getQuoteToken } from '../../utils/request-context.js';

type Message = messagingApi.Message;

const METHOD = 'POST';
const PATH = '/v2/bot/message/reply';

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
  const messageContents = messages.map((m) => {
    if (m.type === 'text') return (m as { type: string; text: string }).text;
    // altText 是精簡文字版，比 `[flex]` 本身更有用：/logs 的卡片預覽、事件時間軸、
    // LINE 推播通知看到的都是同一段文字，不用另外開 Flex JSON 才知道這次回了什麼。
    if (m.type === 'flex') return `[flex] ${(m as { type: string; altText: string }).altText}`;
    return `[${m.type}]`;
  });
  const sendId = randomBytes(3).toString('hex');
  logger.info({ method: METHOD, path: PATH, sendId, messageCount: messages.length }, 'LINE reply');
  logger.debug(
    { method: METHOD, path: PATH, sendId, replyToken: replyToken.slice(0, 8) + '…', messages: messageContents },
    'LINE reply payload'
  );
  try {
    await lineClient.replyMessage({ replyToken, messages: messagesToSend });
    logger.info({ method: METHOD, path: PATH, sendId }, 'LINE reply sent');
  } catch (err) {
    // No push fallback by design (LINE free-plan push quota; see CLAUDE.md) —
    // a failed reply (e.g. replyToken already used or expired) is just logged.
    logger.warn({ err, method: METHOD, path: PATH, sendId }, 'Reply failed');
    logger.debug({ method: METHOD, path: PATH, sendId, messages: messageContents }, 'Reply failed payload');
  }
}
