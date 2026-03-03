import * as peopleRepo from '../../services/notion/people-repository.js';
import * as usersRepo from '../../services/notion/users-repository.js';
import type { RegistrationTarget } from '../../types/commands.js';

export interface ResolvedTarget {
  personPageId: string;
  displayName: string;
}

export async function resolveTarget(
  target: RegistrationTarget,
  actorUserId: string
): Promise<ResolvedTarget | null> {
  if (target.isSelf) {
    // Must be a known bot user; People DB membership is optional (non-season members can still register as guests)
    const user = await usersRepo.findByUserId(actorUserId);
    if (!user) return null;
    const person = user.registeredPersonPageId
      ? (await peopleRepo.findByPageIds([user.registeredPersonPageId]))[0] ?? null
      : null;
    return { personPageId: person?.pageId ?? '', displayName: person?.name ?? user.customName };
  }

  if (target.targetUserId) {
    const user = await usersRepo.findByUserId(target.targetUserId);
    if (user) {
      const person = user.registeredPersonPageId
        ? (await peopleRepo.findByPageIds([user.registeredPersonPageId]))[0] ?? null
        : null;
      return { personPageId: person?.pageId ?? '', displayName: person?.name ?? user.customName };
    }
    // Fall through to name lookup if user not in Users DB
  }

  if (target.targetName) {
    const person = await peopleRepo.findByName(target.targetName);
    if (!person) return null;
    return { personPageId: person.pageId, displayName: person.name };
  }

  return null;
}
