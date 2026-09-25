import { logger } from '../utils/logger.js';
import * as usersRepo from './notion/users-repository.js';
import { withMutex, isLocked } from './mutex.js';
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
  const key = `user-track-${userId}`;

  // `knownUser` is a snapshot the caller took (e.g. for an admin check) before this
  // call reaches the mutex — reusing it saves a redundant Notion query, but it's only
  // safe when no other trackUser() call for the same userId is already queued/running:
  // otherwise that other call may write groups/multiChats/message_counts in between,
  // and computing this call's update from the stale snapshot would silently clobber
  // it (two quick messages from the same person, each fire-and-forget). Checked here,
  // synchronously and before withMutex marks this call as pending below, so it only
  // ever reflects an *other*, already in-flight call — never this one.
  const trustKnownUser = knownUser !== undefined && !isLocked(key);

  await withMutex(key, async () => {
    const existing = trustKnownUser ? knownUser : await usersRepo.findByUserId(userId);

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

    if (Object.keys(updates).length > 0) {
      await usersRepo.update(existing.pageId, updates);
    }
    await usersRepo.incrementMessageCount(existing.pageId, existing.messageCount);
  });
}
