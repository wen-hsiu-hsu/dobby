import type { MessageEvent } from '@line/bot-sdk';
import { parseCommand, isCommand } from '../commands/command-parser.js';
import { routeCommand } from '../commands/command-router.js';
import { findReply } from '../services/auto-reply.js';
import { replyMessage } from '../services/line/reply-service.js';
import { findByUserId } from '../services/notion/users-repository.js';
import { trackUser } from '../services/user-management.js';
import { logger } from '../utils/logger.js';

export async function handleMessage(event: MessageEvent): Promise<void> {
  if (event.message.type !== 'text') return;

  const text = event.message.text;
  const userId = event.source.userId;
  if (!userId) return;

  // Determine context for user tracking
  const groupId = event.source.type === 'group' ? event.source.groupId : undefined;
  const multiChatId = event.source.type === 'room' ? event.source.roomId : undefined;

  // Lazy-load admin status from USERS DB (result reused below for tracking, no duplicate query)
  let notionUser;
  try {
    notionUser = await findByUserId(userId);
  } catch (err) {
    logger.error({ err }, 'Message handler error');
    await replyMessage(event.replyToken, [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
    return;
  }
  const isAdmin = notionUser?.isAdmin ?? false;
  logger.debug({ userId, text, isAdmin, sourceType: event.source.type }, 'handleMessage');

  // Fire-and-forget user tracking
  if (event.source.type === 'group' || event.source.type === 'room') {
    trackUser(userId, { groupId, multiChatId }, notionUser);
  }

  if (isCommand(text)) {
    const command = parseCommand(text);
    if (!command) {
      logger.debug({ text }, 'Message looks like command but failed to parse');
      return;
    }
    logger.debug({ command, isAdmin }, 'Routing command');
    await routeCommand(command, event as any, isAdmin);
    return;
  }

  // Auto-reply (skip for admin)
  if (isAdmin) {
    logger.debug({ userId, text }, 'Skipping auto-reply for admin');
    return;
  }

  const reply = findReply(text);
  logger.debug({ text, matched: reply !== null, reply }, 'Auto-reply lookup');
  if (reply) {
    await replyMessage(event.replyToken, [{ type: 'text', text: reply }]);
  }
}
