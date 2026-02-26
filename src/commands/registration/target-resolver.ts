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
    // Look up actor's registered person
    const user = await usersRepo.findByUserId(actorUserId);
    if (!user) return null;
    // user has a registeredName relation - but we store it differently
    // For now return the user's custom name / display name
    const person = await peopleRepo.findByName(user.customName);
    if (!person) return null;
    return { personPageId: person.pageId, displayName: person.name };
  }

  if (target.targetUserId) {
    const user = await usersRepo.findByUserId(target.targetUserId);
    if (user) {
      const person = await peopleRepo.findByName(user.customName);
      if (person) return { personPageId: person.pageId, displayName: person.name };
    }
    // Try by name if userId lookup failed
  }

  if (target.targetName) {
    const person = await peopleRepo.findByName(target.targetName);
    if (!person) return null;
    return { personPageId: person.pageId, displayName: person.name };
  }

  return null;
}
