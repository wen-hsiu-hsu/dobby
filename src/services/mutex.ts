import { logger } from '../utils/logger.js';

const queues = new Map<string, Promise<unknown>>();
const pending = new Map<string, number>();
const TIMEOUT_MS = 10_000;

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
 */
export async function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  pending.set(key, (pending.get(key) ?? 0) + 1);

  const prev = queues.get(key) ?? Promise.resolve();

  // The real execution: waits only for the previous task to truly settle, regardless
  // of whether that previous caller already gave up on a timeout.
  const settle: Promise<T> = prev.catch(() => {}).then(() => fn());

  // What the queue chain waits on: never rejects, advances once settle completes
  // (success or failure) so the next queued task can start.
  const tail = settle.then(
    () => undefined,
    () => undefined
  );
  queues.set(key, tail);

  // Cleanup of this queues entry must be tied to tail (true completion) only, never
  // to the pending count — pending can hit zero early because a caller timed out. If
  // we cleared the entry then, a brand-new call would find queues.get(key) undefined
  // and skip past the still-running old settle, reintroducing the race we're fixing,
  // just deferred to a later trigger.
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });

  try {
    return await raceAgainstTimeout(key, settle);
  } finally {
    const remaining = (pending.get(key) ?? 1) - 1;
    if (remaining <= 0) {
      pending.delete(key);
    } else {
      pending.set(key, remaining);
    }
  }
}

function raceAgainstTimeout<T>(key: string, settle: Promise<T>): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      logger.warn(
        { key },
        "Mutex task timed out from caller's perspective; task keeps running in the background and the next queued task will still wait for it"
      );
      reject(new Error(`Mutex timeout: ${key}`));
    }, TIMEOUT_MS);
  });
  return Promise.race([settle, timeout]).finally(() => clearTimeout(timer));
}

export function isLocked(key: string): boolean {
  return (pending.get(key) ?? 0) > 0;
}
