import type { MessageEvent } from '@line/bot-sdk';
import { parseCommand } from '../commands/command-parser.js';
import { routeCommand } from '../commands/command-router.js';
import { findReply } from '../services/auto-reply.js';
import { replyMessage } from '../services/line/reply-service.js';
import { findByUserId } from '../services/notion/users-repository.js';
import { trackUser } from '../services/user-management.js';
import { logger } from '../utils/logger.js';

export async function handleMessage(event: MessageEvent): Promise<void> {
  // Stickers/images/etc. are frequent in group chats and never acted on, so
  // this stays at debug; it only exists to tell this return apart from the
  // no-userId one below.
  if (event.message.type !== 'text') {
    logger.debug({ messageType: event.message.type }, 'Message ignored: not text');
    return;
  }

  const text = event.message.text;
  const userId = event.source.userId;
  if (!userId) {
    // The sender sees the bot ignore them, so this must be visible at info.
    // Deliberately info, not warn: /logs would otherwise flag every such event.
    logger.info({ sourceType: event.source.type }, 'Message ignored: no userId');
    return;
  }

  // Info-level summary written before any branch (including the USERS lookup
  // failure below), so /logs can tell commands from chat without the
  // debug-only 'Routing command'/'Auto-reply lookup' lines. Must never carry
  // the message text or userId (ADR 0005). routes/logs.ts matches this
  // message string literally.
  // null means "not a command" (chat); unrecognised @Dobby text is still a
  // command, parsed as UNKNOWN.
  const command = parseCommand(text);
  logger.info(
    command ? { isCommand: true, commandType: command.type } : { isCommand: false },
    'Message classified',
  );

  // Determine context for user tracking
  const groupId = event.source.type === 'group' ? event.source.groupId : undefined;
  const multiChatId = event.source.type === 'room' ? event.source.roomId : undefined;

  // Lazy-load admin status from USERS DB (result reused below: tracking takes its pageId,
  // registration/leave reuse it as the actor's record)
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

  if (event.source.type === 'group' || event.source.type === 'room') {
    const tracking = trackUser(userId, { groupId, multiChatId }, notionUser);
    // Commands like +1 need the USERS record that tracking creates for a brand-new
    // user; left fire-and-forget, their first command always loses the race.
    if (!notionUser && command) await tracking;
  }

  if (command) {
    logger.debug({ command, isAdmin }, 'Routing command');
    await routeCommand(command, event as any, isAdmin, notionUser);
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
