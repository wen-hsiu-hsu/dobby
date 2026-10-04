import * as peopleRepo from '../../services/notion/people-repository.js';
import * as usersRepo from '../../services/notion/users-repository.js';
import type { RegistrationTarget } from '../../types/commands.js';
import type { NotionUser } from '../../types/notion-models.js';

export interface ResolvedTarget {
  personPageId: string;
  displayName: string;
  /**
   * How the target was found, for the outcome log: the actor themself, a mention's USERS
   * record, a mention whose userId isn't in USERS so its text was looked up in People
   * instead, or a typed/PC-version `@Name` looked up in People.
   */
  resolvedVia: 'self' | 'mention' | 'mention-name-fallback' | 'name';
}

/**
 * `actorUser` is the snapshot message-handler already fetched for the actor; passing it
 * skips a duplicate USERS query. Only a non-null snapshot is trusted: in a group chat a
 * brand-new user's null snapshot is stale by now (message-handler awaited trackUser to
 * create the page), so null/undefined always falls back to a fresh lookup. A non-null
 * snapshot is safe because trackUser never changes registeredPersonPageId for an
 * existing user. It may also be a just-created page not yet linked to People (trackUser
 * links it ~1s after creating it); that's harmless too, since the auto-created People
 * page is named after customName and isn't in any season, so the result is the same.
 * See docs/adr/0009-actor-users-snapshot-non-null-only.md.
 *
 * USERS and People lookups here go through the read cache (ADR 0020). trackUser's link
 * write goes through usersRepo.update, which replaces the cached record with the page the
 * PATCH returned, so a just-linked user isn't stuck with the unlinked snapshot until the
 * next refresh.
 */
export async function resolveTarget(
  target: RegistrationTarget,
  actorUserId: string,
  actorUser?: NotionUser | null
): Promise<ResolvedTarget | null> {
  if (target.isSelf) {
    // Must be a known bot user; People DB membership is optional (non-season members can still register as guests)
    const user = actorUser ?? await usersRepo.findByUserId(actorUserId);
    if (!user) return null;
    const person = user.registeredPersonPageId
      ? await peopleRepo.findNameByPageId(user.registeredPersonPageId)
      : null;
    return { personPageId: person?.pageId ?? '', displayName: person?.name ?? user.customName, resolvedVia: 'self' };
  }

  if (target.targetUserId) {
    const user = await usersRepo.findByUserId(target.targetUserId, 'mention-target');
    if (user) {
      const person = user.registeredPersonPageId
        ? await peopleRepo.findNameByPageId(user.registeredPersonPageId)
        : null;
      return { personPageId: person?.pageId ?? '', displayName: person?.name ?? user.customName, resolvedVia: 'mention' };
    }
    // Fall through to name lookup if user not in Users DB
  }

  if (target.targetName) {
    const person = await peopleRepo.findByName(target.targetName);
    if (!person) return null;
    return {
      personPageId: person.pageId,
      displayName: person.name,
      resolvedVia: target.targetUserId ? 'mention-name-fallback' : 'name',
    };
  }

  return null;
}
