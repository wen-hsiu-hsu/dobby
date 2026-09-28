import { logger } from '../utils/logger.js';

const queues = new Map<string, Promise<unknown>>();
const pending = new Map<string, number>();
// Tasks whose fn() has not truly settled yet (queued or running), counted per key.
// Unlike `pending`, this only drops when `tail` completes, so it still counts a task
// whose caller already timed out — which is exactly when `queuedAhead` matters most.
// Observability only: nothing but the log lines reads it.
const inFlight = new Map<string, number>();
const TIMEOUT_MS = 10_000;

// Keys that are a bare ISO date (`withFreshCalendarEvent` locks by event date) carry
// no user identity, so their summary can sit at info. Every other key — notably
// `user-track-${userId}` — falls back to debug, so an unknown key format never puts a
// userId into info-level logs (see ADR 0005). Allow-listing the safe format instead of
// deny-listing userId keys keeps callers unchanged and fails safe for new keys.
const INFO_SUMMARY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Thrown when the caller stops waiting. `fn()` may still be queued or running and can
 * succeed afterwards, so callers must not report this as a plain failure.
 */
export class MutexTimeoutError extends Error {
  constructor(key: string) {
    super(`Mutex timeout: ${key}`);
    this.name = 'MutexTimeoutError';
  }
}

/**
 * Runs `fn` under a per-key FIFO queue: concurrent callers for the same key wait
 * their turn instead of being rejected, so a busy key never forces the caller to retry.
 *
 * The queue chain and the caller's wait are deliberately decoupled: the chain only
 * ever advances once `fn()` truly settles (`settle`), so it is never interrupted by
 * a timeout. What the caller awaits is `Promise.race([settle, timeout])` — if that
 * times out, the caller gets an error back, but `fn()` keeps running in the
 * background and the next queued task still waits for it to actually finish before
 * starting, preventing it from reading stale data and clobbering the eventual write.
 *
 * The timeout is armed when `withMutex` is called, so it covers time spent waiting in
 * the queue as well as `fn()` itself.
 *
 * Each task writes one `Mutex task finished` summary when `fn()` truly settles (see
 * `logSummary`), not when the caller stops waiting.
 */
export async function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  pending.set(key, (pending.get(key) ?? 0) + 1);

  const calledAt = Date.now();
  const queuedAhead = inFlight.get(key) ?? 0;
  inFlight.set(key, queuedAhead + 1);
  let startedAt: number | undefined;
  let fnFailed = false;
  const timeoutState = { callerTimedOut: false };

  const prev = queues.get(key) ?? Promise.resolve();

  // The real execution: waits only for the previous task to truly settle, regardless
  // of whether that previous caller already gave up on a timeout.
  const settle: Promise<T> = prev.catch(() => {}).then(() => {
    startedAt = Date.now();
    return fn();
  });

  // What the queue chain waits on: never rejects, advances once settle completes
  // (success or failure) so the next queued task can start.
  const tail = settle.then(
    () => undefined,
    () => {
      fnFailed = true;
      return undefined;
    }
  );
  queues.set(key, tail);

  // Cleanup of this queues entry must be tied to tail (true completion) only, never
  // to the pending count — pending can hit zero early because a caller timed out. If
  // we cleared the entry then, a brand-new call would find queues.get(key) undefined
  // and skip past the still-running old settle, reintroducing the race we're fixing,
  // just deferred to a later trigger.
  // The summary hangs off tail for the same reason: after a caller timeout, fn() is
  // still running, so logging from the caller's `finally` would under-report heldMs.
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
    const remaining = (inFlight.get(key) ?? 1) - 1;
    if (remaining <= 0) {
      inFlight.delete(key);
    } else {
      inFlight.set(key, remaining);
    }
    const finishedAt = Date.now();
    const fnStartedAt = startedAt ?? finishedAt;
    logSummary(key, {
      queuedAhead,
      waitMs: fnStartedAt - calledAt,
      heldMs: finishedAt - fnStartedAt,
      callerTimedOut: timeoutState.callerTimedOut,
      fnFailed,
    });
  });

  try {
    return await raceAgainstTimeout(key, settle, queuedAhead, timeoutState);
  } finally {
    const remaining = (pending.get(key) ?? 1) - 1;
    if (remaining <= 0) {
      pending.delete(key);
    } else {
      pending.set(key, remaining);
    }
  }
}

interface MutexSummary {
  /** Tasks for this key still queued or running (fn() not yet settled) when this call arrived. */
  queuedAhead: number;
  /** From the withMutex call until fn() started, i.e. time spent waiting for the tasks ahead. */
  waitMs: number;
  /** From fn() starting until it truly settled — the real lock hold time, even after a caller timeout. */
  heldMs: number;
  callerTimedOut: boolean;
  /** fn() rejected. After a caller timeout this is the only trace of a background failure. */
  fnFailed: boolean;
}

function logSummary(key: string, summary: MutexSummary): void {
  // Runs in a fire-and-forget `.then`: a throwing logger must not turn into an
  // unhandled rejection, and this line is observation only.
  try {
    const level = INFO_SUMMARY_KEY.test(key) ? 'info' : 'debug';
    logger[level]({ key, ...summary }, 'Mutex task finished');
  } catch {
    // ignore
  }
}

function raceAgainstTimeout<T>(
  key: string,
  settle: Promise<T>,
  queuedAhead: number,
  timeoutState: { callerTimedOut: boolean }
): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timeoutState.callerTimedOut = true;
      logger.warn(
        { key, queuedAhead },
        "Mutex task timed out from caller's perspective; task keeps running in the background and the next queued task will still wait for it"
      );
      reject(new MutexTimeoutError(key));
    }, TIMEOUT_MS);
  });
  return Promise.race([settle, timeout]).finally(() => clearTimeout(timer));
}

export function isLocked(key: string): boolean {
  return (pending.get(key) ?? 0) > 0;
}
