import type { MessageEvent } from '@line/bot-sdk';
import { parseCommand, isCommand } from '../commands/command-parser.js';
import { routeCommand } from '../commands/command-router.js';
import { findReply } from '../services/auto-reply.js';
import { replyMessage } from '../services/line/reply-service.js';
import { findByUserId } from '../services/notion/users-repository.js';
import { trackUser } from '../services/user-management.js';
import { logger } from '../utils/logger.js';

export async function handleMessage(event: MessageEvent, botId: string): Promise<void> {
  if (event.message.type !== 'text') return;

  const text = event.message.text;
  const userId = event.source.userId;
  if (!userId) return;

  // Determine context for user tracking
  const groupId = event.source.type === 'group' ? event.source.groupId : undefined;
  const multiChatId = event.source.type === 'room' ? event.source.roomId : undefined;

  // Fire-and-forget user tracking
  if (event.source.type === 'group' || event.source.type === 'room') {
    trackUser(userId, { groupId, multiChatId });
  }

  // Lazy-load admin status from USERS DB
  const notionUser = await findByUserId(userId);
  const isAdmin = notionUser?.isAdmin ?? false;

  if (isCommand(text)) {
    const command = parseCommand(text);
    if (!command) return;

    await routeCommand(command, event as any, botId, isAdmin);
    return;
  }

  // Auto-reply (skip for admin)
  if (isAdmin) return;

  const reply = findReply(text);
  if (reply) {
    await replyMessage(event.replyToken, [{ type: 'text', text: reply }], botId);
  }
}
