import { logger } from '../utils/logger.js';

const queues = new Map<string, Promise<unknown>>();
const pending = new Map<string, number>();
const TIMEOUT_MS = 10_000;

/**
 * Runs `fn` under a per-key FIFO queue: concurrent callers for the same key wait
 * their turn instead of being rejected, so a busy key never forces the caller to retry.
 */
export async function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  pending.set(key, (pending.get(key) ?? 0) + 1);

  const prev = queues.get(key) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(() => runWithTimeout(key, fn));
  const tail = run.catch(() => {});
  queues.set(key, tail);

  try {
    return await run;
  } finally {
    const remaining = (pending.get(key) ?? 1) - 1;
    if (remaining <= 0) {
      pending.delete(key);
      if (queues.get(key) === tail) queues.delete(key);
    } else {
      pending.set(key, remaining);
    }
  }
}

async function runWithTimeout<T>(key: string, fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      logger.warn({ key }, 'Mutex task timed out, releasing for next in queue');
      reject(new Error(`Mutex timeout: ${key}`));
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export function isLocked(key: string): boolean {
  return (pending.get(key) ?? 0) > 0;
}
