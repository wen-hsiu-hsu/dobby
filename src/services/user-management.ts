import { logger } from '../utils/logger.js';
import * as usersRepo from './notion/users-repository.js';
import * as peopleRepo from './notion/people-repository.js';
import { getProfile } from './line/profile-service.js';
import { withMutex, isLocked } from './mutex.js';
import type { NotionUser } from '../types/notion-models.js';

type TrackContext = { groupId?: string; multiChatId?: string };

interface TrackOptions {
  knownUser?: NotionUser | null;
  // undefined = not looked up yet; null = looked up but unavailable (don't retry).
  displayName?: string | null;
  countMessage: boolean;
}

/** Never rejects, so callers can fire-and-forget or await it. */
export function trackUser(
  userId: string,
  context: TrackContext,
  knownUser?: NotionUser | null
): Promise<void> {
  return _trackUserAsync(userId, context, { knownUser, countMessage: true }).catch((err) =>
    logger.warn({ err, userId }, 'User tracking failed (non-blocking)')
  );
}

/**
 * Joining isn't a message, so message_counts is left alone. Shares trackUser()'s
 * mutex key, so a join immediately followed by a first message can't create two pages.
 */
export async function trackJoinedMember(
  userId: string,
  context: TrackContext,
  displayName: string | null
): Promise<void> {
  await _trackUserAsync(userId, context, { displayName, countMessage: false });
}

async function resolveNewUserName(userId: string, context: TrackContext, displayName: string | null | undefined): Promise<string> {
  if (displayName !== undefined) return displayName ?? userId;
  // Without a groupId this is the friend-profile lookup, same as member-joined-handler.
  const profile = await getProfile(userId, context.groupId);
  return profile?.displayName ?? userId;
}

/**
 * Never links to an existing same-name person: it could be a different player, and the
 * link would hand the new user that player's season membership and leave rights.
 * Failures don't block the USERS write; the user just stays unlinked (no retry, since
 * they're no longer "new" next time).
 */
async function createPersonForNewUser(userId: string, name: string): Promise<string | null> {
  try {
    const sameName = await peopleRepo.findByName(name);
    if (sameName) {
      logger.warn({ userId, personPageId: sameName.pageId }, 'People list already has this name, skipped auto-link');
      return null;
    }
    return (await peopleRepo.create(name)).pageId;
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to create people record for new user (non-blocking)');
    return null;
  }
}

async function _trackUserAsync(
  userId: string,
  context: TrackContext,
  options: TrackOptions
): Promise<void> {
  const key = `user-track-${userId}`;
  const { knownUser } = options;

  // `knownUser` is a snapshot the caller took (e.g. for an admin check) before this
  // call reaches the mutex — reusing it saves a redundant Notion query, but it's only
  // safe when no other trackUser() call for the same userId is already queued/running:
  // otherwise that other call may write groups/multiChats/message_counts in between,
  // and computing this call's update from the stale snapshot would silently clobber
  // it (two quick messages from the same person, each fire-and-forget). Checked here,
  // synchronously and before withMutex marks this call as pending below, so it only
  // ever reflects an *other*, already in-flight call — never this one.
  // A null snapshot is never trusted: another call (e.g. a memberJoined write) may have
  // created the page and released the lock while the caller's lookup was in flight,
  // and trusting "doesn't exist" would create a duplicate page.
  const trustKnownUser = knownUser != null && !isLocked(key);

  await withMutex(key, async () => {
    const existing = trustKnownUser ? knownUser : await usersRepo.findByUserId(userId, 'track-user');

    if (!existing) {
      const customName = await resolveNewUserName(userId, context, options.displayName);
      const created = await usersRepo.create(userId, customName, options.countMessage ? 1 : 0);
      const updates: Parameters<typeof usersRepo.update>[1] = {};
      if (context.groupId) updates.groups = [context.groupId];
      if (context.multiChatId) updates.multiChats = [context.multiChatId];
      const personPageId = await createPersonForNewUser(userId, customName);
      if (personPageId) updates.registeredPersonPageId = personPageId;
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
    if (options.countMessage) {
      await usersRepo.incrementMessageCount(existing.pageId, existing.messageCount);
    }
  });
}
