import { logger } from '../utils/logger.js';

const locks = new Map<string, boolean>();
const TIMEOUT_MS = 10_000;

export async function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (locks.get(key)) {
    throw new Error(`Mutex busy: ${key}`);
  }
  locks.set(key, true);
  const timer = setTimeout(() => {
    locks.delete(key);
    logger.warn({ key }, 'Mutex auto-released due to timeout');
  }, TIMEOUT_MS);
  try {
    return await fn();
  } finally {
    clearTimeout(timer);
    locks.delete(key);
  }
}

export function isLocked(key: string): boolean {
  return locks.get(key) === true;
}
