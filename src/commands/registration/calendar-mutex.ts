import { withMutex } from '../../services/mutex.js';

export function withCalendarMutex<T>(pageId: string, fn: () => Promise<T>): Promise<T> {
  return withMutex(pageId, fn);
}
