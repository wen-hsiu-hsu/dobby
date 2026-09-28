import { logger } from '../../utils/logger.js';
import type { RegistrationTarget } from '../../types/commands.js';

/** Every way a `+N`/`-N` request can end. See docs/registration.md「決策摘要 log」. */
export type RegistrationOutcome =
  | 'parse-error'
  | 'not-admin'
  | 'target-not-found'
  | 'season-not-found'
  | 'event-not-found'
  | 'paused'
  | 'full'
  | 'no-registration'
  | 'zero-delta'
  | 'added'
  | 'removed';

/** Every way a `假`/`銷假` request can end. See docs/registration.md「決策摘要 log」. */
export type LeaveOutcome =
  | 'parse-error'
  | 'not-admin'
  | 'target-not-found'
  | 'season-not-found'
  | 'not-season-member'
  | 'event-not-found'
  | 'already-absent'
  | 'not-absent'
  | 'leave-recorded'
  | 'leave-cancelled';

/**
 * Logs one `${context} outcome` info line for a finished registration/leave request,
 * plus an optional `${context} outcome detail` debug line.
 *
 * The info line must stay info: /logs' groupStatus scans every line's level, so a warn
 * here would flag ordinary rejections (full, already absent...) as 警告. It must also
 * never carry names or userIds — guest entries are names too ("{Name}的朋友 (2)") — those
 * go in `detail`, which is debug (ADR 0005). The only exception is the pre-existing
 * `targetDisplayName` on the success lines, pending the ADR 0005 PII decision.
 */
export function logOutcome(
  context: string,
  summary: { outcome: RegistrationOutcome | LeaveOutcome } & Record<string, unknown>,
  detail?: Record<string, unknown>
): void {
  logger.info(summary, `${context} outcome`);
  if (detail) logger.debug(detail, `${context} outcome detail`);
}

/** What the command asked for, before lookup — for when resolveTarget found nobody. */
export function describeTargetRequest(target: RegistrationTarget): 'self' | 'mention' | 'name' {
  if (target.isSelf) return 'self';
  return target.targetUserId ? 'mention' : 'name';
}
