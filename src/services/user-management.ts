import { logger } from '../utils/logger.js';
import * as usersRepo from './notion/users-repository.js';
import type { NotionUser } from '../types/notion-models.js';

export function trackUser(
  userId: string,
  context: { groupId?: string; multiChatId?: string },
  knownUser?: NotionUser | null
): void {
  // Fire-and-forget
  _trackUserAsync(userId, context, knownUser).catch((err) =>
    logger.warn({ err, userId }, 'User tracking failed (non-blocking)')
  );
}

async function _trackUserAsync(
  userId: string,
  context: { groupId?: string; multiChatId?: string },
  knownUser?: NotionUser | null
): Promise<void> {
  // Caller may already have looked this up (e.g. for an admin check) — reuse it
  // instead of issuing a second identical Notion query for the same message.
  const existing = knownUser !== undefined ? knownUser : await usersRepo.findByUserId(userId);

  if (!existing) {
    const created = await usersRepo.create(userId, userId);
    const updates: Parameters<typeof usersRepo.update>[1] = {};
    if (context.groupId) updates.groups = [context.groupId];
    if (context.multiChatId) updates.multiChats = [context.multiChatId];
    if (Object.keys(updates).length > 0) {
      await usersRepo.update(created.pageId, updates);
    }
    return;
  }

  // Merge groups/multi-chats
  const updates: Parameters<typeof usersRepo.update>[1] = {};

  if (context.groupId && !existing.groups.includes(context.groupId)) {
    updates.groups = [...existing.groups, context.groupId];
  }
  if (context.multiChatId && !existing.multiChats.includes(context.multiChatId)) {
    updates.multiChats = [...existing.multiChats, context.multiChatId];
  }

  await usersRepo.update(existing.pageId, updates);
  await usersRepo.incrementMessageCount(existing.pageId, existing.messageCount);
}
